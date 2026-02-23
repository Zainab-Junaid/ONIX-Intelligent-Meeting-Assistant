
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin
getFirebaseAdmin();

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: meetingId } = await params;
  if (!meetingId) {
    return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 });
  }

  // 1. Auth
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }
  const token = authHeader.split('Bearer ')[1];
  
  try {
    await getAuth().verifyIdToken(token);
    // const userId = decodedToken.uid; 
    // TODO: Verify meeting ownership if needed. For now trusting the ID from authenticated user.

    // 2. Proxy to backend
    // Use internal URL (127.0.0.1) which is available on the server side
    const botBase = process.env.BOT_BACKEND_URL || 'http://127.0.0.1:3001';
    console.log(`[Proxy] Deleting meeting ${meetingId} via ${botBase}`);
    
    let res: Response;
    try {
      res = await fetch(`${botBase}/meetings/${meetingId}`, {
        method: "DELETE",
      });
    } catch (fetchErr: any) {
      if (fetchErr?.code === 'ECONNREFUSED' || fetchErr?.message?.includes('fetch failed')) {
        console.warn('[Proxy] Meeting bot backend unreachable - cannot delete.');
        return NextResponse.json(
          { error: 'Meeting bot backend is not running. Start it to delete meetings.' },
          { status: 503 }
        );
      }
      throw fetchErr;
    }

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      const msg = errorBody.error || "Backend failed to delete";
      if (res.status === 404) {
        // Meeting already gone or not found - treat as success so UI can remove it from the list
        return NextResponse.json({ success: true, message: 'Meeting not found or already deleted' });
      }
      console.error(`[Proxy] Backend delete failed: ${res.status}`, msg);
      return NextResponse.json({ error: msg, details: errorBody.details }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error(`[Proxy] Delete error for ${meetingId}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
