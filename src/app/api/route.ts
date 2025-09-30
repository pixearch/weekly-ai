// src/app/api/route.ts
import { NextResponse } from 'next/server';

type EndpointDoc = {
  method: string;
  path: string;
  description: string;
  example: string;
};

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;

  const endpoints: EndpointDoc[] = [
    {
      method: 'GET',
      path: '/api/reports',
      description: 'List reports. Supports limit, offset, sort, order, pretty, newline.',
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
  ];

  // Pretty-print JSON
  return new Response(JSON.stringify({ endpoints }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}