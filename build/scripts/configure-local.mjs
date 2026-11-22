import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".env");
const env = fs.existsSync(target)
  ? parseEnv(fs.readFileSync(target, "utf8"))
  : {};
for (const name of [
  "POSTGRES_PASSWORD",
  "FIELD_ENCRYPTION_KEY",
  "EMAIL_LOOKUP_KEY",
  "JWT_ACCESS_SECRET",
  "AI_SERVICE_TOKEN",
  "AUTOMATION_WEBHOOK_SECRET",
  "AUTOMATION_TOKEN",
  "N8N_ENCRYPTION_KEY",
])
  if (!env[name] || env[name] === "GENERATE_LOCALLY")
    env[name] = randomBytes(32).toString("hex");
if (!env.SEED_PASSWORD || env.SEED_PASSWORD === "GENERATE_LOCALLY")
  env.SEED_PASSWORD = randomBytes(18).toString("base64url");
Object.assign(env, {
  POSTGRES_USER: env.POSTGRES_USER ?? "careloop",
  POSTGRES_DB: env.POSTGRES_DB ?? "careloop",
  POSTGRES_PORT: env.POSTGRES_PORT ?? "55432",
  SYNTHETIC_DATA_ONLY: "true",
  AI_MODE: env.AI_MODE ?? "offline",
  LLM_PROVIDER: env.LLM_PROVIDER ?? "ollama",
  LLM_MODEL: env.LLM_MODEL ?? "llama3.2:3b",
  TIMEZONE: env.TIMEZONE ?? "Asia/Karachi",
});
const write = (file, values) =>
  fs.writeFileSync(
    file,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
write(target, env);
const common = {
  SYNTHETIC_DATA_ONLY: "true",
  FIELD_ENCRYPTION_KEY: env.FIELD_ENCRYPTION_KEY,
  EMAIL_LOOKUP_KEY: env.EMAIL_LOOKUP_KEY,
  JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
  AI_SERVICE_TOKEN: env.AI_SERVICE_TOKEN,
  AUTOMATION_TOKEN: env.AUTOMATION_TOKEN,
  AUTOMATION_WEBHOOK_SECRET: env.AUTOMATION_WEBHOOK_SECRET,
};
for (const [service, values] of Object.entries({
  api: {
    ...common,
    NODE_ENV: "development",
    PORT: "4000",
    CORS_ORIGIN: "http://localhost:3000",
    COOKIE_SECURE: "false",
    DATABASE_URL: `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@127.0.0.1:${env.POSTGRES_PORT}/${env.POSTGRES_DB}`,
    AI_BASE_URL: "http://127.0.0.1:8000",
    SEED_PASSWORD: env.SEED_PASSWORD,
  },
  ai: {
    SYNTHETIC_DATA_ONLY: "true",
    AI_SERVICE_TOKEN: env.AI_SERVICE_TOKEN,
    AI_MODE: env.AI_MODE,
    LLM_PROVIDER: env.LLM_PROVIDER,
    LLM_MODEL: env.LLM_MODEL,
    OLLAMA_BASE_URL: "http://localhost:11434",
    GEMINI_API_KEY: env.GEMINI_API_KEY ?? "",
    GROQ_API_KEY: env.GROQ_API_KEY ?? "",
    LANGFUSE_ENABLED: "false",
  },
  frontend: {
    NEXT_TELEMETRY_DISABLED: "1",
    API_INTERNAL_URL: "http://127.0.0.1:4000",
    NEXT_SWC_PATH: path.resolve(root, "../work/next-swc"),
  },
})) {
  const file = path.join(root, service, ".env");
  const existing = fs.existsSync(file)
    ? parseEnv(fs.readFileSync(file, "utf8"))
    : {};
  write(file, {
    ...values,
    ...existing,
    ...(service === "api"
      ? common
      : service === "ai"
        ? { AI_SERVICE_TOKEN: env.AI_SERVICE_TOKEN }
        : {}),
  });
}
const credentials = path.resolve(root, "../work/LOCAL-DEMO-ACCOUNTS.txt");
fs.mkdirSync(path.dirname(credentials), { recursive: true });
fs.writeFileSync(
  credentials,
  `LOCAL SYNTHETIC DEMO ONLY. Keep this file private.\nAccounts: sarah@example.test, ali@example.test, clinic@example.test, admin@example.test\nPassword: ${env.SEED_PASSWORD}\n`,
  { mode: 0o600 },
);
console.log(
  "Local configuration created without printing secret values. Demo login details are in ../work/LOCAL-DEMO-ACCOUNTS.txt. Existing non-secret service overrides are retained.",
);
