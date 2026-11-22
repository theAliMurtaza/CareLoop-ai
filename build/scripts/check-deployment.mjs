import fs from "node:fs";
import path from "node:path";
import {
  appRoot,
  readEnv,
  pendingTargets,
  secretNames,
} from "./deployment-config.mjs";
try {
  const targets = readEnv(path.join(appRoot, "deployment/.env"));
  const pending = pendingTargets(targets, process.argv.includes("--n8n"));
  const directory = path.resolve(appRoot, "../work/deployment");
  const api = readEnv(path.join(directory, "api.env"));
  const ai = readEnv(path.join(directory, "ai.env"));
  const frontend = readEnv(path.join(directory, "frontend.env"));
  const n8n = readEnv(path.join(directory, "n8n.env"));
  const master = JSON.parse(
    fs.readFileSync(path.join(directory, "secrets.private.json"), "utf8"),
  );
  for (const key of secretNames) {
    if (
      !/^[a-f0-9]{64}$/.test(master[key] ?? "") ||
      (key === "N8N_ENCRYPTION_KEY" ? n8n[key] : api[key]) !== master[key]
    )
      pending.push(key + " consistency");
  }
  if (ai.AI_SERVICE_TOKEN !== api.AI_SERVICE_TOKEN)
    pending.push("AI_SERVICE_TOKEN mismatch");
  if (api.SEED_PASSWORD !== master.SEED_PASSWORD)
    pending.push("SEED_PASSWORD consistency");
  if (
    api.COOKIE_SECURE !== "true" ||
    api.SYNTHETIC_DATA_ONLY !== "true" ||
    ai.SYNTHETIC_DATA_ONLY !== "true"
  )
    pending.push("secure cookie / synthetic-only settings");
  if (
    api.CORS_ORIGIN !== targets.FRONTEND_URL?.replace(/\/$/, "") ||
    api.AI_BASE_URL !== targets.AI_URL?.replace(/\/$/, "") ||
    frontend.API_INTERNAL_URL !== targets.API_URL?.replace(/\/$/, "")
  )
    pending.push("stale exports: rerun setup:deployment");
  if (
    api.DATABASE_URL !== targets.DATABASE_URL ||
    ai.AI_MODE !== targets.AI_MODE ||
    ai.LLM_PROVIDER !== targets.LLM_PROVIDER ||
    ai.LLM_MODEL !== (targets.LLM_MODEL || "") ||
    ai.OLLAMA_BASE_URL !==
      (targets.OLLAMA_BASE_URL || "http://localhost:11434") ||
    ai.GROQ_API_KEY !== (targets.GROQ_API_KEY || "") ||
    ai.GEMINI_API_KEY !== (targets.GEMINI_API_KEY || "")
  )
    pending.push("stale database / provider exports: rerun setup:deployment");
  if (process.argv.includes("--n8n")) {
    if (
      n8n.N8N_EDITOR_BASE_URL !== targets.N8N_URL?.replace(/\/$/, "") ||
      n8n.N8N_WEBHOOK_URL !== targets.N8N_URL?.replace(/\/$/, "") + "/" ||
      n8n.N8N_SECURE_COOKIE !== "true"
    )
      pending.push("stale n8n exports: rerun setup:deployment");
  }
  if (pending.length) {
    console.error(
      "Deployment inputs still needed: " + [...new Set(pending)].join(", "),
    );
    process.exitCode = 2;
  } else
    console.log(
      "Cloud inputs and shared secrets pass local checks. This does not test hosting connectivity or deploy services.",
    );
} catch {
  console.error(
    "Cannot validate deployment files. Run setup:deployment first; no secret values were printed.",
  );
  process.exitCode = 1;
}
