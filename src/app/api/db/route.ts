import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// This endpoint runs when you visit /api/db in your browser.
// It makes sure the "weekly_reports" table exists.
// Then it returns a simple JSON response.
export async function GET() {
  try {
    // Create table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id BIGSERIAL PRIMARY KEY,
        week_start DATE NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Check how many rows exist
    const { rows } = await sql`
      SELECT COUNT(*)::int AS count FROM weekly_reports;
    `;

    return NextResponse.json({ ok: true, count: rows[0].count });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}
