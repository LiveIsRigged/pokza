-- Repart d un schema public VIERGE sur le DEV (un essai precedent a laisse des objets).
-- Sans danger: DEV jetable, et public ne contient que nos objets applicatifs.
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;

-- Schema prod copie pour le projet DEV (miroir fidele: 12 tables, 5 vues security_invoker,
-- 28 fonctions, 37 policies RLS, 17 triggers). Nettoye pour l editeur SQL (retire
-- \restrict/\unrestrict, CREATE/COMMENT SCHEMA public, ALTER DEFAULT PRIVILEGES supabase_admin).
-- A coller dans l editeur SQL du DEV: https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: create_group(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_group(p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_group_id uuid;
begin
  insert into groups (name, owner_id) values (p_name, auth.uid()) returning id into v_group_id;
  insert into group_members (group_id, user_id, status, invited_by, responded_at)
  values (v_group_id, auth.uid(), 'accepted', auth.uid(), now());
  return v_group_id;
end;
$$;


--
-- Name: create_profile(text, text, text, text, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_profile(p_pseudo text, p_display_preference text, p_format_favori text, p_frequence_jeu text, p_prenom text, p_nom text, p_date_naissance date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, pseudo, display_preference, format_favori, frequence_jeu)
  values (auth.uid(), p_pseudo, p_display_preference, p_format_favori, p_frequence_jeu);

  insert into public.profiles_private (id, prenom, nom, date_naissance)
  values (auth.uid(), p_prenom, p_nom, p_date_naissance);
end;
$$;


--
-- Name: delete_own_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_own_account() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;


--
-- Name: get_admin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_stats() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare result jsonb;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'Accès réservé aux administrateurs';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'croissance', jsonb_build_object(
      'inscrits',          (select count(*) from auth.users),
      'nouveaux_24h',      (select count(*) from auth.users where created_at > now() - interval '24 hours'),
      'nouveaux_7j',       (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'nouveaux_30j',      (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'profils_completes', (select count(*) from public.profiles),
      'sans_profil',       (select count(*) from auth.users) - (select count(*) from public.profiles),
      'par_jour', (select coalesce(jsonb_agg(jsonb_build_object('jour', d::date, 'n', coalesce(c.n,0)) order by d), '[]'::jsonb)
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        left join (select date(created_at) j, count(*) n from auth.users where created_at >= current_date - interval '13 days' group by 1) c on c.j = d::date)),
    'activite', jsonb_build_object(
      'actifs_24h',     (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
      'actifs_7j',      (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'actifs_30j',     (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'jamais_revenus', (select count(*) from auth.users where last_sign_in_at is null or last_sign_in_at <= created_at + interval '5 minutes')),
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
      'cash',           (select count(*) from public.posts where coalesce(hand->>'gameType','cash') = 'cash'),
      'tournoi',        (select count(*) from public.posts where hand->>'gameType' = 'tournament'),
      'par_variante',   (select coalesce(jsonb_object_agg(v, n), '{}'::jsonb) from (select coalesce(hand->>'variant','nlhe') v, count(*) n from public.posts group by 1) t),
      'par_jour', (select coalesce(jsonb_agg(jsonb_build_object('jour', d::date, 'n', coalesce(c.n,0)) order by d), '[]'::jsonb)
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        left join (select date(created_at) j, count(*) n from public.posts where created_at >= current_date - interval '13 days' group by 1) c on c.j = d::date)),
    'engagement', jsonb_build_object(
      'likes',                  (select count(*) from public.likes),
      'commentaires',           (select count(*) from public.comments where parent_comment_id is null),
      'reponses',               (select count(*) from public.comments where parent_comment_id is not null),
      'votes',                  (select count(*) from public.votes),
      'mains_avec_like',        (select count(distinct post_id) from public.likes),
      'mains_avec_commentaire', (select count(distinct post_id) from public.comments)),
    'social', jsonb_build_object(
      'amities',             (select count(*) from public.friend_requests where status = 'accepted'),
      'demandes_en_attente', (select count(*) from public.friend_requests where status = 'pending'),
      'groupes',             (select count(*) from public.groups),
      'membres_groupes',     (select count(*) from public.group_members)),
    'profils', jsonb_build_object(
      'format_favori',     (select coalesce(jsonb_object_agg(coalesce(format_favori,'?'), n), '{}'::jsonb) from (select format_favori, count(*) n from public.profiles group by 1) t),
      'variante_favorite', (select coalesce(jsonb_object_agg(coalesce(variante_favorite,'nlhe'), n), '{}'::jsonb) from (select variante_favorite, count(*) n from public.profiles group by 1) t),
      'frequence',         (select coalesce(jsonb_object_agg(coalesce(frequence_jeu,'?'), n), '{}'::jsonb) from (select frequence_jeu, count(*) n from public.profiles group by 1) t)),
    'top_posteurs', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', pseudo, 'n', n) order by n desc), '[]'::jsonb)
      from (select p.pseudo, count(*) n from public.posts po join public.profiles p on p.id = po.author_id group by p.pseudo order by n desc limit 8) t)
  ) into result;
  return result;
end; $$;


--
-- Name: get_display_name(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_display_name(profile_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when p.display_preference = 'nom' then coalesce(pp.prenom || ' ' || pp.nom, p.pseudo)
    else p.pseudo
  end
  from public.profiles p
  left join public.profiles_private pp on pp.id = p.id
  where p.id = profile_id;
$$;


--
-- Name: handle_comment_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_comment_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = comment_count - 1 where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;


--
-- Name: handle_comment_like_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_comment_like_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.comments set like_count = like_count - 1 where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;


--
-- Name: handle_like_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_like_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.posts set like_count = like_count - 1 where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;


--
-- Name: is_group_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid() and status = 'accepted'
  );
$$;


--
-- Name: is_group_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_owner(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from groups where id = p_group_id and owner_id = auth.uid()
  );
$$;


--
-- Name: is_group_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_participant(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;


--
-- Name: mutual_friend_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mutual_friend_count(p_other uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int
  from (
    select case when fr.sender_id = auth.uid() then fr.receiver_id else fr.sender_id end as fid
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (fr.sender_id = auth.uid() or fr.receiver_id = auth.uid())
  ) mine
  join (
    select case when fr.sender_id = p_other then fr.receiver_id else fr.sender_id end as fid
    from public.friend_requests fr
    where fr.status = 'accepted'
      and (fr.sender_id = p_other or fr.receiver_id = p_other)
  ) theirs on mine.fid = theirs.fid;
$$;


--
-- Name: mutual_friends_preview(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mutual_friends_preview(p_other uuid, p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, pseudo text, avatar_url text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.pseudo, p.avatar_url
  from profiles p
  where p.id in (
    select case when fr.sender_id = auth.uid() then fr.receiver_id else fr.sender_id end
    from friend_requests fr
    where fr.status = 'accepted'
      and (fr.sender_id = auth.uid() or fr.receiver_id = auth.uid())
  )
  and p.id in (
    select case when fr2.sender_id = p_other then fr2.receiver_id else fr2.sender_id end
    from friend_requests fr2
    where fr2.status = 'accepted'
      and (fr2.sender_id = p_other or fr2.receiver_id = p_other)
  )
  limit p_limit;
$$;


--
-- Name: notify_comment_like(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_comment_like() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_author_id uuid;
  v_post_id uuid;
begin
  select author_id, post_id into v_author_id, v_post_id from comments where id = new.comment_id;
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (v_author_id, new.user_id, 'comment_like', v_post_id, new.comment_id);
  end if;
  return new;
end;
$$;


--
-- Name: notify_friend_accept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_friend_accept() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into notifications (recipient_id, actor_id, type)
    values (new.sender_id, new.receiver_id, 'friend_accept');
  end if;
  return new;
end;
$$;


--
-- Name: notify_friend_posted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_friend_posted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.visibility <> 'public' then
    return new;
  end if;

  insert into notifications (recipient_id, actor_id, type, post_id)
  select fr.friend_id, new.author_id, 'friend_posted', new.id
  from (
    select case when sender_id = new.author_id then receiver_id else sender_id end as friend_id
    from friend_requests
    where status = 'accepted'
      and (sender_id = new.author_id or receiver_id = new.author_id)
  ) fr
  where not exists (
    select 1 from notifications n
    where n.recipient_id = fr.friend_id
      and n.type = 'friend_posted'
      and n.created_at > now() - interval '12 hours'
  );

  return new;
end;
$$;


--
-- Name: notify_friend_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_friend_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.receiver_id <> new.sender_id then
    insert into notifications (recipient_id, actor_id, type)
    values (new.receiver_id, new.sender_id, 'friend_request');
  end if;
  return new;
end;
$$;


--
-- Name: notify_group_accept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_group_accept() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.invited_by <> new.user_id then
    insert into notifications (recipient_id, actor_id, type, group_id)
    values (new.invited_by, new.user_id, 'group_accept', new.group_id);
  end if;
  return new;
end;
$$;


--
-- Name: notify_group_invite(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_group_invite() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'pending' and new.user_id <> new.invited_by then
    insert into notifications (recipient_id, actor_id, type, group_id)
    values (new.user_id, new.invited_by, 'group_invite', new.group_id);
  end if;
  return new;
end;
$$;


--
-- Name: notify_group_posted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_group_posted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.visibility <> 'group' or new.group_id is null then
    return new;
  end if;

  insert into notifications (recipient_id, actor_id, type, post_id, group_id)
  select gm.user_id, new.author_id, 'group_posted', new.id, new.group_id
  from group_members gm
  where gm.group_id = new.group_id
    and gm.status = 'accepted'
    and gm.user_id <> new.author_id;

  return new;
end;
$$;


--
-- Name: notify_new_comment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_recipient_id uuid;
  v_type text;
begin
  if new.parent_comment_id is not null then
    select author_id into v_recipient_id from comments where id = new.parent_comment_id;
    v_type := 'comment_reply';
  else
    select author_id into v_recipient_id from posts where id = new.post_id;
    v_type := 'post_comment';
  end if;

  if v_recipient_id is not null and v_recipient_id <> new.author_id then
    insert into notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (v_recipient_id, new.author_id, v_type, new.post_id, new.id);
  end if;

  return new;
end;
$$;


--
-- Name: notify_post_like(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_post_like() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from posts where id = new.post_id;
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into notifications (recipient_id, actor_id, type, post_id)
    values (v_author_id, new.user_id, 'post_like', new.post_id);
  end if;
  return new;
end;
$$;


--
-- Name: remove_comment_like_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_comment_like_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from notifications
  where type = 'comment_like' and comment_id = old.comment_id and actor_id = old.user_id;
  return old;
end;
$$;


--
-- Name: remove_friend_request_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_friend_request_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'pending' then
    delete from notifications
    where type = 'friend_request' and recipient_id = old.receiver_id and actor_id = old.sender_id;
  end if;
  return old;
end;
$$;


--
-- Name: remove_group_invite_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_group_invite_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status = 'pending' then
    delete from notifications
    where type = 'group_invite' and recipient_id = old.user_id and group_id = old.group_id;
  end if;
  return old;
end;
$$;


--
-- Name: remove_post_like_notification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_post_like_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from notifications
  where type = 'post_like' and post_id = old.post_id and actor_id = old.user_id;
  return old;
end;
$$;


--
-- Name: revert_group_posts_to_private(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revert_group_posts_to_private() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update posts set visibility = 'private', group_id = null where group_id = old.id;
  return old;
end;
$$;


--
-- Name: suggested_friends(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggested_friends(p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, pseudo text, avatar_url text, mutual_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with my_friends as (
    select case when fr.sender_id = auth.uid() then fr.receiver_id else fr.sender_id end as friend_id
    from friend_requests fr
    where fr.status = 'accepted'
      and (fr.sender_id = auth.uid() or fr.receiver_id = auth.uid())
  ),
  friends_of_friends as (
    select case when fr2.sender_id = mf.friend_id then fr2.receiver_id else fr2.sender_id end as candidate_id
    from my_friends mf
    join friend_requests fr2
      on fr2.status = 'accepted'
      and (fr2.sender_id = mf.friend_id or fr2.receiver_id = mf.friend_id)
  ),
  ranked as (
    select candidate_id, count(*) as mutual_count
    from friends_of_friends
    where candidate_id <> auth.uid()
      and candidate_id not in (select friend_id from my_friends)
      and not exists (
        select 1 from friend_requests fr3
        where (fr3.sender_id = auth.uid() and fr3.receiver_id = candidate_id)
           or (fr3.receiver_id = auth.uid() and fr3.sender_id = candidate_id)
      )
    group by candidate_id
  )
  select p.id, p.pseudo, p.avatar_url, r.mutual_count::int
  from ranked r
  join profiles p on p.id = r.candidate_id
  order by r.mutual_count desc, p.pseudo asc
  limit p_limit;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    parent_comment_id uuid,
    author_id uuid NOT NULL,
    body text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    like_count integer DEFAULT 0 NOT NULL,
    image_path text,
    gif_url text,
    image_width integer,
    image_height integer
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    pseudo text NOT NULL,
    avatar_url text,
    display_preference text DEFAULT 'pseudo'::text NOT NULL,
    format_favori text,
    frequence_jeu text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bio text,
    variante_favorite text DEFAULT 'nlhe'::text NOT NULL,
    CONSTRAINT profiles_bio_length CHECK (((bio IS NULL) OR (char_length(bio) <= 150))),
    CONSTRAINT profiles_display_preference_check CHECK ((display_preference = ANY (ARRAY['pseudo'::text, 'nom'::text]))),
    CONSTRAINT profiles_format_favori_check CHECK ((format_favori = ANY (ARRAY['cash_live'::text, 'cash_online'::text, 'tournoi_live'::text, 'tournoi_online'::text, 'spins'::text]))),
    CONSTRAINT profiles_frequence_jeu_check CHECK ((frequence_jeu = ANY (ARRAY['tres_occasionnel'::text, 'occasionnel'::text, 'regulier'::text, 'tres_regulier'::text]))),
    CONSTRAINT profiles_variante_favorite_check CHECK ((variante_favorite = ANY (ARRAY['nlhe'::text, 'plo'::text, 'plo5'::text])))
);


--
-- Name: comments_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.comments_feed WITH (security_invoker='on') AS
 SELECT c.id,
    c.post_id,
    c.parent_comment_id,
    c.author_id,
    public.get_display_name(c.author_id) AS author_name,
    c.body,
    c.created_at,
    c.like_count,
    (EXISTS ( SELECT 1
           FROM public.comment_likes cl
          WHERE ((cl.comment_id = c.id) AND (cl.user_id = auth.uid())))) AS liked_by_me
   FROM (public.comments c
     JOIN public.profiles pr ON ((pr.id = c.author_id)));


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT friend_requests_check CHECK ((sender_id <> receiver_id)),
    CONSTRAINT friend_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT group_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_url text,
    description text,
    CONSTRAINT groups_description_length CHECK (((description IS NULL) OR (char_length(description) <= 300)))
);


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    type text NOT NULL,
    post_id uuid,
    comment_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_id uuid,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['post_like'::text, 'post_comment'::text, 'comment_reply'::text, 'comment_like'::text, 'friend_request'::text, 'friend_accept'::text, 'friend_posted'::text, 'group_invite'::text, 'group_accept'::text, 'group_posted'::text])))
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    location text,
    buy_in text,
    level text,
    title text NOT NULL,
    description text,
    hand jsonb NOT NULL,
    vote_question text,
    vote_options jsonb,
    like_count integer DEFAULT 0 NOT NULL,
    comment_count integer DEFAULT 0 NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    group_id uuid,
    CONSTRAINT posts_group_visibility_check CHECK ((((visibility = 'group'::text) AND (group_id IS NOT NULL)) OR ((visibility <> 'group'::text) AND (group_id IS NULL))))
);


--
-- Name: notifications_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.notifications_feed WITH (security_invoker='on') AS
 SELECT n.id,
    n.type,
    n.actor_id,
    public.get_display_name(n.actor_id) AS actor_name,
    pr.avatar_url AS actor_avatar_url,
    n.post_id,
    po.title AS post_title,
    po.location AS post_location,
    n.comment_id,
    n.read_at,
    n.created_at,
    n.group_id,
    gr.name AS group_name
   FROM (((public.notifications n
     LEFT JOIN public.profiles pr ON ((pr.id = n.actor_id)))
     LEFT JOIN public.posts po ON ((po.id = n.post_id)))
     LEFT JOIN public.groups gr ON ((gr.id = n.group_id)));


--
-- Name: votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: posts_feed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.posts_feed WITH (security_invoker='on') AS
 SELECT p.id,
    p.author_id,
    public.get_display_name(p.author_id) AS author_name,
    pr.avatar_url AS author_avatar_url,
    p.created_at,
    p.location,
    p.buy_in,
    p.level,
    p.title,
    p.description,
    p.hand,
    p.vote_question,
    p.vote_options,
    COALESCE(( SELECT jsonb_object_agg(v.option, v.cnt) AS jsonb_object_agg
           FROM ( SELECT votes.option,
                    count(*) AS cnt
                   FROM public.votes
                  WHERE (votes.post_id = p.id)
                  GROUP BY votes.option) v), '{}'::jsonb) AS vote_counts,
    ( SELECT votes.option
           FROM public.votes
          WHERE ((votes.post_id = p.id) AND (votes.user_id = auth.uid()))) AS my_vote,
    p.like_count,
    p.comment_count,
    p.visibility,
    (EXISTS ( SELECT 1
           FROM public.likes l
          WHERE ((l.post_id = p.id) AND (l.user_id = auth.uid())))) AS liked_by_me
   FROM (public.posts p
     JOIN public.profiles pr ON ((pr.id = p.author_id)));


--
-- Name: posts_feed_with_group; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.posts_feed_with_group WITH (security_invoker='on') AS
 SELECT pf.id,
    pf.author_id,
    pf.author_name,
    pf.author_avatar_url,
    pf.created_at,
    pf.location,
    pf.buy_in,
    pf.level,
    pf.title,
    pf.description,
    pf.hand,
    pf.vote_question,
    pf.vote_options,
    pf.vote_counts,
    pf.my_vote,
    pf.like_count,
    pf.comment_count,
    pf.visibility,
    pf.liked_by_me,
    p.group_id
   FROM (public.posts_feed pf
     JOIN public.posts p ON ((p.id = pf.id)));


--
-- Name: posts_ranked; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.posts_ranked WITH (security_invoker='on') AS
 SELECT f.id,
    f.author_id,
    f.author_name,
    f.author_avatar_url,
    f.created_at,
    f.location,
    f.buy_in,
    f.level,
    f.title,
    f.description,
    f.hand,
    f.vote_question,
    f.vote_options,
    f.vote_counts,
    f.my_vote,
    f.like_count,
    f.comment_count,
    f.visibility,
    f.liked_by_me,
    r.author_is_friend,
    r.mutual_friend_count,
    ((((
        CASE
            WHEN (r.author_is_friend OR (f.author_id = auth.uid())) THEN 30
            ELSE 0
        END + (LEAST(r.mutual_friend_count, 8) * 3)) +
        CASE
            WHEN ((COALESCE((f.hand ->> 'variant'::text), 'nlhe'::text) = p.pref_variant) AND (COALESCE((f.hand ->> 'gameType'::text), 'cash'::text) = p.pref_game_type)) THEN 5
            ELSE 0
        END))::numeric - (EXTRACT(epoch FROM (now() - f.created_at)) / 86400.0)) AS affinity_score,
    g.group_id,
    g.group_name
   FROM (((public.posts_feed f
     CROSS JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM public.friend_requests fr
                  WHERE ((fr.status = 'accepted'::text) AND (((fr.sender_id = auth.uid()) AND (fr.receiver_id = f.author_id)) OR ((fr.sender_id = f.author_id) AND (fr.receiver_id = auth.uid())))))) AS author_is_friend,
            public.mutual_friend_count(f.author_id) AS mutual_friend_count) r)
     LEFT JOIN LATERAL ( SELECT COALESCE(pr.variante_favorite, 'nlhe'::text) AS pref_variant,
                CASE
                    WHEN (pr.format_favori ~~ 'cash%'::text) THEN 'cash'::text
                    ELSE 'tournament'::text
                END AS pref_game_type
           FROM public.profiles pr
          WHERE (pr.id = auth.uid())) p ON (true))
     LEFT JOIN LATERAL ( SELECT po.group_id,
            gr.name AS group_name
           FROM (public.posts po
             LEFT JOIN public.groups gr ON ((gr.id = po.group_id)))
          WHERE (po.id = f.id)) g ON (true))
  WHERE (f.visibility <> 'private'::text);


--
-- Name: profiles_private; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles_private (
    id uuid NOT NULL,
    prenom text,
    nom text,
    date_naissance date,
    CONSTRAINT profiles_private_age_18_plus CHECK ((date_naissance <= (CURRENT_DATE - '18 years'::interval)))
);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: comment_likes comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (sender_id, receiver_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles_private profiles_private_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles_private
    ADD CONSTRAINT profiles_private_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pseudo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pseudo_key UNIQUE (pseudo);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: notifications_recipient_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_created_idx ON public.notifications USING btree (recipient_id, created_at DESC);


--
-- Name: notifications_recipient_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_unread_idx ON public.notifications USING btree (recipient_id) WHERE (read_at IS NULL);


--
-- Name: comments on_comment_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_comment_change AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_comment_change();


--
-- Name: comment_likes on_comment_like_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_comment_like_change AFTER INSERT OR DELETE ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.handle_comment_like_change();


--
-- Name: likes on_like_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_like_change AFTER INSERT OR DELETE ON public.likes FOR EACH ROW EXECUTE FUNCTION public.handle_like_change();


--
-- Name: comment_likes trg_notify_comment_like; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_comment_like AFTER INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.notify_comment_like();


--
-- Name: friend_requests trg_notify_friend_accept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_friend_accept AFTER UPDATE ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.notify_friend_accept();


--
-- Name: posts trg_notify_friend_posted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_friend_posted AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.notify_friend_posted();


--
-- Name: friend_requests trg_notify_friend_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_friend_request AFTER INSERT ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.notify_friend_request();


--
-- Name: group_members trg_notify_group_accept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_group_accept AFTER UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.notify_group_accept();


--
-- Name: group_members trg_notify_group_invite; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_group_invite AFTER INSERT ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.notify_group_invite();


--
-- Name: posts trg_notify_group_posted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_group_posted AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.notify_group_posted();


--
-- Name: comments trg_notify_new_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_new_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.notify_new_comment();


--
-- Name: likes trg_notify_post_like; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public.notify_post_like();


--
-- Name: comment_likes trg_remove_comment_like_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remove_comment_like_notification AFTER DELETE ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public.remove_comment_like_notification();


--
-- Name: friend_requests trg_remove_friend_request_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remove_friend_request_notification AFTER DELETE ON public.friend_requests FOR EACH ROW EXECUTE FUNCTION public.remove_friend_request_notification();


--
-- Name: group_members trg_remove_group_invite_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remove_group_invite_notification AFTER DELETE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.remove_group_invite_notification();


--
-- Name: likes trg_remove_post_like_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_remove_post_like_notification AFTER DELETE ON public.likes FOR EACH ROW EXECUTE FUNCTION public.remove_post_like_notification();


--
-- Name: groups trg_revert_group_posts_to_private; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_revert_group_posts_to_private BEFORE DELETE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.revert_group_posts_to_private();


--
-- Name: admins admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: groups groups_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: likes likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: posts posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: posts posts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles_private profiles_private_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles_private
    ADD CONSTRAINT profiles_private_id_fkey FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: votes votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: votes votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friend_requests Annuler refuser ou retirer un ami; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Annuler refuser ou retirer un ami" ON public.friend_requests FOR DELETE USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: notifications Chacun lit ses propres notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chacun lit ses propres notifications" ON public.notifications FOR SELECT USING ((recipient_id = auth.uid()));


--
-- Name: notifications Chacun marque ses notifications comme lues; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chacun marque ses notifications comme lues" ON public.notifications FOR UPDATE USING ((recipient_id = auth.uid())) WITH CHECK ((recipient_id = auth.uid()));


--
-- Name: posts Chacun publie en son nom; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chacun publie en son nom" ON public.posts FOR INSERT WITH CHECK ((author_id = auth.uid()));


--
-- Name: friend_requests Envoyer une demande en son nom sauf si deja existante; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Envoyer une demande en son nom sauf si deja existante" ON public.friend_requests FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (status = 'pending'::text) AND (sender_id <> receiver_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.friend_requests r
  WHERE (((r.sender_id = friend_requests.sender_id) AND (r.receiver_id = friend_requests.receiver_id)) OR ((r.sender_id = friend_requests.receiver_id) AND (r.receiver_id = friend_requests.sender_id))))))));


--
-- Name: comments L'auteur modifie son commentaire; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "L'auteur modifie son commentaire" ON public.comments FOR UPDATE USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));


--
-- Name: posts Lecture selon la visibilite; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture selon la visibilite" ON public.posts FOR SELECT USING (((visibility = 'public'::text) OR (author_id = auth.uid()) OR ((visibility = 'group'::text) AND public.is_group_member(group_id))));


--
-- Name: comments Les commentaires sont visibles si le post l'est; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les commentaires sont visibles si le post l'est" ON public.comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = comments.post_id) AND ((p.visibility = 'public'::text) OR (p.author_id = auth.uid()) OR ((p.visibility = 'group'::text) AND public.is_group_member(p.group_id)))))));


--
-- Name: comment_likes Les likes de commentaires sont visibles par tous; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les likes de commentaires sont visibles par tous" ON public.comment_likes FOR SELECT USING (true);


--
-- Name: likes Les likes sont visibles par tous; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les likes sont visibles par tous" ON public.likes FOR SELECT USING (true);


--
-- Name: groups Les membres et invites voient le groupe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les membres et invites voient le groupe" ON public.groups FOR SELECT USING (((owner_id = auth.uid()) OR public.is_group_participant(id)));


--
-- Name: profiles Les profils publics sont visibles par tous; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les profils publics sont visibles par tous" ON public.profiles FOR SELECT USING (true);


--
-- Name: votes Les votes sont visibles par tous; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Les votes sont visibles par tous" ON public.votes FOR SELECT USING (true);


--
-- Name: profiles Modification de son propre profil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Modification de son propre profil" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: group_members Quitter, refuser, annuler ou retirer un membre; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Quitter, refuser, annuler ou retirer un membre" ON public.group_members FOR DELETE USING (((user_id = auth.uid()) OR public.is_group_owner(group_id)));


--
-- Name: posts Seul l auteur modifie sa main; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seul l auteur modifie sa main" ON public.posts FOR UPDATE USING ((author_id = auth.uid())) WITH CHECK ((author_id = auth.uid()));


--
-- Name: posts Seul l auteur supprime sa main; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seul l auteur supprime sa main" ON public.posts FOR DELETE USING ((author_id = auth.uid()));


--
-- Name: group_members Seul le createur invite, et uniquement en attente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seul le createur invite, et uniquement en attente" ON public.group_members FOR INSERT WITH CHECK (((invited_by = auth.uid()) AND (status = 'pending'::text) AND (user_id <> auth.uid()) AND public.is_group_owner(group_id)));


--
-- Name: groups Seul le createur renomme son groupe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seul le createur renomme son groupe" ON public.groups FOR UPDATE USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: groups Seul le createur supprime son groupe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seul le createur supprime son groupe" ON public.groups FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: friend_requests Seul le destinataire peut accepter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seul le destinataire peut accepter" ON public.friend_requests FOR UPDATE USING ((auth.uid() = receiver_id)) WITH CHECK (((auth.uid() = receiver_id) AND (status = 'accepted'::text)));


--
-- Name: group_members Un membre accepte sa propre invitation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un membre accepte sa propre invitation" ON public.group_members FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (status = 'accepted'::text)));


--
-- Name: comments Un utilisateur peut commenter un post qu'il peut voir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut commenter un post qu'il peut voir" ON public.comments FOR INSERT WITH CHECK (((auth.uid() = author_id) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = comments.post_id) AND ((p.visibility = 'public'::text) OR (p.author_id = auth.uid()) OR ((p.visibility = 'group'::text) AND public.is_group_member(p.group_id))))))));


--
-- Name: profiles_private Un utilisateur peut créer ses propres infos privées; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut créer ses propres infos privées" ON public.profiles_private FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Un utilisateur peut créer son propre profil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut créer son propre profil" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: likes Un utilisateur peut liker en son nom; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut liker en son nom" ON public.likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: comment_likes Un utilisateur peut liker un commentaire en son nom; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut liker un commentaire en son nom" ON public.comment_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles_private Un utilisateur peut modifier ses propres infos privées; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut modifier ses propres infos privées" ON public.profiles_private FOR UPDATE USING ((auth.uid() = id));


--
-- Name: likes Un utilisateur peut retirer son propre like; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut retirer son propre like" ON public.likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: comment_likes Un utilisateur peut retirer son propre like de commentaire; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut retirer son propre like de commentaire" ON public.comment_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: votes Un utilisateur peut retirer son propre vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut retirer son propre vote" ON public.votes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: comments Un utilisateur peut supprimer son propre commentaire; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut supprimer son propre commentaire" ON public.comments FOR DELETE USING ((auth.uid() = author_id));


--
-- Name: votes Un utilisateur peut voter en son nom; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Un utilisateur peut voter en son nom" ON public.votes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: friend_requests Visible par l'expediteur ou le destinataire; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visible par l'expediteur ou le destinataire" ON public.friend_requests FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: profiles_private Visible uniquement par son propriétaire; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Visible uniquement par son propriétaire" ON public.profiles_private FOR SELECT USING ((auth.uid() = id));


--
-- Name: group_members Voir sa ligne, celles de son groupe, ou en tant que createur; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Voir sa ligne, celles de son groupe, ou en tant que createur" ON public.group_members FOR SELECT USING (((user_id = auth.uid()) OR public.is_group_owner(group_id) OR public.is_group_member(group_id)));


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: friend_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles_private; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

--
-- Name: admins read own admin row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own admin row" ON public.admins FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION create_group(p_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_group(p_name text) TO anon;
GRANT ALL ON FUNCTION public.create_group(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_group(p_name text) TO service_role;


--
-- Name: FUNCTION create_profile(p_pseudo text, p_display_preference text, p_format_favori text, p_frequence_jeu text, p_prenom text, p_nom text, p_date_naissance date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_profile(p_pseudo text, p_display_preference text, p_format_favori text, p_frequence_jeu text, p_prenom text, p_nom text, p_date_naissance date) TO anon;
GRANT ALL ON FUNCTION public.create_profile(p_pseudo text, p_display_preference text, p_format_favori text, p_frequence_jeu text, p_prenom text, p_nom text, p_date_naissance date) TO authenticated;
GRANT ALL ON FUNCTION public.create_profile(p_pseudo text, p_display_preference text, p_format_favori text, p_frequence_jeu text, p_prenom text, p_nom text, p_date_naissance date) TO service_role;


--
-- Name: FUNCTION delete_own_account(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_own_account() TO anon;
GRANT ALL ON FUNCTION public.delete_own_account() TO authenticated;
GRANT ALL ON FUNCTION public.delete_own_account() TO service_role;


--
-- Name: FUNCTION get_admin_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_stats() TO service_role;


--
-- Name: FUNCTION get_display_name(profile_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_display_name(profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_display_name(profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_display_name(profile_id uuid) TO service_role;


--
-- Name: FUNCTION handle_comment_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_comment_change() TO anon;
GRANT ALL ON FUNCTION public.handle_comment_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_comment_change() TO service_role;


--
-- Name: FUNCTION handle_comment_like_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_comment_like_change() TO anon;
GRANT ALL ON FUNCTION public.handle_comment_like_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_comment_like_change() TO service_role;


--
-- Name: FUNCTION handle_like_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_like_change() TO anon;
GRANT ALL ON FUNCTION public.handle_like_change() TO authenticated;
GRANT ALL ON FUNCTION public.handle_like_change() TO service_role;


--
-- Name: FUNCTION is_group_member(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_member(p_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_member(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_member(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_owner(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_owner(p_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_owner(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_owner(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_participant(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_participant(p_group_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_participant(p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_participant(p_group_id uuid) TO service_role;


--
-- Name: FUNCTION mutual_friend_count(p_other uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mutual_friend_count(p_other uuid) TO anon;
GRANT ALL ON FUNCTION public.mutual_friend_count(p_other uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mutual_friend_count(p_other uuid) TO service_role;


--
-- Name: FUNCTION mutual_friends_preview(p_other uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mutual_friends_preview(p_other uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.mutual_friends_preview(p_other uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.mutual_friends_preview(p_other uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION notify_comment_like(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_comment_like() TO anon;
GRANT ALL ON FUNCTION public.notify_comment_like() TO authenticated;
GRANT ALL ON FUNCTION public.notify_comment_like() TO service_role;


--
-- Name: FUNCTION notify_friend_accept(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_friend_accept() TO anon;
GRANT ALL ON FUNCTION public.notify_friend_accept() TO authenticated;
GRANT ALL ON FUNCTION public.notify_friend_accept() TO service_role;


--
-- Name: FUNCTION notify_friend_posted(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_friend_posted() TO anon;
GRANT ALL ON FUNCTION public.notify_friend_posted() TO authenticated;
GRANT ALL ON FUNCTION public.notify_friend_posted() TO service_role;


--
-- Name: FUNCTION notify_friend_request(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_friend_request() TO anon;
GRANT ALL ON FUNCTION public.notify_friend_request() TO authenticated;
GRANT ALL ON FUNCTION public.notify_friend_request() TO service_role;


--
-- Name: FUNCTION notify_group_accept(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_group_accept() TO anon;
GRANT ALL ON FUNCTION public.notify_group_accept() TO authenticated;
GRANT ALL ON FUNCTION public.notify_group_accept() TO service_role;


--
-- Name: FUNCTION notify_group_invite(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_group_invite() TO anon;
GRANT ALL ON FUNCTION public.notify_group_invite() TO authenticated;
GRANT ALL ON FUNCTION public.notify_group_invite() TO service_role;


--
-- Name: FUNCTION notify_group_posted(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_group_posted() TO anon;
GRANT ALL ON FUNCTION public.notify_group_posted() TO authenticated;
GRANT ALL ON FUNCTION public.notify_group_posted() TO service_role;


--
-- Name: FUNCTION notify_new_comment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_comment() TO anon;
GRANT ALL ON FUNCTION public.notify_new_comment() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_comment() TO service_role;


--
-- Name: FUNCTION notify_post_like(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_post_like() TO anon;
GRANT ALL ON FUNCTION public.notify_post_like() TO authenticated;
GRANT ALL ON FUNCTION public.notify_post_like() TO service_role;


--
-- Name: FUNCTION remove_comment_like_notification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_comment_like_notification() TO anon;
GRANT ALL ON FUNCTION public.remove_comment_like_notification() TO authenticated;
GRANT ALL ON FUNCTION public.remove_comment_like_notification() TO service_role;


--
-- Name: FUNCTION remove_friend_request_notification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_friend_request_notification() TO anon;
GRANT ALL ON FUNCTION public.remove_friend_request_notification() TO authenticated;
GRANT ALL ON FUNCTION public.remove_friend_request_notification() TO service_role;


--
-- Name: FUNCTION remove_group_invite_notification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_group_invite_notification() TO anon;
GRANT ALL ON FUNCTION public.remove_group_invite_notification() TO authenticated;
GRANT ALL ON FUNCTION public.remove_group_invite_notification() TO service_role;


--
-- Name: FUNCTION remove_post_like_notification(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_post_like_notification() TO anon;
GRANT ALL ON FUNCTION public.remove_post_like_notification() TO authenticated;
GRANT ALL ON FUNCTION public.remove_post_like_notification() TO service_role;


--
-- Name: FUNCTION revert_group_posts_to_private(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revert_group_posts_to_private() TO anon;
GRANT ALL ON FUNCTION public.revert_group_posts_to_private() TO authenticated;
GRANT ALL ON FUNCTION public.revert_group_posts_to_private() TO service_role;


--
-- Name: FUNCTION suggested_friends(p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.suggested_friends(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.suggested_friends(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.suggested_friends(p_limit integer) TO service_role;


--
-- Name: TABLE admins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admins TO service_role;
GRANT SELECT ON TABLE public.admins TO authenticated;


--
-- Name: TABLE comment_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comment_likes TO anon;
GRANT ALL ON TABLE public.comment_likes TO authenticated;
GRANT ALL ON TABLE public.comment_likes TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comments TO anon;
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE comments_feed; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comments_feed TO anon;
GRANT ALL ON TABLE public.comments_feed TO authenticated;
GRANT ALL ON TABLE public.comments_feed TO service_role;


--
-- Name: TABLE friend_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friend_requests TO anon;
GRANT ALL ON TABLE public.friend_requests TO authenticated;
GRANT ALL ON TABLE public.friend_requests TO service_role;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: TABLE likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.likes TO anon;
GRANT ALL ON TABLE public.likes TO authenticated;
GRANT ALL ON TABLE public.likes TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: COLUMN notifications.read_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(read_at) ON TABLE public.notifications TO authenticated;


--
-- Name: TABLE posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts TO anon;
GRANT ALL ON TABLE public.posts TO authenticated;
GRANT ALL ON TABLE public.posts TO service_role;


--
-- Name: TABLE notifications_feed; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications_feed TO anon;
GRANT ALL ON TABLE public.notifications_feed TO authenticated;
GRANT ALL ON TABLE public.notifications_feed TO service_role;


--
-- Name: TABLE votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.votes TO anon;
GRANT ALL ON TABLE public.votes TO authenticated;
GRANT ALL ON TABLE public.votes TO service_role;


--
-- Name: TABLE posts_feed; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts_feed TO anon;
GRANT ALL ON TABLE public.posts_feed TO authenticated;
GRANT ALL ON TABLE public.posts_feed TO service_role;


--
-- Name: TABLE posts_feed_with_group; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts_feed_with_group TO anon;
GRANT ALL ON TABLE public.posts_feed_with_group TO authenticated;
GRANT ALL ON TABLE public.posts_feed_with_group TO service_role;


--
-- Name: TABLE posts_ranked; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts_ranked TO anon;
GRANT ALL ON TABLE public.posts_ranked TO authenticated;
GRANT ALL ON TABLE public.posts_ranked TO service_role;


--
-- Name: TABLE profiles_private; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles_private TO anon;
GRANT ALL ON TABLE public.profiles_private TO authenticated;
GRANT ALL ON TABLE public.profiles_private TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


