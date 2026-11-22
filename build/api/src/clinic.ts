import { Router } from "express";
import { z } from "zod";
import type pg from "pg";
import type { Config } from "./config.js";
import { rows, transaction } from "./db/index.js";
import { audit, HttpError } from "./audit.js";
import { seal, unseal } from "./crypto.js";
import type { Profile, ReportMeta } from "./types.js";
export function clinicRouter(pool: pg.Pool, config: Config): Router {
  const router = Router();
  const key = config.FIELD_ENCRYPTION_KEY;
  router.use((req, _res, next) => {
    if (req.actor?.role === "patient")
      throw new HttpError(403, "CLINIC_ONLY", "A clinic account is required.");
    next();
  });
  router.get("/escalations", async (req, res) => {
    const a = req.actor!;
    const state = z
      .enum(["open", "in_review", "closed", "all"])
      .default("all")
      .parse(req.query.state);
    const records = await rows<{
      id: string;
      user_id: string;
      report_id: string;
      severity: string;
      state: string;
      note_enc: string | null;
      created_at: Date;
      updated_at: Date;
      profile_enc: string;
      report_enc: string;
    }>(
      pool,
      "SELECT e.*,p.payload_enc AS profile_enc,r.payload_enc AS report_enc FROM escalations e JOIN profiles p ON p.user_id=e.user_id JOIN reports r ON r.id=e.report_id WHERE ($1::boolean OR e.clinic_id=$2) AND ($3='all' OR e.state=$3) ORDER BY CASE e.severity WHEN 'critical' THEN 0 WHEN 'concerning' THEN 1 ELSE 2 END,e.created_at DESC LIMIT 100",
      [a.role === "admin", a.clinicId, state],
    );
    for (const patient of new Set(records.map((r) => r.user_id)))
      await audit(pool, a, patient, "clinic.escalations.read", patient);
    res.json({
      items: records.map((r) => ({
        id: r.id,
        reportId: r.report_id,
        patientId: r.user_id,
        patient: unseal<Profile>(r.profile_enc, key, `profile:${r.user_id}`)
          .displayName,
        report: unseal<ReportMeta>(r.report_enc, key, `report:${r.report_id}`)
          .title,
        severity: r.severity,
        state: r.state,
        note: r.note_enc
          ? unseal<string>(r.note_enc, key, `escalation:${r.id}`)
          : "",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });
  router.patch("/escalations/:id", async (req, res) => {
    const a = req.actor!;
    const id = z.uuid().parse(req.params.id);
    const body = z
      .object({
        state: z.enum(["open", "in_review", "closed"]),
        note: z.string().trim().max(2000),
      })
      .strict()
      .parse(req.body);
    await transaction(pool, async (db) => {
      const item = (
        await rows<{ user_id: string; clinic_id: string }>(
          db,
          "SELECT user_id,clinic_id FROM escalations WHERE id=$1 FOR UPDATE",
          [id],
        )
      )[0];
      if (!item || (a.role !== "admin" && item.clinic_id !== a.clinicId))
        throw new HttpError(404, "NOT_FOUND", "Escalation unavailable.");
      if (body.state === "closed" && body.note.length < 5)
        throw new HttpError(
          400,
          "NOTE_REQUIRED",
          "Add a review note before closing.",
        );
      await audit(db, a, item.user_id, "clinic.escalation.review", id);
      await db.query(
        "UPDATE escalations SET state=$1,note_enc=$2,reviewer_id=$3,updated_at=now() WHERE id=$4",
        [body.state, seal(body.note, key, `escalation:${id}`), a.id, id],
      );
    });
    res.json({ id, ...body });
  });
  router.get("/ranges", async (req, res) => {
    await audit(pool, req.actor!, null, "reference_ranges.read", null);
    res.json({
      items: await rows(
        pool,
        "SELECT * FROM reference_ranges ORDER BY test_code,version DESC",
      ),
    });
  });
  router.get("/audit", async (req, res) => {
    if (req.actor!.role !== "admin")
      throw new HttpError(
        403,
        "ADMIN_ONLY",
        "Administrator access is required.",
      );
    await audit(pool, req.actor!, null, "audit.read", null);
    res.json({
      items: await rows(
        pool,
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100",
      ),
    });
  });
  return router;
}
