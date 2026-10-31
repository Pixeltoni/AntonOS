import { useEffect, useRef } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { useStore } from '../store';
import { isNativeApp, onNoticeTap, replacePlanned } from '../lib/native';
import { plannedNotices } from '../lib/schedule';
import { useCalendarEntries } from './calendar';

/**
 * Nur in der iOS-App: meldet Erinnerungen der nächsten zwei Wochen beim System an,
 * damit sie auch kommen, wenn AntonOS ganz geschlossen ist.
 */
export function useNativeNotifications() {
  const { data } = useStore();
  const entries = useCalendarEntries();
  const latest = useRef({ entries, data });
  latest.current = { entries, data };

  useEffect(() => {
    if (!isNativeApp()) return;
    const timer = setTimeout(() => {
      const { entries, data } = latest.current;
      void replacePlanned(plannedNotices(entries, data, new Date())).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [data]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const offTap = onNoticeTap((href) => (location.hash = href));
    // Beim Zurückkehren in die App neu planen (das Zeitfenster rückt weiter)
    const resume = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      const { entries, data } = latest.current;
      void replacePlanned(plannedNotices(entries, data, new Date())).catch(() => undefined);
    });
    return () => {
      offTap();
      void resume.then((h) => h.remove());
    };
  }, []);
}
