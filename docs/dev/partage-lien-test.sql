-- ══════════════════════════════════════════════════════════════════════════════════════════
-- MESURE DU LIEN DE PARTAGE — à jouer APRÈS `partage-lien.sql`, sur la même base
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- N'ÉCRIT RIEN DE DURABLE : transaction terminée par `rollback`.
--
-- Trois rôles se succèdent, et c'est le sujet même du test : `postgres` fabrique le cas,
-- `authenticated` joue l'auteur et le membre indélicat, `anon` joue l'ami qui reçoit le lien sur
-- WhatsApp. Un test qui resterait sous `postgres` ne mesurerait aucune des trois règles.
--
-- ── ATTENDU : 13 lignes, toutes en OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

create temp table t_res (ord int, controle text, attendu text, resultat text);
grant all on t_res to authenticated, anon;

create temp table t_ctx (
  uid uuid, temoin uuid, g1 uuid,
  p_prive uuid, p_groupe uuid, p_autrui uuid,
  jeton_prive text, jeton_groupe text
);
grant all on t_ctx to authenticated, anon;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. FABRICATION — sous `postgres`. Le témoin est indispensable : sans second compte, le cas
--    « un membre partage la main d'un autre » — la seule règle vraiment restrictive de ce
--    chantier — n'existe tout simplement pas.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid; v_temoin uuid := gen_random_uuid(); v_g1 uuid;
  v_hand jsonb := '{"variant":"nlhe","gameType":"cash","seats":[],"actions":[]}'::jsonb;
  v_prive uuid; v_groupe uuid; v_autrui uuid;
  v_temoin_ok boolean := false;
begin
  select p.id into v_uid from public.profiles p
  where not private.is_banned(p.id) order by p.created_at limit 1;
  if v_uid is null then
    raise exception 'Aucun profil utilisable sur cette base.';
  end if;

  begin
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values (v_temoin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'zz-partage-' || v_temoin::text || '@pokza.test', '', now(), now(), now());
    insert into public.profiles (id, pseudo)
    values (v_temoin, 'ZZ temoin ' || left(v_temoin::text, 8)) on conflict (id) do nothing;
    v_temoin_ok := true;
  exception when others then
    v_temoin := null;
  end;

  insert into public.groups (name, owner_id) values ('ZZ partage groupe', v_uid) returning id into v_g1;
  insert into public.group_members (group_id, user_id, status, responded_at)
  values (v_g1, v_uid, 'accepted', now());

  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ partage main privee', v_hand, 'private', null) returning id into v_prive;
  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ partage main de groupe', v_hand, 'group', v_g1) returning id into v_groupe;

  if v_temoin_ok then
    insert into public.group_members (group_id, user_id, status, responded_at)
    values (v_g1, v_temoin, 'accepted', now());
    -- La main d'AUTRUI dans un groupe dont notre cobaye est membre : il la voit, il ne doit pas
    -- pouvoir en fabriquer un lien public.
    insert into public.posts (author_id, title, hand, visibility, group_id)
    values (v_temoin, 'ZZ partage main d autrui', v_hand, 'group', v_g1) returning id into v_autrui;
  end if;

  insert into t_ctx (uid, temoin, g1, p_prive, p_groupe, p_autrui)
  values (v_uid, v_temoin, v_g1, v_prive, v_groupe, v_autrui);
end $$;

insert into t_res values (1, 'table, policies et fonction de lecture sont posees', 'les 3',
  case when to_regclass('public.post_shares') is not null
        and (select count(*) from pg_policies where schemaname='public' and tablename='post_shares') = 2
        and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='post_by_share_token')
       then 'OK — les 3'
       else 'KO — jouer partage-lien.sql sur CETTE base avant ce test' end);

