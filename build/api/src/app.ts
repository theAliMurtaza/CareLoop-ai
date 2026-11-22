import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import type pg from "pg";
import type { Config } from "./config.js";
import { createPool } from "./db/index.js";
import { authMiddleware, authRouter } from "./auth.js";
import { reportsRouter } from "./reports.js";
import { patientRouter } from "./patient.js";
import { clinicRouter } from "./clinic.js";
import { automationRouter } from "./automation.js";
import { audit, HttpError } from "./audit.js";
export function createApp(
  config: Config,
  pool: pg.Pool = createPool(config.DATABASE_URL),
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use((_req, res, next) => {
    res.setHeader("X-Request-Id", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const origins = new Set([config.CORS_ORIGIN]);
  if (config.NODE_ENV !== "production") {
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:3000");
  }
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "api", syntheticOnly: true }),
  );
  app.get("/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1 FROM reference_ranges LIMIT 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buffer) => {
        (req as express.Request).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use("/api", (req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.path.startsWith("/automation/")
    ) {
      const origin = req.header("origin");
      if (
        req.header("x-careloop-client") !== "web" ||
        (origin && !origins.has(origin))
      )
        throw new HttpError(
          403,
          "CSRF_REJECTED",
          "Request origin could not be verified.",
        );
    }
    next();
  });
  app.use("/api/auth", authRouter(pool, config));
  app.use("/api/automation", automationRouter(pool, config));
  app.use("/api", authMiddleware(pool, config));
  app.use("/api/reports", reportsRouter(pool, config));
  app.use("/api/clinic", clinicRouter(pool, config));
  app.use("/api", patientRouter(pool, config));
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Endpoint unavailable." } }),
  );
  const errors: ErrorRequestHandler = async (
    error: unknown,
    req,
    res,
    _next,
  ) => {
    let status = 500,
      code = "INTERNAL_ERROR",
      message = "The request could not be completed.";
    if (error instanceof HttpError) {
      status = error.status;
      code = error.code;
      message = error.publicMessage;
    } else if (error instanceof ZodError) {
      status = 400;
      code = "INVALID_INPUT";
      message = "Please check the submitted fields.";
    } else if (typeof error === "object" && error !== null) {
      if ("code" in error && error.code === "23505") {
        status = 409;
        code = "ALREADY_EXISTS";
        message = "This record already exists.";
      } else if ("code" in error && error.code === "LIMIT_FILE_SIZE") {
        status = 413;
        code = "FILE_TOO_LARGE";
        message = "Choose a file smaller than 10 MB.";
      } else if (
        "status" in error &&
        typeof error.status === "number" &&
        error.status >= 400 &&
        error.status < 500
      ) {
        status = error.status;
        code = "INVALID_REQUEST";
      }
    }
    try {
      if (req.actor && status >= 400)
        await audit(
          pool,
          req.actor,
          null,
          "request.rejected",
          null,
          status < 500 ? "denied" : "error",
        );
    } catch {
      status = 503;
      code = "AUDIT_UNAVAILABLE";
      message = "Access is temporarily unavailable.";
    }
    if (!res.headersSent) res.status(status).json({ error: { code, message } });
  };
  app.use(errors);
  return app;
}
