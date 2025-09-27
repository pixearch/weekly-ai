import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id BIGSERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const { rows } = await sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM weekly_reports;
    `;
    return NextResponse.json({ ok: true, count: rows[0].count });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
