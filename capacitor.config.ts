import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uz.fpssoccer.game',
  appName: 'FPS Soccer',
  webDir: 'dist',
  bundledWebRuntime: false,
  backgroundColor: '#07131e',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};
export default config;
