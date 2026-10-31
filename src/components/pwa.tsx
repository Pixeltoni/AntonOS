import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { today } from '../lib/dates';
import { askNotifications, notifyProblemText, showNotice } from '../lib/notify';
import { isNativeApp, nativePermission } from '../lib/native';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, parseShared, promptInstall, setBadge, type SharedContent } from '../lib/pwa';
import { useToast } from './toast';

/** Zahl am App-Symbol: Aufgaben, die heute fällig oder überfällig sind */
export function useAppBadge() {
  const { data } = useStore();
  const t = today();
  const count = data.tasks.filter((x) => x.status !== 'erledigt' && x.due !== null && x.due <= t).length;
  useEffect(() => setBadge(count), [count]);
}

/** Hinweis, solange das Gerät offline ist */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return <p className="offline-banner" role="status">✈️ Offline – alles funktioniert weiter. Änderungen werden synchronisiert, sobald du wieder online bist.</p>;
}

/** Teilen-Menü: Links und Texte aus anderen Apps in AntonOS ablegen */
export function ShareSheet() {
  const { add } = useStore();
  const { show } = useToast();
  const [shared, setShared] = useState<SharedContent | null>(() => parseShared(location.search));
  const [title, setTitle] = useState(shared?.title ?? '');

  const clear = () => {
    setShared(null);
    // Parameter aus der Adresse entfernen, damit beim Neuladen nichts doppelt landet
    history.replaceState(null, '', location.pathname + location.hash);
  };
  if (!shared) return null;

  const name = title.trim() || shared.url || 'Geteilter Inhalt';
  const host = (() => {
    try {
      return shared.url ? new URL(shared.url).hostname.replace(/^www\./, '') : '';
    } catch {
      return '';
    }
  })();
  const done = (label: string, href: string) => {
    show(`In ${label} gespeichert`, { label: 'Ansehen', run: () => (location.hash = href) });
    clear();
  };
  const body = [shared.text, shared.url].filter(Boolean).join('\n\n');
  const options: { icon: string; label: string; run: () => void }[] = [
    { icon: '📝', label: 'Als Notiz', run: () => { const id = add('notes', { title: name, courseId: null, content: body, updated: new Date().toISOString() }); done('Notizen', `#/notizen/${id}`); } },
    { icon: '✅', label: 'Als Aufgabe', run: () => { add('tasks', { title: name, courseId: null, kind: 'Aufgabe', status: 'offen', priority: 'mittel', due: null, note: body }); done('Aufgaben', '#/aufgaben'); } },
    { icon: '📺', label: 'Zur Watchlist', run: () => { add('media', { kind: 'Serie', title: name, creator: host, cover: '', status: 'geplant', rating: 0, progress: '' }); done('der Watchlist', '#/schauen'); } },
    { icon: '📖', label: 'Zur Leseliste', run: () => { add('media', { kind: 'Buch', title: name, creator: host, cover: '', status: 'geplant', rating: 0, progress: '' }); done('der Leseliste', '#/lesen'); } },
    { icon: '🍽️', label: 'Als Rezept', run: () => { const id = add('recipes', { title: name, minutes: 0, servings: 2, ingredients: '', steps: shared.text, image: '', url: shared.url, tags: '' }); done('den Rezepten', `#/essen/${id}`); } },
    ...(shared.url ? [{ icon: '🧰', label: 'Zu den Tools', run: () => { add('tools', { name, url: shared.url, category: 'Geteilt' }); done('den Tools', '#/tools'); } }] : []),
  ];

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && clear()}>
      <div className="modal share-sheet" role="dialog" aria-modal="true" aria-label="Mit AntonOS teilen">
        <div className="row between">
          <h2>Mit AntonOS teilen</h2>
          <button type="button" className="icon" onClick={clear} aria-label="Schließen">×</button>
        </div>
        <label>
          Titel
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" autoFocus />
        </label>
        {(shared.url || shared.text) && <p className="muted small share-preview">{shared.text && <span>{shared.text}</span>}{shared.url && <span>{shared.url}</span>}</p>}
        <div className="share-options">
          {options.map((o) => (
            <button key={o.label} type="button" onClick={o.run}>
              <span aria-hidden>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Einstellungen: installieren, Mitteilungen, Offline */
export function AppPanel() {
  const { show } = useToast();
  const [, rerender] = useState(0);
  const [permission, setPermission] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  useEffect(() => onInstallChange(() => rerender((x) => x + 1)) as () => void, []);
  const native = isNativeApp();
  useEffect(() => {
    if (native) void nativePermission(false).then(setPermission);
  }, [native]);
  const standalone = isStandalone();
  const ios = isIOS();

  const allow = async () => {
    const result = await askNotifications();
    setPermission(result);
    if (result === 'granted') {
      const result = await showNotice('AntonOS', 'Mitteilungen sind eingeschaltet 🎉');
      if (result !== 'ok') show(`Mitteilungen sind erlaubt, die erste kam aber nicht an. ${notifyProblemText(result)}`, undefined, 8000);
    } else if (result === 'denied') {
      show('Mitteilungen sind blockiert – du kannst sie in den Einstellungen des Geräts erlauben.', undefined, 7000);
    }
  };

  const test = async () => {
    const result = await showNotice('AntonOS', 'So sieht eine Mitteilung aus.', 'test');
    if (result === 'ok') show('Test-Mitteilung gesendet. Nichts zu sehen? Dann sind Mitteilungen in den Geräte-Einstellungen aus.', undefined, 6000);
    else show(`Test fehlgeschlagen. ${notifyProblemText(result)}`, undefined, 8000);
    if (native) setPermission(await nativePermission(false));
    else if (typeof Notification !== 'undefined') setPermission(Notification.permission);
  };

  return (
    <div className="col app-panel">
      {native ? (
        <p>✅ <strong>Du nutzt die iOS-App von AntonOS.</strong> Alles liegt auf dem Gerät und funktioniert auch offline.</p>
      ) : standalone ? (
        <p>✅ <strong>AntonOS läuft als App.</strong> Es funktioniert auch offline und zeigt am Symbol, wie viele Aufgaben heute fällig sind.</p>
      ) : ios ? (
        <div className="install-steps">
          <p><strong>So kommt AntonOS als App auf dein iPhone oder iPad – kostenlos, ohne App Store:</strong></p>
          <ol>
            <li>Öffne diese Seite in <strong>Safari</strong>.</li>
            <li>Tippe unten auf <strong>Teilen</strong> <span className="ios-share" aria-hidden>⬆︎</span>.</li>
            <li>Wähle <strong>„Zum Home-Bildschirm“</strong> und tippe auf <strong>Hinzufügen</strong>.</li>
            <li>Starte AntonOS über das neue Symbol und erlaube danach hier die Mitteilungen.</li>
          </ol>
        </div>
      ) : canPromptInstall() ? (
        <div className="row wrap">
          <button type="button" className="primary" onClick={() => promptInstall()}>📲 Als App installieren</button>
          <span className="muted small">Mit eigenem Fenster, Symbol und Offline-Modus.</span>
        </div>
      ) : (
        <p className="muted">Im Browser-Menü findest du „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Danach läuft AntonOS in einem eigenen Fenster und auch offline.</p>
      )}

      <div className="row wrap app-row">
        <span className="grow">
          <strong>🔔 Mitteilungen</strong>
          <br />
          <span className="muted small">
            {permission === 'granted' ? 'Erlaubt – für Termine, Vorlesungen, Ringe und den Fokus-Timer.'
              : permission === 'denied' ? (native ? 'Blockiert – in den iPhone-Einstellungen unter AntonOS → Mitteilungen erlauben.' : 'Blockiert – in den Geräte-Einstellungen für diese Seite erlauben.')
              : permission === 'unsupported' ? (ios && !standalone ? 'Auf dem iPhone erst nach dem Installieren möglich (iOS 16.4 oder neuer).' : 'Werden von diesem Browser nicht unterstützt.')
              : 'Noch nicht erlaubt.'}
          </span>
        </span>
        {permission === 'default' && <button type="button" onClick={allow}>Erlauben</button>}
        {permission === 'granted' && <button type="button" onClick={test}>Testen</button>}
      </div>
      <p className="muted small">
        {native
          ? 'Erinnerungen an Termine, Aufgaben, Geburtstage, Kündigungsfristen und Reisen der nächsten zwei Wochen sind beim iPhone angemeldet und kommen auch, wenn AntonOS ganz geschlossen ist.'
          : 'Mitteilungen kommen, solange AntonOS geöffnet ist oder als App im Hintergrund läuft. Für Mitteilungen bei ganz geschlossener App gibt es die iOS-App.'}
      </p>
    </div>
  );
}
