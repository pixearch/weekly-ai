'use client';

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

export default function ReportsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/reports', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        setData(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold">Weekly Reports</h1>
      {data && data.items.length === 0 ? (
        <p>No reports yet.</p>
      ) : (
        <ul className="space-y-4">
          {data?.items.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-700 bg-gray-800 p-5 shadow">
              <div className="text-sm text-gray-400">Week starting {r.week_start}</div>
              <h2 className="text-xl font-semibold mt-1">{r.title}</h2>
              <p className="mt-2 text-gray-200">{r.body}</p>
              <div className="mt-3 text-xs text-gray-500">
                Created {new Date(r.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
