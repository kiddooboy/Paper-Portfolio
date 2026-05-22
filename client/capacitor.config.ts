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
  },
};

export default config;
