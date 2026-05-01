import admin from 'firebase-admin';

let initialized = false;

export function getFirebaseAdmin(): admin.app.App {
  if (!initialized) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    initialized = true;
  }
  return admin.app();
}

export async function verifyFirebaseToken(idToken: string) {
  const app = getFirebaseAdmin();
  return app.auth().verifyIdToken(idToken);
}
