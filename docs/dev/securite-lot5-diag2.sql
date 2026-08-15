-- LOT 5 — DIAGNOSTIC 2 : pourquoi le propriétaire ne voit-il pas la photo de son groupe ?
-- ======================================================================================
-- 100 % LECTURE SEULE.
--
-- On décompose la condition de la policy, morceau par morceau, en se faisant passer pour
-- `pokza_founder` (propriétaire du groupe « Les français »). Chaque ligne isole une étape :
-- la première qui répond « non » est la coupable.
--
-- PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

drop table if exists _res;
create temp table _res (n int, etape text, resultat text);

do $$
declare
  v_user   uuid;
  v_group  uuid;
  v_name   text;
  v_folder text;
  v_n      bigint;
  v_uid    uuid;
  v_lines  text[] := '{}';
begin
  -- Repères, en tant que postgres (sans filtre)
  select o.name into v_name
  from storage.objects o
  join public.groups g on g.id::text = (storage.foldername(o.name))[1]
  where o.bucket_id = 'group-avatars'
  limit 1;

  select g.id, g.owner_id into v_group, v_user
  from public.groups g
  where g.id::text = (storage.foldername(v_name))[1];

  v_lines := v_lines || format('1|Fichier étudié|%s', v_name);
  v_lines := v_lines || format('2|Dossier extrait par storage.foldername|%s', (storage.foldername(v_name))[1]);
  v_lines := v_lines || format('3|Identifiant du groupe|%s', v_group);
  v_lines := v_lines || format('4|Les deux correspondent ?|%s',
    case when (storage.foldername(v_name))[1] = v_group::text then 'OUI' else '*** NON ***' end);

  -- On devient le propriétaire
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
  set role authenticated;

  begin
    select auth.uid() into v_uid;
    v_lines := v_lines || format('5|auth.uid() vu par la base|%s%s', coalesce(v_uid::text, '(NULL)'),
      case when v_uid = v_user then '  → correspond au proprietaire' else '  *** NE CORRESPOND PAS ***' end);
  exception when others then
    v_lines := v_lines || format('5|auth.uid() vu par la base|*** ERREUR *** %s', sqlerrm);
  end;

  begin
    select count(*) into v_n from public.groups where id = v_group;
    v_lines := v_lines || format('6|Le proprietaire voit-il son groupe ?|%s ligne(s)%s', v_n,
      case when v_n = 0 then '  *** c est ici que ca casse ***' else '  → OK' end);
  exception when others then
    v_lines := v_lines || format('6|Le proprietaire voit-il son groupe ?|*** ERREUR *** %s', sqlerrm);
  end;

  begin
    select count(*) into v_n
    from public.groups g
    where g.id::text = (storage.foldername(v_name))[1];
    v_lines := v_lines || format('7|La condition exacte de la policy|%s ligne(s)%s', v_n,
      case when v_n = 0 then '  *** faux → photo masquee ***' else '  → vrai, photo visible' end);
  exception when others then
    v_lines := v_lines || format('7|La condition exacte de la policy|*** ERREUR *** %s', sqlerrm);
  end;

  begin
    select count(*) into v_n from storage.objects where bucket_id = 'group-avatars';
    v_lines := v_lines || format('8|Photos de groupe finalement visibles|%s', v_n);
  exception when others then
    v_lines := v_lines || format('8|Photos de groupe finalement visibles|*** ERREUR *** %s', sqlerrm);
  end;

  begin
    select count(*) into v_n from storage.objects;
    v_lines := v_lines || format('9|Tous buckets confondus (temoin)|%s objet(s) visibles', v_n);
  exception when others then
    v_lines := v_lines || format('9|Tous buckets confondus (temoin)|*** ERREUR *** %s', sqlerrm);
  end;

  reset role;
  perform set_config('request.jwt.claims', '', false);

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;

exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', false);
  insert into _res values (99, 'ERREUR DU SCRIPT', sqlerrm);
end;
$$;

select etape, resultat from _res order by n;
