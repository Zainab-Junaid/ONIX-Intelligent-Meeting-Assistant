import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getBackendUrl } from '@/lib/backend';

getFirebaseAdmin();

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: meetingId } = params;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }
  const token = authHeader.split('Bearer ')[1];

  try {
    await getAuth().verifyIdToken(token);

    const backendUrl = getBackendUrl();

    let res: Response;
    try {
      res = await fetch(`${backendUrl}/meetings/${meetingId}`, {
        method: 'DELETE',
      });
    } catch (fetchErr: any) {
      if (fetchErr?.code === 'ECONNREFUSED' || fetchErr?.message?.includes('fetch failed')) {
        return NextResponse.json(
          { error: 'Meeting bot backend is not running. Start it to delete meetings.' },
          { status: 503 }
        );
      }
      throw fetchErr;
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const msg = errorBody.error || 'Backend failed to delete';
      if (res.status === 404) {
        return NextResponse.json({ success: true, message: 'Meeting not found or already deleted' });
      }
      return NextResponse.json({ error: msg, details: errorBody.details }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Proxy] Delete error for', meetingId, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
