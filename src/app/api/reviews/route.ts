import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));
    const pretty = searchParams.get("pretty") === "1";
    const newline = searchParams.get("newline") === "1";
    const since = searchParams.get("since");
    const q = searchParams.get("q");
    const qLike = q ? ("%" + q + "%") : null;
    const source = searchParams.get("source");
    const video = searchParams.get("video");
    const post = searchParams.get("post");
    const postLike = post ? ("%comments/" + post + "%") : null;
    const videoLike = video ? ("%" + video + "%") : null;

    const rows = await sql<{
      id: string;
      source_id: string;
      ext_id: string;
      author: string | null;
      title: string | null;
      body: string | null;
      rating: number | null;
      created_at: string | null;
      harvested_at: string;
      url: string | null;
      lang: string | null;
      product: string | null;
      tags: any;
    }>`
      SELECT id, source_id, ext_id, author, title, body, rating, created_at, harvested_at, url, lang, product, tags
      FROM reviews
      WHERE (${source}::text IS NULL OR (SELECT kind FROM review_sources s WHERE s.id = reviews.source_id) = ${source})
      AND (${video}::text IS NULL OR (SELECT url FROM review_sources s WHERE s.id = reviews.source_id) LIKE ${videoLike})
      AND (${post}::text IS NULL OR (SELECT url FROM review_sources s WHERE s.id = reviews.source_id) ILIKE ${postLike})
      AND (${since}::text IS NULL OR reviews.created_at >= (now() - (regexp_replace(${since}, '[^0-9]+', ' ', 'g')::text || ' hours')::interval))
      AND (${q}::text IS NULL OR (reviews.body ILIKE ${qLike} OR reviews.author ILIKE ${qLike}))
      ORDER BY created_at DESC NULLS LAST, harvested_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `;

    const payload = { ok: true, count: rows.rowCount, items: rows.rows };
    const body = pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
    const text = newline ? body + "\n" : body;

    return new Response(text, { headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
