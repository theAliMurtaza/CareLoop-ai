"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { api, type TrendPoint } from "@/lib/api";
import {
  Empty,
  ErrorState,
  Loading,
  PageHeading,
  StatusBadge,
  useCopy,
} from "./shared";
export function TrendChart({
  points,
  compact = false,
}: {
  points: TrendPoint[];
  compact?: boolean;
}) {
  const c = useCopy();
  const data = [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ ...p, band: p.range ? [p.range.low, p.range.high] : null }));
  return (
    <>
      <div
        className={compact ? "cl-chart cl-chart-compact" : "cl-chart"}
        role="img"
        aria-label={c(
          "Recorded result values over time. The shaded band is the reference range. Open Trends for the values table.",
          "وقت کے ساتھ درج نتائج۔ رنگین پٹی حوالہ جاتی حد ہے۔ مکمل نتائج کے لیے رجحانات کا جدول دیکھیں۔",
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 20, left: 0, bottom: 12 }}
          >
            <CartesianGrid vertical={false} stroke="#e4ece8" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #dbe6df" }}
            />
            <Area
              dataKey="band"
              name={c("Reference range", "حوالہ جاتی حد")}
              fill="#d8eee1"
              stroke="none"
              fillOpacity={0.8}
              isAnimationActive={false}
            />
            <Line
              dataKey="value"
              name={c("Recorded value", "درج نتیجہ")}
              stroke="#007465"
              strokeWidth={3}
              dot={{ r: 5, fill: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="cl-chart-key">
        <span />
        {c(
          "Shaded area: synthetic reference range",
          "رنگین حصہ: فرضی حوالہ جاتی حد",
        )}
      </p>
    </>
  );
}
export function Trends() {
  const c = useCopy();
  const [selection, setSelection] = useState("");
  const query = useQuery({
    queryKey: ["trends"],
    queryFn: () => api<{ points: TrendPoint[] }>("/trends"),
  });
  const all = query.data?.points ?? [];
  const key = (p: TrendPoint) =>
    `${p.testCode}|${p.unit}|${p.range?.id ?? "unknown"}|${p.range?.version ?? 0}`;
  const groups = [...new Map(all.map((p) => [key(p), p])).entries()];
  const selected = selection || groups[0]?.[0] || "";
  const points = all.filter((p) => key(p) === selected);
  return (
    <>
      <PageHeading
        eyebrow={c("THE BIGGER PICTURE", "وسیع تر منظر")}
        title={c("Your trends over time", "وقت کے ساتھ آپ کے رجحانات")}
        description={c(
          "See changes without jumping to conclusions. Trends use the same test, unit, and reference version.",
          "جلد نتیجہ نکالے بغیر تبدیلیاں دیکھیں۔ ایک ہی ٹیسٹ، اکائی اور حوالہ جاتی نسخہ دکھایا جاتا ہے۔",
        )}
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : !all.length ? (
        <Empty
          title={c(
            "Trends start with your first report.",
            "رجحانات آپ کی پہلی رپورٹ سے شروع ہوں گے۔",
          )}
        />
      ) : (
        <section className="cl-card">
          <div className="cl-card-top">
            <h2>{c("A view of your journey", "آپ کے سفر کی ایک جھلک")}</h2>
            <label>
              {c("Test", "ٹیسٹ")}
              <select
                value={selected}
                onChange={(e) => setSelection(e.target.value)}
              >
                {groups.map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label} · {p.unit} · v{p.range?.version ?? "?"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TrendChart points={points} />
          <div className="cl-table-wrap">
            <table>
              <caption className="cl-sr-only">
                {c("Exact trend values", "رجحان کے مکمل نتائج")}
              </caption>
              <thead>
                <tr>
                  <th>{c("Collection date", "نمونے کی تاریخ")}</th>
                  <th>{c("Result", "نتیجہ")}</th>
                  <th>{c("Reference", "حوالہ")}</th>
                  <th>{c("Status", "حیثیت")}</th>
                </tr>
              </thead>
              <tbody>
                {[...points]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((p) => (
                    <tr key={p.id}>
                      <td dir="ltr">{p.date}</td>
                      <td dir="ltr">
                        {p.value} {p.unit}
                      </td>
                      <td dir="ltr">
                        {p.range ? `${p.range.low}–${p.range.high}` : "—"}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
