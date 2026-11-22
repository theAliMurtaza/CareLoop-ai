import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type pg from "pg";
import type { Config } from "./config.js";
import {
  lookup,
  passwordHash,
  passwordMatches,
  seal,
  unseal,
} from "./crypto.js";
import { rows, transaction } from "./db/index.js";
import { audit, HttpError } from "./audit.js";
import type { Actor, Profile } from "./types.js";
interface UserRow extends pg.QueryResultRow {
  id: string;
  role: Actor["role"];
  clinic_id: string | null;
  password_hash: string;
  active: boolean;
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const toActor = (u: UserRow): Actor => ({
  id: u.id,
  role: u.role,
  clinicId: u.clinic_id,
});
export function authMiddleware(pool: pg.Pool, config: Config): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new Error("missing");
      const { payload } = await jwtVerify(
        token,
        Buffer.from(config.JWT_ACCESS_SECRET, "hex"),
        { algorithms: ["HS256"], issuer: "careloop", audience: "careloop-web" },
      );
      if (typeof payload.sub !== "string") throw new Error("missing");
      const user = (
        await rows<UserRow>(
          pool,
          "SELECT id,role,clinic_id,active,password_hash FROM users WHERE id=$1",
          [payload.sub],
        )
      )[0];
      if (!user?.active) throw new Error("inactive");
      req.actor = toActor(user);
      next();
    } catch {
      await audit(pool, null, null, "auth.denied", null, "denied");
      next(new HttpError(401, "UNAUTHORIZED", "Please sign in again."));
    }
  };
}
export function authRouter(pool: pg.Pool, config: Config): Router {
  const router = Router();
  const guard = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const cookie = {
    httpOnly: true,
    secure: config.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: 7 * 86400_000,
  };
  async function session(
    user: UserRow,
    res: Response,
    family: string = randomUUID(),
    db: pg.Pool | pg.PoolClient = pool,
  ) {
    const actor = toActor(user);
    const refresh = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO refresh_tokens(user_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
      [user.id, family, digest(refresh)],
    );
    const accessToken = await new SignJWT({ role: actor.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer("careloop")
      .setAudience("careloop-web")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(Buffer.from(config.JWT_ACCESS_SECRET, "hex"));
    res.cookie("careloop_refresh", refresh, cookie);
    return { accessToken, user: actor };
  }
  const login = z
    .object({ email: z.email().max(200), password: z.string().min(8).max(128) })
    .strict();
  router.post("/login", guard, async (req, res) => {
    const body = login.parse(req.body);
    const user = (
      await rows<UserRow>(pool, "SELECT * FROM users WHERE email_hash=$1", [
        lookup(body.email, config.EMAIL_LOOKUP_KEY),
      ])
    )[0];
    if (
      !user?.active ||
      !(await passwordMatches(body.password, user.password_hash))
    ) {
      await audit(pool, null, null, "auth.login", null, "denied");
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }
    await audit(pool, toActor(user), user.id, "auth.login", user.id);
    res.json(await session(user, res));
  });
  router.post("/register", guard, async (req, res) => {
    const body = login
      .extend({
        displayName: z.string().trim().min(1).max(80),
        synthetic: z.literal(true),
      })
      .parse(req.body);
    if (!/@(?:example|careloop)\.test$/i.test(body.email))
      throw new HttpError(
        400,
        "SYNTHETIC_ONLY",
        "Use a fictional @example.test email for this demonstration.",
      );
    const user = await transaction(pool, async (db) => {
      const id = randomUUID();
      const u = (
        await rows<UserRow>(
          db,
          "INSERT INTO users(id,email_hash,email_enc,password_hash,clinic_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            id,
            lookup(body.email, config.EMAIL_LOOKUP_KEY),
            seal(body.email, config.FIELD_ENCRYPTION_KEY, `email:${id}`),
            await passwordHash(body.password),
            config.DEFAULT_CLINIC_ID,
          ],
        )
      )[0]!;
      const profile: Profile = {
        displayName: body.displayName,
        age: null,
        sex: "unspecified",
        locale: "en",
        timezone: "Asia/Karachi",
      };
      await db.query(
        "INSERT INTO profiles(user_id,payload_enc) VALUES($1,$2)",
        [id, seal(profile, config.FIELD_ENCRYPTION_KEY, `profile:${id}`)],
      );
      await audit(db, toActor(u), id, "auth.register", id);
      return u;
    });
    res.status(201).json(await session(user, res));
  });
  router.post("/refresh", guard, async (req, res) => {
    const token =
      typeof req.cookies?.careloop_refresh === "string"
        ? req.cookies.careloop_refresh
        : "";
    if (!token) throw new HttpError(401, "UNAUTHORIZED", "Please sign in.");
    const result = await transaction(pool, async (db) => {
      const stored = (
        await rows<
          pg.QueryResultRow & {
            user_id: string;
            family_id: string;
            used_at: Date | null;
            revoked_at: Date | null;
            expires_at: Date;
          }
        >(db, "SELECT * FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE", [
          digest(token),
        ])
      )[0];
      if (!stored) return null;
      if (
        stored.used_at ||
        stored.revoked_at ||
        stored.expires_at < new Date()
      ) {
        await db.query(
          "UPDATE refresh_tokens SET revoked_at=now() WHERE family_id=$1",
          [stored.family_id],
        );
        await audit(
          db,
          null,
          stored.user_id,
          "auth.refresh_reuse",
          null,
          "denied",
        );
        return null;
      }
      const user = (
        await rows<UserRow>(db, "SELECT * FROM users WHERE id=$1 AND active", [
          stored.user_id,
        ])
      )[0];
      if (!user) return null;
      await db.query(
        "UPDATE refresh_tokens SET used_at=now() WHERE token_hash=$1",
        [digest(token)],
      );
      await audit(db, toActor(user), user.id, "auth.refresh", user.id);
      return session(user, res, stored.family_id, db);
    });
    if (!result) {
      res.clearCookie("careloop_refresh", cookie);
      throw new HttpError(401, "UNAUTHORIZED", "Please sign in again.");
    }
    res.json(result);
  });
  router.post("/logout", async (req, res) => {
    const token =
      typeof req.cookies?.careloop_refresh === "string"
        ? req.cookies.careloop_refresh
        : "";
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at=now() WHERE family_id IN (SELECT family_id FROM refresh_tokens WHERE token_hash=$1)",
      [digest(token)],
    );
    res.clearCookie("careloop_refresh", cookie);
    res.status(204).end();
  });
  router.get("/me", authMiddleware(pool, config), async (req, res) => {
    const actor = req.actor!;
    await audit(pool, actor, actor.id, "profile.read", actor.id);
    const p = (
      await rows<{ payload_enc: string }>(
        pool,
        "SELECT payload_enc FROM profiles WHERE user_id=$1",
        [actor.id],
      )
    )[0];
    res.json({
      user: actor,
      profile: p
        ? unseal<Profile>(
            p.payload_enc,
            config.FIELD_ENCRYPTION_KEY,
            `profile:${actor.id}`,
          )
        : null,
    });
  });
  return router;
}
