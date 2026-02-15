// Next.js API route proxies to backend service to avoid local pg ECONNRESET
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch('http://localhost:3001/list/summaries', { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch summaries', details: error?.message }, { status: 500 });
  }
}
