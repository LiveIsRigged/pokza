-- TEST DES ÉCRITURES DE STOCKAGE — le dernier angle mort de l'audit
-- =============================================================================================
-- LA QUESTION : un compte connecté peut-il déposer un fichier dans le dossier de QUELQU'UN
-- D'AUTRE ? Concrètement — remplacer l'avatar d'un autre membre par l'image de son choix, qui
-- s'afficherait alors sous son pseudo sur chacune de ses mains et de ses commentaires. Ou
-- remplacer la photo d'un groupe privé qu'il ne possède pas.
--
-- POURQUOI ÇA N'A JAMAIS ÉTÉ VÉRIFIÉ : les règles d'écriture de `storage.objects` ne figurent
-- dans AUCUN fichier du dépôt — elles ont été créées à la main dans le dashboard. Le lot 5 en a
-- ajouté deux, mais seule la LECTURE a été testée. Et le projet DEV n'a aucun bucket, donc rien
-- n'y est mesurable.
--
--   ⚠️ À LANCER EN PRODUCTION — c'est le seul environnement qui a du stockage.
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- EST-CE SANS DANGER EN PROD ? Oui, et c'est construit pour :
--   • Chaque tentative vit dans un sous-bloc qui se termine TOUJOURS par une annulation — y
--     compris quand l'écriture est acceptée : on lève volontairement une exception juste après,
--     ce qui défait l'opération. Rien ne subsiste, même dans le cas où le test échoue.
--   • On n'écrit que la fiche de l'objet, jamais le contenu d'un fichier réel.
--   • Les noms de fichiers utilisés sont tirés au hasard et ne peuvent entrer en collision avec
--     un fichier existant. C'est indispensable : sous le nom `avatar.jpg`, un refus aurait pu
--     venir d'un simple conflit de nom, et on aurait conclu « refusé » sur une intrusion en
--     réalité autorisée. Le pire des faux négatifs, précisément sur le test qui compte le plus.
--   • Les tests de renommage et de suppression visent UN fichier précis, relevé à l'avance.
--
-- ATTENDU : que des OK. Un seul « *** ECHEC : accepte *** » signalerait une faille sérieuse,
-- exploitable par n'importe quel compte connecté, et à corriger avant la bêta.

drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

-- ⚠️ Le rôle `authenticated` n'a AUCUN droit sur cette table de résultats, et un `grant` ne
-- suffit pas à le lui donner ici. C'est pour ça que tous les scripts de test du chantier
-- accumulent leurs constats dans un tableau en mémoire (`v_lines`) pendant l'impersonation, et
-- ne les écrivent qu'une fois redevenus `postgres`. On fait pareil.

do $$
declare
  v_a        uuid;    -- l'intrus
  v_b        uuid;    -- sa victime
  v_group    uuid;    -- un groupe que A ne possède pas
  v_cible    text;    -- un fichier appartenant à quelqu'un d'autre que A
  v_buckets  text[];
  v_marque   text := 'test-rls-' || replace(gen_random_uuid()::text, '-', '') || '.jpg';
  v_n        bigint;
  v_verdict  text;
  v_lines    text[] := '{}';   -- constats accumulés pendant l'impersonation
