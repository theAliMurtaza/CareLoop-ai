import { createPool, migrateDatabase } from "./index.js";
import { readConfig } from "../config.js";
import { seed } from "./seed.js";
const config = readConfig(process.env);
const pool = createPool(config.DATABASE_URL);
try {
  await migrateDatabase(pool);
  if (process.argv.includes("--seed")) await seed(pool, config);
  console.log("CareLoop database is ready (synthetic only).");
} catch {
  console.error(
    "Database setup failed. Check connectivity, configuration and migration compatibility. No secrets were logged.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
