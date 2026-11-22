import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { appRoot, readEnv } from "./deployment-config.mjs";
const repo = path.resolve(appRoot, "..");
try {
  const actualRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
  if (path.resolve(actualRoot).toLowerCase() !== repo.toLowerCase())
    throw new Error("Run this check in the D:/CareLoop repository layout.");
  const names = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repo, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
  const secrets = [];
  for (const file of [
    ".env",
    "api/.env",
    "ai/.env",
    "frontend/.env",
    "deployment/.env",
  ]) {
    const full = path.join(appRoot, file);
    if (fs.existsSync(full))
      for (const [key, value] of Object.entries(readEnv(full)))
        if (
          /(KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL)/.test(key) &&
          value.length >= 12 &&
          !value.includes("REPLACE") &&
          value !== "GENERATE_LOCALLY"
        )
          secrets.push(value);
  }
  const master = path.join(repo, "work/deployment/secrets.private.json");
  if (fs.existsSync(master))
    secrets.push(...Object.values(JSON.parse(fs.readFileSync(master, "utf8"))));
  const failures = new Set();
  for (const name of new Set(names)) {
    const base = path.basename(name);
    if (
      name.startsWith("work/") ||
      /(^|\/)(node_modules|\.next|\.venv|uploads)\//.test(name) ||
      (base.startsWith(".env") && base !== ".env.example") ||
      base.endsWith(".env") ||
      base.endsWith(".private.json") ||
      /(?:LOCAL|CLOUD)-DEMO-ACCOUNTS\.txt$/.test(base)
    )
      failures.add(name);
    const full = path.join(repo, name);
    if (!fs.existsSync(full) || !fs.lstatSync(full).isFile()) continue;
    const contents = fs.readFileSync(full);
    if (
      secrets.some((secret) => contents.includes(Buffer.from(secret))) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
        contents.toString("utf8"),
      )
    )
      failures.add(name);
  }
  if (failures.size) {
    console.error(
      "Do not push. Review these paths (contents withheld):\n" +
        [...failures].join("\n"),
    );
    process.exitCode = 1;
  } else
    console.log(
      `Git candidate scan passed for ${new Set(names).size} files: no known local/cloud secret values or excluded private paths. This is not a comprehensive third-party secret scanner. Nothing was staged or pushed.`,
    );
} catch {
  console.error(
    "Git preparation check could not finish. Check the repository layout and configuration syntax. No secret values were printed.",
  );
  process.exitCode = 1;
}
