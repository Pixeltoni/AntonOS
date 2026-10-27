import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { emptyData, normalize, useStore } from '../store';
import type { Data } from '../types';
import { decide, loadMeta, saveMeta, supabase, type SyncMeta } from '../lib/cloud';

export type SyncStatus = 'aus' | 'verbinde' | 'synchron' | 'speichert' | 'offline' | 'konflikt' | 'fehler';

interface Conflict {
  remote: Data;
  at: string;
}

interface SyncCtx {
  user: User | null;
  status: SyncStatus;
  error: string;
  lastSynced: string | null;
  conflict: Conflict | null;
  recovery: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<string>;
  resetPassword(email: string): Promise<void>;
  setNewPassword(password: string): Promise<void>;
  signOut(clearLocal: boolean): Promise<void>;
  resolve(keep: 'cloud' | 'geraet'): Promise<void>;
  syncNow(): void;
}

const Ctx = createContext<SyncCtx | null>(null);

export function useSync(): SyncCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSync außerhalb von SyncProvider');
  return c;
}

const PUSH_DELAY = 1500;
const PULL_INTERVAL = 60_000;

const redirectTo = () => location.origin + location.pathname;

function message(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/Invalid login credentials/i.test(text)) return 'E-Mail oder Passwort ist falsch.';
  if (/Email not confirmed/i.test(text)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Bestätigungsmail).';
  if (/already registered/i.test(text)) return 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.';
  if (/Password should be/i.test(text)) return 'Das Passwort ist zu kurz (mindestens 8 Zeichen).';
  if (/Signups not allowed/i.test(text)) return 'Neue Konten sind deaktiviert.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return 'Keine Verbindung zum Server.';
  return text;
}

