-- ══════════════════════════════════════════════════════════════════════════════════════════
-- MESURE — « chercher quelqu'un par son nom »
-- À jouer APRÈS `recherche-par-nom.sql`, sur la même base.
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- N'ÉCRIT RIEN DE DURABLE : transaction terminée par `rollback`. Les trois comptes fabriqués
-- ci-dessous n'existeront jamais pour personne.
--
-- ── TROIS TÉMOINS, PARCE QU'UN SEUL NE PROUVERAIT RIEN
--   • ANNE affiche son NOM      → doit être trouvable par « Dupont », et s'afficher sous son nom.
--   • BRUNO affiche son PSEUDO  → son nom ne doit JAMAIS sortir, ni à l'affichage ni à la recherche.
--   Les deux portent le MÊME nom de famille : c'est le seul montage qui distingue « la recherche
--   filtre correctement » de « la recherche ne trouve rien ». Une requête sur « Dupont » doit
--   ramener Anne et Anne seule.
--   • CLARA affiche son NOM mais n'a aucune ligne dans `profiles_private` → repli sur le pseudo.
--
-- ── ATTENDU : 12 lignes, toutes en OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

create temp table t_res (ord int, controle text, attendu text, resultat text);
grant all on t_res to authenticated;
create temp table t_ctx (anne uuid, bruno uuid, clara uuid, marque text);
grant all on t_ctx to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. FABRICATION — sous `postgres`. Ne teste rien, prépare.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_marque text := 'zz' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  v_anne uuid := gen_random_uuid();
  v_bruno uuid := gen_random_uuid();
  v_clara uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         v_marque || '-' || u.id::text || '@pokza.test', '', now(), now(), now()
  from (values (v_anne), (v_bruno), (v_clara)) as u(id);

  insert into public.profiles (id, pseudo, display_preference) values
    (v_anne,  v_marque || 'anne',  'nom'),
    (v_bruno, v_marque || 'bruno', 'pseudo'),
    (v_clara, v_marque || 'clara', 'nom');

  -- Clara n'en a PAS : c'est son cas de test.
  insert into public.profiles_private (id, prenom, nom, date_naissance) values
    (v_anne,  'Anne',  v_marque || 'dupont', date '1990-01-01'),
    (v_bruno, 'Bruno', v_marque || 'dupont', date '1990-01-01');

  insert into t_ctx values (v_anne, v_bruno, v_clara, v_marque);
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. LE TEST EST-IL EN ÉTAT DE MESURER ?
-- ══════════════════════════════════════════════════════════════════════════════════════════
insert into t_res values (1, 'les 2 declencheurs sont poses sur CETTE base', '2 sur 2',
  (select case when count(*) = 2 then 'OK — 2 sur 2'
               else 'KO — ' || count(*)::text || ' sur 2 : jouer recherche-par-nom.sql sur CETTE base' end
   from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and t.tgenabled = 'O'
     and ((c.relname = 'profiles' and t.tgname = 'profiles_display_name')
       or (c.relname = 'profiles_private' and t.tgname = 'profiles_private_display_name'))));

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. LE CALCUL DE LA COLONNE
-- ══════════════════════════════════════════════════════════════════════════════════════════
insert into t_res
select 2, 'preference « nom » : la colonne porte prenom + nom', 'Anne <marque>dupont',
       case when p.display_name = 'Anne ' || c.marque || 'dupont'
            then 'OK — ' || p.display_name
            else 'KO — ' || coalesce(p.display_name, '(null)') end
from t_ctx c join public.profiles p on p.id = c.anne;

insert into t_res
select 3, 'preference « pseudo » : la colonne porte le pseudo, JAMAIS le nom', 'le pseudo',
       case when p.display_name = c.marque || 'bruno'
            then 'OK — ' || p.display_name
            else 'KO — ' || coalesce(p.display_name, '(null)') end
from t_ctx c join public.profiles p on p.id = c.bruno;

insert into t_res
select 4, 'preference « nom » sans etat civil saisi : repli sur le pseudo', 'le pseudo',
       case when p.display_name = c.marque || 'clara'
            then 'OK — ' || p.display_name
            else 'KO — ' || coalesce(p.display_name, '(null)') end
