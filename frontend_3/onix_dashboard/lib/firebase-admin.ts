// import 'server-only'; // Removed as package is missing in frontend_3
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

  // Parse env JSON string to object if present (cert() expects an object)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountFromEnv = raw ? (() => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' && parsed.private_key ? parsed : null;
    } catch (e: any) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:', e.message);
      return null;
    }
  })() : null;

  // Optional: load from file path in env (e.g. FIREBASE_SERVICE_ACCOUNT_PATH=./backend/firebase-service-account.json)
  const pathFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountFromPath = pathFromEnv ? (() => {
    try {
      const resolved = path.resolve(process.cwd(), pathFromEnv);
      if (fs.existsSync(resolved)) {
        console.log('   ✅ Found service account at FIREBASE_SERVICE_ACCOUNT_PATH:', resolved);
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
      }
      console.warn('   FIREBASE_SERVICE_ACCOUNT_PATH set but file not found:', resolved);
      return null;
    } catch (e: any) {
      console.error('❌ Error reading FIREBASE_SERVICE_ACCOUNT_PATH:', e.message);
      return null;
    }
  })() : null;

  const serviceAccount = serviceAccountFromEnv || serviceAccountFromPath || (() => {
    try {
      console.log('🔍 Locating service account file...');
      
      const keyPath = path.resolve(process.cwd(), 'backend', 'firebase-service-account.json');
      console.log('   Checking contents of:', keyPath);
      
      if (fs.existsSync(keyPath)) {
        console.log('   ✅ Found service account at backend/firebase-service-account.json');
        return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      }

      // Check alternate location just in case
      const localDevPath = path.join(process.cwd(), 'backend', 'firebase-service-account.json');
      console.log('   Checking contents of:', localDevPath);
      if (fs.existsSync(localDevPath)) {
         console.log('   ✅ Found service account via join path');
         return JSON.parse(fs.readFileSync(localDevPath, 'utf8'));
      }
      
      // Try one level up if cwd is frontend/dashboard
      const upOnePath = path.resolve(process.cwd(), '..', '..', 'backend', 'firebase-service-account.json');
      console.log('   Checking contents of:', upOnePath);
      if (fs.existsSync(upOnePath)) {
         console.log('   ✅ Found service account via up-one path');
         return JSON.parse(fs.readFileSync(upOnePath, 'utf8'));
      }

      // Try looking in the root backend folder if we are in frontend_2/onix_dashboard
      const rootBackendPath = path.resolve(process.cwd(), '..', '..', 'backend', 'firebase-service-account.json');
      console.log('   Checking contents of (root backend):', rootBackendPath);
      if (fs.existsSync(rootBackendPath)) {
         console.log('   ✅ Found service account via root backend path');
         return JSON.parse(fs.readFileSync(rootBackendPath, 'utf8'));
      }

      console.error('❌ Credentials path not found in any expected location. CWD is:', process.cwd());
      return null;
    } catch (error: any) {
      console.error('❌ Error loading service account:', error.message);
      return null;
    }
  })();

  if (!serviceAccount) {
    console.error('❌ Firebase Service Account credentials missing or failed to load');
    // Don't throw top-level, let the caller handle null
    return null;
  }

  try {
    console.log('🚀 Initializing Firebase Admin SDK...');
    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
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
