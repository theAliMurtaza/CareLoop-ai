"use client";
import { useLocale } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  TriangleAlert,
  ArrowUp,
  ArrowDown,
  Clock3,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ResultStatus, ResultValue } from "@/lib/api";
export function useCopy() {
  const locale = useLocale();
  return (en: string, ur: string) => (locale === "ur" ? ur : en);
}
export function StatusBadge({ status }: { status: ResultStatus }) {
  const c = useCopy();
  const map = {
    normal: { Icon: CheckCircle2, label: c("Within range", "حد کے اندر") },
    borderline: { Icon: AlertCircle, label: c("Borderline", "سرحدی") },
    high: { Icon: ArrowUp, label: c("High", "زیادہ") },
    low: { Icon: ArrowDown, label: c("Low", "کم") },
    critical: {
      Icon: TriangleAlert,
      label: c("Clinic review needed", "کلینک کا جائزہ ضروری"),
    },
    unclassified: {
      Icon: Clock3,
      label: c("Needs verification", "تصدیق ضروری"),
    },
  };
  const { Icon, label } = map[status];
  return (
    <span className={`cl-badge cl-status-${status}`}>
      <Icon size={15} aria-hidden="true" />
      {label}
    </span>
  );
}
export function StateBadge({ state }: { state: string }) {
  const c = useCopy();
  const labels: Record<string, string> = {
    uploaded: c("Queued", "قطار میں"),
    processing: c("Processing", "تیاری جاری"),
    ready: c("Ready", "تیار"),
    needs_review: c("Needs review", "جائزہ ضروری"),
    failed: c("Processing failed", "تیاری ناکام"),
    open: c("Open", "نیا"),
    in_review: c("In review", "جائزہ جاری"),
    closed: c("Reviewed", "جائزہ مکمل"),
  };
  return (
    <span
      className={`cl-badge ${state === "failed" ? "cl-status-critical" : ""}`}
    >
      <Clock3 size={14} aria-hidden="true" />
      {labels[state] ?? state}
    </span>
  );
}
export function Loading() {
  const c = useCopy();
  return (
    <div className="cl-loading" role="status">
      <RefreshCw className="cl-spin" aria-hidden="true" />
      <span>
        {c("Loading your care space…", "آپ کی معلومات لوڈ ہو رہی ہیں…")}
      </span>
      <div className="skeleton" aria-hidden="true" />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const c = useCopy();
  return (
    <div className="cl-error" role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <strong>
          {c(
            "We couldn’t complete that request.",
            "یہ درخواست مکمل نہیں ہو سکی۔",
          )}
        </strong>
        <p>
          {error instanceof Error
            ? error.message
            : c("Please try again.", "دوبارہ کوشش کریں۔")}
        </p>
        {retry && (
          <button type="button" className="cl-link" onClick={retry}>
            {c("Try again", "دوبارہ کوشش کریں")}
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="cl-empty">
      <FileText size={32} aria-hidden="true" />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="cl-page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function RangeBar({ result }: { result: ResultValue }) {
  const c = useCopy();
  if (!result.range)
    return (
      <p className="cl-muted">
        {c(
          "No applicable reference range. Human verification is needed.",
          "قابل اطلاق حد دستیاب نہیں۔ انسانی تصدیق ضروری ہے۔",
        )}
      </p>
    );
  const { low, high } = result.range;
  const width = high - low || 1;
  const min = Math.min(low - width * 0.5, result.value),
    max = Math.max(high + width * 0.5, result.value);
  const percent = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className="cl-range">
      <div
        className="cl-range-track"
        role="img"
        aria-label={c(
          `Value ${result.value} ${result.unit}; reference range ${low} to ${high}.`,
          `نتیجہ ${result.value} ${result.unit}؛ حوالہ جاتی حد ${low} سے ${high}۔`,
        )}
      >
        <span
          className="cl-range-normal"
          style={{
            left: `${percent(low)}%`,
            width: `${percent(high) - percent(low)}%`,
          }}
        />
        <i
          className={`cl-range-marker cl-marker-${result.status}`}
          style={{
            left: `${Math.max(1, Math.min(99, percent(result.value)))}%`,
          }}
        />
      </div>
      <div className="cl-range-label" dir="ltr">
        <span>{low}</span>
        <span>{c("Synthetic reference range", "فرضی حوالہ جاتی حد")}</span>
        <span>
          {high} {result.unit}
        </span>
      </div>
    </div>
  );
}
export function DoctorNote() {
  const c = useCopy();
  return (
    <p className="cl-doctor-note">
      {c(
        "CareLoop explains recorded results. It never diagnoses, prescribes, or changes medication. Discuss your results with your doctor.",
        "CareLoop درج نتائج کی وضاحت کرتا ہے۔ یہ تشخیص، نسخہ یا دوا میں تبدیلی نہیں کرتا۔ اپنے نتائج پر ڈاکٹر سے بات کریں۔",
      )}
    </p>
  );
}
