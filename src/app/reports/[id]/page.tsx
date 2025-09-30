'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Report = {
  id: string;
  week_start: string;
  title: string;
  body: string | null;
  created_at: string;
};

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reports/${id}`, { cache: 'no-store' });
        if (res.status === 404) {
          setItem(null);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // API returns the object directly, not { ok, item }
        const r: Report = json?.ok && json?.item ? json.item : json;
        setItem(r);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;
  if (!item) return (
    <main className="mx-auto max-w-2xl p-6 bg-gray-900 text-white min-h-screen">
      <nav className="text-sm mb-4">
        <Link href="/reports" className="text-gray-400 hover:underline">← Back to reports</Link>
      </nav>
      <h1 className="text-2xl font-bold">Not found</h1>
    </main>
  );

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4 bg-gray-900 text-white min-h-screen">
      <nav className="text-sm flex items-center justify-between">
        <Link href="/reports" className="text-gray-400 hover:underline">← Back to reports</Link>
        <Link
          href={`/reports/${item.id}/edit`}
          className="text-gray-200 underline hover:no-underline"
        >
          Edit
        </Link>
      </nav>

      <div className="text-sm text-gray-400">Week starting {item.week_start}</div>
      <h1 className="text-3xl font-bold">{item.title}</h1>
      <div className="text-xs text-gray-500">Created {new Date(item.created_at).toLocaleString()}</div>
      {item.body && <p className="mt-3 whitespace-pre-wrap">{item.body}</p>}
    </main>
  );
}