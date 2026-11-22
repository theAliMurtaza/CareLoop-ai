import fs from "node:fs";
import { parseEnv, promisify } from "node:util";
import { execFile } from "node:child_process";
import assert from "node:assert/strict";
const env = parseEnv(fs.readFileSync(".env", "utf8"));
const runCommand = promisify(execFile);
let token = "";
let stage = "create synthetic fixtures";
async function call(path, method = "GET", body) {
  const r = await fetch("http://localhost:4000/api" + path, {
    method,
    headers: {
      "X-CareLoop-Client": "web",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw Error(`Automation check HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
const patient = await call("/auth/login", "POST", {
  email: "sarah@example.test",
  password: env.SEED_PASSWORD,
});
token = patient.accessToken;
const reminder = await call("/reminders", "POST", {
  title: "Synthetic automation verification",
  dueAt: new Date(Date.now() - 60000).toISOString(),
});
const followup = await call("/follow-ups", "POST", {
  title: "Synthetic automation verification",
  notes: "Generated test fixture",
  dueAt: new Date(Date.now() - 60000).toISOString(),
});
try {
  for (const [index, kind] of [
    "medication",
    "follow-up",
    "escalation",
    "weekly",
  ].entries()) {
    stage = `${kind} workflow execution`;
    // Keep n8n's execution metadata and internal tokens out of console output.
    // Keep the event loop free so HTTP keep-alive sockets can expire normally
    // while the n8n CLI starts and runs each workflow.
    const { stdout: output } = await runCommand(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "-e",
        "N8N_RUNNERS_BROKER_PORT=5680",
        "n8n",
        "n8n",
        "execute",
        `--id=careloop${index + 1}demo`,
      ],
      { encoding: "utf8", timeout: 120000, windowsHide: true },
    );
    assert.ok(output.includes("Execution was successful:"));
    console.log(`${kind} n8n workflow: passed`);
  }
  stage = "patient inbox verification";
  const inbox = await call("/notifications");
  for (const kind of ["medication", "follow-up", "weekly"])
    assert.ok(inbox.items.some((item) => item.kind === kind));
  stage = "clinic authentication";
  const staff = await call("/auth/login", "POST", {
    email: "clinic@example.test",
    password: env.SEED_PASSWORD,
  });
  token = staff.accessToken;
  stage = "clinic inbox verification";
  assert.ok(
    (await call("/notifications")).items.some(
      (item) => item.kind === "escalation",
    ),
  );
  console.log(
    "Patient reminders, weekly summary, and clinic inbox delivery: passed",
  );
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Automation check")
      ? error.message
      : `Automation validation failed at ${stage} (${error instanceof Error ? error.name : "unknown error"}); inspect local n8n configuration.`,
  );
  process.exitCode = 1;
} finally {
  token = patient.accessToken;
  await call("/reminders/" + reminder.id, "DELETE");
  await call("/follow-ups/" + followup.id, "DELETE");
}
