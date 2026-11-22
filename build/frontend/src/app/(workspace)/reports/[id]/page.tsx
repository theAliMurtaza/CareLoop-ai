import { ReportDetail } from "@/components/careloop/reports";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportDetail id={id} />;
}
