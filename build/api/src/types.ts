import type { Classification, Observation } from "./status.js";
export interface Actor {
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
export interface ReportMeta {
  title: string;
  collectedAt: string;
  synthetic: true;
}
export interface ResultValue extends Observation, Classification {
  id: string;
  label: string;
}
export interface Explanation {
  whatThisMeans: string;
  whatCanAffectIt: string;
  questionsToAsk: string;
  doctorPointer: string;
  sources: { id: string; source: string }[];
  mode: string;
}
declare global {
  namespace Express {
    interface Request {
      actor?: Actor;
      rawBody?: Buffer;
    }
  }
}
