import { Capacitor } from '@capacitor/core';

// Face ID / Touch ID / fingerprint unlock for the native app.
// We store the user's MPIN in the hardware-backed Keychain/Keystore (gated by
// the OS biometric prompt) so they can re-authenticate with their face/finger
// instead of typing the MPIN. All functions are safe no-ops on the website.

const SERVER = 'in.paperportfolio.app'; // keychain "server" key

export type BiometryInfo = { available: boolean; label: string };

async function plugin() {
  const mod = await import('@capgo/capacitor-native-biometric');
  return mod.NativeBiometric;
}

/** Is biometric hardware available & enrolled on this device? */
export async function getBiometry(): Promise<BiometryInfo> {
  if (!Capacitor.isNativePlatform()) return { available: false, label: '' };
  try {
    const NativeBiometric = await plugin();
    const res = await NativeBiometric.isAvailable({ useFallback: false });
    // BiometryType: 1=TouchID, 2=FaceID, 3=Fingerprint, 4=FaceAuth, 5=IrisAuth
    const t = (res as any).biometryType;
    const label =
      t === 2 || t === 4 ? 'Face ID' :
      t === 1 || t === 3 ? 'Fingerprint' :
      t === 5 ? 'Iris' : 'Biometrics';
    return { available: !!res.isAvailable, label };
  } catch {
    return { available: false, label: '' };
  }
}

/** Save the MPIN behind biometrics (call after a successful MPIN set/login). */
export async function enableBiometricMpin(email: string, mpin: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !email || !mpin) return;
  try {
    const { available } = await getBiometry();
    if (!available) return;
    const NativeBiometric = await plugin();
    await NativeBiometric.setCredentials({ username: email, password: mpin, server: SERVER });
  } catch { /* ignore — biometric is optional */ }
}

/** Prompt Face ID / fingerprint; on success return the stored MPIN (or null). */
export async function unlockWithBiometric(reason = 'Unlock Paper Portfolio'): Promise<{ email: string; mpin: string } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const NativeBiometric = await plugin();
    await NativeBiometric.verifyIdentity({
      reason,
      title: 'Paper Portfolio',
      subtitle: 'Confirm your identity',
    });
    const creds = await NativeBiometric.getCredentials({ server: SERVER });
    if (creds?.password && creds?.username) return { email: creds.username, mpin: creds.password };
    return null;
  } catch {
    // user cancelled / failed / no stored credential
    return null;
  }
}

/** Just prompt Face ID / fingerprint and report success — used to unlock an
 *  already-authenticated session on app open (no credential needed). */
export async function verifyBiometric(reason = 'Unlock Paper Portfolio'): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const NativeBiometric = await plugin();
    await NativeBiometric.verifyIdentity({
      reason,
      title: 'Paper Portfolio',
      subtitle: 'Confirm your identity',
    });
    return true;
  } catch {
    return false;
  }
}

/** True if we have a saved credential to unlock with biometrics. */
export async function hasBiometricMpin(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { available } = await getBiometry();
    if (!available) return false;
    const NativeBiometric = await plugin();
    const creds = await NativeBiometric.getCredentials({ server: SERVER }).catch(() => null);
    return !!creds?.password;
  } catch {
    return false;
  }
}

/** Remove the saved biometric credential (call on logout). */
export async function clearBiometricMpin(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const NativeBiometric = await plugin();
    await NativeBiometric.deleteCredentials({ server: SERVER });
  } catch { /* ignore */ }
}
