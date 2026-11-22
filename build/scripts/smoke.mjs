const checks = [
  ["frontend", process.env.FRONTEND_URL ?? "http://localhost:3000", false],
  ["api", `${process.env.API_URL ?? "http://localhost:4000"}/health`, true],
  ["ai", `${process.env.AI_URL ?? "http://localhost:8000"}/health`, true],
];
let failed = false;
for (const [name, url, json] of checks) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (json && (await response.json()).status !== "ok")
      throw new Error("Invalid health response");
    if (!json && !(await response.text()).includes("CareLoop"))
      throw new Error("Missing page content");
    console.log(`PASS ${name}`);
  } catch (error) {
    failed = true;
    console.error(
      `FAIL ${name}: ${error instanceof Error ? error.message : "unavailable"}`,
    );
  }
}
process.exitCode = failed ? 1 : 0;
