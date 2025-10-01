import { NextResponse } from 'next/server';

type EndpointDoc = {
  method: string;
  path: string;
  description: string;
  example: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const pretty = url.searchParams.get('pretty') !== 'false';

  const endpoints: EndpointDoc[] = [
    // Reports
    {
      method: 'GET',
      path: '/api/reports',
      description: 'List reports. Supports limit, offset, sort, order, pretty.',
      example: `curl "${origin}/api/reports"`
    },
    {
      method: 'POST',
      path: '/api/reports',
      description: 'Create a report.',
      example: `curl -X POST "${origin}/api/reports" -H "content-type: application/json" -d '{"title":"Weekly","body":"notes","week_start":"2025-09-29"}'`
    },
    {
      method: 'GET',
      path: '/api/reports/[id]',
      description: 'Fetch a single report by id.',
      example: `curl "${origin}/api/reports/REPLACE_ID"`
    },
    {
      method: 'DELETE',
      path: '/api/reports/[id]',
      description: 'Delete a report by id.',
      example: `curl -X DELETE "${origin}/api/reports/REPLACE_ID"`
    },

    // Reviews (implemented)
    {
      method: 'POST',
      path: '/api/reviews',
      description: 'Create a single review.',
      example: `curl -X POST "${origin}/api/reviews" -H "content-type: application/json" -d '{"source_id":"UUID","ext_id":"A1","author":"alice","title":"ok","body":"text","rating":4.5,"created_at":"2025-09-30T00:00:00Z","url":"https://example.com/r/1","lang":"en","product":"SKU-123","tags":{"channel":"test"}}'`
    },
    {
      method: 'GET',
      path: '/api/reviews',
      description: 'List reviews. Filters: product, source_id, rating_gte, rating_lte, since. Supports limit, offset, pretty.',
      example: `curl "${origin}/api/reviews?product=SKU-123&source_id=UUID&rating_gte=4&rating_lte=5&since=2025-09-30T00:00:00Z&limit=10"`
    },
    {
      method: 'GET',
      path: '/api/reviews/[id]',
      description: 'Fetch a single review by id.',
      example: `curl "${origin}/api/reviews/REPLACE_ID"`
    },
    {
      method: 'DELETE',
      path: '/api/reviews/[id]',
      description: 'Delete a review by id.',
      example: `curl -X DELETE "${origin}/api/reviews/REPLACE_ID"`
    }
  ];

  const json = pretty ? JSON.stringify({ endpoints }, null, 2) : JSON.stringify({ endpoints });
  return new Response(json + '\n', { headers: { 'Content-Type': 'application/json' } });
}
