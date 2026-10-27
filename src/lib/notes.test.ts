import { describe, expect, it } from 'vitest';
import { cardsFromText, dateGroup, extractLinks, extractTags, noteSnippet, noteTitle, parseBlocks, parseInline, toggleCheck, togglePrefix, wrapSelection } from './notes';

const text = '# Folgen\nEine **Folge** konvergiert #klausur\n- [ ] Blatt 4\n- [x] VL 3\n- Beispiel\n\n## Teil 2 [[Übungsblatt 4]]';

describe('Notizen', () => {
  it('erkennt Blöcke', () => {
    expect(parseBlocks(text).map((b) => b.kind)).toEqual(['h1', 'p', 'check', 'check', 'li', 'empty', 'h2']);
    expect(parseBlocks(text)[3]).toEqual({ kind: 'check', done: true, text: 'VL 3', line: 3 });
  });
  it('hakt Checklisten ab', () => {
    expect(toggleCheck(text, 2).split('\n')[2]).toBe('- [x] Blatt 4');
    expect(toggleCheck(text, 3).split('\n')[3]).toBe('- [ ] VL 3');
    expect(toggleCheck(text, 1)).toBe(text);
  });
  it('zerlegt Formatierung in einer Zeile', () => {
    expect(parseInline('Eine **Folge** ist *wichtig* #klausur, siehe [[Blatt 4]] und https://x.de')).toEqual([
      { kind: 'text', text: 'Eine ' }, { kind: 'bold', text: 'Folge' }, { kind: 'text', text: ' ist ' }, { kind: 'italic', text: 'wichtig' },
      { kind: 'text', text: ' ' }, { kind: 'tag', text: 'klausur' }, { kind: 'text', text: ', siehe ' }, { kind: 'link', text: 'Blatt 4' },
      { kind: 'text', text: ' und ' }, { kind: 'url', text: 'https://x.de' },
    ]);
    expect(parseInline('Raum C#3')).toEqual([{ kind: 'text', text: 'Raum C#3' }]);
  });
  it('findet Tags, Links, Titel und Vorschau', () => {
    expect(extractTags(text + ' #Klausur #idee')).toEqual(['klausur', 'idee']);
    expect(extractLinks(text)).toEqual(['Übungsblatt 4']);
    expect(noteTitle({ title: '', content: text })).toBe('Folgen');
    expect(noteTitle({ title: '', content: '' })).toBe('Neue Notiz');
    expect(noteSnippet({ title: '', content: text }).startsWith('Eine Folge konvergiert')).toBe(true);
  });
  it('gruppiert nach Datum', () => {
    const now = new Date(2026, 9, 27, 10);
    expect(dateGroup(new Date(2026, 9, 27, 1).toISOString(), now)).toBe('Heute');
    expect(dateGroup(new Date(2026, 9, 26, 23).toISOString(), now)).toBe('Gestern');
    expect(dateGroup(new Date(2026, 9, 22).toISOString(), now)).toBe('Letzte 7 Tage');
    expect(dateGroup(new Date(2026, 5, 1).toISOString(), now)).toBe('Älter');
  });
  it('macht Lernkarten aus Text', () => {
    expect(cardsFromText('Was ist eine Folge? Eine Abbildung von ℕ nach ℝ\n**Grenzwert**: Zahl, gegen die die Folge strebt\n- Supremum – kleinste obere Schranke\nNur Text')).toEqual([
      { front: 'Was ist eine Folge?', back: 'Eine Abbildung von ℕ nach ℝ' },
      { front: 'Grenzwert', back: 'Zahl, gegen die die Folge strebt' },
      { front: 'Supremum', back: 'kleinste obere Schranke' },
    ]);
  });
  it('formatiert per Tastenkürzel', () => {
    const r = togglePrefix('a\nb\nc', 0, 3, '- [ ] ');
    expect(r.content).toBe('- [ ] a\n- [ ] b\nc');
    expect(togglePrefix(r.content, 0, 2, '- [ ] ').content).toBe('a\n- [ ] b\nc');
    expect(togglePrefix('- x', 1, 1, '# ').content).toBe('# x');
    expect(togglePrefix('a\n', 2, 2, '- [ ] ')).toEqual({ content: 'a\n- [ ] ', from: 8, to: 8 });
    expect(wrapSelection('ab cd', 3, 5, '**')).toEqual({ content: 'ab **cd**', from: 5, to: 7 });
  });
});
