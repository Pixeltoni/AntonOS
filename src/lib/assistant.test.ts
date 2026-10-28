import { describe, expect, it } from 'vitest';
import { interpret, reminderTitle } from './assistant';

// Dienstag, 27.10.2026, 15:20 Uhr
const NOW = new Date(2026, 9, 27, 15, 20);
const habits = [
  { id: 'med', name: '10 Minuten meditieren' },
  { id: 'read', name: '10 Seiten lesen' },
  { id: 'water', name: '2 Liter Wasser', target: 2, unit: 'l' },
];

describe('Assistentin', () => {
  it('versteht Erinnerungen mit „dass“', () => {
    expect(interpret('Erinnere mich morgen um 8:00, dass ich den Müll mitnehm.', NOW)).toMatchObject({
      kind: 'task',
      title: 'Den Müll mitnehmen',
      due: '2026-10-28',
      dueTime: '08:00',
      remind: true,
    });
    expect(interpret('Erinnere mich, dass ich morgen um 10 Uhr Mama anrufe', NOW)).toMatchObject({ title: 'Mama anrufen', due: '2026-10-28', dueTime: '10:00', remind: true });
    expect(interpret('Erinnere mich Freitag daran, dass ich zur Bank muss', NOW)).toMatchObject({ title: 'Zur Bank', due: '2026-10-30', remind: false });
  });

  it('versteht „an …“, gesprochene Zahlen und relative Zeiten', () => {
    expect(interpret('Erinnere mich in 20 Minuten an die Pizza im Ofen', NOW)).toMatchObject({ title: 'Pizza im Ofen', due: '2026-10-27', dueTime: '15:40', remind: true });
    expect(interpret('erinnere mich in einer halben Stunde an Wäsche', NOW)).toMatchObject({ dueTime: '15:50' });
    expect(interpret('Erinnere mich morgen um acht an den Zahnarzt', NOW)).toMatchObject({ title: 'Zahnarzt', dueTime: '08:00' });
    expect(interpret('Erinnere mich morgen um halb neun ans Training', NOW)).toMatchObject({ dueTime: '08:30' });
    expect(interpret('Erinnere mich heute Abend um 8, dass ich lerne', NOW)).toMatchObject({ title: 'Lernen', due: '2026-10-27', dueTime: '20:00', evening: false });
    expect(interpret('Kannst du mich morgen um 7 Uhr erinnern, dass ich Wasser trinke?', NOW)).toMatchObject({ title: 'Wasser trinken', due: '2026-10-28', dueTime: '07:00', remind: true });
  });

  it('füllt die Einkaufsliste', () => {
    expect(interpret('Füge Bananen zu meiner Einkaufsliste', NOW)).toEqual({ kind: 'shopping', items: [{ name: 'Bananen', amount: '' }] });
    expect(interpret('Setz zwei Gurken und eine Milch auf die Einkaufsliste', NOW)).toEqual({
      kind: 'shopping',
      items: [{ name: 'Gurken', amount: '2' }, { name: 'Milch', amount: '' }],
    });
    expect(interpret('Bitte Eier und 500 g Hack zur Einkaufsliste hinzufügen', NOW)).toMatchObject({ items: [{ name: 'Eier' }, { name: 'Hack', amount: '500 g' }] });
    expect(interpret('Einkaufsliste: Butter, Brot', NOW)).toMatchObject({ items: [{ name: 'Butter' }, { name: 'Brot' }] });
    expect(interpret('Wir brauchen noch Klopapier', NOW)).toMatchObject({ kind: 'shopping', items: [{ name: 'Klopapier' }] });
  });

  it('legt Termine an', () => {
    expect(interpret('Termin Zahnarzt am Freitag um 10 Uhr', NOW)).toMatchObject({ kind: 'event', event: { title: 'Zahnarzt', start: '2026-10-30', startTime: '10:00' } });
    expect(interpret('Trag Lerngruppe morgen 14-16 Uhr @Bibliothek in den Kalender ein', NOW)).toMatchObject({
      kind: 'event',
      event: { title: 'Lerngruppe', start: '2026-10-28', startTime: '14:00', endTime: '16:00', location: 'Bibliothek' },
    });
    expect(interpret('Ich habe morgen um 9 Uhr Vorstellungsgespräch', NOW)).toMatchObject({ kind: 'event', event: { title: 'Vorstellungsgespräch', startTime: '09:00' } });
    expect(interpret('Termin mit Lisa Donnerstag 18 Uhr', NOW)).toMatchObject({ event: { title: 'Termin mit Lisa', start: '2026-10-29' } });
  });

  it('bucht Ausgaben und Einnahmen', () => {
    expect(interpret('Ich habe 12,50 € für Pizza ausgegeben', NOW)).toEqual({ kind: 'expense', type: 'Ausgabe', amount: 12.5, description: 'Pizza', category: 'Essen', date: '2026-10-27' });
    expect(interpret('gestern 30 Euro bei Rewe bezahlt', NOW)).toMatchObject({ amount: 30, description: 'Rewe', category: 'Lebensmittel', date: '2026-10-26' });
    expect(interpret('50 € Nachhilfe bekommen', NOW)).toMatchObject({ type: 'Einnahme', description: 'Nachhilfe', category: 'Sonstiges' });
  });

  it('hakt Gewohnheiten ab', () => {
    expect(interpret('Ich habe heute meditiert', NOW, { habits })).toEqual({ kind: 'habit', habitId: 'med', amount: null, date: '2026-10-27' });
    expect(interpret('Hab 10 Seiten gelesen', NOW, { habits })).toMatchObject({ habitId: 'read', amount: null });
    expect(interpret('Ich habe 500 ml Wasser getrunken', NOW, { habits })).toMatchObject({ habitId: 'water', amount: 0.5 });
    expect(interpret('Ich habe meditiert', NOW)).toMatchObject({ kind: 'task' });
  });

  it('schreibt Notizen und macht den Rest zu Aufgaben', () => {
    expect(interpret('Notiz: Idee für die Hausarbeit', NOW)).toEqual({ kind: 'note', title: 'Idee für die Hausarbeit' });
    expect(interpret('Übungsblatt 4 morgen 10 Uhr !!!', NOW)).toMatchObject({ kind: 'task', title: 'Übungsblatt 4', due: '2026-10-28', dueTime: '10:00', priority: 'hoch', remind: false });
    expect(interpret('Ich muss morgen Wäsche waschen', NOW)).toMatchObject({ kind: 'task', title: 'Wäsche waschen', due: '2026-10-28' });
    expect(interpret('   ', NOW)).toBeNull();
  });

  it('formt Sätze in Aufgaben um', () => {
    expect(reminderTitle('ich das Paket abhole')).toBe('Das Paket abholen');
    expect(reminderTitle('ich zum Bäcker geh')).toBe('Zum Bäcker gehen');
    expect(reminderTitle('ich einkaufen muss')).toBe('Einkaufen');
    expect(reminderTitle('Rechnung bezahlen')).toBe('Rechnung bezahlen');
  });
});
