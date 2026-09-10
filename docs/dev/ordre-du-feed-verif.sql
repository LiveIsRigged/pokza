-- ============================================================================
-- ORDRE DU FEED — LA RECETTE, avec un vrai `auth.uid()`.
--
-- ⚠️ LANCER EN MODE « WITHOUT RLS » (comme `post-modifie-vues-verif.sql`) : le script bascule
--    LUI-MÊME en `authenticated` par impersonation. Lancé autrement il tourne en `postgres`,
--    contourne toutes les policies, et ne prouve RIEN.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- POURQUOI CE FICHIER EXISTE
-- --------------------------
-- Le classement a été vérifié par le rejeu du scénario, par 4000 corpus tirés au sort et par
-- 16 cas de banc sur la géométrie de lecture. Aucun des trois ne prouve la même chose que
-- celui-ci : ils disent que la FORMULE fait ce qu'elle annonce, pas que la VUE rend les bonnes
-- lignes à un vrai lecteur. `auth.uid()` est nul dans l'éditeur SQL — d'où l'impersonation.
--
-- CE QUE ÇA ÉCRIT, ET CE QUE ÇA RESTAURE
-- --------------------------------------
-- Une seule ligne de `post_views`, celle du couple (lecteur d'essai, main d'essai). Elle est
-- photographiée avant, puis remise à l'identique — y compris son absence. Aucune main n'est
-- créée : publier ferait partir de VRAIES notifications à de VRAIES personnes. Et si quoi que ce
-- soit échoue en route, le bloc `exception` défait tout : en plpgsql, un gestionnaire d'exception
-- ouvre une sous-transaction, donc tout ce qui précède l'erreur est annulé.
-- ============================================================================

drop table if exists _res;
drop table if exists _snap;
create temp table _res  (n int, mesure text, lu text, verdict text);
create temp table _snap (user_id uuid, post_id uuid, read_count int,
                         last_read_at timestamptz, reactions_at_read int, existait boolean);

do $$
declare
  v_user uuid; v_post uuid; v_cand uuid;
  v_age numeric; v_score0 numeric; v_score1 numeric; v_bonus numeric; v_attendu numeric;
  v_rc int; v_lect numeric; v_unread boolean; v_n int;
  v_ordre1 uuid[]; v_ordre2 uuid[];
