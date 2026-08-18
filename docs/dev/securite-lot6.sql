-- LOT 6 — F-09 + F-12 + F-13
-- ==========================
--   F-09 : aucune limite de longueur côté base. Les limites de l'interface se contournent en
--          appelant l'API directement — un champ de 10 Mo est accepté.
--   F-12 : les colonnes d'URL acceptent n'importe quelle adresse, y compris un serveur tiers.
--   F-13 : le formulaire public de signalement n'a aucun garde-fou de débit.
--
-- ⚠️ ORDRE : DEV d'abord, PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Script IDEMPOTENT. Ne modifie AUCUNE donnée existante.
--
-- ⚠️ CHOIX IMPORTANT : toutes les contraintes sont posées en `NOT VALID`. Cela signifie qu'elles
-- s'appliquent à TOUTE nouvelle écriture, mais que les lignes déjà en base ne sont pas
-- réexaminées. C'est délibéré : une contrainte classique ferait échouer le script entier si une
-- seule ligne existante ne la respectait pas, en pleine préparation de bêta. Le rapport en fin
-- de fichier liste les lignes existantes non conformes, s'il y en a — on les traitera à part.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-09 — Limites de longueur côté serveur
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : l'interface limite le pseudo à 24 caractères, la description à 600, le nom de
-- groupe à 30. La base, elle, n'impose rien (seules `bio` et `groups.description` ont une
-- contrainte). Or l'interface n'est qu'une suggestion : un appel direct à l'API REST avec la
-- clé publiable contourne tous ces plafonds. Conséquences : une main dont le titre fait 5 Mo
-- casse l'affichage du feed pour TOUS les lecteurs, gonfle la base et le trafic, et il n'existe
-- aucun moyen de s'en défendre a posteriori sans supprimer le contenu.
--
-- Le titre des mains n'avait même AUCUNE limite dans l'interface — c'était le champ le plus
-- exposé. Le lieu, le buy-in, le niveau et la question de sondage non plus.
--
-- Chaque valeur ci-dessous a exactement la même jumelle dans pokza-app/src/constants/limits.ts.
-- Le MÊME nombre des deux côtés, et non une marge en base : le comptage de JavaScript (unités
-- UTF-16) est plus strict que celui de PostgreSQL (points de code) — un emoji vaut 2 côté
-- interface et 1 côté base. La base ne refusera donc jamais ce que l'interface a laissé passer.

-- Valeurs arbitrées par Victor le 2026-08-15. Jumelles de pokza-app/src/constants/limits.ts —
-- les deux fichiers doivent rester alignés.

alter table public.profiles  drop constraint if exists profiles_pseudo_length;
alter table public.profiles  add  constraint profiles_pseudo_length
  check (char_length(pseudo) between 1 and 24) not valid;

alter table public.posts     drop constraint if exists posts_title_length;
alter table public.posts     add  constraint posts_title_length
  check (char_length(title) between 1 and 40) not valid;  -- 80 -> 40 le 2026-08-18, cf. titre-40-caracteres.sql

alter table public.posts     drop constraint if exists posts_description_length;
alter table public.posts     add  constraint posts_description_length
  check (description is null or char_length(description) <= 600) not valid;

-- Lieu, buy-in et niveau s'affichent côte à côte sur une seule ligne sous le titre.
-- Le niveau STOCKÉ est « Niveau 12 », pas le seul nombre : 7 caractères de préfixe + 3 chiffres,
-- le niveau ne dépassant jamais 999 en tournoi.
alter table public.posts     drop constraint if exists posts_context_length;
alter table public.posts     add  constraint posts_context_length
  check (
        (location is null or char_length(location) <= 40)
    and (buy_in   is null or char_length(buy_in)   <= 16)
    and (level    is null or char_length(level)    <= 10)
  ) not valid;

alter table public.posts     drop constraint if exists posts_vote_question_length;
alter table public.posts     add  constraint posts_vote_question_length
  check (vote_question is null or char_length(vote_question) <= 80) not valid;

-- Le vote mérite mieux qu'une limite de longueur : sa structure elle-même doit tenir. Sans ça,
-- `vote_options` accepte un objet, un nombre, ou un tableau de 10 000 entrées — et la vue du
-- feed les agrège toutes pour les afficher à tout le monde.
--
-- POURQUOI UNE FONCTION plutôt qu'un CHECK direct : PostgreSQL interdit les sous-requêtes dans
-- une contrainte CHECK, et parcourir les éléments d'un tableau JSON en demande une. Passer par
-- une fonction est le seul moyen de garder cette vérification. Elle est `immutable` et ne lit
-- aucune table — elle ne dépend que de la valeur qu'on lui passe, ce qui est la condition pour
-- pouvoir l'utiliser dans une contrainte.
create or replace function public.vote_options_valid(v jsonb)
returns boolean
language sql
immutable
set search_path = public, private
as $$
  select v is null
      or (
        jsonb_typeof(v) = 'array'
        and jsonb_array_length(v) between 2 and 4
        and not exists (
          select 1 from jsonb_array_elements(v) e
          where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 20
        )
      );
