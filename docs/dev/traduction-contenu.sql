-- Traduction du contenu — les fondations : langue source, empreintes, cache, budget
-- ================================================================================
-- À LANCER SUR LE DEV D'ABORD (ahdikgckctvduuestzrh), puis en PROD. IDEMPOTENT.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- CE QUE CE SCRIPT POSE, ET CE QU'IL NE POSE PAS
-- ----------------------------------------------
-- Il pose le STOCKAGE, qui est le même quel que soit le design retenu (traduction automatique,
-- bouton « traduire », ou les deux selon la surface). Il ne décide RIEN de l'affichage : les vues
-- n'exposent pas encore le texte traduit, parce que le joindre systématiquement ou le chercher à
-- la demande dépend d'un choix produit qui n'est pas tranché.
--
-- ⚠️ LA SEULE PARTIE QUI A UNE ÉCHÉANCE, c'est `language`. Une main publiée avant cette colonne
-- reste sans langue source POUR TOUJOURS : on ne pourra jamais savoir après coup si « Hero call
-- contre un reg » était du français ou de l'anglais. Tout le reste se rajoute quand on veut.
--
-- ⚠️ POURQUOI UN TRIGGER ET PAS LE CLIENT
-- Deux raisons, la première étant bloquante. (1) Le `revoke insert, update` de F-21 fait que toute
-- NOUVELLE colonne de `posts`/`comments` naît non écrivable par les membres — `createPost()`
-- échouerait s'il tentait de poser `language` lui-même, et lui ouvrir le droit annulerait F-21 sur
-- cette colonne. (2) Un client peut mentir : rien n'empêcherait d'annoncer « de » sur du texte
-- français, ce qui ferait traduire du français vers le français et brûlerait du quota pour rien.
-- La base, elle, lit `profiles.language` — que `syncLangueDuProfil()` réécrit à CHAQUE ouverture
-- de l'app avec la langue RÉSOLUE (celle qui est à l'écran), donc toujours fraîche.
--
-- Réserve assumée : c'est la langue d'INTERFACE de l'auteur, pas forcément celle dans laquelle il
-- a tapé. Un Belge en interface anglaise qui écrit en français sera étiqueté « en ». C'est pour ça
-- que la consigne du modèle dira « si le texte est déjà dans la langue cible, rends-le inchangé » :
-- l'erreur se rattrape à la traduction, elle ne se propage pas. `null` (profil jamais synchronisé)
-- veut dire « inconnue » et se traite pareil.
--
-- ATTENDU : un récapitulatif de 6 lignes, toutes à OK (la dernière peut dire SANS OBJET sur le DEV).
-- ================================================================================

begin;

-- ── 1. La langue SOURCE, posée par la base à l'insertion ───────────────────────────────────────
alter table public.posts    add column if not exists language text;
alter table public.comments add column if not exists language text;

comment on column public.posts.language is
  'Langue RÉSOLUE de l''auteur au moment de la publication, copiée de profiles.language par le '
  'trigger posts_set_language. Null = inconnue (profil jamais synchronisé) — se traite comme un '
  'texte à faire détecter. Non écrivable par les membres (F-21), et c''est voulu.';

comment on column public.comments.language is
  'Voir posts.language — même origine, même trigger jumeau, même raison.';

create or replace function public.set_language_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `security definer` : le trigger doit pouvoir lire `profiles` même si la RLS de cette table se
  -- resserre un jour. Il ne lit qu'une seule colonne, d'une seule ligne, désignée par une valeur
  -- que la RLS de `posts`/`comments` a déjà validée — la surface est aussi étroite que possible.
  -- On n'écrase jamais une valeur déjà fournie (`is null` en garde) : ça laisse la porte ouverte à
  -- un futur import ou à un backfill qui saurait mieux que le profil.
  if new.language is null then
    select p.language into new.language from public.profiles p where p.id = new.author_id;
  end if;
  return new;
end $$;

