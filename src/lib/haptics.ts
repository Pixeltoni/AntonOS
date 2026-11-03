/** Spürbares Feedback: in der iPhone-App über die Taptic Engine, sonst (Android) über `vibrate`. */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const native = () => Capacitor.isNativePlatform();

/** Kurzes, leichtes Tippen – z. B. beim Abhaken */
export function tap(): void {
  if (native()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  else navigator.vibrate?.(10);
}

/** Kräftiger – z. B. beim Ziehen oder Auswählen */
export function bump(): void {
  if (native()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
  else navigator.vibrate?.(15);
}

/** Erfolg – z. B. wenn ein Ring geschlossen oder alles erledigt ist */
export function success(): void {
  if (native()) void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  else navigator.vibrate?.([12, 60, 18]);
}

/** Leichtes Ruckeln – z. B. bei „Widerrufen“ */
export function undo(): void {
  if (native()) void Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
  else navigator.vibrate?.([8, 40, 8]);
}
