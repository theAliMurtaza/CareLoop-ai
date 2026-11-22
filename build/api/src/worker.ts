import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import type { Config } from "./config.js";
import { rows, transaction } from "./db/index.js";
import { seal, unseal } from "./crypto.js";
import { audit } from "./audit.js";
import { classify, type Range } from "./status.js";
import type { Profile, ResultValue, Explanation } from "./types.js";
import type { ReportRow } from "./reports.js";
import { retrieve } from "./retrieval.js";
const observation = z
  .object({
    testCode: z.string().max(80),
    value: z.number().finite(),
    unit: z.string().max(40),
    comparator: z.enum(["=", "<", ">", "<=", ">="]).default("="),
    evidence: z.string().min(1).max(1000),
    confidence: z.number().min(0).max(1),
  })
  .strict();
const explanationSchema = z.object({
  whatThisMeans: z.string().max(10000),
  whatCanAffectIt: z.string().max(10000),
  questionsToAsk: z.string().max(10000),
  doctorPointer: z.string().max(300),
  sources: z.array(z.object({ id: z.string(), source: z.string() })),
  mode: z.string(),
});
async function ai(
  config: Config,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetch(`${config.AI_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.AI_SERVICE_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error("AI_UNAVAILABLE");
  return response.json();
}
export async function processOne(
  pool: pg.Pool,
  config: Config,
): Promise<boolean> {
  const report = await transaction(pool, async (db) => {
    await db.query(
      "UPDATE reports SET state='failed',processing_stage='failed',error_code='PROCESSING_TIMEOUT' WHERE state='processing' AND locked_at<now()-interval '10 minutes' AND attempts>=3",
    );
    const r = (
      await rows<ReportRow>(
        db,
        "SELECT * FROM reports WHERE state='uploaded' OR (state='processing' AND locked_at<now()-interval '10 minutes' AND attempts<3) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      )
    )[0];
    if (!r) return null;
    await audit(db, null, r.user_id, "worker.claim", r.id);
    await db.query(
      "UPDATE reports SET state='processing',processing_stage='extracting',locked_at=now(),attempts=attempts+1 WHERE id=$1",
      [r.id],
    );
    return r;
  });
  if (!report) return false;
  const key = config.FIELD_ENCRYPTION_KEY;
  try {
    await audit(pool, null, report.user_id, "worker.report.read", report.id);
    if (!report.raw_enc) throw new Error("NO_SOURCE");
    const raw = unseal<string>(report.raw_enc, key, `raw:${report.id}`);
    const extraction = z
      .object({
        values: z.array(observation).max(200),
        warnings: z.array(z.string()).default([]),
      })
      .parse(
        await ai(config, "/extract", {
          fileBase64: raw,
          mime: report.mime,
          synthetic: true,
        }),
      );
    await pool.query(
      "UPDATE reports SET processing_stage='classifying' WHERE id=$1",
      [report.id],
    );
    const profileRow = (
      await rows<{ payload_enc: string }>(
        pool,
        "SELECT payload_enc FROM profiles WHERE user_id=$1",
        [report.user_id],
      )
    )[0]!;
    const profile = unseal<Profile>(
      profileRow.payload_enc,
      key,
      `profile:${report.user_id}`,
    );
    const ranges = await rows<Range>(
      pool,
      "SELECT DISTINCT ON(test_code,unit,sex,age_min,age_max) * FROM reference_ranges ORDER BY test_code,unit,sex,age_min,age_max,version DESC",
    );
    const values: ResultValue[] = extraction.values.map((o) => ({
      id: randomUUID(),
      label:
        ranges.find((r) => r.test_code === o.testCode)?.label ?? o.testCode,
      ...o,
      ...classify(o, ranges, {
        age: profile.age,
        sex: profile.sex,
        synthetic: true,
      }),
    }));
    let severity: "none" | "review" | "concerning" | "critical" =
      extraction.values.length === 0 || extraction.warnings.length > 0
        ? "review"
        : "none";
    for (const v of values) {
      if (v.escalation === "critical") severity = "critical";
      else if (v.escalation === "concerning" && severity !== "critical")
        severity = "concerning";
      else if (v.escalation === "review" && severity === "none")
        severity = "review";
    }
    await pool.query(
      "UPDATE reports SET processing_stage='explaining' WHERE id=$1",
      [report.id],
    );
    const explanations = new Map<string, Explanation>();
    for (const locale of ["en", "ur"] as const) {
      const chunks = await retrieve(
        pool,
        values.map((v) => v.testCode),
        locale,
        values.map((v) => v.label).join(" "),
      );
      const pointer =
        locale === "en"
          ? "Discuss your results with your doctor."
          : "اپنے نتائج پر ڈاکٹر سے بات کریں۔";
      let explained: Explanation;
      try {
        explained = explanationSchema.parse(
          await ai(config, "/explain", { locale, values, chunks }),
        );
        if (explained.doctorPointer !== pointer)
          throw new Error("UNSAFE_EXPLANATION");
      } catch {
        explained = {
          whatThisMeans:
            locale === "en"
              ? "Recorded values and rule-based statuses are shown above."
              : "درج نتائج اور مقررہ اصولوں سے طے شدہ حیثیت اوپر دکھائی گئی ہے۔",
          whatCanAffectIt:
            locale === "en"
              ? "A verified explanation is currently unavailable."
              : "تصدیق شدہ وضاحت اس وقت دستیاب نہیں۔",
          questionsToAsk:
            locale === "en"
              ? "Which results should we discuss?"
              : "کن نتائج پر بات کریں؟",
          doctorPointer: pointer,
          sources: [],
          mode: "safe-fallback",
        };
      }
      explanations.set(locale, explained);
    }
    await transaction(pool, async (db) => {
      await audit(db, null, report.user_id, "worker.result.write", report.id);
      await db.query("DELETE FROM report_values WHERE report_id=$1", [
        report.id,
      ]);
      await db.query("DELETE FROM explanations WHERE report_id=$1", [
        report.id,
      ]);
      for (const value of values)
        await db.query(
          "INSERT INTO report_values(id,report_id,payload_enc) VALUES($1,$2,$3)",
          [value.id, report.id, seal(value, key, `value:${value.id}`)],
        );
      for (const [locale, explanation] of explanations)
        await db.query(
          "INSERT INTO explanations(report_id,locale,payload_enc) VALUES($1,$2,$3)",
          [
            report.id,
            locale,
            seal(explanation, key, `explanation:${report.id}:${locale}`),
          ],
        );
      if (severity !== "none") {
        const owner = (
          await rows<{ clinic_id: string | null }>(
            db,
            "SELECT clinic_id FROM users WHERE id=$1",
            [report.user_id],
          )
        )[0];
        await db.query(
          "INSERT INTO escalations(report_id,user_id,clinic_id,severity) VALUES($1,$2,$3,$4) ON CONFLICT(report_id) DO UPDATE SET severity=$4,state='open',updated_at=now()",
          [
            report.id,
            report.user_id,
            owner?.clinic_id ?? config.DEFAULT_CLINIC_ID,
            severity,
          ],
        );
      }
      await db.query(
        "UPDATE reports SET state=$1,processing_stage='complete',locked_at=NULL,error_code=NULL WHERE id=$2",
        [
          values.some((v) => v.status === "unclassified") ||
          !values.length ||
          extraction.warnings.length > 0
            ? "needs_review"
            : "ready",
          report.id,
        ],
      );
    });
  } catch {
    await transaction(pool, async (db) => {
      await audit(
        db,
        null,
        report.user_id,
        "worker.failed",
        report.id,
        "error",
      );
      await db.query(
        "UPDATE reports SET state='failed',processing_stage='failed',error_code='PROCESSING_FAILED',locked_at=NULL WHERE id=$1",
        [report.id],
      );
    });
  }
  return true;
}
export function startWorker(pool: pg.Pool, config: Config): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void processOne(pool, config)
      .catch(() =>
        console.error("CareLoop worker unavailable; check service health."),
      )
      .finally(() => {
        busy = false;
      });
  }, 2500);
  timer.unref();
  return () => clearInterval(timer);
}
