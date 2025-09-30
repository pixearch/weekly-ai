'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type Report = {
  id: string;
  week_start: string;
  title: string;
  body: string | null;
  created_at: string;
};

export default function EditReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState<string>('');
  const [weekStart, setWeekStart] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reports/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r: Report = await res.json();
        setTitle(r.title);
        setBody(r.body ?? '');
        setWeekStart(r.week_start);
      } catch (e: any) {
        setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const payload: any = {};
    if (title.trim()) payload.title = title.trim();
    payload.body = body === '' ? null : body; // allow clearing
    if (weekStart) payload.week_start = weekStart;

    setSaving(true);
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      router.push(`/reports/${id}`);
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <nav className="text-sm">
        <Link href={`/reports/${id}`} className="text-gray-500 hover:underline">← Back</Link>
      </nav>

      <h1 className="text-2xl font-semibold">Edit Report</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="title">Title *</label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="week_start">Week start</label>
          <input
            id="week_start"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="body">Body</label>
          <textarea
            id="body"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">Leave empty to clear the body.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link href={`/reports/${id}`} className="px-4 py-2 rounded border">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
