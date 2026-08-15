-- LOT 1 — F-06 + F-03 + F-04
-- ==========================
-- Trois correctifs indépendants, regroupés parce qu'ils touchent tous aux droits d'écriture
-- et de lecture des rôles `anon` / `authenticated`.
--
--   F-06 : les 4 fonctions de modération sont appelables en RPC par n'importe qui → oracles.
--   F-03 : rien n'empêche de publier une main dans un groupe privé dont on n'est pas membre.
--   F-04 : `age_confirmed` a été greffée sur `profiles`, qui avait déjà GRANT ALL → un compte
--          soupçonné mineur peut lever lui-même le verrou posé par la modération.
--
-- ⚠️ ORDRE OBLIGATOIRE : DEV d'abord, vérifier que l'app fonctionne, PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Script IDEMPOTENT : relançable sans dommage. Ne touche à AUCUNE donnée.
-- Bloc de retour arrière en fin de fichier (commenté).

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-06 — Soustraire les fonctions de modération à l'API REST
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : `is_admin`, `is_banned`, `is_sanctioned` et `is_blocked_pair` vivent dans le
-- schéma `public`, que PostgREST expose. Elles sont donc appelables directement :
--     POST /rest/v1/rpc/is_banned  {"p_user": "<uuid quelconque>"}
-- avec la clé publiable, sans compte. Elles répondent sur N'IMPORTE QUEL utilisateur, ce qui
-- transforme la modération en service de renseignement : qui est admin, qui est sanctionné,
-- qui a bloqué qui.
--
-- POURQUOI ON NE PEUT PAS SIMPLEMENT RÉVOQUER `execute` : trois de ces fonctions sont
-- appelées DANS les policies RLS de `posts`, `comments`, `friend_requests`, `notifications`
-- et `reports`. Une expression de policy s'évalue avec les droits du rôle qui interroge :
-- retirer `execute` à `authenticated` ferait échouer l'évaluation, et donc rendrait le feed
-- entier illisible. Le correctif est de les DÉPLACER dans un schéma que PostgREST n'expose
-- pas, tout en gardant le droit d'exécution.
--
-- POINT TECHNIQUE : une policy mémorise la fonction par son OID, pas par son nom. Déplacer
-- la fonction ne casse donc AUCUNE policy, et il n'y a aucune policy à réécrire ici.

create schema if not exists private;

-- Les corps de fonctions, eux, appellent les helpers par nom non qualifié avec
-- `search_path = public`. On ajoute `private` au chemin de recherche de toutes les fonctions
-- de `public` pour que ces appels continuent de résoudre après le déplacement.
-- (Généré dynamiquement : aucune signature à recopier, donc aucune faute de frappe possible.)
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = public, private', r.sig);
  end loop;
end;
$$;

-- Déplacement effectif. `if exists` implicite : on ne déplace que ce qui est encore dans public.
do $$
begin
  if to_regprocedure('public.is_admin(uuid)') is not null then
    alter function public.is_admin(uuid) set schema private;
  end if;
  if to_regprocedure('public.is_banned(uuid)') is not null then
    alter function public.is_banned(uuid) set schema private;
  end if;
  if to_regprocedure('public.is_sanctioned(uuid)') is not null then
    alter function public.is_sanctioned(uuid) set schema private;
  end if;
  if to_regprocedure('public.is_blocked_pair(uuid,uuid)') is not null then
    alter function public.is_blocked_pair(uuid,uuid) set schema private;
  end if;
end;
$$;

-- Le schéma `private` n'est pas exposé par PostgREST, mais les policies doivent pouvoir
-- traverser le schéma et exécuter les fonctions.
grant usage on schema private to anon, authenticated, service_role;

grant execute on function private.is_banned(uuid)              to anon, authenticated;
grant execute on function private.is_sanctioned(uuid)          to anon, authenticated;
grant execute on function private.is_blocked_pair(uuid,uuid)   to anon, authenticated;

-- `is_admin` n'est utilisée par AUCUNE policy : uniquement par les fonctions `admin_*`, qui
-- sont SECURITY DEFINER et s'exécutent donc en tant que `postgres`. On peut la fermer
-- complètement — c'est la plus sensible des quatre (elle énumère les administrateurs).
revoke all on function private.is_admin(uuid) from public, anon, authenticated;

-- Empêche que les prochaines fonctions créées dans `private` soient exécutables par défaut.
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-03 — Appartenance au groupe vérifiée à l'ÉCRITURE
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : la policy INSERT de `posts` ne vérifie que `author_id = auth.uid()`. Le
-- `group_id` n'est jamais contrôlé. Quiconque connaît l'UUID d'un groupe privé peut donc y
-- publier une main : elle apparaîtra dans le fil de ce groupe, signée de son auteur, sans
-- qu'aucun membre n'ait invité qui que ce soit. La lecture, elle, est bien contrôlée — c'est
-- l'écriture qui manque.
--
-- Même trou à l'UPDATE : un auteur peut modifier sa propre main pour la déplacer dans
-- n'importe quel groupe (`visibility = 'group'` + `group_id` arbitraire).
--
-- Policies RESTRICTIVES : elles s'ajoutent en ET aux policies existantes, donc elles ne
-- peuvent qu'interdire — aucun risque d'élargir un droit par mégarde.

