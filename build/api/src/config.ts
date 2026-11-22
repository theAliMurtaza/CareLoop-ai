import { z } from "zod";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.url().default("http://localhost:3000"),
  SYNTHETIC_DATA_ONLY: z.literal("true").default("true"),
  DATABASE_URL: z.string().startsWith("postgres"),
  FIELD_ENCRYPTION_KEY: hex,
  EMAIL_LOOKUP_KEY: hex,
  JWT_ACCESS_SECRET: hex,
  AI_SERVICE_TOKEN: hex,
  AUTOMATION_WEBHOOK_SECRET: hex,
  AUTOMATION_TOKEN: hex,
  AI_BASE_URL: z.url().default("http://127.0.0.1:8000"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  DEFAULT_CLINIC_ID: z.uuid().default("10000000-0000-4000-8000-000000000001"),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration keys: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  return result.data;
}
