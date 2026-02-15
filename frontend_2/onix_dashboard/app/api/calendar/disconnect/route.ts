import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    try {
        const serviceAccount = require('../../../backend/firebase-service-account.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('Failed to initialize Firebase Admin:', error);
    }
}

export async function POST(request: NextRequest) {
    try {
        // Get Firebase token from headers
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'No token provided' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];

        // Verify Firebase token
        const decodedToken = await getAuth().verifyIdToken(token);
        const userId = decodedToken.uid;

        // Get Firestore instance
        const db = admin.firestore();

        // Remove calendar access tokens
        await db.collection('users').doc(userId).update({
            'googleCalendar': admin.firestore.FieldValue.delete(),
            'calendarAccessToken': admin.firestore.FieldValue.delete(),
            'calendarRefreshToken': admin.firestore.FieldValue.delete(),
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error disconnecting calendar:', error);
        return NextResponse.json({
            error: 'Failed to disconnect calendar',
            details: error?.message
        }, { status: 500 });
    }
}
