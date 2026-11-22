export type Status =
  "normal" | "borderline" | "high" | "low" | "critical" | "unclassified";
export interface Range {
  id: string;
  test_code: string;
  label: string;
  unit: string;
  low: number;
  high: number;
  borderline_low: number | null;
  borderline_high: number | null;
  critical_low: number | null;
  critical_high: number | null;
  age_min: number;
  age_max: number;
  sex: "any" | "female" | "male";
  verification: "draft" | "synthetic_only" | "verified";
  version: number;
  source_url: string;
  source_label: string;
}
export interface Observation {
  testCode: string;
  value: number;
  unit: string;
  comparator?: "=" | "<" | ">" | "<=" | ">=";
  evidence: string;
  confidence: number;
}
export interface Classification {
  status: Status;
  escalation: "none" | "review" | "concerning" | "critical";
  reason: string;
  range: Range | null;
}
export function classify(
  observation: Observation,
  ranges: Range[],
  context: { age: number | null; sex: string; synthetic: boolean },
): Classification {
  const unknown = (reason: string): Classification => ({
    status: "unclassified",
    escalation: "review",
    reason,
    range: null,
  });
  if (
    !Number.isFinite(observation.value) ||
    !Number.isFinite(observation.confidence) ||
    observation.confidence > 1 ||
    observation.confidence < 0.9 ||
    !observation.evidence.trim()
  )
    return unknown("Uncertain or missing extracted evidence");
  if (observation.comparator && observation.comparator !== "=")
    return unknown("Censored results require human review");
  const age = context.age;
  if (age === null || !Number.isFinite(age) || age < 0)
    return unknown("Age context is required");
  const matches = ranges.filter(
    (r) =>
      r.test_code === observation.testCode &&
      r.unit === observation.unit &&
      age >= r.age_min &&
      age <= r.age_max &&
      (r.sex === "any" || r.sex === context.sex) &&
      (r.verification === "verified" ||
        (context.synthetic && r.verification === "synthetic_only")),
  );
  if (matches.length !== 1)
    return unknown(
      matches.length
        ? "Ambiguous reference range"
        : "No applicable reviewed reference range",
    );
  const r = matches[0]!;
  const fields = [
    r.low,
    r.high,
    r.borderline_low,
    r.borderline_high,
    r.critical_low,
    r.critical_high,
  ].filter((v): v is number => v !== null);
  if (
    fields.some((v) => !Number.isFinite(v)) ||
    r.low > r.high ||
    (r.borderline_low !== null && r.borderline_low > r.low) ||
    (r.borderline_high !== null && r.borderline_high < r.high) ||
    (r.critical_low !== null &&
      r.critical_low >= (r.borderline_low ?? r.low)) ||
    (r.critical_high !== null &&
      r.critical_high <= (r.borderline_high ?? r.high))
  )
    return unknown("Invalid reference range");
  const v = observation.value;
  let status: Status;
  if (
    (r.critical_low !== null && v <= r.critical_low) ||
    (r.critical_high !== null && v >= r.critical_high)
  )
    status = "critical";
  else if (v >= r.low && v <= r.high) status = "normal";
  else if (
    (v < r.low && r.borderline_low !== null && v >= r.borderline_low) ||
    (v > r.high && r.borderline_high !== null && v <= r.borderline_high)
  )
    status = "borderline";
  else status = v < r.low ? "low" : "high";
  return {
    status,
    escalation:
      status === "critical"
        ? "critical"
        : status === "high" || status === "low"
          ? "concerning"
          : "none",
    reason:
      r.verification === "synthetic_only"
        ? "Synthetic demonstration thresholds; not clinical advice"
        : "Compared with the applicable reviewed range",
    range: r,
  };
}
