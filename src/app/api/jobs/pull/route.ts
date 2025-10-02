import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

// --- Config ---
const YT_API_KEY = process.env.YOUTUBE_API_KEY;

// --- Helpers ---
function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

type YTCommentThread = {
  id: string;
  snippet: {
    videoId: string;
    topLevelComment: {
      id: string;
      snippet: {
        authorDisplayName: string | null;
        textDisplay: string | null;
        textOriginal?: string | null;
        publishedAt: string;
        updatedAt?: string;
        likeCount?: number;
        viewerRating?: string;
        canRate?: boolean;
        moderationStatus?: string;
        language?: string | null;
      };
    };
  };
};

// --- DB bootstrap (idempotent; dev-friendly) ---
async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS review_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      url  TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
      ext_id TEXT NOT NULL,
      author TEXT,
      title TEXT,
      body TEXT,
      rating REAL,
      created_at TIMESTAMPTZ,
      harvested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      url TEXT,
      lang TEXT,
      product TEXT,
      tags JSONB DEFAULT '{}'::jsonb
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS reviews_source_ext_unique ON reviews(source_id, ext_id);`;
  await sql`CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at);`;
  await sql`CREATE INDEX IF NOT EXISTS reviews_rating_idx ON reviews(rating);`;
  await sql`CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews(product);`;

  await sql`
    CREATE TABLE IF NOT EXISTS job_throttle (
      key TEXT PRIMARY KEY,
      next_allowed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}

async function getOrCreateSourceForYouTube(videoId: string) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const name = `YouTube: ${videoId}`;
  const kind = "youtube";

  const found = await sql<{ id: string }>`
    SELECT id FROM review_sources WHERE kind = ${kind} AND url = ${url} LIMIT 1;
  `;
  if (found.rows[0]) return found.rows[0].id;

  const inserted = await sql<{ id: string }>`
    INSERT INTO review_sources (name, kind, url)
    VALUES (${name}, ${kind}, ${url})
    RETURNING id;
  `;
  return inserted.rows[0].id;
}

async function fetchYouTubeComments(videoId: string, maxPages = 1) {
  if (!YT_API_KEY) throw new Error("Missing YOUTUBE_API_KEY env var.");

  const results: YTCommentThread[] = [];
  let pageToken: string | undefined = undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      part: "snippet",
      videoId,
      maxResults: "100",
      textFormat: "plainText",
      key: YT_API_KEY!,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params.toString()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`YouTube API error: HTTP ${resp.status} ${text}`);
    }
    const json = await resp.json();
    if (Array.isArray(json.items)) results.push(...json.items);
    pageToken = json.nextPageToken;
    pages += 1;
  } while (pageToken && pages < maxPages);

  return results;
}

async function upsertReviewsFromYouTube(sourceId: string, threads: YTCommentThread[]) {
  let inserted = 0;
  let updated = 0;

  for (const t of threads) {
    const c = t.snippet?.topLevelComment;
    const s = c?.snippet;
    if (!c || !s) continue;

    const ext_id = c.id;
    const author = s.authorDisplayName ?? null;
    const body = s.textDisplay ?? s.textOriginal ?? null;
    const createdAtIso = s.publishedAt ? new Date(s.publishedAt).toISOString() : null;
    const url = `https://www.youtube.com/watch?v=${t.snippet.videoId}&lc=${c.id}`;
    const lang = (s as any).language ?? null;

    const res = await sql`
      INSERT INTO reviews (source_id, ext_id, author, title, body, rating, created_at, url, lang, product, tags)
      VALUES (
        ${sourceId}, ${ext_id}, ${author}, ${null}, ${body}, ${null},
        ${createdAtIso}, ${url}, ${lang}, ${null},
        ${JSON.stringify({ source: "youtube" })}
      )
      ON CONFLICT (source_id, ext_id)
      DO UPDATE SET
        author = EXCLUDED.author,
        body = EXCLUDED.body,
        created_at = EXCLUDED.created_at,
        url = EXCLUDED.url,
        lang = EXCLUDED.lang,
        harvested_at = now()
      RETURNING (xmax = 0) AS inserted;
    `;

    // @ts-ignore boolean from xmax trick
    if (res.rows[0]?.inserted) inserted += 1;
    else updated += 1;
  }

  return { inserted, updated, total: threads.length };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  const videoId = searchParams.get("video");
  const pages = Math.max(1, Math.min(5, parseInt(searchParams.get("pages") || "1", 10)));
  const dry = searchParams.get("dry") === "1";

  // --- Auth (prod hosts require token; dev is open) ---
  const headerAuth = req.headers.get("authorization") || "";
  const queryToken = searchParams.get("token") || "";
  const tokenEnv = process.env.CRON_TOKEN || process.env.PULLVIEW_TOKEN || "";
  const host = req.headers.get("host") || "";
  const isProdHost = /\.vercel\.app$/.test(host) || host.includes("weekly-ai.vercel.app");
  if (tokenEnv && isProdHost && (headerAuth !== ("Bearer " + tokenEnv) && queryToken !== tokenEnv)) {
    return bad("unauthorized", 401);
  }

  if (source !== "youtube") return bad("Use ?source=youtube");
  if (!videoId) return bad("Missing required param: ?video=<VIDEO_ID>");

  try {
    await ensureSchema();

    // --- Soft cooldown per video (default 60s) ---
    const cooldownSec = Math.max(0, Math.min(3600, parseInt(searchParams.get("cooldown") || "60", 10)));
    if (cooldownSec > 0) {
      const k = `pull:youtube:${videoId}`;
      const existing = await sql<{ next_allowed_at: string }>`
        SELECT next_allowed_at FROM job_throttle WHERE key = ${k} LIMIT 1;
      `;
      const nowIso = new Date().toISOString();
      if (existing.rows[0] && existing.rows[0].next_allowed_at > nowIso) {
        return bad("cooldown_active", 429);
      }
      await sql`
        INSERT INTO job_throttle (key, next_allowed_at)
        VALUES (${k}, now() + (INTERVAL '1 second' * ${cooldownSec}::int))
        ON CONFLICT (key)
        DO UPDATE SET next_allowed_at = now() + (INTERVAL '1 second' * ${cooldownSec}::int);
      `;
    }

    const sourceId = await getOrCreateSourceForYouTube(videoId);

    // Early dry-run (fetch only, no DB)
    if (dry) {
      const threads = await fetchYouTubeComments(videoId, pages);
      return NextResponse.json({
        ok: true,
        video_id: videoId,
        stats: { total: threads.length, inserted: 0, updated: 0 },
        dry: true,
      });
    }

    // Real fetch + upsert
    const threads = await fetchYouTubeComments(videoId, pages);
    const stats = await upsertReviewsFromYouTube(sourceId, threads);

    return NextResponse.json({
      ok: true,
      source_id: sourceId,
      video_id: videoId,
      stats,
    });
  } catch (e: any) {
    return bad(e?.message || "Unknown error", 500);
  }
}
