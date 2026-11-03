import type { DateStr, ShoppingItem } from '../types';

export interface Receipt {
  store: string;
  total: number | null;
  date: DateStr | null;
  /** Artikelzeilen ohne Preis */
  items: string[];
}

const TOTAL = /\b(summe|gesamt(?:betrag)?|total|zu zahlen|zahlbetrag|betrag|bar|ec[- ]?karte|kartenzahlung)\b/i;
const SKIP = /\b(mwst|ust|steuer|netto|brutto|rückgeld|gegeben|kasse|bon|beleg|uhr|tel|www|danke|filiale|ust-?id|tse|terminal|trace|genehmigung)\b/i;
const PRICE = /(-?\d{1,4}[.,]\d{2})\s*(?:€|eur)?\s*[a-c*]?\s*$/i;

const toNumber = (s: string) => Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);

/** Bekannte Ketten zuerst, sonst die erste Zeile mit Buchstaben */
const STORES = ['rewe', 'edeka', 'aldi', 'lidl', 'netto', 'penny', 'kaufland', 'dm', 'rossmann', 'müller', 'real', 'globus', 'tegut', 'norma', 'denns', 'alnatura', 'ikea', 'mediamarkt', 'saturn'];

/**
 * Liest einen Kassenzettel aus erkannten Textzeilen: Geschäft, Summe, Datum und Artikel.
 * Ohne erkennbare Summe gilt der größte Betrag.
 */
export function parseReceipt(lines: string[]): Receipt {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lower = clean.map((l) => l.toLowerCase());
  const chain = STORES.find((s) => lower.slice(0, 8).some((l) => new RegExp(`\\b${s}\\b`).test(l)));
  const first = clean.find((l) => /[a-zäöü]{3}/i.test(l) && !SKIP.test(l));
  const store = chain ? chain.charAt(0).toUpperCase() + chain.slice(1) : (first ?? '').slice(0, 40);

  let total: number | null = null;
  const amounts: number[] = [];
  const items: string[] = [];
  clean.forEach((line, i) => {
    const m = PRICE.exec(line);
    const value = m ? toNumber(m[1]) : null;
    if (value !== null && Number.isFinite(value)) amounts.push(value);
    if (TOTAL.test(line)) {
      // Betrag in derselben oder der nächsten Zeile
      const here = value ?? (PRICE.exec(clean[i + 1] ?? '') ? toNumber(PRICE.exec(clean[i + 1])![1]) : null);
      if (here !== null && total === null && here > 0) total = here;
      return;
    }
    if (m && total === null && !SKIP.test(line)) {
      const name = line.slice(0, m.index).replace(/\s+\d+\s*[x×]\s*$/i, '').replace(/[*]+/g, '').trim();
      if (/[a-zäöü]{2}/i.test(name) && value !== null && value > 0) items.push(name);
    }
  });
  if (total === null && amounts.length) total = Math.max(...amounts);

  let date: DateStr | null = null;
  for (const line of clean) {
    const d = /\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/.exec(line);
    if (d) {
      const year = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
      const mm = Number(d[2]);
      const dd = Number(d[1]);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        date = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        break;
      }
    }
  }
  return { store, total: total === null ? null : Math.round(total * 100) / 100, date, items };
}

const squash = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

/** Offene Artikel der Einkaufsliste, die auf dem Kassenzettel stehen (Anfang des Namens reicht) */
export function boughtItems(receipt: Receipt, shopping: ShoppingItem[]): ShoppingItem[] {
  const lines = receipt.items.map(squash);
  return shopping.filter((s) => {
    if (s.done) return false;
    const name = squash(s.name);
    if (name.length < 3) return false;
    const stem = name.slice(0, Math.max(3, Math.min(name.length, 5)));
    return lines.some((l) => l.includes(name) || l.startsWith(stem));
  });
}

/** Kategorie nach Geschäft: Drogerie zählt zu Gesundheit, Möbel/Technik zu Sonstiges, sonst Lebensmittel */
export function receiptCategory(store: string): string {
  const s = store.toLowerCase();
  if (/\b(dm|rossmann|müller|apotheke)\b/.test(s)) return 'Gesundheit';
  if (/\b(ikea|mediamarkt|saturn)\b/.test(s)) return 'Sonstiges';
  return 'Lebensmittel';
}
