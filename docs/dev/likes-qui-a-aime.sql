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
    not public.is_blocked_pair(auth.uid(), user_id)
    and not public.is_banned(user_id)
  );

drop policy if exists "comment_likes moderation and blocks" on public.comment_likes;
create policy "comment_likes moderation and blocks" on public.comment_likes as restrictive for select
  using (
    not public.is_blocked_pair(auth.uid(), user_id)
    and not public.is_banned(user_id)
  );

-- ----------------------------------------------------------------------------
-- Contrôles
-- ----------------------------------------------------------------------------

-- 1. Les deux policies existent, en RESTRICTIVE, sur le seul SELECT.
select c.relname                       as table_name,
       p.polname                       as policy,
       case p.polpermissive when false then 'RESTRICTIVE' else 'PERMISSIVE (⚠️)' end as type,
       p.polcmd                        as commande,
       pg_get_expr(p.polqual, p.polrelid) as using_expr
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
