-- ============================================================================
-- CE QU'UN VISITEUR SANS COMPTE PEUT LIRE : UNE LISTE BLANCHE, ET RIEN D'AUTRE
-- (décision de Victor du 23/09/2026 : « Ok, pas lisible par l'API ».)
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Idempotent, tout en transaction. À jouer sur le DEV d'abord, puis sur la PROD.
-- ⚠️ Aucun changement côté app : on ne retire QUE des droits au rôle `anon`, et rien de ce que
-- l'app fait sans compte n'en dépend (démontré plus bas, et revérifié par les contrôles).
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QU'ON A MESURÉ LE 23/09/2026, DEPUIS L'EXTÉRIEUR
--
-- La clé publique de l'app n'est pas un secret : elle est DANS l'app, donc lisible par qui ouvre
-- Pokza dans un navigateur. N'importe qui peut donc interroger l'API sans compte. Ce qu'il reçoit
-- dépend des règles (RLS) de chaque table. Relevé sur la PROD :
--
--   posts            6 lignes, TOUTES publiques      ← voulu (décision produit du 16/08)
--   comments         4 lignes, texte + auteur        ← non voulu
--   likes            2 lignes  ┐ couples main/identifiant, sans aucun nom depuis que
--   votes            5 lignes  ┘ `profiles` est fermée — mais non voulu quand même
--   friend_requests, groups, group_members, notifications, comment_likes, post_views,
--   feed_tuning      200 mais VIDE                   ← la RLS tient, le droit ne sert à rien
--
-- Un commentaire s'écrit entre membres et aucun écran ne le montre à un visiteur déconnecté :
-- la page d'une main publique n'affiche que la main. La base disait le contraire de l'app.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE LISTE BLANCHE PLUTÔT QUE TROIS TABLES NOMMÉES
--
-- Les tables qui répondent « vide » ne sont protégées que par leurs RÈGLES. Le droit de lecture,
-- lui, est accordé. Le jour où une règle est assouplie par erreur — ça arrive, F-08 s'est rouvert
-- deux fois en un mois — le droit sera encore là pour laisser passer. On enlève donc la deuxième
-- serrure partout où elle ne sert à rien.
--
-- CE QUE `anon` GARDE : `posts`, et elle seule. Les quatre chemins qu'un visiteur sans compte peut
-- emprunter ont été relus un par un :
--   · /post/:id    → `fetchPublicPost` lit la table `posts`            → A BESOIN de posts
--   · /s/:token    → `post_by_share_token`      (security definer)     → n'a besoin de rien
--   · /g/:token    → `group_link_preview`       (security definer)     → + posts pour la main
--   · /invite/:id  → `profile_invite_preview`   (security definer)     → + posts pour la main
-- Une fonction `security definer` s'exécute avec les droits de son propriétaire : lui retirer des
-- droits à `anon` ne la gêne pas. Le contrôle 2 revérifie que les trois le sont bien.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- LE RETRAIT
--    Deux boucles et non une : un droit de TABLE et un droit par COLONNE sont deux choses
--    distinctes, et retirer le premier ne touche pas au second. C'est ce qui avait déjà piégé le
--    lot 5, puis F-08. On fait les deux, dans cet ordre.
--    Un `revoke` sur une colonne qui n'avait pas de droit propre est sans effet (simple avis).
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
  n_tables integer := 0;
  n_colonnes integer := 0;
begin
  for r in
    select table_name
      from information_schema.table_privileges
     where grantee = 'anon' and table_schema = 'public'
       and privilege_type = 'SELECT' and table_name <> 'posts'
     group by table_name
  loop
    execute format('revoke select on public.%I from anon', r.table_name);
    n_tables := n_tables + 1;
  end loop;

  for r in
    select table_name, column_name
      from information_schema.column_privileges
     where grantee = 'anon' and table_schema = 'public'
       and privilege_type = 'SELECT' and table_name <> 'posts'
  loop
    begin
      execute format('revoke select (%I) on public.%I from anon', r.column_name, r.table_name);
      n_colonnes := n_colonnes + 1;
    exception when others then
      -- Une vue ou une table dont la colonne n'a pas de droit propre : rien à faire.
      null;
    end;
  end loop;

  raise notice 'retire a anon : % table(s), % colonne(s)', n_tables, n_colonnes;
end $$;

-- Les objets créés plus tard ne seront pas lisibles par défaut. Posé déjà par
-- `f08-profils-anon.sql` ; répété ici parce que ce script peut être joué seul.
alter default privileges in schema public revoke select on tables from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- CONTRÔLES — tout doit être OK
-- ────────────────────────────────────────────────────────────────────────────

select * from (values
  (1, 'anon ne lit plus QUE posts',
      (select case when coalesce(string_agg(distinct table_name, ', ' order by table_name), '') = 'posts'
                   then 'OK — posts, et rien d''autre'
                   else 'KO — ' || coalesce(string_agg(distinct table_name, ', ' order by table_name), 'rien du tout') end
         from (
           select table_name from information_schema.table_privileges
            where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT'
           union
           select table_name from information_schema.column_privileges
            where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT'
         ) x)),
  (2, 'les 3 portes sans compte sont en security definer',
      (select case when count(*) = 3 then 'OK — elles ignorent les droits de anon'
                   else 'KO — ' || count(*) || ' sur 3 : ' ||
                        coalesce(string_agg(proname, ', '), 'aucune') end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and p.proname in ('group_link_preview', 'profile_invite_preview', 'post_by_share_token'))),
  (3, 'une main PUBLIQUE reste lisible sans compte',
      (select case when has_table_privilege('anon', 'public.posts', 'select')
                    or has_any_column_privilege('anon', 'public.posts', 'select')
                   then 'OK' else 'KO — la page d''une main publique va casser' end)),
  (4, 'un membre connecte, lui, n''a rien perdu',
      (select case when count(*) >= 10 then 'OK — ' || count(*) || ' tables lisibles'
                   else 'KO — ' || count(*) || ' seulement, verifier' end
         from (select distinct table_name from information_schema.table_privileges
                where grantee = 'authenticated' and table_schema = 'public'
                  and privilege_type = 'SELECT') y)),
  (5, 'profiles reste fermee a anon (F-08)',
      (select case when count(*) = 0 then 'OK' else 'KO — ' || count(*) || ' colonne(s)' end
         from information_schema.column_privileges
        where grantee = 'anon' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT'))
) as t(n, controle, resultat);

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- APRÈS COUP, DEPUIS L'EXTÉRIEUR — la seule vérification qui prouve quelque chose.
-- Je la lance moi-même après ton retour : `comments`, `likes` et `votes` doivent répondre 401,
-- et `posts` doit continuer de rendre les mains publiques.
-- ════════════════════════════════════════════════════════════════════════════
