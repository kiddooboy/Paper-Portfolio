import { Capacitor } from '@capacitor/core';
import axios from 'axios';

// Native push-notification registration (FCM via @capacitor/push-notifications).
// No-op on the website. Call once after the user is authenticated.

let initialised = false;

export async function initPush(): Promise<void> {
  if (initialised || !Capacitor.isNativePlatform()) return;
  initialised = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // Send the FCM token to the server so it can push to this device.
    PushNotifications.addListener('registration', async (token) => {
      try {
        await axios.post('/api/notifications/register-device', {
          token: token.value,
          platform: Capacitor.getPlatform(),
        });
      } catch { /* will retry on next launch */ }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error:', err);
    });

    // Tapping a push opens the relevant area of the app.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action?.notification?.data || {};
      try {
        if (data.symbol) window.location.href = `/terminal/${data.symbol}?fullscreen=1`;
        else window.location.href = '/notifications';
      } catch { /* ignore */ }
    });

    await PushNotifications.register();
  } catch (err) {
    console.warn('[push] init failed:', err);
  }
}
