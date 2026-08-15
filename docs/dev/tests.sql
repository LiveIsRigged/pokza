-- SUITE DE TESTS DE SÉCURITÉ — REJOUABLE
-- =============================================================================================
-- Regroupe en un seul script tous les contrôles écrits pendant le chantier de remédiation des
-- lots 1, 2, 5 et 6. À relancer après CHAQUE migration, ou avant chaque mise en production.
--
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LE SCRIPT EST EN DEUX PARTIES, ET C'EST IMPORTANT
--
--   PARTIE A — CONTRÔLES STRUCTURELS. Ne lit que le catalogue de Postgres, n'écrit rien, ne
--   crée rien. Totalement sans risque, y compris en PRODUCTION. C'est le filet de sécurité :
--   il détecte qu'une policy a sauté, qu'un GRANT est revenu, qu'une contrainte a disparu.
--
--   PARTIE B — TESTS FONCTIONNELS PAR IMPERSONATION. Crée un vrai groupe privé, une vraie main,
--   de vrais votes, se fait passer pour un utilisateur qui n'a rien à y faire, puis efface tout.
--   ⚠️ DÉSACTIVÉE PAR DÉFAUT, ET IL FAUT QUE ÇA LE RESTE EN PRODUCTION. Depuis que le webhook
--   push est en place (docs/dev/push-webhook.sql), toute insertion dans `notifications`
--   déclenche un envoi RÉEL vers le téléphone des utilisateurs. Un test qui crée un groupe et
--   une main enverrait donc de vraies notifications à de vraies personnes — et contrairement à
--   une ligne en base, une notification poussée ne se rattrape pas.
--
-- POUR ACTIVER LA PARTIE B (en DEV uniquement) : passer `c_ecritures` à `true` ligne ~230.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- ATTENDU : que des « OK ». Toute ligne commençant par « *** » est une régression.
-- Une seule requête finale : l'éditeur SQL n'affiche que le résultat de la dernière.

drop table if exists _res;
create temp table _res (n int, partie text, controle text, resultat text);


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE A — CONTRÔLES STRUCTURELS (sans écriture, sans risque, PROD incluse)
-- ═════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_n        bigint;
  v_ok       boolean;
  v_storage  boolean;
  v_user     uuid;
  v_msg      text;
  -- Colonnes que le client écrit réellement dans `profiles` (F-04). Une colonne oubliée ici
  -- casse silencieusement l'édition de profil — c'est la liste établie en lisant le client.
  c_maj      text[] := array['pseudo','avatar_url','display_preference','format_favori',
                             'variante_favorite','frequence_jeu','bio','country'];
  -- Colonnes que le client a le droit de LIRE (F-08). `age_confirmed` en est volontairement
  -- absente : c'est un verrou de modération, illisible même par son titulaire.
  c_lec      text[] := array['id','pseudo','avatar_url','display_preference','format_favori',
                             'variante_favorite','frequence_jeu','bio','country','created_at'];
  c_contr    text[] := array['comments_body_length','comments_gif_url_domain',
                             'groups_avatar_url_domain','groups_name_length',
                             'posts_context_length','posts_description_length',
                             'posts_title_length','posts_vote_options_shape',
                             'posts_vote_question_length','profiles_avatar_url_domain',
                             'profiles_pseudo_length','reports_details_length',
                             'reports_email_length'];
  c_vues     text[] := array['posts_feed','posts_feed_with_group','posts_ranked',
                             'comments_feed','notifications_feed'];
