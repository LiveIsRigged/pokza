-- ══════════════════════════════════════════════════════════════════════════════════════════
-- LIEN DE PARTAGE — envoyer une main hors de Pokza, sans ouvrir la base
--
-- À jouer sur DEV D'ABORD, puis PROD :
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- La MESURE est dans `partage-lien-test.sql`, à jouer juste après sur la même base.
--
-- ── LE BESOIN
-- Un joueur veut envoyer une main à des amis qui n'ont pas Pokza. Aujourd'hui seul un lien vers
-- une main PUBLIQUE s'ouvre : une main privée ou de groupe affiche « cette main n'est pas
-- disponible publiquement ».
--
-- ── CE QU'ON N'A PAS FAIT, ET POURQUOI C'EST LE POINT IMPORTANT
-- La solution évidente — laisser un visiteur anonyme lire n'importe quelle main par son
-- identifiant — est un piège. L'UUID deviendrait le seul secret protégeant TOUTES les mains
-- privées et TOUTES les mains de groupe de l'app. Or un UUID fuit : journaux serveur, captures
-- d'écran, barre d'adresse pendant un partage d'écran, en-têtes de provenance. Un ancien membre
-- d'un groupe qui a gardé un lien y aurait accès à vie. Ça convertirait silencieusement tout le
-- modèle de visibilité en sécurité par l'obscurité.
--
-- Ici, une main n'est atteignable de l'extérieur QUE si son auteur a explicitement créé un jeton.
-- Les milliers de mains que personne ne partagera jamais restent strictement inatteignables, et
-- leur identifiant ne vaut rien.
--
-- ── LA RÈGLE QUI COMPTE : L'AUTEUR, ET LUI SEUL
-- Décidé avec Victor le 23/08. Un membre d'un groupe ne peut PAS fabriquer de lien public vers la
-- main d'un autre membre : ce serait sortir le contenu d'autrui du cercle que son auteur a choisi,
-- par la main de quelqu'un qui n'en est même pas l'auteur — exactement ce que le verrou d'audience
-- interdit déjà à l'auteur lui-même (cf. `audience-verrou.sql`). Et l'auteur, lui, conserve ce
-- droit sur sa propre main : il peut de toute façon déjà la republier en public d'un geste
-- (« Dupliquer la main »).
--
-- Cette règle vit dans la policy d'INSERT, donc en base, et pas dans l'écran.
--
-- ── CE QUE LE JETON NE FAIT PAS
-- Il n'empêche pas la retransmission : le secret est dans l'URL, quiconque la détient y a accès.
-- C'est inhérent au besoin (un ami sans compte doit pouvoir ouvrir la main, donc pas
-- d'authentification, donc pas d'identification du visiteur). Le jeton contrôle SI la main est
-- atteignable, pas QUI la regarde. L'app le dit à l'auteur au moment où il crée le lien.
--
-- ── PAS DE RÉVOCATION POUR L'INSTANT (choix de Victor, 23/08)
-- Le recours existe déjà : supprimer la main supprime le lien (cascade). La révocation viendra si
-- le besoin se manifeste — elle se résumera à supprimer une ligne de `post_shares`, sans migration
-- ni reprise de l'existant. C'est précisément pour ça que le jeton vit dans sa PROPRE TABLE plutôt
-- que dans une colonne de `posts`.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

-- `post_id` en clé primaire : UN seul lien par main, stable. Repartager la même main redonne donc
-- le même lien — sinon chaque partage créerait une URL de plus, toutes vivantes, et « couper le
-- lien » un jour deviendrait « couper lesquels ? ».
create table if not exists public.post_shares (
  post_id    uuid primary key references public.posts(id) on delete cascade,
  -- 16 octets aléatoires en hexadécimal : 128 bits, indevinable, et sans caractère à échapper
  -- dans une URL (contrairement à base64 et ses « + », « / », « = »).
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.post_shares enable row level security;

-- ── LA RÈGLE, EN UNE POLICY ───────────────────────────────────────────────────────────────
drop policy if exists "L auteur seul cree le lien de sa main" on public.post_shares;
create policy "L auteur seul cree le lien de sa main" on public.post_shares
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_shares.post_id and p.author_id = auth.uid()
    )
  );

-- Relire son propre lien : c'est ce qui rend le jeton stable côté app (repartager ne recrée rien).
drop policy if exists "L auteur relit le lien de sa main" on public.post_shares;
create policy "L auteur relit le lien de sa main" on public.post_shares
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_shares.post_id and p.author_id = auth.uid()
    )
  );

-- Droits par colonne, dans l'esprit de F-21 : `token` n'est accordé à personne en écriture, il ne
-- peut donc venir que de la valeur par défaut. Personne ne choisit son propre jeton.
revoke all on public.post_shares from anon, authenticated;
grant select (post_id, token, created_at, created_by) on public.post_shares to authenticated;
grant insert (post_id, created_by)                    on public.post_shares to authenticated;

-- ── LA LECTURE PAR JETON ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER parce qu'un visiteur anonyme n'a, et ne doit avoir, aucun droit de lecture sur
-- `posts`. La fonction est donc la SEULE porte, et elle ne rend que sept colonnes : ni pseudo de
-- l'auteur, ni nom du groupe, ni commentaires, ni j'aime, ni votes — mêmes champs exactement que
-- `fetchPublicPost`, décision produit du 16/08.
--
-- ⚠️ Contourner la RLS oblige à réappliquer À LA MAIN ce qu'elle aurait fait : une main masquée par
-- la modération ou dont l'auteur est banni ne doit pas rester joignable par son lien. Sans ces deux
-- lignes, le partage devient un angle mort de la modération.
create or replace function public.post_by_share_token(p_token text)
returns table (
  id uuid, title text, description text, location text,
  buy_in text, level text, created_at timestamptz, hand jsonb
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, p.title, p.description, p.location, p.buy_in, p.level, p.created_at, p.hand
  from public.post_shares s
  join public.posts p on p.id = s.post_id
  where s.token = p_token
    and p.mod_status = 'visible'
    and not private.is_banned(p.author_id);
$$;

revoke all on function public.post_by_share_token(text) from public;
grant execute on function public.post_by_share_token(text) to anon, authenticated;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES DE POSE. Le comportement se mesure dans `partage-lien-test.sql`.
-- ══════════════════════════════════════════════════════════════════════════════════════════

select 'table post_shares' as controle,
       case when to_regclass('public.post_shares') is not null then 'OK' else 'KO — absente' end as resultat
union all
select 'RLS activee sur post_shares',
       case when (select relrowsecurity from pg_class where oid = 'public.post_shares'::regclass)
            then 'OK' else 'KO — RLS DESACTIVEE, la table est ouverte' end
union all
select 'les 2 policies sont posees',
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'post_shares') = 2
            then 'OK' else 'KO — il en manque' end
union all
select 'token NON accorde en ecriture (personne ne choisit son jeton)',
       case when not exists (select 1 from information_schema.column_privileges
                              where table_schema = 'public' and table_name = 'post_shares'
                                and column_name = 'token' and privilege_type = 'INSERT'
                                and grantee in ('anon', 'authenticated'))
            then 'OK' else 'KO — un membre peut choisir son jeton' end
union all
select 'fonction post_by_share_token executable par anon',
       case when has_function_privilege('anon', 'public.post_by_share_token(text)', 'execute')
            then 'OK' else 'KO — un visiteur sans compte ne pourra rien ouvrir' end;
