// Next.js API route proxies to backend service for MongoDB transcript data
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this API route (required with output: export)
export const dynamic = 'force-dynamic';
export async function GET(
    _request: NextRequest,
    { params }: { params: { meetingId: string } }
) {
    try {
        const { meetingId } = await params;
        const res = await fetch(`http://localhost:3001/api/meetings/${meetingId}/transcript`, {
            cache: 'no-store'
        });

        if (!res.ok) {
            const errorData = await res.text();
            return NextResponse.json(
                { error: 'Transcript not found', details: errorData },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Failed to fetch transcript', details: error?.message },
            { status: 500 }
        );
    }
}
