import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.fatteshha.kuwaitgame',
  appName: 'فتّشها',
  webDir: 'dist',
  backgroundColor: '#020c18',
  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https',
    allowNavigation: [
      '*.run.app',
      '*.supabase.co',
      '*.vercel.app'
    ]
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#020c18',
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#020c18',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020c18',
      overlaysWebView: true
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true
    }
  }
};

export default config;
