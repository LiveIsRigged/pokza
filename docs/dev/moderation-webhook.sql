-- §4.10 — Webhook DB : à chaque INSERT dans public.reports, appelle l'edge function
-- `report-notify` (qui envoie l'e-mail à abuse@pokza.app via Resend).
--
-- Secrets lus depuis Supabase Vault (JAMAIS en clair dans ce fichier / ce repo public) :
--   - report_notify_url     = https://<REF>.supabase.co/functions/v1/report-notify
--   - report_webhook_secret = <un secret aléatoire ; identique au secret WEBHOOK_SECRET de la fonction>
--
-- ⚠️ À exécuter EN PREMIER (une fois par environnement), dans l'éditeur SQL — remplace les 2 valeurs :
--   select vault.create_secret('https://<REF>.supabase.co/functions/v1/report-notify', 'report_notify_url');
--   select vault.create_secret('<SECRET_ALEATOIRE>', 'report_webhook_secret');
-- (pour mettre à jour : vault.update_secret(id, new_secret) — voir vault.secrets)
--
-- Puis exécuter tout ce fichier. Ordre de test : DEV d'abord, PROD ensuite.

create extension if not exists pg_net;

-- Trigger : ne bloque JAMAIS l'insertion du signalement, même si le webhook n'est pas configuré.
create or replace function public.notify_report_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'report_notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'report_webhook_secret';

  if v_url is null or v_secret is null then
    return new;  -- webhook non configuré : on laisse passer l'insertion sans notifier
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('record', to_jsonb(new)),
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-webhook-secret', v_secret
               )
  );
  return new;
exception when others then
  -- Un échec réseau/notif ne doit jamais faire échouer le signalement.
  return new;
end;
$$;

drop trigger if exists trg_notify_report_created on public.reports;
create trigger trg_notify_report_created
  after insert on public.reports
  for each row execute function public.notify_report_created();
