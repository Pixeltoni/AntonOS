import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Collection, Data, ID } from './types';
import { demoData } from './demo';

const STORAGE_KEY = 'antonos:v1';

export const emptyData = (): Data => ({
  courses: [],
  tasks: [],
  notes: [],
  cards: [],
  exams: [],
  grades: [],
  goals: [],
  sessions: [],
});

/** Ergänzt fehlende Sammlungen, z. B. bei Importen älterer Exporte. */
export function normalize(raw: unknown): Data {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as Collection[]) {
    if (Array.isArray(obj[key])) (base[key] as unknown[]) = obj[key] as unknown[];
  }
  return base;
}

function load(): Data {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // Speicher nicht verfügbar oder kaputt: mit Demo-Daten starten
  }
  return demoData();
}

export const newId = (): ID => crypto.randomUUID();

type Item<C extends Collection> = Data[C][number];

interface Store {
  data: Data;
  add<C extends Collection>(collection: C, item: Omit<Item<C>, 'id'>): ID;
  update<C extends Collection>(collection: C, id: ID, patch: Partial<Item<C>>): void;
  remove(collection: Collection, id: ID): void;
  removeCourse(id: ID): void;
  replaceAll(data: Data): void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // z. B. privater Modus: Daten bleiben nur bis zum Neuladen erhalten
    }
  }, [data]);

  const add = useCallback(<C extends Collection>(collection: C, item: Omit<Item<C>, 'id'>) => {
    const id = newId();
    setData((d) => ({ ...d, [collection]: [...d[collection], { ...item, id }] }));
    return id;
  }, []);

  const update = useCallback(<C extends Collection>(collection: C, id: ID, patch: Partial<Item<C>>) => {
    setData((d) => ({
      ...d,
      [collection]: (d[collection] as Item<C>[]).map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }, []);

  const remove = useCallback((collection: Collection, id: ID) => {
    setData((d) => ({ ...d, [collection]: (d[collection] as { id: ID }[]).filter((x) => x.id !== id) }));
  }, []);

  const removeCourse = useCallback((id: ID) => {
    setData((d) => ({
      ...d,
      courses: d.courses.filter((c) => c.id !== id),
      tasks: d.tasks.filter((x) => x.courseId !== id),
      notes: d.notes.filter((x) => x.courseId !== id),
      cards: d.cards.filter((x) => x.courseId !== id),
      exams: d.exams.filter((x) => x.courseId !== id),
      grades: d.grades.filter((x) => x.courseId !== id),
      sessions: d.sessions.map((x) => (x.courseId === id ? { ...x, courseId: null } : x)),
    }));
  }, []);

  const replaceAll = useCallback((next: Data) => setData(next), []);

  const value = useMemo(
    () => ({ data, add, update, remove, removeCourse, replaceAll }),
    [data, add, update, remove, removeCourse, replaceAll],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore außerhalb von StoreProvider');
  return s;
}
