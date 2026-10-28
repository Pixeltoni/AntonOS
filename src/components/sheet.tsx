import { useEffect, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Eingabe-Fenster wie in iOS: „Abbrechen“ links, Titel in der Mitte, „Hinzufügen“ rechts.
 * Am Handy kommt es von unten, am PC erscheint es in der Mitte.
 */
export function Sheet({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Hinzufügen',
  submitDisabled,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  return createPortal(
    <div className="modal-backdrop sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <div className="sheet-head">
          <button type="button" className="sheet-cancel" onClick={onClose}>Abbrechen</button>
          <strong>{title}</strong>
          {onSubmit ? <button type="submit" className="sheet-done" disabled={submitDisabled}>{submitLabel}</button> : <button type="button" className="sheet-done" onClick={onClose}>Fertig</button>}
        </div>
        <div className="sheet-body">{children}</div>
      </form>
    </div>,
    document.body,
  );
}

/** Runder „+“-Knopf oben rechts wie in iOS-Apps */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="add-btn" onClick={onClick} aria-label={label} title={label}>
      <span aria-hidden>+</span>
    </button>
  );
}

/** Farbe aus einem Text (für Symbole ohne eigene Farbe) */
const PALETTE = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5856D6', '#30B0C7', '#FF3B30', '#A2845E', '#32ADE6'];
export function colorFor(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
