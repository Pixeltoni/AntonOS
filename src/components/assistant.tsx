import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Square, WandSparkles } from 'lucide-react';
import { useStore } from '../store';
import type { Collection, Data, ID } from '../types';
import { formatDate, relativeLabel, today } from '../lib/dates';
import { INTENT_LABELS, interpret, type Intent } from '../lib/assistant';
import { dueTaskReminders } from '../lib/calendar';
import { habitSteps } from '../lib/life';
import { categorize } from '../lib/shopping';
import { askNotifications, notify } from '../lib/notify';
import { useToast } from './toast';
import { Icon } from './icons';

const OPEN_EVENT = 'antonos:assistentin';

/** Öffnet die Assistentin von überall (Knopf, Suche). */
export const openAssistant = () => window.dispatchEvent(new Event(OPEN_EVENT));

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const ASSISTANT_SHORTCUT = isMac ? '⌘J' : 'Strg+J';

const EXAMPLES = [
  'Erinnere mich morgen um 8, dass ich den Müll mitnehme',
  'Füge Bananen und Milch zu meiner Einkaufsliste hinzu',
  'Termin Zahnarzt Freitag 10 Uhr',
  'Ich habe 12 € für Pizza ausgegeben',
  'Ich habe heute meditiert',
  'Notiz: Idee für die Hausarbeit',
];

