-- ============================================================================
-- LES VUES DU FIL PORTENT-ELLES TOUT CE QUE L'APP LEUR DEMANDE ?
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- LECTURE SEULE. Ne modifie rien, ne crée rien. À relancer après TOUTE migration
-- qui touche `posts_ranked`, `posts_feed` ou `posts_feed_with_group`.
--
--
-- POURQUOI CE FICHIER EXISTE
-- --------------------------
-- Le 24/09, `personnalisation-fil.sql` a recréé `posts_ranked` depuis un socle figé le 10/09.
-- `language`, greffée le 15/09 PAR-DESSUS, a disparu. Rien n'a cassé : pas d'erreur, pas de ligne
-- manquante, le fil s'est affiché normalement. Le seul symptôme était l'absence du bouton
-- « Traduire » — constatée par Victor le 25/09, soit un jour plus tard, et par hasard.
--
-- LE POINT AVEUGLE QUE CE SCRIPT COUVRE : une colonne OPTIONNELLE qui disparaît ne se voit pas.
-- L'app lit `row.language ?? undefined` et continue. Les colonnes dangereuses sont donc exactement
-- celles dont l'absence dégrade en silence :
--
--   language             → le bouton « Traduire » disparaît
--   edited_at            → la mention « · modifié » disparaît
--   author_is_friend     → la pastille « ✓ Ami » disparaît
--   mutual_friend_count  → le bonus d'amis communs sort du classement (INVISIBLE, même à l'œil)
--   group_name           → la pastille de groupe disparaît
--
-- Les colonnes obligatoires (title, hand, id…) n'ont pas besoin de ce contrôle : leur absence
-- casse l'écran tout de suite. Ce sont les optionnelles qu'il faut surveiller.
--
-- La liste ci-dessous est celle de `PostFeedRow` dans `pokza-app/src/data/posts.ts`. Si un jour
-- l'app lit une colonne de plus, l'ajouter ici — c'est le seul entretien que ce fichier demande.

select * from (
  -- 1. `posts_ranked` — le fil principal. Doit porter TOUTES les colonnes de `PostFeedRow`.
  select 1 as n, 'posts_ranked' as vue, c.colonne,
         case when exists (
           select 1 from information_schema.columns ic
            where ic.table_schema = 'public' and ic.table_name = 'posts_ranked'
              and ic.column_name = c.colonne
         ) then 'présente' else '*** MANQUANTE ***' end as etat
    from unnest(array[
      'id', 'author_id', 'author_name', 'author_avatar_url', 'created_at', 'edited_at',
      'location', 'tournament_name', 'buy_in', 'level', 'title', 'description', 'hand',
      'vote_question', 'vote_options', 'vote_counts', 'my_vote', 'like_count', 'comment_count',
      'visibility', 'liked_by_me', 'mod_status', 'author_is_friend', 'mutual_friend_count',
      'group_id', 'group_name', 'language'
    ]) as c(colonne)

  union all
  -- 2. `posts_feed` et `posts_feed_with_group` — profil, groupe, main seule. `group_name` n'y
  --    existe pas (elle est propre au fil principal), et `group_id` n'est que dans la seconde.
  select 2, v.nom, c.colonne,
         case when exists (
           select 1 from information_schema.columns ic
            where ic.table_schema = 'public' and ic.table_name = v.nom and ic.column_name = c.colonne
         ) then 'présente' else '*** MANQUANTE ***' end
    from (values ('posts_feed'), ('posts_feed_with_group')) v(nom)
   cross join unnest(array['edited_at', 'language', 'author_is_friend', 'mutual_friend_count']) as c(colonne)

  union all
  -- 3. `comments_feed` — le bouton « Traduire » d'un commentaire.
  select 3, 'comments_feed', 'language',
         case when exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'comments_feed' and column_name = 'language'
         ) then 'présente' else '*** MANQUANTE ***' end

  union all
  -- 4. LE VRAI DANGER de la technique d'enveloppement, contrôlé à chaque fois : une vue qui a
  --    perdu `security_invoker` n'applique plus la RLS et montre tout à tout le monde — sans
  --    erreur, sans rien casser à l'écran (cf. `post-modifie-vues-verif.sql`).
  select 4, cl.relname, 'security_invoker',
         case when array_to_string(cl.reloptions, ',') like '%security_invoker=%on%'
                or array_to_string(cl.reloptions, ',') like '%security_invoker=%true%'
              then 'OK' else '*** PERDU — la vue ne filtre plus ***' end
    from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname = 'public'
     and cl.relname in ('posts_ranked', 'posts_feed', 'posts_feed_with_group', 'comments_feed')
) r order by n, vue, colonne;
