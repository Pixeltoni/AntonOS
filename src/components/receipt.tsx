import { useRef, useState } from 'react';
import { useStore } from '../store';
import { extras, isNativeApp } from '../lib/native';
import { boughtItems, parseReceipt, receiptCategory, type Receipt } from '../lib/receipt';
import { today } from '../lib/dates';
import { useToast } from './toast';
import { Sheet } from './sheet';
import { Sym } from './icons';

/** Bild verkleinern (lange Seite höchstens 2000 px) und als Base64-JPEG liefern */
async function toBase64(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Kassenzettel fotografieren: Betrag, Geschäft und Datum erkennen, Einkaufsliste abhaken */
export function ReceiptButton() {
  const { data, add, update } = useStore();
  const { show } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<(Receipt & { amount: string; category: string; check: string[] }) | null>(null);
  if (!isNativeApp()) return null;

  const read = async (f: File) => {
    setBusy(true);
    try {
      const image = await toBase64(f);
      const { lines } = await extras((p) => p.recognizeText({ image }), { lines: [] as string[] });
      if (lines.length === 0) return show('Auf dem Foto war kein Text zu erkennen – probier es mit mehr Licht.');
      const r = parseReceipt(lines);
      setDraft({ ...r, amount: r.total ? r.total.toFixed(2).replace('.', ',') : '', category: receiptCategory(r.store), check: boughtItems(r, data.shopping).map((s) => s.id) });
    } catch {
      show('Das Foto ließ sich nicht lesen.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft) return;
    const amount = Number(draft.amount.replace(/\./g, '').replace(',', '.'));
    if (!(amount > 0)) return;
    add('transactions', { type: 'Ausgabe', description: draft.store || 'Einkauf', amount, category: draft.category, account: 'Girokonto', date: draft.date ?? today() });
    draft.check.forEach((id) => update('shopping', id, { done: true }));
    show(`−${amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} gebucht${draft.check.length ? ` · ${draft.check.length} abgehakt` : ''}`);
    setDraft(null);
  };

  return (
    <>
      <button type="button" onClick={() => file.current?.click()} disabled={busy}>{busy ? 'Liest …' : <><Sym emoji="📷" size={16} /> Kassenzettel</>}</button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void read(f);
          e.target.value = '';
        }}
      />
      {draft && (
        <Sheet title="Kassenzettel" submitLabel="Ausgabe speichern" onClose={() => setDraft(null)} onSubmit={save} submitDisabled={!(Number(draft.amount.replace(',', '.')) > 0)}>
          <label>Geschäft<input value={draft.store} onChange={(e) => setDraft({ ...draft, store: e.target.value })} /></label>
          <div className="modal-grid">
            <label>Betrag (€)<input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></label>
            <label>Datum<input type="date" value={draft.date ?? today()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          </div>
          <label>Kategorie<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>
          {draft.items.length > 0 && <p className="muted small">Erkannt: {draft.items.slice(0, 8).join(', ')}{draft.items.length > 8 ? ' …' : ''}</p>}
          {data.shopping.some((s) => !s.done) && (
            <fieldset className="receipt-check">
              <legend>Auf der Einkaufsliste abhaken</legend>
              {data.shopping.filter((s) => !s.done).map((s) => (
                <label key={s.id} className="row">
                  <input type="checkbox" checked={draft.check.includes(s.id)} onChange={(e) => setDraft({ ...draft, check: e.target.checked ? [...draft.check, s.id] : draft.check.filter((x) => x !== s.id) })} />
                  {s.amount ? `${s.amount} ` : ''}{s.name}
                </label>
              ))}
            </fieldset>
          )}
        </Sheet>
      )}
    </>
  );
}
