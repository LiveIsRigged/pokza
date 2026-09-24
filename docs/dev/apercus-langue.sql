-- ============================================================================
-- L'APERÇU D'UN LIEN PARLE LA LANGUE DE CELUI QUI L'ENVOIE
-- (chantier social, lot 6 · question de Victor du 24/09/2026 : « aucun moyen d'y remédier ? »)
--
-- À JOUER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent, tout en transaction.
--
-- L'ORDRE N'EST PAS IMPOSÉ ICI, et c'est assez rare pour le dire : le Worker lit ces colonnes dans
-- le CORPS d'une réponse `rpc`, pas dans une liste `select=`. Une colonne absente lui arrive donc en
-- `undefined` — et `undefined` retombe sur le français, comme une langue nulle ou inconnue. Jouer ce
-- script après le déploiement ne casse rien : ça laisse seulement les aperçus en français d'ici là.
-- (Le chemin `/post/:id`, lui, nomme bien `language` dans un `select=` — mais cette colonne existe
--  déjà et est déjà lisible sans compte. Vérifié sur la PROD avant d'écrire ce fichier.)
--
-- ────────────────────────────────────────────────────────────────────────────
-- LE PROBLÈME
--
-- Les balises Open Graph posées hier sont en français, toujours. Un robot d'aperçu n'a ni compte ni
-- langue fiable : on ne peut donc PAS connaître la langue de celui qui reçoit le lien.
--
-- Mais on connaît celle de celui qui l'ENVOIE, et elle est déjà en base :
--   · `profiles.language`, réécrite à chaque ouverture de l'app (`syncLangueDuProfil`) — c'est déjà
--     elle qui décide de la langue des notifications push ;
--   · `posts.language`, détectée à la publication par le modèle de traduction. Elle est DÉJÀ
--     lisible sans compte (`posts` est la seule table que `anon` garde) : le chemin `/post/:id`
--     n'a donc besoin de rien de ce script.
--
-- Restent les trois chemins qui passent par une fonction. Chacune gagne UNE colonne.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QUE ÇA NE DÉVOILE PAS
--
-- Un code de langue sur deux lettres n'est pas une donnée personnelle qu'on découvre ici : il est
-- déjà déductible de la main qu'on montre, et il ne nomme personne. En particulier, ce script
-- n'ajoute AUCUN nom d'auteur à un aperçu de main — c'était le raisonnement d'hier, il tient :
-- `posts` étant lisible sans compte, un nom dans l'`og:` se récolterait en deux requêtes.
--
-- ⚠️ POURQUOI `drop` PUIS `create` ET NON `create or replace` : Postgres refuse de changer le type
-- de retour d'une fonction existante (« cannot change return type of existing function »). Chaque
-- `drop` emporte ses droits — d'où le `grant` qui suit CHAQUE création, sans exception.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. L'APERÇU D'UN PROFIL — `host_language`
--    Corps identique à `invitation-profil.sql`, à la colonne près.
-- ────────────────────────────────────────────────────────────────────────────

drop function if exists public.profile_invite_preview(uuid);

create function public.profile_invite_preview(p_user uuid)
returns table (
  host_id       uuid,
  host_name     text,
  host_avatar   text,
  hand_count    integer,
  post_id       uuid,
  host_language text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id,
         p.display_name,
         p.avatar_url,
         (select count(*)::integer from public.posts po
           where po.author_id = p.id
             and po.visibility = 'public'
             and po.mod_status = 'visible'),
         (select po.id from public.posts po
           where po.author_id = p.id
             and po.visibility = 'public'
             and po.mod_status = 'visible'
           order by po.created_at desc
           limit 1),
         p.language
    from public.profiles p
   where p.id = p_user
     and not private.is_banned(p.id);
$$;

grant execute on function public.profile_invite_preview(uuid) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. L'APERÇU D'UN GROUPE — `host_language`
--    Corps identique à `invitations-groupe.sql`, à la colonne près. La langue est celle de l'HÔTE,
--    c'est-à-dire de celui qui a envoyé le lien — pas du fondateur. C'est déjà le principe de la
--    page d'accueil : elle dit « Paul t'invite », parce que c'est Paul que Kevin connaît.
-- ────────────────────────────────────────────────────────────────────────────

drop function if exists public.group_link_preview(text);

create function public.group_link_preview(p_token text)
returns table (
  group_id      uuid,
  group_name    text,
  member_count  integer,
  host_id       uuid,
  host_name     text,
  host_avatar   text,
  post_id       uuid,
  host_language text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select g.id,
         g.name,
         (select count(*)::integer from public.group_members m
           where m.group_id = g.id and m.status = 'accepted'),
         l.created_by,
         p.display_name,
         p.avatar_url,
         (select po.id from public.posts po
           where po.author_id = l.created_by
             and po.visibility = 'public'
             and po.mod_status = 'visible'
           order by po.created_at desc
           limit 1),
         p.language
    from public.group_invite_links l
    join public.groups g   on g.id = l.group_id
    join public.profiles p on p.id = l.created_by
   where l.token = p_token
     and l.expires_at > now()
     and not private.is_banned(l.created_by)
     and exists (select 1 from public.group_members m
                  where m.group_id = l.group_id
                    and m.user_id = l.created_by
                    and m.status = 'accepted');
$$;

grant execute on function public.group_link_preview(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LA MAIN OUVERTE PAR UN JETON — `language`, ET `tournament_name`
--
--    ⚠️ `tournament_name` n'est PAS lié à la langue : c'est un défaut trouvé en passant, et réparé
--    ici parce que c'est la même opération. `fetchSharedPost` lit `row.tournament_name` depuis
--    toujours, mais la fonction ne l'a jamais rendu : le nom du tournoi était donc absent de toute
--    main ouverte par `/s/:token`, alors que la même main ouverte par `/post/:id` l'affichait
--    (`fetchPublicPost` le sélectionne). Deux pages, deux contenus, pour une seule main.
-- ────────────────────────────────────────────────────────────────────────────

drop function if exists public.post_by_share_token(text);

create function public.post_by_share_token(p_token text)
returns table (
  id uuid, title text, description text, location text, tournament_name text,
  buy_in text, level text, created_at timestamptz, hand jsonb, language text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, p.title, p.description, p.location, p.tournament_name,
         p.buy_in, p.level, p.created_at, p.hand, p.language
  from public.post_shares s
  join public.posts p on p.id = s.post_id
  where s.token = p_token
    and p.mod_status = 'visible'
    and not private.is_banned(p.author_id);
$$;

revoke all on function public.post_by_share_token(text) from public;
grant execute on function public.post_by_share_token(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- CONTRÔLES — tout doit être OK
-- ────────────────────────────────────────────────────────────────────────────

select * from (values
  (1, 'les 3 fonctions sont posees, en security definer',
      (select case when count(*) = 3 then 'OK'
                   else 'KO — ' || count(*) || ' sur 3 : ' || coalesce(string_agg(proname, ', '), 'aucune') end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and p.proname in ('profile_invite_preview', 'group_link_preview', 'post_by_share_token'))),
  (2, 'les 3 sont appelables SANS compte (le drop emporte les droits)',
      (select case when count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) = 3
                   then 'OK'
                   else 'KO — il manque un grant apres le drop' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('profile_invite_preview', 'group_link_preview', 'post_by_share_token'))),
  (3, 'chacune rend bien sa colonne de langue',
      (select case when count(*) = 3 then 'OK'
                   else 'KO — ' || count(*) || ' sur 3' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and ((p.proname in ('profile_invite_preview', 'group_link_preview')
                and 'host_language' = any(p.proargnames))
            or (p.proname = 'post_by_share_token' and 'language' = any(p.proargnames))))),
  (4, 'post_by_share_token rend enfin tournament_name',
      (select case when 'tournament_name' = any(p.proargnames) then 'OK'
                   else 'KO — le nom du tournoi manquera encore sur /s/:token' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'post_by_share_token')),
  (5, 'un identifiant inconnu ne rend toujours rien',
      (select case when count(*) = 0 then 'OK' else 'KO' end
         from public.profile_invite_preview('00000000-0000-0000-0000-000000000000'::uuid))),
  (6, 'sur de vrais comptes, la langue sort (ou est nulle, ce qui est permis)',
      (select case when count(*) = 0 then 'OK — aucun compte non banni ici'
                   else 'OK — ' || count(*) || ' profil(s), dont '
                        || count(*) filter (where a.host_language is not null) || ' avec une langue' end
         from (select (public.profile_invite_preview(p.id)).* from public.profiles p limit 5) a)),
  (7, 'anon ne peut TOUJOURS PAS lire la table profiles (F-08 reste ferme)',
      (select case when count(*) = 0 then 'OK'
                   else 'KO — ' || count(*) || ' colonne(s) lisibles par anon' end
         from information_schema.column_privileges
        where grantee = 'anon' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT')),
  (8, 'le filtre des comptes bannis est toujours dans les 3 corps',
      (select case when count(*) = 3 then 'OK'
                   else 'KO — ' || count(*) || ' sur 3 filtrent les bannis' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc like '%is_banned%'
          and p.proname in ('profile_invite_preview', 'group_link_preview', 'post_by_share_token')))
) as t(n, controle, resultat);

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- APRÈS COUP : `notify pgrst, 'reload schema';` n'est PAS nécessaire ici (PostgREST relit le
-- catalogue des fonctions à la volée), mais si un appel répond PGRST202 « function not found »
-- dans la minute qui suit, c'est le cache — le jouer règle la question.
-- ════════════════════════════════════════════════════════════════════════════
