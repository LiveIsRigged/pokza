-- CORRECTIF DE RÉGRESSION — les RPC d'administration sont cassées depuis le lot 1
-- =============================================================================================
-- CE QUI S'EST PASSÉ
-- Le lot 1 (F-06) a déplacé quatre helpers de modération du schéma `public` vers `private`, pour
-- les soustraire à l'API REST. Trois d'entre eux ne sont appelés que depuis des policies — et
-- une policy mémorise la fonction par son identifiant interne (OID), pas par son nom : le
-- déplacement ne les a donc pas affectées.
--
-- Mais `is_admin` est appelée autrement : depuis le CORPS d'une dizaine de fonctions
-- d'administration, écrite en toutes lettres `public.is_admin()`. Un corps de fonction résout
-- les noms à l'exécution. Résultat, en production :
--
--     POST /rest/v1/rpc/admin_list_reports
--     → {"code":"42883","message":"function public.is_admin() does not exist"}
--
-- Piège aggravant : `is_admin` est déclarée `is_admin(p_user uuid default auth.uid())`. Comme le
-- paramètre a une valeur par défaut, `is_admin()` et `is_admin(uuid)` désignent LA MÊME fonction.
-- Déplacer « la version à un argument » a donc aussi emporté la version sans argument.
--
-- CE QUI ÉTAIT CASSÉ : lister les signalements, sanctionner, lever une sanction, masquer un
-- contenu, résoudre un signalement — tout le back-office de modération.
-- CE QUI NE L'ÉTAIT PAS : absolument rien côté utilisateur.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LE CORRECTIF
-- On remet dans `public` quatre fonctions-relais qui ne font que déléguer à `private`. Tous les
-- appels existants repartent, sans toucher au corps d'une seule fonction d'administration.
--
-- Et F-06 reste fermé, parce que c'est le DROIT D'EXÉCUTION qui compte, pas le schéma : les
-- relais sont révoqués pour `anon` et `authenticated`, donc PostgREST répond 403 à qui tente de
-- les appeler en RPC. Les fonctions `admin_*`, elles, sont SECURITY DEFINER et s'exécutent avec
-- les droits de leur propriétaire — elles continuent donc de les appeler sans difficulté.
--
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- ATTENDU : 6 lignes, toutes en OK. La ligne 5 est la preuve fonctionnelle — elle appelle une
-- vraie RPC d'administration en se faisant passer pour un utilisateur ordinaire.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Les quatre relais. `security invoker` : ils ne font que rappeler la fonction privée, qui est
-- elle-même SECURITY DEFINER et porte donc déjà le contournement de RLS nécessaire. Ajouter un
-- second `definer` ici n'apporterait rien et empilerait deux élévations de privilèges.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security invoker
set search_path = public, private as $$
  select private.is_admin(p_user);
$$;

create or replace function public.is_banned(p_user uuid default auth.uid())
returns boolean language sql stable security invoker
set search_path = public, private as $$
  select private.is_banned(p_user);
$$;

create or replace function public.is_sanctioned(p_user uuid default auth.uid())
returns boolean language sql stable security invoker
set search_path = public, private as $$
  select private.is_sanctioned(p_user);
$$;

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean language sql stable security invoker
set search_path = public, private as $$
  select private.is_blocked_pair(p_a, p_b);
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- F-06 — c'est CETTE section qui referme la faille, pas l'emplacement des fonctions.
-- Sans elle, on aurait rétabli l'oracle exactement comme avant l'audit.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
revoke all on function public.is_admin(uuid)                from public, anon, authenticated;
revoke all on function public.is_banned(uuid)               from public, anon, authenticated;
revoke all on function public.is_sanctioned(uuid)           from public, anon, authenticated;
revoke all on function public.is_blocked_pair(uuid,uuid)    from public, anon, authenticated;

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
  v_msg   text;