// Spracheingabe (Web Speech API) – fehlt in den TypeScript-Typen
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
const SpeechCtor = (): (new () => Recognition) | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const dayLabel = (due: string, t: string) => {
  const rel = relativeLabel(due, t);
  return /^(heute|morgen|gestern)$/.test(rel) ? rel.replace(/^./, (c) => c.toUpperCase()) : formatDate(due);
};
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/** Eine Zeile Vorschau, z. B. „Morgen, 08:00 · 🔔 · Den Müll mitnehmen“ */
function summary(intent: Intent, data: Data, t: string): string {
  switch (intent.kind) {
    case 'task':
      return [intent.title || '(ohne Titel)', intent.due && `${dayLabel(intent.due, t)}${intent.dueTime ? `, ${intent.dueTime}` : ''}`, intent.evening && 'Heute Abend', intent.remind && '🔔 Erinnerung'].filter(Boolean).join(' · ');
    case 'shopping':
      return intent.items.map((i) => `${i.amount ? `${i.amount} ` : ''}${i.name}`).join(', ');
    case 'event': {
      const e = intent.event;
      return [e.title, `${dayLabel(e.start, t)}${e.startTime ? `, ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : ''}`, e.location && `📍 ${e.location}`].filter(Boolean).join(' · ');
    }
    case 'habit': {
      const h = data.habits.find((x) => x.id === intent.habitId);
      return [h ? `${h.icon} ${h.name}` : 'Gewohnheit', intent.amount !== null && `+${intent.amount.toLocaleString('de-DE')} ${h?.unit ?? ''}`.trim(), dayLabel(intent.date, t)].filter(Boolean).join(' · ');
    }
    case 'expense':
      return [`${intent.type === 'Einnahme' ? '+' : '−'}${euro(intent.amount)}`, intent.description || intent.category, intent.category].join(' · ');
    case 'note':
      return intent.content;
  }
}

interface Done {
  intent: Intent;
  collection: Collection;
  ids: ID[];
  title: string;
  href: string;
  undo: () => void;
}

const DONE_TITLES: Record<Intent['kind'], string> = {
  task: 'Aufgabe angelegt',
  shopping: 'Auf der Einkaufsliste',
  event: 'Termin eingetragen',
  habit: 'Gewohnheit abgehakt',
  expense: 'Gebucht',
  note: 'Notiz angelegt',
};

/**
 * Assistentin: versteht Sätze wie „Erinnere mich morgen um 8, dass …“ oder
 * „Füge Bananen zu meiner Einkaufsliste hinzu“ (getippt oder gesprochen),
 * legt den passenden Eintrag an und zeigt ihn zum Prüfen, Ändern oder Widerrufen.
 */
export function Assistant() {
  const { data, add, update, remove } = useStore();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const canListen = !!SpeechCtor();
  const t = today();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
    else {
      recognition.current?.stop();
      setText('');
      setDone(null);
      setProblem('');
    }
  }, [open]);

  const close = () => setOpen(false);

  const run = (raw: string) => {
    const d = dataRef.current;
    const intent = interpret(raw, new Date(), { habits: d.habits, courses: d.courses });
    if (!intent) return;
    let result: Omit<Done, 'intent' | 'title'>;
    switch (intent.kind) {
      case 'task': {
        const id = add('tasks', {
          title: intent.title || raw, courseId: intent.courseId, kind: 'Aufgabe', status: 'offen', priority: intent.priority ?? 'mittel',
          due: intent.due, dueTime: intent.dueTime, evening: intent.evening || undefined, someday: intent.someday || undefined, remind: intent.remind || undefined,
        });
        if (intent.remind) askNotifications();
        result = { collection: 'tasks', ids: [id], href: '#/aufgaben', undo: () => remove('tasks', id) };
        break;
      }
      case 'shopping': {
        const ids = intent.items.map((i) => add('shopping', { name: i.name, amount: i.amount, aisle: categorize(i.name), done: false, added: t }));
        result = { collection: 'shopping', ids, href: '#/einkauf', undo: () => ids.forEach((id) => remove('shopping', id)) };
        break;
      }
      case 'event': {
        const e = intent.event;
        const id = add('events', {
          title: e.title, note: '', start: e.start, end: e.end, startTime: e.startTime, endTime: e.endTime, priority: e.priority ?? 'mittel',
          repeat: e.repeat ? { freq: e.repeat, until: null } : null, location: e.location, color: null,
        });
        result = { collection: 'events', ids: [id], href: '#/kalender', undo: () => remove('events', id) };
        break;
      }
      case 'habit': {
        const habit = d.habits.find((h) => h.id === intent.habitId)!;
        const log = d.habitLogs.find((l) => l.habitId === habit.id && l.date === intent.date);
        const amount = habit.target ? (intent.amount ?? habitSteps(habit)[0]) : undefined;
        if (log && amount !== undefined) {
          const before = log.amount;
          update('habitLogs', log.id, { amount: Math.round(((log.amount ?? 0) + amount) * 1000) / 1000 });
          result = { collection: 'habitLogs', ids: [log.id], href: '#/gewohnheiten', undo: () => update('habitLogs', log.id, { amount: before }) };
        } else if (log) {
          result = { collection: 'habitLogs', ids: [log.id], href: '#/gewohnheiten', undo: () => undefined };
        } else {
          const id = add('habitLogs', amount !== undefined ? { habitId: habit.id, date: intent.date, amount } : { habitId: habit.id, date: intent.date });
          result = { collection: 'habitLogs', ids: [id], href: '#/gewohnheiten', undo: () => remove('habitLogs', id) };
        }
        break;
      }
      case 'expense': {
        const id = add('transactions', { type: intent.type, description: intent.description, amount: intent.amount, category: intent.category, account: 'Girokonto', date: intent.date });
        result = { collection: 'transactions', ids: [id], href: '#/finanzen', undo: () => remove('transactions', id) };
        break;
      }
      case 'note': {
        const id = add('notes', { title: intent.title, courseId: null, content: intent.content, updated: new Date().toISOString() });
        result = { collection: 'notes', ids: [id], href: `#/notizen/${id}`, undo: () => remove('notes', id) };
        break;
      }
    }
    const title = intent.kind === 'task' && intent.remind ? 'Erinnerung angelegt' : DONE_TITLES[intent.kind];
    setDone({ ...result, intent, title });
    setText('');
  };

  const listen = () => {
    const Ctor = SpeechCtor();
    if (!Ctor) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'de-DE';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setProblem('Das Mikrofon ist nicht erlaubt – bitte in den Einstellungen des Browsers bzw. Geräts erlauben.');
      else if (e.error === 'network') setProblem('Die Spracherkennung braucht Internet.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setProblem('Die Spracherkennung hat nicht geklappt – versuch es noch einmal oder tippe.');
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      // Gesprochenes sofort ausführen – im Popup lässt es sich prüfen und widerrufen
      if (finalText.trim()) run(finalText.trim());
    };
    setProblem('');
    setDone(null);
    setText('');
    recognition.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  if (!open) return null;

  const preview = text.trim() ? interpret(text, new Date(), { habits: data.habits, courses: data.courses }) : null;

  return createPortal(
    <div className="spotlight-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="spotlight assistant" role="dialog" aria-modal="true" aria-label="Assistentin">
        <form
          className="spotlight-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) run(text);
          }}
        >
          <span aria-hidden className="assistant-spark"><Icon icon={WandSparkles} size={20} /></span>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), close())}
            placeholder={listening ? 'Ich höre zu …' : 'Was soll ich eintragen?'}
            aria-label="Was soll ich eintragen?"
            autoComplete="off"
            enterKeyHint="send"
          />
          {canListen && (
            <button type="button" className={`assistant-mic ${listening ? 'on' : ''}`} onClick={listen} aria-label={listening ? 'Zuhören beenden' : 'Sprechen'} title={listening ? 'Zuhören beenden' : 'Sprechen'}>
              <Icon icon={listening ? Square : Mic} size={18} />
            </button>
          )}
          <button type="button" className="spotlight-close" onClick={close}>Fertig</button>
        </form>
        <div className="assistant-body">
          {problem && <p className="danger small" role="alert">{problem}</p>}
          {preview && (
            <button type="button" className="assistant-preview" onClick={() => run(text)}>
              <span className="assistant-kind">{INTENT_LABELS[preview.kind].icon} {preview.kind === 'task' && preview.remind ? 'Erinnerung' : INTENT_LABELS[preview.kind].label}</span>
              <span className="assistant-sum">{summary(preview, data, t)}</span>
              <span className="assistant-enter">↵</span>
            </button>
          )}
          {done && <Confirmation done={done} onUndo={() => { done.undo(); setDone(null); }} onOpen={() => { close(); location.hash = done.href; }} />}
          {!preview && !done && (
            <div className="assistant-examples">
              <span className="muted small">Sag oder tippe zum Beispiel:</span>
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="assistant-example" onClick={() => { setText(x); input.current?.focus(); }}>„{x}“</button>
              ))}
              {!canListen && <span className="muted small">Tipp: Zum Sprechen das Mikrofon der Tastatur (Diktieren) benutzen.</span>}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Das kleine Popup nach dem Anlegen: was eingetragen wurde, direkt änderbar */