begin
  -- ─── Socle : la RLS est-elle seulement active ? ─────────────────────────────────────────
  select count(*) into v_n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  insert into _res values (1, 'A. Socle', 'Tables de public sans RLS',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' table(s) sans RLS ***' end);

  -- Les 5 vues doivent rester en `security_invoker` : sinon elles lisent avec les droits de leur
  -- propriétaire et court-circuitent toute la RLS. C'est le piège Supabase classique.
  select count(*) into v_n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v' and c.relname = any(c_vues)
    and coalesce(array_to_string(c.reloptions, ','), '') ~* 'security_invoker=(on|true)';
  insert into _res values (2, 'A. Socle', 'Vues en security_invoker (5 attendues)',
    case when v_n = 5 then 'OK — 5/5' else '*** ECHEC : ' || v_n || '/5 ***' end);

  -- Une fonction SECURITY DEFINER sans search_path fixé est détournable par un schéma pirate.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (p.proconfig is null
         or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'));
  insert into _res values (3, 'A. Socle', 'Fonctions SECURITY DEFINER sans search_path',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' fonction(s) ***' end);

  -- ─── F-06 : les oracles de modération hors de portée de l'API REST ──────────────────────
  --
  -- ⚠️ LEÇON PAYÉE CHER, LE 15/08/2026. Ces contrôles vérifiaient à l'origine OÙ se trouvaient
  -- les fonctions (« plus dans public, bien dans private »). Or le lot 1 avait cassé tout le
  -- back-office de modération en les déplaçant : une dizaine de fonctions `admin_*` appellent
  -- `public.is_admin()` en toutes lettres dans leur corps, et un corps de fonction résout les
  -- noms à l'exécution. La production répondait « function public.is_admin() does not exist »
  -- pendant que CE TEST affichait « OK », puisque l'absence de la fonction dans `public` était
  -- précisément ce qu'il exigeait.
  --
  -- Ce qui ferme F-06 n'est pas l'emplacement d'une fonction, c'est le DROIT DE L'EXÉCUTER.
  -- On mesure donc les droits, et surtout on vérifie que la porte d'entrée admin répond encore.

  select count(*) into v_n
  from unnest(array['public.is_admin(uuid)','public.is_banned(uuid)',
                    'public.is_sanctioned(uuid)','public.is_blocked_pair(uuid,uuid)',
                    'private.is_admin(uuid)']) f
  cross join unnest(array['anon','authenticated']) as g(role_name)
  where case when to_regprocedure(f) is null then false
             else has_function_privilege(g.role_name, to_regprocedure(f)::oid, 'execute')
        end;
  insert into _res values (4, 'A. F-06', 'Aucun oracle appelable en RPC par le client',
    case when v_n = 0 then 'OK — 0'
         else '*** ECHEC : ' || v_n || ' acces ouvert(s) — l oracle est de retour ***' end);

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('is_admin','is_banned','is_sanctioned','is_blocked_pair');
  insert into _res values (5, 'A. F-06', 'Les 4 implementations restent dans private',
    case when v_n = 4 then 'OK — 4/4' else '*** ECHEC : ' || v_n || '/4 ***' end);

  -- LA preuve que le back-office répond : on se fait passer pour un compte NON administrateur
  -- et on appelle une vraie RPC d'administration. Elle doit refuser en le disant — un refus
  -- pour cause de fonction introuvable serait la régression du 15/08 de retour.
  -- Sans écriture : la fonction lève son exception avant de toucher quoi que ce soit.
  select p.id into v_user
  from public.profiles p
  where not exists (select 1 from public.admins a where a.user_id = p.id)
  order by p.created_at limit 1;

  if v_user is null then
    insert into _res values (6, 'A. F-06', 'La porte d entree admin repond encore',
      'NON TESTABLE — aucun compte non-administrateur ici');
  else
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
      set role authenticated;
      begin
        perform * from public.admin_list_reports();
        v_msg := '*** ECHEC : un compte ordinaire a ete accepte ***';
      exception when others then
        v_msg := sqlerrm;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', false);

      insert into _res values (6, 'A. F-06', 'La porte d entree admin repond encore',
        case when v_msg like '%does not exist%' or v_msg like '%n''existe pas%'
               then '*** ECHEC : back-office casse — ' || v_msg || ' ***'
             when v_msg like '%dministrateur%' then 'OK — refus correct'
             else 'A LIRE : ' || v_msg end);
    exception when others then
      reset role;
      perform set_config('request.jwt.claims', '', false);
      insert into _res values (6, 'A. F-06', 'La porte d entree admin repond encore',
        '*** ERREUR DU TEST *** ' || sqlerrm);
    end;
  end if;

  -- Non-régression : les trois autres DOIVENT rester exécutables, elles sont appelées à
  -- l'intérieur des policies, où l'expression s'évalue avec les droits de celui qui interroge.
  -- Les révoquer ne « durcirait » rien : ça rendrait le feed entièrement illisible.
  -- Le `case` est indispensable : un `or` ne garantit pas l'ordre d'évaluation, et
  -- `to_regprocedure(...)::oid` sur une fonction absente serait évalué quand même.
  select count(*) into v_n
  from unnest(array['private.is_banned(uuid)','private.is_sanctioned(uuid)',
                    'private.is_blocked_pair(uuid,uuid)']) f
  where case when to_regprocedure(f) is null then true
             else not has_function_privilege('authenticated', to_regprocedure(f)::oid, 'execute')
        end;
  insert into _res values (7, 'A. F-06', 'Les 3 helpers des policies restent executables',
    case when v_n = 0 then 'OK — 3/3'
         else '*** ECHEC : ' || v_n || ' manquante(s) — le feed va devenir illisible ***' end);

  -- ─── F-04 : `profiles` en écriture, colonne par colonne ─────────────────────────────────
  -- `has_table_privilege` ne répond « oui » que pour un droit posé au niveau de la TABLE ; les
  -- droits par colonne, eux, ne se voient qu'avec `has_column_privilege`. C'est exactement la
  -- distinction qu'on veut mesurer ici.
  v_ok := has_table_privilege('anon', 'public.profiles', 'update')
       or has_table_privilege('authenticated', 'public.profiles', 'update');
  insert into _res values (8, 'A. F-04', 'Aucun UPDATE global sur profiles',
    case when v_ok then '*** ECHEC : droit global revenu ***' else 'OK — revoque' end);

  select count(*) into v_n from unnest(c_maj) col
  where not has_column_privilege('authenticated', 'public.profiles', col, 'update');
  insert into _res values (9, 'A. F-04', 'Les 8 colonnes editables sont bien accordees',
    case when v_n = 0 then 'OK — 8/8'
         else '*** ECHEC : ' || v_n || ' colonne(s) bloquee(s) — edition de profil cassee ***' end);

  v_ok := has_column_privilege('authenticated', 'public.profiles', 'age_confirmed', 'update')
       or has_column_privilege('authenticated', 'public.profiles', 'age_confirmed', 'select')
       or has_column_privilege('anon', 'public.profiles', 'age_confirmed', 'select');
  insert into _res values (10, 'A. F-04+F-08', 'age_confirmed ni lisible ni ecrivable',
    case when v_ok then '*** ECHEC : le verrou d age est accessible ***' else 'OK' end);

  -- ─── F-08 : `profiles` en lecture, colonne par colonne ──────────────────────────────────
  v_ok := has_table_privilege('anon', 'public.profiles', 'select')
       or has_table_privilege('authenticated', 'public.profiles', 'select');
  insert into _res values (11, 'A. F-08', 'Aucun SELECT global sur profiles',
    case when v_ok then '*** ECHEC : droit global revenu ***' else 'OK — revoque' end);

  select count(*) into v_n from unnest(c_lec) col
  where not has_column_privilege('authenticated', 'public.profiles', col, 'select');
  insert into _res values (12, 'A. F-08', 'Les 10 colonnes publiques restent lisibles',
    case when v_n = 0 then 'OK — 10/10'
         else '*** ECHEC : ' || v_n || ' colonne(s) bloquee(s) — profils vides dans l app ***' end);

  -- ─── F-03 : appartenance au groupe vérifiée à l'écriture ────────────────────────────────
  select count(*) into v_n
  from pg_policies
  where schemaname = 'public' and tablename = 'posts' and permissive = 'RESTRICTIVE'
    and policyname in ('posts group membership on insert','posts group membership on update');
  insert into _res values (13, 'A. F-03', 'Policies restrictives d appartenance (2 attendues)',
    case when v_n = 2 then 'OK — 2/2' else '*** ECHEC : ' || v_n || '/2 ***' end);

  -- ─── F-07 : plus aucune lecture en grand ouvert ─────────────────────────────────────────
  select count(*) into v_n
  from pg_policies
  where schemaname = 'public' and tablename in ('likes','comment_likes','votes')
    and cmd = 'SELECT' and qual = 'true';
  insert into _res values (14, 'A. F-07', 'Plus aucune lecture en USING(true)',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' policy(ies) ouverte(s) ***' end);

  -- ─── F-10 + F-11 : écritures contraintes ────────────────────────────────────────────────
  select count(*) into v_n
  from pg_policies
  where schemaname = 'public' and tablename in ('likes','comment_likes','votes')
    and permissive = 'RESTRICTIVE' and cmd = 'INSERT';
  insert into _res values (15, 'A. F-10+F-11', 'Policies restrictives en ecriture (3 attendues)',
    case when v_n >= 3 then 'OK — ' || v_n else '*** ECHEC : ' || v_n || '/3 ***' end);

  -- ─── F-09 + F-12 : les 13 contraintes d'entrée ──────────────────────────────────────────
  select count(*) into v_n from pg_constraint where conname = any(c_contr);
  insert into _res values (16, 'A. F-09+F-12', 'Contraintes de longueur et de domaine (13)',
    case when v_n = 13 then 'OK — 13/13'
         else '*** ECHEC : ' || v_n || '/13 — manquantes : '
              || (select string_agg(c, ', ')
                  from unnest(c_contr) c
                  where not exists (select 1 from pg_constraint where conname = c)) || ' ***' end);

  -- ─── F-13 : garde-fou du formulaire public de signalement ───────────────────────────────
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reports_before_insert';
  insert into _res values (17, 'A. F-13', 'Fonction de plafonnement des signalements',
    case when v_n >= 1 then 'OK — presente' else '*** ECHEC : absente ***' end);

  -- ─── Durcissement : privilèges inutiles et coûteux ──────────────────────────────────────
  select count(*) into v_n
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['anon','authenticated']) as g(role_name)
  cross join unnest(array['truncate','references','trigger']) as p(priv_name)
  where n.nspname = 'public' and c.relkind in ('r','v','m')
    and has_table_privilege(g.role_name, c.oid, p.priv_name);
  insert into _res values (18, 'A. Durcissement', 'Aucun TRUNCATE / REFERENCES / TRIGGER',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' droit(s) inutile(s) ***' end);

  -- ─── F-05 : stockage. Absent en DEV, et c'est normal (constaté, pas supposé). ───────────
  select exists (select 1 from storage.buckets) into v_storage;
  if v_storage then
    select count(*) into v_n
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Photos de groupe lisibles par les participants';
    insert into _res values (19, 'A. F-05', 'Photos de groupe non enumerables',
      case when v_n = 1 then 'OK — policy en place' else '*** ECHEC : policy absente ***' end);
  else
    insert into _res values (19, 'A. F-05', 'Photos de groupe non enumerables',
      'NON APPLICABLE — aucun bucket dans cet environnement');
  end if;
