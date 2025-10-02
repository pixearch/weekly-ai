import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

function baseUrl(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

function extractVideoId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const vid = u.searchParams.get("v");
    return vid || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // auth (header OR ?token=), required in all envs for this runner
  const headerAuth = req.headers.get("authorization") || "";
  const queryToken = searchParams.get("token") || "";
  const tokenEnv = process.env.CRON_TOKEN || process.env.PULLVIEW_TOKEN || "";
  if (!tokenEnv || (headerAuth !== ("Bearer " + tokenEnv) && queryToken !== tokenEnv)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const limit = Math.max(1, Math.min(10, parseInt(searchParams.get("limit") || "3", 10)));
    const pages = Math.max(1, Math.min(5, parseInt(searchParams.get("pages") || "1", 10)));
    const dry = searchParams.get("dry") === "1";

    const { rows } = await sql<{
      id: string;
      name: string;
      url: string | null;
    }>`
      SELECT id, name, url
      FROM review_sources
      WHERE url ILIKE '%youtube.com/watch?v=%'
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;

    const origin = baseUrl(req);
    const calls: Array<{ source_id: string; video_id: string; ok: boolean; stats?: any; error?: string }> = [];

    for (const row of rows) {
      const vid = extractVideoId(row.url);
      if (!vid) {
        calls.push({ source_id: row.id, video_id: "", ok: false, error: "no video_id" });
        continue;
      }
      const url = `${origin}/api/jobs/pull?source=youtube&video=${encodeURIComponent(vid)}&pages=${pages}${dry ? "&dry=1" : ""}&cooldown=60`;
      try {
        const resp = await fetch(url, { method: "GET", headers: { accept: "application/json" }, cache: "no-store" });
        const json = await resp.json();
        if (!resp.ok || json.ok === false) {
          calls.push({ source_id: row.id, video_id: vid, ok: false, error: json.error || `HTTP ${resp.status}` });
        } else {
          calls.push({ source_id: row.id, video_id: vid, ok: true, stats: json.stats });
        }
      } catch (e: any) {
        calls.push({ source_id: row.id, video_id: vid, ok: false, error: e?.message || "fetch failed" });
      }
    }

    return NextResponse.json({ ok: true, count: calls.length, calls });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
