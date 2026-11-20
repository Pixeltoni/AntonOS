import type { CapacitorConfig } from '@capacitor/cli';

/** Einstellungen für die iOS-App (Capacitor verpackt den Vite-Build aus `dist/`). */
const config: CapacitorConfig = {
  appId: 'io.github.pixeltoni.antonos',
  appName: 'Daywerk',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f3f4f1',
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#007aff',
    },
  },
};

export default config;
