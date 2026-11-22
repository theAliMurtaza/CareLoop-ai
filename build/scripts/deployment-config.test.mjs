import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  appRoot,
  prepareDeployment,
  readEnv,
  pendingTargets,
  dotenv,
} from "./deployment-config.mjs";

test("cloud setup preserves keys, isolates local config, and synchronizes service exports", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "careloop-deployment-"),
  );
  try {
    const root = path.join(temporary, "build");
    fs.mkdirSync(path.join(root, "deployment"), { recursive: true });
    fs.copyFileSync(
      path.join(appRoot, "deployment/.env.example"),
      path.join(root, "deployment/.env.example"),
    );
    fs.writeFileSync(path.join(root, ".env"), "LOCAL_SENTINEL=unchanged\n");
    const first = prepareDeployment(root);
    assert.ok(first.pending.length >= 4);
    const master = path.join(first.directory, "secrets.private.json");
    const originalSecrets = fs.readFileSync(master, "utf8");
    const targets = {
      DATABASE_URL:
        "postgresql://demo:synthetic-password@database.example.test/careloop?sslmode=verify-full",
      API_URL: "https://api.example.test",
      AI_URL: "https://ai.example.test/",
      FRONTEND_URL: "https://frontend.example.test",
      N8N_URL: "https://n8n.example.test",
      AI_MODE: "offline",
      LLM_PROVIDER: "groq",
      TIMEZONE: "Asia/Karachi",
    };
    fs.writeFileSync(path.join(root, "deployment/.env"), dotenv(targets));
    const second = prepareDeployment(root);
    assert.deepEqual(second.pending, []);
    assert.equal(fs.readFileSync(master, "utf8"), originalSecrets);
    assert.equal(
      fs.readFileSync(path.join(root, ".env"), "utf8"),
      "LOCAL_SENTINEL=unchanged\n",
    );
    const api = readEnv(path.join(first.directory, "api.env"));
    const ai = readEnv(path.join(first.directory, "ai.env"));
    assert.equal(api.AI_SERVICE_TOKEN, ai.AI_SERVICE_TOKEN);
    assert.equal(api.AI_BASE_URL, "https://ai.example.test");
    assert.equal(api.COOKIE_SECURE, "true");
    assert.equal(api.DATABASE_URL, targets.DATABASE_URL);
    assert.deepEqual(
      Object.keys(readEnv(path.join(first.directory, "frontend.env"))).sort(),
      ["API_INTERNAL_URL", "NEXT_TELEMETRY_DISABLED"],
    );
    fs.unlinkSync(master);
    assert.throws(() => prepareDeployment(root), /refusing to rotate/);
  } finally {
    // Only this test's own newly-created temporary directory is removed.
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith("careloop-deployment-"));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("preflight rejects placeholder/insecure targets and missing live credentials", () => {
  const targets = readEnv(path.join(appRoot, "deployment/.env.example"));
  assert.ok(pendingTargets(targets, true).includes("N8N_URL"));
  const live = { ...targets, AI_MODE: "live", LLM_PROVIDER: "gemini" };
  assert.ok(pendingTargets(live).includes("GEMINI_API_KEY"));
  assert.ok(pendingTargets(live).includes("LLM_MODEL"));
  assert.ok(
    pendingTargets({ ...targets, API_URL: "http://api.example.test" }).includes(
      "API_URL",
    ),
  );
  assert.ok(
    pendingTargets({
      ...targets,
      DATABASE_URL:
        "postgresql://demo:secret@database.example.test/demo?sslmode=disable",
    }).some((key) => key.startsWith("DATABASE_URL")),
  );
  assert.throws(
    () => dotenv({ DATABASE_URL: "one\nINJECTED=value" }),
    /Unsupported character/,
  );
});
