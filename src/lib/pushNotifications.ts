// src/lib/pushNotifications.ts
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

// Le navigateur attend la clé VAPID sous forme de tableau d'octets, pas
// la chaîne base64url telle quelle.
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export function pushDisponible(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permissionDejaDemandee(): boolean {
  return Notification.permission !== 'default';
}

// Demande la permission (si pas déjà fait), s'abonne au push, et
// enregistre l'abonnement pour le compte connecté — un appareil peut
// avoir son propre abonnement, indépendant des autres.
export async function activerNotificationsPush(
  compteId: string
): Promise<void> {
  if (!pushDisponible()) {
    throw new Error(
      'Les notifications push ne sont pas disponibles sur ce navigateur.'
    );
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VITE_VAPID_PUBLIC_KEY non configurée.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications refusées.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      compte_id: compteId,
      endpoint: json.endpoint!,
      cle_p256dh: json.keys!.p256dh,
      cle_auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

// Désabonne cet appareil (ex: bouton "désactiver" dans un futur écran de
// réglages) — supprime aussi bien côté navigateur que côté base.
export async function desactiverNotificationsPush(): Promise<void> {
  if (!pushDisponible()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}