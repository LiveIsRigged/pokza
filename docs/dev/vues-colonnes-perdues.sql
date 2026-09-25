-- ============================================================================
-- LES COLONNES AJOUTÉES APRÈS COUP AUX VUES DU FIL — CONSTAT ET RÉPARATION
--
-- ⚠️ ORDRE : DEV d'abord, PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Idempotent. Ne touche AUCUNE donnée : il ne redéfinit que des vues.
--
--
-- CE QUI S'EST PASSÉ, et pourquoi c'est une classe de défaut et pas un accident
-- ----------------------------------------------------------------------------
-- Trois migrations successives, chacune correcte seule :
--
--   21/08  `post-modifie.sql`        enveloppe 3 vues du fil pour y AJOUTER `edited_at`
--   10/09  `ordre-du-feed.sql`       FIGE la définition d'alors sous le nom `posts_ranked_base`
--   15/09  `traduction-contenu.sql`  enveloppe 4 vues pour y AJOUTER `language`
--   24/09  `personnalisation-fil.sql` fait `drop view posts_ranked` puis la RECRÉE depuis le socle
--
-- La dernière a emporté `language` : le socle date du 10/09, la colonne a été ajoutée le 15/09,
-- au-dessus. Recréer depuis le socle revient donc au 10/09 pour tout ce qui a été greffé après.
--
-- CE QUE ÇA A COÛTÉ, et c'est le point : RIEN NE CASSE. Pas d'erreur, pas de ligne manquante, le
-- fil s'affiche normalement. `language` arrive simplement `undefined` côté app, et
-- `proposerTraduction()` répond non — le bouton « Traduire » DISPARAÎT du fil, en silence, dans
-- toutes les langues. Personne ne peut le voir en relisant le SQL : il faut regarder l'app.
-- Constaté par Victor le 25/09 en passant l'interface en italien.
--
-- LA LEÇON : une vue qui reçoit des colonnes par ENVELOPPEMENT successif ne supporte pas un
-- `drop` + `create` écrit à partir d'un socle plus ancien. Le socle ne sait pas ce qu'on lui a
-- greffé depuis. Tout script qui recrée une de ces vues doit repasser ici — d'où le constat final,
-- qui est fait pour être RELANCÉ SEUL après n'importe quelle migration touchant le fil.

-- ── CONSTAT AVANT ──────────────────────────────────────────────────────────────────────────────
select 'AVANT' as moment, v.nom as vue, c.colonne,
       case when exists (
         select 1 from information_schema.columns ic
          where ic.table_schema = 'public' and ic.table_name = v.nom and ic.column_name = c.colonne
       ) then 'présente' else '*** MANQUANTE ***' end as etat
  from (values ('posts_ranked'), ('posts_feed'), ('posts_feed_with_group'), ('comments_feed')) v(nom)
 cross join (values ('edited_at'), ('language')) c(colonne)
 -- `comments_feed` n'a jamais eu `edited_at` : ce n'est pas un manque.
 where not (v.nom = 'comments_feed' and c.colonne = 'edited_at')
 order by v.nom, c.colonne;


-- ── RÉPARATION ─────────────────────────────────────────────────────────────────────────────────
-- Même technique que `traduction-contenu.sql`, et pour les mêmes trois raisons :
--   · `v.*` EN TÊTE — l'ordre et les types des colonnes existantes sont préservés, seule condition
--     que `create or replace view` accepte ;
--   · `left join` — aucune ligne ne peut disparaître du fil : au pire la colonne vaut null ;
--   · `reloptions` relu PUIS réappliqué — sans quoi `security_invoker = true` serait perdu et la
--     vue cesserait d'appliquer la RLS. C'est de loin la ligne la plus importante du bloc : une
--     vue qui perd cette option se met à tout montrer à tout le monde, sans erreur et sans rien
--     casser à l'écran (cf. `post-modifie-vues-verif.sql`, écrit pour ce risque-là).
--
-- Les colonnes manquantes sont ajoutées EN UN SEUL enveloppement par vue, pas un par colonne :
-- chaque enveloppement ajoute un niveau d'imbrication à la définition, autant n'en ajouter qu'un.
do $$
declare
  v text;
  src text;
  def text;
  opts text[];
  manquantes text[];
  ajout text;
begin
  foreach v in array array['posts_ranked', 'posts_feed', 'posts_feed_with_group', 'comments_feed']
  loop
    src := case when v = 'comments_feed' then 'public.comments' else 'public.posts' end;

    select array_agg(c.colonne)
      into manquantes
      from unnest(case when v = 'comments_feed' then array['language']
                       else array['edited_at', 'language'] end) as c(colonne)
     where not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v and column_name = c.colonne
     );

    if manquantes is null then
      raise notice 'vue % : rien à faire', v;
      continue;
    end if;

    select pg_get_viewdef(('public.' || v)::regclass, true), c.reloptions
      into def, opts
      from pg_class c
     where c.oid = ('public.' || v)::regclass;

    select string_agg('s.' || quote_ident(colonne), ', ')
      into ajout
      from unnest(manquantes) as colonne;

    execute format(
      'create or replace view public.%I %s as select v.*, %s from (%s) v left join %s s on s.id = v.id',
      v,
      case when opts is null then '' else 'with (' || array_to_string(opts, ', ') || ')' end,
      ajout,
      rtrim(btrim(def), ';'),
      src
    );
    raise notice 'vue % : colonne(s) rendue(s) → %', v, array_to_string(manquantes, ', ');
  end loop;
end $$;


-- ── CONSTAT APRÈS ──────────────────────────────────────────────────────────────────────────────
-- ⚠️ UN SEUL JEU DE LIGNES : l'éditeur Supabase n'affiche QUE le dernier `select` d'un script.
-- Écrire les contrôles séparément revient à n'en voir aucun — appris à ses dépens le 25/09.
--
-- Attendu : 7 lignes, toutes « présente », et `security_invoker` à « OK » sur les quatre vues.
select * from (
  select 1 as n, v.nom as vue, c.colonne,
         case when exists (
           select 1 from information_schema.columns ic
            where ic.table_schema = 'public' and ic.table_name = v.nom and ic.column_name = c.colonne
         ) then 'présente' else '*** MANQUANTE ***' end as etat
    from (values ('posts_ranked'), ('posts_feed'), ('posts_feed_with_group'), ('comments_feed')) v(nom)
   cross join (values ('edited_at'), ('language')) c(colonne)
   where not (v.nom = 'comments_feed' and c.colonne = 'edited_at')

  union all
  -- Le vrai danger de l'enveloppement, contrôlé à chaque fois : une vue qui a perdu
  -- `security_invoker` n'applique plus la RLS et montre tout à tout le monde.
  select 2, cl.relname, 'security_invoker',
         case when array_to_string(cl.reloptions, ',') like '%security_invoker=%on%'
                or array_to_string(cl.reloptions, ',') like '%security_invoker=%true%'
              then 'OK' else '*** PERDU — la vue ne filtre plus ***' end
    from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
   where ns.nspname = 'public'
     and cl.relname in ('posts_ranked', 'posts_feed', 'posts_feed_with_group', 'comments_feed')
) r order by n, vue, colonne;
