import { fileURLToPath } from "node:url";
import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createPool, migrateDatabase } from "../src/db/index.js";
import { readConfig } from "../src/config.js";
import { seed } from "../src/db/seed.js";
import { createApp } from "../src/app.js";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { processOne } from "../src/worker.js";
const enabled = process.env.RUN_INTEGRATION === "true";
describe("API integration with PostgreSQL", { skip: !enabled }, () => {
  const config = readConfig(process.env);
  const testUrl = new URL(config.DATABASE_URL);
  testUrl.pathname = "/careloop_test";
  const pool = createPool(testUrl.toString());
  const app = createApp({ ...config, NODE_ENV: "test" }, pool);
  let patient = "",
    other = "",
    clinic = "";
  let reportId = "",
    medicationId = "";
  const client = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "X-CareLoop-Client": "web",
  });
  before(async () => {
    const admin = createPool(config.DATABASE_URL);
    try {
      const exists = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname=$1",
        ["careloop_test"],
      );
      if (!exists.rowCount) await admin.query("CREATE DATABASE careloop_test");
    } finally {
      await admin.end();
    }
    await migrateDatabase(
      pool,
      fileURLToPath(new URL("../../drizzle", import.meta.url)),
    );
    await seed(pool, config);
    for (const [email, set] of [
      [
        "sarah@example.test",
        (t: string) => {
          patient = t;
        },
      ],
      [
        "ali@example.test",
        (t: string) => {
          other = t;
        },
      ],
      [
        "clinic@example.test",
        (t: string) => {
          clinic = t;
        },
      ],
    ] as const) {
      const r = await request(app)
        .post("/api/auth/login")
        .set("X-CareLoop-Client", "web")
        .send({ email, password: process.env.SEED_PASSWORD })
        .expect(200);
      set(r.body.accessToken as string);
    }
    reportId = (
      await request(app).get("/api/reports").set(client(patient)).expect(200)
    ).body.reports[0].id as string;
  });
  after(async () => {
    await pool.end();
  });
  it("protects data and has security headers", async () => {
    await request(app).get("/api/reports").expect(401);
    const r = await request(app).get("/health").expect(200);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["cache-control"], "no-store");
  });
  it("enforces ownership and clinic RBAC", async () => {
    await request(app)
      .get(`/api/reports/${reportId}`)
      .set(client(other))
      .expect(404);
    await request(app)
      .get("/api/clinic/escalations")
      .set(client(patient))
      .expect(403);
    await request(app)
      .get(`/api/reports/${reportId}`)
      .set(client(clinic))
      .expect(200);
    await request(app)
      .get("/api/clinic/escalations")
      .set(client(clinic))
      .expect(200);
  });
  it("protects mutation requests from cross-site submission", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({
        email: "sarah@example.test",
        password: process.env.SEED_PASSWORD,
      })
      .expect(403);
    await request(app)
      .post("/api/auth/login")
      .set("X-CareLoop-Client", "web")
      .set("Origin", "https://untrusted.invalid")
      .send({
        email: "sarah@example.test",
        password: process.env.SEED_PASSWORD,
      })
      .expect(403);
  });
  it("rotates refresh tokens and revokes the family after reuse", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .set("X-CareLoop-Client", "web")
      .send({
        email: "sarah@example.test",
        password: process.env.SEED_PASSWORD,
      })
      .expect(200);
    const original = login.headers["set-cookie"] as unknown as string[];
    const rotated = await request(app)
      .post("/api/auth/refresh")
      .set("X-CareLoop-Client", "web")
      .set("Cookie", original)
      .expect(200);
    await request(app)
      .post("/api/auth/refresh")
      .set("X-CareLoop-Client", "web")
      .set("Cookie", original)
      .expect(401);
    await request(app)
      .post("/api/auth/refresh")
      .set("X-CareLoop-Client", "web")
      .set("Cookie", rotated.headers["set-cookie"] as unknown as string[])
      .expect(401);
  });
  it("encrypts medications and prevents cross-patient changes", async () => {
    const marker = `Synthetic-${randomUUID()}`;
    const r = await request(app)
      .post("/api/medications")
      .set(client(patient))
      .send({
        name: marker,
        instructions: "Recorded existing instructions",
        active: true,
      })
      .expect(201);
    medicationId = r.body.id as string;
    const stored = await pool.query(
      "SELECT payload_enc FROM medications WHERE id=$1",
      [medicationId],
    );
    assert.ok(!JSON.stringify(stored.rows).includes(marker));
    await request(app)
      .put(`/api/medications/${medicationId}`)
      .set(client(other))
      .send({ name: "Changed", instructions: "", active: true })
      .expect(404);
    await request(app)
      .delete(`/api/medications/${medicationId}`)
      .set(client(patient))
      .expect(204);
  });
  it("rejects spoofed uploads and does not echo contents", async () => {
    const r = await request(app)
      .post("/api/reports")
      .set(client(patient))
      .field("title", "Synthetic invalid")
      .field("collectedAt", "2026-01-01")
      .field("synthetic", "true")
      .attach("file", Buffer.from("private-marker"), {
        filename: "fake.pdf",
        contentType: "application/pdf",
      })
      .expect(400);
    assert.ok(!JSON.stringify(r.body).includes("private-marker"));
  });
  it("pauses linked reminders when an existing medication is paused", async () => {
    const med = await request(app)
      .post("/api/medications")
      .set(client(patient))
      .send({
        name: "Synthetic reminder fixture",
        instructions: "Existing instructions",
        active: true,
      })
      .expect(201);
    const reminder = await request(app)
      .post("/api/reminders")
      .set(client(patient))
      .send({
        title: "Synthetic reminder",
        dueAt: new Date().toISOString(),
        medicationId: med.body.id,
      })
      .expect(201);
    await request(app)
      .put(`/api/medications/${med.body.id}`)
      .set(client(patient))
      .send({
        name: "Synthetic reminder fixture",
        instructions: "Existing instructions",
        active: false,
      })
      .expect(200);
    const list = await request(app)
      .get("/api/reminders")
      .set(client(patient))
      .expect(200);
    assert.equal(
      list.body.items.find((r: { id: string }) => r.id === reminder.body.id)
        .active,
      false,
    );
    await request(app)
      .delete(`/api/reminders/${reminder.body.id}`)
      .set(client(patient))
      .expect(204);
    await request(app)
      .delete(`/api/medications/${med.body.id}`)
      .set(client(patient))
      .expect(204);
  });
  it("preserves deterministic critical escalation when explanations fail", async () => {
    const fake = createServer((req, res) => {
      req.resume();
      res.setHeader("content-type", "application/json");
      if (req.url === "/extract")
        res.end(
          JSON.stringify({
            values: [
              {
                testCode: "glucose",
                value: 410,
                unit: "mg/dL",
                comparator: "=",
                evidence: "Glucose 410 mg/dL",
                confidence: 1,
              },
            ],
            warnings: [],
          }),
        );
      else {
        res.statusCode = 503;
        res.end("{}");
      }
    });
    await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
    try {
      const address = fake.address();
      assert.ok(address && typeof address === "object");
      const uploaded = await request(app)
        .post("/api/reports")
        .set(client(patient))
        .field("title", "Synthetic worker fallback")
        .field("collectedAt", "2026-01-01")
        .field("synthetic", "true")
        .attach(
          "file",
          Buffer.from("%PDF-1.4\nSynthetic mock transport only"),
          { filename: "synthetic.pdf", contentType: "application/pdf" },
        )
        .expect(202);
      await processOne(pool, {
        ...config,
        AI_BASE_URL: `http://127.0.0.1:${address.port}`,
      });
      const report = await request(app)
        .get(`/api/reports/${uploaded.body.id}`)
        .set(client(patient))
        .expect(200);
      assert.equal(report.body.state, "ready");
      assert.equal(report.body.values[0].status, "critical");
      assert.equal(report.body.explanation.mode, "safe-fallback");
      const escalation = await pool.query(
        "SELECT severity FROM escalations WHERE report_id=$1",
        [uploaded.body.id],
      );
      assert.equal(escalation.rows[0].severity, "critical");
      await request(app)
        .delete(`/api/reports/${uploaded.body.id}`)
        .set(client(patient))
        .expect(204);
    } finally {
      await new Promise<void>((resolve, reject) =>
        fake.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("rejects unauthenticated automation and deduplicates events", async () => {
    await request(app)
      .post("/api/automation/tick")
      .send({ kind: "escalation" })
      .expect(401);
    const a = await request(app)
      .post("/api/automation/tick")
      .set("Authorization", `Bearer ${config.AUTOMATION_TOKEN}`)
      .send({ kind: "escalation" })
      .expect(200);
    const b = await request(app)
      .post("/api/automation/tick")
      .set("Authorization", `Bearer ${config.AUTOMATION_TOKEN}`)
      .send({ kind: "escalation" })
      .expect(200);
    assert.ok(a.body.created >= 0);
    assert.equal(b.body.created, 0);
  });
  it("fails closed when audit storage is unavailable and audit rows are immutable", async () => {
    await pool.query("ALTER TABLE audit_logs RENAME TO audit_logs_test_hold");
    try {
      const r = await request(app)
        .get(`/api/reports/${reportId}`)
        .set(client(patient))
        .expect(503);
      assert.ok(!("values" in r.body));
    } finally {
      await pool.query("ALTER TABLE audit_logs_test_hold RENAME TO audit_logs");
    }
    await assert.rejects(
      pool.query(
        "UPDATE audit_logs SET action='modified' WHERE id=(SELECT id FROM audit_logs LIMIT 1)",
      ),
    );
    const counts = await pool.query(
      "SELECT count(*) AS count FROM audit_logs WHERE outcome='denied'",
    );
    assert.ok(Number(counts.rows[0].count) > 0);
  });
});
