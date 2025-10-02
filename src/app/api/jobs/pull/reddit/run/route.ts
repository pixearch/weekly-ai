import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

function baseUrl(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

function extractPostId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "comments");
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // token gate (header OR ?token=)
  const headerAuth = req.headers.get("authorization") || "";
  const queryToken = searchParams.get("token") || "";
  const tokenEnv = process.env.CRON_TOKEN || process.env.PULLVIEW_TOKEN || "";
  if (!tokenEnv || (headerAuth !== ("Bearer " + tokenEnv) && queryToken !== tokenEnv)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const limit = Math.max(1, Math.min(10, parseInt(searchParams.get("limit") || "3", 10)));
    const fetchLimit = Math.max(1, Math.min(100, parseInt(searchParams.get("fetch") || "50", 10)));
    const dry = searchParams.get("dry") === "1";

    // Pick recent reddit sources we already know about
    const { rows } = await sql<{ id: string; url: string | null }>`
      SELECT id, url
      FROM review_sources
      WHERE kind = 'reddit' OR url ILIKE '%reddit.com/%comments/%'
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;

    const origin = baseUrl(req);
    const calls: Array<{ source_id: string; post_id: string; ok: boolean; stats?: any; error?: string }> = [];

    for (const row of rows) {
      const post = extractPostId(row.url);
      if (!post) {
        calls.push({ source_id: row.id, post_id: "", ok: false, error: "no post id" });
        continue;
      }
      const url = `${origin}/api/jobs/pull/reddit?post=${encodeURIComponent(post)}&limit=${fetchLimit}${dry ? "&dry=1" : ""}`;
      try {
        const resp = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
        const json = await resp.json();
        if (!resp.ok || json.ok === false) {
          calls.push({ source_id: row.id, post_id: post, ok: false, error: json.error || `HTTP ${resp.status}` });
        } else {
          calls.push({ source_id: row.id, post_id: post, ok: true, stats: json.stats });
        }
      } catch (e: any) {
        calls.push({ source_id: row.id, post_id: post, ok: false, error: e?.message || "fetch failed" });
      }
    }

    return NextResponse.json({ ok: true, count: calls.length, calls });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