insert into t_res values (2, 'compte temoin disponible', 'oui',
  (select case when temoin is null then 'KO — non : la ligne 6 ne mesurera rien' else 'OK — oui' end from t_ctx));

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. L'AUTEUR ET LE MEMBRE INDÉLICAT — sous `authenticated`.
-- ══════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
                  json_build_object('sub', (select uid from t_ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t_res values (3, 'sous quel role tournent les tentatives ?', 'authenticated',
  case when current_user = 'authenticated' then 'OK — authenticated'
       else 'KO — ' || current_user || ' : les regles de l app ne sont pas celles testees' end);

do $$
declare c record; v_jeton text; v_jeton2 text;
begin
  select * into c from t_ctx;

  begin
    insert into public.post_shares (post_id, created_by) values (c.p_prive, c.uid)
    returning token into v_jeton;
    update t_ctx set jeton_prive = v_jeton;
    insert into t_res values (4, 'l auteur cree le lien de SA main privee', 'autorise',
      case when v_jeton ~ '^[0-9a-f]{32}$' then 'OK — lien cree, jeton de 128 bits'
           else 'KO — jeton inattendu : ' || coalesce(v_jeton, 'null') end);
  exception when others then
    insert into t_res values (4, 'l auteur cree le lien de SA main privee', 'autorise', 'KO — refuse : ' || sqlerrm);
  end;

  begin
    insert into public.post_shares (post_id, created_by) values (c.p_groupe, c.uid)
    returning token into v_jeton2;
    update t_ctx set jeton_groupe = v_jeton2;
    insert into t_res values (5, 'l auteur cree le lien de SA main de groupe', 'autorise',
      case when v_jeton2 is not null then 'OK — lien cree' else 'KO — pas de jeton' end);
  exception when others then
    insert into t_res values (5, 'l auteur cree le lien de SA main de groupe', 'autorise', 'KO — refuse : ' || sqlerrm);
  end;

  -- ── LA RÈGLE DU CHANTIER ────────────────────────────────────────────────────────────────
  if c.p_autrui is null then
    insert into t_res values (6, 'un membre NE peut PAS partager la main d un AUTRE', 'refuse',
      'NON MESURE — pas de compte temoin');
  else
    begin
      insert into public.post_shares (post_id, created_by) values (c.p_autrui, c.uid);
      insert into t_res values (6, 'un membre NE peut PAS partager la main d un AUTRE', 'refuse',
        'KO — AUTORISE : n importe quel membre peut sortir la main d autrui du groupe');
    exception when insufficient_privilege then
      insert into t_res values (6, 'un membre NE peut PAS partager la main d un AUTRE', 'refuse', 'OK — refuse');
    when others then
      insert into t_res values (6, 'un membre NE peut PAS partager la main d un AUTRE', 'refuse',
        'A VERIFIER — refuse pour une autre raison : ' || sqlerrm);
    end;
  end if;

  -- Repartager ne doit pas fabriquer un second lien vivant.
  begin
    insert into public.post_shares (post_id, created_by) values (c.p_prive, c.uid);
    insert into t_res values (7, 'repartager la meme main ne cree pas un second lien', 'un seul lien',
      'KO — un second lien a ete cree');
  exception when unique_violation then
    insert into t_res values (7, 'repartager la meme main ne cree pas un second lien', 'un seul lien',
      'OK — refuse, le lien reste unique et stable');
  when others then
    insert into t_res values (7, 'repartager la meme main ne cree pas un second lien', 'un seul lien',
      'A VERIFIER — ' || sqlerrm);
  end;
end $$;

reset role;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. L'AMI QUI REÇOIT LE LIEN — sous `anon`, sans aucun jeton d'authentification.
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- Un JSON valide SANS « sub » plutot qu'une chaine vide : `auth.uid()` doit rendre NULL
-- proprement. S'il gardait l'identite de l'auteur, la ligne 11 le laisserait lire ses propres
-- mains et conclurait a tort que la RLS est ouverte.
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

insert into t_res values (8, 'le visiteur est-il vraiment anonyme ?', 'anon, sans identite',
  case when current_user = 'anon' and auth.uid() is null then 'OK — anon, auth.uid() nul'
       else 'KO — ' || current_user || ', auth.uid() = ' || coalesce(auth.uid()::text, 'nul')
            || ' : le test ne mesure pas un visiteur' end);

do $$
declare c record;
begin
  select * into c from t_ctx;

  insert into t_res values (9, 'le lien ouvre la main pour un visiteur sans compte', '1 main',
    case when (select count(*) from public.post_by_share_token(c.jeton_prive)) = 1
         then 'OK — la main s ouvre' else 'KO — le visiteur ne voit rien' end);

  insert into t_res values (10, 'un jeton invente n ouvre rien', '0',
    case when (select count(*) from public.post_by_share_token(repeat('0', 32))) = 0
         then 'OK — rien' else 'KO — un jeton quelconque ouvre une main' end);

  -- NON-RÉGRESSION LA PLUS IMPORTANTE : on n'a PAS ouvert la RLS de `posts`. Connaitre
  -- l'identifiant d'une main ne doit toujours donner strictement aucun accès.
  insert into t_res values (11, 'l identifiant seul (sans jeton) n ouvre toujours rien', '0',
    case when (select count(*) from public.posts where id in (c.p_prive, c.p_groupe)) = 0
         then 'OK — rien : la RLS n a pas ete ouverte'
         else 'KO — DANGER : un visiteur lit une main par son identifiant' end);
end $$;

reset role;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4. LE PARTAGE NE DOIT PAS ÊTRE UN ANGLE MORT DE LA MODÉRATION.
--    La fonction contourne la RLS : elle doit donc refaire elle-même ce que la RLS aurait fait.
-- ══════════════════════════════════════════════════════════════════════════════════════════
update public.posts set mod_status = 'hidden' where id = (select p_prive from t_ctx);

insert into t_res values (12, 'une main masquee par la moderation n est plus joignable par son lien', '0',
  (select case when (select count(*) from public.post_by_share_token(jeton_prive)) = 0
               then 'OK — le lien ne montre plus rien'
               else 'KO — la moderation est contournee par le lien de partage' end from t_ctx));

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 5. LE SEUL RECOURS, FAUTE DE RÉVOCATION (choix assumé du 23/08) : supprimer la main doit
--    emporter son lien. Si la cascade ne jouait pas, un lien survivrait à la main qu'il ouvre.
-- ══════════════════════════════════════════════════════════════════════════════════════════
delete from public.posts where id = (select p_groupe from t_ctx);

insert into t_res values (13, 'supprimer la main emporte son lien', '0 lien',
  (select case when (select count(*) from public.post_shares where post_id = t_ctx.p_groupe) = 0
               then 'OK — le lien disparait avec la main'
               else 'KO — le lien survit a la main' end from t_ctx));

select ord, controle, attendu, resultat from t_res order by ord;

rollback;
