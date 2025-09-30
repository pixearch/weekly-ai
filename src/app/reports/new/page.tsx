'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function isoMondayUTC(d = new Date()) {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + deltaToMonday));
  return monday.toISOString().slice(0, 10);
}

export default function NewReportPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [weekStart, setWeekStart] = useState(isoMondayUTC());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const payload: any = { title: title.trim() };
    if (body.trim()) payload.body = body;
    if (weekStart) payload.week_start = weekStart; // "YYYY-MM-DD"

    if (!payload.title) {
      setError("Title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      // go back to list (or detail if you add one later)
      router.push('/reports');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">New Report</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="title">Title *</label>
          <input
            id="title"
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Weekly summary title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="week_start">Week start (YYYY-MM-DD)</label>
          <input
            id="week_start"
            name="week_start"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">Defaults to current ISO week Monday (UTC).</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="body">Body</label>
          <textarea
            id="body"
            name="body"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="What happened this week…"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Create report'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/reports')}
            className="px-4 py-2 rounded border"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
