-- ============================================================================
-- MAINS NON VUES PAR GROUPE PRIVÉ — pastille de comptage sur chaque ligne de
-- « Mes groupes privés », et sur l'entrée du menu latéral (total tous groupes).
-- À TESTER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent : rejouable sans risque, le tout dans une transaction.
--
-- POURQUOI. Depuis le 2026-08-22, le déclencheur `notify_group_posted` saute un destinataire déjà
-- prévenu pour ce groupe dans les deux dernières heures. Ce garde-fou vit dans le déclencheur : les
-- notifications sautées ne sont PAS écrites, donc les mains 2 à 8 d'une soirée n'existent nulle
-- part pour les autres membres — ni en push, ni dans la liste des notifications. Ce compteur est la
-- moitié manquante : il rend l'information sans interrompre.
--
-- Ne compte PAS les notifications non lues (`notifications.read_at`) : à cause de ce même
-- garde-fou, ça afficherait « 1 main non vue » pour une soirée entière. Il faut une vraie date de
-- dernière visite — d'où la nouvelle colonne `group_members.last_seen_at`.
--
-- SÉCURITÉ. `my_groups()` reste en `security invoker` : la RLS de `posts` (« Lecture selon la
-- visibilite ») fait déjà tout le travail de filtrage, y compris la modération — un joueur ne peut
-- pas se voir compter une main qu'il n'a pas le droit de voir. `mark_group_seen` est en
-- `security definer`, mais volontairement étroit : il ne touche QUE `last_seen_at`, sur la ligne de
-- l'appelant, et seulement si son adhésion est acceptée — ça évite d'ouvrir une policy UPDATE (et
-- des droits par colonne) sur `group_members`.
-- ============================================================================

begin;

-- 1.a — Date de dernière visite d'un groupe, par membre. NULL tant qu'on n'y est jamais entré :
-- `my_groups()` retombe alors sur la date d'adhésion (voir plus bas), jamais sur le début du
-- groupe — sinon un nouveau membre lirait « 412 mains non vues » en rejoignant un groupe de 2 ans.
alter table public.group_members
  add column if not exists last_seen_at timestamptz;

-- 1.b — `my_groups()` : troisième lateral, colonne `unseen_count` en plus. La signature de sortie
-- change (nouvelle colonne) → `drop` puis `create`, un `create or replace` ne suffit pas ici.
drop function if exists public.my_groups();

create function public.my_groups()
returns table (
  id           uuid,
  name         text,
  owner_id     uuid,
  created_at   timestamptz,
  avatar_url   text,
  description  text,
  last_post_at timestamptz,
  member_count integer,
  unseen_count integer
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
    g.id,
    g.name,
    g.owner_id,
    g.created_at,
    g.avatar_url,
    g.description,
    p.last_post_at,
    m.member_count,
    u.unseen_count
  from groups g
  join group_members me
    on me.group_id = g.id
   and me.user_id = auth.uid()
   and me.status = 'accepted'
  left join lateral (
    select max(po.created_at) as last_post_at
    from posts po
    where po.group_id = g.id
  ) p on true
  left join lateral (
    select count(*)::int as member_count
    from group_members gm
    where gm.group_id = g.id
      and gm.status = 'accepted'
  ) m on true
  -- Ses propres mains sont exclues (décision produit) ; le `coalesce` fait partir le compte de la
  -- date d'ADHÉSION pour un nouveau membre, jamais de la création du groupe.
  left join lateral (
    select count(*)::int as unseen_count
    from posts po
    where po.group_id = g.id
      and po.author_id <> auth.uid()
      and po.created_at > coalesce(me.last_seen_at, me.responded_at, me.created_at)
  ) u on true
  -- Un groupe sans main retombe sur sa date de création : il ne disparaît pas en bas de liste
  -- juste parce que personne n'y a encore publié — c'est souvent le dernier créé.
  --
  -- Le départage n'est PAS décoratif. Plusieurs groupes peuvent partager la même date à la
  -- microseconde (ceux créés dans une même transaction le font systématiquement) ; sans critère
  -- de secours, Postgres est libre de les rendre dans un ordre différent d'un appel à l'autre et
  -- la liste se réordonne toute seule sous les yeux du lecteur. Constaté sur 20 groupes de test.
  -- Le nom d'abord, parce que c'est ce qui se lit ; l'identifiant ensuite, parce que deux groupes
  -- peuvent porter le même nom et qu'il faut un ordre TOTAL pour qu'il soit stable.
  order by coalesce(p.last_post_at, g.created_at) desc, g.name, g.id;
$$;

revoke all on function public.my_groups() from public, anon;
grant execute on function public.my_groups() to authenticated, service_role;

-- 1.c — Marquer un groupe comme vu : une RPC plutôt qu'un update direct depuis le client.
create or replace function public.mark_group_seen(p_group_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update group_members
     set last_seen_at = now()
   where group_id = p_group_id
     and user_id = auth.uid()
     and status = 'accepted';
$$;

revoke all on function public.mark_group_seen(uuid) from public, anon;
grant execute on function public.mark_group_seen(uuid) to authenticated, service_role;

commit;

-- PostgREST garde en cache la liste des fonctions exposées : sans ce signal, un appel à
-- `rpc('my_groups')` ou `rpc('mark_group_seen')` peut répondre « function not found » quelques
-- secondes après la création.
notify pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION — auth.uid() est NUL dans l'éditeur SQL, il faut impersonner (voir section 3 de
-- docs/dev/plan-mains-non-vues.md pour la recette `set_config`, à faire dans une transaction à part
-- qu'on `rollback`, jamais dans celle ci-dessus).
--
-- Avant/après avoir reculé la date de dernière visite d'un membre qui n'est PAS l'auteur des mains :
--   select name, unseen_count from public.my_groups();
--   update group_members set last_seen_at = now() - interval '1 day'
--     where user_id = '<uuid impersonné>' and group_id = '<uuid du groupe>';
-- `unseen_count` doit monter en conséquence, puis retomber à 0 après (toujours impersonné) :
--   select mark_group_seen('<uuid du groupe>');
-- ────────────────────────────────────────────────────────────────────────────
