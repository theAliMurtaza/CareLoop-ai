import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Config } from "../config.js";
import { lookup, passwordHash, seal } from "../crypto.js";
import { rows, transaction } from "./index.js";
import { classify, type Range } from "../status.js";
import { embed } from "../retrieval.js";
import { audit } from "../audit.js";
import type { Actor, Explanation, ResultValue } from "../types.js";
const fixtures: [
  string,
  string,
  string,
  number,
  number,
  number | null,
  number | null,
][] = [
  ["glucose", "Fasting glucose", "mg/dL", 70, 99, 40, 400],
  ["hba1c", "HbA1c", "%", 4, 5.6, null, 14],
  ["hemoglobin", "Hemoglobin", "g/dL", 12, 16, 6, 22],
  ["wbc", "White blood cells", "10^9/L", 4, 11, 1, 50],
  ["platelets", "Platelets", "10^9/L", 150, 400, 30, 1000],
  ["rbc", "Red blood cells", "10^12/L", 4, 5.5, 2, 8],
  ["hematocrit", "Hematocrit", "%", 36, 48, 18, 65],
  ["mcv", "Mean cell volume", "fL", 80, 100, 50, 130],
  ["sodium", "Sodium", "mmol/L", 135, 145, 120, 160],
  ["potassium", "Potassium", "mmol/L", 3.5, 5.0, 2.5, 6.5],
  ["chloride", "Chloride", "mmol/L", 98, 107, 80, 125],
  ["calcium", "Calcium", "mg/dL", 8.5, 10.5, 6, 14],
  ["creatinine", "Creatinine", "mg/dL", 0.6, 1.2, null, 8],
  ["bun", "Blood urea nitrogen", "mg/dL", 7, 20, null, 100],
  ["alt", "ALT", "U/L", 7, 40, null, 1000],
  ["ast", "AST", "U/L", 10, 40, null, 1000],
  ["albumin", "Albumin", "g/dL", 3.5, 5, 1.5, 7],
  ["tsh", "TSH", "mIU/L", 0.4, 4, 0.01, 50],
  ["cholesterol", "Total cholesterol", "mg/dL", 100, 199, null, 500],
  ["triglycerides", "Triglycerides", "mg/dL", 30, 149, null, 1000],
];
export async function seed(pool: pg.Pool, config: Config): Promise<void> {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("SEED_PASSWORD must be set to at least 12 characters");
  await transaction(pool, async (db) => {
    for (const [code, label, unit, low, high, cl, ch] of fixtures) {
      await db.query(
        "INSERT INTO reference_ranges(test_code,label,unit,low,high,borderline_low,borderline_high,critical_low,critical_high,source_url,source_label,verification) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING",
        [
          code,
          label,
          unit,
          low,
          high,
          Math.max(0, low - (high - low) * 0.05),
          high + (high - low) * 0.05,
          cl,
          ch,
          "https://medlineplus.gov/lab-tests/",
          "UNVERIFIED synthetic engineering fixture; source review required",
          "synthetic_only",
        ],
      );
    }
    const ranges = await rows<Range>(db, "SELECT * FROM reference_ranges");
    const actors: {
      email: string;
      name: string;
      role: Actor["role"];
      id: string;
    }[] = [
      {
        email: "sarah@example.test",
        name: "Sarah Ahmed (synthetic)",
        role: "patient",
        id: "20000000-0000-4000-8000-000000000001",
      },
      {
        email: "ali@example.test",
        name: "Ali Khan (synthetic)",
        role: "patient",
        id: "20000000-0000-4000-8000-000000000002",
      },
      {
        email: "clinic@example.test",
        name: "Demo clinic reviewer",
        role: "clinic",
        id: "20000000-0000-4000-8000-000000000003",
      },
      {
        email: "admin@example.test",
        name: "Demo administrator",
        role: "admin",
        id: "20000000-0000-4000-8000-000000000004",
      },
    ];
    for (const actor of actors) {
      const result = await db.query(
        "INSERT INTO users(id,email_hash,email_enc,password_hash,role,clinic_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
        [
          actor.id,
          lookup(actor.email, config.EMAIL_LOOKUP_KEY),
          seal(actor.email, config.FIELD_ENCRYPTION_KEY, `email:${actor.id}`),
          await passwordHash(password),
          actor.role,
          config.DEFAULT_CLINIC_ID,
        ],
      );
      if (!result.rowCount) continue;
      await db.query(
        "INSERT INTO profiles(user_id,payload_enc) VALUES($1,$2)",
        [
          actor.id,
          seal(
            {
              displayName: actor.name,
              age: 35,
              sex: "female",
              locale: "en",
              timezone: "Asia/Karachi",
            },
            config.FIELD_ENCRYPTION_KEY,
            `profile:${actor.id}`,
          ),
        ],
      );
      await audit(db, null, actor.id, "seed.synthetic_user", actor.id);
      if (actor.role !== "patient") continue;
      for (let month = 0; month < 3; month++) {
        const reportId = randomUUID();
        const date = new Date();
        date.setUTCMonth(date.getUTCMonth() - month);
        const meta = {
          title: `Synthetic wellness panel ${month + 1}`,
          collectedAt: date.toISOString().slice(0, 10),
          synthetic: true,
        };
        await db.query(
          "INSERT INTO reports(id,user_id,payload_enc,mime,state,processing_stage,created_at) VALUES($1,$2,$3,'application/pdf','ready','complete',$4)",
          [
            reportId,
            actor.id,
            seal(meta, config.FIELD_ENCRYPTION_KEY, `report:${reportId}`),
            date,
          ],
        );
        const observations = [
          {
            testCode: "glucose",
            value:
              actor.email.startsWith("ali") && month === 0
                ? 410
                : 94 + month * 8,
            unit: "mg/dL",
          },
          { testCode: "hba1c", value: 5.4 + month * 0.2, unit: "%" },
          { testCode: "hemoglobin", value: 13.4 + month * 0.1, unit: "g/dL" },
          { testCode: "potassium", value: 4.2, unit: "mmol/L" },
        ];
        let severity = "none";
        for (const o of observations) {
          const id = randomUUID();
          const observation = {
            ...o,
            evidence: `${o.testCode} ${o.value} ${o.unit}`,
            confidence: 1,
          };
          const classified = classify(observation, ranges, {
            age: 35,
            sex: "female",
            synthetic: true,
          });
          const value: ResultValue = {
            id,
            label:
              ranges.find((r) => r.test_code === o.testCode)?.label ??
              o.testCode,
            ...observation,
            ...classified,
          };
          await db.query(
            "INSERT INTO report_values(id,report_id,payload_enc) VALUES($1,$2,$3)",
            [
              id,
              reportId,
              seal(value, config.FIELD_ENCRYPTION_KEY, `value:${id}`),
            ],
          );
          if (
            classified.escalation === "critical" ||
            (severity !== "critical" && classified.escalation === "concerning")
          )
            severity = classified.escalation;
        }
        for (const locale of ["en", "ur"]) {
          const explanation: Explanation =
            locale === "en"
              ? {
                  whatThisMeans:
                    "This synthetic example compares recorded values with demonstration reference ranges. A flagged result alone is not a diagnosis.",
                  whatCanAffectIt:
                    "Collection conditions and laboratory methods can affect results. The reviewed source must be checked with your care team.",
                  questionsToAsk:
                    "Which results should we discuss, and is a repeat test appropriate?",
                  doctorPointer: "Discuss your results with your doctor.",
                  sources: [],
                  mode: "synthetic-template",
                }
              : {
                  whatThisMeans:
                    "یہ فرضی مثال درج شدہ نتائج کا نمائشی حدود سے موازنہ کرتی ہے۔ نشان زد نتیجہ بذاتِ خود تشخیص نہیں ہے۔",
                  whatCanAffectIt:
                    "نمونہ لینے کے حالات اور لیبارٹری کے طریقے نتائج پر اثر ڈال سکتے ہیں۔",
                  questionsToAsk:
                    "کن نتائج پر بات کریں اور کیا ٹیسٹ دوبارہ ضروری ہے؟",
                  doctorPointer: "اپنے نتائج پر ڈاکٹر سے بات کریں۔",
                  sources: [],
                  mode: "synthetic-template",
                };
          await db.query(
            "INSERT INTO explanations(report_id,locale,payload_enc) VALUES($1,$2,$3)",
            [
              reportId,
              locale,
              seal(
                explanation,
                config.FIELD_ENCRYPTION_KEY,
                `explanation:${reportId}:${locale}`,
              ),
            ],
          );
        }
        if (severity !== "none")
          await db.query(
            "INSERT INTO escalations(report_id,user_id,clinic_id,severity) VALUES($1,$2,$3,$4)",
            [reportId, actor.id, config.DEFAULT_CLINIC_ID, severity],
          );
      }
    }
    const count = await rows<{ count: string }>(
      db,
      "SELECT count(*) FROM knowledge_chunks",
    );
    if (count[0]?.count === "0")
      for (const locale of ["en", "ur"]) {
        const content =
          locale === "en"
            ? "Laboratory results need interpretation in the context of the patient and the laboratory method. A result outside a reference range does not by itself establish a diagnosis. Collection conditions and preparation may affect results. Ask your clinician whether follow-up or repeat testing is appropriate."
            : "لیبارٹری نتائج کو مریض کے حالات اور لیبارٹری کے طریقے کے مطابق سمجھنا چاہیے۔ حد سے باہر نتیجہ بذات خود تشخیص نہیں ہے۔ نمونہ لینے کے حالات نتائج پر اثر ڈال سکتے ہیں۔ مزید ٹیسٹ کے بارے میں ڈاکٹر سے پوچھیں۔";
        await db.query(
          "INSERT INTO knowledge_chunks(test_code,locale,content,source,reviewed,embedding) VALUES('general',$1,$2,$3,true,$4::vector)",
          [
            locale,
            content,
            "CareLoop synthetic educational fixture (requires clinical editorial review)",
            JSON.stringify(embed(content)),
          ],
        );
      }
  });
}
