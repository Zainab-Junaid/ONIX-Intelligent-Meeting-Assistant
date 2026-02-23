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

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (() => {
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
