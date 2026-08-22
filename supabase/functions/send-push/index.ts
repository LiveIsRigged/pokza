// Edge Function `send-push`
// ==========================
// Déclenchée par un Database Webhook sur INSERT dans `public.notifications` : construit un message
// lisible à partir de la notification, puis l'envoie en Web Push à tous les appareils du destinataire.
//
// Secrets requis (Dashboard → Edge Functions → Secrets, ou `supabase secrets set`) :
//   VAPID_KEYS     = le JSON { publicKey, privateKey } (fourni séparément, NE PAS committer)
//   VAPID_SUBJECT  = "mailto:ton-email@exemple.com" (contact VAPID ; optionnel, défaut ci-dessous)
//   WEBHOOK_SECRET = secret partagé avec le trigger DB (le même que celui de `report-notify`)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement à la fonction.
//
// Déployer SANS vérification de JWT (l'appel vient du trigger, qui s'authentifie par le secret) :
//   supabase functions deploy send-push --no-verify-jwt --project-ref <REF>
// Le trigger est défini dans docs/dev/push-webhook.sql.
//
// NB : à tester après déploiement (impossible à exécuter en local sans push service + appareil réel).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush';

type NotificationType =
  | 'post_like'
  | 'post_comment'
  | 'comment_reply'
  | 'comment_like'
  | 'friend_request'
  | 'friend_accept'
  | 'friend_posted'
  | 'group_invite'
  | 'group_accept'
  | 'group_posted'
  | 'report_resolved'
  | 'content_removed'
  | 'account_sanctioned';

interface NotificationRecord {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  group_id: string | null;
}

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const appServerPromise = (async () => {
  const vapidKeys = await webpush.importVapidKeys(
    JSON.parse(Deno.env.get('VAPID_KEYS')!),
    { extractable: false },
  );
  return webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@pokza.app',
    vapidKeys,
  });
})();

/** Message affiché (miroir de `textFor` côté app). La modération ne nomme jamais l'admin. */
function bodyFor(
  type: NotificationType,
  actorName: string,
  postLocation: string | null,
  groupName: string | null,
): string {
  switch (type) {
    case 'post_like':
      return `${actorName} a aimé ta main`;
    case 'comment_like':
      return `${actorName} a aimé ton commentaire`;
    case 'post_comment':
      return `${actorName} a commenté ta main`;
    case 'comment_reply':
      return `${actorName} a répondu à ton commentaire`;
    case 'friend_request':
      return `${actorName} veut devenir ami avec toi`;
    case 'friend_accept':
      return `${actorName} a accepté ta demande d'ami`;
    case 'friend_posted':
      return postLocation ? `${actorName} a posté une main à ${postLocation}` : `${actorName} a posté une main`;
    case 'group_invite':
      return `${actorName} t'invite dans le groupe privé ${groupName ?? ''}`.trim();
    case 'group_accept':
      return `${actorName} a rejoint le groupe privé ${groupName ?? ''}`.trim();
    case 'group_posted':
      return `${actorName} a posté une main dans le groupe privé ${groupName ?? ''}`.trim();
    case 'report_resolved':
      return 'Ton signalement a été traité par la modération.';
    case 'content_removed':
      return 'Un de tes contenus a été retiré par la modération.';
    case 'account_sanctioned':
      return 'Ton compte a fait l’objet d’une mesure de modération.';
  }
}

/** Lien profond ouvert au clic (miroir des routes gérées : /post/:id et /invite/:userId). */
function urlFor(n: NotificationRecord): string {
  if (n.type === 'report_resolved' || n.type === 'account_sanctioned') return '/';
  if (n.post_id) return `/post/${n.post_id}`;
  if (n.type === 'friend_request' || n.type === 'friend_accept') return `/invite/${n.actor_id}`;
  return '/';
}

type PrefFamily = 'likes' | 'comments' | 'friends' | 'groups' | 'posted' | 'posted_groups';

