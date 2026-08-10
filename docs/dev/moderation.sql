-- ============================================================================
-- MODÉRATION — migration (spec sections 1 à 10). Modération réactive uniquement.
-- À TESTER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois tout vert avec seed.sql + tests.sql, on rejoue ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent : re-jouable sans risque. Tout est enveloppé dans une transaction.
-- Principe d'application : la RLS des TABLES DE BASE est le vrai périmètre (clé anon publique) ;
-- les 5 vues sont en security_invoker=on et en héritent automatiquement.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. COLONNES DE MODÉRATION (posts/comments) + verrou mineur (profiles)
--    mod_status est DISTINCT de posts.visibility (public/private/group = portée
--    sociale) : ici c'est l'état de modération.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.posts    add column if not exists mod_status text not null default 'visible';
alter table public.posts    add column if not exists removed_at timestamptz;
alter table public.posts    add column if not exists mod_reason text;
alter table public.comments add column if not exists mod_status text not null default 'visible';
alter table public.comments add column if not exists removed_at timestamptz;
alter table public.comments add column if not exists mod_reason text;
-- Verrou monétisation (7.4) : true par défaut car l'inscription impose déjà ≥18 ;
-- un admin le passe à false sur un compte « soupçonné mineur ».
alter table public.profiles add column if not exists age_confirmed boolean not null default true;

alter table public.posts    drop constraint if exists posts_mod_status_check;
alter table public.posts    add  constraint posts_mod_status_check    check (mod_status in ('visible','hidden','removed'));
alter table public.comments drop constraint if exists comments_mod_status_check;
alter table public.comments add  constraint comments_mod_status_check check (mod_status in ('visible','hidden','removed'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. NOUVELLES TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- 2.1 reports — cible polymorphe (post/comment/user), voie in-app OU hors-app.
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references auth.users(id) on delete set null, -- null = hors-app ; SET NULL = anonymisation à la suppression de compte (9.2)
  reporter_email    text,
  source            text not null default 'app'    check (source in ('app','public_form','email')),
  target_type       text not null                  check (target_type in ('post','comment','user')),
  target_id         uuid not null,
  reason            text not null                  check (reason in (
                       'insultes_harcelement','haine_discrimination','sexuel_choquant','usurpation_identite','spam',
                       'operateur_illegal','arnaque','sollicitation_commerciale','compte_mineur')),
  details           text,
  status            text not null default 'open'   check (status in ('open','reviewing','actioned','dismissed')),
  severity          text not null default 'normal' check (severity in ('normal','priority')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id) on delete set null,
  resolution_reason text
);
-- Anti-abus (2.5) : un même compte ne peut pas signaler deux fois la même cible.
create unique index if not exists reports_no_dup
  on public.reports (reporter_id, target_type, target_id) where reporter_id is not null;
create index if not exists reports_status_idx   on public.reports (status);
create index if not exists reports_target_idx   on public.reports (target_type, target_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);

-- 2.2 user_sanctions
create table if not exists public.user_sanctions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('warning','suspended','banned')),
  reason     text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                                  -- null = définitif
  issued_by  uuid references auth.users(id) on delete set null,
  lifted_at  timestamptz,                                  -- réversibilité (4.7)
  lifted_by  uuid references auth.users(id) on delete set null
);
create index if not exists user_sanctions_user_idx on public.user_sanctions (user_id);

-- 2.3 blocks — relation orientée, masquage mutuel appliqué en RLS.
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- 2.4 admin_audit_log
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. TYPES DE NOTIFICATION étendus (accusé de traitement 2.6, avertissement 4.4)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add  constraint notifications_type_check check (type = any (array[
  'post_like','post_comment','comment_reply','comment_like','friend_request','friend_accept',
  'friend_posted','group_invite','group_accept','group_posted',
  'report_resolved','content_removed','account_sanctioned']));

