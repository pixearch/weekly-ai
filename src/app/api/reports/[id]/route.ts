mport { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const revalidate = 0;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Correct, explicit signature for an App Router dynamic route:
export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } }
): Promise<NextResponse> {
  const idNum = Number(ctx.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, week_start, title, body, created_at
       FROM reports
       WHERE id = $1
       LIMIT 1`,
      [idNum]
    );

    if (rows.length === 0) return NextResponse.json(null, { status: 404 });

    const r = rows[0];
    const out = {
      id: String(r.id),
      week_start: (r.week_start instanceof Date ? r.week_start : new Date(r.week_start))
        .toISOString()
        .slice(0, 10),
      title: r.title as string,
      body: r.body as string,
      created_at: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
    };

    return NextResponse.json(out);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
  } finally {
    client.release();
  }
}
