-- ============================================================================
-- Les 3 vues du feed FILTRENT-ELLES TOUJOURS, après l'enveloppement de
-- `post-modifie.sql` ?
--
-- POURQUOI CE FICHIER EXISTE
-- --------------------------
-- `post-modifie.sql` a réécrit `posts_ranked`, `posts_feed` et
-- `posts_feed_with_group` en enveloppant leur définition d'origine. Son
-- récapitulatif dit seulement « la colonne edited_at est là ». C'est le
-- contrôle facile, et ce n'est PAS le risque : le risque, c'est qu'une option
-- de vue (`security_invoker`) ait sauté au passage. Une vue qui perd cette
-- option cesse d'être filtrée par la RLS et se met à tout montrer à tout le
-- monde — sans la moindre erreur, sans rien casser à l'écran.
--
-- Une capture d'écran verte ne peut pas répondre à ça. Il faut se mettre à la
-- place d'un membre et regarder ce qu'il voit vraiment.
--
-- ⚠️ LANCER EN MODE « WITHOUT RLS » (comme `tests-angle-mort.sql`) : le script
--    bascule LUI-MÊME en `authenticated` par impersonation. Lancé autrement, il
--    tourne en `postgres`, contourne toutes les policies, et ne prouve rien.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- CE QUI EST MESURÉ, sur une main PRIVÉE jetable créée puis supprimée :
--   1. un AUTRE membre ne la voit dans AUCUNE des 3 vues  → le vrai test
--   2. ce même membre voit quand même le feed normalement  → attrape la
--      régression inverse (une vue devenue trop filtrante, donc un feed vide)
--   3. l'auteur, lui, retrouve bien sa propre main privée  → attrape la vue
--      qui filtrerait tout, y compris pour son propriétaire
--
-- Le choix des acteurs n'est PAS « les deux premiers profils venus ». Un compte
-- banni ne voit rien ET n'est vu de personne (les vues filtrent sur
-- `not is_banned(author_id)`), un compte bloqué non plus : l'un comme l'autre
-- ferait passer le test au vert sans rien prouver. Le script écarte ces comptes
-- et AFFICHE ceux qu'il a retenus, pour qu'on puisse juger sur pièce.
--
-- ATTENDU : 5 lignes « OK », puis « main d'essai supprimee : OK ».
-- ============================================================================

drop table if exists _res;
drop table if exists _essai;
create temp table _res (n int, mesure text, lu text, verdict text);
create temp table _essai (id uuid);

-- ⚠️ INDISPENSABLE, et c'est ce qui a fait échouer le premier essai : une fois basculé en
-- `authenticated`, le script n'est plus propriétaire de ses propres tables temporaires. Sans ces
-- droits, la première mesure meurt sur « permission denied for table _res » et le rapport ne
-- contient qu'une ligne ERREUR. Même geste que `tests-angle-mort.sql`.
grant all on _res   to authenticated;
grant all on _essai to authenticated;

do $$
declare
  v_auteur     uuid;
  v_observe    uuid;
  v_post       uuid;
  v_nom_a      text;
  v_nom_o      text;
  v_n          bigint;
  v_bloque_ok  boolean;
