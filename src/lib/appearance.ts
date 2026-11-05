import type { Appearance } from '../types';
import { safeImageSrc } from './life';

/** Prüft gespeicherte Design-Einstellungen; Unbekanntes fällt auf den Standard zurück. */
export function normalizeAppearanceData(stored: unknown, base: Appearance): Appearance {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const theme = s.theme === 'hell' || s.theme === 'dunkel' || s.theme === 'system' ? s.theme : base.theme;
  // Früher gab es „background: 'bild'“ – ein Bild zählt nur, wenn es damals auch gewählt war
  const legacyOff = typeof s.background === 'string' && s.background !== 'bild';
  const image = !legacyOff && typeof s.image === 'string' && safeImageSrc(s.image) ? s.image : '';
  const dim = typeof s.dim === 'number' && Number.isFinite(s.dim) ? clampDim(s.dim) : base.dim;
  return { theme, image, dim };
}

function clampDim(n: number): number {
  return Math.min(80, Math.max(0, Math.round(n)));
}

/** CSS-Hintergrund für das eigene Bild, oder null ohne (gültiges) Bild. */
export function backgroundCss(a: Appearance): string | null {
  const src = safeImageSrc(a.image);
  // Anführungszeichen maskieren, damit die URL den CSS-Wert nicht verlassen kann
  return src ? `center / cover no-repeat url("${src.replace(/["\\\n]/g, encodeURIComponent)}")` : null;
}

/** Deckkraft des Schleiers über dem Bild (0–0.8). */
export function dimOpacity(a: Appearance): number {
  return clampDim(a.dim) / 100;
}
