import { NextRequest } from 'next/server';
import { query } from '../../../../lib/db';

function json(body: unknown, status = 200, pretty = true) {
  const s = pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
  return new Response(s + '\n', { status, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rows } = await query(
      `SELECT id, source_id, ext_id, author, title, body,
              rating::float AS rating, created_at, harvested_at,
              url, lang, product, tags
       FROM reviews
       WHERE id = $1::uuid`,
      [id]
    );
    if (!rows.length) return json({ ok: false, error: 'Not found' }, 404);
    return json({ ok: true, item: rows[0] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Server error' }, 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rowCount } = await query(`DELETE FROM reviews WHERE id = $1::uuid`, [id]);
    if (rowCount === 0) return json({ ok: false, error: 'Not found' }, 404);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Server error' }, 500);
  }
}