drop trigger if exists posts_set_language on public.posts;
create trigger posts_set_language
  before insert on public.posts
  for each row execute function public.set_language_from_profile();

drop trigger if exists comments_set_language on public.comments;
create trigger comments_set_language
  before insert on public.comments
  for each row execute function public.set_language_from_profile();

-- ── 2. Les empreintes : AUCUNE colonne, et c'est une correction ──────────────────────────────────
--
-- La première version de ce script stockait l'empreinte de chaque texte dans une colonne générée
-- (`generated always as (encode(sha256(convert_to(title, 'UTF8')), 'hex')) stored`). Postgres l'a
-- REFUSÉE sur le DEV le 15/09 : « 42P17: generation expression is not immutable ». Une colonne
-- générée n'accepte que des fonctions IMMUTABLE, et `convert_to` n'est que STABLE (elle dépend de
-- l'encodage de la base).
--
-- Plutôt que de maquiller la fonction en IMMUTABLE, on retire les colonnes, parce qu'elles ne
-- servaient à rien : l'empreinte se calcule là où on en a besoin, à partir du texte COURANT.
--   • la fonction `traduire` la calcule elle-même (SHA-256 des octets UTF-8, Web Crypto) ;
--   • une vue qui voudra joindre `traductions` la calculera dans son `select`, sur les quelques
--     lignes d'une page du fil — la recherche, elle, passe par la clé primaire de `traductions`.
-- Rien à désynchroniser, pas de réécriture de la table `posts` en PROD, pas de colonne de plus à
-- protéger au titre de F-21. LA formule, identique des deux côtés, est :
--   encode(sha256(convert_to(coalesce(<texte>, ''), 'UTF8')), 'hex')

-- ── 3. Le cache des traductions ────────────────────────────────────────────────────────────────
--
-- ⚠️ AUCUN DROIT DE LECTURE POUR LES MEMBRES, ET C'EST LE POINT DE SÉCURITÉ DU SCRIPT.
-- Cette table contient le texte de mains PRIVÉES et de groupes fermés. Une policy « lisible par
-- tout authentifié » suffirait à contourner toute la visibilité du feed par un simple `select *`.
-- Le contenu ne sortira que par la fonction `traduire` (qui relit le post AVEC le jeton du
-- lecteur) ou par les vues de lecture, qui portent la RLS de `posts`.
--
-- `langue_source` est la langue que le MODÈLE a lue dans le texte, pas celle du profil de
-- l'auteur : c'est elle qui corrige « interface allemande, texte français ». `zxx` = rien à
-- traduire (« AA vs KK », « gg »). Quand elle vaut la langue du lecteur ou `zxx`, `texte` est nul :
-- on montre l'original, sans mention — et on ne redemandera pas au modèle ce qu'il a déjà dit.
-- Une traduction REFUSÉE par les garde-fous n'est jamais écrite ici.
create table if not exists public.traductions (
  empreinte      text        not null,
  langue         text        not null,
  texte          text,
  langue_source  text        not null,
  modele         text        not null,
  cree_le        timestamptz not null default now(),
  primary key (empreinte, langue)
);

comment on table public.traductions is
  'Cache des traductions de contenu. Clé = (empreinte sha256 du texte source, langue cible) — '
  'jamais l''id d''un post : un texte corrigé change d''empreinte et se retraduit de lui-même. '
  'texte nul = rien à montrer, l''original est déjà lisible (langue_source = langue ou zxx). '
  'Aucune lecture directe par les membres.';

alter table public.traductions enable row level security;
-- Supabase accorde par défaut à `anon` et `authenticated` tous les droits sur une nouvelle table.
-- La RLS sans policy les neutralise déjà ; le revoke évite que désactiver la RLS un jour suffise.
revoke all on public.traductions from anon, authenticated;
-- Pas de policy = personne n'y accède, sauf la service_role qui les contourne par nature.

-- ── 4. Le registre de dépense ──────────────────────────────────────────────────────────────────
--
-- ON NE S'ARRÊTE PAS À UN SEUIL INVENTÉ : on s'arrête sur le signal EXACT de Cloudflare. Sur le
-- plan Workers Free, le 10 001e neuron du jour répond 429 / 3036 et n'est jamais facturé ; la
-- fonction note alors `epuise_le` et n'appelle plus avant 00:00 UTC, au lieu de marteler une porte
-- fermée. Le registre sert à VOIR la consommation monter — c'est lui qui dira « le jour où
-- Cloudflare devient limite ». Réserver du budget à certaines traductions demanderait un seuil :
-- ce sera une décision à prendre ce jour-là, pas maintenant.
--
-- ⚠️ CETTE GARANTIE TIENT AU PLAN, PAS AU CODE. Si le compte Cloudflare passe un jour au plan
-- Workers Paid, le 3036 n'arrive plus : le dépassement se FACTURE. Un plafond dur dans la
-- fonction deviendrait alors obligatoire.
create table if not exists public.traduction_budget (
  jour       date          primary key,
  neurons    numeric(12,3) not null default 0,
  appels     integer       not null default 0,
  epuise_le  timestamptz
);

comment on table public.traduction_budget is
  'Neurons Workers AI consommés par jour UTC, tenus par la fonction `traduire`. epuise_le = heure '
  'du premier refus 3036 (quota gratuit consommé) : plus aucun appel ce jour-là.';

alter table public.traduction_budget enable row level security;
revoke all on public.traduction_budget from anon, authenticated;

-- Un `update ... set neurons = neurons + x` lu puis réécrit par deux appels simultanés perdrait une
-- dépense ; l'`insert ... on conflict` est atomique. Pas de `security definer` : seule la
-- service_role l'exécute, et elle n'a besoin d'aucun droit de plus que les siens.
create or replace function public.traduction_budget_ajouter(p_neurons numeric, p_epuise boolean default false)
returns void
language sql
set search_path = public
as $$
  insert into public.traduction_budget as b (jour, neurons, appels, epuise_le)
  values ((now() at time zone 'utc')::date, greatest(p_neurons, 0),
          case when p_neurons > 0 then 1 else 0 end, case when p_epuise then now() end)
  on conflict (jour) do update
     set neurons   = b.neurons + excluded.neurons,
         appels    = b.appels + excluded.appels,
         epuise_le = coalesce(b.epuise_le, excluded.epuise_le);
$$;

-- ⚠️ Supabase donne par défaut le droit d'exécuter toute nouvelle fonction du schéma public à
-- `anon` et `authenticated` : sans ce revoke, n'importe quel visiteur pourrait gonfler le registre
-- et faire croire le quota épuisé. Le récapitulatif le vérifie.
revoke all on function public.traduction_budget_ajouter(numeric, boolean) from public, anon, authenticated;
grant execute on function public.traduction_budget_ajouter(numeric, boolean) to service_role;

-- ── 5. Exposer `language` dans les 4 vues de lecture ───────────────────────────────────────────
--
-- Même détour que la migration « modifié », et pour la même raison : ces vues ont été redéfinies
-- plusieurs fois et AUCUN fichier du dépôt n'en détient la version qui tourne. On lit la
-- définition en place avec `pg_get_viewdef`, on l'enveloppe telle quelle, on ajoute la colonne à
-- la fin. Les trois précautions sont reprises à l'identique : `v.*` en tête (l'ordre et les types
-- des colonnes existantes sont préservés, seule condition que `create or replace view` accepte),
-- `left join` (aucune ligne ne peut disparaître du feed : au pire `language` vaut null),
-- et `reloptions` relu puis réappliqué — sans quoi un `security_invoker = true` serait perdu et
-- la vue cesserait d'appliquer la RLS. C'est toujours la ligne la plus importante du bloc.
do $$
declare
  v text; v_def text; v_opts text[]; v_src text;
