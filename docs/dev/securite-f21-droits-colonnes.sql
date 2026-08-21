-- F-21 — droits d'écriture par colonne sur `posts` et `comments`
-- ==============================================================
-- À LANCER SUR LE DEV (ahdikgckctvduuestzrh). Déjà appliqué en PROD le 16/08/2026, mais ce script
-- est IDEMPOTENT : le relancer en prod ne fait rien de plus, il remet simplement le même état.
--
-- POURQUOI
-- --------
-- Supabase pose `grant all on <table> to authenticated` par défaut. Sur `posts` et `comments`, ça
-- signifiait que n'importe quel membre connecté pouvait écrire N'IMPORTE QUELLE colonne de SA
-- propre ligne — la RLS ne regarde que les LIGNES, jamais les colonnes.
--
-- Mesuré en production le 16/08, sur de vraies écritures depuis la console d'un compte membre :
--   • `mod_status = 'visible'` accepté  → l'auteur ANNULE le retrait décidé par la modération,
--     et `removed_at` / `mod_reason` repassent à null. Le journal d'audit s'efface avec.
--   • `like_count = 9999` accepté.
--   • `created_at = '3000-01-01'` accepté → `fetchFeed` trie sur `created_at desc`, donc
--     épinglage permanent en tête de feed.
--   • `hand` réécrite après publication, alors que `updatePost()` s'interdit d'y toucher.
-- Contrôle qui valide la démonstration : `author_id` vers un AUTRE compte → refusé (42501).
-- La RLS fait son travail ; le trou est exactement là où elle ne peut rien.
--
-- C'est F-04 sur une autre table : le lot 1 avait posé ce geste sur `profiles`, il n'a jamais été
-- porté sur `posts` ni `comments`.
--
-- ⚠️ PIÈGE PRINCIPAL — UNE COLONNE OUBLIÉE CASSE SILENCIEUSEMENT UNE ÉCRITURE DE L'APP.
-- Les listes ci-dessous sont relevées dans `data/posts.ts` et `data/comments.ts`. Si l'app se met
-- un jour à écrire une colonne de plus, l'ajouter ICI en même temps. Le contrôle final de ce
-- script, et `f21-verif-droits-colonnes.sql`, existent pour attraper exactement cet oubli.
--
-- ⚠️ GARDE-FOU — les 3 triggers de compteurs sont SECURITY DEFINER, donc ils écrivent
-- `like_count` / `comment_count` sous leur PROPRIÉTAIRE. C'est ce qui permet de retirer ce droit
-- aux membres sans casser le bouton « j'aime ». Si ce n'était plus vrai, le script s'arrête.
--
-- Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

begin;

-- ── Garde-fou : sans ces 3 triggers en SECURITY DEFINER, révoquer l'écriture des compteurs
-- casserait les likes et les commentaires. Mieux vaut ne rien faire que casser ça.
do $$
declare
  n int;
begin
  select count(*) into n
  from pg_proc
  where proname in ('handle_like_change', 'handle_comment_change', 'handle_comment_like_change')
    and pronamespace = 'public'::regnamespace
    and prosecdef;
  if n <> 3 then
    raise exception
      'ARRET : % trigger(s) de compteur en SECURITY DEFINER au lieu de 3. Retirer le droit d''ecrire like_count/comment_count casserait les likes.', n;
  end if;
end $$;

-- ── On repart de zéro sur les deux opérations concernées. SELECT et DELETE ne sont PAS touchés :
-- la lecture est gouvernée par la RLS, et `deletePost` a besoin du DELETE au niveau table.
revoke insert, update on public.posts    from authenticated, anon;
revoke insert, update on public.comments from authenticated, anon;

-- ── `posts` — createPost() écrit ces 11 colonnes.
grant insert (
  author_id, location, buy_in, level, title, description,
  hand, vote_question, vote_options, visibility, group_id
) on public.posts to authenticated;

-- ── `posts` — updatePost() en écrit 9. Ni `hand` ni `author_id` : une main publiée ne se
-- réécrit pas, c'est déjà la règle que s'impose l'app, on la rend opposable.
grant update (
  title, description, location, buy_in, level,
  vote_question, vote_options, visibility, group_id
) on public.posts to authenticated;