drop policy if exists "posts group membership on insert" on public.posts;
create policy "posts group membership on insert" on public.posts
  as restrictive for insert to public
  with check (visibility <> 'group' or public.is_group_member(group_id));

drop policy if exists "posts group membership on update" on public.posts;
create policy "posts group membership on update" on public.posts
  as restrictive for update to public
  using (true)
  with check (visibility <> 'group' or public.is_group_member(group_id));

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-04 — Verrouiller `age_confirmed` (et tout ce que le client n'a pas à écrire)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : `public.profiles` a GRANT ALL pour `anon` et `authenticated` (privilèges par
-- défaut de Supabase), et la policy UPDATE autorise la modification de SA PROPRE ligne. Comme
-- la colonne `age_confirmed` a été ajoutée après coup sur cette table, elle hérite du droit
-- d'écriture : un compte signalé comme mineur, dont un admin a mis `age_confirmed = false`,
-- peut remettre la valeur à `true` lui-même — sans trace, depuis n'importe quel client REST.
-- C'est ce qui vide de sens la promesse des CGU (« un compte de mineur identifié est bloqué
-- puis supprimé ») et, avec elle, la position juridique sur l'âge déclaratif.
--
-- CORRECTIF : droit d'UPDATE accordé COLONNE PAR COLONNE, exactement comme le fait déjà
-- `notifications.read_at`. Les 8 colonnes ci-dessous sont celles — et uniquement celles — que
-- le client écrit réellement :
--   • src/data/profiles.ts        → pseudo, display_preference, format_favori,
--                                   variante_favorite, frequence_jeu, bio, country
--   • src/data/avatars.ts         → avatar_url
--   • src/profile/CompleteProfileScreen.tsx → variante_favorite, bio, country
-- Restent hors d'atteinte : `id`, `created_at`, `age_confirmed`.
--
-- ⚠️ Si une colonne écrite par le client était oubliée ici, l'édition de profil échouerait
-- avec « permission denied for table profiles ». La vérification en fin de script la
-- signalerait, et il suffirait d'ajouter la colonne à la liste.

revoke update on table public.profiles from anon, authenticated;

grant update (
  pseudo,
  avatar_url,
  display_preference,
  format_favori,
  variante_favorite,
  frequence_jeu,
  bio,
  country
) on table public.profiles to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Durcissement complémentaire — privilèges qui ne servent à rien et qui coûtent cher
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Les privilèges par défaut de Supabase accordent TRUNCATE, TRIGGER et REFERENCES à `anon` et
-- `authenticated` sur chaque table. Aucun n'est utilisable via l'API REST — mais TRUNCATE
-- N'EST PAS soumis à la RLS, et TRIGGER permettrait d'attacher du code à une table. Ce sont
-- des privilèges qui ne rapportent rien et qui transformeraient une future faille mineure en
-- perte de données. On les retire ; l'application n'en utilise aucun.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
  loop
    execute format(
      'revoke truncate, trigger, references on table public.%I from anon, authenticated',
      r.relname
    );
  end loop;
end;
$$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (lecture seule) — doit renvoyer 5 lignes « OK »
-- ═══════════════════════════════════════════════════════════════════════════════════════
select 'F-06 fonctions hors de public' as controle,
       case when count(*) = 0 then 'OK' else 'ECHEC : ' || string_agg(p.proname, ', ') end as resultat
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'is_banned', 'is_sanctioned', 'is_blocked_pair')
union all
select 'F-06 execute conserve pour les policies',
       case when count(*) = 3 then 'OK' else 'ECHEC : ' || count(*)::text || '/3' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('is_banned', 'is_sanctioned', 'is_blocked_pair')
  and has_function_privilege('authenticated', p.oid, 'execute')
union all
select 'F-03 policies de groupe a l ecriture',
       case when count(*) = 2 then 'OK' else 'ECHEC : ' || count(*)::text || '/2' end
from pg_policies
where schemaname = 'public' and tablename = 'posts'
  and policyname in ('posts group membership on insert', 'posts group membership on update')
union all
select 'F-04 age_confirmed non modifiable',
       case when not has_column_privilege('authenticated', 'public.profiles', 'age_confirmed', 'update')
            then 'OK' else 'ECHEC : encore modifiable' end
union all
select 'F-04 les 8 colonnes du client restent modifiables',
       case when bool_and(has_column_privilege('authenticated', 'public.profiles', col, 'update'))
            then 'OK' else 'ECHEC : au moins une colonne bloquee' end
from unnest(array['pseudo','avatar_url','display_preference','format_favori',
                  'variante_favorite','frequence_jeu','bio','country']) as col;


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE (à n'exécuter que si l'application casse)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   alter function private.is_admin(uuid)            set schema public;
--   alter function private.is_banned(uuid)           set schema public;
--   alter function private.is_sanctioned(uuid)       set schema public;
--   alter function private.is_blocked_pair(uuid,uuid) set schema public;
--   grant execute on function public.is_admin(uuid), public.is_banned(uuid),
--                              public.is_sanctioned(uuid), public.is_blocked_pair(uuid,uuid)
--     to anon, authenticated;
--   drop policy if exists "posts group membership on insert" on public.posts;
--   drop policy if exists "posts group membership on update" on public.posts;
--   grant update on table public.profiles to authenticated;
-- commit;
