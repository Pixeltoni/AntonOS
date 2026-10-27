import type { Appearance } from '../types';
import { safeImageSrc } from './life';

export const GRADIENTS: { id: string; label: string; css: string }[] = [
  { id: 'herbst', label: 'Herbst', css: 'linear-gradient(135deg, #2b140a, #7c2d12 40%, #c2410c 75%, #f59e0b)' },
  { id: 'sonnenuntergang', label: 'Sonnenuntergang', css: 'linear-gradient(135deg, #3b0764, #9d174d 45%, #ea580c 80%, #fbbf24)' },
  { id: 'ozean', label: 'Ozean', css: 'linear-gradient(135deg, #0f172a, #0c4a6e 45%, #0e7490 75%, #22d3ee)' },
  { id: 'wald', label: 'Wald', css: 'linear-gradient(135deg, #052e16, #14532d 45%, #3f6212 80%, #a3e635)' },
  { id: 'nacht', label: 'Nacht', css: 'linear-gradient(135deg, #020617, #1e1b4b 55%, #3730a3)' },
  { id: 'lavendel', label: 'Lavendel', css: 'linear-gradient(135deg, #ede9fe, #c4b5fd 50%, #f5d0fe)' },
  { id: 'pfirsich', label: 'Pfirsich', css: 'linear-gradient(135deg, #fff7ed, #fed7aa 50%, #fecaca)' },
  { id: 'minze', label: 'Minze', css: 'linear-gradient(135deg, #ecfdf5, #a7f3d0 50%, #bae6fd)' },
];

/** CSS-Hintergrund für den gewählten Stil, oder null für den Standard-Hintergrund. */
export function backgroundCss(a: Appearance): string | null {
  switch (a.background) {
    case 'farbe':
      return /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : null;
    case 'verlauf':
      return GRADIENTS.find((g) => g.id === a.gradient)?.css ?? null;
    case 'bild': {
      const src = safeImageSrc(a.image);
      // Anführungszeichen maskieren, damit die URL den CSS-Wert nicht verlassen kann
      return src ? `center / cover no-repeat url("${src.replace(/["\\\n]/g, encodeURIComponent)}")` : null;
    }
    default:
      return null;
  }
}

/** Abdunkelung als Overlay-Deckkraft (0–0.8). */
export function dimOpacity(a: Appearance): number {
  return Math.min(80, Math.max(0, a.dim)) / 100;
}