/** Famille des Réglages > Notifications à laquelle appartient chaque type — miroir de
 * `notificationPrefs.ts` côté app. `null` = modération, jamais désactivable. `friends`/`groups` ne
 * couvrent que le social (demande, invitation, acceptation) ; les mains postées ont leurs propres
 * interrupteurs, demandés séparément le 16/08 puis scindés en deux le 22/08 — `posted` pour les
 * mains d'un ami, `posted_groups` pour celles d'un groupe privé, afin de pouvoir faire taire l'un
 * sans perdre l'autre. */
function familyFor(type: NotificationType): PrefFamily | null {
  switch (type) {
    case 'post_like':
    case 'comment_like':
      return 'likes';
    case 'post_comment':
    case 'comment_reply':
      return 'comments';
    case 'friend_request':
    case 'friend_accept':
      return 'friends';
    case 'group_invite':
    case 'group_accept':
      return 'groups';
    case 'friend_posted':
      return 'posted';
    case 'group_posted':
      return 'posted_groups';
    case 'report_resolved':
    case 'content_removed':
    case 'account_sanctioned':
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // Authentifie l'APPELANT : seul le trigger DB, qui connaît le secret, peut déclencher un envoi.
  // Sans ce contrôle, la fonction acceptait n'importe quelle requête porteuse d'une clé Supabase —
  // or la clé publiable est dans le bundle JS, donc lisible par n'importe qui. Un tiers pouvait
  // ainsi pousser une notification arbitraire sur l'appareil de n'importe quel compte : faux
  // message de modération (« Ton compte a fait l'objet d'une mesure »), usurpation d'un autre
  // joueur via `actor_id`, et URL de destination forgée au clic.
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const payload = await req.json();
    const n: NotificationRecord | undefined = payload?.record;
    if (!n || payload.table !== 'notifications' || payload.type !== 'INSERT') {
      return new Response('ignored', { status: 200 });
    }

    // Coupure par famille (Réglages > Notifications, push uniquement — l'historique in-app reste
    // toujours complet). L'ABSENCE de ligne veut dire « tout activé » : on ne filtre que si une
    // ligne existe et que la famille y est explicitement à `false`.
    const family = familyFor(n.type);
    if (family) {
      const { data: prefs } = await admin
        .from('notification_prefs')
        .select(family)
        .eq('user_id', n.recipient_id)
        .maybeSingle();
      if (prefs && (prefs as Record<PrefFamily, boolean>)[family] === false) {
        return new Response('family disabled', { status: 200 });
      }
    }

    // Résolution des libellés en service_role (contourne la RLS).
    const [{ data: actor }, post, group] = await Promise.all([
      admin.from('profiles').select('pseudo').eq('id', n.actor_id).maybeSingle(),
      n.post_id
        ? admin.from('posts').select('location').eq('id', n.post_id).maybeSingle()
        : Promise.resolve({ data: null }),
      n.group_id
        ? admin.from('groups').select('name').eq('id', n.group_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const actorName = actor?.pseudo ?? 'Quelqu’un';
    const body = bodyFor(n.type, actorName, post?.data?.location ?? null, group?.data?.name ?? null);
    const message = JSON.stringify({
      title: 'Pokza',
      body,
      url: urlFor(n),
      tag: `${n.type}:${n.post_id ?? n.group_id ?? n.actor_id}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    });

    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', n.recipient_id);
    if (error) throw error;
    if (!subs || subs.length === 0) return new Response('no subscriptions', { status: 200 });

    const appServer = await appServerPromise;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const subscriber = appServer.subscribe({
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          });
          await subscriber.pushTextMessage(message, {});
        } catch (err) {
          // Abonnement expiré/supprimé côté navigateur (404/410) → on le retire.
          const status = (err as { response?: { status?: number } })?.response?.status;
          const gone = status === 404 || status === 410 || /410|404|gone|expired/i.test(String(err));
          if (gone) {
            await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          } else {
            console.error('push failed', s.endpoint, err);
          }
        }
      }),
    );

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('send-push error', err);
    return new Response('error', { status: 500 });
  }
});
