-- VÉRIFICATION APRÈS MISE EN PRODUCTION (lots 1 et 2)
-- ===================================================
-- 100 % LECTURE SEULE : aucune écriture, aucune donnée de test, aucun nettoyage nécessaire.
-- Sans danger en production, relançable autant de fois qu'on veut.
--
-- CE QU'IL FAIT : pour CHAQUE compte réellement existant, il se fait passer pour lui
-- (`set role authenticated` + `request.jwt.claims`, comme le fait PostgREST quand l'app
-- interroge la base) et relit ce que l'application lui montrerait. Si un correctif avait cassé
-- la lecture, la ligne correspondante afficherait l'erreur au lieu d'un décompte.
--
-- POURQUOI COMPTE PAR COMPTE : les policies dépendent de `auth.uid()`. Un feed qui marche pour
-- un compte peut échouer pour un autre (membre d'un groupe, ayant bloqué quelqu'un, sanctionné).
-- Vérifier un seul compte ne prouverait pas grand-chose.
--
-- PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ATTENDU : aucune ligne ne doit contenir « ÉCHEC ». Les décomptes peuvent valoir 0 (un compte
-- sans notification, par exemple) — ce qui compte, c'est qu'aucune lecture ne parte en erreur.

drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  r        record;
  i        int := 0;
  v_posts  bigint;
  v_com    bigint;
  v_notif  bigint;
  v_likes  bigint;
  v_votes  bigint;
  v_feed   bigint;
  v_lines  text[] := '{}';
begin
  for r in select id, pseudo from public.profiles order by created_at loop
    i := i + 1;
    begin
      perform set_config('request.jwt.claims',
                         json_build_object('sub', r.id, 'role', 'authenticated')::text, false);
      set role authenticated;

      select count(*) into v_posts from public.posts;
      select count(*) into v_com   from public.comments;
      select count(*) into v_notif from public.notifications;
      select count(*) into v_likes from public.likes;
      select count(*) into v_votes from public.votes;
      select count(*) into v_feed  from public.posts_feed;

      reset role;

      v_lines := v_lines || format(
        '%s|%s|OK — feed %s / vue %s, commentaires %s, notifs %s, likes %s, votes %s',
        i, r.pseudo, v_posts, v_feed, v_com, v_notif, v_likes, v_votes);

      -- La vue `posts_feed` doit voir exactement les mêmes mains que la table.
      if v_feed <> v_posts then
        v_lines := v_lines || format(
          '%s|%s — cohérence vue/table|*** ÉCHEC : la vue montre %s mains, la table %s ***',
          i, r.pseudo, v_feed, v_posts);
      end if;

    exception when others then
      reset role;
      v_lines := v_lines || format('%s|%s|*** ÉCHEC *** %s', i, r.pseudo, sqlerrm);
    end;
  end loop;

  reset role;
  perform set_config('request.jwt.claims', '', false);

  if i = 0 then
    v_lines := v_lines || '0|PRÉALABLE|Aucun profil en base.'::text;
  end if;

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;
end;
$$;

select controle, resultat from _res order by n, controle;
