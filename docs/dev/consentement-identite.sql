-- ============================================================================
-- TRACE DU CONSENTEMENT au traitement de l'état civil (prénom, nom, naissance)
--
-- POURQUOI : le RGPD (art. 7 §1) impose de pouvoir DÉMONTRER que le consentement
-- a été donné. La case à cocher de `CompleteProfileScreen` bloque la création du
-- profil, mais elle ne laisse aucune trace : rien en base ne distingue un profil
-- créé avec consentement d'un profil créé sans. Ce script pose cette trace.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ ORDRE DE DÉPLOIEMENT — À NE PAS INVERSER
--   1. ce script (DEV), puis `consentement-identite-test.sql` (DEV)
--   2. ce script (PROD)
--   3. déployer l'app (elle appelle la signature à 8 arguments)
--   4. quand plus personne ne tourne sur l'ancien bundle :
--      `consentement-identite-cloture.sql`, qui retire l'ancienne signature.
-- L'ancienne fonction à 7 arguments est VOLONTAIREMENT laissée en place ici :
-- la PWA est servie depuis un cache, un utilisateur peut encore tourner sur le
-- bundle précédent pendant quelques heures. La retirer tout de suite casserait
-- son inscription. Tant qu'elle existe, elle permet de créer un profil sans
-- trace — d'où l'étape 4, qui n'est pas optionnelle.
--
-- CE QUE CE SCRIPT NE FAIT PAS, ET POURQUOI
-- Aucun rétro-remplissage des profils existants. Poser une date de consentement
-- sur un profil créé avant l'existence de la case, ce serait FABRIQUER UNE
-- PREUVE. Ces lignes restent à NULL, ce qui est la description exacte de la
-- réalité : on ne peut pas démontrer leur consentement. Si tu veux régulariser
-- les comptes de la bêta, c'est en le leur redemandant, pas avec un UPDATE.
-- ============================================================================

begin;

-- ── 0. Garde-fou ────────────────────────────────────────────────────────────
-- `docs/dev/dev-schema.sql` est un dump, et un dump vieillit. Plutôt que de
-- réécrire `create_profile` sur la foi de ce fichier, on compare d'abord à ce
-- que la base contient VRAIMENT. Si ça diffère, on s'arrête et on affiche la
-- vraie définition — à me renvoyer telle quelle.
-- La comparaison écrase les espaces : une réindentation ne doit pas déclencher
-- de fausse alerte, un changement de logique doit en déclencher une.
do $$
declare
  v_src      text;
  v_attendu  constant text :=
    'begin insert into public.profiles (id, pseudo, display_preference, format_favori, frequence_jeu) '
    'values (auth.uid(), p_pseudo, p_display_preference, p_format_favori, p_frequence_jeu); '
    'insert into public.profiles_private (id, prenom, nom, date_naissance) '
    'values (auth.uid(), p_prenom, p_nom, p_date_naissance); end;';
begin
  select p.prosrc into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_profile'
     and pg_get_function_identity_arguments(p.oid) =
         'p_pseudo text, p_display_preference text, p_format_favori text, '
         'p_frequence_jeu text, p_prenom text, p_nom text, p_date_naissance date';

  if v_src is null then
    raise exception
      'ARRET — create_profile(7 arguments) est introuvable sous la signature attendue. '
      'Ne rien appliquer, et me renvoyer ce message.';
  end if;

  if btrim(regexp_replace(v_src, '\s+', ' ', 'g')) is distinct from v_attendu then
    -- Un seul E, sur le PREMIER litteral : la suite d'un littéral collé doit être
    -- un guillemet nu, elle reste en mode échappé. Un E de plus = erreur 42601.
    raise exception E'ARRET — la definition en base differe de celle attendue.\n'
      'Ne pas appliquer a l''aveugle : ce script ecraserait un changement que je ne connais pas.\n'
      'Definition reelle, a me renvoyer telle quelle :\n%', v_src;
  end if;
end $$;

