import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { notify } from '../lib/notify';
import { dueNotices } from '../lib/reminders';
import { useToast } from './toast';

const REMINDED_KEY = 'antonos:hinweise';

/** Geburtstage, Kündigungsfristen und Reisen: je eine Mitteilung, solange AntonOS offen ist. */
export function useLifeReminders() {
  const { data } = useStore();
  const { show } = useToast();
  const ref = useRef(data);
  ref.current = data;
  useEffect(() => {
    const check = () => {
      let done: string[] = [];
      try {
        done = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? '[]');
      } catch {
        done = [];
      }
      const due = dueNotices(ref.current, new Date()).filter((n) => !done.includes(n.id));
      if (due.length === 0) return;
      for (const n of due) {
        notify(n.title, n.body, n.id).then((ok) => {
          if (!ok) show(`${n.title} · ${n.body}`, { label: 'Ansehen', run: () => (location.hash = n.href) }, 10000);
        });
      }
      try {
        localStorage.setItem(REMINDED_KEY, JSON.stringify([...done, ...due.map((n) => n.id)].slice(-200)));
      } catch {
        // dann eben ohne Merken
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [show]);
}
