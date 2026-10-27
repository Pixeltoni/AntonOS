import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Eindeutige Kennung pro Build; die App vergleicht sie mit version.json, um Updates zu erkennen
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const version = env.GITHUB_SHA?.slice(0, 7) ?? String(Date.now());

function versionFile(): Plugin {
  return {
    name: 'antonos-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), versionFile()],
});