function Confirmation({ done, onUndo, onOpen }: { done: Done; onUndo: () => void; onOpen: () => void }) {
  const { data, update } = useStore();
  const items = (data[done.collection] as { id: ID }[]).filter((x) => done.ids.includes(x.id));
  const field = (label: string, control: ReactNode) => (
    <label className="assistant-field" key={label}>
      <span>{label}</span>
      {control}
    </label>
  );

  let fields: ReactNode = null;
  if (done.collection === 'tasks') {
    const task = data.tasks.find((x) => x.id === done.ids[0]);
    if (task)
      fields = (
        <>
          {field('Titel', <input value={task.title} onChange={(e) => update('tasks', task.id, { title: e.target.value })} />)}
          {field('Datum', <input type="date" value={task.due ?? ''} onChange={(e) => update('tasks', task.id, { due: e.target.value || null })} />)}
          {field('Uhrzeit', <input type="time" value={task.dueTime ?? ''} onChange={(e) => update('tasks', task.id, { dueTime: e.target.value })} disabled={!task.due} />)}
          {field('Erinnern', <input type="checkbox" checked={!!task.remind} disabled={!task.due || !task.dueTime} onChange={(e) => { update('tasks', task.id, { remind: e.target.checked }); if (e.target.checked) askNotifications(); }} />)}
        </>
      );
  } else if (done.collection === 'events') {
    const ev = data.events.find((x) => x.id === done.ids[0]);
    if (ev)
      fields = (
        <>
          {field('Titel', <input value={ev.title} onChange={(e) => update('events', ev.id, { title: e.target.value })} />)}
          {field('Datum', <input type="date" value={ev.start} onChange={(e) => e.target.value && update('events', ev.id, { start: e.target.value })} />)}
          {field('Beginn', <input type="time" value={ev.startTime} onChange={(e) => update('events', ev.id, { startTime: e.target.value })} />)}
          {field('Ende', <input type="time" value={ev.endTime} onChange={(e) => update('events', ev.id, { endTime: e.target.value })} />)}
          {field('Ort', <input value={ev.location ?? ''} onChange={(e) => update('events', ev.id, { location: e.target.value })} />)}
        </>
      );
  } else if (done.collection === 'shopping') {
    fields = data.shopping
      .filter((x) => done.ids.includes(x.id))
      .map((item) => (
        <div className="assistant-field" key={item.id}>
          <input className="assistant-amount" value={item.amount} placeholder="Menge" aria-label={`Menge ${item.name}`} onChange={(e) => update('shopping', item.id, { amount: e.target.value })} />
          <input value={item.name} aria-label="Artikel" onChange={(e) => update('shopping', item.id, { name: e.target.value, aisle: categorize(e.target.value) })} />
        </div>
      ));
  } else if (done.collection === 'transactions') {
    const tx = data.transactions.find((x) => x.id === done.ids[0]);
    if (tx)
      fields = (
        <>
          {field('Was', <input value={tx.description} onChange={(e) => update('transactions', tx.id, { description: e.target.value })} />)}
          {field('Betrag €', <input type="number" step="0.01" min="0" value={tx.amount} onChange={(e) => Number(e.target.value) > 0 && update('transactions', tx.id, { amount: Number(e.target.value) })} />)}
          {field('Kategorie', <input value={tx.category} onChange={(e) => update('transactions', tx.id, { category: e.target.value })} />)}
          {field('Art', <span>{tx.type}</span>)}
          {field('Datum', <input type="date" value={tx.date} onChange={(e) => e.target.value && update('transactions', tx.id, { date: e.target.value })} />)}
        </>
      );
  } else if (done.collection === 'notes') {
    const note = data.notes.find((x) => x.id === done.ids[0]);
    if (note)
      fields = (
        <>
          {field('Titel', <input value={note.title} onChange={(e) => update('notes', note.id, { title: e.target.value })} />)}
          {field('Text', <textarea rows={3} value={note.content} onChange={(e) => update('notes', note.id, { content: e.target.value, updated: new Date().toISOString() })} />)}
        </>
      );
  } else if (done.collection === 'habitLogs') {
    const log = data.habitLogs.find((x) => x.id === done.ids[0]);
    const habit = data.habits.find((h) => h.id === log?.habitId);
    if (log && habit)
      fields = (
        <>
          {field('Gewohnheit', <span>{habit.icon} {habit.name}</span>)}
          {field('Tag', <span>{formatDate(log.date)}</span>)}
          {habit.target && field('Heute', <span>{(log.amount ?? 0).toLocaleString('de-DE')} / {habit.target.toLocaleString('de-DE')} {habit.unit ?? ''}</span>)}
        </>
      );
  }

  const gone = items.length === 0;
  return (
    <div className="assistant-done" role="status">
      <div className="assistant-done-head">
        <strong>✓ {done.title}</strong>
        <span className="muted small">{INTENT_LABELS[done.intent.kind].label}</span>
      </div>
      {gone ? <p className="muted small">Nicht mehr vorhanden.</p> : <div className="assistant-fields">{fields}</div>}
      <div className="row between">
        <button type="button" onClick={onUndo} disabled={gone}>Widerrufen</button>
        <button type="button" className="primary" onClick={onOpen}>Ansehen</button>
      </div>
    </div>
  );
}

