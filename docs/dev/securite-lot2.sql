-- LOT 2 — F-07 + F-11 + F-10
-- ==========================
-- Les trois constats portent sur les mêmes tables : `likes`, `comment_likes`, `votes`.
--
--   F-07 : leurs policies de LECTURE sont `USING (true)` — tout le monde lit tout.
--   F-11 : leurs policies d'ÉCRITURE ne vérifient que l'identité de l'auteur, jamais qu'il a
--          le droit de voir ce qu'il like ou ce sur quoi il vote.
--   F-10 : la policy d'insertion de `votes` ne vérifie pas que l'option votée fait partie des
--          options proposées par la main.
--
-- CONTEXTE : ces policies ont été écrites AVANT l'arrivée des groupes privés. Elles étaient
-- correctes à l'époque où toutes les mains étaient publiques. Elles ne le sont plus.
--
-- ⚠️ FENÊTRE DE TIR : corriger après coup ne dé-expose pas ce qui a déjà fuité. Ce lot doit
-- passer en production AVANT que les bêta-testeurs ne créent les premiers groupes privés.
--
-- ⚠️ ORDRE : DEV d'abord (+ securite-lot2-test.sql), PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Script IDEMPOTENT. Ne touche à AUCUNE donnée. Retour arrière en fin de fichier.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Deux fonctions d'aide — À DROITS DE L'APPELANT (surtout PAS security definer)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Elles se contentent de demander « est-ce que je vois cette main / ce commentaire ? ». La
-- réponse vient de la RLS de `posts` et `comments`, qui s'applique normalement puisque ces
-- fonctions s'exécutent avec les droits de celui qui interroge.
--
-- ⚠️ NE JAMAIS les passer en SECURITY DEFINER : elles s'exécuteraient alors en tant que
-- propriétaire, la RLS serait contournée, et elles répondraient « oui » pour tout — ce qui
-- rouvrirait en grand exactement la fuite qu'on est en train de fermer.
--
-- Avantage sur une condition recopiée à la main dans chaque policy : la règle de visibilité
-- n'existe qu'à UN endroit (les policies de `posts`). Si elle change un jour, les likes et les
-- votes suivent tout seuls, y compris les règles de modération et de blocage.

create or replace function private.post_visible(p_post uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select exists (select 1 from public.posts where id = p_post);
$$;

create or replace function private.comment_visible(p_comment uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, private
as $$
  select exists (select 1 from public.comments where id = p_comment);
$$;

grant execute on function private.post_visible(uuid)    to anon, authenticated;
grant execute on function private.comment_visible(uuid) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-07 — LECTURE : un like ne doit être visible que si la main l'est
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : `USING (true)` laisse n'importe qui, même sans compte, lire l'intégralité des
-- tables `likes`, `comment_likes` et `votes`. Chaque ligne contient un `user_id` et un
-- `post_id`. Conséquences concrètes :
--   • on récupère les identifiants de mains qu'on n'a pas le droit de voir (groupes privés),
--     ce qui donne une liste de cibles pour tester d'autres failles ;
--   • on reconstitue qui suit qui, qui interagit avec qui — le graphe social complet ;
--   • on lit l'opinion d'un joueur sur une main de groupe privé auquel on n'appartient pas.
--
-- Les anciennes policies sont supprimées plutôt que complétées : leur nom affirmait quelque
-- chose de faux, autant ne pas le laisser traîner dans le schéma.

drop policy if exists "Les likes sont visibles par tous" on public.likes;
create policy "Les likes sont visibles si la main l est" on public.likes
  for select to public
  using (private.post_visible(post_id));

drop policy if exists "Les votes sont visibles par tous" on public.votes;
create policy "Les votes sont visibles si la main l est" on public.votes
  for select to public
  using (private.post_visible(post_id));

drop policy if exists "Les likes de commentaires sont visibles par tous" on public.comment_likes;
create policy "Les likes de commentaires sont visibles si le commentaire l est" on public.comment_likes
  for select to public
  using (private.comment_visible(comment_id));

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-11 — ÉCRITURE : on ne like que ce qu'on a le droit de voir
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : les policies d'insertion vérifient `auth.uid() = user_id` — donc « je like en mon
-- nom » — mais jamais que j'ai accès à la cible. Avec l'UUID d'une main de groupe privé, un
-- non-membre peut donc la liker. Deux effets : le compteur `like_count` de la main augmente
-- (les membres du groupe voient un like venu de nulle part), et la réussite ou l'échec de
-- l'insertion confirme l'existence de la main — un test d'existence exploitable en masse.
--
-- Policies RESTRICTIVES : elles s'ajoutent en ET aux policies existantes. Elles ne peuvent
-- donc que restreindre, jamais autoriser quelque chose par mégarde.

drop policy if exists "likes visibilite a l ecriture" on public.likes;
create policy "likes visibilite a l ecriture" on public.likes
  as restrictive for insert to public
  with check (private.post_visible(post_id));

drop policy if exists "comment_likes visibilite a l ecriture" on public.comment_likes;
create policy "comment_likes visibilite a l ecriture" on public.comment_likes
  as restrictive for insert to public
  with check (private.comment_visible(comment_id));

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-10 + F-11 — VOTES : main visible, sondage existant, et option réellement proposée
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME (F-10) : `votes.option` est un texte libre. Rien ne le rattache aux options du
-- sondage. On peut donc voter « aaaaaa », ou injecter autant d'options inventées qu'on veut :
-- la vue `posts_feed` agrège les votes par `option` avec `jsonb_object_agg`, si bien que ces
-- valeurs remontent telles quelles dans les résultats affichés à tous. C'est un défacement du
-- sondage d'autrui, et un vecteur d'injection de contenu dans l'interface.
--
-- Le double vote, lui, est déjà bloqué par la clé primaire (post_id, user_id) — rien à faire.

drop policy if exists "votes cible valide" on public.votes;
create policy "votes cible valide" on public.votes
  as restrictive for insert to public
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = votes.post_id
        and p.vote_options is not null
        and jsonb_exists(p.vote_options, votes.option)
    )
  );
