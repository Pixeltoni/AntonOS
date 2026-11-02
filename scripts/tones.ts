// Erzeugt die Wecktöne für die iOS-App: npx vite-node scripts/tones.ts
import { writeFileSync } from 'node:fs';
import { NATIVE_TONE_SECONDS, TONES, toneFile, toneWav } from '../src/lib/tones';

for (const t of TONES) {
  const path = `ios/App/App/Tones/${toneFile(t.id)}`;
  writeFileSync(path, toneWav(t.id, NATIVE_TONE_SECONDS));
  console.log('geschrieben:', path);
}
