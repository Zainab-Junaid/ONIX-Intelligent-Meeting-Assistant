import { NextRequest, NextResponse } from 'next/server';

// CORS headers for Chrome extension requests
// The extension's origin is chrome-extension://<id> which we allow alongside the deployed dashboard
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-guest-mode, x-user-id',
  'Access-Control-Max-Age': '86400',
};

/**
 * Returns a preflight OPTIONS response with CORS headers.
 * Add this as an exported OPTIONS function in every extension-meetings route.
 */
export function handleOptions() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Wraps a NextResponse and injects CORS headers into it.
 */
export function withCors(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
