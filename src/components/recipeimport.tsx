import { useState } from 'react';
import { CapacitorHttp } from '@capacitor/core';
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/cloud';
import { isNativeApp } from '../lib/native';
import { normalizeRecipeUrl, pageData, recipeFromPage, type ImportResult, type PageData, type RecipeDraft } from '../lib/recipeimport';

export interface LoadedRecipe {
  result: ImportResult | null;
  /** Grund, falls nichts gelesen werden konnte */
  error?: string;
}

/** Lädt die Seite: in der iPhone-App direkt (kein CORS), im Browser über die Supabase-Funktion „rezept“ */
async function loadPage(url: string): Promise<{ page: PageData; url: string } | { error: string }> {
  if (isNativeApp()) {
    try {
      const r = await CapacitorHttp.get({ url, responseType: 'text', headers: { Accept: 'text/html,*/*;q=0.5', 'Accept-Language': 'de-DE,de;q=0.9' }, connectTimeout: 10_000, readTimeout: 15_000 });
      if (r.status >= 400) return { error: `Die Seite antwortet mit Fehler ${r.status}.` };
      return { page: pageData(typeof r.data === 'string' ? r.data : String(r.data ?? '')), url: r.url || url };
    } catch {
      return { error: 'Die Seite ließ sich nicht laden. Bist du online?' };
    }
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/rezept`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (res.status === 404) return { error: 'Im Browser ist der Import noch nicht eingerichtet. In der iPhone-App klappt er schon.' };
    const body = (await res.json().catch(() => null)) as (PageData & { url?: string; error?: string }) | null;
    if (!res.ok || !body) return { error: body?.error ? `${body.error}.` : 'Die Seite ließ sich nicht laden.' };
    return { page: { jsonld: Array.isArray(body.jsonld) ? body.jsonld : [], meta: body.meta ?? {}, title: body.title ?? '' }, url: body.url || url };
  } catch {
    return { error: 'Die Seite ließ sich nicht laden. Bist du online?' };
  }
}

/** Liest das Rezept hinter einem Link */
export async function loadRecipe(input: string): Promise<LoadedRecipe> {
  const url = normalizeRecipeUrl(input);
  if (!url) return { result: null, error: 'Das ist kein Link.' };
  const loaded = await loadPage(url);
  if ('error' in loaded) return { result: null, error: loaded.error };
  // Der Link bleibt der eingegebene, ohne Weiterleitungs- und Tracking-Umwege
  const result = recipeFromPage(loaded.page, url);
  return result ? { result } : { result: null, error: 'Auf der Seite steht kein Rezept.' };
}

/** Eingabefeld „Link einfügen → Importieren“ über dem Rezept-Formular */
export function RecipeImport({ onImport }: { onImport: (recipe: RecipeDraft, complete: boolean) => void }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const run = async () => {
    if (!link.trim() || busy) return;
    setBusy(true);
    setNote(null);
    const { result, error } = await loadRecipe(link);
    setBusy(false);
    if (!result) return setNote({ text: error ?? 'Das hat nicht geklappt.', bad: true });
    const { recipe, complete } = result;
    const n = recipe.ingredients ? recipe.ingredients.split('\n').length : 0;
    const s = recipe.steps ? recipe.steps.split('\n').length : 0;
    setNote(complete
      ? { text: `✓ ${n} ${n === 1 ? 'Zutat' : 'Zutaten'} und ${s} ${s === 1 ? 'Schritt' : 'Schritte'} übernommen. Schau kurz drüber und speichere.` }
      : { text: 'Keine Rezeptdaten auf der Seite – Titel, Foto und Link sind übernommen, Zutaten bitte selbst eintragen.' });
    setLink('');
    onImport(recipe, complete);
  };
  return (
    <div className="recipe-import">
      <form className="row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <span className="recipe-import-icon" aria-hidden>🔗</span>
        <input className="grow" type="text" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link von Chefkoch oder einem Food-Blog einfügen" aria-label="Link zum Rezept" disabled={busy} />
        <button type="submit" className="primary" disabled={!link.trim() || busy}>{busy ? 'Lese …' : 'Importieren'}</button>
      </form>
      {note && <p className={`small ${note.bad ? 'danger' : 'muted'}`} role="status">{note.text}</p>}
    </div>
  );
}
