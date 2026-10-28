import { describe, expect, it } from 'vitest';
import { categorize, parseShopping, rememberBought } from './shopping';

describe('Einkaufsliste', () => {
  it('ordnet Abteilungen zu', () => {
    expect(categorize('Äpfel')).toBe('obst');
    expect(categorize('Vollkornbrot')).toBe('backwaren');
    expect(categorize('Eier')).toBe('kuehl');
    expect(categorize('Reis')).toBe('vorrat');
    expect(categorize('Eis')).toBe('tk');
    expect(categorize('Tiefkühl-Spinat')).toBe('tk');
    expect(categorize('Orangensaft')).toBe('getraenke');
    expect(categorize('Zahnpasta')).toBe('drogerie');
    expect(categorize('Geschenkpapier')).toBe('sonstiges');
  });
  it('versteht mehrere Artikel mit Mengen', () => {
    expect(parseShopping('milch, 6 Eier; 500 g Hack\nÄpfel x3')).toEqual([
      { name: 'Milch', amount: '' },
      { name: 'Eier', amount: '6' },
      { name: 'Hack', amount: '500 g' },
      { name: 'Äpfel', amount: '3' },
    ]);
    expect(parseShopping(' , ')).toEqual([]);
    expect(parseShopping('1,5 l Milch, Brot')).toEqual([{ name: 'Milch', amount: '1,5 l' }, { name: 'Brot', amount: '' }]);
  });
  it('merkt sich häufige Artikel', () => {
    const f = rememberBought([{ name: 'Milch', count: 2 }], ['milch', 'Brot', 'Brot']);
    expect(f).toEqual([{ name: 'Milch', count: 3 }, { name: 'Brot', count: 2 }]);
  });
});
