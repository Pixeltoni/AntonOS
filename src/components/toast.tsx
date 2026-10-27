import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastCtx {
  show(message: string, action?: { label: string; run: () => void }, durationMs?: number): void;
}

const Ctx = createContext<ToastCtx>({ show: () => undefined });

export const useToast = () => useContext(Ctx);

/** Kleine Hinweise unten in der Mitte – z. B. „Erledigt · Widerrufen“ wie auf dem iPhone. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const counter = useRef(0);

  const show = useCallback<ToastCtx['show']>((message, action, durationMs = 5000) => {
    clearTimeout(timer.current);
    setToast({ id: ++counter.current, message, actionLabel: action?.label, onAction: action?.run });
    timer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast &&
        createPortal(
          <div className="toast" role="status" key={toast.id}>
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
