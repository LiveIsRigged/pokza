-- Traduction du contenu — la langue lue par le modèle à la publication (décision B du 15/09)
-- ==========================================================================================
-- À LANCER APRÈS docs/dev/traduction-contenu.sql. DEV d'abord, PROD ensuite. IDEMPOTENT.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- POURQUOI. Le bouton « Traduire » n'apparaît que sur un texte écrit dans une autre langue que celle
-- du lecteur. La langue du PROFIL de l'auteur (posée par le trigger du premier script) se trompe dès
-- qu'on écrit dans une autre langue que son interface — c'est le cas de Victor quand il teste l'app
-- en allemand : ses mains françaises seraient marquées « de » et ses amis allemands ne verraient
-- jamais le bouton. Ici, chaque main et chaque commentaire publiés sont envoyés à la fonction
-- `traduire`, qui fait lire la langue par le modèle (~1 neuron) et la réécrit.
--
-- La langue du profil reste le premier jet : c'est elle qu'on garde si la fonction est injoignable
-- ou si le quota gratuit du jour est épuisé.
--
-- ⚠️ AUCUN SECRET À RECOPIER. La première version réutilisait l'adresse et le secret des webhooks de
-- modération et de push — absents du DEV, le script s'est arrêté le 15/09. Désormais la base TIRE
-- elle-même un secret au hasard, propre à la traduction, et la fonction vient le lire par
-- `traduire_secret_webhook()`, que seule la service_role peut appeler. L'adresse de la fonction,
-- qui n'est pas un secret, se déduit d'un webhook existant ; à défaut le script dit la ligne à lancer.
--
-- ⚠️ CE QUE CE SCRIPT NE TOUCHE PAS. Les notifications « un ami a publié » et « nouvelle main dans
-- le groupe » ne se déclenchent que sur un passage privé → public : réécrire `language` n'en
-- déclenche aucune. Le verrou d'audience exempte les écritures qui ne viennent pas de l'app
-- (`current_user` ≠ authenticated), et « modifié » ne regarde que les 7 champs de contenu.
--
-- ATTENDU : un récapitulatif de 5 lignes, toutes à OK (la dernière peut dire SANS OBJET sur le DEV).
-- ==========================================================================================

create extension if not exists pg_net;

begin;

-- ── 1. Le marqueur : le modèle a-t-il lu ce texte ? ─────────────────────────────────────────────
-- Nul = seule la langue du profil est connue. C'est ce qui permet au rattrapage de ne traiter que
-- ce qui reste, et de reprendre là où il s'est arrêté.
alter table public.posts    add column if not exists language_detected_at timestamptz;
alter table public.comments add column if not exists language_detected_at timestamptz;

comment on column public.posts.language_detected_at is
  'Moment où le modèle a lu la langue du texte (fonction traduire, mode detecter). Nul = language '
  'vient encore du profil de l''auteur. Non écrivable par les membres (F-21).';
comment on column public.comments.language_detected_at is
  'Voir posts.language_detected_at.';

-- ── 2. L'adresse de la fonction, et le secret que la base tire elle-même ───────────────────────
do $$
declare
  v_url text;
begin
  if not exists (select 1 from vault.secrets where name = 'traduire_url') then
    select coalesce(
             (select replace(decrypted_secret, '/report-notify', '/traduire') from vault.decrypted_secrets where name = 'report_notify_url'),
             (select replace(decrypted_secret, '/send-push', '/traduire') from vault.decrypted_secrets where name = 'send_push_url'))
      into v_url;
    if v_url is null then
      raise exception 'Adresse de la fonction inconnue sur cette base. Lance d''abord cette ligne, avec la référence du projet (ahdikgckctvduuestzrh pour le DEV, blfoycuvvyxaxftzuidf pour la PROD), puis relance ce script : select vault.create_secret(''https://REFERENCE.supabase.co/functions/v1/traduire'', ''traduire_url'');';
    end if;
    perform vault.create_secret(v_url, 'traduire_url', 'URL de l''Edge Function traduire');
  end if;

  -- 244 bits d'aléa (deux UUID v4), sans dépendre d'une extension. Tiré UNE fois : relancer le script
  -- ne le change pas, sans quoi les appels en vol seraient refusés.
  if not exists (select 1 from vault.secrets where name = 'traduire_webhook_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
                                'traduire_webhook_secret',
                                'Secret partagé entre les triggers de détection et la fonction traduire');
  end if;
end $$;

-- La fonction `traduire` vérifie l'en-tête `x-webhook-secret` contre CETTE valeur. Réservée à la
-- service_role : un visiteur ou un membre qui l'appellerait obtiendrait un refus, pas le secret.
create or replace function public.traduire_secret_webhook()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'traduire_webhook_secret'
$$;

revoke all on function public.traduire_secret_webhook() from public, anon, authenticated;
grant execute on function public.traduire_secret_webhook() to service_role;

