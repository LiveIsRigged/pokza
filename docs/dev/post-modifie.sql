-- Mention « modifié » sous le pseudo — colonne, trigger, et exposition dans les vues
-- =================================================================================
-- À LANCER SUR LE DEV D'ABORD (ahdikgckctvduuestzrh), puis en PROD. IDEMPOTENT : le relancer
-- ne fait rien de plus.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- CE QUI EST TRANCHÉ (21/08/2026)
-- ------------------------------
-- Marquent « modifié » : titre, description, lieu, buy-in, niveau, question de vote, options de
-- vote — exactement les 7 colonnes que `updatePost()` a le droit d'écrire, et exactement ce qu'un
-- lecteur voit. NE marquent rien : passer une main de publique à privée (la portée n'est pas du
-- contenu), un like, un commentaire, une décision de modération.
--
-- Le délai de grâce de 5 minutes N'EST PAS ICI. La base enregistre TOUTES les modifications ;
-- c'est l'app qui décide de n'afficher la mention qu'au-delà de 5 min (`utils/postEdited.ts`).
-- Autrement dit : ce délai se change sans migration, et la trace ne s'efface jamais.
--
-- ⚠️ LE PIÈGE QUI A DICTÉ L'ÉCRITURE DU TRIGGER
-- `posts.like_count` et `posts.comment_count` sont maintenus par des triggers en base. CHAQUE like
-- déclenche donc un `UPDATE` sur la ligne du post. Un `edited_at := now()` sur tout UPDATE
-- marquerait « modifié » toute main un peu aimée — sans que personne n'ait touché à son texte.
-- D'où la comparaison colonne par colonne ci-dessous, qui est le cœur de ce script.
--
-- `hand` est volontairement ABSENTE de la liste : l'app s'interdit déjà d'y toucher (et F-21 le
-- rend opposable), mais surtout une migration de données qui normaliserait ce champ marquerait
-- d'un coup TOUTES les mains comme modifiées. Le jour où une main devient réécrivable, ajouter la
-- colonne ici — pas avant.
--
-- ⚠️ DROITS : `edited_at` n'est accordée à personne en écriture. Le `revoke insert, update` de
-- F-21 fait que toute NOUVELLE colonne de `posts` naît non écrivable par les membres, et on ne la
-- déverrouille pas. Un auteur ne doit pas pouvoir effacer la trace de sa propre réécriture. Le
-- trigger, lui, écrit `new.edited_at` avant l'enregistrement : ça ne passe pas par la liste SET de
-- la requête, donc les droits par colonne ne s'y appliquent pas. C'est bien ce qu'on veut.
--
-- ATTENDU : « ALTER TABLE », « CREATE FUNCTION », « CREATE TRIGGER », puis le récapitulatif final
-- avec 3 lignes de vues à `expose edited_at = true`. La MESURE du trigger est dans
-- `post-modifie-test.sql` — ce script pose, il ne se juge pas lui-même.
-- =================================================================================

begin;

-- ── 1. La colonne. Nullable : `null` = jamais retouchée, ce qui est l'immense majorité des mains.
alter table public.posts add column if not exists edited_at timestamptz;

comment on column public.posts.edited_at is
  'Dernière modification du CONTENU (7 colonnes, cf. trigger posts_mark_edited). Null = jamais '
  'retouchée. Non écrivable par les membres (F-21). L''affichage « modifié » applique en plus un '
  'délai de grâce de 5 min côté app (utils/postEdited.ts).';

-- ── 2. Le trigger. Sept comparaisons `is distinct from` — et pas `<>` : `<>` renvoie NULL dès
-- qu'un des deux côtés est NULL, donc passer une description de NULL à un texte (ou l'inverse)
-- ne serait PAS détecté. C'est le cas le plus courant d'une première relecture.
create or replace function public.posts_mark_edited()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.title         is distinct from old.title
  or new.description   is distinct from old.description
  or new.location      is distinct from old.location
  or new.buy_in        is distinct from old.buy_in
  or new.level         is distinct from old.level
  or new.vote_question is distinct from old.vote_question
  or new.vote_options  is distinct from old.vote_options
  then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists posts_mark_edited on public.posts;