-- ────────────────────────────────────────────────────────────────────────────
-- 4. HELPERS booléens (SECURITY DEFINER : ne renvoient qu'un bool, zéro fuite ;
--    contournent la RLS de blocks/user_sanctions/admins que l'utilisateur ne lit pas).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = p_user);
$$;

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.is_sanctioned(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from public.user_sanctions s
    where s.user_id = p_user and s.type in ('suspended','banned')
      and s.lifted_at is null and (s.expires_at is null or s.expires_at > now())
  );
$$;

create or replace function public.is_banned(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from public.user_sanctions s
    where s.user_id = p_user and s.type = 'banned'
      and s.lifted_at is null and (s.expires_at is null or s.expires_at > now())
  );
$$;

grant execute on function public.is_admin(uuid), public.is_blocked_pair(uuid,uuid),
                          public.is_sanctioned(uuid), public.is_banned(uuid) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS + GRANTS des nouvelles tables
--    Note : Supabase a des DEFAULT PRIVILEGES qui accordent tout à anon/authenticated
--    sur les nouvelles tables → on REVOQUE explicitement puis on ré-accorde le minimum.
-- ────────────────────────────────────────────────────────────────────────────

-- reports : insertion de son propre signalement, lecture de SES signalements seulement.
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
drop policy if exists "reports insert own app"  on public.reports;
create policy "reports insert own app" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and source = 'app' and not public.is_sanctioned(auth.uid()));
drop policy if exists "reports select own" on public.reports;
create policy "reports select own" on public.reports for select to authenticated
  using (reporter_id = auth.uid());
grant select, insert on public.reports to authenticated;

-- user_sanctions : AUCUN accès utilisateur (RLS active + aucune policy + aucun grant).
alter table public.user_sanctions enable row level security;
revoke all on public.user_sanctions from anon, authenticated;

-- blocks : chacun gère UNIQUEMENT ses propres blocages (discrétion 3.7).
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
drop policy if exists "blocks own select" on public.blocks;
create policy "blocks own select" on public.blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists "blocks own insert" on public.blocks;
create policy "blocks own insert" on public.blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
drop policy if exists "blocks own delete" on public.blocks;
create policy "blocks own delete" on public.blocks for delete to authenticated using (blocker_id = auth.uid());
grant select, insert, delete on public.blocks to authenticated;

-- admin_audit_log : AUCUN accès utilisateur.
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS RESTRICTIVE sur le contenu existant (modération + blocage + bannissement
--    + sanctions). Restrictive = ANDé avec les policies permissives existantes,
--    sans réécrire ces dernières.
-- ────────────────────────────────────────────────────────────────────────────

-- posts en lecture : masqué si retiré (sauf pour son auteur → bandeau), si l'auteur
-- est bloqué (mutuel) ou banni.
drop policy if exists "posts moderation and blocks" on public.posts;
create policy "posts moderation and blocks" on public.posts as restrictive for select
  using (
    (mod_status = 'visible' or author_id = auth.uid())
    and not public.is_blocked_pair(auth.uid(), author_id)
    and not public.is_banned(author_id)
  );

-- posts en écriture : suspendu/banni ne peut plus publier.
drop policy if exists "posts no insert when sanctioned" on public.posts;
create policy "posts no insert when sanctioned" on public.posts as restrictive for insert
  with check (not public.is_sanctioned(auth.uid()));

-- comments en lecture / écriture : mêmes règles.
drop policy if exists "comments moderation and blocks" on public.comments;
create policy "comments moderation and blocks" on public.comments as restrictive for select
  using (
    (mod_status = 'visible' or author_id = auth.uid())
    and not public.is_blocked_pair(auth.uid(), author_id)
    and not public.is_banned(author_id)
  );
drop policy if exists "comments no insert when sanctioned" on public.comments;
create policy "comments no insert when sanctioned" on public.comments as restrictive for insert
  with check (not public.is_sanctioned(auth.uid()));

