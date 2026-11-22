import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createPool } from "./db/index.js";
import { startWorker } from "./worker.js";
const config = readConfig(process.env);
const pool = createPool(config.DATABASE_URL);
const stopWorker = startWorker(pool, config);
const server = createApp(config, pool).listen(config.PORT, "0.0.0.0", () => {
  console.info(
    `CareLoop API listening on port ${config.PORT} (synthetic only)`,
  );
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopWorker();
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