-- ── 1. La colonne ───────────────────────────────────────────────────────────
-- Sur `profiles_private` et non `profiles` : la trace doit vivre à côté des
-- données qu'elle couvre, dans la table qui a déjà les bonnes règles d'accès.
alter table public.profiles_private
  add column if not exists consentement_identite_at timestamptz;

comment on column public.profiles_private.consentement_identite_at is
  'Horodatage du consentement au traitement du prenom, du nom et de la date de naissance '
  '(RGPD art. 7 §1 : pouvoir demontrer que le consentement a ete donne). Pose par create_profile '
  'avec l''horloge du serveur, jamais avec une date fournie par le client. '
  'NULL = profil cree avant la mise en place de la trace. NE JAMAIS RETRO-REMPLIR : '
  'ce serait fabriquer une preuve.';

-- ── 2. Rendre la trace non réinscriptible par son titulaire ─────────────────
-- Sans ça, la trace ne prouve rien : `profiles_private` a GRANT ALL à
-- `authenticated` et une policy « peut modifier ses propres infos privées », donc
-- n'importe qui pourrait effacer ou antidater sa propre date de consentement.
-- Même remède que le lot F-21 sur `posts`/`comments` : des droits par colonne.
-- Les trois colonnes de données restent modifiables, la trace ne l'est pas.
-- (`anon` garde ses droits de table : la policy RLS le bloque de toute façon,
--  et restreindre au-delà du nécessaire n'apporte rien ici.)
revoke update on public.profiles_private from authenticated;
grant  update (prenom, nom, date_naissance) on public.profiles_private to authenticated;

-- ── 3. La nouvelle signature ────────────────────────────────────────────────
-- Un 8e argument SANS valeur par défaut, volontairement : avec un défaut, un
-- appel à 7 arguments deviendrait ambigu entre l'ancienne et la nouvelle
-- fonction, et PostgreSQL refuserait l'appel (« function is not unique »). Sans
-- défaut, les deux signatures cohabitent proprement le temps du déploiement.
create or replace function public.create_profile(
  p_pseudo                 text,
  p_display_preference     text,
  p_format_favori          text,
  p_frequence_jeu          text,
  p_prenom                 text,
  p_nom                    text,
  p_date_naissance         date,
  p_consentement_identite  boolean
) returns void
language plpgsql
set search_path to 'public'
as $$
begin
  -- Le refus se fait AVANT toute écriture : pas de profil sans consentement.
  -- Code d'erreur laissé au défaut (P0001) et non `check_violation` : l'app mappe
  -- déjà 23514 sur « réservé aux personnes majeures », qui n'a rien à voir ici.
  if p_consentement_identite is not true then
    raise exception 'Consentement requis pour le traitement du prenom, du nom et de la date de naissance.';
  end if;

  insert into public.profiles (id, pseudo, display_preference, format_favori, frequence_jeu)
  values (auth.uid(), p_pseudo, p_display_preference, p_format_favori, p_frequence_jeu);

  -- `now()` : l'horodatage vient du serveur. Une date fournie par le client
  -- serait une preuve que le client peut écrire lui-même, donc pas une preuve.
  insert into public.profiles_private (id, prenom, nom, date_naissance, consentement_identite_at)
  values (auth.uid(), p_prenom, p_nom, p_date_naissance, now());
end;
$$;

-- Droits explicites : une fonction fraîchement créée hérite d'EXECUTE pour
-- PUBLIC, ce qui inclurait `anon`. On révoque, puis on accorde à ce qui en a
-- l'usage. `anon` est délibérément écarté — sans session, `auth.uid()` est NULL
-- et l'insertion échouerait sur la clé étrangère : le droit ne servait à rien.
revoke execute on function public.create_profile(text, text, text, text, text, text, date, boolean) from public;
grant  execute on function public.create_profile(text, text, text, text, text, text, date, boolean)
  to authenticated, service_role;

commit;

-- ============================================================================
-- Ce script ne se juge pas lui-même. Pour mesurer ce qu'il a réellement changé :
-- `docs/dev/consentement-identite-test.sql`.
-- ============================================================================
