import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.paperportfolio.app',
  appName: 'Paper Portfolio',
  webDir: 'dist',
  // Serve the bundled web app over https://localhost so secure cookies/APIs work.
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#000000',
      showSpinner: false,
    },
    FirebaseAuthentication: {
      // Native Google sign-in for the Android app (the in-WebView web flow is
      // blocked by Google). Uses the OAuth client from google-services.json.
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
