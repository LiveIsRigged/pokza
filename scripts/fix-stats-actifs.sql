-- Correctif « Actifs » / « Jamais revenus » — get_admin_stats()
-- =============================================================
-- Ne touche QUE les 4 tuiles d'activite. Tout le reste du tableau de bord est repris a
-- l'identique de la fonction deployee (recuperee via pg_get_functiondef, pas depuis le dump
-- du repo, qui divergeait sur search_path).
-- Aucun changement d'app ni de schema : effet immediat au prochain chargement de la page Stats.
-- Editeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
-- Editeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new

create or replace function public.get_admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  result   jsonb;
  activite jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Accès réservé aux administrateurs';
  end if;

  -- Activité : "actif" = a OUVERT l'app, et non "a ressaisi ses identifiants".
  -- auth.users.last_sign_in_at n'est écrit qu'à une vraie connexion : le rafraîchissement de jeton
  -- d'une PWA installée (persistSession + autoRefreshToken) ne le touche jamais. Il restait donc figé
  -- au jour de l'inscription — à 42 ms près, mesuré — pour quiconque ne s'était pas redéconnecté :
  -- "Actifs 24 h" tombait à 0 avec 3 joueurs présents le jour même, et "Jamais revenus" comptait
  -- précisément les fidèles, ceux dont la session n'avait jamais été interrompue.
  -- auth.sessions.refreshed_at, lui, bouge à chaque rafraîchissement, donc à chaque ouverture de
  -- l'app (les jetons expirent en 1 h). Il est NULL tant qu'une session n'a jamais été rafraîchie :
  -- on retombe alors sur sa date d'ouverture. Et une déconnexion supprime la session, d'où le
  -- greatest() avec last_sign_in_at, qui survit — sans lui, se déconnecter effacerait son passage.
  select jsonb_build_object(
    'actifs_24h',     count(*) filter (where vue_le > now() - interval '24 hours'),
    'actifs_7j',      count(*) filter (where vue_le > now() - interval '7 days'),
    'actifs_30j',     count(*) filter (where vue_le > now() - interval '30 days'),
    'jamais_revenus', count(*) filter (where vue_le is null or vue_le <= inscrit_le + interval '5 minutes')
  ) into activite
  from (
    select u.created_at as inscrit_le,
           greatest(u.last_sign_in_at, max(coalesce(s.refreshed_at, s.created_at))) as vue_le
    from auth.users u
    left join auth.sessions s on s.user_id = u.id
    group by u.id, u.created_at, u.last_sign_in_at
  ) t;

  select jsonb_build_object(
    'generated_at', now(),

    -- Croissance : inscriptions (auth.users) + courbe des 14 derniers jours (zéros inclus).
    'croissance', jsonb_build_object(
      'inscrits',          (select count(*) from auth.users),
      'nouveaux_24h',      (select count(*) from auth.users where created_at > now() - interval '24 hours'),
      'nouveaux_7j',       (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'nouveaux_30j',      (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'profils_completes', (select count(*) from public.profiles),
      'sans_profil',       (select count(*) from auth.users) - (select count(*) from public.profiles),
      'par_jour', (
        select coalesce(jsonb_agg(jsonb_build_object('jour', d::date, 'n', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        left join (select date(created_at) j, count(*) n from auth.users
                   where created_at >= current_date - interval '13 days' group by 1) c on c.j = d::date
      )
    ),

    -- Activité : calculée plus haut, sur les sessions et non sur last_sign_in_at (voir le commentaire).
    'activite', activite,

    -- Contenu (mains publiées) : volumes, variantes, formats, visibilité + courbe 14 jours.
    'contenu', jsonb_build_object(
      'mains',          (select count(*) from public.posts),
      'mains_24h',      (select count(*) from public.posts where created_at > now() - interval '24 hours'),
      'mains_7j',       (select count(*) from public.posts where created_at > now() - interval '7 days'),
      'posteurs_total', (select count(distinct author_id) from public.posts),
      'posteurs_7j',    (select count(distinct author_id) from public.posts where created_at > now() - interval '7 days'),
      'bomb_pots',      (select count(*) from public.posts where hand->>'bombPot' = 'true'),
      'double_boards',  (select count(*) from public.posts where hand ? 'board2'),
      'avec_sondage',   (select count(*) from public.posts where vote_question is not null),
      'publiques',      (select count(*) from public.posts where visibility = 'public'),
      'privees',        (select count(*) from public.posts where visibility = 'private'),
      'en_groupe',      (select count(*) from public.posts where visibility = 'group'),
      'cash',           (select count(*) from public.posts where coalesce(hand->>'gameType', 'cash') = 'cash'),
      'tournoi',        (select count(*) from public.posts where hand->>'gameType' = 'tournament'),
      'par_variante',   (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb)
                         from (select coalesce(hand->>'variant', 'nlhe') v, count(*) n
                               from public.posts group by 1) t),
      'par_jour', (
        select coalesce(jsonb_agg(jsonb_build_object('jour', d::date, 'n', coalesce(c.n, 0)) order by d), '[]'::jsonb)
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        left join (select date(created_at) j, count(*) n from public.posts
                   where created_at >= current_date - interval '13 days' group by 1) c on c.j = d::date
      )
    ),

    -- Engagement : commentaires racine vs réponses (même table, parent_comment_id), likes, votes.
    'engagement', jsonb_build_object(
      'likes',                  (select count(*) from public.likes),
      'commentaires',           (select count(*) from public.comments where parent_comment_id is null),
      'reponses',               (select count(*) from public.comments where parent_comment_id is not null),
      'votes',                  (select count(*) from public.votes),
      'mains_avec_like',        (select count(distinct post_id) from public.likes),
      'mains_avec_commentaire', (select count(distinct post_id) from public.comments)
    ),

    -- Social : amitiés (friend_requests acceptées) + groupes.
    'social', jsonb_build_object(
      'amities',             (select count(*) from public.friend_requests where status = 'accepted'),
      'demandes_en_attente', (select count(*) from public.friend_requests where status = 'pending'),
      'groupes',             (select count(*) from public.groups),
      'membres_groupes',     (select count(*) from public.group_members)
    ),

    -- Répartitions des profils (préférences déclarées à l'inscription).
    'profils', jsonb_build_object(
      'format_favori',     (select coalesce(jsonb_object_agg(coalesce(format_favori, '?'), n), '{}'::jsonb)
                            from (select format_favori, count(*) n from public.profiles group by 1) t),
      'variante_favorite', (select coalesce(jsonb_object_agg(coalesce(variante_favorite, 'nlhe'), n), '{}'::jsonb)
                            from (select variante_favorite, count(*) n from public.profiles group by 1) t),
      'frequence',         (select coalesce(jsonb_object_agg(coalesce(frequence_jeu, '?'), n), '{}'::jsonb)
                            from (select frequence_jeu, count(*) n from public.profiles group by 1) t)
    ),

    -- Top 8 posteurs.
    'top_posteurs', (
      select coalesce(jsonb_agg(jsonb_build_object('pseudo', pseudo, 'n', n) order by n desc), '[]'::jsonb)
      from (select p.pseudo, count(*) n
            from public.posts po join public.profiles p on p.id = po.author_id
            group by p.pseudo order by n desc limit 8) t
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_stats() from anon;
grant execute on function public.get_admin_stats() to authenticated;
