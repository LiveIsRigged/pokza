-- LOT 4 — Webhook push authentifié (remplace le Database Webhook du dashboard)
-- ===========================================================================
-- POURQUOI : l'Edge Function `send-push` n'authentifiait pas son appelant. Elle acceptait
-- n'importe quelle requête porteuse d'une clé Supabase — or la clé publiable est dans le bundle
-- JS, donc lisible par n'importe quel visiteur. Conséquence : un tiers pouvait pousser une
-- notification arbitraire sur l'appareil de n'importe quel compte (faux message de modération,
-- usurpation d'un joueur via `actor_id`, URL forgée ouverte au clic).
--
-- CORRECTIF : `send-push` exige désormais l'en-tête `x-webhook-secret` (cf. son index.ts), et
-- l'appel vient d'un trigger `pg_net` versionné ici — au lieu d'un webhook configuré à la main
-- dans le dashboard, invisible du dépôt.
--
-- Ce script est IDEMPOTENT : il peut être relancé sans dommage.
-- Il ne touche à aucune donnée, ne supprime aucune notification.
--
-- PRÉ-REQUIS : le webhook de modération doit déjà être configuré dans cet environnement
-- (secrets vault `report_notify_url` et `report_webhook_secret`) — les valeurs de ce script
-- en sont dérivées automatiquement, il n'y a donc AUCUN identifiant à saisir à la main.
--
-- ORDRE : DEV d'abord, PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

create extension if not exists pg_net;

-- 1. Secrets vault, dérivés de ceux du webhook de modération ---------------------------
--    - send_push_url      = même URL que report-notify, avec le nom de fonction remplacé
--    - push_webhook_secret = même secret partagé (celui de WEBHOOK_SECRET côté Edge Functions)
do $$
declare
  v_notify_url text;
  v_secret     text;
  v_push_url   text;
  v_id         uuid;
begin
  select decrypted_secret into v_notify_url from vault.decrypted_secrets where name = 'report_notify_url';
  select decrypted_secret into v_secret     from vault.decrypted_secrets where name = 'report_webhook_secret';

  if v_notify_url is null or v_secret is null then
    raise exception
      'Le webhook de modération n''est pas configuré dans cet environnement : secrets vault "report_notify_url" et/ou "report_webhook_secret" absents. Lance docs/dev/moderation-webhook.sql en premier.';
  end if;

  v_push_url := replace(v_notify_url, '/report-notify', '/send-push');

  select id into v_id from vault.secrets where name = 'send_push_url';
  if v_id is null then
    perform vault.create_secret(v_push_url, 'send_push_url', 'URL de l''Edge Function send-push');
  else
    perform vault.update_secret(v_id, v_push_url);
  end if;

  select id into v_id from vault.secrets where name = 'push_webhook_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'push_webhook_secret', 'Secret partagé des webhooks internes (= WEBHOOK_SECRET)');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end;
$$;

-- 2. Trigger : à chaque notification insérée, appelle send-push AVEC le secret --------
--    Le corps reproduit exactement la forme d'un Database Webhook Supabase
--    ({ type, table, schema, record }) pour que send-push n'ait pas à changer de contrat.
create or replace function public.notify_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';

  if v_url is null or v_secret is null then
    return new;  -- push non configuré : la notification in-app est créée quand même
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'notifications',
                 'schema', 'public',
                 'record', to_jsonb(new)
               ),
    headers := jsonb_build_object(
                 'content-type',     'application/json',
                 'x-webhook-secret', v_secret
               )
  );
  return new;
exception when others then
  -- Un échec réseau ne doit JAMAIS faire échouer l'insertion de la notification :
  -- sans ce garde-fou, un push indisponible casserait les likes, commentaires et invitations.
  return new;
end;
$$;

drop trigger if exists trg_notify_push_on_notification on public.notifications;
create trigger trg_notify_push_on_notification
  after insert on public.notifications
  for each row execute function public.notify_push_on_notification();

-- 3. Retrait de l'ANCIEN webhook, celui créé à la main dans le dashboard ---------------
--    Il s'appelle `push_on_notification` et pointe vers `supabase_functions.http_request()`.
--    Il faut le supprimer, sinon les deux coexistent : l'ancien continuerait d'appeler
--    `send-push` sans l'en-tête secret, ce qui remplirait les journaux de refus 401.
--    (Le supprimer ici plutôt que dans l'interface garantit que la manœuvre est rejouable
--    à l'identique sur les deux environnements, et laisse une trace dans le dépôt.)
drop trigger if exists push_on_notification on public.notifications;

-- 4. Vérification (lecture seule) — 3 lignes « OK » attendues -------------------------
select 'Secrets vault en place' as controle,
       case when count(*) = 2 then 'OK' else 'ECHEC : ' || count(*)::text || '/2' end as resultat
from vault.secrets where name in ('send_push_url', 'push_webhook_secret')
union all
select 'Nouveau trigger authentifie actif',
       case when count(*) = 1 then 'OK' else 'ECHEC' end
from pg_trigger where tgname = 'trg_notify_push_on_notification'
union all
select 'Ancien webhook du dashboard retire',
       case when count(*) = 0 then 'OK' else '*** ECHEC : il tourne encore ***' end
from pg_trigger where tgname = 'push_on_notification';
