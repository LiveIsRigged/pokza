-- F-21 — vérifier que le verrouillage par colonne n'a rien cassé de LÉGITIME
-- ===========================================================================
-- Le correctif F-21 (16/08/2026) a retiré le `grant all` sur `posts` et `comments` pour le
-- remplacer par des droits colonne par colonne. Sa vérification portait sur ce qui doit être
-- REFUSÉ (l'auteur ne peut plus annuler sa propre modération, ni réécrire `like_count`).
-- Elle ne disait rien de l'inverse : est-ce que tout ce que l'app écrit vraiment est encore permis ?
--
-- Une colonne oubliée dans le `grant` ne se voit pas tout de suite. Selon l'endroit, elle donne
-- soit une erreur `42501` en pleine figure, soit — pire — une photo de commentaire qui semble
-- envoyée puis disparaît au rechargement.
--
-- Ce script ne modifie RIEN. Il compare les colonnes réellement écrites par l'app (relevées dans
-- `data/posts.ts` et `data/comments.ts`) aux droits accordés au rôle `authenticated`.
--
-- ✅ Résultat attendu : AUCUNE LIGNE.
-- ❌ Chaque ligne renvoyée est un droit manquant, avec la fonction de l'app qu'il casse.

with attendu(tbl, col, op, fonction) as (
  values
    -- createPost() — data/posts.ts
    ('posts', 'author_id',      'INSERT', 'createPost'),
    ('posts', 'location',       'INSERT', 'createPost'),
    ('posts', 'buy_in',         'INSERT', 'createPost'),
    ('posts', 'level',          'INSERT', 'createPost'),
    ('posts', 'title',          'INSERT', 'createPost'),
    ('posts', 'description',    'INSERT', 'createPost'),
    ('posts', 'hand',           'INSERT', 'createPost'),
    ('posts', 'vote_question',  'INSERT', 'createPost'),
    ('posts', 'vote_options',   'INSERT', 'createPost'),
    ('posts', 'visibility',     'INSERT', 'createPost'),
    ('posts', 'group_id',       'INSERT', 'createPost'),
    -- updatePost() — data/posts.ts
    ('posts', 'title',          'UPDATE', 'updatePost'),
    ('posts', 'description',    'UPDATE', 'updatePost'),
    ('posts', 'location',       'UPDATE', 'updatePost'),
    ('posts', 'buy_in',         'UPDATE', 'updatePost'),
    ('posts', 'level',          'UPDATE', 'updatePost'),
    ('posts', 'vote_question',  'UPDATE', 'updatePost'),
    ('posts', 'vote_options',   'UPDATE', 'updatePost'),
    ('posts', 'visibility',     'UPDATE', 'updatePost'),
    ('posts', 'group_id',       'UPDATE', 'updatePost'),
    -- createComment() — data/comments.ts
    ('comments', 'post_id',           'INSERT', 'createComment'),
    ('comments', 'author_id',         'INSERT', 'createComment'),
    ('comments', 'body',              'INSERT', 'createComment'),
    ('comments', 'parent_comment_id', 'INSERT', 'createComment'),
    ('comments', 'gif_url',           'INSERT', 'createComment'),
    ('comments', 'image_width',       'INSERT', 'createComment'),
    ('comments', 'image_height',      'INSERT', 'createComment'),
    -- createComment(), second temps : la photo, une fois l'id de la ligne connu
    ('comments', 'image_path',   'UPDATE', 'createComment (photo)'),
    ('comments', 'image_width',  'UPDATE', 'createComment (photo)'),
    ('comments', 'image_height', 'UPDATE', 'createComment (photo)')
)
select
  a.fonction                                    as "fonction cassee",
  a.op                                          as "operation",
  a.tbl || '.' || a.col                         as "droit manquant"
from attendu a
where not exists (
  select 1
  from information_schema.column_privileges p
  where p.table_schema   = 'public'
    and p.table_name     = a.tbl
    and p.column_name    = a.col
    and p.privilege_type = a.op
    and p.grantee        = 'authenticated'
)
order by 1, 2, 3;
