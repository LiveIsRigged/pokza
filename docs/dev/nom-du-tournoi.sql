-- Nom du tournoi — colonne, droits, longueur, trigger, vues et lien de partage
-- ===========================================================================
-- À LANCER SUR LE DEV D'ABORD (ahdikgckctvduuestzrh), puis en PROD. IDEMPOTENT : le relancer
-- ne fait rien de plus.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ ORDRE NON NÉGOCIABLE : CE SCRIPT PASSE AVANT LE DÉPLOIEMENT DE L'APP.
-- PostgREST refuse toute requête qui NOMME une colonne inexistante. App poussée avant ce script,
-- deux casses, dont une immédiate :
--   • la page publique d'une main (`fetchPublicPost`) demande la colonne dans son `select` et
--     tombe donc À COUP SÛR, pour tout le monde, y compris sur les mains déjà publiées ;
--   • publier ou corriger un tournoi NOMMÉ échoue. Un champ vide, lui, passe : `undefined`
--     disparaît à la sérialisation JSON et n'atteint jamais la base.
-- Dans l'autre sens il ne se passe rien du tout : la colonne existe et personne ne l'écrit encore.
--
-- CE QUI EST TRANCHÉ (04/09/2026)
-- ------------------------------
-- Un nouveau champ « Nom du tournoi », entre Lieu et Buy-in dans l'étape 1, tournoi seulement.
-- Il naît du besoin de l'import de hand histories : une HH de MTT porte un nom d'épreuve
-- (« #5 - W SERIES - MILLION EVENT - KO - DAY 1 ») qui n'avait aucun champ où aller.
--
-- 44 caractères, et pas 40 comme le lieu : le plus long nom réel relevé sur une vraie hand history
-- en fait 41, et l'aligner sur le lieu l'aurait coupé d'un caractère.
--
-- POURQUOI UNE COLONNE ET PAS UNE CLÉ DANS LE JSONB `hand` (qui n'aurait demandé AUCUNE migration,
-- comme `revealShowdown` ou `stoppedAtSeatId`) : `updatePost()` ne touche jamais à `hand` — seul le
-- texte du post est modifiable après publication. Un nom de tournoi rangé là serait donc
-- impossible à corriger, l'inverse de ce qui a été demandé.
--
-- ⚠️ LES TROIS PIÈGES DE CETTE MIGRATION
--   1. LES DROITS. Le `revoke insert, update` de F-21 fait naître toute nouvelle colonne de `posts`
--      NON écrivable par les membres (cf. post-modifie.sql). Contrairement à `edited_at`, celle-ci
--      doit l'être : sans le `grant` du bloc 3, publier une main lèverait une erreur de droits.
--   2. LE TRIGGER « modifié ». Il compare exactement les colonnes que `updatePost()` peut écrire.
--      En ajouter une sans l'ajouter là laisserait modifier le nom du tournoi SANS que la main
--      porte la mention — une réécriture invisible, ce que ce trigger existe pour empêcher.
--   3. LE TYPE DE RETOUR DU LIEN DE PARTAGE. `create or replace function` REFUSE de changer un
--      type de retour : il faut supprimer puis recréer (bloc 6), et réappliquer les droits.
--
-- ATTENDU : « ALTER TABLE », « CREATE FUNCTION », « CREATE TRIGGER », trois `notice` de vue, puis
-- le récapitulatif final entièrement en OK.
-- ===========================================================================

begin;

-- ── 1. La colonne. Nullable : `null` = pas un tournoi, ou un tournoi qu'on n'a pas nommé — et
-- c'est le cas de TOUTES les mains déjà publiées.
alter table public.posts add column if not exists tournament_name text;

comment on column public.posts.tournament_name is
  'Nom de l''épreuve, en tournoi seulement (« Main Event »). Affiché dans la ligne de contexte '
  'entre le type de partie et le niveau (cf. formatContextLine). 44 caractères, jumeau de '
  'TOURNAMENT_NAME_MAX_LENGTH dans pokza-app/src/constants/limits.ts.';

-- ── 2. La longueur, jumelle de `limits.ts`. La contrainte du contexte est REMPLACÉE plutôt que
-- doublée : lieu, nom du tournoi, buy-in et niveau s'affichent sur la même ligne et forment une
-- seule famille. `not valid` comme ses voisines — les lignes déjà en base ne sont pas revérifiées
-- (aucune ne peut violer une colonne qui vient de naître).
alter table public.posts     drop constraint if exists posts_context_length;
alter table public.posts     add  constraint posts_context_length
  check (
        (location        is null or char_length(location)        <= 40)
    and (tournament_name is null or char_length(tournament_name) <= 44)
    and (buy_in          is null or char_length(buy_in)          <= 16)
    and (level           is null or char_length(level)           <= 10)
  ) not valid;

-- ── 3. Les droits par colonne (F-21). `authenticated` seulement : `anon` n'écrit jamais rien.
-- La RLS reste le vrai rempart sur QUELLES lignes ; ceci ne dit que QUELLES colonnes.
grant insert (tournament_name), update (tournament_name) on public.posts to authenticated;

-- ── 4. Le trigger « modifié », avec sa huitième comparaison. `is distinct from` et pas `<>` :
-- `<>` renvoie NULL dès qu'un côté l'est, donc passer un nom de NULL à un texte — le cas le plus
-- courant sur ce champ, puisque aucune main existante n'en a — ne serait PAS détecté.
create or replace function public.posts_mark_edited()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.title           is distinct from old.title
  or new.description     is distinct from old.description
  or new.location        is distinct from old.location
  or new.tournament_name is distinct from old.tournament_name
  or new.buy_in          is distinct from old.buy_in
  or new.level           is distinct from old.level
  or new.vote_question   is distinct from old.vote_question
  or new.vote_options    is distinct from old.vote_options
  then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists posts_mark_edited on public.posts;
create trigger posts_mark_edited
  before update on public.posts
  for each row execute function public.posts_mark_edited();

-- ── 5. Exposer la colonne dans les 3 vues de lecture du feed.
--
-- Bloc repris TEL QUEL de post-modifie.sql, et pour la même raison : ces vues ont été redéfinies
-- plusieurs fois (feed-boost, visibilité groupe, modération) et aucun fichier du dépôt n'en détient
-- la version qui tourne vraiment. On lit donc la définition EN PLACE avec `pg_get_viewdef`, on
-- l'enveloppe telle quelle, et on ajoute la colonne à la fin. Ce qui est dedans n'a pas besoin
-- d'être connu ni recopié — donc rien ne peut être perdu au passage.
--
--   • `v.*` en tête → les colonnes existantes gardent leur nom, leur type ET leur ordre, seule
--     condition que `create or replace view` accepte. La nouvelle arrive en dernier, ce qui est
--     aussi ce qu'attend l'app (`select('*')`).
--   • `left join` et pas `join` → aucune main ne peut disparaître du feed ; au pire le nom manque.
--   • `reloptions` relu et réappliqué → sans ça `create or replace view` remet les options par
--     défaut, et perdre un `security_invoker = true` transformerait une vue filtrée par la RLS en
--     vue qui la contourne. C'est la ligne la plus importante du bloc.
do $$
declare
  v      text;
  v_def  text;
  v_opts text[];
begin
  foreach v in array array['posts_ranked', 'posts_feed', 'posts_feed_with_group']
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v and column_name = 'tournament_name'
    ) then
      select pg_get_viewdef(('public.' || v)::regclass, true), c.reloptions
        into v_def, v_opts
        from pg_class c where c.oid = ('public.' || v)::regclass;

      execute format(
        'create or replace view public.%I %s as select v.*, p.tournament_name from (%s) v '
        'left join public.posts p on p.id = v.id',
        v,
        case when v_opts is null then '' else 'with (' || array_to_string(v_opts, ', ') || ')' end,
        rtrim(btrim(v_def), ';')
      );
      raise notice 'vue % : tournament_name ajoutee', v;
    else
      raise notice 'vue % : tournament_name deja presente, rien a faire', v;
    end if;
  end loop;
