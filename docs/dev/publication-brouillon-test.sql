-- ══════════════════════════════════════════════════════════════════════════════════════════
-- MESURE — « publier un brouillon, c'est publier maintenant »
-- À jouer APRÈS `publication-brouillon.sql`, sur la même base.
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- N'ÉCRIT RIEN DE DURABLE : transaction terminée par `rollback`. Le compte témoin fabriqué plus
-- bas n'existera jamais pour personne.
--
-- ── UN SECOND COMPTE EST FABRIQUÉ ICI, ET C'EST INDISPENSABLE
-- Depuis le nettoyage du 22/08 il n'y a plus qu'un seul compte par base. Or `notify_group_posted`
-- filtre `gm.user_id <> new.author_id` et `notify_friend_posted` n'écrit que vers des amis : sans
-- second compte, les deux fonctions inséreraient zéro ligne quoi qu'il arrive, et le test
-- afficherait « aucune notification » aussi bien quand tout marche que quand rien ne marche.
-- D'où un témoin créé dans `auth.users`, à l'intérieur de la transaction annulée. Si sa création
-- échoue, les lignes qui en dépendent le DISENT au lieu de rendre un faux verdict.
--
-- ── L'ORDRE DE FABRICATION N'EST PAS ARBITRAIRE
-- Les mains sont créées AVANT l'amitié et l'adhésion au groupe. Sinon l'insertion de la main
-- publique de contrôle enverrait elle-même une notification au témoin, et le garde-fou des 12 h
-- bloquerait ensuite celle qu'on cherche justement à mesurer. Le test se serait sabordé tout seul.
--
-- ── CE QUI N'EST PAS MESURABLE ICI, ET POURQUOI ON NE FAIT PAS SEMBLANT
-- « Une publication directe notifie toujours » ne se remesure pas dans la même transaction : les
-- garde-fous (12 h par ami, 2 h par groupe) bloqueraient la seconde notification, et le zéro
-- obtenu ressemblerait à une régression alors qu'il serait le comportement voulu. Cette
-- non-régression est couverte autrement : les déclencheurs AFTER INSERT d'origine ne sont pas
-- touchés par la migration, et sa dernière ligne de contrôle vérifie qu'ils sont toujours là.
--
-- ── ATTENDU : 9 lignes, toutes en OK.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

create temp table t_res (ord int, controle text, attendu text, resultat text);
grant all on t_res to authenticated;

create temp table t_ctx (uid uuid, temoin uuid, g1 uuid, b1 uuid, b2 uuid, p_pub uuid);
grant all on t_ctx to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. FABRICATION — sous `postgres`. Ne teste rien, prépare.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_uid uuid;
  v_temoin uuid := gen_random_uuid();
  v_g1 uuid;
  v_hand jsonb := '{"variant":"nlhe","gameType":"cash","seats":[],"actions":[]}'::jsonb;
  v_b1 uuid; v_b2 uuid; v_pub uuid;
  v_temoin_ok boolean := false;
begin
  select p.id into v_uid
  from public.profiles p
  where not private.is_banned(p.id)
  order by p.created_at
  limit 1;

  if v_uid is null then
    raise exception 'Aucun profil utilisable sur cette base : le test ne peut rien mesurer.';
  end if;

  -- Le témoin. En cas d'échec on continue sans lui : les lignes 5 et 6 le signaleront.
  begin
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values (v_temoin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'zz-temoin-' || v_temoin::text || '@pokza.test', '', now(), now(), now());
    insert into public.profiles (id, pseudo)
    values (v_temoin, 'ZZ temoin ' || left(v_temoin::text, 8))
    on conflict (id) do nothing;
    v_temoin_ok := true;
  exception when others then
    v_temoin := null;
    insert into t_res values (-1, 'fabrication du compte temoin', 'un second compte',
      'ECHEC — ' || sqlerrm);
  end;

  -- LES MAINS D'ABORD, l'amitié ensuite (cf. entête).
  insert into public.posts (author_id, title, hand, visibility, group_id, created_at)
  values (v_uid, 'ZZ publication controle', v_hand, 'public', null, now() - interval '7 days')
  returning id into v_pub;
  insert into public.posts (author_id, title, hand, visibility, group_id, created_at)
  values (v_uid, 'ZZ brouillon vers public', v_hand, 'private', null, now() - interval '7 days')
  returning id into v_b1;
  insert into public.posts (author_id, title, hand, visibility, group_id, created_at)
  values (v_uid, 'ZZ brouillon vers groupe', v_hand, 'private', null, now() - interval '7 days')
  returning id into v_b2;

  insert into public.groups (name, owner_id) values ('ZZ publication groupe', v_uid) returning id into v_g1;
  insert into public.group_members (group_id, user_id, status, responded_at)
  values (v_g1, v_uid, 'accepted', now());

  if v_temoin_ok then
    insert into public.friend_requests (sender_id, receiver_id, status)
    values (v_uid, v_temoin, 'accepted');
    insert into public.group_members (group_id, user_id, status, responded_at)
    values (v_g1, v_temoin, 'accepted', now());
  end if;

  insert into t_ctx values (v_uid, v_temoin, v_g1, v_b1, v_b2, v_pub);
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. LE TEST EST-IL EN ÉTAT DE MESURER ?
-- ══════════════════════════════════════════════════════════════════════════════════════════
insert into t_res values (0, 'les 3 declencheurs de publication sont poses', '3 sur 3',
  (select case when count(*) = 3 then 'OK — 3 sur 3'
               else 'KO — ' || count(*)::text || ' sur 3 : jouer publication-brouillon.sql sur CETTE base' end
   from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'posts' and not t.tgisinternal
     and t.tgname in ('posts_publish_date', 'trg_notify_friend_published', 'trg_notify_group_published')));

