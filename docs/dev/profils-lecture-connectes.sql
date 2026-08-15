-- RÉSERVER LA LECTURE DES PROFILS AUX COMPTES CONNECTÉS — la moitié oubliée de F-08
-- =============================================================================================
-- CE QU'ON CORRIGE
-- L'audit du 14/08 relevait « profiles intégralement énumérable sans compte » (F-08). Le lot 5 a
-- restreint les COLONNES — `age_confirmed` est sorti de la vue publique — mais n'a jamais touché
-- aux LIGNES. La moitié « énumérable » du constat est restée ouverte, et vérifiée le 15/08 :
--
--     GET /rest/v1/profiles?select=id,pseudo,country   (sans aucun compte)
--     → [{"pseudo":"Louis_le_goat"}, {"pseudo":"Spac3L00rd"},
--        {"pseudo":"pokza_founder","country":"FR"}, {"pseudo":"oui oui","country":"AL"}]
--
-- Toute la base d'utilisateurs est donc aspirable en une requête, par n'importe qui. Aujourd'hui
-- quatre personnes ; après la bêta, la liste complète des membres avec pseudos, pays et bios.
-- Ce n'est pas une prise de contrôle de compte et rien de sensible ne fuit — mais c'est de la
-- donnée personnelle exposée sans nécessité, ce que le RGPD n'apprécie pas.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- COMMENT
-- On retire à `anon` — le rôle du visiteur SANS session — le droit de lire les colonnes de
-- `profiles`. `authenticated` garde tout : entre membres, se voir est le produit lui-même.
--
-- On agit sur les DROITS et non sur les policies, pour la raison apprise à nos dépens le 15/08
-- avec `is_admin` : les droits sont le vrai verrou, et ils ne dépendent d'aucune expression qui
-- pourrait être contournée ou mal résolue.
--
-- ⚠️ POURQUOI ÇA NE DEVRAIT RIEN CASSER : Pokza est entièrement derrière une connexion — aucun
-- écran ne s'affiche sans compte. Le formulaire public de signalement, lui, est servi par une
-- fonction serveur qui utilise le rôle de service : il n'est pas concerné.
-- La vérification en fin de script le mesure au lieu de le supposer.
--
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- ATTENDU : 5 lignes, toutes en OK.

begin;

-- `revoke select on table … from anon` ne suffirait pas : il ne retire que le droit posé au
-- niveau de la TABLE, et le lot 5 les a posés COLONNE PAR COLONNE. Il faut donc les nommer.
revoke select (
  id,
  pseudo,
  avatar_url,
  display_preference,
  format_favori,
  variante_favorite,
  frequence_jeu,
  bio,
  country,
  created_at
) on table public.profiles from anon;

-- Ceinture et bretelles : retire aussi un éventuel droit au niveau table, s'il en restait un.
revoke select on table public.profiles from anon;

commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════════════════
drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  v_n     bigint;
  v_user  uuid;
  v_lines text[] := '{}';
begin
  -- 1. `anon` ne doit plus pouvoir lire la moindre colonne.
  select count(*) into v_n
  from unnest(array['id','pseudo','avatar_url','display_preference','format_favori',
                    'variante_favorite','frequence_jeu','bio','country','created_at']) col
  where has_column_privilege('anon', 'public.profiles', col, 'select');
  insert into _res values (1, 'anon ne lit plus aucune colonne de profiles',
    case when v_n = 0 then 'OK — 0/10'
         else '*** ECHEC : ' || v_n || ' colonne(s) encore lisibles ***' end);

  -- 2. NON-RÉGRESSION : `authenticated` doit tout garder. Une seule colonne perdue et l app
  --    affiche des profils vides sans dire pourquoi.
  select count(*) into v_n
  from unnest(array['id','pseudo','avatar_url','display_preference','format_favori',
                    'variante_favorite','frequence_jeu','bio','country','created_at']) col
  where not has_column_privilege('authenticated', 'public.profiles', col, 'select');
  insert into _res values (2, 'authenticated garde les 10 colonnes',
    case when v_n = 0 then 'OK — 10/10'
         else '*** ECHEC : ' || v_n || ' colonne(s) perdues — profils vides dans l app ***' end);

  -- 3. `age_confirmed` reste illisible pour tous (acquis du lot 5, on ne le reperd pas).
  insert into _res values (3, 'age_confirmed toujours illisible',
    case when has_column_privilege('authenticated', 'public.profiles', 'age_confirmed', 'select')
           or has_column_privilege('anon', 'public.profiles', 'age_confirmed', 'select')
         then '*** ECHEC : redevenue lisible ***' else 'OK' end);

  select id into v_user from public.profiles order by created_at limit 1;

  -- 4. Preuve réelle côté visiteur SANS compte : la lecture doit être refusée.
  begin
    set role anon;
    begin
      perform 1 from public.profiles limit 1;
      v_lines := v_lines || '4|Un visiteur sans compte lit les profils|*** ECHEC : lecture acceptee ***'::text;
    exception when others then
      v_lines := v_lines || '4|Un visiteur sans compte lit les profils|OK — refuse'::text;
    end;
    reset role;
  exception when others then
    reset role;
    v_lines := v_lines || format('4|Un visiteur sans compte lit les profils|*** ERREUR DU TEST *** %s', sqlerrm);
  end;

  -- 5. Preuve réelle côté membre connecté : la lecture doit continuer de marcher.
  if v_user is null then
    v_lines := v_lines || '5|Un membre connecte lit les profils|NON TESTABLE — aucun profil'::text;
  else
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
      set role authenticated;
      begin
        select count(*) into v_n from public.profiles;
        v_lines := v_lines || format('5|Un membre connecte lit les profils|%s',
          case when v_n > 0 then 'OK — ' || v_n || ' profil(s) visibles'
               else '*** ECHEC : plus aucun profil visible ***' end);
      exception when others then
        v_lines := v_lines || format('5|Un membre connecte lit les profils|*** ECHEC *** %s',
                                     replace(sqlerrm, '|', '/'));
      end;
      reset role;
      perform set_config('request.jwt.claims', '', false);
    exception when others then
      reset role;
      perform set_config('request.jwt.claims', '', false);
      v_lines := v_lines || format('5|Un membre connecte lit les profils|*** ERREUR DU TEST *** %s', sqlerrm);
    end;
  end if;

  -- Les constats pris pendant l'impersonation ne peuvent être écrits qu'une fois revenu postgres.
  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;
end;
$$;

select string_agg(
         lpad(n::text, 2, ' ') || '  ' || rpad(controle, 48) || '  ' || resultat,
         chr(10) order by n
       ) as rapport
from _res;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (si quelque chose d'inattendu cassait côté visiteur non connecté)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   grant select (id, pseudo, avatar_url, display_preference, format_favori,
--                 variante_favorite, frequence_jeu, bio, country, created_at)
--     on table public.profiles to anon;
-- ⚠️ Ne JAMAIS faire `grant select on table public.profiles to anon` sans liste de colonnes :
-- ça rouvrirait `age_confirmed`, le verrou de modération fermé au lot 5.
