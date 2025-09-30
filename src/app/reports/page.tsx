'use client';

import Link from "next/link";
import { useEffect, useState } from 'react';

type Report = {
  id: string;
  week_start: string;
  title: string;
  body: string;
  created_at: string;
};

type ApiResponse = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  items: Report[];
};

// Pretty-date helper
const fmt = (s: string) => {
  const d = s.includes('T') ? new Date(s) : new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
};

export default function ReportsPage() {
  const [items, setItems] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = async (nextOffset: number, isMore = false) => {
    try {
      isMore ? setLoadingMore(true) : setLoading(true);
      const res = await fetch(`/api/reports?limit=${limit}&offset=${nextOffset}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();

      setTotal(json.total);
      setLimit(json.limit);
      setOffset(json.offset + json.items.length);
      setItems(isMore ? [...items, ...json.items] : json.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      isMore ? setLoadingMore(false) : setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  const hasMore = items.length < total;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6 bg-gray-900 text-white min-h-screen">
      <nav>
        <Link href="/" className="text-sm text-gray-400 hover:underline">← Home</Link>
      </nav>

      {/* Header row with New Report button */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Weekly Reports</h1>
        <Link
          href="/reports/new"
          className="px-3 py-2 rounded bg-white text-gray-900 font-medium hover:opacity-90"
        >
          New Report
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-gray-400">
          <p>No reports yet.</p>
          <div className="mt-3">
            <Link
              href="/reports/new"
              className="inline-block px-3 py-2 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700"
            >
              Create the first report
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-700 bg-gray-800 p-5 shadow">
                <div className="text-sm text-gray-400">Week starting {fmt(r.week_start)}</div>
                <h2 className="text-xl font-semibold mt-1">{r.title}</h2>
                <p className="mt-2 text-gray-200">{r.body}</p>
                <div className="mt-3 text-xs text-gray-500">
                  Created {new Date(r.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="pt-2">
              <button
                onClick={() => fetchPage(offset, true)}
                disabled={loadingMore}
                className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 hover:bg-gray-700 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
              <div className="mt-2 text-xs text-gray-500">
                Showing {items.length} of {total}
              </div>
            </div>
          )}
        </>
      )}

      <footer className="pt-6 text-xs text-gray-500">
        <div>API total: {total}</div>
        <Link href="/api/reports" className="underline hover:no-underline">View JSON</Link>
      </footer>
    </main>
  );
}
