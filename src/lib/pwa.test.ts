import { describe, expect, it } from 'vitest';
import { parseShared } from './pwa';

describe('Teilen-Menü', () => {
  it('liest geteilte Inhalte', () => {
    expect(parseShared('')).toBeNull();
    expect(parseShared('?title=Dune&url=https%3A%2F%2Fexample.org%2Fdune')).toEqual({ title: 'Dune', text: '', url: 'https://example.org/dune' });
    // Link steckt im Text (z. B. aus Safari oder YouTube)
    expect(parseShared('?text=Schau%20mal%20https%3A%2F%2Fyoutu.be%2Fabc')).toEqual({ title: 'Schau mal', text: '', url: 'https://youtu.be/abc' });
    expect(parseShared('?title=&text=&url=')).toBeNull();
  });
});