from t_ctx c join public.profiles p on p.id = c.clara;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4. LA COLONNE SUIT LES CHANGEMENTS — les trois chemins possibles
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare c record;
begin
  select * into c from t_ctx;

  -- (a) l'etat civil change dans profiles_private
  update public.profiles_private set prenom = 'Annie' where id = c.anne;
  insert into t_res values (5, 'changer son prenom met la colonne a jour', 'Annie <marque>dupont',
    case when (select display_name from public.profiles where id = c.anne) = 'Annie ' || c.marque || 'dupont'
         then 'OK — suit' else 'KO — ' || (select coalesce(display_name, '(null)') from public.profiles where id = c.anne) end);

  -- (b) on repasse sur « Mon pseudo » : le nom doit DISPARAITRE de la table publique
  update public.profiles set display_preference = 'pseudo' where id = c.anne;
  insert into t_res values (6, 'repasser sur « Mon pseudo » efface le nom de la colonne publique', 'le pseudo',
    case when (select display_name from public.profiles where id = c.anne) = c.marque || 'anne'
         then 'OK — le nom a disparu'
         else 'KO — le nom est reste : ' || (select display_name from public.profiles where id = c.anne) end);

  -- (c) et on revient sur « Mon nom »
  update public.profiles set display_preference = 'nom' where id = c.anne;
  insert into t_res values (7, 'revenir sur « Mon nom » le fait reapparaitre', 'Annie <marque>dupont',
    case when (select display_name from public.profiles where id = c.anne) = 'Annie ' || c.marque || 'dupont'
         then 'OK — revenu' else 'KO — ' || (select coalesce(display_name, '(null)') from public.profiles where id = c.anne) end);

  -- (d) changer de pseudo quand on affiche son nom ne doit RIEN changer a l'affichage
  update public.profiles set pseudo = c.marque || 'anne2' where id = c.anne;
  insert into t_res values (8, 'changer de pseudo quand on affiche son nom ne change rien', 'Annie <marque>dupont',
    case when (select display_name from public.profiles where id = c.anne) = 'Annie ' || c.marque || 'dupont'
         then 'OK — inchange' else 'KO — ' || (select display_name from public.profiles where id = c.anne) end);
end $$;

insert into t_res values (9, 'la colonne et get_display_name concordent sur TOUTES les lignes', '0 divergence',
  (select case when count(*) = 0 then 'OK — aucune divergence'
               else 'KO — ' || count(*)::text || ' profil(s) : la recherche et le feed montreraient deux noms differents' end
   from public.profiles p where p.display_name is distinct from public.get_display_name(p.id)));

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 5. DANS LES CONDITIONS DE L'APP — sous `authenticated`, comme PostgREST
--    Les claims se posent AVANT le changement de role, au niveau TRANSACTION et jamais dans un
--    bloc `DO` (sinon `set local role` n'a aucun effet et tout tourne encore sous postgres).
-- ══════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
                  json_build_object('sub', (select bruno from t_ctx), 'role', 'authenticated')::text,
                  true);
set local role authenticated;

insert into t_res values (10, 'sous quel role tournent les tentatives ?', 'authenticated',
  case when current_user = 'authenticated' then 'OK — authenticated'
       else 'KO — ' || current_user || ' : les regles de l app ne sont pas celles testees' end);

do $$
declare c record; v text;
begin
  select * into c from t_ctx;

  -- (a) LE POINT DUR : personne ne peut se donner le nom d'un autre en ecrivant la colonne.
  begin
    update public.profiles set display_name = 'Annie ' || c.marque || 'dupont' where id = c.bruno;
    select display_name into v from public.profiles where id = c.bruno;
    insert into t_res values (11, 'un joueur ne peut pas s attribuer le nom d un autre', 'ecriture ignoree',
      case when v = c.marque || 'bruno' then 'OK — recalculee, l ecriture n a pas pris'
           else 'KO — usurpation possible : ' || v end);
  exception when others then
    -- Refuse net (droits par colonne) : tout aussi bon, la colonne reste juste.
    insert into t_res values (11, 'un joueur ne peut pas s attribuer le nom d un autre', 'ecriture ignoree',
      'OK — refusee en base : ' || sqlerrm);
  end;

  -- (b) LA RECHERCHE ELLE-MEME, exactement le filtre que le client envoie :
  --     pseudo ilike %q% OR display_name ilike %q%
  --     Anne et Bruno portent le MEME nom ; seule Anne l'affiche.
  select string_agg(p.pseudo, ', ' order by p.pseudo) into v
  from public.profiles p
  where p.pseudo ilike '%' || c.marque || 'dupont%'
     or p.display_name ilike '%' || c.marque || 'dupont%';
  insert into t_res values (12, 'chercher un nom ne trouve QUE ceux qui l affichent', 'anne seule',
    case when v = c.marque || 'anne2' then 'OK — anne seule, bruno reste introuvable par son nom'
         when v is null then 'KO — personne trouve : la recherche par nom ne marche pas'
         else 'KO — ' || v || ' : un nom prive a fuite' end);
end $$;

reset role;

select ord, controle, attendu, resultat from t_res order by ord;

rollback;
