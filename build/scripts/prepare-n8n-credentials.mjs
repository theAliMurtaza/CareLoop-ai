// Write a private credential import outside the source tree; never print values.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = parseEnv(fs.readFileSync(path.join(root, ".env"), "utf8"));
if (!env.AUTOMATION_TOKEN || !env.AUTOMATION_WEBHOOK_SECRET)
  throw new Error("Run npm run setup:env first.");
const output = path.resolve(root, "../work/n8n-credentials.private.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  JSON.stringify([
    {
      id: "careloop-api-auth",
      name: "CareLoop API automation",
      type: "httpHeaderAuth",
      data: { name: "Authorization", value: `Bearer ${env.AUTOMATION_TOKEN}` },
    },
    {
      id: "careloop-webhook-auth",
      name: "CareLoop clinic webhook",
      type: "httpHeaderAuth",
      data: {
        name: "X-CareLoop-Webhook",
        value: env.AUTOMATION_WEBHOOK_SECRET,
      },
    },
  ]),
  { mode: 0o600 },
);
console.log(
  "Private n8n credential import written to ../work/n8n-credentials.private.json. Delete after import.",
);
