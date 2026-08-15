-- LOT 5 — MESURE DU FILTRE SUR LES PHOTOS DE GROUPE (F-05)
-- ========================================================
-- 100 % LECTURE SEULE. Sans danger en production, relançable.
--
-- POURQUOI : la vérification intégrée à securite-lot5.sql a sauté cette mesure — le test
-- d'existence du bucket y était fait APRÈS la bascule en utilisateur connecté, or
-- `storage.buckets` a la RLS active sans aucune policy, donc ce rôle ne voit jamais de bucket.
-- Le correctif était bien posé ; seule sa mesure manquait.
--
-- CE QU'ON VEUT PROUVER : avant, n'importe quel compte connecté pouvait lister TOUTES les
-- photos de groupe et en déduire l'identifiant de tous les groupes privés de Pokza. Après, un
-- compte ne doit voir que celles des groupes dont il fait partie.
--
-- LECTURE DU RÉSULTAT : la ligne « TOTAL RÉEL » donne le nombre de photos existantes. Chaque
-- ligne de compte doit afficher un nombre INFÉRIEUR OU ÉGAL, et égal seulement si ce compte
-- participe effectivement à tous les groupes concernés.
--
-- PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  r       record;
  i       int := 0;
  v_total bigint;
  v_n     bigint;
  v_lines text[] := '{}';
begin
  select count(*) into v_total from storage.objects where bucket_id = 'group-avatars';
  v_lines := v_lines || format('0|TOTAL RÉEL (toutes photos de groupe confondues)|%s', v_total);

  for r in select id, pseudo from public.profiles order by created_at loop
    i := i + 1;
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', r.id, 'role', 'authenticated')::text, false);
      set role authenticated;

      select count(*) into v_n from storage.objects where bucket_id = 'group-avatars';

      reset role;
      v_lines := v_lines || format('%s|%s voit|%s photo(s) sur %s%s',
        i, r.pseudo, v_n, v_total,
        case when v_n < v_total then '  ← filtré'
             when v_total = 0   then '  (rien à filtrer)'
             else '  ← participe à tous les groupes concernés' end);
    exception when others then
      reset role;
      v_lines := v_lines || format('%s|%s voit|*** ERREUR *** %s', i, r.pseudo, sqlerrm);
    end;
  end loop;

  reset role;
  perform set_config('request.jwt.claims', '', false);

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;
end;
$$;

select controle, resultat from _res order by n;
