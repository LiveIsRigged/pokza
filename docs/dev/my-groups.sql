-- ============================================================================
-- MES GROUPES PRIVÉS — une seule requête, triée par dernière activité (lot B).
-- À TESTER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent : rejouable sans risque, le tout dans une transaction.
--
-- POURQUOI. L'app lisait ses groupes en DEUX requêtes : les appartenances, puis les groupes par
-- `.in('id', [...])` — une liste d'UUID en clair dans l'URL, qui grossit avec le nombre de groupes.
-- Elle n'avait par ailleurs aucun moyen de trier autrement que par date de création du GROUPE
-- (donc le plus ancien en tête, y compris un groupe rejoint hier), ni d'afficher le moindre repère
-- pour distinguer deux groupes homonymes — rien n'impose l'unicité des noms.
--
-- SÉCURITÉ. `security invoker` (défaut) et NON `security definer` : la fonction n'a besoin
-- d'aucun droit supplémentaire. La RLS existante suffit et fait tout le travail —
--   groups        : « Les membres et invites voient le groupe »
--   group_members : « Voir sa ligne, celles de son groupe, ou en tant que createur »
--   posts         : « Lecture selon la visibilite » (les mains d'un groupe sont visibles de ses membres)
-- Un appelant anonyme obtient une liste vide, `auth.uid()` étant nul.
-- ============================================================================

begin;

-- Le tri par dernière activité fait un max(created_at) par groupe sur `posts`, qui n'a aucun index
-- hors clé primaire. Sans effet à l'échelle actuelle, mais l'index coûte peu et sert aussi à
-- `fetchGroupPosts` (mains d'un groupe, du plus récent au plus ancien).
create index if not exists posts_group_created_idx
  on public.posts (group_id, created_at desc)
  where group_id is not null;

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
  member_count integer
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
    m.member_count
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

commit;

-- PostgREST garde en cache la liste des fonctions exposées : sans ce signal, un appel à
-- `rpc('my_groups')` peut répondre « function not found » quelques secondes après la création.
notify pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à lancer connecté, ou depuis l'app) : doit renvoyer une ligne
-- par groupe accepté, la dernière activité en tête.
--   select * from public.my_groups();
-- Et le point de comparaison, l'ancien ordre (création du groupe, croissant) :
--   select g.id, g.name, g.created_at from public.groups g
--   join public.group_members m on m.group_id = g.id and m.user_id = auth.uid() and m.status = 'accepted'
--   order by g.created_at;
-- ────────────────────────────────────────────────────────────────────────────
