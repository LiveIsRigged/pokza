-- Angle mort multi-comptes — RELEVÉ de l'état réel, avant d'écrire les tests
-- ==========================================================================
-- LECTURE SEULE. N'écrit rien, ne crée rien, ne supprime rien. Sans risque en DEV comme en PROD.
--
-- POURQUOI CE SCRIPT AVANT LES TESTS
-- ----------------------------------
-- Toute la couche sociale de Pokza n'a jamais tourné avec de vraies données multi-comptes : 17 des
-- 18 mains de prod ont le même auteur. C'est le dernier vrai risque avant la bêta.
--
-- Mais écrire la suite de tests contre un schéma SUPPOSÉ, c'est se garantir de déboguer les tests
-- au lieu de l'app. Le dump `prod-schema.sql` est périmé — la dernière fois qu'on s'y est fié,
-- deux constats sur trois étaient des faux positifs. La base est la seule source de vérité.
--
-- Ce relevé répond à ce dont j'ai besoin pour écrire des tests JUSTES :
--   1. quel environnement je regarde (DEV ou PROD), sans avoir à le deviner ;
--   2. quels comptes existent et lesquels sont déjà bloqués / sanctionnés — un test dont l'acteur
--      est déjà banni « passe » sans rien prouver ;
--   3. la matière disponible : mains par auteur et par visibilité, groupes, amitiés ;
--   4. les policies RLS réellement en place sur les 8 tables de la couche sociale ;
--   5. les triggers de notification réellement actifs, et lesquels sont SECURITY DEFINER.
--
-- Éditeur SQL DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- ⚠️ À lancer sur le DEV. Si tu le lances aussi sur la PROD, c'est sans danger (lecture seule),
-- mais c'est le DEV qui m'intéresse — c'est là que les tests tourneront.

with
-- ── 1. Où suis-je ? `push_subscriptions` et les buckets de stockage n'existent QU'EN PROD.
environnement as (
  select 'A. environnement' as section,
         'projet' as objet,
         case
           when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'push_subscriptions')
             then 'PROD (push_subscriptions présente)'
           else 'DEV (pas de push_subscriptions)'
         end as detail
  union all
  select 'A. environnement', 'trigger push sur notifications',
         case when exists (
           select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relname = 'notifications' and not t.tgisinternal
             and pg_get_triggerdef(t.oid) ilike '%push%'
         ) then '⚠️ OUI — une insertion dans notifications enverrait un push RÉEL'
         else 'non — les tests de notification sont sans risque ici' end
),
-- ── 2. Les comptes, et leur état. Un acteur déjà banni ou bloqué fausserait un test.
comptes as (
  select 'B. comptes' as section,
         coalesce(p.pseudo, '(sans pseudo)') as objet,
         'id ' || left(p.id::text, 8)
           || ' · mains ' || (select count(*) from public.posts po where po.author_id = p.id)
           || ' · amis ' || (select count(*) from public.friend_requests f
                             where f.status = 'accepted' and (f.sender_id = p.id or f.receiver_id = p.id))
           || ' · groupes ' || (select count(*) from public.group_members gm
                                where gm.user_id = p.id and gm.status = 'accepted')
           || case when exists (select 1 from public.user_sanctions s
                                where s.user_id = p.id and s.lifted_at is null
                                  and (s.expires_at is null or s.expires_at > now()))
                   then ' · ⚠️ SANCTIONNÉ' else '' end
           || case when exists (select 1 from public.blocks b where b.blocker_id = p.id or b.blocked_id = p.id)
                   then ' · ⚠️ dans un blocage' else '' end
         as detail
  from public.profiles p
),
-- ── 3. La matière : de quoi les tests disposent réellement.
matiere as (
  select 'C. matière' as section,
         'mains par visibilité' as objet,
         coalesce(string_agg(v.visibility || ' : ' || v.n, ' · ' order by v.visibility), 'aucune') as detail
  from (select visibility, count(*)::text as n from public.posts group by visibility) v
  union all
  select 'C. matière', 'mains par état de modération',
         coalesce((select string_agg(m.mod_status || ' : ' || m.n, ' · ' order by m.mod_status)
                   from (select mod_status, count(*)::text as n from public.posts group by mod_status) m), 'aucune')
  union all
  select 'C. matière', 'auteurs distincts de mains',
         (select count(distinct author_id)::text from public.posts)
  union all
  select 'C. matière', 'groupes / membres acceptés / invitations en attente',
         (select count(*)::text from public.groups) || ' / '
         || (select count(*)::text from public.group_members where status = 'accepted') || ' / '
         || (select count(*)::text from public.group_members where status = 'pending')
  union all
  select 'C. matière', 'commentaires / likes / votes / blocages',
         (select count(*)::text from public.comments) || ' / '
         || (select count(*)::text from public.likes) || ' / '
         || (select count(*)::text from public.votes) || ' / '
         || (select count(*)::text from public.blocks)
  union all
  select 'C. matière', 'notifications en base',
         (select count(*)::text from public.notifications)
),
-- ── 4. Les policies réellement en place. C'est contre elles que les tests doivent être écrits,
-- pas contre l'idée qu'on s'en fait.
policies as (
  select 'D. policies RLS' as section,
         tablename || ' · ' || cmd as objet,
         string_agg(policyname, ' | ' order by policyname) as detail
  from pg_policies
  where schemaname = 'public'
    and tablename in ('posts','comments','likes','comment_likes','votes',
                      'notifications','groups','group_members','friend_requests','blocks')
  group by tablename, cmd
),
-- ── 5. Les triggers de notification : lesquels existent, et sous quels droits ils tournent.
triggers as (
  select 'E. triggers' as section,
         c.relname || ' · ' || t.tgname as objet,
         case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end
           || ' → ' || p.proname || '()' as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and c.relname in ('posts','comments','likes','comment_likes','votes',
                      'friend_requests','group_members','notifications')
)
select * from environnement
union all select * from comptes
union all select * from matiere
union all select * from policies
union all select * from triggers
order by 1, 2;
