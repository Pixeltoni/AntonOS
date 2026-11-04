import { useEffect, useRef } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { useStore } from '../store';
import { AntonWidgets, isNativeApp } from '../lib/native';
import { parseWidgetActions, parseWidgetLink, resolveWidgetActions, widgetSnapshot } from '../lib/widgets';
import { useCalendarEntries } from './calendar';
import { openAssistant } from './assistant';
import { useFocus } from './focus';
import { useRest } from './rest';
import { useRoutine } from './routine';

const APPLIED_KEY = 'antonos:widget-uebernommen';

function readApplied(): number {
  try {
    return Number(localStorage.getItem(APPLIED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeApplied(at: number) {
  try {
    localStorage.setItem(APPLIED_KEY, String(at));
  } catch {
    // dann eben nur bis zum Neustart gemerkt
  }
}

/**
 * Nur in der iOS-App: hält die Widgets auf dem Homescreen aktuell, übernimmt dort
 * abgehakte Einträge und öffnet Links aus Widgets und Kontrollzentrum.
 */
export function useNativeWidgets() {
  const { data, add, update, remove } = useStore();
  const entries = useCalendarEntries();
  const focus = useFocus();
  const rest = useRest();
  const routine = useRoutine();
  const latest = useRef({ data, entries, focus, rest, routine });
  latest.current = { data, entries, focus, rest, routine };
  /** Bis zu diesem Zeitpunkt (ms) sind Aktionen aus dem Widget übernommen – gemerkt, damit z. B. Lernkarten nach einem Neustart nicht doppelt zählen */
  const applied = useRef(readApplied());

  const push = () => {
    const { data, entries } = latest.current;
    return AntonWidgets.update({ snapshot: JSON.stringify(widgetSnapshot(data, entries, new Date())), applied: applied.current });
  };
  const pushRef = useRef(push);
  pushRef.current = push;

  // Stand ablegen – kurz gewartet, damit schnelles Tippen nicht jedes Mal neu zeichnet
  useEffect(() => {
    if (!isNativeApp()) return;
    const timer = setTimeout(() => void pushRef.current().catch(() => undefined), 1200);
    return () => clearTimeout(timer);
  }, [data, entries]);

  useEffect(() => {
    if (!isNativeApp()) return;

    // Im Widget Abgehaktes übernehmen; der Effekt oben legt danach den neuen Stand ab
    const takeActions = async () => {
      try {
        const { actions } = await AntonWidgets.takeActions();
        // Schon übernommene Aktionen liegen bis zum nächsten Ablegen noch in der Warteschlange
        const list = parseWidgetActions(JSON.parse(actions || '[]')).filter((a) => a.at > applied.current);
        const ops = resolveWidgetActions(latest.current.data, list);
        for (const op of ops) {
          if (op.op === 'update') update(op.collection, op.id, op.patch as never);
          else if (op.op === 'add') add(op.collection, op.item);
          else remove(op.collection, op.id);
        }
        applied.current = Math.max(applied.current, ...list.map((a) => a.at));
        writeApplied(applied.current);
        // Nichts geändert (oder neuer Tag): trotzdem frisch ablegen
        if (ops.length === 0) await pushRef.current();
      } catch {
        // ältere App-Version ohne Widgets
      }
    };

    const openLink = (url: string) => {
      const link = parseWidgetLink(url);
      if (!link) return;
      if (link.type === 'page') location.hash = link.hash;
      else if (link.type === 'assistant') setTimeout(openAssistant, 300);
      else if (link.type === 'rest') {
        location.hash = '#/training';
        const { rest } = latest.current;
        if (link.action === 'plus') rest.extend(30);
        else rest.skip();
      } else if (link.type === 'routine') {
        // Aus der Live-Aktivität: Routine groß zeigen und dort weiterschalten
        const { routine } = latest.current;
        if (!routine.run) return;
        routine.setOpen(true);
        if (link.action === 'next') routine.done();
        else routine.extend(60);
      } else {
        location.hash = '#/fokus';
        const { focus } = latest.current;
        if (link.action === 'stop') focus.stop(true);
        else if (link.action === 'pause' && focus.timer.running) focus.pause();
        else if (!focus.timer.running) focus.start();
      }
    };

    void takeActions();
    void NativeApp.getLaunchUrl().then((launch) => launch?.url && openLink(launch.url)).catch(() => undefined);
    const resume = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void takeActions();
    });
    const urls = NativeApp.addListener('appUrlOpen', ({ url }) => openLink(url));
    return () => {
      void resume.then((h) => h.remove());
      void urls.then((h) => h.remove());
    };
  }, [add, update, remove]);
}
