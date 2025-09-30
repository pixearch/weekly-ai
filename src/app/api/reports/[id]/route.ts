// app/api/reports/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const revalidate = 0;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// pretty helper (adds trailing newline)
function jsonPretty(data: any, status = 200, pretty = false) {
  const body = (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n";
  return new NextResponse(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** -------- rate limiter (persist across dev reloads) -------- */
type Bucket = { count: number; reset: number };
// @ts-ignore
const RL_STORAGE: Map<string, Bucket> = (globalThis.__RL_BUCKETS_DETAIL__ ||= new Map());

function clientKey(req: Request, id: number): string {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  const token = m?.[1] ?? "anon";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  return `${token}:${ip}:DELETE:/api/reports/${id}`;
}

function rateLimitDelete(req: Request, id: number, limit: number, windowMs: number, pretty = false) {
  const key = clientKey(req, id);
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
/** ----------------------------------------------------------- */

// GET /api/reports/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const pretty = req.nextUrl.searchParams.has("pretty");
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return jsonPretty({ ok: false, error: "bad id" }, 400, pretty);
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

    if (rows.length === 0) return jsonPretty(null, 404, pretty);

    const r = rows[0];
    const out = {
      id: String(r.id),
      week_start: (r.week_start instanceof Date ? r.week_start : new Date(r.week_start))
        .toISOString()
        .slice(0, 10),
      title: r.title as string,
      body: (r.body as string) ?? null,
      created_at: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
    };

    return jsonPretty(out, 200, pretty);
  } catch (e) {
    console.error(e);
    return jsonPretty({ ok: false, error: "DB error" }, 500, pretty);
  } finally {
    client.release();
  }
}

// PUT /api/reports/[id]  (AUTH)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const pretty = req.nextUrl.searchParams.has("pretty");

  // AUTH
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.API_TOKEN) {
    return jsonPretty({ ok: false, error: "unauthorized" }, 401, pretty);
  }

  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return jsonPretty({ ok: false, error: "bad id" }, 400, pretty);
  }

  let data: any;
  try {
    data = await req.json();
  } catch {
    return jsonPretty({ ok: false, error: "invalid json" }, 400, pretty);
  }

  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (typeof data.title === "string") {
    const t = data.title.trim();
    if (!t) return jsonPretty({ ok: false, error: "title cannot be empty" }, 400, pretty);
    sets.push(`title = $${i++}`);
    vals.push(t);
  }

  if (typeof data.body === "string" || data.body === null) {
    sets.push(`body = $${i++}`);
    vals.push(data.body);
  }

  if (typeof data.week_start === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.week_start)) {
      return jsonPretty({ ok: false, error: "week_start must be YYYY-MM-DD" }, 400, pretty);
    }
    sets.push(`week_start = $${i++}::date`);
    vals.push(data.week_start);
  }

  if (sets.length === 0) {
    return jsonPretty({ ok: false, error: "no fields to update" }, 400, pretty);
  }

  vals.push(idNum);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE reports
       SET ${sets.join(", ")}
       WHERE id = $${i}
       RETURNING id, week_start, title, body, created_at`,
      vals
    );

    if (rows.length === 0) return jsonPretty(null, 404, pretty);

    const r = rows[0];
    const out = {
      id: String(r.id),
      week_start: (r.week_start instanceof Date ? r.week_start : new Date(r.week_start))
        .toISOString()
        .slice(0, 10),
      title: r.title as string,
      body: (r.body as string) ?? null,
      created_at: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
    };

    return jsonPretty(out, 200, pretty);
  } catch (e) {
    console.error(e);
    return jsonPretty({ ok: false, error: "DB error" }, 500, pretty);
  } finally {
    client.release();
  }
}

// DELETE /api/reports/[id]  (AUTH + RATE LIMIT)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const pretty = req.nextUrl.searchParams.has("pretty");

  // AUTH
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token !== process.env.API_TOKEN) {
    return jsonPretty({ ok: false, error: "unauthorized" }, 401, pretty);
  }

  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return jsonPretty({ ok: false, error: "bad id" }, 400, pretty);
  }

  // RATE LIMIT: e.g. 20 deletes / 60s for this specific id+client
  const limited = rateLimitDelete(req, idNum, 20, 60_000, pretty);
  if (limited) return limited;

  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(`DELETE FROM reports WHERE id = $1`, [idNum]);
    if (rowCount === 0) return jsonPretty(null, 404, pretty);
    return jsonPretty({ ok: true, deleted: idNum }, 200, pretty);
  } catch (e) {
    console.error(e);
    return jsonPretty({ ok: false, error: "DB error" }, 500, pretty);
  } finally {
    client.release();
  }
}