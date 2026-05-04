import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getBackendUrl } from '@/lib/backend';
import { getFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  return !!getFirebaseAdmin();
}

export async function GET(request: NextRequest, props: { params: Promise<{ meetingId: string }> }) {
  const params = await props.params;
  try {
    const meetingId = params.meetingId;
    
    // Get Firebase token from headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await getAuth().verifyIdToken(token);
    // const userId = decodedToken.uid;

    initFirebase();
    
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/meetings/${meetingId}/analytics`, { 
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
        if (res.status === 404) {
             return NextResponse.json({ error: 'Analytics not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to fetch analytics from backend', details: await res.text() }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error(`Error fetching analytics for meeting ${params.meetingId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch analytics', details: error?.message }, { status: 500 });
  }
}