end $$;

-- ── 6. Le lien de partage. SUPPRIMER PUIS RECRÉER, parce qu'un `create or replace function` refuse
-- de changer un type de retour — et c'en est un, la fonction déclarant sa table colonne par
-- colonne. Corps inchangé à la neuvième colonne près ; les deux lignes de modération (main masquée,
-- auteur banni) sont recopiées telles quelles, sans elles le partage redeviendrait un angle mort.
drop function if exists public.post_by_share_token(text);

create function public.post_by_share_token(p_token text)
returns table (
  id uuid, title text, description text, location text,
  tournament_name text, buy_in text, level text, created_at timestamptz, hand jsonb
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, p.title, p.description, p.location,
         p.tournament_name, p.buy_in, p.level, p.created_at, p.hand
  from public.post_shares s
  join public.posts p on p.id = s.post_id
  where s.token = p_token
    and p.mod_status = 'visible'
    and not private.is_banned(p.author_id);
$$;

revoke all on function public.post_by_share_token(text) from public;
grant execute on function public.post_by_share_token(text) to anon, authenticated;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RÉCAPITULATIF — ce que la base contient maintenant. Chaque ligne affiche ce qu'elle a compté :
-- un rapport vide ne prouverait rien.
-- Attendu : 8 lignes (les vues en font 3 à elles seules), toutes en OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════
select 'colonne posts.tournament_name' as controle,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='posts' and column_name='tournament_name')
            then 'OK' else 'KO — absente' end as verdict
union all
select 'longueur 44 (contrainte posts_context_length)',
       case when exists (select 1 from pg_constraint
                         where conname='posts_context_length' and conrelid='public.posts'::regclass
                           and pg_get_constraintdef(oid) like '%tournament_name%44%')
            then 'OK' else 'KO — la contrainte ne couvre pas la nouvelle colonne' end
union all
select 'ecrivable par les membres (insert + update)',
       case when (select count(distinct privilege_type) from information_schema.column_privileges
                  where table_schema='public' and table_name='posts' and column_name='tournament_name'
                    and grantee='authenticated' and privilege_type in ('INSERT','UPDATE')) = 2
            then 'OK' else 'KO — publier ou corriger une main echouera' end
union all
select 'trigger posts_mark_edited surveille la colonne',
       case when exists (select 1 from pg_proc
                         where proname='posts_mark_edited' and pronamespace='public'::regnamespace
                           and prosrc like '%tournament_name%')
            then 'OK' else 'KO — une reecriture du nom passerait inapercue' end
union all
select 'vue ' || v.nom,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name=v.nom and column_name='tournament_name')
            then 'OK — expose tournament_name' else 'KO — colonne absente de la vue' end
from (values ('posts_ranked'),('posts_feed'),('posts_feed_with_group')) as v(nom)
union all
select 'lien de partage rend la colonne',
       case when exists (select 1 from pg_proc
                         where proname='post_by_share_token' and pronamespace='public'::regnamespace
                           and pg_get_function_result(oid) like '%tournament_name%')
            then 'OK' else 'KO — un lien partage perdrait le nom du tournoi' end;