insert into t_res values (1, 'compte temoin disponible', 'oui',
  (select case when temoin is null
               then 'KO — non : les lignes 5 et 6 ne mesureront rien'
               else 'OK — oui' end from t_ctx));

select set_config('request.jwt.claims',
                  json_build_object('sub', (select uid from t_ctx), 'role', 'authenticated')::text,
                  true);
set local role authenticated;

insert into t_res values (2, 'sous quel role tournent les tentatives ?', 'authenticated',
  case when current_user = 'authenticated' then 'OK — authenticated'
       else 'KO — ' || current_user || ' : les regles de l app ne sont pas celles testees' end);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. LES TRANSITIONS, dans les conditions de l'app.
--    `now()` vaut l'heure de DÉBUT de transaction, constante : une date « d'il y a 7 jours »
--    et une date « remise à l'instant » sont donc parfaitement discernables ici.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare c record;
begin
  select * into c from t_ctx;

  begin
    update public.posts set visibility = 'public' where id = c.b1;
    insert into t_res values (3, 'brouillon (7 jours) -> public : la date repart a l instant', 'a l instant',
      case when (select created_at from public.posts where id = c.b1) >= now() - interval '1 minute'
           then 'OK — date remise a l instant'
           else 'KO — date d origine conservee, la main reste enterree dans le fil' end);
  exception when others then
    insert into t_res values (3, 'brouillon (7 jours) -> public : la date repart a l instant', 'a l instant',
      'KO — refuse : ' || sqlerrm);
  end;

  begin
    update public.posts set visibility = 'group', group_id = c.g1 where id = c.b2;
    insert into t_res values (4, 'brouillon (7 jours) -> groupe : la date repart a l instant', 'a l instant',
      case when (select created_at from public.posts where id = c.b2) >= now() - interval '1 minute'
           then 'OK — date remise a l instant'
           else 'KO — date d origine conservee' end);
  exception when others then
    insert into t_res values (4, 'brouillon (7 jours) -> groupe : la date repart a l instant', 'a l instant',
      'KO — refuse : ' || sqlerrm);
  end;

  -- LE TÉMOIN DE LA CONDITION. Les trois déclencheurs portent le MÊME `when` : si celui-ci se
  -- déclenchait sur un update ordinaire, la date d'une main publique bougerait en changeant son
  -- titre. C'est donc ici que se vérifie qu'un simple « Modifier le post » ne réveille personne.
  begin
    update public.posts set title = 'ZZ publication controle 2' where id = c.p_pub;
    insert into t_res values (5, 'titre d une main publique : la date NE bouge pas', 'date inchangee',
      case when (select created_at from public.posts where id = c.p_pub) < now() - interval '6 days'
           then 'OK — date inchangee, un update ordinaire ne declenche rien'
           else 'KO — la date a bougé : la condition du declencheur est trop large' end);
  exception when others then
    insert into t_res values (5, 'titre d une main publique : la date NE bouge pas', 'date inchangee',
      'KO — refuse : ' || sqlerrm);
  end;
end $$;

reset role;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4. LES NOTIFICATIONS — comptées sous `postgres` : elles appartiennent au TÉMOIN, et la RLS de
--    `notifications` ne montre à chacun que les siennes. L'auteur ne peut donc pas les lire.
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare c record;
begin
  select * into c from t_ctx;

  if c.temoin is null then
    insert into t_res values (6, 'publier un brouillon en public previent les amis', '1 notification',
      'NON MESURE — pas de compte temoin');
    insert into t_res values (7, 'publier un brouillon dans un groupe previent le groupe', '1 notification',
      'NON MESURE — pas de compte temoin');
  else
    insert into t_res values (6, 'publier un brouillon en public previent les amis', '1 notification',
      case when (select count(*) from public.notifications n
                  where n.recipient_id = c.temoin and n.post_id = c.b1 and n.type = 'friend_posted') = 1
           then 'OK — l ami est prevenu'
           else 'KO — personne n est prevenu, la main remonte en silence' end);

    insert into t_res values (7, 'publier un brouillon dans un groupe previent le groupe', '1 notification',
      case when (select count(*) from public.notifications n
                  where n.recipient_id = c.temoin and n.post_id = c.b2 and n.type = 'group_posted') = 1
           then 'OK — le groupe est prevenu'
           else 'KO — personne n est prevenu' end);

    -- Chaque fonction filtre sur la visibilité : publier dans un groupe ne doit pas réveiller les
    -- amis, et publier en public ne doit pas réveiller un groupe.
    insert into t_res values (8, 'aucune notification croisee (groupe -> amis, public -> groupe)', '0',
      case when (select count(*) from public.notifications n
                  where (n.post_id = c.b2 and n.type = 'friend_posted')
                     or (n.post_id = c.b1 and n.type = 'group_posted')) = 0
           then 'OK — aucune'
           else 'KO — une notification est partie au mauvais public' end);
  end if;
end $$;

select ord, controle, attendu, resultat from t_res order by ord;

rollback;
