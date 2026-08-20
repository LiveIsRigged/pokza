-- ============================================================================
-- « Qui a aimé » : le chiffre à côté du cœur ouvre la liste des personnes qui
-- ont aimé une main ou un commentaire.
--
-- L'app lit cette liste directement dans `likes` / `comment_likes` : la RLS y
-- impose déjà que la main (ou le commentaire) soit visible, via
-- `private.post_visible` / `private.comment_visible` posés au lot 2. Rien à
-- ajouter de ce côté.
--
-- CE QUI MANQUE, et que ce script pose : ne pas lister un compte bloqué (dans
-- les deux sens) ni un compte banni. `posts` et `comments` ont déjà exactement
-- ces deux règles (policies « posts moderation and blocks » /
-- « comments moderation and blocks », cf. moderation.sql) ; sans elles ici, un
-- compte que l'app masque partout ailleurs réapparaîtrait dans la liste des
-- likes — avec son pseudo et sa photo.
--
-- Policies RESTRICTIVES : elles s'ajoutent en ET aux policies de lecture
-- existantes, elles ne peuvent donc que restreindre.
--
-- ⚠️ `private.` ET NON `public.` — la première version de ce script a cassé le
-- feed en PROD (« permission denied for function is_banned »). Les quatre
-- fonctions ont été déplacées vers `private` au lot 1, et le correctif F-06 a
-- recréé dans `public` des relais dont l'exécution est RÉVOQUÉE pour
-- `authenticated`. Les policies de `posts`/`comments`, écrites avant le
-- déplacement, marchent toujours parce qu'une policy retient l'OID de la
-- fonction, qui a suivi le changement de schéma : leur code source dit encore
-- `public.is_banned(...)` alors qu'elles appellent la fonction privée. Recopier
-- ce code source dans une policy NEUVE l'accroche au relais interdit.
-- Seul `private.*` est exécutable par `authenticated` (cf. securite-lot1.sql :
-- `grant usage on schema private` + `grant execute on function private.…`).
--
-- CONSÉQUENCE ATTENDUE, à ne pas prendre pour un bug : `posts.like_count` est
-- tenu par un trigger, qui ne connaît pas les blocages de celui qui regarde. Un
-- compteur à 5 peut donc n'ouvrir que 4 lignes. C'est le comportement des
-- autres réseaux, et l'inverse (recalculer le compteur par spectateur) coûterait
-- une requête par main affichée.
--
-- À lancer sur DEV d'abord (test), puis sur PROD.
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
-- Re-jouable (drop/create des policies).
-- ============================================================================

drop policy if exists "likes moderation and blocks" on public.likes;
create policy "likes moderation and blocks" on public.likes as restrictive for select
  using (
    not private.is_blocked_pair(auth.uid(), user_id)
    and not private.is_banned(user_id)
  );

drop policy if exists "comment_likes moderation and blocks" on public.comment_likes;
create policy "comment_likes moderation and blocks" on public.comment_likes as restrictive for select
  using (
    not private.is_blocked_pair(auth.uid(), user_id)
    and not private.is_banned(user_id)
  );

-- ----------------------------------------------------------------------------
-- Contrôles
-- ----------------------------------------------------------------------------

-- 1. Les deux policies existent, en RESTRICTIVE, sur le seul SELECT.
select c.relname                       as table_name,
       p.polname                       as policy,
       case p.polpermissive when false then 'RESTRICTIVE' else 'PERMISSIVE (⚠️)' end as type,
       p.polcmd                        as commande,
       pg_get_expr(p.polqual, p.polrelid) as using_expr,
       -- Le schéma réellement appelé, que `pg_get_expr` masque (il affiche le nom nu si le
       -- schéma est dans le search_path) : c'est LUI qui doit dire `private`.
       (select string_agg(distinct n.nspname || '.' || f.proname, ', ')
          from pg_depend d
          join pg_proc f on f.oid = d.refobjid
          join pg_namespace n on n.oid = f.pronamespace
         where d.objid = p.oid and d.refclassid = 'pg_proc'::regclass) as fonctions_appelees
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname in ('likes', 'comment_likes')
  and p.polname like '%moderation and blocks%'
order by c.relname;

-- 2. Un compte non bloqué et non banni reste bien lisible : le nombre de lignes
--    de `likes` visibles par le propriétaire de la session doit rester égal au
--    nombre de likes de ses propres mains (aucun blocage sur soi-même).
--    À exécuter connecté (l'éditeur SQL, lui, est superutilisateur : il voit
--    tout et ne prouve rien — le vrai test se fait depuis l'app, en bloquant un
--    compte de test puis en rouvrant « Qui a aimé »).
