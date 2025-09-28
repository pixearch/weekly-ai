import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

type NewReport = {
  week_start: string; // YYYY-MM-DD
  title: string;
  body: string;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: NextRequest) {
  // writes require CRON_SECRET
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (auth !== expected) return json({ ok: false, error: "Unauthorized" }, 401);

  let payload: NewReport;
  try {
    payload = (await req.json()) as NewReport;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const { week_start, title, body } = payload;
  if (!week_start || !/^\d{4}-\d{2}-\d{2}$/.test(week_start))
    return json({ ok: false, error: "week_start must be YYYY-MM-DD" }, 400);
  if (!title || !body) return json({ ok: false, error: "title and body are required" }, 400);

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

    const { rows } = await sql<{ id: number }>`
      INSERT INTO weekly_reports (week_start, title, body)
      VALUES (${week_start}, ${title}, ${body})
      RETURNING id;
    `;

    return json({ ok: true, id: rows[0].id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}

export async function GET(req: NextRequest) {
  // public read (no secret)
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const offset = Number(searchParams.get("offset") ?? 0);

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

    const { rows } = await sql<{
      id: number;
      week_start: string;
      title: string;
      body: string;
      created_at: string;
    }>`
      SELECT id
           , to_char(week_start, 'YYYY-MM-DD') AS week_start
           , title
           , body
           , to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM weekly_reports
      ORDER BY week_start DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `;

    const { rows: countRows } = await sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM weekly_reports;
    `;

    return json({ ok: true, total: countRows[0].count, limit, offset, items: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}