begin
  -- ── Les deux acteurs ───────────────────────────────────────────────────────
  -- ⚠️ NI BANNI, NI SANCTIONNÉ, des deux côtés. Les vues du feed filtrent sur
  -- `not is_banned(author_id)` : une main d'auteur banni est invisible pour tout
  -- le monde, quelle que soit sa visibilité — le test passerait au vert sans rien
  -- prouver. `is_sanctioned` est écarté en plus par prudence : la première mesure
  -- avait retenu `bob_dev`, dont on sait qu'il est sanctionné sans savoir si sa
  -- sanction est un bannissement. Plutôt que de trancher, on l'écarte ET on
  -- affiche les statuts retenus. Même leçon que `tests-angle-mort.sql`.
  select id into v_auteur
  from public.profiles
  where not public.is_banned(id) and not public.is_sanctioned(id)
  order by created_at limit 1;

  -- Observateur : quelqu'un d'AUTRE, et surtout pas quelqu'un dont l'invisibilité
  -- s'expliquerait déjà par un blocage réciproque avec l'auteur.
  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='blocks') into v_bloque_ok;
  if v_bloque_ok then
    select p.id into v_observe
    from public.profiles p
    where p.id <> v_auteur
      and not public.is_banned(p.id) and not public.is_sanctioned(p.id)
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = p.id and b.blocked_id = v_auteur)
                         or (b.blocker_id = v_auteur and b.blocked_id = p.id))
    order by p.created_at limit 1;
  else
    select id into v_observe from public.profiles
    where id <> v_auteur and not public.is_banned(id) and not public.is_sanctioned(id)
    order by created_at limit 1;
  end if;

  if v_auteur is null or v_observe is null then
    insert into _res (n, mesure, lu, verdict)
    values (0, 'acteurs', 'il faut 2 profils distincts', 'ARRET — mesure impossible');
    return;
  end if;

  select coalesce(pseudo, id::text) into v_nom_a from public.profiles where id = v_auteur;
  select coalesce(pseudo, id::text) into v_nom_o from public.profiles where id = v_observe;
  insert into _res (n, mesure, lu, verdict)
  values (0, '0. acteurs retenus',
          'auteur = ' || v_nom_a || ' · observateur = ' || v_nom_o,
          'ni banni ni sanctionne des deux cotes — sinon la mesure ne prouverait rien');

  -- ── La main privée jetable ────────────────────────────────────────────────
  insert into public.posts (author_id, title, hand, visibility)
  values (
    v_auteur, 'test vues privees',
    '{"id":"test","variant":"nlhe","gameType":"cash","blinds":{"sb":1,"bb":2},
      "effectiveStack":100,"seats":[],"board":{},"actions":[]}'::jsonb,
    'private'
  )
  returning id into v_post;
  insert into _essai values (v_post);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. L'OBSERVATEUR NE DOIT VOIR CETTE MAIN DANS AUCUNE VUE
  -- ══════════════════════════════════════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_observe, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.posts_ranked where id = v_post;
  insert into _res (n, mesure, lu, verdict) values
    (1, '1. main privee d''autrui dans posts_ranked', v_n || ' ligne(s)',
     case when v_n = 0 then 'OK — invisible' else 'KO *** FUITE *** la vue ne filtre plus' end);

  select count(*) into v_n from public.posts_feed where id = v_post;
  insert into _res (n, mesure, lu, verdict) values
    (2, '2. main privee d''autrui dans posts_feed', v_n || ' ligne(s)',
     case when v_n = 0 then 'OK — invisible' else 'KO *** FUITE *** la vue ne filtre plus' end);

  select count(*) into v_n from public.posts_feed_with_group where id = v_post;
  insert into _res (n, mesure, lu, verdict) values
    (3, '3. main privee d''autrui dans posts_feed_with_group', v_n || ' ligne(s)',
     case when v_n = 0 then 'OK — invisible' else 'KO *** FUITE *** la vue ne filtre plus' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. …MAIS IL DOIT TOUJOURS VOIR LE FEED. Sans cette mesure, une vue devenue
  --    entièrement muette passerait les trois contrôles ci-dessus au vert.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from public.posts_ranked;
  insert into _res (n, mesure, lu, verdict) values
    (4, '4. le feed de l''observateur n''est pas vide', v_n || ' main(s) visible(s)',
     case when v_n > 0 then 'OK' else 'KO — la vue ne renvoie plus rien a personne' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. L'AUTEUR, LUI, RETROUVE SA MAIN PRIVÉE
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auteur, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.posts_feed where id = v_post;
  insert into _res (n, mesure, lu, verdict) values
    (5, '5. l''auteur retrouve sa main privee', v_n || ' ligne(s)',
     case when v_n = 1 then 'OK' else 'KO — la vue cache la main a son proprietaire' end);

  set local role postgres;

exception when others then
  set local role postgres;
  insert into _res (n, mesure, lu, verdict)
  values (-1, 'ERREUR', sqlerrm, 'KO — rien n''a ete mesure');
end $$;

-- Ménage par ID, jamais par titre : effacer « par titre » supprimerait la main
-- d'un joueur qui aurait eu l'idée d'appeler la sienne pareil.
delete from public.posts where id in (select id from _essai);

select mesure, lu, verdict from (
  select n, mesure, lu, verdict from _res
  union all
  select 90, 'options des vues (pour information)',
         c.relname || ' : ' || coalesce(array_to_string(c.reloptions, ', '), '(aucune)'),
         'a lire, pas un verdict'
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname in ('posts_ranked','posts_feed','posts_feed_with_group')
  union all
  select 99, 'menage — main d''essai supprimee',
         count(*)::text || ' ligne(s) restante(s)',
         case when count(*) = 0 then 'OK' else 'KO — supprimer a la main' end
  from public.posts where id in (select id from _essai)
) t order by n;
