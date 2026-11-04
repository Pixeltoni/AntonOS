import type { Admission, ExerciseSheet } from '../types';

/** Typische Regel: 12 Blätter à 20 Punkte, Zulassung ab der Hälfte */
export const defaultAdmission = (): Admission => ({ sheets: 12, maxPerSheet: 20, required: 50, unit: 'prozent' });

export type AdmissionStatus = 'geschafft' | 'auf Kurs' | 'knapp' | 'unmöglich' | 'offen';

export interface AdmissionState {
  /** Gesamtpunkte im Semester (angelegte Blätter plus noch fehlende nach Vorgabe) */
  total: number;
  /** Nötige Punkte für die Zulassung */
  required: number;
  /** Erreichte Punkte */
  earned: number;
  /** Korrigierte Blätter */
  graded: number;
  /** Blätter ohne Punkte (noch nicht korrigiert oder noch nicht angelegt) */
  open: number;
  /** In den offenen Blättern noch möglich */
  openMax: number;
  /** Bisher im Schnitt erreicht (Anteil 0–1), null ohne korrigierte Blätter */
  share: number | null;
  /** Ab jetzt nötig pro Blatt (Anteil 0–1), null ohne offene Blätter */
  needShare: number | null;
  /** Hochrechnung bei gleichbleibendem Schnitt */
  projected: number;
  status: AdmissionStatus;
}

const EPS = 1e-9;

/** Stand der Klausurzulassung mit Hochrechnung */
export function admissionState(admission: Admission, sheets: ExerciseSheet[]): AdmissionState {
  const planned = Math.max(admission.sheets, sheets.length);
  const missing = planned - sheets.length;
  const total = sheets.reduce((s, x) => s + Math.max(0, x.max), 0) + missing * Math.max(0, admission.maxPerSheet);
  const required = admission.unit === 'prozent' ? (total * admission.required) / 100 : admission.required;
  const graded = sheets.filter((x) => x.points !== null);
  const earned = graded.reduce((s, x) => s + (x.points ?? 0), 0);
  const gradedMax = graded.reduce((s, x) => s + Math.max(0, x.max), 0);
  const openMax = Math.max(0, total - gradedMax);
  const share = gradedMax > 0 ? earned / gradedMax : null;
  const rest = Math.max(0, required - earned);
  const needShare = openMax > 0 ? rest / openMax : null;
  const projected = earned + (share ?? 0) * openMax;
  const status: AdmissionStatus =
    earned >= required - EPS ? 'geschafft'
      : earned + openMax < required - EPS ? 'unmöglich'
        : share === null ? 'offen'
          : projected >= required - EPS ? 'auf Kurs' : 'knapp';
  return { total, required, earned, graded: graded.length, open: planned - graded.length, openMax, share, needShare, projected, status };
}

/** Nummer für das nächste Blatt */
export const nextSheetNumber = (sheets: ExerciseSheet[]) => sheets.reduce((m, s) => Math.max(m, s.number), 0) + 1;

const pts = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const pct = (share: number) => `${Math.round(share * 100)} %`;

/** Ein Satz zum Stand, z. B. „Noch 18 Punkte in 4 Blättern – bisher 68 % pro Blatt, nötig sind 45 %.“ */
export function describeAdmission(s: AdmissionState): string {
  const rest = Math.max(0, s.required - s.earned);
  const sheetsWord = s.open === 1 ? 'Blatt' : 'Blättern';
  switch (s.status) {
    case 'geschafft':
      return `Zulassung geschafft: ${pts(s.earned)} von ${pts(s.required)} nötigen Punkten.`;
    case 'unmöglich':
      return `Nicht mehr zu schaffen: Selbst mit allen restlichen Punkten fehlen ${pts(rest - s.openMax)}.`;
    case 'offen':
      return `Nötig sind ${pts(s.required)} von ${pts(s.total)} Punkten (${pct(s.total > 0 ? s.required / s.total : 0)}).`;
    case 'auf Kurs':
      return `Noch ${pts(rest)} Punkte in ${s.open} ${sheetsWord}. Bisher ${pct(s.share ?? 0)} pro Blatt, nötig sind ab jetzt ${pct(s.needShare ?? 0)}.`;
    case 'knapp':
      return `Knapp: Ab jetzt brauchst du ${pct(s.needShare ?? 0)} pro Blatt, bisher waren es ${pct(s.share ?? 0)}.`;
  }
}
