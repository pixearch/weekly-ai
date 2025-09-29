import Link from "next/link";
import { notFound } from "next/navigation";

type Report = {
  id: string;
  week_start: string;
  title: string;
  body: string;
  created_at: string;
};

const fmt = (s: string) =>
  new Date(s.includes("T") ? s : `${s}T00:00:00Z`).toLocaleString();

export default async function ReportDetail({
  params,
}: { params: { id: string } }) {
  // Fetch single report from our API
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/reports/${params.id}`,
    { cache: "no-store" }
  );

  if (!res.ok) return notFound();
  const report: Report | null = await res.json();
  if (!report) return notFound();

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <Link href="/reports" className="text-sm text-gray-500 hover:underline">
        ← Back
      </Link>

      <h1 className="text-3xl font-bold">{report.title}</h1>
      <div className="text-sm text-gray-500">
        Week starting {fmt(report.week_start)}
      </div>
      <p className="mt-2 whitespace-pre-wrap">{report.body}</p>
      <div className="text-xs text-gray-500">
        Created {fmt(report.created_at)}
      </div>
    </main>
  );
}
