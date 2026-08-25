import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jazzbarlow.weighttracker',
  appName: 'Weight Tracker',
  webDir: 'dist',
  backgroundColor: '#0b0c0b',
  android: {
    backgroundColor: '#0b0c0b',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0b0c0b',
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

export default config;
