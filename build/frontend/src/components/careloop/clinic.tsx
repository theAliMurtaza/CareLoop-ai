"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { api, type Escalation } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  StateBadge,
  useCopy,
} from "./shared";
function Review({ item }: { item: Escalation }) {
  const c = useCopy(),
    cache = useQueryClient();
  const [state, setState] = useState(item.state),
    [note, setNote] = useState(item.note);
  const save = useMutation({
    mutationFn: () =>
      api(`/clinic/escalations/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ state, note }),
      }),
    onSuccess: () =>
      void cache.invalidateQueries({ queryKey: ["escalations"] }),
  });
  return (
    <article className="cl-card cl-review">
      <div className="cl-card-heading">
        <div>
          <span
            className={`cl-badge cl-status-${item.severity === "critical" ? "critical" : "borderline"}`}
          >
            <ShieldCheck size={15} />
            {item.severity === "critical"
              ? c("Priority review", "ترجیحی جائزہ")
              : item.severity === "concerning"
                ? c("Outside reference range", "حوالہ جاتی حد سے باہر")
                : c("Verification needed", "تصدیق ضروری")}
          </span>
          <h2>{item.patient}</h2>
          <p>{item.report}</p>
        </div>
        <StateBadge state={item.state} />
      </div>
      <Link className="cl-link" href={`/reports/${item.reportId}`}>
        {c("Open report and evidence", "رپورٹ اور شواہد کھولیں")}{" "}
        <ArrowUpRight size={16} />
      </Link>
      <form
        className="cl-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label>
          {c("Review status", "جائزے کی حالت")}
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="open">{c("Open", "نیا")}</option>
            <option value="in_review">{c("In review", "جائزہ جاری")}</option>
            <option value="closed">{c("Reviewed", "جائزہ مکمل")}</option>
          </select>
        </label>
        <label>
          {c("Reviewer note", "جائزہ لینے والے کا نوٹ")}
          <textarea
            required={state === "closed"}
            minLength={state === "closed" ? 5 : 0}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {save.isError && <ErrorState error={save.error} />}
        <div className="cl-actions">
          <button className="cl-btn" disabled={save.isPending}>
            {c("Save review", "جائزہ محفوظ کریں")}
          </button>
          {save.isSuccess && (
            <span role="status">{c("Review saved", "جائزہ محفوظ ہو گیا")}</span>
          )}
        </div>
      </form>
    </article>
  );
}
export function Clinic() {
  const c = useCopy(),
    { user } = useAuth();
  const [filter, setFilter] = useState("open");
  const query = useQuery({
    queryKey: ["escalations", filter],
    queryFn: () =>
      api<{ items: Escalation[] }>(`/clinic/escalations?state=${filter}`),
    enabled: user?.role !== "patient",
    refetchInterval: 30000,
  });
  if (user?.role === "patient")
    return (
      <Empty
        title={c("A clinic account is required", "کلینک اکاؤنٹ ضروری ہے")}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow={c(
          "HUMAN REVIEW, AT THE CENTER",
          "انسانی جائزہ بنیادی حیثیت رکھتا ہے",
        )}
        title={c("Clinic review queue", "کلینک جائزے کی فہرست")}
        description={c(
          "Flags come from versioned reference ranges and deterministic rules. A flag is not a diagnosis.",
          "نشانات حوالہ جاتی حدود اور مقررہ اصولوں سے بنتے ہیں۔ نشان تشخیص نہیں ہے۔",
        )}
      />
      <div className="cl-filter">
        <label htmlFor="review-filter">{c("Show", "دکھائیں")}</label>
        <select
          id="review-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["open", "in_review", "closed", "all"].map((state, i) => (
            <option key={state} value={state}>
              {
                [
                  c("Open", "نیا"),
                  c("In review", "جائزہ جاری"),
                  c("Reviewed", "جائزہ مکمل"),
                  c("All", "سب"),
                ][i]
              }
            </option>
          ))}
        </select>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <Empty
          title={c("Your review queue is clear", "جائزے کی فہرست خالی ہے")}
        >
          <p>
            {c(
              "New deterministic flags will appear here.",
              "نئے نشانات یہاں ظاہر ہوں گے۔",
            )}
          </p>
        </Empty>
      ) : (
        <div className="cl-review-grid">
          {query.data.items.map((item) => (
            <Review key={item.id + item.updatedAt} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
