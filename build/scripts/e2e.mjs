import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
const env = parseEnv(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8"),
);
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
let token = "";
async function call(route, options = {}) {
  const response = await fetch(base + "/api" + route, {
    ...options,
    headers: {
      "X-CareLoop-Client": "web",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!(options.body instanceof FormData) && options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
try {
  const login = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "sarah@example.test",
      password: env.SEED_PASSWORD,
    }),
  });
  token = login.accessToken;
  assert.equal((await call("/auth/me")).user.role, "patient");
  for (const [file, mime] of [
    ["synthetic-01.pdf", "application/pdf"],
    ["synthetic-33.png", "image/png"],
  ]) {
    const data = new FormData();
    data.append("title", "Synthetic end-to-end check");
    data.append("collectedAt", "2026-01-01");
    data.append("synthetic", "true");
    data.append(
      "file",
      new Blob(
        [
          fs.readFileSync(
            new URL("../evals/fixtures/" + file, import.meta.url),
          ),
        ],
        { type: mime },
      ),
      file,
    );
    const created = await call("/reports", { method: "POST", body: data });
    try {
      let report;
      for (let attempt = 0; attempt < 90; attempt++) {
        report = await call("/reports/" + created.id);
        if (["ready", "needs_review", "failed"].includes(report.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.equal(report.state, "ready");
      assert.equal(report.values.length, 3);
      assert.ok(
        report.values.every((v) => v.range && v.status !== "unclassified"),
      );
      const urdu = await call("/reports/" + created.id + "?locale=ur");
      assert.equal(
        urdu.explanation.doctorPointer,
        "اپنے نتائج پر ڈاکٹر سے بات کریں۔",
      );
      const answer = await call("/reports/" + created.id + "/chat", {
        method: "POST",
        body: JSON.stringify({ message: "do I have diabetes?", locale: "en" }),
      });
      assert.match(answer.answer, /cannot diagnose/);
      console.log(
        `${path.extname(file).slice(1).toUpperCase()} upload → extraction → deterministic status → bilingual explanation → guarded chat: passed`,
      );
    } finally {
      await call("/reports/" + created.id, { method: "DELETE" });
    }
  }
  const clinic = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "clinic@example.test",
      password: env.SEED_PASSWORD,
    }),
  });
  token = clinic.accessToken;
  const queue = await call("/clinic/escalations");
  assert.ok(queue.items.length > 0);
  console.log("Clinic review queue: passed");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "End-to-end check failed",
  );
  process.exitCode = 1;
}
