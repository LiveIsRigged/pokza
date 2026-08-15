-- F-19 — DIAGNOSTIC DES MESSAGES D'ERREUR CORROMPUS (lecture seule, sans risque)
-- =============================================================================================
-- L'audit signale que les messages d'erreur des RPC d'administration s'affichent en caractères
-- corrompus en production, alors que le fichier source `docs/dev/moderation.sql` contient des
-- accents parfaitement valides. Le problème est donc arrivé à l'application, pas à l'écriture.
--
-- Ce script lit ce qui est RÉELLEMENT stocké en base et cherche la signature du mojibake : la
-- séquence `Ã` apparaît quand un texte UTF-8 a été relu comme du latin-1 puis ré-encodé en UTF-8.
-- « Réservé » devient alors « RÃ©servÃ© ».
--
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- À lancer sur LES DEUX : si DEV est sain et PROD corrompu, ça confirme que c'est le chemin
-- d'application en production qui est en cause, et non le fichier.

drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  v_n       bigint;
  v_encod   text;
  v_exemple text;
begin
  -- 1. L'encodage de la base elle-même. Doit être UTF8 ; s'il ne l'est pas, tout le reste
  --    découle de là et le correctif serait d'une tout autre nature.
  select current_setting('server_encoding') into v_encod;
  insert into _res values (1, 'Encodage du serveur',
    case when upper(v_encod) = 'UTF8' then 'OK — ' || v_encod
         else '*** ATTENTION : ' || v_encod || ' ***' end);

  select current_setting('client_encoding') into v_encod;
  insert into _res values (2, 'Encodage du client (cette session)', v_encod);

  -- 2. Combien de fonctions de public portent la signature du mojibake dans leur code source.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  -- `prokind = 'f'` est obligatoire : pg_get_functiondef lève une erreur sur un agrégat ou une
  -- fonction de fenêtrage, et il y en a dans ces schémas (apportées par des extensions).
  where n.nspname in ('public','private') and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%Ã%';
  insert into _res values (3, 'Fonctions contenant la signature mojibake (Ã)',
    case when v_n = 0 then 'OK — 0, rien a corriger'
         else '*** ' || v_n || ' fonction(s) corrompue(s) ***' end);

  -- 3. Lesquelles, nommément.
  insert into _res
  select 4, 'Fonction corrompue : ' || p.proname, 'a reappliquer'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  -- `prokind = 'f'` est obligatoire : pg_get_functiondef lève une erreur sur un agrégat ou une
  -- fonction de fenêtrage, et il y en a dans ces schémas (apportées par des extensions).
  where n.nspname in ('public','private') and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%Ã%';

  -- 4. Un extrait réel, pour voir de ses yeux à quoi ressemble le texte stocké.
  select substring(pg_get_functiondef(p.oid) from '.{0,30}Ã.{0,30}') into v_exemple
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  -- `prokind = 'f'` est obligatoire : pg_get_functiondef lève une erreur sur un agrégat ou une
  -- fonction de fenêtrage, et il y en a dans ces schémas (apportées par des extensions).
  where n.nspname in ('public','private') and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%Ã%'
  limit 1;
  insert into _res values (5, 'Extrait du texte corrompu',
    coalesce(v_exemple, 'aucun — rien de corrompu'));

  -- 5. Contre-épreuve : les accents CORRECTS sont-ils présents quelque part ? Si oui, c'est que
  --    la base sait parfaitement les stocker, et que seules certaines fonctions sont touchées.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  -- `prokind = 'f'` est obligatoire : pg_get_functiondef lève une erreur sur un agrégat ou une
  -- fonction de fenêtrage, et il y en a dans ces schémas (apportées par des extensions).
  where n.nspname in ('public','private') and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ~ '[éèêàçôûîù]';
  insert into _res values (6, 'Fonctions contenant des accents CORRECTS',
    case when v_n > 0 then 'OK — ' || v_n || ' (la base gere bien l UTF-8)'
         else 'aucune — a interpreter avec la ligne 3' end);

  -- 6. Le même contrôle sur les contraintes et les commentaires, au cas où le problème serait
  --    plus large que les seules fonctions.
  select count(*) into v_n
  from pg_constraint where pg_get_constraintdef(oid) like '%Ã%';
  insert into _res values (7, 'Contraintes contenant la signature mojibake',
    case when v_n = 0 then 'OK — 0' else '*** ' || v_n || ' ***' end);
end;
$$;

-- Une seule requête finale : l'éditeur SQL n'affiche que le résultat de la dernière.
select controle, resultat from _res order by n, controle;