const TASK_REMINDED_KEY = 'antonos:aufgaben-erinnert';

/** Meldet sich zur Uhrzeit von Aufgaben mit Erinnerung (Mitteilung oder Hinweis in der App). */
export function useTaskReminders() {
  const { data } = useStore();
  const { show } = useToast();
  const ref = useRef(data.tasks);
  ref.current = data.tasks;
  useEffect(() => {
    const check = () => {
      let doneIds: string[] = [];
      try {
        doneIds = JSON.parse(localStorage.getItem(TASK_REMINDED_KEY) ?? '[]');
      } catch {
        doneIds = [];
      }
      const due = dueTaskReminders(ref.current, new Date()).filter((x) => !doneIds.includes(`${x.id}@${x.due}T${x.dueTime}`));
      if (due.length === 0) return;
      for (const task of due) {
        notify(`🔔 ${task.title}`, `Erinnerung · ${task.dueTime} Uhr`, `task-${task.id}`).then((ok) => {
          if (!ok) show(`🔔 ${task.title}`, { label: 'Aufgaben', run: () => (location.hash = '#/aufgaben') }, 10000);
        });
      }
      try {
        localStorage.setItem(TASK_REMINDED_KEY, JSON.stringify([...doneIds, ...due.map((x) => `${x.id}@${x.due}T${x.dueTime}`)].slice(-200)));
      } catch {
        // dann eben ohne Merken
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [show]);
}
