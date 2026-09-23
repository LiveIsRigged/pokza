-- Inviter dans un groupe privé — tout membre invite, le fondateur surveille, + le lien de partage
-- ============================================================================================
-- À LANCER SUR LE DEV D'ABORD (ahdikgckctvduuestzrh), puis en PROD. IDEMPOTENT.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ CE SCRIPT PASSE AVANT LE DÉPLOIEMENT DE L'APP. PostgREST refuse toute requête qui nomme une
-- table, une colonne ou une fonction inexistante.
--
-- ── LES DÉCISIONS DE VICTOR (16 et 17/09/2026, ne pas re-choisir)
-- Un premier système (le lien fait DEMANDER, le fondateur VALIDE) a été posé sur DEV le 16/09 puis
-- abandonné le 17 : « trop compliqué ». Celui-ci le remplace, et le bloc 0 le démonte.
--
--  1. TOUT MEMBRE peut inviter, directement, comme le fondateur le faisait seul jusqu'ici.
--     L'invité doit toujours accepter : personne n'entre dans un groupe sans son accord.
--  2. Le fondateur est prévenu À L'INVITATION (« Paul a invité Kevin dans Miami 2026 ») : il peut
--     annuler avant que Kevin ne voie quoi que ce soit.
--  3. S'il retire Kevin (invitation annulée ou membre exclu), les membres ne peuvent plus le
--     réinviter : SEUL le fondateur le peut. Même règle quand Kevin REFUSE une invitation.
--     Quitter le groupe, en revanche, ne ferme PAS la porte (décision explicite du 17/09).
--  4. Inviter quelqu'un qui n'est pas sur Pokza : un lien, envoyé par la feuille de partage.
--     PLUSIEURS USAGES, EXPIRE APRÈS 7 JOURS. Ouvrir le lien fait ENTRER (pas de validation).
--     Pour un lien, bloquer AVANT l'entrée est impossible — il ne vise personne à l'avance :
--     le fondateur est prévenu à l'ARRIVÉE (« Kevin a rejoint Miami 2026 grâce à Paul ») et
--     retire ensuite s'il le faut. Un lien n'ouvre jamais une porte fermée.
--
-- ⚠️ AUCUNE FONCTION EXISTANTE N'EST RÉÉCRITE, sauf la contrainte des types de notification, lue
-- dans sa définition VIVANTE (le dump du dépôt est périmé). La seule policy remplacée est celle
-- d'insertion de `group_members`, dont le texte exact est connu et vérifié.
-- ============================================================================================

-- ── 0. DÉMONTAGE DU PREMIER SYSTÈME (DEV seulement — sans effet là où il n'a jamais existé) ──
drop policy   if exists "Le fondateur accepte une demande d'entree" on public.group_members;
drop trigger  if exists trg_notify_group_join_request             on public.group_members;
drop trigger  if exists trg_notify_group_join_accepted            on public.group_members;
drop trigger  if exists trg_remove_group_join_request_notification on public.group_members;
drop function if exists public.notify_group_join_request();
drop function if exists public.notify_group_join_accepted();
drop function if exists public.remove_group_join_request_notification();
drop function if exists public.request_group_join(text);
drop function if exists public.set_group_invite_link(uuid);
-- Son type de retour change : `create or replace` le refuserait, il faut supprimer puis recréer.
drop function if exists public.group_link_preview(text);

-- La table de la v1 avait `group_id` pour clé ; celle de la v2 a le jeton. On ne la supprime que si
-- elle a encore l'ANCIENNE forme ET qu'elle est vide — jamais une table v2 qui aurait servi.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'group_invite_links'
                and column_name = 'regenerated_at') then
    if exists (select 1 from public.group_invite_links) then
      raise exception 'group_invite_links (v1) contient des lignes : ne rien supprimer a l''aveugle';
    end if;
    drop table public.group_invite_links;
  end if;
end $$;

-- Les notifications de la v1 doivent disparaître AVANT que la contrainte (bloc 10) ne les exclue.
delete from public.notifications where type in ('group_join_request', 'group_join_accepted');

begin;