begin
  -- ═══ Relevé PRÉALABLE, en tant que postgres ══════════════════════════════════════════════
  -- `storage.buckets` a la RLS active et aucune policy : une fois passé en `authenticated`,
  -- toute lecture y répondrait « aucun bucket ». Piège déjà payé au lot 5.
  select array_agg(id order by id) into v_buckets from storage.buckets;
  if v_buckets is null then
    insert into _res values (0, 'PREALABLE',
      'NON APPLICABLE — aucun bucket ici. Ce test n a de sens qu en PRODUCTION.');
    return;
  end if;
  insert into _res values (1, 'Buckets presents', array_to_string(v_buckets, ', '));

  -- ⚠️ ON CHOISIT L'INTRUS EN FONCTION DE LA CIBLE, jamais l'inverse.
  -- Première version de ce script : l'intrus était « le profil le plus ancien », c'est-à-dire le
  -- propriétaire du seul groupe et le seul à avoir un avatar. Deux tests sur six répondaient
  -- alors « NON TESTABLE » — dont celui de la photo de groupe, qui est le plus important.
  -- On part donc de ce qu'il y a à attaquer, et on prend quelqu'un qui n'y a pas droit.
  select id into v_group from public.groups order by created_at limit 1;

  select p.id into v_a
  from public.profiles p
  where v_group is null
     or p.id <> (select g.owner_id from public.groups g where g.id = v_group)
  order by p.created_at limit 1;
  -- Repli : s'il n'existe aucun profil hors propriétaire, on reprend le plus ancien.
  if v_a is null then
    select id into v_a from public.profiles order by created_at limit 1;
  end if;
  -- Le groupe ne sert au test que s'il appartient réellement à quelqu'un d'autre.
  if v_group is not null
     and (select g.owner_id from public.groups g where g.id = v_group) = v_a then
    v_group := null;
  end if;

  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;

  -- Relevé MAINTENANT : après l'impersonation, la règle de lecture pourrait masquer ce fichier.
  -- On filtre sur le DOSSIER et non sur `owner_id` : c'est le dossier que la règle examine, et
  -- `owner_id` est souvent vide sur les fichiers déposés avant que Supabase ne le renseigne.
  select name into v_cible
  from storage.objects
  where bucket_id = 'avatars'
    and (storage.foldername(name))[1] <> v_a::text
  order by created_at limit 1;

  if v_a is null or v_b is null then
    insert into _res values (2, 'PREALABLE', '*** Il faut au moins 2 profils ***');
    return;
  end if;

  -- Qui joue quel rôle : sans ça, un « NON TESTABLE » ne dit pas POURQUOI il n'a rien mesuré.
  insert into _res values (2, 'Intrus / victime / cibles',
    'intrus ' || left(v_a::text, 8) || '  contre  ' || left(v_b::text, 8)
    || '   groupe vise : ' || coalesce(left(v_group::text, 8), 'AUCUN d un autre compte')
    || '   fichier vise : ' || coalesce(v_cible, 'AUCUN d un autre compte'));

  -- ═══ Inventaire des règles d'écriture — elles ne sont dans aucun fichier du dépôt ════════
  insert into _res
  select 3, 'Regle ' || upper(cmd) || ' : ' || policyname,
         coalesce('USING ' || qual, '')
         || case when qual is not null and with_check is not null then '  |  ' else '' end
         || coalesce('WITH CHECK ' || with_check, '')
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and cmd <> 'SELECT';

  select count(*) into v_n
  from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd <> 'SELECT';
  insert into _res values (4, 'Nombre de regles d ecriture',
    case when v_n = 0 then '*** AUCUNE — tout compte connecte peut tout ecrire ***'
         else v_n::text end);

  -- ═══ On devient A ════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_a, 'role', 'authenticated')::text, false);
  set role authenticated;

  -- ─── 5. LE test : déposer un fichier dans le dossier d'un AUTRE compte ──────────────────
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('avatars', v_b::text || '/' || v_marque, v_a, v_a::text);
    raise exception 'ACCEPTE';   -- annule l'insertion qui vient d'être acceptee
  exception when others then
    v_verdict := case when sqlerrm = 'ACCEPTE'
                      then '*** ECHEC : accepte — un compte peut ecrire chez un autre ***'
                      else 'OK — refuse' end;
  end;
  v_lines := v_lines || format('5|Ecrire dans le dossier avatar d un AUTRE compte|%s', v_verdict);

  -- ─── 6. Non-régression : déposer dans SON PROPRE dossier ────────────────────────────────
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('avatars', v_a::text || '/' || v_marque, v_a, v_a::text);
    raise exception 'ACCEPTE';
  exception when others then
    v_verdict := case when sqlerrm = 'ACCEPTE' then 'OK — accepte, comme il se doit'
                      else '*** ECHEC : refuse — plus personne ne peut changer son avatar *** '
                           || replace(sqlerrm, '|', '/') end;
  end;
  v_lines := v_lines || format('6|Ecrire dans SON PROPRE dossier avatar (doit passer)|%s', v_verdict);

  -- ─── 7. Remplacer la photo d'un groupe qu'on ne possède pas ─────────────────────────────
  if v_group is null then
    v_lines := v_lines || '7|Ecrire la photo d un groupe qu on ne possede pas|NON TESTABLE — aucun groupe d un autre compte'::text;
  else
    begin
      insert into storage.objects (bucket_id, name, owner, owner_id)
      values ('group-avatars', v_group::text || '/' || v_marque, v_a, v_a::text);
      raise exception 'ACCEPTE';
    exception when others then
      v_verdict := case when sqlerrm = 'ACCEPTE'
                        then '*** ECHEC : accepte — un etranger peut changer la photo du groupe ***'
                        else 'OK — refuse' end;
    end;
    v_lines := v_lines || format('7|Ecrire la photo d un groupe qu on ne possede pas|%s', v_verdict);
  end if;

  -- ─── 8. Déposer une photo de commentaire dans le dossier d'un autre ─────────────────────
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('comment-photos', v_b::text || '/' || v_marque, v_a, v_a::text);
    raise exception 'ACCEPTE';
  exception when others then
    v_verdict := case when sqlerrm = 'ACCEPTE'
                      then '*** ECHEC : accepte — depot dans le dossier d un autre ***'
                      else 'OK — refuse' end;
  end;
  v_lines := v_lines || format('8|Deposer une photo de commentaire chez un AUTRE|%s', v_verdict);

  -- ─── 9 et 10 : toucher au fichier existant de quelqu'un d'autre ─────────────────────────
  if v_cible is null then
    v_lines := v_lines || '9|Renommer / supprimer le fichier d un AUTRE|NON TESTABLE — aucun fichier d un autre compte'::text;
  else
    begin
      update storage.objects set name = name || '.detourne'
       where bucket_id = 'avatars' and name = v_cible;
      if found then raise exception 'ACCEPTE'; end if;
      v_verdict := 'OK — refuse (aucune ligne touchee)';
    exception when others then
      v_verdict := case when sqlerrm = 'ACCEPTE'
                        then '*** ECHEC : accepte — renommage du fichier d un autre ***'
                        else 'OK — refuse' end;
    end;
    v_lines := v_lines || format('9|Renommer le fichier d un AUTRE compte|%s', v_verdict);

    begin
      delete from storage.objects where bucket_id = 'avatars' and name = v_cible;
      if found then raise exception 'ACCEPTE'; end if;
      v_verdict := 'OK — refuse (aucune ligne touchee)';
    exception when others then
      v_verdict := case when sqlerrm = 'ACCEPTE'
                        then '*** ECHEC : accepte — suppression du fichier d un autre ***'
                        else 'OK — refuse' end;
    end;
    v_lines := v_lines || format('10|Supprimer le fichier d un AUTRE compte|%s', v_verdict);
  end if;

  -- ═══ Retour en postgres — c'est seulement ici qu'on peut écrire les constats ══════════════
  reset role;
  perform set_config('request.jwt.claims', '', false);

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;

  -- ═══ Contrôle de propreté ════════════════════════════════════════════════════════════════
  select count(*) into v_n
  from storage.objects where name like '%' || v_marque or name like '%.detourne';
  insert into _res values (11, 'Traces de test restantes',
    case when v_n = 0 then 'OK — 0' else '*** ' || v_n || ' a nettoyer a la main ***' end);

  -- Et le fichier visé par les tests 9/10 doit toujours être là.
  if v_cible is not null then
    select count(*) into v_n from storage.objects where name = v_cible;
    insert into _res values (12, 'Le fichier vise est intact',
      case when v_n = 1 then 'OK — toujours present' else '*** DISPARU — a verifier ***' end);
  end if;
end;
$$;

-- Résultat en UNE SEULE CELLULE, pour pouvoir le copier-coller d'un bloc. Un tableau de douze
-- lignes se recopie mal ; là, un seul clic sur la cellule suffit.
select string_agg(
         lpad(n::text, 2, ' ') || '  ' || rpad(controle, 58) || '  ' || resultat,
         chr(10) order by n, controle
       ) as rapport
from _res;
