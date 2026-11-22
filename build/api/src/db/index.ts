import pg, { type PoolClient, type QueryResultRow } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
export type Executor = Pick<pg.Pool, "query"> | PoolClient;
export function createPool(url: string): pg.Pool {
  return new pg.Pool({
    connectionString: url,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
}
export async function migrateDatabase(
  pool: pg.Pool,
  folder = fileURLToPath(new URL("../../drizzle", import.meta.url)),
): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: folder });
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
export async function rows<T extends QueryResultRow>(
  db: Executor,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(query, params)).rows;
}
