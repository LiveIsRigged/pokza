-- ANGLE MORT MULTI-COMPTES — 1/2 : écritures et lectures croisées
-- ===============================================================
-- ⚠️ DEV UNIQUEMENT. Le script refuse de tourner ailleurs.
-- ⚠️ Lancer en mode « WITHOUT RLS » : le script bascule LUI-MÊME en `authenticated` par
--    impersonation. Une requête lancée normalement tourne en `postgres` et contourne toutes les
--    policies — elle ne prouverait rien.
-- Éditeur DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- POURQUOI CE DÉCOUPAGE
-- ---------------------
-- Ce fichier ne crée AUCUNE ligne : il n'utilise que les mains déjà présentes, et se contente de
-- basculer une visibilité le temps d'un test avant de la remettre. C'est ce qui le rend sûr et
-- rejouable. Le second volet (groupes de bout en bout, notifications) crée des fixtures et sera
-- livré une fois la mécanique d'impersonation confirmée par celui-ci.
--
-- CHOIX DES ACTEURS — carol_dev, dave_dev, frank_dev
-- --------------------------------------------------
-- Choisis d'après le relevé, EN FONCTION DE LA CIBLE et jamais « le premier profil » :
-- `alice_dev` est dans un blocage, `bob_dev` est sanctionné ET bloqué, `mallory_dev` est
-- sanctionnée. Un test dont l'acteur est déjà banni « passe » sans rien prouver.
--
-- LECTURE DES RÉSULTATS
-- ---------------------
-- Un refus RLS ne lève PAS toujours une erreur : sur UPDATE/DELETE il se manifeste par 0 ligne
-- touchée, sur INSERT par un 42501. Les deux formes sont testées, et la colonne `obtenu` montre
-- ce qui s'est réellement produit — un SQLSTATE inattendu (42703 = colonne inconnue) se voit donc
-- tout de suite, au lieu de passer pour un refus légitime.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'push_subscriptions') then
    raise exception 'ARRET : environnement de PRODUCTION detecte. Ce script est reserve au DEV.';
  end if;
end $$;

drop table if exists resultat;
create temporary table resultat (n serial, titre text, attendu text, obtenu text, verdict text);

do $$
declare
  carol uuid; dave uuid;
  main_carol uuid; main_dave uuid;
  n int;
