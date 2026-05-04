import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ meetingId: string }> }
) {
    const { meetingId } = await params

    try {
        const response = await fetch(`${BACKEND_URL}/api/meetings/${meetingId}/analytics`, {
            headers: {
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Failed to fetch analytics' }))
            return NextResponse.json(error, { status: response.status })
        }

        const data = await response.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Error fetching analytics:', error)
        return NextResponse.json(
            { error: 'Failed to connect to backend' },
            { status: 500 }
        )
    }
}