-- ── `comments` — createComment() écrit ces 7 colonnes.
grant insert (
  post_id, author_id, body, parent_comment_id, gif_url, image_width, image_height
) on public.comments to authenticated;

-- ── `comments` — second temps de createComment() : la photo, une fois l'id de la ligne connu.
-- `image_path` est ici et PAS à l'insert : c'est ce qui rend la photo de commentaire possible.
grant update (image_path, image_width, image_height) on public.comments to authenticated;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — trois questions, trois verdicts. Un rapport vide ne prouverait rien : ici chaque
-- ligne affiche ce qu'elle a compté, donc on voit aussi bien le succès que l'échec.
-- Attendu : OK / OK / OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

with legitime(tbl, col, op) as (
  values
    ('posts','author_id','INSERT'),('posts','location','INSERT'),('posts','buy_in','INSERT'),
    ('posts','level','INSERT'),('posts','title','INSERT'),('posts','description','INSERT'),
    ('posts','hand','INSERT'),('posts','vote_question','INSERT'),('posts','vote_options','INSERT'),
    ('posts','visibility','INSERT'),('posts','group_id','INSERT'),
    ('posts','title','UPDATE'),('posts','description','UPDATE'),('posts','location','UPDATE'),
    ('posts','buy_in','UPDATE'),('posts','level','UPDATE'),('posts','vote_question','UPDATE'),
    ('posts','vote_options','UPDATE'),('posts','visibility','UPDATE'),('posts','group_id','UPDATE'),
    ('comments','post_id','INSERT'),('comments','author_id','INSERT'),('comments','body','INSERT'),
    ('comments','parent_comment_id','INSERT'),('comments','gif_url','INSERT'),
    ('comments','image_width','INSERT'),('comments','image_height','INSERT'),
    ('comments','image_path','UPDATE'),('comments','image_width','UPDATE'),
    ('comments','image_height','UPDATE')
),
sensible(tbl, col) as (
  values
    ('posts','mod_status'),('posts','removed_at'),('posts','mod_reason'),('posts','like_count'),
    ('posts','comment_count'),('posts','created_at'),('posts','hand'),('posts','author_id'),
    -- Ajoutée le 21/08 avec la mention « modifié » : c'est le trigger qui la pose, jamais l'auteur.
    -- Accordée en écriture, elle laisserait effacer la trace de sa propre réécriture.
    ('posts','edited_at'),
    ('comments','mod_status'),('comments','removed_at'),('comments','mod_reason'),
    ('comments','like_count'),('comments','created_at'),('comments','author_id')
),
accorde as (
  select table_name as tbl, column_name as col, privilege_type as op
  from information_schema.column_privileges
  where table_schema = 'public' and grantee = 'authenticated'
)
select '1. droits legitimes manquants (casseraient l app)' as controle,
       count(*) as nb,
       case when count(*) = 0 then 'OK' else 'KO — ' || string_agg(tbl || '.' || col || ' ' || op, ', ') end as verdict
from legitime l
where not exists (select 1 from accorde a where a.tbl = l.tbl and a.col = l.col and a.op = l.op)
union all
select '2. colonnes sensibles encore ecrivables (le trou F-21)',
       count(*),
       case when count(*) = 0 then 'OK' else 'KO — ' || string_agg(tbl || '.' || col, ', ') end
from sensible s
where exists (select 1 from accorde a where a.tbl = s.tbl and a.col = s.col and a.op = 'UPDATE')
union all
select '3. triggers de compteurs en SECURITY DEFINER (doit etre 3)',
       count(*),
       case when count(*) = 3 then 'OK' else 'KO' end
from pg_proc
where proname in ('handle_like_change','handle_comment_change','handle_comment_like_change')
  and pronamespace = 'public'::regnamespace and prosecdef
order by 1;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à ne lancer que si l'app casse et qu'on n'a pas le temps de diagnostiquer).
-- Rouvre tout, y compris le trou F-21 : c'est un dépannage, pas une solution.
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- grant insert, update on public.posts    to authenticated;
-- grant insert, update on public.comments to authenticated;
