"use client";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  UploadCloud,
  Bell,
  HeartHandshake,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { api, type Report, type Reminder, type TrendPoint } from "@/lib/api";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  StateBadge,
  useCopy,
} from "./shared";
import { TrendChart } from "./trends";
export function Dashboard() {
  const c = useCopy(),
    { profile, user } = useAuth(),
    cache = useQueryClient();
  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => api<{ reports: Report[] }>("/reports"),
  });
  const reminders = useQuery({
    queryKey: ["reminders"],
    queryFn: () => api<{ items: Reminder[] }>("/reminders"),
  });
  const trends = useQuery({
    queryKey: ["trends"],
    queryFn: () => api<{ points: TrendPoint[] }>("/trends"),
  });
  const notices = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<{
        items: {
          id: string;
          message: string;
          readAt: string | null;
          createdAt: string;
        }[];
      }>("/notifications"),
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const points =
    trends.data?.points.filter((p) => p.testCode === "glucose") ?? [];
  const comparable = points.filter(
    (p) => p.range?.id === points[0]?.range?.id && p.unit === points[0]?.unit,
  );
  return (
    <>
      <PageHeading
        eyebrow={c("YOUR CARE, ALL TOGETHER", "آپ کی دیکھ بھال، ایک جگہ")}
        title={c(
          `Hello, ${profile?.displayName.split(" ")[0] ?? "there"}.`,
          `خوش آمدید، ${profile?.displayName.split(" ")[0] ?? ""}۔`,
        )}
        description={c(
          "A little clarity for the day ahead.",
          "آنے والے دن کے لیے بہتر سمجھ۔",
        )}
        action={
          <Link
            className="cl-btn"
            href={user?.role === "patient" ? "/upload" : "/clinic"}
          >
            <UploadCloud size={18} />
            {user?.role === "patient"
              ? c("Upload report", "رپورٹ اپ لوڈ کریں")
              : c("Open clinic review", "کلینک کا جائزہ کھولیں")}
          </Link>
        }
      />
      {!profile?.age && (
        <Link href="/onboarding" className="cl-notice">
          <HeartHandshake />
          <p>
            {c(
              "Complete your synthetic profile so reference ranges can be matched to the right context.",
              "اپنی فرضی پروفائل مکمل کریں تاکہ درست حوالہ جاتی حدود منتخب ہوں۔",
            )}
          </p>
        </Link>
      )}
      <div className="cl-stats">
        {[
          {
            Icon: FileText,
            label: c("Reports in your library", "آپ کی رپورٹس"),
            value: reports.data?.reports.length ?? "—",
          },
          {
            Icon: Bell,
            label: c("Active reminders", "فعال یاد دہانیاں"),
            value: reminders.data?.items.filter((r) => r.active).length ?? "—",
          },
          {
            Icon: HeartHandshake,
            label: c("Human verification requested", "انسانی تصدیق کی درخواست"),
            value:
              reports.data?.reports.filter((r) => r.state === "needs_review")
                .length ?? "—",
          },
        ].map(({ Icon, label, value }) => (
          <section className="cl-card cl-stat" key={label}>
            <span className="cl-soft-icon">
              <Icon />
            </span>
            <strong>{value}</strong>
            <p>{label}</p>
          </section>
        ))}
      </div>
      <div className="cl-dashboard-grid">
        <section className="cl-card">
          <div className="cl-card-top">
            <h2>{c("Latest reports", "تازہ رپورٹس")}</h2>
            <Link className="cl-link" href="/reports">
              {c("View all", "سب دیکھیں")}
            </Link>
          </div>
          {reports.isLoading ? (
            <Loading />
          ) : reports.error ? (
            <ErrorState error={reports.error} />
          ) : !reports.data?.reports.length ? (
            <Empty
              title={c(
                "Your story starts here.",
                "آپ کا سفر یہاں سے شروع ہوتا ہے۔",
              )}
            >
              <Link href="/upload" className="cl-link">
                {c(
                  "Add your first synthetic report",
                  "اپنی پہلی فرضی رپورٹ شامل کریں",
                )}
              </Link>
            </Empty>
          ) : (
            reports.data.reports.slice(0, 3).map((r) => (
              <Link
                className="cl-list-row"
                href={`/reports/${r.id}`}
                key={r.id}
              >
                <span className="cl-soft-icon">
                  <FileText />
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <small dir="ltr">{r.collectedAt}</small>
                </div>
                <StateBadge state={r.state} />
              </Link>
            ))
          )}
        </section>
        <section className="cl-card cl-next-step">
          <CalendarDays size={28} />
          <h2>{c("One small step today.", "آج ایک چھوٹا سا قدم۔")}</h2>
          <p>
            {c(
              "Before your next appointment, write down the questions you want to ask. Your care team can help put the results in context.",
              "اگلی ملاقات سے پہلے اپنے سوالات لکھ لیں۔ آپ کی طبی ٹیم نتائج کو سمجھنے میں مدد دے سکتی ہے۔",
            )}
          </p>
          <Link className="cl-btn cl-secondary" href="/reminders">
            {c("Plan a follow-up", "فالو اَپ طے کریں")}
          </Link>
        </section>
        <section className="cl-card">
          <div className="cl-card-top">
            <h2>{c("Glucose over time", "وقت کے ساتھ گلوکوز")}</h2>
            <Link href="/trends" className="cl-link">
              {c("Explore trends", "رجحانات دیکھیں")}
            </Link>
          </div>
          {trends.isLoading ? (
            <Loading />
          ) : trends.error ? (
            <ErrorState error={trends.error} />
          ) : comparable.length ? (
            <TrendChart compact points={comparable} />
          ) : (
            <Empty
              title={c(
                "Add reports to see your trend.",
                "رجحان دیکھنے کے لیے رپورٹس شامل کریں۔",
              )}
            />
          )}
        </section>
        <section className="cl-card">
          <div className="cl-card-top">
            <h2>{c("Your care inbox", "آپ کی یاد دہانیاں")}</h2>
            <Bell size={20} />
          </div>
          {notices.isLoading ? (
            <Loading />
          ) : notices.error ? (
            <ErrorState error={notices.error} />
          ) : !notices.data?.items.length ? (
            <Empty
              title={c("You’re all caught up.", "ابھی کوئی نئی اطلاع نہیں۔")}
            >
              <p>
                {c(
                  "Reminder and follow-up notifications will appear here when n8n runs their schedules.",
                  "n8n کے شیڈول چلنے پر یاد دہانیاں یہاں نظر آئیں گی۔",
                )}
              </p>
            </Empty>
          ) : (
            notices.data.items.slice(0, 5).map((n) => (
              <article className="cl-notification" key={n.id}>
                <p>{n.message}</p>
                {!n.readAt && (
                  <button className="cl-link" onClick={() => read.mutate(n.id)}>
                    {c("Mark as read", "پڑھا ہوا نشان لگائیں")}
                  </button>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </>
  );
}
