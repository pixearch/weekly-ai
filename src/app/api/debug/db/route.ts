import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    const src = await sql`SELECT COUNT(*)::int AS n FROM review_sources;`;
    const rev = await sql`SELECT COUNT(*)::int AS n FROM reviews;`;
    const sampleSrc = await sql`
      SELECT id, name, kind, url, created_at
      FROM review_sources
      ORDER BY created_at DESC
      LIMIT 3;
    `;
    const sampleRev = await sql`
      SELECT id, source_id, ext_id, created_at, harvested_at
      FROM reviews
      ORDER BY harvested_at DESC
      LIMIT 3;
    `;
    return NextResponse.json({
      ok: true,
      counts: { review_sources: src.rows[0]?.n ?? 0, reviews: rev.rows[0]?.n ?? 0 },
      sample: { review_sources: sampleSrc.rows, reviews: sampleRev.rows }
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