begin
  foreach v in array array['posts_ranked', 'posts_feed', 'posts_feed_with_group', 'comments_feed']
  loop
    v_src := case when v = 'comments_feed' then 'public.comments' else 'public.posts' end;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v and column_name = 'language'
    ) then
      select pg_get_viewdef(('public.' || v)::regclass, true), c.reloptions
        into v_def, v_opts
        from pg_class c where c.oid = ('public.' || v)::regclass;

      execute format(
        'create or replace view public.%I %s as select v.*, s.language from (%s) v '
        'left join %s s on s.id = v.id',
        v,
        case when v_opts is null then '' else 'with (' || array_to_string(v_opts, ', ') || ')' end,
        rtrim(btrim(v_def), ';'),
        v_src
      );
      raise notice 'vue % : language ajoutee', v;
    else
      raise notice 'vue % : language deja presente, rien a faire', v;
    end if;
  end loop;
end $$;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- RÉCAPITULATIF — chaque ligne affiche ce qu'elle a compté ; un rapport vide ne prouverait rien.
-- Attendu : 6 lignes à OK. La dernière dit « SANS OBJET » sur une base où F-21 n'est pas posé (le DEV).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
select 'colonnes language (posts + comments)' as controle,
       case when count(*) = 2 then 'OK' else 'KO — ' || count(*) || '/2' end as verdict
  from information_schema.columns
 where table_schema='public' and column_name='language' and table_name in ('posts','comments')