begin
  select id into carol from public.profiles where pseudo = 'carol_dev';
  select id into dave  from public.profiles where pseudo = 'dave_dev';
  if carol is null or dave is null then
    raise exception 'ARRET : carol_dev ou dave_dev introuvable. Rejouer seed.sql.';
  end if;

  select id into main_carol from public.posts where author_id = carol and mod_status = 'visible' limit 1;
  select id into main_dave  from public.posts where author_id = dave  and mod_status = 'visible' limit 1;
  if main_carol is null or main_dave is null then
    raise exception 'ARRET : carol ou dave n a pas de main visible. Rejouer seed-fix-hands.sql.';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- 1. ÉCRITURES CROISÉES — carol s'en prend au contenu de dave.
  --    Jamais testé systématiquement. C'est ici que se cacherait le pire.
  -- ══════════════════════════════════════════════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);

  begin
    update public.posts set title = 'ZZ pirate' where id = main_dave;
    get diagnostics n = row_count;
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.1 carol modifie la main de dave', '0 ligne', n || ' ligne(s)', case when n = 0 then 'OK' else 'KO' end);
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.1 carol modifie la main de dave', '0 ligne', 'refus ' || sqlstate, 'OK');
  end;

  begin
    delete from public.posts where id = main_dave;
    get diagnostics n = row_count;
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.2 carol supprime la main de dave', '0 ligne', n || ' ligne(s)', case when n = 0 then 'OK' else 'KO' end);
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.2 carol supprime la main de dave', '0 ligne', 'refus ' || sqlstate, 'OK');
  end;

  begin
    insert into public.comments(post_id, author_id, body) values (main_carol, dave, 'ZZ usurpation');
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.3 carol commente au nom de dave', 'refus', 'ACCEPTE', 'KO');
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.3 carol commente au nom de dave', 'refus 42501', sqlstate,
       case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  begin
    insert into public.likes(post_id, user_id) values (main_dave, dave);
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.4 carol like au nom de dave', 'refus', 'ACCEPTE', 'KO');
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.4 carol like au nom de dave', 'refus 42501', sqlstate,
       case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  begin
    insert into public.votes(post_id, user_id, option) values (main_dave, dave, 0);
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.5 carol vote au nom de dave', 'refus', 'ACCEPTE', 'KO');
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.5 carol vote au nom de dave', 'refus 42501', sqlstate,
       case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  -- Le verrou F-21, vu de l'app cette fois : carol ne doit pas pouvoir annuler la modération de
  -- SA PROPRE main. C'est un refus de DROIT DE COLONNE, donc une vraie erreur 42501 — pas 0 ligne.
  begin
    update public.posts set mod_status = 'visible' where id = main_carol;
    get diagnostics n = row_count;
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.6 F-21 carol reecrit mod_status de sa main', 'refus 42501',
       n || ' ligne(s) SANS erreur', 'KO');
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.6 F-21 carol reecrit mod_status de sa main', 'refus 42501', sqlstate,
       case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  begin
    update public.posts set like_count = 9999 where id = main_carol;
    get diagnostics n = row_count;
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.7 F-21 carol gonfle like_count de sa main', 'refus 42501',
       n || ' ligne(s) SANS erreur', 'KO');
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('1.7 F-21 carol gonfle like_count de sa main', 'refus 42501', sqlstate,
       case when sqlstate = '42501' then 'OK' else 'A VERIFIER' end);
  end;

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- 2. LECTURES CROISÉES — une main privée doit rester privée.
  --    Aucune création : on bascule la visibilité de la main de dave, puis on la remet.
  -- ══════════════════════════════════════════════════════════════════════════════════
  set local role postgres;
  update public.posts set visibility = 'private' where id = main_dave;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts where id = main_dave;
  insert into resultat(titre, attendu, obtenu, verdict) values
    ('2.1 dave voit sa propre main privee', '1', n::text, case when n = 1 then 'OK' else 'KO' end);

  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts where id = main_dave;
  insert into resultat(titre, attendu, obtenu, verdict) values
    ('2.2 carol ne voit PAS la main privee de dave', '0', n::text, case when n = 0 then 'OK' else 'KO' end);

  select count(*) into n from public.comments where post_id = main_dave;
  insert into resultat(titre, attendu, obtenu, verdict) values
    ('2.3 carol ne voit aucun commentaire de cette main', '0', n::text, case when n = 0 then 'OK' else 'KO' end);

  set local role postgres;
  update public.posts set visibility = 'public' where id = main_dave;

  -- Le contenu retiré par la modération : visible de son auteur seul.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts where mod_status = 'removed' and author_id <> carol;
  insert into resultat(titre, attendu, obtenu, verdict) values
    ('2.4 carol voit du contenu retire qui n est pas le sien', '0', n::text,
     case when n = 0 then 'OK' else 'KO' end);

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- 3. CONTRÔLE DE FALSIFIABILITÉ — sans lui, une suite tout en OK ne prouve rien.
  --    Ces deux gestes DOIVENT réussir. S'ils échouent, c'est que l'impersonation ne fait rien
  --    et que tous les refus ci-dessus sont des faux positifs.
  -- ══════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.posts where id = main_carol;
  insert into resultat(titre, attendu, obtenu, verdict) values
    ('3.1 CONTROLE carol voit bien sa propre main', '1', n::text, case when n = 1 then 'OK' else 'KO' end);

  begin
    update public.posts set title = title where id = main_carol;
    get diagnostics n = row_count;
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('3.2 CONTROLE carol modifie bien le titre de sa main', '1 ligne', n || ' ligne(s)',
       case when n = 1 then 'OK' else 'KO' end);
  exception when others then
    insert into resultat(titre, attendu, obtenu, verdict) values
      ('3.2 CONTROLE carol modifie bien le titre de sa main', '1 ligne', 'refus ' || sqlstate, 'KO');
  end;

  set local role postgres;
end $$;

reset role;

-- Filet : si un test avait laissé passer une écriture, on l'annule ici.
delete from public.comments where body like 'ZZ %';
update public.posts set title = replace(title, 'ZZ pirate', 'main de dave') where title like 'ZZ pirate%';

select n, titre, attendu, obtenu, verdict from resultat order by n;
