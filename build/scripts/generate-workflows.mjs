import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const dir = new URL("../automation/workflows/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [index, kind] of [
  "medication",
  "follow-up",
  "escalation",
  "weekly",
].entries()) {
  const schedule = {
    id: randomUUID(),
    name: "Schedule",
    type: "n8n-nodes-base.scheduleTrigger",
    typeVersion: 1.2,
    position: [0, 0],
    parameters: {
      rule: {
        interval: [
          kind === "weekly"
            ? { field: "cronExpression", expression: "0 9 * * 1" }
            : {
                field: "minutes",
                minutesInterval: kind === "follow-up" ? 15 : 1,
              },
        ],
      },
    },
  };
  const manual = {
    id: randomUUID(),
    name: "Manual test",
    type: "n8n-nodes-base.manualTrigger",
    typeVersion: 1,
    position: [0, 180],
    parameters: {},
  };
  const request = {
    id: randomUUID(),
    name: "Create private inbox notifications",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [300, 0],
    parameters: {
      method: "POST",
      url: "http://api:4000/api/automation/tick",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendBody: true,
      specifyBody: "json",
      jsonBody: JSON.stringify({ kind }),
      options: { timeout: 30000 },
    },
    credentials: {
      httpHeaderAuth: {
        id: "careloop-api-auth",
        name: "CareLoop API automation",
      },
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
  };
  const nodes = [schedule, manual, request];
  const connections = {
    Schedule: { main: [[{ node: request.name, type: "main", index: 0 }]] },
    "Manual test": { main: [[{ node: request.name, type: "main", index: 0 }]] },
  };
  if (kind === "escalation") {
    nodes.push({
      id: randomUUID(),
      name: "Secured clinic webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 360],
      webhookId: "careloop-clinic-review",
      parameters: {
        httpMethod: "POST",
        path: "careloop-clinic-review",
        authentication: "headerAuth",
        responseMode: "lastNode",
        options: {},
      },
      credentials: {
        httpHeaderAuth: {
          id: "careloop-webhook-auth",
          name: "CareLoop clinic webhook",
        },
      },
    });
    connections["Secured clinic webhook"] = {
      main: [[{ node: request.name, type: "main", index: 0 }]],
    };
  }
  const workflow = {
    id: `careloop${index + 1}demo`,
    name: `CareLoop · ${kind}`,
    active: false,
    nodes,
    connections,
    settings: {
      executionOrder: "v1",
      timezone: "Asia/Karachi",
      saveDataErrorExecution: "none",
      saveDataSuccessExecution: "none",
      saveManualExecutions: false,
      executionTimeout: 120,
    },
    tags: [],
    versionId: randomUUID(),
  };
  writeFileSync(
    new URL(`${kind}.json`, dir),
    JSON.stringify(workflow, null, 2) + "\n",
  );
}
console.log("Four inactive workflows exported; no secrets included.");
