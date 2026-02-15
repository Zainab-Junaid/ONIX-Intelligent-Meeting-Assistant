import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const meetingId = params.id;

    try {
        const response = await fetch(`http://localhost:3001/meeting/${meetingId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorData = await response.json();
            return NextResponse.json(
                { error: errorData.error || 'Failed to delete bot meeting' },
                { status: response.status }
            );
        }

        const result = await response.json();
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error proxying bot meeting deletion:', error);
        return NextResponse.json(
            { error: 'Failed to connect to bot backend', details: error?.message },
            { status: 500 }
        );
    }
}
