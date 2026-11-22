import { prepareDeployment } from "./deployment-config.mjs";
try {
  const result = prepareDeployment();
  console.log(
    "Prepared private cloud environment files in ../work/deployment. Existing cloud keys are preserved; local Compose configuration is unchanged.",
  );
  if (result.pending.length)
    console.log(
      "Fill deployment/.env and rerun setup:deployment: " +
        result.pending.join(", "),
    );
  if (result.n8nPending) console.log("For hosted n8n, also fill N8N_URL.");
  console.log(
    "Do not commit or share the generated files. See ../DEPLOYMENT.md for the handover.",
  );
} catch (error) {
  console.error(
    error instanceof SyntaxError
      ? "Invalid deployment configuration; no secret values were printed."
      : error.message,
  );
  process.exitCode = 1;
}
