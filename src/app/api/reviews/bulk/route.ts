import { NextRequest } from 'next/server';
import { pg } from '../../../../lib/db';

type Row = {
  source_id: string;
  ext_id: string;
  author?: string | null;
  title?: string | null;
  body?: string | null;
  rating?: number | null;
  created_at: string; // ISO
  url?: string | null;
  lang?: string | null;
  product?: string | null;
  tags?: Record<string, any> | null;
};

function json(body: unknown, status = 200, pretty = true) {
  const s = pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
  return new Response(s + '\n', { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: NextRequest) {
  const pretty = new URL(req.url).searchParams.get('pretty') !== 'false';

  let payload: string;
  try {
    payload = await req.text();
  } catch {
    return json({ ok: false, error: 'Failed to read request body' }, 400, pretty);
  }

  const lines = payload.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return json({ ok: false, error: 'No lines found' }, 400, pretty);

  const client = await pg.connect();
  const errors: { line: number; error: string }[] = [];
  let inserted = 0;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;

      let row: Row;
      try {
        row = JSON.parse(lines[i]);
      } catch (e: any) {
        errors.push({ line: lineNo, error: `Invalid JSON: ${e?.message ?? 'parse error'}` });
        continue;
      }

      if (!row.source_id || !row.ext_id || !row.created_at) {
        errors.push({ line: lineNo, error: 'Required fields: source_id, ext_id, created_at' });
        continue;
      }

      const createdAtIso = new Date(row.created_at).toISOString();
      try {
        const res = await client.query(
          `
          INSERT INTO reviews
            (source_id, ext_id, author, title, body, rating, created_at, harvested_at, url, lang, product, tags)
          VALUES
            ($1,        $2,     $3,     $4,   $5,   $6,     $7,        DEFAULT,      $8,  $9,   $10,     $11)
          ON CONFLICT (source_id, ext_id) DO NOTHING
          `,
          [
            row.source_id,
            row.ext_id,
            row.author ?? null,
            row.title ?? null,
            row.body ?? null,
            row.rating ?? null,
            createdAtIso,
            row.url ?? null,
            row.lang ?? null,
            row.product ?? null,
            row.tags ? JSON.stringify(row.tags) : null,
          ]
        );
        // rowCount === 1 if inserted, 0 if conflict
        inserted += res.rowCount ?? 0;
      } catch (e: any) {
        errors.push({ line: lineNo, error: e?.detail || e?.message || 'insert error' });
      }
    }

    await client.query('COMMIT');
  } catch (e: any) {
    await client.query('ROLLBACK');
    return json({ ok: false, error: e?.message || 'Transaction failed' }, 500, pretty);
  } finally {
    client.release();
  }

  return json({ ok: true, took_lines: lines.length, inserted, errors }, 200, pretty);
}
