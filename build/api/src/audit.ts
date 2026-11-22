import type { Executor } from "./db/index.js";
import type { Actor } from "./types.js";
export async function audit(
  db: Executor,
  actor: Actor | null,
  patient: string | null,
  action: string,
  resource: string | null,
  outcome: "allowed" | "denied" | "error" = "allowed",
): Promise<void> {
  await db.query(
    "INSERT INTO audit_logs(actor_id,patient_id,action,resource_id,outcome) VALUES($1,$2,$3,$4,$5)",
    [actor?.id ?? null, patient, action, resource, outcome],
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public publicMessage: string,
  ) {
    super(code);
  }
}
export function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new HttpError(
      404,
      "NOT_FOUND",
      "The requested record is unavailable.",
    );
  return value;
}
