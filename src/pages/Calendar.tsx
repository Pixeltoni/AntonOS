import { CalendarView } from '../components/calendar';
import { PageHeader, Panel } from '../components/ui';

export function Calendar() {
  return (
    <>
      <PageHeader title="Kalender" subtitle="Eigene Termine, Stundenplan, Aufgaben, Prüfungen, Projekte und Trainings" />
      <Panel>
        <CalendarView remember />
      </Panel>
    </>
  );
}
