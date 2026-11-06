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

describe('Notizen: neue Bausteine', () => {
  it('erkennt Zitat, Hinweis und Trennlinie', async () => {
    const { parseBlocks, noteSnippet } = await import('./notes');
    expect(parseBlocks('> Zitat\n! Wichtig\n---\n- Punkt').map((b) => b.kind)).toEqual(['quote', 'callout', 'hr', 'li']);
    expect(parseBlocks('> Zitat')[0]).toEqual({ kind: 'quote', text: 'Zitat', line: 0 });
    expect(noteSnippet({ title: 'T', content: '> Zitat\n---\n! Hinweis' })).toBe('Zitat Hinweis');
  });
  it('umschließt die Auswahl', async () => {
    const { wrapWith } = await import('./notes');
    expect(wrapWith('siehe Formeln', 6, 13, '[[', ']]')).toEqual({ content: 'siehe [[Formeln]]', from: 8, to: 15 });
    expect(wrapWith('ab', 1, 1, '#', '')).toEqual({ content: 'a#b', from: 2, to: 2 });
  });
  it('setzt Haken über den Text', async () => {
    const { setCheckByText } = await import('./notes');
    const c = 'a\n- [ ] Blatt 4\n- [x] VL 3';
    expect(setCheckByText(c, 'Blatt 4', true)).toBe('a\n- [x] Blatt 4\n- [x] VL 3');
    expect(setCheckByText(c, 'VL 3', false)).toBe('a\n- [ ] Blatt 4\n- [ ] VL 3');
    expect(setCheckByText(c, 'fehlt', true)).toBe(c);
  });
  it('zieht Haken mit, wenn die Aufgabe erledigt wird', async () => {
    const { syncTaskCheck } = await import('./notes');
    const notes = [{ id: 'n', title: '', courseId: null, content: '- [ ] Blatt 4', updated: '' }];
    const task = { noteId: 'n', noteLine: 'Blatt 4' };
    expect(syncTaskCheck(notes, { status: 'offen' }, { ...task, status: 'erledigt' })[0].content).toBe('- [x] Blatt 4');
    expect(syncTaskCheck(notes, { status: 'offen' }, { ...task, status: 'in Arbeit' })).toBe(notes);
    expect(syncTaskCheck(notes, { status: 'offen' }, { status: 'erledigt' })).toBe(notes);
  });
  it('räumt „Zuletzt gelöscht“ nach 30 Tagen auf', async () => {
    const { purgeDeleted, trashDaysLeft, liveNotes } = await import('./notes');
    const now = new Date('2026-11-06T12:00:00');
    const notes = [
      { id: 'a' },
      { id: 'b', deletedAt: '2026-11-05T12:00:00' },
      { id: 'c', deletedAt: '2026-10-01T12:00:00' },
    ];
    expect(trashDaysLeft('2026-11-05T12:00:00', now)).toBe(29);
    expect(purgeDeleted(notes, now).map((n) => n.id)).toEqual(['a', 'b']);
    expect(liveNotes(notes).map((n) => n.id)).toEqual(['a']);
  });
  it('findet Rückverweise', async () => {
    const { backlinks } = await import('./notes');
    const notes = [
      { id: '1', title: 'Formeln', courseId: null, content: 'x', updated: '' },
      { id: '2', title: 'VL 6', courseId: null, content: 'siehe [[formeln]]', updated: '' },
      { id: '3', title: 'Alt', courseId: null, content: '[[Formeln]]', updated: '', deletedAt: '2026-11-01' },
    ];
    expect(backlinks(notes[0], notes).map((n) => n.id)).toEqual(['2']);
  });
  it('baut Tagesnotiz und Vorlagen', async () => {
    const { dailyTitle, dailyContent, NOTE_TEMPLATES } = await import('./notes');
    expect(dailyTitle('2026-11-06')).toBe('Freitag, 6. November');
    expect(dailyContent([{ time: '10:15', label: 'LinA' }])).toContain('- 10:15 LinA');
    expect(dailyContent([])).toContain('keine Termine');
    expect(NOTE_TEMPLATES.find((t) => t.id === 'vorlesung')!.title('2026-11-06')).toBe('Vorlesung 6. November');
  });
});
