-- ============================================================================
-- CLÔTURE de la trace du consentement — retire l'ancienne signature.
--
-- À LANCER APRÈS, ET SEULEMENT APRÈS, que l'app appelant la signature à 8
-- arguments soit déployée ET que plus personne ne tourne sur l'ancien bundle.
-- La PWA est servie depuis un cache : compte quelques heures, et vérifie que le
-- bundle en ligne contient bien `p_consentement_identite` (cf. la méthode de
-- vérification de déploiement dans les notes projet).
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- POURQUOI CE SCRIPT N'EST PAS OPTIONNEL : tant que la fonction à 7 arguments
-- existe, n'importe quel client peut créer un profil SANS consentement et SANS
-- trace, en l'appelant directement. Toute la mesure posée par
-- `consentement-identite.sql` est contournable jusqu'à ce que cette ligne
-- tourne.
--
-- Si tu la lances trop tôt, l'effet est visible et réversible : les
-- utilisateurs encore sur l'ancien bundle voient « Could not find the function »
-- au moment de valider leur profil. Le remède est de rejouer la section 3 de
-- `consentement-identite.sql` pour recréer l'ancienne signature, puis
-- d'attendre.
-- ============================================================================

begin;

-- Refuse de retirer l'ancienne si la nouvelle n'est pas là : sinon on casse
-- l'inscription pour tout le monde au lieu de la durcir.
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
      'Lancer consentement-identite.sql d''abord : retirer l''ancienne maintenant '
      'casserait la creation de profil pour tout le monde.';
  end if;
end $$;

drop function if exists public.create_profile(text, text, text, text, text, text, date);

commit;

-- Doit renvoyer une seule ligne, celle qui se termine par « boolean ».
select pg_get_function_identity_arguments(p.oid) as signature_restante
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'create_profile';
