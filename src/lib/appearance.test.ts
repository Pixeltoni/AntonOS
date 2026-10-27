import { describe, expect, it } from 'vitest';
import { defaultAppearance } from '../demo';
import { backgroundCss, dimOpacity } from './appearance';

describe('Hintergrund', () => {
  const a = defaultAppearance();

  it('nutzt standardmäßig den normalen Hintergrund', () => {
    expect(backgroundCss(a)).toBeNull();
  });
  it('unterstützt Farbe, Verlauf und Bild', () => {
    expect(backgroundCss({ ...a, background: 'farbe', color: '#112233' })).toBe('#112233');
    expect(backgroundCss({ ...a, background: 'verlauf', gradient: 'ozean' })).toContain('linear-gradient');
    expect(backgroundCss({ ...a, background: 'bild', image: 'https://example.com/bg.jpg' })).toContain('url("https://example.com/bg.jpg")');
  });
  it('lässt keine unsicheren Werte durch', () => {
    expect(backgroundCss({ ...a, background: 'farbe', color: 'red; display:none' })).toBeNull();
    expect(backgroundCss({ ...a, background: 'bild', image: 'javascript:alert(1)' })).toBeNull();
    expect(backgroundCss({ ...a, background: 'bild', image: 'https://x.de/a")b.jpg' })).not.toContain('a")b');
  });
  it('begrenzt die Abdunkelung', () => {
    expect(dimOpacity({ ...a, dim: 200 })).toBe(0.8);
    expect(dimOpacity({ ...a, dim: -5 })).toBe(0);
  });
});
