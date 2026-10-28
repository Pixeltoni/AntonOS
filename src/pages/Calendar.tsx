import { useRef } from 'react';
import { CalendarView } from '../components/calendar';
import { PageHeader, Panel } from '../components/ui';
import { useToast } from '../components/toast';
import { useStore } from '../store';
import { newEventsOnly, parseICS, toICS } from '../lib/ics';

/** Eigene Termine als .ics herunterladen bzw. aus einer .ics-Datei übernehmen */
function IcsTools() {
  const { data, add } = useStore();
  const { show } = useToast();
  const file = useRef<HTMLInputElement>(null);

  const download = () => {
    const url = URL.createObjectURL(new Blob([toICS(data.events)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'antonos-kalender.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const load = async (f: File) => {
    try {
      const incoming = parseICS(await f.text());
      const fresh = newEventsOnly(data.events, incoming);
      fresh.forEach((e) => add('events', e));
      const skipped = incoming.length - fresh.length;
      show(incoming.length === 0 ? 'Keine Termine in der Datei gefunden' : `${fresh.length} ${fresh.length === 1 ? 'Termin' : 'Termine'} übernommen${skipped ? ` · ${skipped} schon vorhanden` : ''}`);
    } catch {
      show('Die Datei konnte nicht gelesen werden');
    }
  };

  return (
    <div className="row wrap small cal-ics">
      <span className="muted">Andere Kalender (Google, Apple, Uni):</span>
      <button type="button" onClick={() => file.current?.click()}>.ics importieren</button>
      <button type="button" onClick={download} disabled={data.events.length === 0}>Eigene Termine exportieren</button>
      <input
        ref={file}
        type="file"
        accept=".ics,text/calendar"
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          if (f) void load(f);
          ev.target.value = '';
        }}
      />
    </div>
  );
}

export function Calendar() {
  return (
    <>
      <PageHeader title="Kalender" subtitle="Eigene Termine, Stundenplan, Aufgaben, Prüfungen, Projekte und Trainings" />
      <Panel>
        <CalendarView remember />
      </Panel>
      <IcsTools />
    </>
  );
}