create trigger posts_mark_edited
  before update on public.posts
  for each row execute function public.posts_mark_edited();

-- ── 3. Exposer la colonne dans les 3 vues de lecture du feed.
--
-- POURQUOI CE DÉTOUR PLUTÔT QU'UN `create or replace view ... as select ...` RECOPIÉ :
-- ces vues ont été redéfinies plusieurs fois (feed-boost, visibilité groupe, modération). Aucun
-- fichier du dépôt n'en détient la version qui tourne vraiment — la seule source de vérité est la
-- base. On lit donc la définition EN PLACE avec `pg_get_viewdef`, on l'enveloppe telle quelle, et
-- on ajoute la colonne à la fin. Ce qui est dedans n'a pas besoin d'être connu, ni compris, ni
-- recopié — donc rien ne peut être perdu au passage.
--
-- Trois précautions, chacune pour une façon précise de se tirer une balle dans le pied :
--   • `v.*` en tête → les colonnes existantes gardent leur nom, leur type ET leur ordre, seule
--     condition que `create or replace view` accepte. `edited_at` arrive en dernier, ce qui est
--     aussi ce qu'attend le code de l'app (`select('*')`).
--   • `left join` et pas `join` → même si la RLS de `posts` filtrait autrement que la vue, aucune
--     main ne peut disparaître du feed : au pire `edited_at` vaut null et la mention ne s'affiche
--     pas. Une main perdue serait un bug visible ; une mention manquante, non.
--   • `reloptions` relu et réappliqué → `create or replace view` REMET les options par défaut si
--     on ne les répète pas. Perdre un `security_invoker = true` au passage transformerait une vue
--     filtrée par la RLS en vue qui la contourne. C'est la ligne la plus importante du bloc.
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
      where table_schema = 'public' and table_name = v and column_name = 'edited_at'
    ) then
      select pg_get_viewdef(('public.' || v)::regclass, true), c.reloptions
        into v_def, v_opts
        from pg_class c where c.oid = ('public.' || v)::regclass;

      execute format(
        'create or replace view public.%I %s as select v.*, p.edited_at from (%s) v '
        'left join public.posts p on p.id = v.id',
        v,
        case when v_opts is null then '' else 'with (' || array_to_string(v_opts, ', ') || ')' end,
        rtrim(btrim(v_def), ';')
      );
      raise notice 'vue % : edited_at ajoutee', v;
    else
      raise notice 'vue % : edited_at deja presente, rien a faire', v;
    end if;
  end loop;
end $$;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- RÉCAPITULATIF — ce que la base contient maintenant. Chaque ligne affiche ce qu'elle a compté :
-- un rapport vide ne prouverait rien.
-- Attendu : colonne OK, trigger OK, 3 vues à `true`, et 0 droit d'écriture accordé.
-- ══════════════════════════════════════════════════════════════════════════════════════════
select 'colonne posts.edited_at' as controle,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='posts' and column_name='edited_at')
            then 'OK' else 'KO — absente' end as verdict
union all
select 'trigger posts_mark_edited (BEFORE UPDATE)',
       case when exists (select 1 from pg_trigger
                         where tgname='posts_mark_edited' and tgrelid='public.posts'::regclass and not tgisinternal)
            then 'OK' else 'KO — absent' end
union all
select 'vue ' || v.nom,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name=v.nom and column_name='edited_at')
            then 'OK — expose edited_at' else 'KO — colonne absente de la vue' end
from (values ('posts_ranked'),('posts_feed'),('posts_feed_with_group')) as v(nom)
union all
select 'edited_at NON ecrivable par les membres (F-21)',
       case when not exists (select 1 from information_schema.column_privileges
                             where table_schema='public' and table_name='posts'
                               and column_name='edited_at' and grantee in ('authenticated','anon')
                               and privilege_type in ('INSERT','UPDATE'))
            then 'OK' else 'KO — un membre peut ecrire edited_at' end;
