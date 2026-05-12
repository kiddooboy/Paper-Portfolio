import admin from 'firebase-admin';

let initialized = false;

export function getFirebaseAdmin(): admin.app.App {
  if (!initialized) {
    // Prefer file-based credentials (production, via GOOGLE_APPLICATION_CREDENTIALS)
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (credPath) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else if (credJson) {
      let serviceAccount: object;
      try {
        serviceAccount = JSON.parse(credJson);
      } catch {
        throw new Error('FIREBASE_NOT_CONFIGURED');
      }
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount as admin.ServiceAccount) });
    } else {
      throw new Error('FIREBASE_NOT_CONFIGURED');
    }
    initialized = true;
  }
  return admin.app();
}

export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getFirebaseAdmin();
  return app.auth().verifyIdToken(idToken);
}