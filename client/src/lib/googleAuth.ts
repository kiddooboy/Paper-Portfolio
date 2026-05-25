import { Capacitor } from '@capacitor/core';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider, preferRedirect } from './firebase';

// Unified Google sign-in.
// Returns a **Firebase ID token** to POST to /api/auth/firebase, or null when a
// web redirect was started (in which case getRedirectResult completes it on
// return). Branches by platform:
//   - Native app  → native Google Sign-In via @capacitor-firebase/authentication
//                   (the in-WebView web OAuth flow is blocked by Google), then
//                   reads the Firebase ID token from the native session.
//   - Website      → popup (desktop) or redirect (mobile browsers).
export async function googleSignIn(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    // useCredentialManager:false → classic Google Sign-In flow. The newer
    // Credential Manager API isn't available on many devices/emulators
    // ("device doesn't support credential manager"), so use the legacy flow
    // which works wherever Google Play services are present.
    await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
    const { token } = await FirebaseAuthentication.getIdToken();
    return token;
  }

  // Website
  if (preferRedirect) {
    await signInWithRedirect(auth, googleProvider);
    return null; // navigates away; getRedirectResult handles the return
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return await result.user.getIdToken();
  } catch (err: any) {
    const code: string = err?.code || '';
    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}