union all
select 'triggers de langue',
       case when count(*) = 2 then 'OK' else 'KO — ' || count(*) || '/2' end
  from pg_trigger where tgname in ('posts_set_language','comments_set_language')
union all
select 'table traductions (avec langue_source) + RLS active',
       case when exists (select 1 from pg_tables where schemaname='public' and tablename='traductions'
                         and rowsecurity)
             and exists (select 1 from information_schema.columns where table_schema='public'
                         and table_name='traductions' and column_name='langue_source')
            then 'OK' else 'KO' end
union all
select 'registre de budget + fonction réservée à la service_role',
       case when exists (select 1 from pg_tables where schemaname='public' and tablename='traduction_budget')
             and not has_function_privilege('anon', 'public.traduction_budget_ajouter(numeric, boolean)', 'execute')
             and not has_function_privilege('authenticated', 'public.traduction_budget_ajouter(numeric, boolean)', 'execute')
             and has_function_privilege('service_role', 'public.traduction_budget_ajouter(numeric, boolean)', 'execute')
            then 'OK' else 'KO' end
union all
select 'vues exposant language (4 attendues)',
       case when count(*) = 4 then 'OK' else 'KO — ' || count(*) || '/4' end
  from information_schema.columns
 where table_schema='public' and column_name='language'
   and table_name in ('posts_ranked','posts_feed','posts_feed_with_group','comments_feed')
union all
select 'F-21 : les membres ne peuvent pas écrire language',
       case
         when exists (select 1 from information_schema.table_privileges
                       where table_schema='public' and table_name in ('posts','comments')
                         and grantee='authenticated' and privilege_type in ('INSERT','UPDATE'))
           then 'SANS OBJET — F-21 n''est pas posé sur cette base (attendu sur le DEV)'
         when count(*) = 0 then 'OK — 0 droit'
         else 'KO — ' || count(*) || ' droit(s)'
       end
  from information_schema.column_privileges
 -- Le filtre sur la TABLE manquait au premier passage sur le DEV (15/09) : le contrôle comptait aussi
 -- les 4 vues de lecture et `profiles.language` — que chacun DOIT pouvoir écrire pour sa propre langue
 -- — et affichait « KO — 19 droit(s) » sur une base saine. Seul `authenticated` compte : F-21 porte
 -- sur les membres, les visiteurs n'ont de toute façon aucune policy d'écriture.
 where table_schema='public' and table_name in ('posts','comments') and grantee = 'authenticated'
   and privilege_type in ('INSERT','UPDATE') and column_name = 'language';
