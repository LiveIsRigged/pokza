-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LA LANGUE DU DESTINATAIRE — pour que les notifications push cessent d'être en français
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- LE PROBLÈME. Depuis la traduction de l'interface, l'historique in-app suit la langue choisie
-- mais le PUSH reste en français : il est fabriqué côté serveur, par une Edge Function qui ne
-- reçoit que la ligne de `notifications` et n'a aucun moyen de savoir ce que lit le destinataire.
--
-- CE QU'ON STOCKE : la langue RÉSOLUE (ce que la personne voit à l'écran), pas sa préférence.
-- « Suivre l'appareil » ne veut rien dire ici — le serveur n'a jamais vu son téléphone. L'app
-- réécrit la colonne à chaque ouverture et à chaque changement de langue, donc changer la langue
-- du téléphone se répercute tout seul au lancement suivant.
--
-- CE QU'ON NE STOCKE PAS : une contrainte sur les valeurs possibles. Servir une langue de plus ne
-- doit pas demander une migration — la fonction retombe sur l'anglais pour tout code qu'elle ne
-- connaît pas, exactement comme l'app. Seule la longueur est bornée.
--
-- À passer dans l'éditeur SQL de Supabase :
--   DEV  → https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD → https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ APRÈS ce script, redéployer la fonction, sinon elle lira une colonne qu'elle n'utilise pas :
--   supabase functions deploy send-push --no-verify-jwt --project-ref <REF>

begin;

alter table public.profiles
  add column if not exists language text;

-- 16 caractères : « pt-BR » en fait 5, aucun code BCP 47 réaliste n'approche cette borne. Elle
-- n'est pas là contre un utilisateur malveillant — la valeur ne sert qu'à chercher une clé dans un
-- objet, avec repli — mais contre le stockage d'un mégaoctet dans une colonne qui n'en a pas besoin.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_language_court'
  ) then
    alter table public.profiles
      add constraint profiles_language_court
      check (language is null or char_length(language) <= 16);
  end if;
end $$;

-- ⚠️ LES DROITS SUR `profiles` SONT PAR COLONNE (cf. `securite-lot1.sql`, lot F-21). Sans cette
-- ligne, l'app écrirait dans le vide : l'`update` partirait, PostgREST le refuserait, et la seule
-- trace serait un avertissement dans la console. Le commentaire du script d'origine l'avait prévu :
-- « il suffirait d'ajouter la colonne à la liste ».
grant update (language) on table public.profiles to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS — le script échoue bruyamment plutôt que de laisser croire qu'il est passé
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_colonne boolean;
  v_droit   boolean;
  v_check   boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'language'
  ) into v_colonne;
  if not v_colonne then
    raise exception '*** ÉCHEC : la colonne profiles.language n''existe pas ***';
  end if;

  select exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'language' and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) into v_droit;
  if not v_droit then
    raise exception '*** ÉCHEC : authenticated ne peut pas écrire profiles.language — l''app écrirait dans le vide ***';
  end if;

  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_language_court'
  ) into v_check;
  if not v_check then
    raise exception '*** ÉCHEC : la contrainte de longueur est absente ***';
  end if;

  raise notice 'OK — profiles.language existe, est inscriptible par authenticated, et est bornée.';
  raise notice 'Reste à redéployer : supabase functions deploy send-push --no-verify-jwt --project-ref <REF>';
end $$;

-- Combien de profils ont déjà une langue (0 au premier passage, c'est normal — l'app la pose à la
-- prochaine ouverture de chacun).
select
  coalesce(language, '(pas encore posée)') as langue,
  count(*)                                 as profils
from public.profiles
group by 1
order by 2 desc;