$$;

alter table public.posts     drop constraint if exists posts_vote_options_shape;
alter table public.posts     add  constraint posts_vote_options_shape
  check (public.vote_options_valid(vote_options)) not valid;

alter table public.comments  drop constraint if exists comments_body_length;
alter table public.comments  add  constraint comments_body_length
  check (body is null or char_length(body) <= 1000) not valid;

alter table public.groups    drop constraint if exists groups_name_length;
alter table public.groups    add  constraint groups_name_length
  check (char_length(name) between 1 and 30) not valid;

alter table public.reports   drop constraint if exists reports_details_length;
alter table public.reports   add  constraint reports_details_length
  check (details is null or char_length(details) <= 500) not valid;

-- 254 = longueur maximale d'une adresse e-mail (RFC 5321). Contrainte technique, pas produit.
alter table public.reports   drop constraint if exists reports_email_length;
alter table public.reports   add  constraint reports_email_length
  check (reporter_email is null or char_length(reporter_email) <= 254) not valid;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-12 — Domaines autorisés pour les URL stockées
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : `avatar_url` est une colonne de texte libre que le compte écrit lui-même. Rien
-- n'oblige à y mettre une adresse de ton stockage. On peut y mettre l'adresse d'un serveur
-- qu'on contrôle — et cette adresse est ensuite chargée par le navigateur de CHAQUE personne
-- qui croise ce profil dans le feed. Résultat : le propriétaire du serveur reçoit l'adresse IP,
-- l'heure et le navigateur de tous tes utilisateurs, sans qu'aucun d'eux ne l'ait choisi. Il
-- peut aussi changer l'image à volonté après coup — y compris pour un contenu choquant, sans
-- que rien ne transite par ta modération.
--
-- Le motif accepte n'importe quel projet Supabase plutôt qu'un identifiant en dur : le même
-- script vaut ainsi pour DEV et pour la PROD.

alter table public.profiles drop constraint if exists profiles_avatar_url_domain;
alter table public.profiles add  constraint profiles_avatar_url_domain
  check (
    avatar_url is null
    or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
  ) not valid;

alter table public.groups   drop constraint if exists groups_avatar_url_domain;
alter table public.groups   add  constraint groups_avatar_url_domain
  check (
    avatar_url is null
    or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/group-avatars/'
  ) not valid;

