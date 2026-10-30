import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Appearance, Collection, Data, ID, Settings, Task } from './types';
import { repeatTasks } from './lib/tasks';
import { defaultAppearance, defaultFinance, defaultSemester, defaultSettings, demoData } from './demo';
import { defaultRingGoals } from './lib/rings';
import { SCHEMA_VERSION } from './lib/version';
import { today } from './lib/dates';
import { migrateSidebar, SIDEBAR_LAYOUT } from './lib/layout';

const STORAGE_KEY = 'antonos:v1';
/** Wartezeit nach der letzten Änderung, bevor gespeichert wird (ms) */
const SAVE_DELAY = 400;

export const emptyData = (): Data => ({
  courses: [],
  tasks: [],
  taskLists: [],
  notes: [],
  cards: [],
  exams: [],
  grades: [],
  goals: [],
  sessions: [],
  projects: [],
  habits: [],
  habitLogs: [],
  transactions: [],
  recurring: [],
  pots: [],
  shopping: [],
  recipes: [],
  meals: [],
  people: [],
  trips: [],
  moods: [],
  media: [],
  workouts: [],
  trainingPlan: [],
  events: [],
  albums: [],
  tools: [],
  settings: defaultSettings(),
  schemaVersion: SCHEMA_VERSION,
});

/** Übernimmt nur Hell/Dunkel – frühere Hintergrund-, Farb- und Milchglas-Einstellungen fallen weg. */
function normalizeAppearance(stored: Partial<Appearance> | undefined): Appearance {
  const theme = stored?.theme;
  return theme === 'hell' || theme === 'dunkel' || theme === 'system' ? { theme } : defaultAppearance();
}

/**
 * Ergänzt fehlende Sammlungen, z. B. bei Importen älterer Exporte.
 * Unbekannte Bereiche (von einer neueren AntonOS-Version) bleiben erhalten,
 * damit eine ältere Version beim Speichern nichts davon löscht.
 */
export function normalize(raw: unknown): Data {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  const result = { ...obj, ...base } as Data & Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof Data)[]) {
    if (key !== 'settings' && key !== 'schemaVersion' && Array.isArray(obj[key])) (result[key] as unknown[]) = obj[key] as unknown[];
  }
  if (obj.settings && typeof obj.settings === 'object') {
    const stored = obj.settings as Partial<Settings>;
    result.settings = { ...base.settings, ...stored, appearance: normalizeAppearance(stored.appearance), rings: { ...defaultRingGoals(), ...(stored.rings ?? {}) }, finance: { ...defaultFinance(), ...(stored.finance ?? {}) }, shoppingFrequent: Array.isArray(stored.shoppingFrequent) ? stored.shoppingFrequent : [], packTemplates: Array.isArray(stored.packTemplates) ? stored.packTemplates : [], semester: { ...defaultSemester(), ...(stored.semester ?? {}) } };
    // Alte Sidebar einmalig auf die neue Ordnung (Life-Organizer) umstellen
    if ((stored.sidebarLayout ?? 1) < SIDEBAR_LAYOUT) {
      result.settings.sidebar = Array.isArray(stored.sidebar) && stored.sidebar.length ? migrateSidebar(stored.sidebar) : [];
      result.settings.sidebarLayout = SIDEBAR_LAYOUT;
    }
  }
  if (typeof obj.schemaVersion === 'number') result.schemaVersion = obj.schemaVersion;
  return result;
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

/** Merkt sich bei Aufgaben, wann sie erledigt wurden (für den Wochenrückblick). */
function withCompletion<T extends { id: ID }>(collection: Collection, item: T, patch: Partial<T>): T {
  const next = { ...item, ...patch } as T & { status?: string; completedAt?: string };
  if (collection !== 'tasks' || !('status' in patch)) return next;
  const was = (item as { status?: string }).status;
  if (next.status === 'erledigt' && was !== 'erledigt') next.completedAt = today();
  else if (next.status !== 'erledigt') delete next.completedAt;
  return next;
}

type Item<C extends Collection> = Data[C][number];

interface Store {
  data: Data;
  add<C extends Collection>(collection: C, item: Omit<Item<C>, 'id'>): ID;
  update<C extends Collection>(collection: C, id: ID, patch: Partial<Item<C>>): void;
  remove(collection: Collection, id: ID): void;
  removeCourse(id: ID): void;
  updateSettings(patch: Partial<Settings>): void;
  replaceAll(data: Data): void;
  /** Mehrere Änderungen auf einmal, immer auf dem neuesten Stand */
  mutate(fn: (data: Data) => Data): void;
  /** true, wenn das letzte Speichern fehlgeschlagen ist (z. B. Speicher voll) */
  saveFailed: boolean;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(load);
  const [saveFailed, setSaveFailed] = useState(false);

  // Kurz gebündelt speichern statt bei jedem Tastendruck alles (inkl. Bilder) neu zu schreiben
  const unsaved = useRef<Data | null>(null);
  const flush = useCallback(() => {
    const next = unsaved.current;
    if (!next) return;
    unsaved.current = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaveFailed(false);
    } catch {
      // z. B. Speicher voll (große Bilder) oder privater Modus
      setSaveFailed(true);
    }
  }, []);

  useEffect(() => {
    unsaved.current = data;
    const timer = setTimeout(flush, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [data, flush]);

  // Beim Schließen, Neuladen oder Wechsel in den Hintergrund sofort sichern
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  const add = useCallback(<C extends Collection>(collection: C, item: Omit<Item<C>, 'id'>) => {
    const id = newId();
    setData((d) => ({ ...d, [collection]: [...d[collection], { ...item, id }] }));
    return id;
  }, []);

  const update = useCallback(<C extends Collection>(collection: C, id: ID, patch: Partial<Item<C>>) => {
    setData((d) => {
      const list = (d[collection] as Item<C>[]).map((x) => (x.id === id ? withCompletion(collection, x, patch) : x));
      // Wiederholte Aufgaben: beim Abhaken entsteht die nächste, beim Widerrufen verschwindet sie wieder
      return { ...d, [collection]: collection === 'tasks' ? repeatTasks(d.tasks, list as Task[], id, today(), newId) : list };
    });
  }, []);

  const remove = useCallback((collection: Collection, id: ID) => {
    setData((d) => {
      const next = { ...d, [collection]: (d[collection] as { id: ID }[]).filter((x) => x.id !== id) };
      // Abhängige Einträge mitpflegen
      if (collection === 'habits') next.habitLogs = d.habitLogs.filter((l) => l.habitId !== id);
      if (collection === 'recipes') next.meals = d.meals.map((m) => (m.recipeId === id ? { ...m, recipeId: null } : m));
      if (collection === 'trips') next.transactions = d.transactions.map((t) => (t.tripId === id ? { ...t, tripId: undefined } : t));
      if (collection === 'taskLists') next.tasks = d.tasks.map((t) => (t.listId === id ? { ...t, listId: null } : t));
      if (collection === 'projects') next.tasks = d.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t));
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
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
  const mutate = useCallback((fn: (d: Data) => Data) => setData(fn), []);

  const value = useMemo(
    () => ({ data, add, update, remove, removeCourse, updateSettings, replaceAll, mutate, saveFailed }),
    [data, add, update, remove, removeCourse, updateSettings, replaceAll, mutate, saveFailed],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore außerhalb von StoreProvider');
  return s;
}
