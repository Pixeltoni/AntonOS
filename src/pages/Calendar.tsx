import { CalendarView } from '../components/calendar';
import { PageHeader, Panel } from '../components/ui';

export function Calendar() {
  return (
    <>
      <PageHeader title="Kalender" subtitle="Eigene Termine plus Aufgaben, Prüfungen, Projekte und Trainings" />
      <Panel>
        <CalendarView remember />
      </Panel>
    </>
  );
}