-- Les GIF viennent de Giphy et de nulle part ailleurs.
alter table public.comments drop constraint if exists comments_gif_url_domain;
alter table public.comments add  constraint comments_gif_url_domain
  check (gif_url is null or gif_url ~ '^https://[a-z0-9.-]+\.giphy\.com/') not valid;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-13 — Débit du formulaire public de signalement
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : les deux garde-fous existants (30 signalements / 24 h, et l'index anti-doublon)
-- sont tous les deux conditionnés à `reporter_id is not null`. Or le formulaire public insère
-- avec `reporter_id = null` — il échappe donc aux deux. N'importe qui peut, sans compte,
-- inonder la file de modération et noyer les vrais signalements.
--
-- On ajoute deux plafonds horaires, en conservant la fonction existante à l'identique pour la
-- partie qui marche déjà :
--   • par CIBLE : empêche l'acharnement sur une personne, qui est l'abus le plus nuisible ;
--   • GLOBAL : empêche le noyage de la file.
--
-- ⚠️ COMPROMIS ASSUMÉ : le plafond global est, par nature, un levier de blocage — quelqu'un qui
-- le sature empêche les signalements publics légitimes pendant l'heure en cours. C'est pour ça
-- qu'il est fixé haut (60/h, soit un signalement par minute sans compte). Le faire dépendre de
-- l'adresse IP serait mieux, mais la base ne la voit pas : il faudrait la faire remonter par
-- l'Edge Function. À reconsidérer si le formulaire public est réellement attaqué un jour.

create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  -- Inchangé : plafond par compte connecté.
  if new.reporter_id is not null and (
    select count(*) from public.reports r
    where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours'
  ) >= 30 then
    raise exception 'Trop de signalements en 24h. Réessaie plus tard.';
  end if;

  -- Nouveau : plafonds du formulaire public, qui n'a pas de compte à qui s'en prendre.
  if new.reporter_id is null then
    if (
      select count(*) from public.reports r
      where r.reporter_id is null
        and r.target_type = new.target_type
        and r.target_id   = new.target_id
        and r.created_at  > now() - interval '1 hour'
    ) >= 5 then
      raise exception 'Ce contenu a déjà été signalé plusieurs fois récemment. Il est en cours d''examen.';
    end if;

    if (
      select count(*) from public.reports r
      where r.reporter_id is null and r.created_at > now() - interval '1 hour'
    ) >= 60 then
      raise exception 'Trop de signalements en cours de traitement. Réessaie dans un moment.';
    end if;
  end if;

  if new.reason = 'compte_mineur' then          -- 7.2 : compte mineur => revue prioritaire
    new.severity := 'priority';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reports_before_insert on public.reports;
create trigger trg_reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION + inventaire des lignes existantes non conformes
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Les contraintes étant en `NOT VALID`, elles ne s'appliquent qu'aux nouvelles écritures.
-- Ce rapport dit s'il reste des lignes anciennes à corriger. Un `0` partout signifie qu'on peut
-- les passer en contraintes pleines (bloc facultatif en fin de fichier).

select 'Contraintes F-09 + F-12 posees' as controle,
       case when count(*) = 13 then 'OK — 13' else 'INCOMPLET : ' || count(*)::text || '/13' end as resultat
from pg_constraint
where conname in ('profiles_pseudo_length','posts_title_length','posts_description_length',
                  'posts_context_length','posts_vote_question_length','posts_vote_options_shape',
                  'comments_body_length','groups_name_length','reports_details_length',
                  'reports_email_length','profiles_avatar_url_domain','groups_avatar_url_domain',
                  'comments_gif_url_domain')
union all
select 'F-13 plafonds du formulaire public actifs',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'reports_before_insert'
                    and p.prosrc like '%reporter_id is null%') = 1
            then 'OK' else '*** ECHEC ***' end
union all
select 'Anciens pseudos trop longs',      count(*)::text from public.profiles where char_length(pseudo) > 24
union all
select 'Anciens titres trop longs',       count(*)::text from public.posts    where char_length(title) > 40
union all
select 'Anciennes descriptions trop longues', count(*)::text from public.posts where char_length(coalesce(description,'')) > 600
union all
select 'Anciens commentaires trop longs', count(*)::text from public.comments where char_length(coalesce(body,'')) > 1000
union all
select 'Anciens champs de contexte trop longs', count(*)::text from public.posts
  where char_length(coalesce(location,'')) > 40
     or char_length(coalesce(buy_in,''))   > 16
     or char_length(coalesce(level,''))    > 10
union all
select 'Anciennes questions de sondage trop longues', count(*)::text from public.posts
  where char_length(coalesce(vote_question,'')) > 80
union all
select 'Anciens noms de groupe trop longs', count(*)::text from public.groups
  where char_length(name) > 30
union all
select 'Avatars hors du stockage Pokza',  count(*)::text from public.profiles
  where avatar_url is not null
    and avatar_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
union all
select 'Photos de groupe hors du stockage Pokza', count(*)::text from public.groups
  where avatar_url is not null
    and avatar_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/group-avatars/'
union all
select 'GIF hors de Giphy',               count(*)::text from public.comments
  where gif_url is not null and gif_url !~ '^https://[a-z0-9.-]+\.giphy\.com/'
union all
select 'Sondages de forme invalide',      count(*)::text from public.posts
  where vote_options is not null
    and (jsonb_typeof(vote_options) <> 'array'
         or jsonb_array_length(vote_options) not between 2 and 4);


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- FACULTATIF — passer les contraintes en validation pleine
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- À n'exécuter QUE si toutes les lignes d'inventaire ci-dessus valent 0.
-- begin;
--   alter table public.profiles validate constraint profiles_pseudo_length;
--   alter table public.profiles validate constraint profiles_avatar_url_domain;
--   alter table public.posts    validate constraint posts_title_length;
--   alter table public.posts    validate constraint posts_description_length;
--   alter table public.posts    validate constraint posts_context_length;
--   alter table public.posts    validate constraint posts_vote_question_length;
--   alter table public.posts    validate constraint posts_vote_options_shape;
--   alter table public.comments validate constraint comments_body_length;
--   alter table public.comments validate constraint comments_gif_url_domain;
--   alter table public.groups   validate constraint groups_name_length;
--   alter table public.groups   validate constraint groups_avatar_url_domain;
--   alter table public.reports  validate constraint reports_details_length;
--   alter table public.reports  validate constraint reports_email_length;
-- commit;