-- ── 1. LA MÉMOIRE DES PORTES FERMÉES ───────────────────────────────────────────────────────
-- Un refus ou un retrait, par groupe et par personne. Tant que la ligne existe, seul le fondateur
-- peut inviter cette personne dans ce groupe.
create table if not exists public.group_closed_doors (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  reason    text not null check (reason in ('removed', 'declined')),
  closed_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_closed_doors enable row level security;

-- Lecture : les membres du groupe, pour que l'écran « Inviter » montre « Retiré par Marc » ou
-- « A refusé » À LA PLACE du bouton — plutôt qu'un bouton voué à l'échec (audit du 15/09).
-- Écriture : AUCUNE policy. Seuls les déclencheurs des blocs 5 et 6 écrivent ici.
drop policy if exists "Les membres voient les portes fermees" on public.group_closed_doors;
create policy "Les membres voient les portes fermees" on public.group_closed_doors
  for select
  using (public.is_group_member(group_id) or public.is_group_owner(group_id));

grant select on public.group_closed_doors to authenticated;

-- ── 2. LE TEST DE LA PORTE, À L'ABRI DE LA RLS ─────────────────────────────────────────────
-- ⚠️ `security definer` n'est pas un confort. La policy d'invitation (bloc 3) consulte cette
-- table ; si elle le faisait sous l'identité de l'invitant, la RLS du bloc 1 pourrait lui cacher
-- une ligne — et un `not exists` sur une ligne cachée vaut VRAI : la porte fermée s'ouvrirait.
--
-- Dans `private`, comme `is_banned` et `is_blocked_pair` : les policies peuvent l'appeler,
-- PostgREST ne l'expose pas. Personne ne peut donc sonder « Kevin a-t-il refusé tel groupe ? ».
create or replace function private.is_door_closed(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.group_closed_doors
     where group_id = p_group_id and user_id = p_user_id
  );
$$;

revoke all on function private.is_door_closed(uuid, uuid) from public;
-- ⚠️ SANS CE GRANT, la policy du bloc 3 lève « permission denied for function » à CHAQUE
-- invitation, fondateur compris. C'est exactement l'incident `is_banned` qui avait fait tomber le
-- fil en PROD (cf. likes-qui-a-aime.sql). `anon` aussi, par symétrie avec les autres helpers.
grant execute on function private.is_door_closed(uuid, uuid) to anon, authenticated;

-- ── 3. INVITER : TOUT MEMBRE, SAUF PORTE FERMÉE — LE FONDATEUR PASSE TOUJOURS ────────────────
-- Remplace « Seul le createur invite, et uniquement en attente ». Les trois premières conditions
-- sont reprises À L'IDENTIQUE : on invite en son propre nom, en attente, et jamais soi-même.
--
-- Le blocage entre les deux personnes interdit l'invitation dans les deux sens — dans l'ancienne
-- règle, seul le fondateur invitait et la question ne se posait pas ; elle se pose maintenant que
-- n'importe quel membre peut viser n'importe quel compte.
drop policy if exists "Seul le createur invite, et uniquement en attente" on public.group_members;
drop policy if exists "Un membre invite, sauf porte fermee" on public.group_members;
create policy "Un membre invite, sauf porte fermee" on public.group_members
  for insert
  with check (
    invited_by = auth.uid()
    and status = 'pending'
    and user_id <> auth.uid()
    and not private.is_blocked_pair(auth.uid(), user_id)
    and (
      public.is_group_owner(group_id)
      or (public.is_group_member(group_id) and not private.is_door_closed(group_id, user_id))
    )
  );

-- ── 4. ANNULER SA PROPRE INVITATION ────────────────────────────────────────────────────────
-- Paul touche « Invité ✓ » pour annuler : la policy de suppression existante ne l'autorisait
-- qu'à l'invité et au fondateur. Bornée à l'EN ATTENTE : une fois Kevin entré, seul le fondateur
-- peut l'exclure. (La ligne du fondateur porte `invited_by` = lui-même, mais elle est `accepted`.)
drop policy if exists "L'auteur d'une invitation l'annule" on public.group_members;
create policy "L'auteur d'une invitation l'annule" on public.group_members
  for delete
  using (invited_by = auth.uid() and status = 'pending' and user_id <> auth.uid());

-- ── 5. FERMER LA PORTE — refus et retrait ──────────────────────────────────────────────────
-- Qui supprime la ligne, et dans quel état, dit ce qui s'est passé :
--   l'invité lui-même, en attente     → il REFUSE        → porte fermée (declined)
--   le fondateur, sur quelqu'un d'autre → il RETIRE      → porte fermée (removed)
--   un membre accepté, sur lui-même     → il QUITTE      → rien (décision du 17/09)
--   l'auteur d'une invitation           → il se ravise   → rien : un autre peut inviter Kevin
--   personne (`auth.uid()` nul)         → cascade, service, suppression de compte → rien
create or replace function public.close_group_door()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return old;
  end if;

  -- ⚠️ Quand c'est le GROUPE entier qu'on supprime, ses membres partent en cascade APRÈS lui : la
  -- ligne du groupe n'est déjà plus visible ici. Ne rien écrire dans ce cas — une porte vers un
  -- groupe disparu violerait sa clé étrangère et ferait ÉCHOUER la suppression du groupe.
  select owner_id into v_owner from public.groups where id = old.group_id;
  if v_owner is null then
    return old;
  end if;

  -- ⚠️ Même piège côté COMPTE : `delete_own_account()` supprime `auth.users` SOUS L'IDENTITÉ de
  -- l'utilisateur, et ses lignes de membre partent en cascade avec `auth.uid()` = lui. Sans cette
  -- garde, ses invitations en attente passeraient pour des refus, et la porte écrite vers un compte
  -- déjà effacé violerait sa clé étrangère : la SUPPRESSION DE COMPTE ÉCHOUERAIT.
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;

  if auth.uid() = old.user_id and old.status = 'pending' then
    insert into public.group_closed_doors (group_id, user_id, reason)
    values (old.group_id, old.user_id, 'declined')
    on conflict (group_id, user_id) do update set reason = 'declined', closed_at = now();
  elsif auth.uid() = v_owner and old.user_id <> v_owner then
    insert into public.group_closed_doors (group_id, user_id, reason)
    values (old.group_id, old.user_id, 'removed')
    on conflict (group_id, user_id) do update set reason = 'removed', closed_at = now();
  end if;

  return old;
end $$;

drop trigger if exists trg_close_group_door on public.group_members;
create trigger trg_close_group_door
  after delete on public.group_members
  for each row execute function public.close_group_door();

-- ── 6. ROUVRIR LA PORTE — quand le fondateur réinvite ──────────────────────────────────────
-- La seule clé. Un lien, même celui du fondateur, ne rouvre jamais rien (bloc 9).
create or replace function public.reopen_group_door()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'pending'
     and exists (select 1 from public.groups g
                  where g.id = new.group_id and g.owner_id = new.invited_by) then
    delete from public.group_closed_doors
     where group_id = new.group_id and user_id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_reopen_group_door on public.group_members;
create trigger trg_reopen_group_door
  after insert on public.group_members
  for each row execute function public.reopen_group_door();

-- ── 7. LA SECONDE PERSONNE D'UNE NOTIFICATION ──────────────────────────────────────────────
-- « Paul a invité Kevin » nomme deux personnes ; la table n'en portait qu'une (`actor_id`).
-- On AJOUTE une colonne au lieu de réécrire la vue `notifications_feed` : l'app relira le nom à
-- part, comme elle le fait déjà pour les suggestions d'amis (cf. `fetchDisplayNames`).
alter table public.notifications
  add column if not exists subject_id uuid references auth.users (id) on delete cascade;

-- Défensif : sans effet si `notifications` est accordée au niveau table, indispensable si des
-- droits par colonne y ont été posés — la colonne serait alors illisible pour tout le monde.
grant select (subject_id) on public.notifications to authenticated;

-- ── 8. PRÉVENIR LE FONDATEUR QU'UN MEMBRE A INVITÉ ─────────────────────────────────────────
-- Jamais pour ses propres invitations. `notify_group_invite` (l'invité) n'est pas touché : les
-- deux partent de la même insertion, vers deux personnes différentes.
create or replace function public.notify_group_member_invited()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'pending' and new.invited_by <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, group_id, subject_id)
    select g.owner_id, new.invited_by, 'group_member_invited', new.group_id, new.user_id
      from public.groups g
     where g.id = new.group_id and g.owner_id <> new.invited_by;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_group_member_invited on public.group_members;
create trigger trg_notify_group_member_invited
  after insert on public.group_members
  for each row execute function public.notify_group_member_invited();

-- L'invitation disparue (annulée, refusée, retirée) emporte la notification du fondateur : elle
-- dirait sinon « Paul a invité Kevin » à propos d'une invitation qui n'existe plus. Acceptée, elle
-- reste — elle est toujours vraie.
create or replace function public.remove_group_member_invited_notification()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.status = 'pending' then
    delete from public.notifications
     where type = 'group_member_invited'
       and group_id = old.group_id
       and subject_id = old.user_id;
  end if;
  return old;
end $$;

drop trigger if exists trg_remove_group_member_invited_notification on public.group_members;
create trigger trg_remove_group_member_invited_notification
  after delete on public.group_members
  for each row execute function public.remove_group_member_invited_notification();

-- ── 9. LE LIEN DE PARTAGE — plusieurs usages, 7 jours ──────────────────────────────────────
-- Un lien NEUF à chaque partage : chacun vit ses 7 jours pleins à partir du moment où il a été
-- envoyé. Réutiliser le lien de la veille le ferait mourir plus tôt que prévu chez qui le reçoit.
create table if not exists public.group_invite_links (
  -- 16 octets en hexadécimal : la forme exacte du jeton de partage d'une main, dont le contrôle
  -- côté app (`/^[0-9a-f]{32}$/`) est déjà écrit et éprouvé.
  token      text primary key,
  group_id   uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 7 JOURS : décision de Victor du 17/09. Le seul endroit où la durée est écrite.
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists group_invite_links_group_idx on public.group_invite_links (group_id);

-- RLS activée et AUCUNE policy : personne ne lit ni n'écrit cette table directement. Le jeton
-- sort de la fonction qui le fabrique, et tout le reste passe par les deux fonctions suivantes.
alter table public.group_invite_links enable row level security;

create or replace function public.create_group_invite_link(p_group_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, private, extensions
as $$
declare
  v_token text;
begin
  -- Membre ACCEPTÉ seulement (`is_group_member` l'exige) : un invité en attente n'a pas encore
  -- de quoi inviter les autres. Le fondateur l'est depuis la création de son groupe.
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'Seuls les membres du groupe peuvent inviter.' using errcode = '42501';
  end if;
  v_token := encode(gen_random_bytes(16), 'hex');
  insert into public.group_invite_links (token, group_id, created_by)
  values (v_token, p_group_id, auth.uid());
  return v_token;
end $$;

grant execute on function public.create_group_invite_link(uuid) to authenticated;

-- Ce que voit le visiteur, même SANS COMPTE : le groupe, qui l'invite, et une main PUBLIQUE de
-- cet hôte à rejouer (décision du 16/09). L'hôte, c'est celui qui a ENVOYÉ le lien — pas le
-- fondateur : la page dit « Paul t'invite », parce que c'est Paul que Kevin connaît.
--
-- ⚠️ `security definer` contourne la RLS : elle refait donc son travail à la main. Hôte non banni,
-- hôte TOUJOURS membre (un exclu ne fait plus entrer personne), lien non expiré, main visible.
-- Aucune main de groupe n'est jamais montrée ici : elles appartiennent au cercle pas encore rejoint.
create or replace function public.group_link_preview(p_token text)
returns table (
  group_id     uuid,
  group_name   text,
  member_count integer,
  host_id      uuid,
  host_name    text,
  host_avatar  text,
  post_id      uuid
)
language sql
stable
security definer
set search_path = public, private
as $$
  select g.id,
         g.name,
         (select count(*)::integer from public.group_members m
           where m.group_id = g.id and m.status = 'accepted'),
         l.created_by,
         p.display_name,
         p.avatar_url,
         (select po.id from public.posts po
           where po.author_id = l.created_by
             and po.visibility = 'public'
             and po.mod_status = 'visible'
           order by po.created_at desc
           limit 1)
    from public.group_invite_links l
    join public.groups g   on g.id = l.group_id
    join public.profiles p on p.id = l.created_by
   where l.token = p_token
     and l.expires_at > now()
     and not private.is_banned(l.created_by)
     and exists (select 1 from public.group_members m
                  where m.group_id = l.group_id
                    and m.user_id = l.created_by
                    and m.status = 'accepted');
$$;

grant execute on function public.group_link_preview(text) to anon, authenticated;

-- Rejoindre. Rend `rejoint`, `deja_membre` ou `lien_invalide` — l'écran traduit.
--
-- Un compte banni, bloqué avec l'hôte, ou derrière une porte fermée reçoit `lien_invalide`, comme
-- un lien expiré : on ne renseigne pas sur ce qu'on ne peut pas atteindre, et Kevin n'a pas à
-- apprendre par ce biais qu'il a été retiré.
create or replace function public.join_group_by_link(p_token text)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_group  uuid;
  v_host   uuid;
  v_owner  uuid;
  v_status text;
begin
  if auth.uid() is null then
    return 'lien_invalide';
  end if;

  select l.group_id, l.created_by, g.owner_id
    into v_group, v_host, v_owner
    from public.group_invite_links l
    join public.groups g on g.id = l.group_id
   where l.token = p_token
     and l.expires_at > now()
     and not private.is_banned(l.created_by)
     and exists (select 1 from public.group_members m
                  where m.group_id = l.group_id
                    and m.user_id = l.created_by
                    and m.status = 'accepted');

  if v_group is null
     or private.is_banned(auth.uid())
     or private.is_blocked_pair(v_host, auth.uid()) then
    return 'lien_invalide';
  end if;

  select status into v_status
    from public.group_members
   where group_id = v_group and user_id = auth.uid();

  if v_status = 'accepted' then
    return 'deja_membre';
  end if;

  -- Un lien n'ouvre JAMAIS une porte fermée — pas même celui du fondateur. Seule une invitation
  -- de sa main la rouvre (bloc 6). Sinon « seul le fondateur peut le réinviter » se contournerait
  -- en envoyant un lien.
  if private.is_door_closed(v_group, auth.uid()) then
    return 'lien_invalide';
  end if;

  if v_status = 'pending' then
    -- Une invitation l'attendait déjà : ouvrir un lien vaut l'accepter. `notify_group_accept`
    -- prévient alors l'auteur de CETTE invitation-là, comme pour une acceptation ordinaire.
    update public.group_members
       set status = 'accepted', responded_at = now()
     where group_id = v_group and user_id = auth.uid();
    return 'rejoint';
  end if;

  -- Entrée directe. `invited_by` = l'hôte : la liste des membres dira « invité par Paul ».
  -- Aucun déclencheur ne prévient personne d'une ligne insérée DÉJÀ acceptée — d'où les deux
  -- notifications écrites ici, explicitement.
  insert into public.group_members (group_id, user_id, invited_by, status, responded_at)
  values (v_group, auth.uid(), v_host, 'accepted', now());

  -- À l'hôte : « Kevin a rejoint le groupe privé Miami 2026 » (le texte existant de group_accept).
  insert into public.notifications (recipient_id, actor_id, type, group_id)
  values (v_host, auth.uid(), 'group_accept', v_group);

  -- Au fondateur, si ce n'est pas lui qui a envoyé le lien : « Kevin a rejoint Miami 2026 grâce
  -- à Paul ». S'il l'a envoyé lui-même, la notification précédente lui suffit.
  if v_host <> v_owner then
    insert into public.notifications (recipient_id, actor_id, type, group_id, subject_id)
    values (v_owner, auth.uid(), 'group_member_joined', v_group, v_host);
  end if;

  return 'rejoint';
end $$;

grant execute on function public.join_group_by_link(text) to authenticated;

commit;

-- ── 10. LA CONTRAINTE DE TYPE — lue, nettoyée, étendue ─────────────────────────────────────
-- Hors transaction, pour lire l'échec sans perdre ce qui précède. On part de la définition
-- VIVANTE : on y retire les deux types de la v1 et on y ajoute les deux de la v2. Le dump du dépôt
-- en liste 10 alors que la modération en a ajouté 3 : reconstruire de mémoire les effacerait.
do $$
declare
  v_def text;
  v_neuf text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'notifications'
     and c.conname = 'notifications_type_check';

  if v_def is null then
    raise exception 'notifications_type_check introuvable : ne rien deviner, verifier la base';
  end if;

  v_neuf := replace(v_def,  '''group_join_request''::text, ', '');
  v_neuf := replace(v_neuf, '''group_join_accepted''::text, ', '');
  if position('group_member_invited' in v_neuf) = 0 then
    v_neuf := replace(v_neuf, 'ARRAY[',
                      'ARRAY[''group_member_invited''::text, ''group_member_joined''::text, ');
  end if;

  if v_neuf <> v_def then
    execute 'alter table public.notifications drop constraint notifications_type_check';
    execute 'alter table public.notifications add constraint notifications_type_check ' || v_neuf;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES DE POSE — les 10 lignes doivent dire OK. Le COMPORTEMENT se mesure à part, dans
-- `invitations-groupe-test.sql` (impersonation).
-- ══════════════════════════════════════════════════════════════════════════════════════════

select * from (values

  (1, 'le premier systeme est demonte',
      (select case when count(*) = 0 then 'OK — plus aucune trace'
                   else 'KO — ' || count(*)::text || ' objet(s) de la v1 restant(s)' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('request_group_join', 'set_group_invite_link', 'notify_group_join_request',
                            'notify_group_join_accepted', 'remove_group_join_request_notification'))),

  (2, 'l''ancienne regle d''invitation est remplacee',
      (select case when bool_or(policyname = 'Un membre invite, sauf porte fermee')
                    and not bool_or(policyname = 'Seul le createur invite, et uniquement en attente')
                   then 'OK' else 'KO' end
         from pg_policies where schemaname = 'public' and tablename = 'group_members')),

  (3, 'un membre peut annuler sa propre invitation (policy)',
      (select case when count(*) = 1 then 'OK' else 'KO — absente' end
         from pg_policies where schemaname = 'public' and tablename = 'group_members'
          and policyname = 'L''auteur d''une invitation l''annule')),

  (4, 'les policies peuvent appeler le test de porte',
      (select case when has_function_privilege('authenticated', 'private.is_door_closed(uuid,uuid)', 'execute')
                   then 'OK' else 'KO — PERMISSION MANQUANTE : chaque invitation echouerait' end)),

  (5, 'les 2 tables sont posees, RLS activee',
      (select case when count(*) = 2 and bool_and(c.relrowsecurity) then 'OK — 2 sur 2'
                   else 'KO — ' || count(*)::text || ' sur 2' end
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('group_closed_doors', 'group_invite_links'))),

  (6, 'la duree du lien est de 7 jours',
      (select case when column_default like '%7 days%' then 'OK — 7 jours'
                   else 'KO — ' || coalesce(column_default, 'aucune') end
         from information_schema.columns
        where table_schema = 'public' and table_name = 'group_invite_links' and column_name = 'expires_at')),

  (7, 'les 3 fonctions du lien sont posees',
      (select case when count(*) = 3 then 'OK — 3 sur 3' else 'KO — ' || count(*)::text || ' sur 3' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('create_group_invite_link', 'group_link_preview', 'join_group_by_link'))),

  (8, 'l''apercu est appelable sans compte',
      (select case when has_function_privilege('anon', 'public.group_link_preview(text)', 'execute')
                   then 'OK' else 'KO' end)),

  (9, 'les 4 declencheurs sont actifs',
      (select case when count(*) = 4 then 'OK — 4 sur 4' else 'KO — ' || count(*)::text || ' sur 4' end
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relname = 'group_members' and t.tgenabled = 'O'
          and t.tgname in ('trg_close_group_door', 'trg_reopen_group_door',
                           'trg_notify_group_member_invited',
                           'trg_remove_group_member_invited_notification'))),

  (10, 'types de notification : v2 dedans, v1 dehors, moderation intacte',
      (select case when position('group_member_invited' in d) > 0
                    and position('group_member_joined' in d) > 0
                    and position('group_join_request' in d) = 0
                    and position('account_sanctioned' in d) > 0
                   then 'OK'
                   else 'KO — ' || d end
         from (select pg_get_constraintdef(c.oid) as d
                 from pg_constraint c join pg_class t on t.oid = c.conrelid
                where t.relname = 'notifications' and c.conname = 'notifications_type_check') x))

) as t(n, controle, resultat) order by n;
