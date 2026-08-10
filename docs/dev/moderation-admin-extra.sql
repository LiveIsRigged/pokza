-- ============================================================================
-- MODÉRATION — complément back-office admin (écrans « Fiche utilisateur » et
-- « Journal d'audit »). Ces 3 RPC n'étaient PAS dans moderation.sql : à rejouer
-- APRÈS lui, d'abord sur le DEV puis, une fois validé, sur la PROD.
--
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- Idempotent (CREATE OR REPLACE), enveloppé dans une transaction. Toutes les
-- fonctions sont SECURITY DEFINER, gatées is_admin(), et journalisent au besoin.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Fiche modération d'un utilisateur (écran admin 3) — profil + sanctions +
--    volume de contenu + nombre de signalements le visant. Lit user_sanctions
--    (que le client ne peut pas lire directement) via le bypass SECDEF.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_get_user_context(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_profile jsonb;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  select jsonb_build_object(
           'id', pr.id, 'pseudo', pr.pseudo,
           'display_name', public.get_display_name(pr.id),
           'age_confirmed', pr.age_confirmed, 'created_at', pr.created_at)
    into v_profile from public.profiles pr where pr.id = p_user_id;
  return jsonb_build_object(
    'profile', v_profile,
    'sanctions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc)
                           from public.user_sanctions s where s.user_id = p_user_id), '[]'::jsonb),
    'reports_against_user', (select count(*) from public.reports r
                             where r.target_type = 'user' and r.target_id = p_user_id),
    'posts_count',    (select count(*) from public.posts    p where p.author_id = p_user_id),
    'comments_count', (select count(*) from public.comments c where c.author_id = p_user_id)
  );
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Basculer le verrou monétisation age_confirmed (7.3/7.4). Un compte
--    soupçonné mineur passe à false. Journalisé.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_set_age_confirmed(p_user_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  update public.profiles set age_confirmed = p_value where id = p_user_id;
  if not found then raise exception 'Profil introuvable'; end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
    values (auth.uid(), 'set_age_confirmed', 'user', p_user_id, jsonb_build_object('value', p_value));
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Journal d'audit (écran admin 4) — lecture seule de admin_audit_log, que le
--    client ne peut pas lire directement. Nom d'admin résolu via get_display_name.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_audit_log(p_limit int default 100)
returns table (id uuid, admin_id uuid, admin_name text, action text,
               target_type text, target_id uuid, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query
    select a.id, a.admin_id,
           case when a.admin_id is null then null else public.get_display_name(a.admin_id) end,
           a.action, a.target_type, a.target_id, a.details, a.created_at
    from public.admin_audit_log a
    order by a.created_at desc
    limit greatest(1, least(p_limit, 500));
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. REMPLACE admin_set_content_status : en plus de masquer/retirer, prévient
--    l'auteur par une notification 'content_removed' quand le contenu est RETIRÉ
--    (pas sur un simple masquage), avec le lien vers le contenu (bandeau côté app).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_set_content_status(
  p_target_type text, p_target_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_post uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_status not in ('visible','hidden','removed') then raise exception 'Statut invalide'; end if;
  if p_target_type = 'post' then
    update public.posts set mod_status = p_status, mod_reason = p_reason,
        removed_at = case when p_status = 'removed' then now() else null end
      where id = p_target_id
      returning author_id, id into v_author, v_post;
  elsif p_target_type = 'comment' then
    update public.comments set mod_status = p_status, mod_reason = p_reason,
        removed_at = case when p_status = 'removed' then now() else null end
      where id = p_target_id
      returning author_id, post_id into v_author, v_post;
  else raise exception 'Type de cible invalide'; end if;

  -- Accusé à l'auteur uniquement pour un retrait (jamais sur soi-même).
  if p_status = 'removed' and v_author is not null and v_author <> auth.uid() then
    insert into public.notifications(recipient_id, actor_id, type, post_id, comment_id)
      values (v_author, auth.uid(), 'content_removed', v_post,
              case when p_target_type = 'comment' then p_target_id else null end);
  end if;

  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
    values (auth.uid(), 'set_content_status', p_target_type, p_target_id,
            jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

-- ── Droits : gate interne is_admin(), donc exposées à authenticated seulement ──
revoke all on function public.admin_get_user_context(uuid)        from anon;
revoke all on function public.admin_set_age_confirmed(uuid,boolean) from anon;
revoke all on function public.admin_list_audit_log(int)           from anon;
grant execute on function public.admin_get_user_context(uuid)        to authenticated;
grant execute on function public.admin_set_age_confirmed(uuid,boolean) to authenticated;
grant execute on function public.admin_list_audit_log(int)           to authenticated;

commit;

-- ============================================================================
-- Vérif rapide (hors transaction) : les 3 nouvelles RPC existent.
-- ============================================================================
select 'RPC admin extra' as objet,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('admin_get_user_context','admin_set_age_confirmed','admin_list_audit_log'))::text
       || ' / 3' as ok;
