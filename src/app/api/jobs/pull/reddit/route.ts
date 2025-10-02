import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

function bad(msg: string, code = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status: code });
}

function extractPostIdFromUrl(u: string): string | null {
  try {
    const url = new URL(u);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "comments");
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return null;
  } catch {
    return null;
  }
}

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
}

type RComment = {
  kind: string;
  data: {
    id: string;
    author: string;
    body?: string;
    created_utc: number;
    permalink?: string;
  };
};

async function fetchPublicComments(postId: string, limit: number) {
  const url = new URL(`https://www.reddit.com/comments/${postId}.json`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("depth", "1");
  url.searchParams.set("raw_json", "1");
  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": "PullviewPublic/0.1 (+github.com/pullview)" },
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Reddit public API error: HTTP ${resp.status} ${text}`);
  }
  const json = await resp.json();
  const listing: RComment[] =
    Array.isArray(json) && json[1]?.data?.children ? (json[1].data.children as RComment[]) : [];
  return listing.filter((c) => c?.kind === "t1" && c?.data?.author);
}

async function getOrCreateRedditSource(postId: string, threadUrl: string) {
  const name = `Reddit: ${postId}`;
  const kind = "reddit";
  const found = await sql<{ id: string }>`
    SELECT id FROM review_sources WHERE kind = ${kind} AND url = ${threadUrl} LIMIT 1;
  `;
  if (found.rows[0]) return found.rows[0].id;
  const ins = await sql<{ id: string }>`
    INSERT INTO review_sources (name, kind, url)
    VALUES (${name}, ${kind}, ${threadUrl})
    RETURNING id;
  `;
  return ins.rows[0].id;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dry = (searchParams.get("dry") ?? "1") === "1";
  const urlParam = searchParams.get("url");
  const postParam = searchParams.get("post");
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "100", 10)));

  // prod token gate (matches other jobs)
  const headerAuth = req.headers.get("authorization") || "";
  const queryToken = searchParams.get("token") || "";
  const tokenEnv = process.env.CRON_TOKEN || process.env.PULLVIEW_TOKEN || "";
  const host = req.headers.get("host") || "";
  const isProdHost = /\.vercel\.app$/.test(host);
  if (tokenEnv && isProdHost && headerAuth !== ("Bearer " + tokenEnv) && queryToken !== tokenEnv) {
    return bad("unauthorized", 401);
  }

  if (!urlParam && !postParam) return bad("Provide ?url=<reddit_thread_url> or ?post=<base36 id>");
  const postId = postParam || (urlParam ? extractPostIdFromUrl(urlParam) : null);
  if (!postId) return bad("Could not extract post id from url/post");

  try {
    await ensureSchema();

    const comments = await fetchPublicComments(postId, limit);

    const preview = comments.slice(0, 3).map((c) => ({
      id: c.data.id,
      author: c.data.author,
      body: c.data.body ?? "",
      created_utc: c.data.created_utc,
      permalink: c.data.permalink ? "https://www.reddit.com" + c.data.permalink : null,
    }));

    if (dry) {
      return NextResponse.json({
        ok: true,
        post_id: postId,
        stats: { total: comments.length, preview: preview.length },
        preview,
        dry: true,
      });
    }

    const threadUrl = urlParam || `https://www.reddit.com/comments/${postId}/`;
    const sourceId = await getOrCreateRedditSource(postId, threadUrl);

    let inserted = 0;
    let updated = 0;
    for (const c of comments) {
      const ext_id = c.data.id;
      const author = c.data.author || null;
      const body = c.data.body || null;
      const createdAtIso = new Date(c.data.created_utc * 1000).toISOString();
      const url = c.data.permalink ? "https://www.reddit.com" + c.data.permalink : threadUrl;

      const res = await sql`
        INSERT INTO reviews (source_id, ext_id, author, title, body, rating, created_at, url, lang, product, tags)
        VALUES (
          ${sourceId}, ${ext_id}, ${author}, ${null}, ${body}, ${null},
          ${createdAtIso}, ${url}, ${null}, ${null},
          ${JSON.stringify({ source: "reddit" })}
        )
        ON CONFLICT (source_id, ext_id)
        DO UPDATE SET
          author = EXCLUDED.author,
          body = EXCLUDED.body,
          created_at = EXCLUDED.created_at,
          url = EXCLUDED.url,
          harvested_at = now()
        RETURNING (xmax = 0) AS inserted;
      `;
      // @ts-ignore
      if (res.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    return NextResponse.json({
      ok: true,
      post_id: postId,
      source_id: sourceId,
      stats: { total: comments.length, inserted, updated },
    });
  } catch (e: any) {
    return bad(e?.message || "Unknown error", 500);
  }
}
