// app/api/reports/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const revalidate = 0;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// helper for pretty-print (and newline)
function jsonPretty(data: any, status = 200, pretty = false) {
  const body = (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n";
  return new NextResponse(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---- simple in-memory rate limiter (persists across dev reloads) ----
type Bucket = { count: number; reset: number };

// persist on globalThis so Turbopack HMR doesn't reset it
// @ts-ignore
const RL_STORAGE: Map<string, Bucket> = (globalThis.__RL_BUCKETS__ ||= new Map());

function clientKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  const token = m?.[1] ?? "anon";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  // scope to this route
  return `${token}:${ip}:POST:/api/reports`;
}

function rateLimit(
  req: Request,
  limit: number,
  windowMs: number,
  pretty = false
): NextResponse | null {
  const key = clientKey(req);
  const now = Date.now();
  const b = RL_STORAGE.get(key);
  if (!b || now > b.reset) {
    RL_STORAGE.set(key, { count: 1, reset: now + windowMs });
    return null;
  }
  if (b.count >= limit) {
    const retryAfter = Math.ceil((b.reset - now) / 1000);
    const resp = jsonPretty(
      { ok: false, error: "rate_limited", retry_after_seconds: retryAfter },
      429,
      pretty
    );
    resp.headers.set("Retry-After", String(retryAfter));
    return resp;
  }
  b.count++;
  return null;
}
// --------------------------------------------------------------------

// GET /api/reports  (list with pretty + pagination + sorting)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const pretty = sp.has("pretty");

  // robust number parsing: use fallback when null/undefined or NaN
  const toNum = (v: string | null, fallback: number) => {
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const limitRaw = toNum(sp.get("limit"), 20);
  const offsetRaw = toNum(sp.get("offset"), 0);
  const limit = Math.max(1, Math.min(100, limitRaw));
  const offset = Math.max(0, offsetRaw);

  // sorting
  const allowed = new Set(["week_start", "created_at", "id", "title"]);
  const sort = (sp.get("sort") ?? "week_start").toLowerCase();
  const order = (sp.get("order") ?? "desc").toLowerCase();
  if (!allowed.has(sort)) {
    return jsonPretty({ ok: false, error: "bad sort; use week_start|created_at|id|title" }, 400, pretty);
  }
  if (order !== "asc" && order !== "desc") {
    return jsonPretty({ ok: false, error: "bad order; use asc|desc" }, 400, pretty);
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT
        id,
        week_start,
        title,
        body,
        created_at,
        COUNT(*) OVER() AS total
      FROM reports
      ORDER BY ${sort} ${order}, id DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    const total = rows.length ? Number(rows[0].total) : 0;

    const items = rows.map((r) => ({
      id: String(r.id),
      week_start: (r.week_start instanceof Date ? r.week_start : new Date(r.week_start))
        .toISOString()
        .slice(0, 10),
      title: r.title as string,
      body: (r.body as string) ?? null,
      created_at: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
    }));

    return jsonPretty({ ok: true, total, limit, offset, sort, order, items }, 200, pretty);
  } catch (e) {
    console.error(e);
    return jsonPretty({ ok: false, error: "DB error" }, 500, pretty);
  } finally {
    client.release();
  }
}

// POST /api/reports  (create) — AUTH ONLY (Bearer token)
export async function POST(req: Request) {
  const url = new URL(req.url);
  const pretty = url.searchParams.has("pretty");

  // --- AUTH CHECK (baby step #1) ---
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.API_TOKEN) {
    return jsonPretty({ ok: false, error: "unauthorized" }, 401, pretty);
  }
  // ---------------------------------

const limited = rateLimit(req, 10, 60_000, pretty); // 10 creates per 60s
if (limited) return limited;


  let data: any;
  try {
    data = await req.json();
  } catch {
    return jsonPretty({ ok: false, error: "Invalid JSON body" }, 400, pretty);
  }

  if (!data?.title || typeof data.title !== "string" || !data.title.trim()) {
    return jsonPretty({ ok: false, error: "Field 'title' (string) is required." }, 400, pretty);
  }

  // optional week_start (YYYY-MM-DD), default to current ISO week Monday (UTC)
  const weekStartStr = (() => {
    if (typeof data.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.week_start)) {
      return data.week_start;
    }
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const deltaToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + deltaToMonday));
    return monday.toISOString().slice(0, 10);
  })();

  const body = typeof data.body === "string" ? data.body : null;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      INSERT INTO reports (week_start, title, body)
      VALUES ($1::date, $2::text, $3::text)
      RETURNING id, week_start, title, body, created_at
      `,
      [weekStartStr, data.title.trim(), body]
    );

    const r = rows[0];
    const item = {
      id: String(r.id),
      week_start: (r.week_start instanceof Date ? r.week_start : new Date(r.week_start))
        .toISOString()
        .slice(0, 10),
      title: r.title as string,
      body: (r.body as string) ?? null,
      created_at: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
    };

    return jsonPretty({ ok: true, item }, 201, pretty);
  } catch (e) {
    console.error(e);
    return jsonPretty({ ok: false, error: "DB error" }, 500, pretty);
  } finally {
    client.release();
  }
}