end;
$$;


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE B — TESTS FONCTIONNELS PAR IMPERSONATION  ⚠️ DEV UNIQUEMENT
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Une requête lancée normalement dans l'éditeur tourne en `postgres` et CONTOURNE toutes les
-- policies : elle ne prouverait rien. D'où `set role authenticated` + `request.jwt.claims`, qui
-- reproduisent exactement les conditions d'un vrai client.
do $$
declare
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  --   METTRE À `true` UNIQUEMENT EN DEV — voir l'avertissement en tête de fichier.
  c_ecritures constant boolean := false;
  -- ═══════════════════════════════════════════════════════════════════════════════════════
  v_a        uuid;   -- l'intrus : membre d'aucun groupe
  v_b        uuid;   -- le propriétaire du groupe privé
  v_group    uuid := gen_random_uuid();
  v_priv     uuid := gen_random_uuid();
  v_pub      uuid := gen_random_uuid();
  v_pseudo   text;
  v_n        bigint;
  v_lines    text[] := '{}';
begin
  if not c_ecritures then
    insert into _res values (30, 'B. Fonctionnel', 'Tests par impersonation',
      'IGNORES — mettre c_ecritures a true, en DEV uniquement (cf. en-tete)');
    return;
  end if;

  select id into v_a from public.profiles order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;
  if v_a is null or v_b is null then
    insert into _res values (30, 'B. Fonctionnel', 'Prealable',
      '*** Il faut au moins 2 profils dans cet environnement ***');
    return;
  end if;
  select pseudo into v_pseudo from public.profiles where id = v_a;

  begin
    -- ═══ Préparation, en tant que postgres (hors RLS) ═══════════════════════════════════
    insert into public.groups (id, name, owner_id) values (v_group, 'TEST-RLS', v_b);
    insert into public.group_members (group_id, user_id, status, invited_by)
      values (v_group, v_b, 'accepted', v_b);

    insert into public.posts (id, author_id, title, hand, visibility, group_id,
                              vote_question, vote_options)
      values (v_priv, v_b, 'TEST-RLS main privee', '{}'::jsonb, 'group', v_group,
              'Call ou fold ?', '["call","fold"]'::jsonb);
    insert into public.likes (post_id, user_id) values (v_priv, v_b);
    insert into public.votes (post_id, user_id, option) values (v_priv, v_b, 'call');

    insert into public.posts (id, author_id, title, hand, visibility,
                              vote_question, vote_options)
      values (v_pub, v_b, 'TEST-RLS main publique', '{}'::jsonb, 'public',
              'Call ou fold ?', '["call","fold"]'::jsonb);

    -- ═══ On devient A, l'intrus ══════════════════════════════════════════════════════════
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_a, 'role', 'authenticated')::text, false);
    set role authenticated;

    -- 31. F-06, LE test critique : le feed doit rester lisible après le déplacement de schéma
    begin
      select count(*) into v_n from public.posts_feed;
      v_lines := v_lines || format('31|F-06 le feed reste lisible|OK — %s main(s)', v_n);
    exception when others then
      v_lines := v_lines || format('31|F-06 le feed reste lisible|*** ECHEC *** %s', sqlerrm);
    end;

    -- 32. La main du groupe privé est invisible pour un non-membre
    select count(*) into v_n from public.posts where id = v_priv;
    v_lines := v_lines || format('32|Main de groupe invisible pour un non-membre|%s',
      case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' visible ***' end);

    -- 33. F-07 — le like posé sur cette main ne doit pas fuiter
    select count(*) into v_n from public.likes where post_id = v_priv;
    v_lines := v_lines || format('33|F-07 le like sur la main privee est invisible|%s',
      case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' lisible ***' end);

    -- 34. F-07 — ni le vote
    select count(*) into v_n from public.votes where post_id = v_priv;
    v_lines := v_lines || format('34|F-07 le vote sur la main privee est invisible|%s',
      case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' lisible ***' end);

    -- 35. F-11 — liker ce qu'on n'a pas le droit de voir
    begin
      insert into public.likes (post_id, user_id) values (v_priv, v_a);
      v_lines := v_lines || '35|F-11 liker la main privee (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '35|F-11 liker la main privee (doit etre refuse)|OK — refuse'::text;
    end;

    -- 36. F-11 — voter sur ce qu'on n'a pas le droit de voir
    begin
      insert into public.votes (post_id, user_id, option) values (v_priv, v_a, 'call');
      v_lines := v_lines || '36|F-11 voter sur la main privee (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '36|F-11 voter sur la main privee (doit etre refuse)|OK — refuse'::text;
    end;

    -- 37. F-10 — voter une option qui n'a jamais été proposée
    begin
      insert into public.votes (post_id, user_id, option) values (v_pub, v_a, 'option-inventee');
      v_lines := v_lines || '37|F-10 voter une option inventee (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '37|F-10 voter une option inventee (doit etre refuse)|OK — refuse'::text;
    end;

    -- 38. F-03 — publier dans un groupe dont on n'est pas membre
    begin
      insert into public.posts (author_id, title, hand, visibility, group_id)
        values (v_a, 'TEST-RLS intrusion', '{}'::jsonb, 'group', v_group);
      v_lines := v_lines || '38|F-03 publier dans le groupe d un autre (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '38|F-03 publier dans le groupe d un autre (doit etre refuse)|OK — refuse'::text;
    end;

    -- 39. F-04 — le verrou d'âge n'est pas déverrouillable par son porteur
    begin
      update public.profiles set age_confirmed = true where id = v_a;
      v_lines := v_lines || '39|F-04 lever son propre verrou d age (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '39|F-04 lever son propre verrou d age (doit etre refuse)|OK — refuse'::text;
    end;

    -- 40. F-09 — la contrainte de longueur du pseudo tient côté base
    begin
      update public.profiles set pseudo = repeat('x', 40) where id = v_a;
      v_lines := v_lines || '40|F-09 pseudo de 40 caracteres (doit etre refuse)|*** ECHEC : accepte ***'::text;
    exception when others then
      v_lines := v_lines || '40|F-09 pseudo de 40 caracteres (doit etre refuse)|OK — refuse'::text;
    end;

    -- ═══ NON-RÉGRESSION — ce qui doit continuer de marcher compte autant ═════════════════
    -- 41. Éditer son propre profil
    begin
      update public.profiles set bio = coalesce(bio, '') where id = v_a;
      v_lines := v_lines || '41|Editer son propre profil (doit passer)|OK'::text;
    exception when others then
      v_lines := v_lines || format('41|Editer son propre profil (doit passer)|*** ECHEC *** %s', sqlerrm);
    end;

    -- 42. Liker une main publique
    begin
      insert into public.likes (post_id, user_id) values (v_pub, v_a);
      v_lines := v_lines || '42|Liker une main publique (doit passer)|OK'::text;
    exception when others then
      v_lines := v_lines || format('42|Liker une main publique (doit passer)|*** ECHEC *** %s', sqlerrm);
    end;

    -- 43. Voter une option légitime
    begin
      insert into public.votes (post_id, user_id, option) values (v_pub, v_a, 'fold');
      v_lines := v_lines || '43|Voter une option legitime (doit passer)|OK'::text;
    exception when others then
      v_lines := v_lines || format('43|Voter une option legitime (doit passer)|*** ECHEC *** %s', sqlerrm);
    end;

    -- 44. La vue du feed remonte bien mon like et mon vote
    begin
      select count(*) into v_n from public.posts_feed
      where id = v_pub and liked_by_me and my_vote = 'fold';
      v_lines := v_lines || format('44|Le feed affiche mon like et mon vote|%s',
        case when v_n = 1 then 'OK' else '*** ECHEC : la vue ne les remonte plus ***' end);
    exception when others then
      v_lines := v_lines || format('44|Le feed affiche mon like et mon vote|*** ECHEC *** %s', sqlerrm);
    end;

    -- 45. Lire un profil : les colonnes publiques oui, `age_confirmed` non
    begin
      select count(*) into v_n from public.profiles where id = v_b;
      v_lines := v_lines || format('45|Lire les colonnes publiques d un profil|%s',
        case when v_n = 1 then 'OK' else '*** ECHEC : profil illisible ***' end);
    exception when others then
      v_lines := v_lines || format('45|Lire les colonnes publiques d un profil|*** ECHEC *** %s', sqlerrm);
    end;

    begin
      select count(*) into v_n from public.profiles where id = v_b and age_confirmed;
      v_lines := v_lines || '46|F-08 lire age_confirmed (doit etre refuse)|*** ECHEC : lisible ***'::text;
    exception when others then
      v_lines := v_lines || '46|F-08 lire age_confirmed (doit etre refuse)|OK — refuse'::text;
    end;

  exception when others then
    v_lines := v_lines || format('98|ERREUR DU SCRIPT|%s', sqlerrm);
  end;

  -- ═══ Remise en état — s'exécute quoi qu'il arrive ═══════════════════════════════════════
  reset role;
  perform set_config('request.jwt.claims', '', false);

  update public.profiles set pseudo = v_pseudo where id = v_a and pseudo is distinct from v_pseudo;

  delete from public.notifications where post_id in (v_priv, v_pub) or group_id = v_group;
  delete from public.votes  where post_id in (v_priv, v_pub);
  delete from public.likes  where post_id in (v_priv, v_pub);
  delete from public.posts  where id in (v_priv, v_pub) or group_id = v_group;
  delete from public.group_members where group_id = v_group;
  delete from public.groups where id = v_group;

  insert into _res
  select split_part(l, '|', 1)::int, 'B. Fonctionnel',
         split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;

  -- Contrôle de propreté : le test ne doit RIEN laisser derrière lui.
  select (select count(*) from public.groups where name = 'TEST-RLS')
       + (select count(*) from public.posts  where title like 'TEST-RLS%') into v_n;
  insert into _res values (97, 'B. Fonctionnel', 'Nettoyage — traces de test restantes',
    case when v_n = 0 then 'OK — 0' else '*** ECHEC : ' || v_n || ' ligne(s) ***' end);
end;
$$;


-- Une seule requête finale : l'éditeur SQL n'affiche que le résultat de la dernière.
select partie, controle, resultat from _res order by n;
