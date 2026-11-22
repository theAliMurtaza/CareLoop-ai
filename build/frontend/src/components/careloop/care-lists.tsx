"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pill, Bell, CalendarDays, Pencil, Trash2, Plus } from "lucide-react";
import { api, type Medication, type Reminder, type FollowUp } from "@/lib/api";
import { Empty, ErrorState, Loading, PageHeading, useCopy } from "./shared";
type Kind = "medications" | "reminders" | "follow-ups";
type Item = Medication | Reminder | FollowUp;
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function CareList({ kind }: { kind: Kind }) {
  const c = useCopy(),
    cache = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null),
    [show, setShow] = useState(false),
    [name, setName] = useState(""),
    [notes, setNotes] = useState(""),
    [due, setDue] = useState(""),
    [repeat, setRepeat] = useState(""),
    [medication, setMedication] = useState("");
  const query = useQuery({
    queryKey: [kind],
    queryFn: () => api<{ items: Item[] }>(`/${kind}`),
  });
  const meds = useQuery({
    queryKey: ["medications"],
    queryFn: () => api<{ items: Medication[] }>("/medications"),
    enabled: kind === "reminders",
  });
  const title =
    kind === "medications"
      ? c("Your medication list", "آپ کی ادویات")
      : kind === "reminders"
        ? c("A little nudge, right on time.", "وقت پر ایک چھوٹی یاد دہانی۔")
        : c("Follow-up appointments", "اگلی ملاقاتیں");
  const mutation = useMutation({
    mutationFn: async ({
      method,
      id,
      body,
    }: {
      method: string;
      id?: string | undefined;
      body?: unknown;
    }) =>
      api(`/${kind}${id ? "/" + id : ""}`, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: [kind] });
      void cache.invalidateQueries({ queryKey: ["reminders"] });
      setShow(false);
      setEditing(null);
    },
  });
  function edit(item?: Item) {
    setEditing(item?.id ?? null);
    setName(item ? ("name" in item ? item.name : item.title) : "");
    setNotes(
      item
        ? "instructions" in item
          ? item.instructions
          : "notes" in item
            ? item.notes
            : ""
        : "",
    );
    setDue(
      item && "dueAt" in item
        ? localDate(item.dueAt)
        : localDate(new Date(Date.now() + 3600000).toISOString()),
    );
    setRepeat(
      item && "intervalMinutes" in item
        ? String(item.intervalMinutes ?? "")
        : "",
    );
    setMedication(
      item && "medicationId" in item ? (item.medicationId ?? "") : "",
    );
    setShow(true);
    mutation.reset();
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const body =
      kind === "medications"
        ? { name, instructions: notes, active: true }
        : kind === "reminders"
          ? {
              title: name,
              dueAt: new Date(due).toISOString(),
              intervalMinutes: repeat ? Number(repeat) : null,
              medicationId: medication || null,
              active: true,
            }
          : {
              title: name,
              notes,
              dueAt: new Date(due).toISOString(),
              completed: false,
            };
    mutation.mutate({
      method: editing ? "PUT" : "POST",
      id: editing ?? undefined,
      body,
    });
  }
  function toggle(item: Item) {
    const { id, ...body } = item;
    mutation.mutate({
      method: "PUT",
      id,
      body:
        "completed" in body
          ? { ...body, completed: !body.completed }
          : { ...body, active: !body.active },
    });
  }
  const Icon =
    kind === "medications" ? Pill : kind === "reminders" ? Bell : CalendarDays;
  return (
    <section>
      <PageHeading
        eyebrow={c("SMALL STEPS, STEADY CARE", "چھوٹے قدم، مسلسل دیکھ بھال")}
        title={title}
        description={
          kind === "medications"
            ? c(
                "Record existing clinician instructions. CareLoop does not suggest medicines or doses.",
                "ڈاکٹر کی موجودہ ہدایات درج کریں۔ CareLoop ادویات یا خوراک تجویز نہیں کرتا۔",
              )
            : c(
                "Times are shown in your device timezone. Reminders appear in your CareLoop inbox.",
                "وقت آپ کے آلے کے ٹائم زون میں ہے۔ یاد دہانیاں CareLoop ان باکس میں آئیں گی۔",
              )
        }
        action={
          <button className="cl-btn" onClick={() => edit()}>
            <Plus size={18} />
            {c("Add new", "نیا شامل کریں")}
          </button>
        }
      />
      {show && (
        <form className="cl-card cl-form cl-edit-form" onSubmit={submit}>
          <h2>
            {editing
              ? c("Edit record", "ریکارڈ میں ترمیم")
              : c("Add a record", "ریکارڈ شامل کریں")}
          </h2>
          <label>
            {kind === "medications"
              ? c("Medication name (synthetic)", "دوا کا نام (فرضی)")
              : c("Title", "عنوان")}
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {kind !== "reminders" && (
            <label>
              {kind === "medications"
                ? c("Existing clinician instructions", "ڈاکٹر کی موجودہ ہدایات")
                : c("Notes", "نوٹس")}
              <textarea
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          )}
          {kind !== "medications" && (
            <label>
              {c("Date and time", "تاریخ اور وقت")}
              <input
                type="datetime-local"
                required
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          )}
          {kind === "reminders" && (
            <>
              <label>
                {c("Repeat", "تکرار")}
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                >
                  <option value="">{c("Once", "ایک بار")}</option>
                  <option value="1440">
                    {c("Every 24 hours", "ہر ۲۴ گھنٹے")}
                  </option>
                  <option value="10080">{c("Every 7 days", "ہر ۷ دن")}</option>
                </select>
              </label>
              <label>
                {c("Linked medication (optional)", "متعلقہ دوا (اختیاری)")}
                <select
                  value={medication}
                  onChange={(e) => setMedication(e.target.value)}
                >
                  <option value="">{c("None", "کوئی نہیں")}</option>
                  {meds.data?.items
                    .filter((m) => m.active)
                    .map((m) => (
                      <option value={m.id} key={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {mutation.isError && <ErrorState error={mutation.error} />}
          <div className="cl-actions">
            <button className="cl-btn" disabled={mutation.isPending}>
              {c("Save record", "محفوظ کریں")}
            </button>
            <button
              type="button"
              className="cl-btn cl-secondary"
              onClick={() => setShow(false)}
            >
              {c("Cancel", "منسوخ")}
            </button>
          </div>
        </form>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <Empty title={c("Nothing here yet", "ابھی کوئی ریکارڈ نہیں")}>
          <p>
            {c(
              "Add your first synthetic record to get started.",
              "شروع کرنے کے لیے پہلا فرضی ریکارڈ شامل کریں۔",
            )}
          </p>
        </Empty>
      ) : (
        <div className="cl-list">
          {query.data.items.map((item) => (
            <article className="cl-card cl-list-item" key={item.id}>
              <span className="cl-tile-icon">
                <Icon />
              </span>
              <div className="cl-grow">
                <h3>{"name" in item ? item.name : item.title}</h3>
                {"instructions" in item && <p>{item.instructions}</p>}
                {"notes" in item && <p>{item.notes}</p>}
                {"dueAt" in item && (
                  <p>
                    <time dateTime={item.dueAt}>
                      {new Date(item.dueAt).toLocaleString()}
                    </time>
                  </p>
                )}
                <span className="cl-badge">
                  {"completed" in item
                    ? item.completed
                      ? c("Completed", "مکمل")
                      : c("Upcoming", "آئندہ")
                    : item.active
                      ? c("Active", "فعال")
                      : c("Paused", "رکا ہوا")}
                </span>
              </div>
              <div className="cl-actions">
                <button
                  className="cl-btn cl-secondary"
                  disabled={mutation.isPending}
                  onClick={() => toggle(item)}
                >
                  {"completed" in item
                    ? item.completed
                      ? c("Reopen", "دوبارہ کھولیں")
                      : c("Mark done", "مکمل کریں")
                    : item.active
                      ? c("Pause", "روکیں")
                      : c("Resume", "جاری کریں")}
                </button>
                <button
                  className="cl-icon-btn"
                  aria-label={c("Edit", "ترمیم")}
                  onClick={() => edit(item)}
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="cl-icon-btn"
                  aria-label={c("Delete", "حذف")}
                  disabled={mutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        c("Delete this record?", "یہ ریکارڈ حذف کریں؟"),
                      )
                    )
                      mutation.mutate({ method: "DELETE", id: item.id });
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!show && mutation.isError && <ErrorState error={mutation.error} />}
    </section>
  );
}
export function Reminders() {
  return (
    <>
      <CareList kind="reminders" />
      <div className="cl-section-gap">
        <CareList kind="follow-ups" />
      </div>
    </>
  );
}
