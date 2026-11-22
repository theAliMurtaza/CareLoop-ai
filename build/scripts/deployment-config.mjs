import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

export const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const secretNames = [
  "FIELD_ENCRYPTION_KEY",
  "EMAIL_LOOKUP_KEY",
  "JWT_ACCESS_SECRET",
  "AI_SERVICE_TOKEN",
  "AUTOMATION_TOKEN",
  "AUTOMATION_WEBHOOK_SECRET",
  "N8N_ENCRYPTION_KEY",
];
export const readEnv = (file) => parseEnv(fs.readFileSync(file, "utf8"));

export function dotenv(values) {
  return (
    Object.entries(values)
      .map(([key, value]) => {
        const text = String(value);
        if (/[\r\n"\\]/.test(text))
          throw new Error(
            `Unsupported character in ${key}; URL-encode database password characters.`,
          );
        return `${key}="${text}"`;
      })
      .join("\n") + "\n"
  );
}

export function pendingTargets(targets, includeN8n = false) {
  const pending = [];
  for (const key of [
    "API_URL",
    "AI_URL",
    "FRONTEND_URL",
    ...(includeN8n ? ["N8N_URL"] : []),
  ]) {
    try {
      const u = new URL(targets[key]);
      if (
        u.protocol !== "https:" ||
        u.hostname.endsWith(".invalid") ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/"
      )
        throw new Error();
    } catch {
      pending.push(key);
    }
  }
  try {
    const db = new URL(targets.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.hostname ||
      db.hostname.endsWith(".invalid") ||
      !db.password ||
      db.pathname.length < 2 ||
      !["require", "verify-full", "verify-ca"].includes(
        db.searchParams.get("sslmode"),
      )
    )
      throw new Error();
  } catch {
    pending.push("DATABASE_URL (PostgreSQL URI with TLS sslmode)");
  }
  if (!["offline", "live"].includes(targets.AI_MODE)) pending.push("AI_MODE");
  if (targets.AI_MODE === "live") {
    if (!["gemini", "groq", "ollama"].includes(targets.LLM_PROVIDER))
      pending.push("LLM_PROVIDER");
    if (!targets.LLM_MODEL) pending.push("LLM_MODEL");
    if (targets.LLM_PROVIDER === "gemini" && !targets.GEMINI_API_KEY)
      pending.push("GEMINI_API_KEY");
    if (targets.LLM_PROVIDER === "groq" && !targets.GROQ_API_KEY)
      pending.push("GROQ_API_KEY");
    if (targets.LLM_PROVIDER === "ollama" && !targets.OLLAMA_BASE_URL)
      pending.push("OLLAMA_BASE_URL");
  }
  return pending;
}

export function prepareDeployment(root = appRoot) {
  const configFile = path.join(root, "deployment/.env");
  if (!fs.existsSync(configFile))
    fs.copyFileSync(
      path.join(root, "deployment/.env.example"),
      configFile,
      fs.constants.COPYFILE_EXCL,
    );
  const targets = readEnv(configFile);
  const directory = path.resolve(root, "../work/deployment");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const master = path.join(directory, "secrets.private.json");
  let secrets;
  if (fs.existsSync(master)) {
    secrets = JSON.parse(fs.readFileSync(master, "utf8"));
  } else {
    if (
      ["api.env", "ai.env", "n8n.env"].some((name) =>
        fs.existsSync(path.join(directory, name)),
      )
    )
      throw new Error(
        "Deployment secret store is missing but exports exist. Restore secrets.private.json; refusing to rotate encryption keys.",
      );
    secrets = Object.fromEntries(
      secretNames.map((key) => [key, randomBytes(32).toString("hex")]),
    );
    secrets.SEED_PASSWORD = randomBytes(24).toString("base64url");
    fs.writeFileSync(master, JSON.stringify(secrets, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (
    secretNames.some((key) => !/^[a-f0-9]{64}$/.test(secrets[key] ?? "")) ||
    !/^[A-Za-z0-9_-]{24,}$/.test(secrets.SEED_PASSWORD ?? "")
  )
    throw new Error(
      "Invalid deployment secret store; restore its original contents. Values have not been printed.",
    );
  const origin = (value) => String(value ?? "").replace(/\/$/, "");
  const exports = {
    "api.env": {
      NODE_ENV: "production",
      PORT: "4000",
      SYNTHETIC_DATA_ONLY: "true",
      COOKIE_SECURE: "true",
      DATABASE_URL: targets.DATABASE_URL,
      CORS_ORIGIN: origin(targets.FRONTEND_URL),
      AI_BASE_URL: origin(targets.AI_URL),
      ...Object.fromEntries(
        secretNames
          .filter((key) => key !== "N8N_ENCRYPTION_KEY")
          .map((key) => [key, secrets[key]]),
      ),
      SEED_PASSWORD: secrets.SEED_PASSWORD,
    },
    "ai.env": {
      PORT: "8000",
      SYNTHETIC_DATA_ONLY: "true",
      AI_SERVICE_TOKEN: secrets.AI_SERVICE_TOKEN,
      AI_MODE: targets.AI_MODE || "offline",
      LLM_PROVIDER: targets.LLM_PROVIDER || "groq",
      LLM_MODEL: targets.LLM_MODEL || "",
      GROQ_API_KEY: targets.GROQ_API_KEY || "",
      GEMINI_API_KEY: targets.GEMINI_API_KEY || "",
      OLLAMA_BASE_URL: targets.OLLAMA_BASE_URL || "http://localhost:11434",
      LANGFUSE_ENABLED: "false",
      OMP_THREAD_LIMIT: "1",
    },
    "frontend.env": {
      API_INTERNAL_URL: origin(targets.API_URL),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    "n8n.env": {
      PORT: "5678",
      N8N_PORT: "5678",
      N8N_HOST: (() => {
        try {
          return new URL(targets.N8N_URL).hostname;
        } catch {
          return "replace-n8n.invalid";
        }
      })(),
      N8N_PROTOCOL: "https",
      N8N_EDITOR_BASE_URL: origin(targets.N8N_URL),
      N8N_WEBHOOK_URL: origin(targets.N8N_URL) + "/",
      N8N_SECURE_COOKIE: "true",
      N8N_PROXY_HOPS: "1",
      N8N_ENCRYPTION_KEY: secrets.N8N_ENCRYPTION_KEY,
      GENERIC_TIMEZONE: targets.TIMEZONE || "Asia/Karachi",
      TZ: targets.TIMEZONE || "Asia/Karachi",
      N8N_DIAGNOSTICS_ENABLED: "false",
      N8N_PERSONALIZATION_ENABLED: "false",
      N8N_COMMUNITY_PACKAGES_ENABLED: "false",
      N8N_TEMPLATES_ENABLED: "false",
      EXECUTIONS_DATA_SAVE_ON_ERROR: "none",
      EXECUTIONS_DATA_SAVE_ON_SUCCESS: "none",
      EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS: "false",
      EXECUTIONS_DATA_SAVE_ON_PROGRESS: "false",
    },
  };
  for (const [name, values] of Object.entries(exports))
    fs.writeFileSync(path.join(directory, name), dotenv(values), {
      mode: 0o600,
    });
  fs.writeFileSync(
    path.join(directory, "CLOUD-DEMO-ACCOUNTS.txt"),
    `SYNTHETIC CLOUD DEMO ONLY. Keep private.\nAccounts: sarah@example.test, ali@example.test, clinic@example.test, admin@example.test\nPassword: ${secrets.SEED_PASSWORD}\n`,
    { mode: 0o600 },
  );
  return {
    directory,
    pending: pendingTargets(targets),
    n8nPending: pendingTargets(targets, true).includes("N8N_URL"),
  };
}
