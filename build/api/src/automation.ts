import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import type { Config } from "./config.js";
import { rows, transaction, type Executor } from "./db/index.js";
import { audit, HttpError } from "./audit.js";
import { seal } from "./crypto.js";
export function constantEqual(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifySignature(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  now = Date.now(),
): boolean {
  const time = Number(timestamp);
  if (
    !Number.isFinite(time) ||
    Math.abs(now - time) > 300_000 ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(nonce)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
  return constantEqual(signature, expected);
}
async function event(
  db: Executor,
  key: string,
  userId: string,
  kind: string,
  idempotency: string,
  message: string,
) {
  const id = randomUUID();
  await audit(db, null, userId, "automation.notification", id);
  return (
    (
      await db.query(
        "INSERT INTO automation_events(id,user_id,kind,idempotency_key,payload_enc) VALUES($1,$2,$3,$4,$5) ON CONFLICT(idempotency_key) DO NOTHING",
        [id, userId, kind, idempotency, seal({ message }, key, `event:${id}`)],
      )
    ).rowCount ?? 0
  );
}
export async function tick(
  pool: pg.Pool,
  config: Config,
  kind: string,
): Promise<number> {
  return transaction(pool, async (db) => {
    let count = 0;
    const now = new Date();
    if (kind === "medication") {
      const due = await rows<{
        id: string;
        user_id: string;
        due_at: Date;
        interval_minutes: number | null;
      }>(
        db,
        "SELECT id,user_id,due_at,interval_minutes FROM reminders WHERE active AND due_at<=now() ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED",
      );
      for (const r of due) {
        count += await event(
          db,
          config.FIELD_ENCRYPTION_KEY,
          r.user_id,
          kind,
          `${kind}:${r.id}:${r.due_at.toISOString()}`,
          "A reminder is due. Open your reminders list and follow your clinician’s existing instructions.",
        );
        if (r.interval_minutes) {
          const interval = r.interval_minutes * 60000;
          const next = new Date(
            r.due_at.getTime() +
              (Math.floor((now.getTime() - r.due_at.getTime()) / interval) +
                1) *
                interval,
          );
          await db.query("UPDATE reminders SET due_at=$1 WHERE id=$2", [
            next,
            r.id,
          ]);
        } else
          await db.query("UPDATE reminders SET active=false WHERE id=$1", [
            r.id,
          ]);
      }
    }
    if (kind === "follow-up") {
      const due = await rows<{ id: string; user_id: string; due_at: Date }>(
        db,
        "SELECT id,user_id,due_at FROM follow_ups WHERE NOT completed AND due_at<=now() ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED",
      );
      for (const r of due)
        count += await event(
          db,
          config.FIELD_ENCRYPTION_KEY,
          r.user_id,
          kind,
          `${kind}:${r.id}:${r.due_at.toISOString()}`,
          "A follow-up is due. Open your follow-up list and contact your care team.",
        );
    }
    if (kind === "escalation") {
      const due = await rows<{
        id: string;
        user_id: string;
        clinic_id: string;
      }>(
        db,
        "SELECT id,user_id,clinic_id FROM escalations WHERE state='open' ORDER BY created_at LIMIT 100",
      );
      for (const r of due) {
        const staff = await rows<{ id: string }>(
          db,
          "SELECT id FROM users WHERE active AND (role='admin' OR (role='clinic' AND clinic_id=$1))",
          [r.clinic_id],
        );
        for (const member of staff)
          count += await event(
            db,
            config.FIELD_ENCRYPTION_KEY,
            member.id,
            kind,
            `${kind}:${r.id}:${member.id}`,
            "A report needs human review. Open the clinic dashboard.",
          );
        count += await event(
          db,
          config.FIELD_ENCRYPTION_KEY,
          r.user_id,
          kind,
          `${kind}:${r.id}`,
          "Your report has been placed in the clinic review queue. This queue is not an emergency service. Discuss your results with your doctor.",
        );
      }
    }
    if (kind === "weekly") {
      const week = new Date(now);
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
      const key = week.toISOString().slice(0, 10);
      const patients = await rows<{ id: string }>(
        db,
        "SELECT id FROM users WHERE active AND role='patient'",
      );
      for (const p of patients) {
        await audit(db, null, p.id, "automation.weekly.read", p.id);
        const reports = (
          await rows<{ count: string }>(
            db,
            "SELECT count(*) FROM reports WHERE user_id=$1 AND created_at>now()-interval '7 days'",
            [p.id],
          )
        )[0]!.count;
        count += await event(
          db,
          config.FIELD_ENCRYPTION_KEY,
          p.id,
          kind,
          `${kind}:${p.id}:${key}`,
          `Your weekly CareLoop summary: ${reports} reports added in the last seven days. Review your trends and upcoming reminders. Discuss your results with your doctor.`,
        );
      }
    }
    return count;
  });
}
export function automationRouter(pool: pg.Pool, config: Config): Router {
  const router = Router();
  router.use((req, _res, next) => {
    if (
      !constantEqual(
        req.headers.authorization ?? "",
        `Bearer ${config.AUTOMATION_TOKEN}`,
      )
    )
      throw new HttpError(
        401,
        "UNAUTHORIZED",
        "Automation authentication failed.",
      );
    next();
  });
  router.post("/tick", async (req, res) => {
    const { kind } = z
      .object({
        kind: z.enum(["medication", "follow-up", "escalation", "weekly"]),
      })
      .strict()
      .parse(req.body);
    res.json({ created: await tick(pool, config, kind) });
  });
  router.post("/webhook", async (req, res) => {
    const timestamp = req.header("x-careloop-timestamp") ?? "",
      nonce = req.header("x-careloop-nonce") ?? "",
      signature = req.header("x-careloop-signature") ?? "";
    const body = req.rawBody?.toString("utf8") ?? "";
    if (
      !verifySignature(
        config.AUTOMATION_WEBHOOK_SECRET,
        timestamp,
        nonce,
        body,
        signature,
      )
    )
      throw new HttpError(
        401,
        "INVALID_SIGNATURE",
        "Webhook verification failed.",
      );
    const { kind } = z
      .object({ kind: z.literal("escalation") })
      .parse(req.body);
    const inserted = await pool.query(
      "INSERT INTO webhook_nonces(nonce,expires_at) VALUES($1,now()+interval '10 minutes') ON CONFLICT DO NOTHING",
      [nonce],
    );
    if (!inserted.rowCount)
      throw new HttpError(409, "REPLAY", "Webhook already received.");
    res.json({ created: await tick(pool, config, kind) });
  });
  return router;
}
