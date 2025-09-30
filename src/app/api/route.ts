// src/app/api/route.ts
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

  // pretty is on by default; set ?pretty=false for compact
  const pretty = url.searchParams.get('pretty') !== 'false';

  const endpoints: EndpointDoc[] = [
    {
      method: 'GET',
      path: '/api/reports',
      description: 'List reports. Supports limit, offset, sort, order, pretty.',
      example: `curl "${origin}/api/reports"`,
    },
    {
      method: 'POST',
      path: '/api/reports',
      description: 'Create a report. Requires Bearer token once auth is enabled.',
      example: `curl -X POST "${origin}/api/reports" -H "content-type: application/json" -H "authorization: Bearer <TOKEN>" -d '{"title":"Weekly","body":"notes","week_start":"2025-09-29"}'`,
    },
    {
      method: 'GET',
      path: '/api/reports/[id]',
      description: 'Fetch a single report by id.',
      example: `curl "${origin}/api/reports/REPLACE_ID"`,
    },
    {
      method: 'DELETE',
      path: '/api/reports/[id]',
      description: 'Delete a report by id. Requires Bearer token once auth is enabled.',
      example: `curl -X DELETE "${origin}/api/reports/REPLACE_ID" -H "authorization: Bearer <TOKEN>"`,
    },
    { 
      method: 'POST', path: '/api/reviews',
      description: 'Create a single review. Requires Bearer token.',
      example: `curl -X POST "${origin}/api/reviews" -H "content-type: application/json" -H "authorization: Bearer <TOKEN>" -d '{"source_id":1,"ext_id":"A1","author":"alice","title":"ok","body":"text","rating":4,"product":"SKU-123"}'` },
    { 
      method: 'POST', path: '/api/reviews/bulk',
      description: 'NDJSON bulk ingest of reviews. Each line is one JSON object. Requires Bearer token.',
      example: `printf '%s\\n' '{"source_id":1,"ext_id":"A1","author":"a","body":"good","rating":5,"product":"SKU-123"}' '{"source_id":1,"ext_id":"A2","author":"b","body":"bad","rating":2,"product":"SKU-123"}' | curl -X POST "${origin}/api/reviews/bulk" -H "content-type: application/x-ndjson" -H "authorization: Bearer <TOKEN>" --data-binary @-` 
    },
    { 
      method: 'GET', path: '/api/reviews',
      description: 'List reviews. Filters: product, source, rating_gte, rating_lte, since, q. Supports limit, offset, sort, order, pretty.',
      example: `curl "${origin}/api/reviews?product=SKU-123&rating_gte=4&limit=20&sort=created_at&order=desc"` 
    },
    { 
      method: 'GET', path: '/api/reviews/[id]',
      description: 'Fetch a single review by id.',
      example: `curl "${origin}/api/reviews/REPLACE_ID"` 
    },
    { 
      method: 'DELETE', path: '/api/reviews/[id]',
      description: 'Delete a review by id. Requires Bearer token.',
      example: `curl -X DELETE "${origin}/api/reviews/REPLACE_ID" -H "authorization: Bearer <TOKEN>"` 
    }
  ];

  const json = pretty ? JSON.stringify({ endpoints }, null, 2) : JSON.stringify({ endpoints });
  const body = json + '\n'; // always newline

  return new Response(body, { headers: { 'Content-Type': 'application/json' } });
}