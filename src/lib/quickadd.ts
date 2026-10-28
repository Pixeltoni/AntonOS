import type { Course, DateStr, ID, Priority } from '../types';
import { addDays, parseDate, toDateStr } from './dates';

export interface QuickAdd {
  title: string;
  due: DateStr | null;
  dueTime: string;
  priority: Priority | null;
  courseId: ID | null;
  /** „heute abend“ → Heute Abend (wie in Things) */
  evening: boolean;
  /** „irgendwann“ → Irgendwann */
  someday: boolean;
}

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const PRIORITY: Record<number, Priority> = { 1: 'niedrig', 2: 'mittel', 3: 'hoch' };

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Versteht Eingaben wie „Übungsblatt 4 morgen 10 Uhr !!! #analysis“:
 * Datum (heute, morgen, übermorgen, Wochentag, „in 3 Tagen“, 5.11. / 5.11.2026),
 * Uhrzeit (10 Uhr, 10:30, um 9), Priorität wie bei Apple (! niedrig, !! mittel, !!! hoch)
 * und Kurs per #Name oder #Kürzel. Was erkannt wurde, verschwindet aus dem Titel.
 */
export function parseQuickAdd(input: string, today: DateStr, courses: Pick<Course, 'id' | 'name' | 'code'>[] = []): QuickAdd {
  let text = ` ${input} `;
  let due: DateStr | null = null;
  let dueTime = '';
  let priority: Priority | null = null;
  let courseId: ID | null = null;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (m && fn(m) !== false) text = text.replace(m[0], ' ');
  };

  // Priorität: !, !!, !!! als eigenes Wort
  take(/\s(!{1,3})(?=\s)/, (m) => {
    priority = PRIORITY[m[1].length];
  });

  // Kurs: #analysis, #MA-101
  take(/\s#([\p{L}\d][\p{L}\d-]*)(?=\s)/u, (m) => {
    const q = m[1].toLowerCase();
    const hit = courses.find((c) => c.code.toLowerCase() === q) ?? courses.find((c) => c.name.toLowerCase().startsWith(q));
    if (!hit) return false;
    courseId = hit.id;
  });

  // Uhrzeit: 10:30, 10.30 Uhr, 10 Uhr, um 9
  take(/\s(?:um\s+)?(\d{1,2})[:.](\d{2})(?:\s*uhr)?(?=\s)/i, (m) => {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return false;
    dueTime = `${pad(h)}:${pad(min)}`;
  });
  if (!dueTime) {
    take(/\s(?:um\s+)?(\d{1,2})\s*uhr(?=\s)/i, (m) => {
      const h = Number(m[1]);
      if (h > 23) return false;
      dueTime = `${pad(h)}:00`;
    });
  }
  if (!dueTime) {
    take(/\sum\s+(\d{1,2})(?=\s)/i, (m) => {
      const h = Number(m[1]);
      if (h > 23) return false;
      dueTime = `${pad(h)}:00`;
    });
  }

  // „heute abend“ und „irgendwann“ wie in Things
  let evening = false;
  let someday = false;
  take(/\s(heute\s+abend)(?=\s)/i, () => {
    evening = true;
  });
  take(/\s(irgendwann)(?=\s)/i, () => {
    someday = true;
  });

  // Datum
  take(/\s(übermorgen|uebermorgen)(?=\s)/i, () => {
    due = addDays(today, 2);
  });
  if (!due) take(/\s(heute)(?=\s)/i, () => { due = today; });
  if (!due) take(/\s(morgen)(?=\s)/i, () => { due = addDays(today, 1); });
  if (!due) {
    take(/\sin\s+(\d{1,3})\s+(tag|tagen|woche|wochen)(?=\s)/i, (m) => {
      const n = Number(m[1]);
      due = addDays(today, m[2].toLowerCase().startsWith('woche') ? n * 7 : n);
    });
  }
  if (!due) {
    take(/\s(?:am\s+|nächsten\s+|naechsten\s+|kommenden\s+)?(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)(?=\s)/i, (m) => {
      const target = WEEKDAYS.indexOf(m[1].toLowerCase());
      const current = parseDate(today).getDay();
      const diff = (target - current + 7) % 7 || 7;
      due = addDays(today, diff);
    });
  }
  if (!due) {
    take(/\s(?:am\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
      const t = parseDate(today);
      let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : t.getFullYear();
      let candidate = toDateStr(new Date(y, mo - 1, d));
      // Ohne Jahr: ein Datum, das schon vorbei ist, meint das nächste Jahr
      if (!m[3] && candidate < today) {
        y += 1;
        candidate = toDateStr(new Date(y, mo - 1, d));
      }
      due = candidate;
    });
  }
  // Uhrzeit ohne Datum: heute (bzw. morgen, wenn die Uhrzeit heute schon vorbei wäre, ist nicht ermittelbar) → heute
  if (dueTime && !due && !evening) due = today;

  const title = text.replace(/\s+/g, ' ').trim();
  return { title, due, dueTime, priority, courseId, evening, someday };
}
