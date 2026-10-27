import { MonthCalendar } from '../components/widgets';
import { PageHeader, Panel } from '../components/ui';

export function Calendar() {
  return (
    <>
      <PageHeader title="Kalender" subtitle="Aufgaben, Prüfungen, Projekte und Trainings im Monat" />
      <Panel>
        <MonthCalendar />
      </Panel>
    </>
  );
}
