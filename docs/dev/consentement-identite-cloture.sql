-- ============================================================================
-- CLÔTURE de la trace du consentement — neutralise l'ancienne signature.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- À LANCER une fois l'app appelant la signature à 8 arguments déployée
-- (fait le 22/08/2026, commit `dbba437`, vérifié dans le bundle servi).
--
-- POURQUOI CE N'EST PAS OPTIONNEL : tant que la fonction à 7 arguments crée
-- vraiment un profil, n'importe quel client peut en créer un SANS consentement
-- et SANS trace. Toute la mesure posée par `consentement-identite.sql` est
-- contournable jusqu'à ce que ce script tourne.
--
-- ⚠️ POURQUOI ON NE LA SUPPRIME PAS, ALORS QUE C'ÉTAIT LE PLAN INITIAL
-- La PWA est servie depuis un cache. Quelqu'un qui a ouvert pokza.app AVANT le
-- déploiement garde l'ancien bundle, qui appelle la signature à 7 arguments.
-- S'il s'inscrit dans cet état :
--   • fonction SUPPRIMÉE  → PostgREST répond « Could not find the function
--     public.create_profile(...) in the schema cache », en anglais. L'ancien
--     bundle affiche ce message tel quel (`setError(rpcError.message)`), et
--     l'utilisateur reste bloqué sans savoir quoi faire. On ne peut RIEN y
--     faire côté app : son bundle est l'ancien code, une amélioration de
--     l'affichage ne l'atteindrait jamais.
--   • fonction VIDÉE, comme ici → elle échoue volontairement avec un message
--     en français, que ce même ancien bundle affiche tel quel. L'utilisateur
--     sait quoi faire, et aucun profil n'est créé sans trace.
-- La deuxième option ferme le trou de conformité ET donne une issue à
-- l'utilisateur, en se servant du chemin d'erreur que l'ancien code possède
-- déjà. C'est la seule qui tient les deux bouts.
--
-- Le corps est remplacé, pas la signature : `create or replace` conserve les
-- droits déjà accordés, rien à re-`grant`.
-- ============================================================================

begin;

-- Refuse d'agir si la nouvelle signature n'est pas là : sinon on casse la
-- création de profil pour TOUT LE MONDE au lieu de la durcir.
do $$
declare v_n integer;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_profile'
     and pg_get_function_identity_arguments(p.oid) like '%boolean';

  if v_n = 0 then
    raise exception
      'ARRET — la signature a 8 arguments est absente. '
      'Lancer consentement-identite.sql d''abord : neutraliser l''ancienne maintenant '
      'casserait la creation de profil pour tout le monde.';
  end if;
end $$;

-- Le message est lu par un utilisateur, dans l'ancienne interface. Il doit donc
-- être en français, sans jargon, et dire quoi faire — pas décrire la panne.
create or replace function public.create_profile(
  p_pseudo              text,
  p_display_preference  text,
  p_format_favori       text,
  p_frequence_jeu       text,
  p_prenom              text,
  p_nom                 text,
  p_date_naissance      date
) returns void
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'Pokza a ete mis a jour. Ferme completement l''application puis rouvre-la pour creer ton profil.';
end;
$$;

comment on function public.create_profile(text, text, text, text, text, text, date) is
  'NEUTRALISEE le 22/08/2026. Ancienne signature, sans consentement ni trace : elle creait un '
  'profil en violation de l''art. 7 du RGPD. Conservee vide plutot que supprimee pour que les '
  'clients servis depuis un cache perime recoivent un message en francais au lieu de l''erreur '
  '« function not found » de PostgREST. Supprimable quand plus aucun bundle d''avant le 22/08/2026 '
  'ne peut raisonnablement circuler : '
  'drop function public.create_profile(text, text, text, text, text, text, date);';

commit;

-- ── Contrôle ────────────────────────────────────────────────────────────────
-- Deux lignes attendues : celle en `boolean` = active, l'autre = neutralisée.
select
  case when pg_get_function_identity_arguments(p.oid) like '%boolean'
       then 'ACTIVE — cree le profil et pose la trace'
       else 'NEUTRALISEE — renvoie le message de mise a jour'
  end                                             as etat,
  pg_get_function_identity_arguments(p.oid)       as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_profile'
order by etat;
