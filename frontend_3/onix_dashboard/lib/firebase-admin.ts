import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// Initialize Firebase Admin if not already initialized
function initFirebase() {
  console.log('🔄 initFirebase() in lib/firebase-admin called');

  if (admin.apps.length > 0) {
    console.log('✅ Firebase Admin app already exists, reusing.');
    return admin.app();
  }

  let serviceAccount: object | null = null;

  // ── 1. Try env variable first (required on Vercel / any cloud deployment) ──
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      serviceAccount = typeof envJson === 'string' ? JSON.parse(envJson) : envJson;
      console.log('✅ Loaded Firebase service account from FIREBASE_SERVICE_ACCOUNT_JSON env var');
    } catch (e: any) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON env var:', e.message);
    }
  }

  // ── 2. Fall back to local file (local dev only) ──
  if (!serviceAccount) {
    const candidatePaths = [
      path.resolve(process.cwd(), 'backend', 'firebase-service-account.json'),
      path.resolve(process.cwd(), 'firebase-service-account.json'),
      path.resolve(process.cwd(), '..', 'backend', 'firebase-service-account.json'),
      path.resolve(process.cwd(), '..', '..', 'backend', 'firebase-service-account.json'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
          console.log('✅ Loaded Firebase service account from file:', p);
          break;
        } catch (e: any) {
          console.error('❌ Error reading service account file at', p, ':', e.message);
        }
      }
    }
  }

  if (!serviceAccount) {
    console.error(
      '❌ Firebase Service Account credentials not found.\n' +
      '   On Vercel: set FIREBASE_SERVICE_ACCOUNT_JSON environment variable to the full JSON string.\n' +
      '   Locally: place firebase-service-account.json in the backend/ folder.'
    );
    return null;
  }

  try {
    console.log('🚀 Initializing Firebase Admin SDK...');
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized successfully');
    return app;
  } catch (e: any) {
    console.error('❌ Failed to initialize Firebase App:', e.message);
    return null;
  }
}

let firebaseAdminApp: admin.app.App | null = null;

export function getFirebaseAdmin() {
  if (!firebaseAdminApp) {
    firebaseAdminApp = initFirebase();
  }
  return firebaseAdminApp;
}
