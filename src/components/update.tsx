import { useEffect, useState } from 'react';
import { APP_VERSION } from '../lib/version';
import { useSync } from './sync';

const CHECK_INTERVAL = 5 * 60_000;

/** Prüft, ob eine neuere AntonOS-Version veröffentlicht wurde. */
function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (APP_VERSION === 'dev') return;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== APP_VERSION) setAvailable(true);
      } catch {
        // offline – später erneut prüfen
      }
    };
    void check();
    const timer = setInterval(check, CHECK_INTERVAL);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return available;
}

export function UpdateBanner() {
  const available = useUpdateAvailable();
  const { status } = useSync();
  const outdated = status === 'veraltet';
  if (!available && !outdated) return null;
  return (
    <div className="alert update" role="status">
      <span>
        {outdated
          ? 'Auf einem anderen Gerät wurde eine neuere Version von AntonOS genutzt. Lade neu, damit hier alles (z. B. neue Kalendertermine) angezeigt und wieder synchronisiert wird.'
          : 'Eine neue Version von AntonOS ist verfügbar.'}
      </span>
      <button className="primary" onClick={() => location.reload()}>Jetzt neu laden</button>
    </div>
  );
}