-- friend_requests : un bloqué ne peut plus envoyer de demande ; un sanctionné non plus.
drop policy if exists "friend_requests block and sanction guard" on public.friend_requests;
create policy "friend_requests block and sanction guard" on public.friend_requests as restrictive for insert
  with check (not public.is_blocked_pair(sender_id, receiver_id) and not public.is_sanctioned(auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- 7. TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────

-- 7.1 Poser un blocage rompt l'amitié / annule les demandes dans les deux sens (3.4).
create or replace function public.handle_block_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.friend_requests
   where (sender_id = new.blocker_id and receiver_id = new.blocked_id)
      or (sender_id = new.blocked_id and receiver_id = new.blocker_id);
  return new;
end;
$$;
drop trigger if exists trg_handle_block_created on public.blocks;
create trigger trg_handle_block_created after insert on public.blocks
  for each row execute function public.handle_block_created();

-- 7.2 Anti-abus + priorisation à l'insertion d'un signalement.
create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reporter_id is not null and (
    select count(*) from public.reports r
    where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours'
  ) >= 30 then
    raise exception 'Trop de signalements en 24h. Réessaie plus tard.';
  end if;
  if new.reason = 'compte_mineur' then          -- 7.2 : compte mineur => revue prioritaire
    new.severity := 'priority';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reports_before_insert on public.reports;
create trigger trg_reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. VUES : exposer mod_status (colonne AJOUTÉE EN FIN, CREATE OR REPLACE — sûr).
--    L'ordre importe : posts_feed d'abord, puis ses dépendantes.
-- ────────────────────────────────────────────────────────────────────────────
create or replace view public.posts_feed with (security_invoker='on') as
 select p.id,
    p.author_id,
    public.get_display_name(p.author_id) as author_name,
    pr.avatar_url as author_avatar_url,
    p.created_at, p.location, p.buy_in, p.level, p.title, p.description, p.hand,
    p.vote_question, p.vote_options,
    coalesce(( select jsonb_object_agg(v.option, v.cnt) as jsonb_object_agg
           from ( select votes.option, count(*) as cnt
                   from public.votes where (votes.post_id = p.id)
                  group by votes.option) v), '{}'::jsonb) as vote_counts,
    ( select votes.option from public.votes
          where ((votes.post_id = p.id) and (votes.user_id = auth.uid()))) as my_vote,
    p.like_count, p.comment_count, p.visibility,
    (exists ( select 1 from public.likes l
          where ((l.post_id = p.id) and (l.user_id = auth.uid())))) as liked_by_me,
    p.mod_status
   from (public.posts p
     join public.profiles pr on ((pr.id = p.author_id)));

create or replace view public.posts_feed_with_group with (security_invoker='on') as
 select pf.id, pf.author_id, pf.author_name, pf.author_avatar_url, pf.created_at,
    pf.location, pf.buy_in, pf.level, pf.title, pf.description, pf.hand,
    pf.vote_question, pf.vote_options, pf.vote_counts, pf.my_vote,
    pf.like_count, pf.comment_count, pf.visibility, pf.liked_by_me,
    p.group_id,
    pf.mod_status
   from (public.posts_feed pf
     join public.posts p on ((p.id = pf.id)));

create or replace view public.posts_ranked with (security_invoker='on') as
 select f.id, f.author_id, f.author_name, f.author_avatar_url, f.created_at,
    f.location, f.buy_in, f.level, f.title, f.description, f.hand,
    f.vote_question, f.vote_options, f.vote_counts, f.my_vote,
    f.like_count, f.comment_count, f.visibility, f.liked_by_me,
    r.author_is_friend, r.mutual_friend_count,
    ((((
        case when (r.author_is_friend or (f.author_id = auth.uid())) then 30 else 0 end
        + (least(r.mutual_friend_count, 8) * 3)) +
        case when ((coalesce((f.hand ->> 'variant'::text), 'nlhe'::text) = p.pref_variant)
              and (coalesce((f.hand ->> 'gameType'::text), 'cash'::text) = p.pref_game_type)) then 5 else 0 end))::numeric
        - (extract(epoch from (now() - f.created_at)) / 86400.0)) as affinity_score,
    g.group_id, g.group_name,
    f.mod_status
   from (((public.posts_feed f
     cross join lateral ( select (exists ( select 1 from public.friend_requests fr
                  where ((fr.status = 'accepted'::text) and (((fr.sender_id = auth.uid()) and (fr.receiver_id = f.author_id))
                      or ((fr.sender_id = f.author_id) and (fr.receiver_id = auth.uid())))))) as author_is_friend,
            public.mutual_friend_count(f.author_id) as mutual_friend_count) r)
     left join lateral ( select coalesce(pr.variante_favorite, 'nlhe'::text) as pref_variant,
                case when (pr.format_favori ~~ 'cash%'::text) then 'cash'::text else 'tournament'::text end as pref_game_type
           from public.profiles pr where (pr.id = auth.uid())) p on (true))
     left join lateral ( select po.group_id, gr.name as group_name
           from (public.posts po left join public.groups gr on ((gr.id = po.group_id)))
          where (po.id = f.id)) g on (true))
  where (f.visibility <> 'private'::text);

create or replace view public.comments_feed with (security_invoker='on') as
 select c.id, c.post_id, c.parent_comment_id, c.author_id,
    public.get_display_name(c.author_id) as author_name,
    c.body, c.created_at, c.like_count,
    (exists ( select 1 from public.comment_likes cl
          where ((cl.comment_id = c.id) and (cl.user_id = auth.uid())))) as liked_by_me,
    c.mod_status
   from (public.comments c
     join public.profiles pr on ((pr.id = c.author_id)));

-- ────────────────────────────────────────────────────────────────────────────
-- 9. RPC ADMIN (SECURITY DEFINER, gate is_admin(), journalisées). Un utilisateur
--    normal ne peut RIEN faire sur reports/user_sanctions hors ces fonctions.
-- ────────────────────────────────────────────────────────────────────────────

-- 9.1 Masquer / retirer un contenu (4.3)
create or replace function public.admin_set_content_status(
  p_target_type text, p_target_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_status not in ('visible','hidden','removed') then raise exception 'Statut invalide'; end if;
  if p_target_type = 'post' then
    update public.posts set mod_status = p_status, mod_reason = p_reason,
        removed_at = case when p_status = 'removed' then now() else null end
      where id = p_target_id;
  elsif p_target_type = 'comment' then
    update public.comments set mod_status = p_status, mod_reason = p_reason,
        removed_at = case when p_status = 'removed' then now() else null end
      where id = p_target_id;
  else raise exception 'Type de cible invalide'; end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
    values (auth.uid(), 'set_content_status', p_target_type, p_target_id,
            jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

-- 9.2 Sanctionner (4.4/4.5/4.6). Le ban tente de bloquer la connexion via
--     auth.users.banned_until (best-effort : le masquage du contenu est de toute
--     façon assuré par is_banned() en RLS ; si le rôle n'a pas les droits sur
--     auth.users, le blocage login se fera côté service-role/edge function).
create or replace function public.admin_sanction_user(
  p_user_id uuid, p_type text, p_reason text default null, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_type not in ('warning','suspended','banned') then raise exception 'Type de sanction invalide'; end if;
  insert into public.user_sanctions(user_id, type, reason, expires_at, issued_by)
    values (p_user_id, p_type, p_reason, p_expires_at, auth.uid()) returning id into v_id;
  if p_type = 'banned' then
    begin
      update auth.users set banned_until = coalesce(p_expires_at, now() + interval '100 years') where id = p_user_id;
    exception when others then null; -- voir commentaire ci-dessus
    end;
  end if;
  insert into public.notifications(recipient_id, actor_id, type) values (p_user_id, auth.uid(), 'account_sanctioned');
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
    values (auth.uid(), 'sanction_user', 'user', p_user_id,
            jsonb_build_object('type', p_type, 'reason', p_reason, 'expires_at', p_expires_at));
  return v_id;
end;
$$;

-- 9.3 Lever une sanction (4.7)
create or replace function public.admin_lift_sanction(p_sanction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_type text;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  update public.user_sanctions set lifted_at = now(), lifted_by = auth.uid()
    where id = p_sanction_id and lifted_at is null
    returning user_id, type into v_user, v_type;
  if v_user is null then raise exception 'Sanction introuvable ou déjà levée'; end if;
  if v_type = 'banned' and not public.is_banned(v_user) then
    begin update auth.users set banned_until = null where id = v_user; exception when others then null; end;
  end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
    values (auth.uid(), 'lift_sanction', 'user', v_user, jsonb_build_object('sanction_id', p_sanction_id));
end;
$$;

-- 9.4 Résoudre / rejeter un signalement (4.8) + accusé au signaleur (2.6)
create or replace function public.admin_resolve_report(p_report_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_reporter uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_status not in ('open','reviewing','actioned','dismissed') then raise exception 'Statut invalide'; end if;
  update public.reports set status = p_status, resolution_reason = p_reason,
      resolved_at = case when p_status in ('actioned','dismissed') then now() else null end,
      resolved_by = case when p_status in ('actioned','dismissed') then auth.uid() else null end
    where id = p_report_id returning reporter_id into v_reporter;
  if not found then raise exception 'Signalement introuvable'; end if;
  if v_reporter is not null and p_status in ('actioned','dismissed') then
    insert into public.notifications(recipient_id, actor_id, type) values (v_reporter, auth.uid(), 'report_resolved');
  end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
    values (auth.uid(), 'resolve_report', 'report', p_report_id, jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

-- 9.5 File des signalements (4.1/4.11) — prioritaires puis multi-signalés puis récents.
create or replace function public.admin_list_reports(p_status text default null)
returns table (id uuid, target_type text, target_id uuid, reason text, status text, severity text,
               reporter_id uuid, reporter_email text, details text, created_at timestamptz,
               resolved_at timestamptz, reports_on_target bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  return query
    select r.id, r.target_type, r.target_id, r.reason, r.status, r.severity,
           r.reporter_id, r.reporter_email, r.details, r.created_at, r.resolved_at,
           (select count(*) from public.reports r2 where r2.target_type = r.target_type and r2.target_id = r.target_id)
    from public.reports r
    where (p_status is null or r.status = p_status)
    order by (r.severity = 'priority') desc,
             (select count(*) from public.reports r3 where r3.target_type = r.target_type and r3.target_id = r.target_id) desc,
             r.created_at desc;
end;
$$;

-- 9.6 Contexte d'un signalement (4.2) — lit le contenu MÊME masqué (SECDEF bypass RLS).
create or replace function public.admin_get_report_context(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare rep public.reports; ctx jsonb; v_author uuid;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  select * into rep from public.reports where id = p_report_id;
  if not found then raise exception 'Signalement introuvable'; end if;
  if rep.target_type = 'post' then
    select jsonb_build_object('type','post','id',p.id,'author_id',p.author_id,'title',p.title,
                              'description',p.description,'mod_status',p.mod_status,'created_at',p.created_at),
           p.author_id into ctx, v_author from public.posts p where p.id = rep.target_id;
  elsif rep.target_type = 'comment' then
    select jsonb_build_object('type','comment','id',c.id,'author_id',c.author_id,'body',c.body,
                              'mod_status',c.mod_status,'post_id',c.post_id,'created_at',c.created_at),
           c.author_id into ctx, v_author from public.comments c where c.id = rep.target_id;
  else
    select jsonb_build_object('type','user','id',pr.id,'pseudo',pr.pseudo), pr.id
      into ctx, v_author from public.profiles pr where pr.id = rep.target_id;
  end if;
  return jsonb_build_object(
    'report', to_jsonb(rep),
    'target', ctx,
    'author_sanctions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc)
                                  from public.user_sanctions s where s.user_id = v_author), '[]'::jsonb),
    'reports_on_target', (select count(*) from public.reports r where r.target_type = rep.target_type and r.target_id = rep.target_id),
    'reports_on_author_as_user', (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = v_author)
  );
end;
$$;

-- Droits d'exécution : gate interne is_admin(), donc exposées à authenticated seulement.
revoke all on function public.admin_set_content_status(text,uuid,text,text)      from anon;
revoke all on function public.admin_sanction_user(uuid,text,text,timestamptz)    from anon;
revoke all on function public.admin_lift_sanction(uuid)                          from anon;
revoke all on function public.admin_resolve_report(uuid,text,text)               from anon;
revoke all on function public.admin_list_reports(text)                           from anon;
revoke all on function public.admin_get_report_context(uuid)                     from anon;
grant execute on function public.admin_set_content_status(text,uuid,text,text)   to authenticated;
grant execute on function public.admin_sanction_user(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.admin_lift_sanction(uuid)                       to authenticated;
grant execute on function public.admin_resolve_report(uuid,text,text)            to authenticated;
grant execute on function public.admin_list_reports(text)                        to authenticated;
grant execute on function public.admin_get_report_context(uuid)                  to authenticated;

commit;

-- ============================================================================
-- FIN. Vérif rapide (hors transaction) : les nouveaux objets existent.
-- ============================================================================
select 'tables modération' as objet,
       (select count(*) from information_schema.tables where table_schema='public'
         and table_name in ('reports','user_sanctions','blocks','admin_audit_log'))::text || ' / 4' as ok
union all
select 'colonnes mod_status',
       (select count(*) from information_schema.columns where table_schema='public'
         and column_name='mod_status' and table_name in ('posts','comments'))::text || ' / 2'
union all
select 'helpers',
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname in ('is_admin','is_blocked_pair','is_sanctioned','is_banned'))::text || ' / 4'
union all
select 'RPC admin',
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname like 'admin\_%')::text || ' / 6'
union all
select 'policies restrictives',
       (select count(*) from pg_policies where schemaname='public' and permissive='RESTRICTIVE')::text || ' / 5';
