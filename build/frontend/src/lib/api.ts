export interface User {
  id: string;
  role: "patient" | "clinic" | "admin";
  clinicId: string | null;
}
export interface Profile {
  displayName: string;
  age: number | null;
  sex: "female" | "male" | "unspecified";
  locale: "en" | "ur";
  timezone: string;
}
export interface Report {
  id: string;
  title: string;
  collectedAt: string;
  state: string;
  stage: string;
  errorCode: string | null;
  createdAt: string;
}
export interface Range {
  id: string;
  low: number;
  high: number;
  unit: string;
  source_url: string;
  source_label: string;
  verification: string;
  version: number;
}
export type ResultStatus =
  "normal" | "borderline" | "high" | "low" | "critical" | "unclassified";
export interface ResultValue {
  id: string;
  label: string;
  testCode: string;
  value: number;
  unit: string;
  status: ResultStatus;
  reason: string;
  range: Range | null;
  evidence: string;
  confidence: number;
}
export interface Explanation {
  whatThisMeans: string;
  whatCanAffectIt: string;
  questionsToAsk: string;
  doctorPointer: string;
  sources: { id: string; source: string }[];
  mode: string;
}
export interface ReportDetail extends Report {
  values: ResultValue[];
  explanation: Explanation | null;
}
export interface Medication {
  id: string;
  name: string;
  instructions: string;
  active: boolean;
}
export interface Reminder {
  id: string;
  title: string;
  dueAt: string;
  intervalMinutes: number | null;
  medicationId: string | null;
  active: boolean;
}
export interface FollowUp {
  id: string;
  title: string;
  notes: string;
  dueAt: string;
  completed: boolean;
}
export interface TrendPoint extends ResultValue {
  reportId: string;
  date: string;
}
export interface Escalation {
  id: string;
  reportId: string;
  patientId: string;
  patient: string;
  report: string;
  severity: string;
  state: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}
let token: string | null = null;
let refreshPromise: Promise<{ accessToken: string; user: User }> | null = null;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function setAccessToken(value: string | null) {
  token = value;
}
export async function refreshSession() {
  if (!refreshPromise)
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CareLoop-Client": "web" },
    })
      .then(async (r) => {
        if (!r.ok)
          throw new ApiError(r.status, "UNAUTHORIZED", "Please sign in.");
        const data = (await r.json()) as { accessToken: string; user: User };
        token = data.accessToken;
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-CareLoop-Client", "web");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      await refreshSession();
      return api<T>(path, options, false);
    } catch {
      token = null;
      window.dispatchEvent(new Event("careloop:expired"));
    }
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      response.status,
      data.error?.code ?? "REQUEST_FAILED",
      data.error?.message ?? "The request could not be completed.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}