-- ── 3. À chaque publication ou retouche du texte, demander la langue ───────────────────────────
create or replace function public.demander_detection_langue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'traduire_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'traduire_webhook_secret';
  if v_url is null or v_secret is null then
    return new;  -- détection non configurée : la langue du profil reste, rien ne casse
  end if;

  perform net.http_post(
    url                  := v_url,
    body                 := jsonb_build_object(
                              'mode', 'detecter',
                              'type', case when tg_table_name = 'comments' then 'comment' else 'post' end,
                              'id',   new.id),
    headers              := jsonb_build_object('content-type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  -- JAMAIS faire échouer une publication pour une langue : pas de détection vaut mieux que pas de main.
  return new;
end $$;

-- `update of <colonnes>` : la fonction réécrit `language` et `language_detected_at`, qui ne sont
-- pas dans la liste — sa propre écriture ne relance donc pas de détection. Retoucher le titre, si.
drop trigger if exists posts_detecter_langue on public.posts;
create trigger posts_detecter_langue
  after insert or update of title, description, vote_question, vote_options on public.posts
  for each row execute function public.demander_detection_langue();

drop trigger if exists comments_detecter_langue on public.comments;
create trigger comments_detecter_langue
  after insert or update of body on public.comments
  for each row execute function public.demander_detection_langue();

-- ── 4. Le rattrapage des mains et commentaires déjà publiés ────────────────────────────────────
-- Un appel traite jusqu'à `p_limite` textes encore non lus, en quelques requêtes groupées. On le
-- relance tant que le comptage de fin de script n'est pas à zéro. Réservé à l'éditeur SQL.
create or replace function public.rattraper_langues(p_limite integer default 100)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'traduire_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'traduire_webhook_secret';
  if v_url is null or v_secret is null then
    raise exception 'Adresse ou secret absents du vault : relance docs/dev/traduction-detection.sql.';
  end if;
  return net.http_post(
    url                  := v_url,
    body                 := jsonb_build_object('mode', 'rattraper', 'limite', greatest(1, least(p_limite, 200))),
    headers              := jsonb_build_object('content-type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 150000
  );
end $$;

revoke all on function public.rattraper_langues(integer) from public, anon, authenticated;
revoke all on function public.demander_detection_langue() from public, anon, authenticated;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- RÉCAPITULATIF — 5 lignes à OK. La dernière dit « SANS OBJET » là où F-21 n'est pas posé.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
select 'colonnes language_detected_at (posts + comments)' as controle,
       case when count(*) = 2 then 'OK' else 'KO — ' || count(*) || '/2' end as verdict
  from information_schema.columns
 where table_schema = 'public' and column_name = 'language_detected_at' and table_name in ('posts', 'comments')
union all
select 'adresse et secret de la fonction dans le vault',
       case when count(*) = 2 then 'OK' else 'KO — ' || count(*) || '/2' end
  from vault.secrets where name in ('traduire_url', 'traduire_webhook_secret')
union all
select 'triggers de détection',
       case when count(*) = 2 then 'OK' else 'KO — ' || count(*) || '/2' end
  from pg_trigger where tgname in ('posts_detecter_langue', 'comments_detecter_langue')
union all
select 'secret et rattrapage réservés (ni visiteur ni membre)',
       case when not has_function_privilege('anon', 'public.traduire_secret_webhook()', 'execute')
             and not has_function_privilege('authenticated', 'public.traduire_secret_webhook()', 'execute')
             and has_function_privilege('service_role', 'public.traduire_secret_webhook()', 'execute')
             and not has_function_privilege('anon', 'public.rattraper_langues(integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.rattraper_langues(integer)', 'execute')
            then 'OK' else 'KO' end
union all
select 'F-21 : les membres ne peuvent pas écrire language_detected_at',
       case
         when exists (select 1 from information_schema.table_privileges
                       where table_schema = 'public' and table_name in ('posts', 'comments')
                         and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE'))
           then 'SANS OBJET — F-21 n''est pas posé sur cette base'
         when count(*) = 0 then 'OK — 0 droit'
         else 'KO — ' || count(*) || ' droit(s)'
       end
  from information_schema.column_privileges
 where table_schema = 'public' and table_name in ('posts', 'comments') and grantee = 'authenticated'
   and privilege_type in ('INSERT', 'UPDATE') and column_name = 'language_detected_at';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- APRÈS DÉPLOIEMENT DE LA FONCTION — à lancer à part, autant de fois que nécessaire :
--
--   select public.rattraper_langues();
--
-- puis, quelques secondes plus tard, ce qui reste à lire (0 partout = terminé) :
--
--   select 'posts' as quoi, count(*) filter (where language_detected_at is null) as restants, count(*) as total from public.posts
--   union all
--   select 'comments', count(*) filter (where language_detected_at is null), count(*) from public.comments;
-- ══════════════════════════════════════════════════════════════════════════════════════════════