begin
  -- ══════════════════════════════════════════════════════════════════════════
  -- 0. UN LECTEUR RÉEL, ET UNE MAIN QUI N'EST PAS LA SIENNE
  --    Les bannis sont écartés : sur le DEV, tirer un profil au hasard tombe dessus, et la policy
  --    RESTRICTIVE masque alors ses mains — le compteur semble faux alors que c'est le banc.
  -- ══════════════════════════════════════════════════════════════════════════
  for v_cand in select id from (
      select p.id from public.profiles p
       where not private.is_banned(p.id) order by p.id limit 50
    ) c
  loop
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_cand, 'role', 'authenticated')::text, true);
    select r.id into v_post from public.posts_ranked r where r.author_id <> v_cand limit 1;
    set local role postgres;
    if v_post is not null then v_user := v_cand; exit; end if;
  end loop;

  if v_post is null then
    insert into _res values (0, '0. lecteur d''essai', 'aucun',
      'KO — personne ne voit de main d''un autre auteur : rien n''est mesurable');
    return;
  end if;
  insert into _res values (0, '0. lecteur d''essai',
    substr(v_user::text, 1, 8) || ' sur la main ' || substr(v_post::text, 1, 8), 'pour information');

  -- Photo de la ligne existante, puis table rase : sans ça, un lecteur ayant déjà vu cette main
  -- dans les 12 dernières heures ferait échouer le test de l'anti-rebond pour la mauvaise raison.
  insert into _snap
    select pv.user_id, pv.post_id, pv.read_count, pv.last_read_at, pv.reactions_at_read, true
      from public.post_views pv where pv.user_id = v_user and pv.post_id = v_post;
  if not found then
    insert into _snap values (v_user, v_post, null, null, null, false);
  end if;
  delete from public.post_views where user_id = v_user and post_id = v_post;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. LA VUE REND QUELQUE CHOSE DE SENSÉ À CE LECTEUR
  -- ══════════════════════════════════════════════════════════════════════════
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.posts_ranked;
  insert into _res values (1, '1. le fil n''est pas vide', v_n || ' main(s)',
    case when v_n > 0 then 'OK' else 'KO — la vue ne rend rien' end);

  select count(*) into v_n from public.posts_ranked r where r.feed_score is null;
  insert into _res values (2, '2. aucun score nul', v_n || ' main(s) a NULL',
    case when v_n = 0 then 'OK' else 'KO — un NULL quelque part fait disparaitre la main du tri' end);

  -- Sur une main NON LUE, `age apparent = age reel`, donc `bonus = age - score`. C'est la seule
  -- facon de lire le bonus depuis la vue, qui ne l'expose pas.
  select count(*), coalesce(max(extract(epoch from (now() - r.created_at)) / 86400.0 - r.feed_score), 0)
    into v_n, v_bonus
    from public.posts_ranked r where r.is_unread;
  insert into _res values (3, '3. le bonus reste un departage (plafond 2 j)',
    'max ' || round(v_bonus, 3) || ' j sur ' || v_n || ' main(s) non lue(s)',
    case when v_bonus <= 2.001 then 'OK' else 'KO — le bareme depasse son plafond' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. LIRE UNE MAIN LA VIEILLIT — le coeur du chantier
  -- ══════════════════════════════════════════════════════════════════════════
  select extract(epoch from (now() - r.created_at)) / 86400.0, r.feed_score, r.is_unread, r.lectures
    into v_age, v_score0, v_unread, v_lect
    from public.posts_ranked r where r.id = v_post;
  insert into _res values (4, '4. avant lecture : non lue',
    'lectures=' || round(v_lect, 3) || ' · non_lue=' || v_unread,
    case when v_unread and v_lect = 0 then 'OK' else 'KO — la main est deja comptee comme lue' end);

  perform public.mark_post_read(v_post);

  select r.feed_score, r.is_unread, r.read_count, r.lectures
    into v_score1, v_unread, v_rc, v_lect
    from public.posts_ranked r where r.id = v_post;
  insert into _res values (5, '5. apres lecture : comptee une fois',
    'read_count=' || v_rc || ' · lectures=' || round(v_lect, 3) || ' · non_lue=' || v_unread,
    case when v_rc = 1 and v_lect = 1 and not v_unread then 'OK'
         else 'KO — mark_post_read n''a pas fait son office' end);

  -- k = 3 et F = 5 j sur la main d'un autre : le score doit bondir de `3 x age + 5`.
  v_attendu := 3 * v_age + 5;
  insert into _res values (6, '6. la lecture vaut 3 x age + 5 jours',
    'attendu ' || round(v_attendu, 2) || ' j · obtenu ' || round(v_score1 - v_score0, 2) || ' j',
    case when abs((v_score1 - v_score0) - v_attendu) < 0.01 then 'OK'
         else 'KO — le bareme du vieillissement ne s''applique pas' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. LES TROIS GARDE-FOUS
  -- ══════════════════════════════════════════════════════════════════════════
  perform public.mark_post_read(v_post);
  select r.read_count into v_rc from public.posts_ranked r where r.id = v_post;
  insert into _res values (7, '7. anti-rebond 12 h : relire ne recompte pas', 'read_count=' || v_rc,
    case when v_rc = 1 then 'OK' else 'KO — descendre puis remonter le fil vaudrait 3 lectures' end);

  -- REMONTEE. On recule l'instantane de 3 reactions : la difference devient 3, donc r = 3 annule
  -- la lecture et la main redevient « jamais lue ». C'est ce qui la fait repasser AU-DESSUS du
  -- bloc des mains lues — la remontee traverse la frontiere au lieu de buter dessus.
  set local role postgres;
  update public.post_views set reactions_at_read = reactions_at_read - 3
    where user_id = v_user and post_id = v_post;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select r.lectures, r.is_unread into v_lect, v_unread from public.posts_ranked r where r.id = v_post;
  insert into _res values (8, '8. 3 reactions annulent la lecture (r = 3)',
    'lectures=' || round(v_lect, 3) || ' · non_lue=' || v_unread,
    case when v_lect = 0 and v_unread then 'OK' else 'KO — reagir ne rajeunit plus' end);

  -- PLAFOND A 5. On force l'etat plutot que d'attendre cinq fenetres de 12 h.
  set local role postgres;
  update public.post_views
     set read_count = 5, last_read_at = now() - interval '13 hours',
         reactions_at_read = reactions_at_read + 3
   where user_id = v_user and post_id = v_post;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform public.mark_post_read(v_post);
  select r.read_count into v_rc from public.posts_ranked r where r.id = v_post;
  insert into _res values (9, '9. plafond a 5 lectures', 'read_count=' || v_rc,
    case when v_rc = 5 then 'OK'
         else 'KO — sans plafond, une main assez croisee sort definitivement du jeu' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. LA COMPOSITION DE PAGE
  -- ══════════════════════════════════════════════════════════════════════════
  select array_agg(f.post_id order by f.feed_rank) into v_ordre1 from public.feed_order() f;
  select array_agg(f.post_id order by f.feed_rank) into v_ordre2 from public.feed_order() f;
  insert into _res values (10, '10. feed_order() est deterministe',
    coalesce(array_length(v_ordre1, 1), 0) || ' main(s)',
    case when v_ordre1 is not distinct from v_ordre2 then 'OK'
         else 'KO — deux appels rendent deux ordres : les pages sauteraient des mains' end);

  select count(*) into v_n from public.posts_ranked;
  insert into _res values (11, '11. feed_order() ne perd aucune main',
    coalesce(array_length(v_ordre1, 1), 0) || ' sur ' || v_n,
    case when coalesce(array_length(v_ordre1, 1), 0)
              = least(v_n, coalesce((select page_depth from public.feed_tuning), 200))
         then 'OK' else 'KO — des mains disparaissent a la composition' end);

  -- LA PARTITION, l'invariant absolu : aucune main jamais lue n'est masquee par une main deja
  -- lue. Le plancher de decouverte ne peut pas le violer — il ne force QUE des mains non lues.
  select count(*) into v_n from (
    select f.feed_rank, r.is_unread,
           max(case when not r.is_unread then f.feed_rank end)
             over (order by f.feed_rank rows between unbounded preceding and 1 preceding) as lue_avant
      from public.feed_order() f join public.posts_ranked r on r.id = f.post_id
  ) t where t.is_unread and t.lue_avant is not null;
  insert into _res values (12, '12. aucune main non lue derriere une main lue',
    v_n || ' violation(s)',
    case when v_n = 0 then 'OK' else 'KO — du contenu non lu est masque : la panne d''origine' end);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. REMISE EN ÉTAT
  -- ══════════════════════════════════════════════════════════════════════════
  set local role postgres;
  delete from public.post_views where user_id = v_user and post_id = v_post;
  insert into public.post_views (user_id, post_id, read_count, last_read_at, reactions_at_read)
    select s.user_id, s.post_id, s.read_count, s.last_read_at, s.reactions_at_read
      from _snap s where s.existait;

exception when others then
  set local role postgres;
  insert into _res values (-1, 'ERREUR', sqlerrm,
    'KO — rien n''a ete mesure, et le gestionnaire a tout defait');
end $$;

-- Le `set local role` du bloc DO est retombé avec sa transaction : cette lecture se fait donc
-- avec le rôle de l'éditeur, celui-là même qui a lancé le script.
select mesure, lu, verdict from (
  select n, mesure, lu, verdict from _res
  union all
  select 98, 'remise en etat de post_views',
         case when s.existait then 'ligne d''origine restauree' else 'aucune ligne, comme avant' end,
         case when (select count(*) from public.post_views pv
                     where pv.user_id = s.user_id and pv.post_id = s.post_id)
                  = case when s.existait then 1 else 0 end
              then 'OK' else 'KO *** nettoyer a la main ***' end
    from _snap s
  union all
  select 99, 'reglages en vigueur',
         'k=' || t.k_other || '/' || t.k_own || ' · F=' || t.f_other || '/' || t.f_own ||
         ' · r=' || t.reactions_per_read || ' · plafond=' || t.read_cap ||
         ' · plancher=' || t.floor_first_discovery || '/' || t.floor_second_discovery,
         'a lire, pas un verdict'
    from public.feed_tuning t
) x order by n;
