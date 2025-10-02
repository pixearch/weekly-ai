import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    const { rows } = await sql<{
      id: string;
      name: string;
      kind: string | null;
      url: string | null;
      created_at: string;
    }>`
      SELECT id, name, kind, url, created_at
      FROM review_sources
      ORDER BY created_at DESC;
    `;
    return NextResponse.json({ ok: true, count: rows.length, items: rows });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
