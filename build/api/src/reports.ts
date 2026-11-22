import { Router, type Request } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import type { Config } from "./config.js";
import { rows, transaction, type Executor } from "./db/index.js";
import { seal, unseal } from "./crypto.js";
import { audit, HttpError, required } from "./audit.js";
import type {
  Actor,
  ReportMeta,
  ResultValue,
  Explanation,
  Profile,
} from "./types.js";
import { retrieve } from "./retrieval.js";
export interface ReportRow extends pg.QueryResultRow {
  id: string;
  user_id: string;
  clinic_id: string | null;
  payload_enc: string;
  raw_enc: string | null;
  mime: string;
  state: string;
  processing_stage: string;
  error_code: string | null;
  created_at: Date;
  attempts: number;
}
export async function authorizedReport(
  db: Executor,
  actor: Actor,
  id: string,
): Promise<ReportRow> {
  const report = (
    await rows<ReportRow>(
      db,
      "SELECT r.*,u.clinic_id FROM reports r JOIN users u ON u.id=r.user_id WHERE r.id=$1",
      [id],
    )
  )[0];
  if (
    !report ||
    !(
      report.user_id === actor.id ||
      actor.role === "admin" ||
      (actor.role === "clinic" && report.clinic_id === actor.clinicId)
    )
  ) {
    await audit(
      db,
      actor,
      report?.user_id ?? null,
      "report.access",
      id,
      "denied",
    );
    throw new HttpError(
      404,
      "NOT_FOUND",
      "The requested report is unavailable.",
    );
  }
  return report;
}
export function reportMeta(r: ReportRow, key: string) {
  return {
    id: r.id,
    ...unseal<ReportMeta>(r.payload_enc, key, `report:${r.id}`),
    state: r.state,
    stage: r.processing_stage,
    errorCode: r.error_code,
    createdAt: r.created_at,
  };
}
export async function reportResults(
  db: Executor,
  id: string,
  key: string,
): Promise<ResultValue[]> {
  const records = await rows<{ id: string; payload_enc: string }>(
    db,
    "SELECT id,payload_enc FROM report_values WHERE report_id=$1 ORDER BY id",
    [id],
  );
  return records.map((r) =>
    unseal<ResultValue>(r.payload_enc, key, `value:${r.id}`),
  );
}
export function reportsRouter(pool: pg.Pool, config: Config): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 4, fieldSize: 500 },
  });
  router.get("/", async (req, res) => {
    const actor = req.actor!;
    await audit(pool, actor, actor.id, "reports.list", actor.id);
    const records = await rows<ReportRow>(
      pool,
      "SELECT * FROM reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [actor.id],
    );
    res.json({
      reports: records.map((r) => reportMeta(r, config.FIELD_ENCRYPTION_KEY)),
    });
  });
  router.post("/", upload.single("file"), async (req, res) => {
    const actor = req.actor!;
    if (actor.role !== "patient")
      throw new HttpError(
        403,
        "PATIENT_ONLY",
        "Use a patient account to upload a synthetic report.",
      );
    const fields = z
      .object({
        title: z.string().trim().min(1).max(100),
        collectedAt: z.iso.date(),
        synthetic: z.literal("true"),
      })
      .parse(req.body);
    const file = req.file;
    if (!file)
      throw new HttpError(400, "FILE_REQUIRED", "Choose a PDF, JPEG, or PNG.");
    let mime = "";
    const b = file.buffer;
    if (b.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
    else if (
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    else if (b[0] === 255 && b[1] === 216 && b[2] === 255) mime = "image/jpeg";
    if (!mime || mime !== file.mimetype)
      throw new HttpError(
        400,
        "INVALID_FILE",
        "The file content must match a supported PDF, PNG, or JPEG.",
      );
    const id = randomUUID();
    await transaction(pool, async (db) => {
      await audit(db, actor, actor.id, "report.upload", id);
      await db.query(
        "INSERT INTO reports(id,user_id,payload_enc,raw_enc,mime) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          actor.id,
          seal(
            { ...fields, synthetic: true },
            config.FIELD_ENCRYPTION_KEY,
            `report:${id}`,
          ),
          seal(b.toString("base64"), config.FIELD_ENCRYPTION_KEY, `raw:${id}`),
          mime,
        ],
      );
    });
    b.fill(0);
    res.status(202).json({ id, state: "uploaded" });
  });
  router.get("/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const actor = req.actor!;
    const report = await authorizedReport(pool, actor, id);
    const locale = z.enum(["en", "ur"]).default("en").parse(req.query.locale);
    await audit(pool, actor, report.user_id, "report.read", id);
    const values = await reportResults(pool, id, config.FIELD_ENCRYPTION_KEY);
    const explanation = (
      await rows<{ payload_enc: string }>(
        pool,
        "SELECT payload_enc FROM explanations WHERE report_id=$1 AND locale=$2",
        [id, locale],
      )
    )[0];
    res.json({
      ...reportMeta(report, config.FIELD_ENCRYPTION_KEY),
      values,
      explanation: explanation
        ? unseal<Explanation>(
            explanation.payload_enc,
            config.FIELD_ENCRYPTION_KEY,
            `explanation:${id}:${locale}`,
          )
        : null,
    });
  });
  router.patch("/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const actor = req.actor!;
    const report = await authorizedReport(pool, actor, id);
    if (report.user_id !== actor.id)
      throw new HttpError(
        403,
        "PATIENT_ONLY",
        "Only the report owner can rename it.",
      );
    const body = z
      .object({ title: z.string().trim().min(1).max(100) })
      .strict()
      .parse(req.body);
    const meta = unseal<ReportMeta>(
      report.payload_enc,
      config.FIELD_ENCRYPTION_KEY,
      `report:${id}`,
    );
    await transaction(pool, async (db) => {
      await audit(db, actor, actor.id, "report.update", id);
      await db.query("UPDATE reports SET payload_enc=$1 WHERE id=$2", [
        seal(
          { ...meta, title: body.title },
          config.FIELD_ENCRYPTION_KEY,
          `report:${id}`,
        ),
        id,
      ]);
    });
    res.json({ id, ...meta, title: body.title });
  });
  router.delete("/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const actor = req.actor!;
    const report = await authorizedReport(pool, actor, id);
    if (report.user_id !== actor.id && actor.role !== "admin")
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Only the owner or administrator can delete a report.",
      );
    await transaction(pool, async (db) => {
      await audit(db, actor, report.user_id, "report.delete", id);
      await db.query("DELETE FROM reports WHERE id=$1", [id]);
    });
    res.status(204).end();
  });
  router.post("/:id/retry", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const actor = req.actor!;
    const report = await authorizedReport(pool, actor, id);
    if (
      report.user_id !== actor.id ||
      report.state !== "failed" ||
      !report.raw_enc
    )
      throw new HttpError(
        409,
        "NOT_RETRYABLE",
        "This report cannot be retried.",
      );
    await transaction(pool, async (db) => {
      await audit(db, actor, report.user_id, "report.retry", id);
      await db.query(
        "UPDATE reports SET state='uploaded',processing_stage='queued',attempts=0,error_code=NULL,locked_at=NULL WHERE id=$1",
        [id],
      );
    });
    res.json({ id, state: "uploaded" });
  });
  router.get("/:id/chat", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const report = await authorizedReport(pool, req.actor!, id);
    await audit(pool, req.actor!, report.user_id, "chat.read", id);
    const records = await rows<{
      id: string;
      role: string;
      content_enc: string;
      created_at: Date;
    }>(
      pool,
      "SELECT * FROM chat_messages WHERE report_id=$1 ORDER BY created_at LIMIT 100",
      [id],
    );
    res.json({
      messages: records.map((r) => ({
        id: r.id,
        role: r.role,
        content: unseal<string>(
          r.content_enc,
          config.FIELD_ENCRYPTION_KEY,
          `chat:${r.id}`,
        ),
        createdAt: r.created_at,
      })),
    });
  });
  router.post("/:id/chat", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const actor = req.actor!;
    const report = await authorizedReport(pool, actor, id);
    if (!["ready", "needs_review"].includes(report.state))
      throw new HttpError(
        409,
        "REPORT_NOT_READY",
        "Wait until report processing finishes.",
      );
    const body = z
      .object({
        message: z.string().trim().min(1).max(1000),
        locale: z.enum(["en", "ur"]).default("en"),
      })
      .strict()
      .parse(req.body);
    await audit(pool, actor, report.user_id, "chat.ask", id);
    const values = await reportResults(pool, id, config.FIELD_ENCRYPTION_KEY);
    const chunks = await retrieve(
      pool,
      values.map((v) => v.testCode),
      body.locale,
      body.message,
    );
    const response = await fetch(`${config.AI_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.AI_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({
        message: body.message,
        locale: body.locale,
        values,
        chunks,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new HttpError(
        503,
        "AI_UNAVAILABLE",
        "The companion is unavailable. Please try again.",
      );
    const answer = z
      .object({ answer: z.string().max(10000) })
      .parse(await response.json());
    await transaction(pool, async (db) => {
      await audit(db, actor, report.user_id, "chat.save", id);
      for (const [role, text] of [
        ["user", body.message],
        ["assistant", answer.answer],
      ]) {
        const messageId = randomUUID();
        await db.query(
          "INSERT INTO chat_messages(id,report_id,user_id,role,content_enc) VALUES($1,$2,$3,$4,$5)",
          [
            messageId,
            id,
            actor.id,
            role,
            seal(text, config.FIELD_ENCRYPTION_KEY, `chat:${messageId}`),
          ],
        );
      }
    });
    res.json(answer);
  });
  return router;
}
