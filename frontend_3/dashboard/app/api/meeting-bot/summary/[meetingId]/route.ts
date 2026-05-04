import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { meetingId: string } }
) {
  try {
    const res = await fetch(
      `http://localhost:3001/api/meetings/${params.meetingId}/summary`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch summary", details: error?.message },
      { status: 500 }
    );
  }
}
