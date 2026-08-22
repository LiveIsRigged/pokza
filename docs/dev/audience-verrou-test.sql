-- ══════════════════════════════════════════════════════════════════════════════════════════
-- MESURE DU VERROU D'AUDIENCE — à jouer APRÈS `audience-verrou.sql`, sur la même base
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- N'ÉCRIT RIEN DE DURABLE : tout est dans une transaction qui finit par `rollback`. Les mains et
-- les groupes fabriqués ici n'existeront jamais pour personne.
--
-- ── POURQUOI L'IMPERSONATION EST OBLIGATOIRE ICI
-- Le verrou exempte volontairement tout ce qui n'est pas `authenticated` (cf. l'entête de
-- `audience-verrou.sql` : sans cette exemption, supprimer un groupe deviendrait impossible).
-- Or l'éditeur SQL tourne sous `postgres`. Une vérification écrite naïvement passerait donc par
-- l'exemption et afficherait « autorisé » PARTOUT, en concluant que le verrou ne marche pas —
-- alors qu'on n'aurait mesuré que l'exemption.
--
-- ⚠️ LEÇON DE LA PREMIÈRE VERSION, qui a affiché exactement ce faux négatif : le
-- `set local role authenticated` était DANS un bloc `do $$ … $$`. Il est maintenant au niveau de
-- la TRANSACTION, avant les tentatives. Et les deux premières lignes du résultat disent
-- désormais sous quel rôle le test a tourné et si le trigger était seulement là — sans quoi
-- « verrou absent » et « test mal impersonné » restent indiscernables.
--
-- ── ATTENDU : 10 lignes, toutes en OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

create temp table t_res (ord int, controle text, attendu text, resultat text);
grant all on t_res to authenticated;

create temp table t_ctx (uid uuid, g1 uuid, g2 uuid, p_priv uuid, p_priv2 uuid, p_pub uuid, p_grp uuid, p_grp2 uuid);
grant all on t_ctx to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. FABRICATION DU CAS — sous `postgres`, donc sous l'exemption. Ces écritures ne testent
--    rien, elles préparent. On fabrique plutôt que de chercher une main existante : un profil
--    tiré au hasard peut être banni ou bloqué, et le symptôme est indiscernable d'un verrou
--    qui ne marche pas (piège payé le 22/08).
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid;
  v_g1 uuid;
  v_g2 uuid;
  v_hand jsonb := '{"variant":"nlhe","gameType":"cash","seats":[],"actions":[]}'::jsonb;
  v_priv uuid; v_priv2 uuid; v_pub uuid; v_grp uuid; v_grp2 uuid;
begin
  select p.id into v_uid
  from public.profiles p
  where not private.is_banned(p.id)
  order by p.created_at
  limit 1;

  if v_uid is null then
    raise exception 'Aucun profil utilisable sur cette base : le test ne peut rien mesurer.';
  end if;

  insert into public.groups (name, owner_id) values ('ZZ verrou A', v_uid) returning id into v_g1;
  insert into public.groups (name, owner_id) values ('ZZ verrou B', v_uid) returning id into v_g2;
  insert into public.group_members (group_id, user_id, status, responded_at)
  values (v_g1, v_uid, 'accepted', now()), (v_g2, v_uid, 'accepted', now());

  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ verrou brouillon', v_hand, 'private', null) returning id into v_priv;
  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ verrou brouillon 2', v_hand, 'private', null) returning id into v_priv2;
  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ verrou publique', v_hand, 'public', null) returning id into v_pub;
  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ verrou groupe', v_hand, 'group', v_g1) returning id into v_grp;
  insert into public.posts (author_id, title, hand, visibility, group_id)
  values (v_uid, 'ZZ verrou groupe 2', v_hand, 'group', v_g1) returning id into v_grp2;

  insert into t_ctx values (v_uid, v_g1, v_g2, v_priv, v_priv2, v_pub, v_grp, v_grp2);
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. LE TEST EST-IL SEULEMENT EN ÉTAT DE MESURER ? Ces deux lignes existent parce que sans
--    elles, un verrou absent et un test mal impersonné rendent la MÊME sortie.
-- ══════════════════════════════════════════════════════════════════════════════════════════
insert into t_res values (0, 'le trigger posts_lock_audience est-il pose ici ?', 'present et actif',
  coalesce(
    (select case when t.tgenabled = 'O' then 'OK — present et actif'
                 else 'KO — present mais DESACTIVE (tgenabled=' || t.tgenabled::text || ')' end
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'posts' and t.tgname = 'posts_lock_audience' and not t.tgisinternal),
    'KO — ABSENT : jouer audience-verrou.sql sur CETTE base avant ce test'));

