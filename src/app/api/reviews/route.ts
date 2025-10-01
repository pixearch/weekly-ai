import { NextRequest } from 'next/server';
import { query } from '../../../lib/db';

type ReviewInput = {
  source_id: string;
  ext_id: string;
  author?: string | null;
  title?: string | null;
  body?: string | null;
  rating?: number | null;
  created_at: string;       // ISO timestamp
  url?: string | null;
  lang?: string | null;
  product?: string | null;
  tags?: Record<string, any> | null;
};

function json(body: unknown, pretty = true) {
  const s = pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
  return new Response(s + '\n', { headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as Partial<ReviewInput>;

    if (!data.source_id || !data.ext_id || !data.created_at) {
      return json({ ok: false, error: "Required: source_id, ext_id, created_at (ISO string)" });
    }

    const createdAtIso = new Date(data.created_at).toISOString();

    const result = await query(
      `
      INSERT INTO reviews
        (source_id, ext_id, author, title, body, rating, created_at, harvested_at, url, lang, product, tags)
      VALUES
        ($1,        $2,     $3,     $4,   $5,   $6,     $7,        DEFAULT,      $8,  $9,   $10,     $11)
      RETURNING id
      `,
      [
        data.source_id,
        data.ext_id,
        data.author ?? null,
        data.title ?? null,
        data.body ?? null,
        data.rating ?? null,
        createdAtIso,
        data.url ?? null,
        data.lang ?? null,
        data.product ?? null,
        data.tags ? JSON.stringify(data.tags) : null,
      ]
    );

    return json({ ok: true, id: result.rows[0].id });
  } catch (err: any) {
    return json({
      ok: false,
      error: err?.message || 'Server error',
      code: err?.code,
      detail: err?.detail
    });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pretty = url.searchParams.get('pretty') !== 'false';

  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? '20')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  // filters
  const product    = url.searchParams.get('product')    || null;
  const source_id  = url.searchParams.get('source_id')  || null;
  const rating_gte = url.searchParams.get('rating_gte');
  const rating_lte = url.searchParams.get('rating_lte');
  const sinceRaw   = url.searchParams.get('since'); // ISO timestamp

  let sinceIso: string | null = null;
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (!isNaN(d.getTime())) sinceIso = d.toISOString();
  }

  try {
    const params: any[] = [];
    const where: string[] = [];

    if (product) {
      params.push(product);
      where.push(`r.product = $${params.length}`);
    }
    if (source_id) {
      params.push(source_id);
      where.push(`r.source_id = $${params.length}::uuid`);
    }
    if (rating_gte !== null && rating_gte !== undefined) {
      params.push(Number(rating_gte));
      where.push(`r.rating >= $${params.length}::numeric`);
    }
    if (rating_lte !== null && rating_lte !== undefined) {
      params.push(Number(rating_lte));
      where.push(`r.rating <= $${params.length}::numeric`);
    }
    if (sinceIso) {
      params.push(sinceIso);
      where.push(`r.created_at >= $${params.length}::timestamptz`);
    }

    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const sql = `
      SELECT
        r.id, r.source_id, r.ext_id, r.author, r.title, r.body,
        r.rating::float AS rating,
        r.created_at, r.harvested_at, r.url, r.lang, r.product, r.tags
      FROM reviews r
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const { rows } = await query(sql, params);

    const body = pretty
      ? JSON.stringify({ items: rows, limit, offset, product, source_id, rating_gte: rating_gte ?? null, rating_lte: rating_lte ?? null, since: sinceIso }, null, 2)
      : JSON.stringify({ items: rows, limit, offset, product, source_id, rating_gte: rating_gte ?? null, rating_lte: rating_lte ?? null, since: sinceIso });
    return new Response(body + '\n', { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const body = pretty
      ? JSON.stringify({ ok: false, error: err?.message || 'Server error' }, null, 2)
      : JSON.stringify({ ok: false, error: err?.message || 'Server error' });
    return new Response(body + '\n', { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
}
