-- ============================================================================
-- GROUPES DE TEST — pour éprouver les deux seuils de volume (jetable).
-- PROD (c'est ce que lit le serveur de dev) : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- POURQUOI. Deux comportements ne se déclenchent qu'au-delà d'un certain nombre de groupes, et ne
-- peuvent donc pas être vus sur un compte qui en a trois :
--   • au-delà de 6  → la rangée de chips du créateur se replie en 4 récents + « Choisir un autre groupe » ;
--   • à partir de 15 → le champ de recherche apparaît dans « Mes groupes privés ».
-- 20 groupes franchissent les deux.
--
-- ⚠️ Écrit de VRAIES lignes sur le compte visé. Le nettoyage est en bas, une seule instruction.
-- Les noms sont tous préfixés « ZZTest » pour que la suppression ne puisse rien emporter d'autre.
--
-- ⚠️ NE PAS passer par `create_group()` ici. Cette fonction lit `auth.uid()`, qui est NUL dans
-- l'éditeur SQL : il n'y a pas de jeton, donc pas d'utilisateur courant. Elle insérait un
-- `owner_id` vide et se faisait refuser par la contrainte NOT NULL. On écrit donc les deux lignes
-- à la main, exactement celles que la fonction produit (le créateur devient membre accepté).
-- ============================================================================

-- ── CRÉATION ────────────────────────────────────────────────────────────────
do $$
declare
  v_owner uuid;
  v_group uuid;
  i int;
begin
  -- `strict` : si le pseudo ne correspond à personne, on s'arrête net plutôt que d'insérer du vide.
  select id into strict v_owner from public.profiles where pseudo = 'pokza_founder';

  for i in 1..20 loop
    insert into public.groups (name, owner_id)
    values ('ZZTest ' || lpad(i::text, 2, '0'), v_owner)
    returning id into v_group;

    insert into public.group_members (group_id, user_id, status, invited_by, responded_at)
    values (v_group, v_owner, 'accepted', v_owner, now());
  end loop;
end $$;

-- Contrôle : 20 lignes, toutes au bon propriétaire, chacune avec son unique membre accepté.
select g.name,
       g.owner_id,
       (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'accepted') as membres
from public.groups g
where g.name like 'ZZTest %'
order by g.name;


-- ── NETTOYAGE (à jouer quand les tests sont finis) ──────────────────────────
-- Décommente les trois lignes. `group_members` part en cascade ; aucune main n'étant publiée dans
-- ces groupes, la contrainte ON DELETE RESTRICT de `posts.group_id` ne s'y oppose pas.
--
-- delete from public.groups
--  where name like 'ZZTest %'
--    and owner_id = (select id from public.profiles where pseudo = 'pokza_founder');