-- L'ORDRE COMPTE : on pose les claims AVANT de changer de rôle, tant qu'on peut encore lire
-- `t_ctx` sans dépendre des droits accordés à `authenticated`.
select set_config('request.jwt.claims',
                  json_build_object('sub', (select uid from t_ctx), 'role', 'authenticated')::text,
                  true);
set local role authenticated;

insert into t_res values (1, 'sous quel role tournent les tentatives ?', 'authenticated',
  case when current_user = 'authenticated'
       then 'OK — authenticated'
       else 'KO — ' || current_user || ' : tout ce qui suit passe par l''EXEMPTION, rien n''est mesure' end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. LES TENTATIVES — dans les conditions de l'app. Chaque essai est dans son propre bloc
--    `begin … exception` : l'échec attendu d'un cas ne doit pas emporter la transaction ni les
--    suivants.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare c record;
begin
  select * into c from t_ctx;

  -- ── CE QUI DOIT RESTER PERMIS ────────────────────────────────────────────────────────────

  begin
    update public.posts set visibility = 'public' where id = c.p_priv;
    insert into t_res values (2, 'brouillon (prive) -> public', 'autorise',
      case when (select visibility from public.posts where id = c.p_priv) = 'public'
           then 'OK — autorise' else 'KO — accepte mais rien n''a change' end);
  exception when others then
    insert into t_res values (2, 'brouillon (prive) -> public', 'autorise', 'KO — refuse : ' || sqlerrm);
  end;

  begin
    update public.posts set visibility = 'group', group_id = c.g1 where id = c.p_priv2;
    insert into t_res values (3, 'brouillon (prive) -> groupe', 'autorise',
      case when (select group_id from public.posts where id = c.p_priv2) = c.g1
           then 'OK — autorise' else 'KO — accepte mais rien n''a change' end);
  exception when others then
    insert into t_res values (3, 'brouillon (prive) -> groupe', 'autorise', 'KO — refuse : ' || sqlerrm);
  end;

  -- Non-régression : le verrou ne porte QUE sur l'audience. « Modifier le post » doit continuer
  -- de fonctionner sur une main publiée — c'est l'écran le plus utilisé des deux.
  begin
    update public.posts set title = 'ZZ verrou titre change' where id = c.p_pub;
    insert into t_res values (4, 'titre d''une main publique (Modifier le post)', 'autorise',
      case when (select title from public.posts where id = c.p_pub) = 'ZZ verrou titre change'
           then 'OK — autorise' else 'KO — accepte mais rien n''a change' end);
  exception when others then
    insert into t_res values (4, 'titre d''une main publique (Modifier le post)', 'autorise', 'KO — refuse : ' || sqlerrm);
  end;

  -- ── CE QUI DOIT ÊTRE REFUSÉ ──────────────────────────────────────────────────────────────

  begin
    update public.posts set visibility = 'private', group_id = null where id = c.p_pub;
    insert into t_res values (5, 'main publique -> privee (le commentateur perd son texte)', 'refuse',
      'KO — AUTORISE, le verrou ne prend pas');
  exception when insufficient_privilege then
    insert into t_res values (5, 'main publique -> privee (le commentateur perd son texte)', 'refuse', 'OK — refuse');
  when others then
    insert into t_res values (5, 'main publique -> privee (le commentateur perd son texte)', 'refuse',
      'A VERIFIER — refuse pour une autre raison : ' || sqlerrm);
  end;

  begin
    update public.posts set visibility = 'group', group_id = c.g1 where id = c.p_pub;
    insert into t_res values (6, 'main publique -> groupe', 'refuse', 'KO — AUTORISE, le verrou ne prend pas');
  exception when insufficient_privilege then
    insert into t_res values (6, 'main publique -> groupe', 'refuse', 'OK — refuse');
  when others then
    insert into t_res values (6, 'main publique -> groupe', 'refuse',
      'A VERIFIER — refuse pour une autre raison : ' || sqlerrm);
  end;

  begin
    update public.posts set visibility = 'public', group_id = null where id = c.p_grp;
    insert into t_res values (7, 'main de groupe -> publique (la fuite de confidentialite)', 'refuse',
      'KO — AUTORISE, le verrou ne prend pas');
  exception when insufficient_privilege then
    insert into t_res values (7, 'main de groupe -> publique (la fuite de confidentialite)', 'refuse', 'OK — refuse');
  when others then
    insert into t_res values (7, 'main de groupe -> publique (la fuite de confidentialite)', 'refuse',
      'A VERIFIER — refuse pour une autre raison : ' || sqlerrm);
  end;

  -- LE PIÈGE : `visibility` ne bouge pas, seul `group_id` change. Un verrou qui ne regarderait
  -- que `visibility` laisserait passer celui-ci — et c'est exactement la même fuite.
  begin
    update public.posts set group_id = c.g2 where id = c.p_grp2;
    insert into t_res values (8, 'main du groupe A -> groupe B (visibility inchangee)', 'refuse',
      'KO — AUTORISE, le verrou ne regarde pas group_id');
  exception when insufficient_privilege then
    insert into t_res values (8, 'main du groupe A -> groupe B (visibility inchangee)', 'refuse', 'OK — refuse');
  when others then
    insert into t_res values (8, 'main du groupe A -> groupe B (visibility inchangee)', 'refuse',
      'A VERIFIER — refuse pour une autre raison : ' || sqlerrm);
  end;

  -- ── NON-RÉGRESSION LA PLUS IMPORTANTE ────────────────────────────────────────────────────
  -- Supprimer un groupe fait repasser ses mains en privé (`revert_group_posts_to_private`),
  -- c'est-à-dire exactement la transition qu'on vient d'interdire. Si l'exemption par
  -- `current_user` ne fonctionnait pas, un groupe contenant une main deviendrait indestructible.
  -- On vise `p_grp2`, resté dans g1 : `p_grp` a pu être déplacé par le cas 7 si le verrou est
  -- absent, et cette ligne mesurerait alors la conséquence du cas 7 au lieu du revert.
  begin
    delete from public.groups where id = c.g1;
    insert into t_res values (9, 'suppression d''un groupe contenant des mains', 'autorise + mains en prive',
      case when exists (select 1 from public.groups where id = c.g1)
             then 'KO — le groupe est toujours la'
           when (select visibility from public.posts where id = c.p_grp2) = 'private'
            and (select group_id from public.posts where id = c.p_grp2) is null
             then 'OK — groupe supprime, mains repassees en prive'
           else 'KO — groupe supprime mais la main est en '
                || coalesce((select visibility from public.posts where id = c.p_grp2), 'introuvable') end);
  exception when others then
    insert into t_res values (9, 'suppression d''un groupe contenant des mains', 'autorise + mains en prive',
      'KO — SUPPRESSION IMPOSSIBLE : ' || sqlerrm);
  end;
end $$;

reset role;

select ord, controle, attendu, resultat from t_res order by ord;

rollback;
