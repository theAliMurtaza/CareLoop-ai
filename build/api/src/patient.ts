import { Router } from "express";
import { z } from "zod";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { rows, transaction } from "./db/index.js";
import { audit, HttpError, required } from "./audit.js";
import { seal, unseal } from "./crypto.js";
import type { Profile, ResultValue, ReportMeta } from "./types.js";
export function patientRouter(pool: pg.Pool, config: Config): Router {
  const router = Router();
  const key = config.FIELD_ENCRYPTION_KEY;
  router.put("/profile", async (req, res) => {
    const actor = req.actor!;
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(80),
        age: z.number().int().min(18).max(120),
        sex: z.enum(["female", "male", "unspecified"]),
        locale: z.enum(["en", "ur"]),
        timezone: z
          .string()
          .max(60)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
      })
      .strict()
      .parse(req.body);
    await transaction(pool, async (db) => {
      await audit(db, actor, actor.id, "profile.update", actor.id);
      await db.query("UPDATE profiles SET payload_enc=$1 WHERE user_id=$2", [
        seal(body, key, `profile:${actor.id}`),
        actor.id,
      ]);
    });
    res.json({ profile: body });
  });
  const schemas = {
    medications: z
      .object({
        name: z.string().trim().min(1).max(100),
        instructions: z.string().max(500),
        active: z.boolean().default(true),
      })
      .strict(),
    reminders: z
      .object({
        title: z.string().trim().min(1).max(100),
        dueAt: z.iso.datetime(),
        intervalMinutes: z
          .number()
          .int()
          .min(60)
          .max(525600)
          .nullable()
          .default(null),
        medicationId: z.uuid().nullable().default(null),
        active: z.boolean().default(true),
      })
      .strict(),
    "follow-ups": z
      .object({
        title: z.string().trim().min(1).max(100),
        notes: z.string().max(500).default(""),
        dueAt: z.iso.datetime(),
        completed: z.boolean().default(false),
      })
      .strict(),
  };
  for (const route of ["medications", "reminders", "follow-ups"] as const) {
    const table = route === "follow-ups" ? "follow_ups" : route;
    const schema = schemas[route];
    router.get(`/${route}`, async (req, res) => {
      const a = req.actor!;
      await audit(pool, a, a.id, `${table}.list`, a.id);
      const records = await rows<{
        id: string;
        payload_enc: string;
        due_at?: Date;
        active?: boolean;
        completed?: boolean;
      }>(
        pool,
        `SELECT * FROM ${table} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
        [a.id],
      );
      res.json({
        items: records.map((r) => ({
          ...unseal<Record<string, unknown>>(
            r.payload_enc,
            key,
            `${table}:${r.id}`,
          ),
          id: r.id,
          ...(r.due_at ? { dueAt: r.due_at.toISOString() } : {}),
          ...(r.active === undefined ? {} : { active: r.active }),
          ...(r.completed === undefined ? {} : { completed: r.completed }),
        })),
      });
    });
    for (const method of ["post", "put"] as const)
      router[method](
        `/${route}${method === "put" ? "/:id" : ""}`,
        async (req, res) => {
          const a = req.actor!;
          if (a.role !== "patient")
            throw new HttpError(
              403,
              "PATIENT_ONLY",
              "Use a patient account to edit this list.",
            );
          const body = schema.parse(req.body);
          const id =
            method === "put"
              ? z.uuid().parse((req.params as Record<string, string>).id)
              : randomUUID();
          await transaction(pool, async (db) => {
            if (
              method === "put" &&
              !(
                await rows(
                  db,
                  `SELECT id FROM ${table} WHERE id=$1 AND user_id=$2 FOR UPDATE`,
                  [id, a.id],
                )
              ).length
            ) {
              await audit(db, a, a.id, `${table}.update`, id, "denied");
              throw new HttpError(404, "NOT_FOUND", "Record unavailable.");
            }
            if (
              "medicationId" in body &&
              body.medicationId &&
              !(
                await rows(
                  db,
                  "SELECT id FROM medications WHERE id=$1 AND user_id=$2",
                  [body.medicationId, a.id],
                )
              ).length
            )
              throw new HttpError(
                400,
                "INVALID_MEDICATION",
                "Choose a medication from your own list.",
              );
            await audit(
              db,
              a,
              a.id,
              `${table}.${method === "post" ? "create" : "update"}`,
              id,
            );
            const payload = seal(body, key, `${table}:${id}`);
            if (table === "medications" && "active" in body) {
              await db.query(
                "INSERT INTO medications(id,user_id,payload_enc,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload_enc=$3,active=$4",
                [id, a.id, payload, body.active],
              );
              if (!body.active)
                await db.query(
                  "UPDATE reminders SET active=false WHERE medication_id=$1 AND user_id=$2",
                  [id, a.id],
                );
            } else if (table === "reminders" && "intervalMinutes" in body) {
              await db.query(
                "INSERT INTO reminders(id,user_id,payload_enc,due_at,interval_minutes,medication_id,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET payload_enc=$3,due_at=$4,interval_minutes=$5,medication_id=$6,active=$7",
                [
                  id,
                  a.id,
                  payload,
                  body.dueAt,
                  body.intervalMinutes,
                  body.medicationId,
                  body.active,
                ],
              );
            } else if ("completed" in body) {
              await db.query(
                "INSERT INTO follow_ups(id,user_id,payload_enc,due_at,completed) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET payload_enc=$3,due_at=$4,completed=$5",
                [id, a.id, payload, body.dueAt, body.completed],
              );
            }
          });
          res.status(method === "post" ? 201 : 200).json({ id, ...body });
        },
      );
    router.delete(`/${route}/:id`, async (req, res) => {
      const a = req.actor!;
      const id = z.uuid().parse((req.params as Record<string, string>).id);
      await transaction(pool, async (db) => {
        await audit(db, a, a.id, `${table}.delete`, id);
        if (table === "medications")
          await db.query(
            "UPDATE reminders SET active=false WHERE medication_id=$1 AND user_id=$2",
            [id, a.id],
          );
        const deleted = await db.query(
          `DELETE FROM ${table} WHERE id=$1 AND user_id=$2 RETURNING id`,
          [id, a.id],
        );
        if (!deleted.rowCount)
          throw new HttpError(404, "NOT_FOUND", "Record unavailable.");
      });
      res.status(204).end();
    });
  }
  router.get("/trends", async (req, res) => {
    const a = req.actor!;
    await audit(pool, a, a.id, "trends.read", a.id);
    const records = await rows<{
      id: string;
      payload_enc: string;
      report_id: string;
      report_enc: string;
    }>(
      pool,
      "SELECT v.*,r.payload_enc AS report_enc FROM report_values v JOIN reports r ON r.id=v.report_id WHERE r.user_id=$1 AND r.state IN ('ready','needs_review') ORDER BY r.created_at LIMIT 2000",
      [a.id],
    );
    res.json({
      points: records.map((r) => ({
        ...unseal<ResultValue>(r.payload_enc, key, `value:${r.id}`),
        reportId: r.report_id,
        date: unseal<ReportMeta>(r.report_enc, key, `report:${r.report_id}`)
          .collectedAt,
      })),
    });
  });
  router.get("/notifications", async (req, res) => {
    const a = req.actor!;
    await audit(pool, a, a.id, "notifications.read", a.id);
    const records = await rows<{
      id: string;
      payload_enc: string;
      read_at: Date | null;
      created_at: Date;
      kind: string;
    }>(
      pool,
      "SELECT * FROM automation_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [a.id],
    );
    res.json({
      items: records.map((r) => ({
        id: r.id,
        kind: r.kind,
        readAt: r.read_at,
        createdAt: r.created_at,
        ...unseal<Record<string, unknown>>(r.payload_enc, key, `event:${r.id}`),
      })),
    });
  });
  router.post("/notifications/:id/read", async (req, res) => {
    const a = req.actor!;
    const id = z.uuid().parse((req.params as Record<string, string>).id);
    await transaction(pool, async (db) => {
      await audit(db, a, a.id, "notification.read_ack", id);
      await db.query(
        "UPDATE automation_events SET read_at=now() WHERE id=$1 AND user_id=$2",
        [id, a.id],
      );
    });
    res.status(204).end();
  });
  return router;
}