begin
  -- 1. Les quatre relais existent bien dans public.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_admin','is_banned','is_sanctioned','is_blocked_pair');
  insert into _res values (1, 'Les 4 relais sont presents dans public',
    case when v_n = 4 then 'OK — 4/4' else '*** ECHEC : ' || v_n || '/4 ***' end);

  -- 2. Les originaux sont toujours dans private (le lot 1 n'est pas défait).
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('is_admin','is_banned','is_sanctioned','is_blocked_pair');
  insert into _res values (2, 'Les 4 originaux restent dans private',
    case when v_n = 4 then 'OK — 4/4' else '*** ECHEC : ' || v_n || '/4 ***' end);

  -- 3. F-06 — aucun relais n'est appelable en RPC par le client. C'est LE contrôle qui compte.
  select count(*) into v_n
  from unnest(array['public.is_admin(uuid)','public.is_banned(uuid)',
                    'public.is_sanctioned(uuid)','public.is_blocked_pair(uuid,uuid)']) f
  cross join unnest(array['anon','authenticated']) as g(role_name)
  where has_function_privilege(g.role_name, to_regprocedure(f)::oid, 'execute');
  insert into _res values (3, 'F-06 aucun relais executable par anon/authenticated',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' acces ouvert(s) ***' end);

  -- 4. Non-régression : les policies s'appuient sur les versions privées, qui doivent rester
  --    exécutables — sinon le feed devient illisible.
  select count(*) into v_n
  from unnest(array['private.is_banned(uuid)','private.is_sanctioned(uuid)',
                    'private.is_blocked_pair(uuid,uuid)']) f
  where not has_function_privilege('authenticated', to_regprocedure(f)::oid, 'execute');
  insert into _res values (4, 'Les 3 helpers des policies restent executables',
    case when v_n = 0 then 'OK — 3/3' else '*** ECHEC : ' || v_n || ' revoque(s) ***' end);

  -- 5. LA PREUVE FONCTIONNELLE. On se fait passer pour un utilisateur ordinaire et on appelle
  --    une vraie RPC d'administration. Le refus attendu est « Réservé aux administrateurs ».
  --    Si le message parle de fonction inexistante, la régression est toujours là.
  -- Il faut un compte NON administrateur : le plus ancien profil est probablement le tien, donc
  -- admin, et l'appel serait alors légitimement accepté — le test crierait à l'échec à tort.
  select p.id into v_user
  from public.profiles p
  where not exists (select 1 from public.admins a where a.user_id = p.id)
  order by p.created_at limit 1;
  if v_user is null then
    insert into _res values (5, 'Preuve fonctionnelle : appel d une RPC admin',
      'NON TESTABLE — aucun compte non-administrateur dans cet environnement');
  else
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
      set role authenticated;
      begin
        -- `perform * from` et non `perform f()` : la fonction renvoie une table.
        perform * from public.admin_list_reports();
        v_msg := '*** ECHEC : un utilisateur ordinaire a ete accepte ***';
      exception when others then
        v_msg := sqlerrm;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', false);

      insert into _res values (5, 'Preuve fonctionnelle : appel d une RPC admin',
        case when v_msg like '%does not exist%' or v_msg like '%n''existe pas%'
               then '*** ECHEC : la regression est toujours la — ' || v_msg || ' ***'
             when v_msg like '%dministrateur%'
               then 'OK — refus correct : ' || v_msg
             else 'A LIRE : ' || v_msg end);
    exception when others then
      reset role;
      perform set_config('request.jwt.claims', '', false);
      insert into _res values (5, 'Preuve fonctionnelle : appel d une RPC admin',
        '*** ERREUR DU TEST *** ' || sqlerrm);
    end;
  end if;

  -- 6. Aucune fonction d'administration ne doit plus référencer un helper introuvable.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.proname like 'admin\_%'
    and pg_get_functiondef(p.oid) like '%public.is_admin()%'
    and to_regprocedure('public.is_admin(uuid)') is null;
  insert into _res values (6, 'Fonctions admin pointant vers un helper absent',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' ***' end);
end;
$$;

select controle, resultat from _res order by n;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à ne lancer que si ce correctif pose problème)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--   drop function if exists public.is_admin(uuid);
--   drop function if exists public.is_banned(uuid);
--   drop function if exists public.is_sanctioned(uuid);
--   drop function if exists public.is_blocked_pair(uuid,uuid);
-- ⚠️ Ce retour arrière RECASSE le back-office de modération. Il n'a de sens que si les relais
-- provoquaient un problème pire, ce qui n'est pas envisagé aujourd'hui.