const isNetworkError = (e: unknown) => /Failed to fetch|NetworkError|Load failed|fetch/i.test(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, replaceAll } = useStore();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SyncStatus>('aus');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(() => loadMeta().lastSynced);

  const meta = useRef<SyncMeta>(loadMeta());
  const dataRef = useRef(data);
  dataRef.current = data;
  const userRef = useRef<User | null>(null);
  /** Stand, der zuletzt aus der Cloud übernommen wurde – keine lokale Änderung */
  const applied = useRef<Data | null>(data);
  /** Zählt lokale Änderungen, um Änderungen während des Hochladens zu erkennen */
  const version = useRef(0);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const setMeta = useCallback((patch: Partial<SyncMeta>) => {
    meta.current = { ...meta.current, ...patch };
    saveMeta(meta.current);
    if ('lastSynced' in patch) setLastSynced(meta.current.lastSynced);
  }, []);

  const fail = useCallback((e: unknown) => {
    if (isNetworkError(e)) {
      setStatus('offline');
      return;
    }
    setError(message(e));
    setStatus('fehler');
  }, []);

  /** Führt Abgleich-Schritte nacheinander aus, damit sie sich nicht überholen. */
  const enqueue = useCallback((job: () => Promise<void>) => {
    queue.current = queue.current.then(job).catch(fail);
    return queue.current;
  }, [fail]);

  const applyRemote = useCallback(
    (remote: unknown, at: string, uid: string) => {
      const next = normalize(remote);
      applied.current = next;
      replaceAll(next);
      setMeta({ userId: uid, lastSynced: at, dirty: false });
      setConflict(null);
      setStatus('synchron');
    },
    [replaceAll, setMeta],
  );

  const push = useCallback(
    async (force = false) => {
      const u = userRef.current;
      if (!u) return;
      setStatus('speichert');
      const startVersion = version.current;
      const payload = dataRef.current;
      const m = meta.current;
      let at: string | null = null;

      if (!force && m.userId === u.id && m.lastSynced) {
        // Nur überschreiben, wenn die Cloud seit dem letzten Abgleich unverändert ist
        const { data: rows, error: err } = await supabase
          .from('user_data')
          .update({ data: payload })
          .eq('user_id', u.id)
          .eq('updated_at', m.lastSynced)
          .select('updated_at');
        if (err) throw err;
        if (!rows || rows.length === 0) {
          // Inzwischen hat ein anderes Gerät gespeichert – neu abgleichen
          await pullRef.current();
          return;
        }
        at = rows[0].updated_at as string;
      } else {
        const { data: row, error: err } = await supabase
          .from('user_data')
          .upsert({ user_id: u.id, data: payload })
          .select('updated_at')
          .single();
        if (err) throw err;
        at = row.updated_at as string;
      }

      const stillDirty = version.current !== startVersion;
      setMeta({ userId: u.id, lastSynced: at, dirty: stillDirty });
      setError('');
      setStatus('synchron');
      if (stillDirty) schedulePush();
    },
    // pull und schedulePush sind über Refs stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setMeta],
  );

  const pull = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    const { data: head, error: err } = await supabase.from('user_data').select('updated_at').eq('user_id', u.id).maybeSingle();
    if (err) throw err;
    const remoteAt = (head?.updated_at as string | undefined) ?? null;
    const decision = decide(remoteAt, meta.current, u.id);
    if (decision === 'nichts') {
      setStatus('synchron');
      setError('');
      return;
    }
    if (decision === 'hochladen') {
      await push(remoteAt === null);
      return;
    }
    const { data: row, error: err2 } = await supabase.from('user_data').select('data, updated_at').eq('user_id', u.id).single();
    if (err2) throw err2;
    if (decision === 'herunterladen') applyRemote(row.data, row.updated_at as string, u.id);
    else {
      setConflict({ remote: normalize(row.data), at: row.updated_at as string });
      setStatus('konflikt');
    }
  }, [applyRemote, push]);

  const pushRef = useRef(push);
  pushRef.current = push;
  const pullRef = useRef(pull);
  pullRef.current = pull;

  function schedulePush() {
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      if (userRef.current && !conflictRef.current) void enqueue(() => pushRef.current());
    }, PUSH_DELAY);
  }
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  // Lokale Änderungen merken und hochladen
  useEffect(() => {
    if (data === applied.current) return;
    version.current++;
    setMeta({ dirty: true });
    if (userRef.current) {
      setStatus((s) => (s === 'konflikt' ? s : 'speichert'));
      schedulePush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Anmeldung beobachten
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      const changed = userRef.current?.id !== u?.id;
      userRef.current = u;
      setUser(u);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Nach dem Login per E-Mail-Link den Code aus der Adresse entfernen
      if (u && /[?&]code=/.test(location.search) && !/[?&]state=/.test(location.search)) {
        history.replaceState(null, '', location.pathname + location.hash);
      }
      if (!u) {
        setStatus('aus');
        return;
      }
      if (changed) {
        setStatus('verbinde');
        // Nicht direkt im Callback auf Supabase warten (sonst blockiert die Sitzung)
        setTimeout(() => void enqueue(() => pullRef.current()), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [enqueue]);

  // Regelmäßig und beim Zurückkehren zur App nach Änderungen anderer Geräte schauen
  useEffect(() => {
    const check = () => {
      if (!userRef.current || document.visibilityState !== 'visible') return;
      void enqueue(() => (meta.current.dirty ? pushRef.current() : pullRef.current()));
    };
    const timer = setInterval(check, PULL_INTERVAL);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
    };
  }, [enqueue]);

  // Beim Schließen noch ausstehende Änderungen nicht verlieren: sie bleiben lokal als "dirty" markiert
  // und werden beim nächsten Start hochgeladen.

  const value: SyncCtx = {
    user,
    status,
    error,
    lastSynced,
    conflict,
    recovery,
    async signIn(email, password) {
      setError('');
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw new Error(message(err));
    },
    async signUp(email, password) {
      setError('');
      const { data: res, error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
      if (err) throw new Error(message(err));
      return res.session ? '' : 'Fast geschafft: Wir haben dir eine E-Mail geschickt. Klicke auf den Link darin und melde dich dann hier an.';
    },
    async resetPassword(email) {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
      if (err) throw new Error(message(err));
    },
    async setNewPassword(password) {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw new Error(message(err));
      setRecovery(false);
    },
    async signOut(clearLocal) {
      clearTimeout(pushTimer.current);
      // Ausstehende Änderungen vorher noch hochladen
      if (meta.current.dirty && userRef.current && !conflictRef.current) await enqueue(() => pushRef.current());
      await supabase.auth.signOut({ scope: 'local' });
      setConflict(null);
      if (clearLocal) {
        const empty = emptyData();
        applied.current = empty;
        replaceAll(empty);
      }
      setMeta({ userId: null, lastSynced: null, dirty: false });
    },
    async resolve(keep) {
      const c = conflictRef.current;
      const u = userRef.current;
      if (!c || !u) return;
      if (keep === 'cloud') applyRemote(c.remote, c.at, u.id);
      else {
        setConflict(null);
        await enqueue(() => pushRef.current(true));
      }
    },
    syncNow() {
      void enqueue(() => (meta.current.dirty ? pushRef.current() : pullRef.current()));
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------- Oberfläche ---------- */

const STATUS_TEXT: Record<SyncStatus, [string, string]> = {
  aus: ['☁️', 'Nur auf diesem Gerät'],
  verbinde: ['🔄', 'Verbinde …'],
  synchron: ['✅', 'Synchronisiert'],
  speichert: ['🔄', 'Speichert …'],
  offline: ['📴', 'Offline – wird später abgeglichen'],
  konflikt: ['⚠️', 'Bitte Version wählen'],
  fehler: ['⚠️', 'Sync-Fehler'],
};

export function SyncBadge() {
  const { status } = useSync();
  const [icon, text] = STATUS_TEXT[status];
  return (
    <a className={`nav-button sync-badge ${status}`} href="#/einstellungen" title="Synchronisierung">
      <span aria-hidden>{icon}</span> {text}
    </a>
  );
}

export function ConflictBanner() {
  const { conflict, resolve } = useSync();
  if (!conflict) return null;
  return (
    <div className="alert conflict" role="alert">
      <strong>Zwei verschiedene Stände gefunden.</strong> Auf einem anderen Gerät wurde etwas geändert, und auf diesem Gerät gibt es
      ebenfalls Änderungen, die noch nicht in der Cloud sind. Welche Version möchtest du behalten?
      <div className="row wrap">
        <button className="primary" onClick={() => void resolve('cloud')}>
          Cloud-Version übernehmen (Stand {new Date(conflict.at).toLocaleString('de-DE')})
        </button>
        <button onClick={() => confirm('Die Cloud-Version wird durch den Stand dieses Geräts ersetzt. Fortfahren?') && void resolve('geraet')}>
          Version dieses Geräts behalten
        </button>
      </div>
    </div>
  );
}

export function CloudPanel() {
  const s = useSync();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const msg = await action();
      if (msg) setInfo(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (s.recovery) {
    return (
      <form
        className="col"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await s.setNewPassword(password);
            return 'Neues Passwort gespeichert.';
          });
        }}
      >
        <p>Lege ein neues Passwort fest:</p>
        <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Neues Passwort" required />
        <button className="primary" disabled={busy}>Passwort speichern</button>
        {err && <p className="danger small">{err}</p>}
      </form>
    );
  }

  if (s.user) {
    const [icon, text] = STATUS_TEXT[s.status];
    return (
      <div className="col">
        <p>
          Angemeldet als <strong>{s.user.email}</strong>
        </p>
        <p className={s.status === 'fehler' ? 'danger' : ''}>
          {icon} {text}
          {s.lastSynced && s.status === 'synchron' && <span className="muted small"> · zuletzt {new Date(s.lastSynced).toLocaleString('de-DE')}</span>}
        </p>
        {s.error && <p className="danger small">{s.error}</p>}
        <p className="muted small">
          Deine Daten werden automatisch gespeichert und auf allen Geräten abgeglichen, auf denen du angemeldet bist. Ohne Internet
          arbeitest du normal weiter – sobald du wieder online bist, wird abgeglichen.
        </p>
        <div className="row wrap">
          <button onClick={s.syncNow}>Jetzt abgleichen</button>
          <button onClick={() => void s.signOut(false)}>Abmelden</button>
          <button className="danger" onClick={() => confirm('Abmelden und alle Daten von DIESEM Gerät entfernen? (In der Cloud bleiben sie erhalten.)') && void s.signOut(true)}>
            Abmelden und Gerät leeren
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="col cloud-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => s.signIn(email, password));
      }}
    >
      <p className="muted small">
        Melde dich an, um deine Daten auf allen Geräten zu synchronisieren. Nur du kannst sie sehen – geschützt durch dein Konto.
      </p>
      <input type="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-Mail" required />
      <input type="password" autoComplete="current-password" placeholder="Passwort (mind. 8 Zeichen)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Passwort" required />
      <div className="row wrap">
        <button className="primary" type="submit" disabled={busy}>Anmelden</button>
        <button type="button" disabled={busy || !email || password.length < 8} onClick={() => void run(() => s.signUp(email, password))}>
          Konto erstellen
        </button>
        <button
          type="button"
          className="link"
          disabled={busy || !email}
          onClick={() =>
            void run(async () => {
              await s.resetPassword(email);
              return 'Falls es ein Konto gibt, ist eine E-Mail zum Zurücksetzen unterwegs.';
            })
          }
        >
          Passwort vergessen?
        </button>
      </div>
      {info && <p className="small">{info}</p>}
      {err && <p className="danger small">{err}</p>}
    </form>
  );
}
