// Next.js API route proxies to backend service to avoid local pg ECONNRESET
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch("http://localhost:3001/list/meetings", {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch meetings", details: error?.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { meetingId, title } = await request.json();
    
    if (!meetingId || !title) {
      return NextResponse.json({ error: "meetingId and title are required" }, { status: 400 });
    }

    const res = await fetch(`http://localhost:3001/update-title/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update meeting title", details: error?.message },
      { status: 500 }
    );
  }
}
