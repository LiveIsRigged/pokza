import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Notifications Web Push (web / PWA uniquement). Le natif utiliserait `expo-notifications` — hors
 * sujet ici. Sur iPhone, le push ne marche QUE dans la PWA installée sur l'écran d'accueil (iOS 16.4+)
 * et la demande de permission doit partir d'un geste utilisateur (bouton « Activer »).
 */

// Clé publique VAPID (publique par nature : identifie le serveur d'envoi côté navigateur). La clé
// PRIVÉE correspondante est un secret de l'Edge Function `send-push`, jamais dans le code client.
const VAPID_PUBLIC_KEY = 'BF5VqEQSon92ysgbbK-fcqPUHdMCkGLeHtrdYRqwjQkMMODAYAEoJShJbfQ4ANpOH6p_1cMHXBz-HizaFCZr58w';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission as PushState;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Enregistre le service worker (sans demander de permission). Sûr à appeler à chaque démarrage. */
export async function registerPushServiceWorker(): Promise<void> {
  if (!pushSupported()) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (_e) {
    /* pas bloquant : le push sera juste indisponible */
  }
}

/**
 * Demande la permission (geste utilisateur requis), s'abonne et enregistre l'abonnement en base.
 * Renvoie l'état final.
 */
export async function enablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushState;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
  return 'granted';
}

/** Désabonne l'appareil courant et retire l'abonnement en base. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}
