"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UploadCloud,
  FileText,
  Check,
  MessageCircle,
  Send,
  ShieldCheck,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { api, type Report, type ReportDetail as Detail } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  RangeBar,
  StateBadge,
  StatusBadge,
  useCopy,
} from "./shared";
export function Reports() {
  const c = useCopy();
  const query = useQuery({
    queryKey: ["reports"],
    queryFn: () => api<{ reports: Report[] }>("/reports"),
  });
  return (
    <>
      <PageHeading
        eyebrow={c("YOUR HEALTH LIBRARY", "آپ کی صحت کی لائبریری")}
        title={c("My reports", "میری رپورٹس")}
        description={c(
          "A clearer view of your results, one report at a time.",
          "ہر رپورٹ کے ساتھ اپنے نتائج کو بہتر سمجھیں۔",
        )}
        action={
          <Link className="cl-btn" href="/upload">
            <UploadCloud size={18} />
            {c("Upload report", "رپورٹ اپ لوڈ کریں")}
          </Link>
        }
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.reports.length ? (
        <Empty
          title={c(
            "Your first report belongs here.",
            "آپ کی پہلی رپورٹ کی جگہ۔",
          )}
        >
          <p>
            {c(
              "Upload a synthetic PDF or photo to begin.",
              "شروع کرنے کے لیے فرضی پی ڈی ایف یا تصویر اپ لوڈ کریں۔",
            )}
          </p>
          <Link className="cl-btn" href="/upload">
            {c("Add a report", "رپورٹ شامل کریں")}
          </Link>
        </Empty>
      ) : (
        <div className="cl-report-grid">
          {query.data.reports.map((report) => (
            <Link
              className="cl-card cl-report-tile"
              key={report.id}
              href={`/reports/${report.id}`}
            >
              <div className="cl-card-top">
                <span className="cl-soft-icon">
                  <FileText />
                </span>
                <StateBadge state={report.state} />
              </div>
              <h2>{report.title}</h2>
              <p className="cl-muted" dir="ltr">
                {report.collectedAt}
              </p>
              <span className="cl-link">
                {c("Open report", "رپورٹ کھولیں")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function Upload() {
  const c = useCopy(),
    router = useRouter(),
    cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState<unknown>(null);
  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      api<{ id: string }>("/reports", { method: "POST", body: data }),
    onSuccess: (data) => {
      void cache.invalidateQueries({ queryKey: ["reports"] });
      router.push(`/reports/${data.id}`);
    },
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file || !confirmed) return;
    const data = new FormData();
    data.append("file", file);
    data.append("title", title);
    data.append("collectedAt", date);
    data.append("synthetic", "true");
    try {
      await mutation.mutateAsync(data);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow={c("A SMALL STEP TOWARD CLARITY", "بہتر سمجھ کی طرف ایک قدم")}
        title={c("Bring your report.", "اپنی رپورٹ لائیں۔")}
        description={c(
          "Upload a synthetic PDF or a clear photo. We’ll extract the values for review.",
          "فرضی پی ڈی ایف یا صاف تصویر اپ لوڈ کریں۔ ہم جائزے کے لیے نتائج نکالیں گے۔",
        )}
      />
      <div className="cl-upload-grid">
        <form className="cl-card cl-form" onSubmit={(e) => void submit(e)}>
          <label className="cl-dropzone">
            <UploadCloud size={42} aria-hidden="true" />
            <strong>
              {file
                ? file.name
                : c("Choose your lab report", "اپنی لیب رپورٹ منتخب کریں")}
            </strong>
            <span>
              {c(
                "PDF, PNG or JPEG · Up to 10 MB",
                "پی ڈی ایف، پی این جی یا جے پی ای جی · زیادہ سے زیادہ 10 ایم بی",
              )}
            </span>
            <input
              aria-label={c("Choose report file", "رپورٹ کی فائل منتخب کریں")}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              required
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                if (selected && selected.size > 10 * 1024 * 1024) {
                  setError(
                    new Error(
                      c(
                        "Maximum file size is 10 MB.",
                        "فائل زیادہ سے زیادہ 10 ایم بی ہو سکتی ہے۔",
                      ),
                    ),
                  );
                  setFile(null);
                  e.target.value = "";
                  return;
                }
                setFile(selected);
                setError(null);
              }}
            />
          </label>
          <label>
            {c("Report title", "رپورٹ کا عنوان")}
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={c(
                "e.g. Synthetic wellness panel",
                "مثلاً فرضی صحت کے ٹیسٹ",
              )}
            />
          </label>
          <label>
            {c("Sample collection date", "نمونہ لینے کی تاریخ")}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="cl-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            {c(
              "I confirm this file contains synthetic data only.",
              "میں تصدیق کرتا ہوں کہ اس فائل میں صرف فرضی ڈیٹا ہے۔",
            )}
          </label>
          {error !== null && <ErrorState error={error} />}
          <button
            disabled={!file || !confirmed || mutation.isPending}
            className="cl-btn"
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle className="cl-spin" size={18} />
                {c("Uploading…", "اپ لوڈ جاری…")}
              </>
            ) : (
              c("Upload and review", "اپ لوڈ کریں اور جائزہ لیں")
            )}
          </button>
        </form>
        <aside className="cl-card cl-upload-tips">
          <ShieldCheck size={30} />
          <h2>{c("A little preparation helps.", "تھوڑی تیاری مددگار ہے۔")}</h2>
          <ul>
            <li>
              {c(
                "Keep the whole page visible and text in focus.",
                "پورا صفحہ نظر آئے اور متن صاف ہو۔",
              )}
            </li>
            <li>
              {c(
                "Include the test name, value, and unit.",
                "ٹیسٹ کا نام، نتیجہ اور اکائی شامل ہوں۔",
              )}
            </li>
            <li>
              {c(
                "Use the supplied synthetic fixtures while testing.",
                "جانچ کے لیے فراہم کردہ فرضی فائلیں استعمال کریں۔",
              )}
            </li>
            <li>
              {c(
                "Always check extracted values against the original report.",
                "نکالے گئے نتائج کو اصل رپورٹ سے ضرور ملائیں۔",
              )}
            </li>
          </ul>
          <p className="cl-muted">
            {c(
              "Unknown tests, ambiguous values, and missing reference context are sent for human verification.",
              "نامعلوم ٹیسٹ، مبہم نتائج اور نامکمل حوالہ جاتی معلومات انسانی تصدیق کے لیے بھیجے جاتے ہیں۔",
            )}
          </p>
        </aside>
      </div>
    </>
  );
}
function Processing({ report, retry }: { report: Detail; retry: () => void }) {
  const c = useCopy();
  const steps = [
    { id: "queued", label: c("Received", "موصول") },
    { id: "extracting", label: c("Reading report", "رپورٹ پڑھی جا رہی ہے") },
    { id: "classifying", label: c("Checking ranges", "حدود کی جانچ") },
    { id: "explaining", label: c("Preparing explanation", "وضاحت کی تیاری") },
    { id: "complete", label: c("Ready to review", "جائزے کے لیے تیار") },
  ];
  const active = steps.findIndex((s) => s.id === report.stage);
  return (
    <section className="cl-card">
      <h2>
        {c("Your report is taking shape.", "آپ کی رپورٹ تیار ہو رہی ہے۔")}
      </h2>
      <ol className="cl-stepper cl-processing" aria-live="polite">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={i <= active ? "complete" : ""}
            aria-current={i === active ? "step" : undefined}
          >
            <span>{i < active ? <Check size={17} /> : i + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>
      {report.state === "failed" ? (
        <>
          <ErrorState
            error={
              new Error(
                c(
                  "Processing could not finish. Check the file and AI service, then retry.",
                  "تیاری مکمل نہیں ہو سکی۔ فائل اور اے آئی خدمت کی جانچ کر کے دوبارہ کوشش کریں۔",
                ),
              )
            }
          />
          <button className="cl-btn" onClick={retry}>
            {c("Retry processing", "دوبارہ تیاری کریں")}
          </button>
        </>
      ) : (
        <p className="cl-muted">
          {c(
            "You can leave this page and come back. We’ll keep processing your synthetic report.",
            "آپ واپس آ سکتے ہیں۔ فرضی رپورٹ کی تیاری جاری رہے گی۔",
          )}
        </p>
      )}
    </section>
  );
}
function ReportChat({ reportId }: { reportId: string }) {
  const c = useCopy(),
    locale = useLocale(),
    cache = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["chat", reportId],
    queryFn: () =>
      api<{ messages: { id: string; role: string; content: string }[] }>(
        `/reports/${reportId}/chat`,
      ),
  });
  const send = useMutation({
    mutationFn: () =>
      api<{ answer: string }>(`/reports/${reportId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, locale }),
      }),
    onSuccess: () => {
      setMessage("");
      void cache.invalidateQueries({ queryKey: ["chat", reportId] });
    },
  });
  return (
    <aside className="cl-card cl-chat">
      <h2>
        <MessageCircle size={21} />
        {c("Ask about this report", "اس رپورٹ کے بارے میں پوچھیں")}
      </h2>
      <p className="cl-muted">
        {c(
          "Answers stay within this report and reviewed sources.",
          "جوابات اسی رپورٹ اور جانچے گئے ذرائع تک محدود ہیں۔",
        )}
      </p>
      <div className="cl-chat-messages" aria-live="polite">
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : query.data?.messages.length ? (
          query.data.messages.map((item) => (
            <div
              key={item.id}
              className={`cl-chat-bubble cl-chat-${item.role}`}
            >
              <strong>
                {item.role === "user" ? c("You", "آپ") : "CareLoop"}
              </strong>
              <p>{item.content}</p>
            </div>
          ))
        ) : (
          <p className="cl-chat-empty">
            {c(
              "Try “What does my glucose result say?”",
              "مثلاً پوچھیں: میری glucose رپورٹ کیا کہتی ہے؟",
            )}
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <label className="cl-sr-only" htmlFor="report-question">
          {c("Your question", "آپ کا سوال")}
        </label>
        <textarea
          id="report-question"
          maxLength={1000}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={c("Ask a question…", "سوال پوچھیں…")}
        />
        <button className="cl-btn" disabled={send.isPending || !message.trim()}>
          <Send size={16} />
          {send.isPending
            ? c("Thinking…", "جواب تیار ہو رہا ہے…")
            : c("Send question", "سوال بھیجیں")}
        </button>
      </form>
      {send.error && <ErrorState error={send.error} />}
    </aside>
  );
}
export function ReportDetail({ id }: { id: string }) {
  const c = useCopy(),
    locale = useLocale(),
    router = useRouter(),
    cache = useQueryClient(),
    { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useQuery({
    queryKey: ["report", id, locale],
    queryFn: () => api<Detail>(`/reports/${id}?locale=${locale}`),
    refetchInterval: (q) =>
      ["uploaded", "processing"].includes(q.state.data?.state ?? "")
        ? 2000
        : false,
  });
  const retry = useMutation({
    mutationFn: () => api(`/reports/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      void query.refetch();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/reports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["reports"] });
      void cache.invalidateQueries({ queryKey: ["trends"] });
      router.push("/reports");
    },
  });
  if (query.isLoading) return <Loading />;
  if (query.error || !query.data)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const report = query.data;
  const ready = ["ready", "needs_review"].includes(report.state);
  return (
    <>
      <Link
        className="cl-link"
        href={user?.role === "patient" ? "/reports" : "/clinic"}
      >
        {c("Back to your workspace", "اپنی جگہ پر واپس جائیں")}
      </Link>
      <PageHeading
        title={report.title}
        description={c(
          `Collected ${report.collectedAt} · Synthetic report`,
          `نمونہ ${report.collectedAt} · فرضی رپورٹ`,
        )}
        action={<StateBadge state={report.state} />}
      />
      {!ready ? (
        <Processing report={report} retry={() => retry.mutate()} />
      ) : (
        <div className="cl-detail-grid">
          <div>
            <section className="cl-card">
              <div className="cl-card-top">
                <h2>
                  {c("Your results, clearly", "آپ کے نتائج، واضح انداز میں")}
                </h2>
                <span className="cl-tag">
                  {c("Demo ranges", "نمائشی حدود")}
                </span>
              </div>
              <div className="cl-notice">
                <ShieldCheck size={20} />
                <p>
                  {c(
                    "These reference ranges are synthetic fixtures awaiting source verification. Always verify extracted values against the original report.",
                    "یہ حوالہ جاتی حدود فرضی نمونے ہیں جن کے ذرائع کی تصدیق باقی ہے۔ نتائج کو اصل رپورٹ سے ضرور ملائیں۔",
                  )}
                </p>
              </div>
              {!report.values.length ? (
                <Empty
                  title={c(
                    "No values could be verified.",
                    "کوئی نتیجہ تصدیق نہیں ہو سکا۔",
                  )}
                >
                  <p>
                    {c(
                      "The report is in the human-review queue.",
                      "رپورٹ انسانی جائزے کی قطار میں ہے۔",
                    )}
                  </p>
                </Empty>
              ) : (
                report.values.map((value) => (
                  <article className="cl-result" key={value.id}>
                    <div className="cl-result-top">
                      <div>
                        <h3>{value.label}</h3>
                        <p className="cl-result-number" dir="ltr">
                          {value.value} <small>{value.unit}</small>
                        </p>
                      </div>
                      <StatusBadge status={value.status} />
                    </div>
                    <RangeBar result={value} />
                    <details>
                      <summary>
                        {c("Understand this result", "یہ نتیجہ سمجھیں")}
                      </summary>
                      <p>{value.reason}</p>
                      <p>
                        <strong>
                          {c("Extracted evidence: ", "نکالا گیا متن: ")}
                        </strong>
                        <bdi>{value.evidence}</bdi>
                      </p>
                      {value.range && (
                        <p>
                          <strong>{c("Range source: ", "حد کا ماخذ: ")}</strong>
                          <a
                            className="cl-link"
                            href={value.range.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {value.range.source_label}
                          </a>{" "}
                          · v{value.range.version}
                        </p>
                      )}
                      <p>
                        {c(
                          "Discuss this result with your doctor.",
                          "اس نتیجے پر ڈاکٹر سے بات کریں۔",
                        )}
                      </p>
                    </details>
                  </article>
                ))
              )}
            </section>
            {report.explanation && (
              <section className="cl-card cl-explanation">
                <h2>{c("A plain-language summary", "آسان الفاظ میں خلاصہ")}</h2>
                {[
                  [
                    c("What this means", "اس کا کیا مطلب ہے"),
                    report.explanation.whatThisMeans,
                  ],
                  [
                    c("What can affect it", "اس پر کیا اثر ڈال سکتا ہے"),
                    report.explanation.whatCanAffectIt,
                  ],
                  [
                    c(
                      "Questions to ask your doctor",
                      "ڈاکٹر سے پوچھنے کے سوالات",
                    ),
                    report.explanation.questionsToAsk,
                  ],
                ].map(([title, text]) => (
                  <div key={title}>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                ))}
                <p className="cl-doctor-pointer">
                  {report.explanation.doctorPointer}
                </p>
                {report.explanation.sources.length > 0 && (
                  <details>
                    <summary>{c("Sources", "ذرائع")}</summary>
                    {report.explanation.sources.map((source) => (
                      <p key={source.id}>{source.source}</p>
                    ))}
                  </details>
                )}
                <small className="cl-muted">
                  {report.explanation.mode === "grounded-offline"
                    ? c("Grounded offline mode", "ذرائع پر مبنی آف لائن موڈ")
                    : c(
                        "Source-checked explanation",
                        "ماخذ سے جانچی گئی وضاحت",
                      )}
                </small>
              </section>
            )}
          </div>
          <ReportChat reportId={id} />
        </div>
      )}
      {user?.role === "patient" && (
        <div className="cl-report-actions">
          {confirmDelete ? (
            <>
              <p>
                {c(
                  "Delete this report, its results, and chat? The access audit is retained.",
                  "یہ رپورٹ، نتائج اور گفتگو حذف کریں؟ رسائی کا ریکارڈ برقرار رہے گا۔",
                )}
              </p>
              <button
                className="cl-btn cl-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {c("Delete report", "رپورٹ حذف کریں")}
              </button>
              <button
                className="cl-btn cl-secondary"
                onClick={() => setConfirmDelete(false)}
              >
                {c("Cancel", "منسوخ")}
              </button>
            </>
          ) : (
            <button className="cl-link" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} />
              {c("Delete this synthetic report", "یہ فرضی رپورٹ حذف کریں")}
            </button>
          )}
        </div>
      )}
      {(retry.error || remove.error) && (
        <ErrorState error={retry.error ?? remove.error} />
      )}
    </>
  );
}
