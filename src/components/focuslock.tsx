import { useCallback, useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { useStore } from '../store';
import { addDays, today } from '../lib/dates';
import { focusMode, lockUntil, splitAttempts } from '../lib/focus';
import { isNativeApp, NO_LOCK, sperre, type LockStatus } from '../lib/native';
import { useFocus } from './focus';
import { useToast } from './toast';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** „3 Apps, 1 Kategorie“ */
export function lockSummary(s: Pick<LockStatus, 'apps' | 'categories' | 'sites'>): string {
  const parts = [s.apps && plural(s.apps, 'App', 'Apps'), s.categories && plural(s.categories, 'Kategorie', 'Kategorien'), s.sites && plural(s.sites, 'Webseite', 'Webseiten')].filter(Boolean);
  return parts.join(', ');
}

/**
 * Nur in der iPhone-App: Solange eine Fokus-Runde läuft, sperrt iOS die ausgewählten Apps (Bildschirmzeit).
 * Versuche, sie trotzdem zu öffnen, zählt der Sperrbildschirm; AntonOS holt sie ab und schreibt sie in den Verlauf.
 */
export function useFocusLock() {
  const { data, mutate } = useStore();
  const focus = useFocus();
  const { show } = useToast();
  const enabled = !!data.settings.focusLock;
  const { timer } = focus;
  const until = enabled ? lockUntil(timer, Date.now()) : null;
  const mode = focusMode(timer.config.mode);
  const course = data.courses.find((c) => c.id === timer.config.courseId);
  const label = `${mode.icon} ${mode.label}${course ? ` · ${course.name}` : ''}`;
  const latest = useRef({ focus, block: focus.block });
  latest.current = { focus, block: focus.block };

  /* Sperre setzen bzw. aufheben */
  const applied = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!isNativeApp() || applied.current === until) return;
    const was = applied.current;
    applied.current = until;
    if (until) void sperre((p) => p.start({ endAt: until, label }), { ok: false });
    // Beim ersten Mal auch aufräumen: Eine alte Sperre darf nicht hängen bleiben
    else if (was !== null) void sperre((p) => p.stop(), undefined);
  }, [until, label]);

  /* Versuche abholen: beim Zurückkommen, alle 20 Sekunden während der Sperre und zum Rundenende */
  const take = useCallback(async () => {
    const { items } = await sperre((p) => p.takeAttempts(), { items: [] });
    if (!items.length) return;
    const { current, earlier } = splitAttempts(items, latest.current.focus.timer);
    if (current) latest.current.block(current);
    if (earlier) {
      const since = addDays(today(), -1);
      mutate((d) => {
        const i = d.sessions.length - 1;
        if (i < 0 || d.sessions[i].date < since) return d;
        return { ...d, sessions: d.sessions.map((s, k) => (k === i ? { ...s, blocked: (s.blocked ?? 0) + earlier } : s)) };
      });
    }
    const n = current + earlier;
    show(`🔒 Knubbel hat ${n === 1 ? 'einen Versuch' : `${n} Versuche`} abgewehrt`, undefined, 4000);
  }, [mutate, show]);

  useEffect(() => {
    if (!isNativeApp() || !enabled) return;
    void take();
    const resume = NativeApp.addListener('appStateChange', ({ isActive }) => isActive && void take());
    return () => void resume.then((h) => h.remove());
  }, [enabled, take]);

  useEffect(() => {
    if (!isNativeApp() || !enabled) return;
    if (!until) {
      void take();
      return;
    }
    const id = setInterval(() => document.visibilityState === 'visible' && void take(), 20_000);
    return () => clearInterval(id);
  }, [until, enabled, take]);
}

/** Einstellungen der Ablenkungs-Sperre auf der Fokus-Seite (nur iPhone-App) */
export function FocusLockPanel() {
  const { data, mutate } = useStore();
  const { timer } = useFocus();
  const { show } = useToast();
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const enabled = !!data.settings.focusLock;
  const refresh = useCallback(async () => setStatus(await sperre((p) => p.status(), NO_LOCK)), []);
  useEffect(() => void refresh(), [refresh, timer.running, timer.phase]);

  const setEnabled = (on: boolean) => mutate((d) => ({ ...d, settings: { ...d.settings, focusLock: on } }));
  const weekStart = addDays(today(), -6);
  const blockedWeek = data.sessions.filter((s) => s.date >= weekStart).reduce((n, s) => n + (s.blocked ?? 0), 0) + (timer.active && timer.phase === 'fokus' ? timer.blocked ?? 0 : 0);

  if (!status) return null;
  if (!status.available) {
    return (
      <div className="focus-lock">
        <p className="muted small">🔒 <strong>Ablenkungs-Sperre</strong> – sperrt im Fokus Apps wie Instagram oder TikTok. Sie wartet noch auf die Freigabe von Apple für die Bildschirmzeit und kommt danach mit einem neuen TestFlight-Build.</p>
      </div>
    );
  }

  const pick = async () => {
    setBusy(true);
    const r = await sperre((p) => p.pick(), { cancelled: true, apps: 0, categories: 0, sites: 0 });
    setBusy(false);
    await refresh();
    if (!r.cancelled) {
      const summary = lockSummary(r);
      if (summary && !enabled) setEnabled(true);
      show(summary ? `🔒 Im Fokus gesperrt: ${summary}` : 'Nichts ausgewählt – die Sperre bleibt aus');
    }
  };
  const authorize = async () => {
    setBusy(true);
    const { state } = await sperre((p) => p.authorize(), { state: 'denied' as const });
    setBusy(false);
    await refresh();
    if (state === 'granted') void pick();
    else show('Ohne Erlaubnis für die Bildschirmzeit kann AntonOS keine Apps sperren.', undefined, 6000);
  };

  const summary = lockSummary(status);
  const active = status.active && !!lockUntil(timer, Date.now());
  return (
    <div className="focus-lock">
      <div className="row between">
        <strong>🔒 Ablenkungs-Sperre</strong>
        {status.state === 'granted' && (
          <input type="checkbox" className="switch" aria-label="Ablenkungs-Sperre im Fokus" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!summary} />
        )}
      </div>
      {status.state !== 'granted' ? (
        <>
          <p className="muted small">Während einer Fokus-Runde sperrt iOS die Apps, die du auswählst. Wer es trotzdem versucht, trifft auf Knubbel.</p>
          <button type="button" className="primary" onClick={() => void authorize()} disabled={busy}>Bildschirmzeit erlauben</button>
          {status.state === 'denied' && <p className="muted small">Abgelehnt? Dann in den iPhone-Einstellungen unter Bildschirmzeit erlauben.</p>}
        </>
      ) : (
        <>
          <p className="muted small">
            {summary ? <>Gesperrt werden <strong>{summary}</strong>, solange eine Fokus-Runde läuft. Pausen bleiben frei.</> : 'Wähle aus, welche Apps im Fokus zu sind.'}
            {active && <span className="focus-lock-on"> Gerade gesperrt.</span>}
          </p>
          <div className="row wrap">
            <button type="button" className={summary ? '' : 'primary'} onClick={() => void pick()} disabled={busy}>{summary ? 'Auswahl ändern' : 'Apps auswählen'}</button>
            {blockedWeek > 0 && <span className="muted small">Diese Woche {plural(blockedWeek, 'Versuch', 'Versuche')} abgewehrt</span>}
          </div>
        </>
      )}
    </div>
  );
}