-- Note : ce `exists` porte sur `public.posts`, dont la RLS s'applique. Il vérifie donc en même
-- temps que la main est visible (F-11) et que l'option est légitime (F-10).

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (lecture seule) — 4 lignes « OK » attendues
-- ═══════════════════════════════════════════════════════════════════════════════════════
select 'F-07 plus aucune lecture en USING(true)' as controle,
       case when count(*) = 0 then 'OK'
            else 'ECHEC : ' || string_agg(tablename || '.' || policyname, ', ') end as resultat
from pg_policies
where schemaname = 'public'
  and tablename in ('likes', 'votes', 'comment_likes')
  and cmd = 'SELECT' and qual = 'true'
union all
select 'F-07 les 3 lectures sont filtrees',
       case when count(*) = 3 then 'OK' else 'ECHEC : ' || count(*)::text || '/3' end
from pg_policies
where schemaname = 'public'
  and tablename in ('likes', 'votes', 'comment_likes')
  and cmd = 'SELECT' and qual like '%visible%'
union all
select 'F-11 + F-10 policies restrictives en ecriture',
       case when count(*) = 3 then 'OK' else 'ECHEC : ' || count(*)::text || '/3' end
from pg_policies
where schemaname = 'public'
  and policyname in ('likes visibilite a l ecriture',
                     'comment_likes visibilite a l ecriture',
                     'votes cible valide')
union all
select 'Les fonctions d aide ne sont PAS security definer',
       case when bool_and(not p.prosecdef) then 'OK' else '*** ECHEC : RLS contournee ***' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('post_visible', 'comment_visible');


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à n'exécuter que si l'application casse)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   drop policy if exists "Les likes sont visibles si la main l est" on public.likes;
--   drop policy if exists "Les votes sont visibles si la main l est" on public.votes;
--   drop policy if exists "Les likes de commentaires sont visibles si le commentaire l est" on public.comment_likes;
--   drop policy if exists "likes visibilite a l ecriture" on public.likes;
--   drop policy if exists "comment_likes visibilite a l ecriture" on public.comment_likes;
--   drop policy if exists "votes cible valide" on public.votes;
--   create policy "Les likes sont visibles par tous" on public.likes for select using (true);
--   create policy "Les votes sont visibles par tous" on public.votes for select using (true);
--   create policy "Les likes de commentaires sont visibles par tous" on public.comment_likes for select using (true);
-- commit;
