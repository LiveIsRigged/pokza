-- ============================================================================
-- L'APERÇU D'UNE MAIN PARLE LA LANGUE DE SON AUTEUR
-- (chantier social, lot 6 · constat de Victor du 24/09/2026 : « le message est en français alors
--  que je suis réglé sur anglais »)
--
-- À JOUER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent, tout en transaction.
--
-- ⚠️ CELUI-CI PASSE AVANT LE DÉPLOIEMENT, contrairement à `apercus-langue.sql`. Ce dernier ne
-- faisait qu'AJOUTER des colonnes à des fonctions déjà appelées : une colonne absente arrivait en
-- `undefined` et l'aperçu retombait en français. Ici, `/post/:id` change de SOURCE — il lisait la
-- table `posts` directement, il passera par la fonction ci-dessous. Tant qu'elle n'existe pas,
-- l'appel répond 404 et la main n'a PLUS d'aperçu du tout (la page, elle, reste intacte).
--
-- ────────────────────────────────────────────────────────────────────────────
-- LE PROBLÈME
--
-- Hier, trois chemins sur quatre parlaient la langue de celui qui envoie le lien (`/invite/`, `/g/`
-- lisent `profiles.language` de l'hôte). Les deux chemins d'une main, eux, lisaient `posts.language`
-- — la langue DÉTECTÉE DANS LA MAIN par le modèle de traduction à la publication. Une main écrite
-- en français par quelqu'un qui a réglé Pokza en anglais sortait donc avec une phrase française.
--
-- Victor a tranché le 24/09 : **la langue de l'AUTEUR**, avec repli sur la langue de la main, puis
-- le français. Une seule règle pour les quatre chemins — un aperçu parle la langue de celui à qui
-- le lien appartient.
--
-- Le mur qui justifie « l'auteur » et non « l'expéditeur » : un robot d'aperçu qui va chercher
-- `/post/:id` ne porte AUCUNE trace de qui a collé le lien. L'URL désigne la main, pas la personne.
-- L'auteur est le plus proche qu'on puisse atteindre — et pour `/s/:token` c'est exact, puisque
-- seul l'auteur crée ces jetons (cf. `partage-lien`).
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QUE ÇA NE DÉVOILE PAS
--
-- `post_public_preview` rend le code de langue du profil de l'auteur. Ce n'est PAS une surface
-- nouvelle : `posts.author_id` est déjà lisible sans compte, et `profile_invite_preview(uuid)` rend
-- déjà `host_language` pour n'importe quel identifiant depuis hier. La même information était donc
-- déjà atteignable en deux appels ; celui-ci en économise un.
--
-- ⚠️ Et ce qu'elle ne rend TOUJOURS PAS : le nom de l'auteur. `posts` étant lisible sans compte, un
-- nom dans une balise `og:` se récolterait en deux requêtes — ce serait F-08 rouvert par la fenêtre.
-- Ne jamais l'ajouter ici.
--
-- ⚠️ PIÈGE PAYÉ AILLEURS, À NE PAS REFAIRE : en `security definer` la RLS ne s'applique plus. Les
-- policies de `posts` (« Lecture selon la visibilite » + la restrictive « posts moderation and
-- blocks » de `moderation.sql`) sont donc RECOPIÉES À LA MAIN dans le corps — `visibility`,
-- `mod_status` et l'auteur banni. Sans ça, cette fonction donnerait un aperçu à une main retirée par
-- la modération, que la page publique refuse d'afficher.
--
-- ⚠️ `drop` PUIS `create` ET NON `create or replace` : Postgres refuse de changer le type de retour
-- d'une fonction existante. Chaque `drop` emporte ses droits — d'où le `grant` après CHAQUE
-- création, sans exception.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. L'APERÇU D'UNE MAIN PUBLIQUE — fonction NEUVE
--
--    Elle remplace la lecture directe de `posts` que faisait `worker.js` : c'était la seule de tout
--    le fichier, et la seule que `anon` ait encore. Les quatre portes passent maintenant par une
--    fonction, ce qui met leurs filtres au même endroit.
--
--    `left join` sur les profils, et non `join` : un profil manquant ferait disparaître l'aperçu
--    d'une main qui, elle, existe. On préfère une langue nulle — elle retombe sur celle de la main.
-- ────────────────────────────────────────────────────────────────────────────

drop function if exists public.post_public_preview(uuid);

create function public.post_public_preview(p_post uuid)
returns table (
  title           text,
  language        text,
  author_language text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.title, p.language, a.language
    from public.posts p
    left join public.profiles a on a.id = p.author_id
   where p.id = p_post
     and p.visibility = 'public'
     and p.mod_status = 'visible'
     and not private.is_banned(p.author_id);
$$;

revoke all on function public.post_public_preview(uuid) from public;
grant execute on function public.post_public_preview(uuid) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LA MAIN OUVERTE PAR UN JETON — une colonne de plus
--
--    Corps identique à celui d'`apercus-langue.sql`, au `left join` et à la colonne près.
--    `language` (celle de la main) RESTE : c'est le repli quand l'auteur n'a pas encore rouvert
--    l'app depuis que la colonne existe — 3 profils sur 5 en PROD au 24/09.
-- ────────────────────────────────────────────────────────────────────────────

drop function if exists public.post_by_share_token(text);

create function public.post_by_share_token(p_token text)
returns table (
  id uuid, title text, description text, location text, tournament_name text,
  buy_in text, level text, created_at timestamptz, hand jsonb, language text,
  author_language text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id, p.title, p.description, p.location, p.tournament_name,
         p.buy_in, p.level, p.created_at, p.hand, p.language, a.language
  from public.post_shares s
  join public.posts p on p.id = s.post_id
  left join public.profiles a on a.id = p.author_id
  where s.token = p_token
    and p.mod_status = 'visible'
    and not private.is_banned(p.author_id);
$$;

revoke all on function public.post_by_share_token(text) from public;
grant execute on function public.post_by_share_token(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- CONTRÔLES — tout doit être OK
-- ────────────────────────────────────────────────────────────────────────────

select * from (values
  (1, 'les 2 fonctions sont posees, en security definer',
      (select case when count(*) = 2 then 'OK'
                   else 'KO — ' || count(*) || ' sur 2 : ' || coalesce(string_agg(proname, ', '), 'aucune') end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and p.proname in ('post_public_preview', 'post_by_share_token'))),
  (2, 'les 2 sont appelables SANS compte (le drop emporte les droits)',
      (select case when count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) = 2
                   then 'OK'
                   else 'KO — il manque un grant apres le drop' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('post_public_preview', 'post_by_share_token'))),
  (3, 'chacune rend author_language',
      (select case when count(*) = 2 then 'OK'
                   else 'KO — ' || count(*) || ' sur 2' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and 'author_language' = any(p.proargnames)
          and p.proname in ('post_public_preview', 'post_by_share_token'))),
  (4, 'post_by_share_token n''a RIEN perdu au passage (11 colonnes rendues)',
      (select case when manquantes is null then 'OK'
                   else 'KO — il manque : ' || manquantes end
         from (select (select string_agg(x, ', ')
                         from unnest(array['id','title','description','location','tournament_name',
                                           'buy_in','level','created_at','hand','language',
                                           'author_language']) x
                        where not x = any(p.proargnames)) as manquantes
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'post_by_share_token') z)),
  -- ⚠️ `left join lateral` et non un appel dans le SELECT : quand la fonction ne rend rien — ce qui
  -- EST le succès attendu ici — un appel dans le SELECT fait disparaître la ligne testée, et
  -- « aucune ligne » se lit alors aussi bien « rien à tester » que « rien rendu ». Le lateral garde
  -- la ligne source, `a.title` arrive nul, et les deux cas se distinguent enfin.
  (5, 'un identifiant inconnu ne rend rien',
      (select case when count(*) = 0 then 'OK' else 'KO' end
         from public.post_public_preview('00000000-0000-0000-0000-000000000000'::uuid))),
  (6, 'une main NON publique n''a pas d''apercu par /post/:id',
      (select case when count(*) = 0 then 'OK — aucune main non publique en base'
                   when count(a.title) = 0 then 'OK — ' || count(*) || ' testee(s), aucune rendue'
                   else 'KO — ' || count(a.title) || ' rendue(s) sur ' || count(*) end
         from (select id from public.posts where visibility <> 'public' limit 5) p
         left join lateral public.post_public_preview(p.id) a on true)),
  (7, 'une main RETIREE par la moderation n''a pas d''apercu non plus',
      (select case when count(*) = 0 then 'OK — aucune main retiree en base'
                   when count(a.title) = 0 then 'OK — ' || count(*) || ' testee(s), aucune rendue'
                   else 'KO — ' || count(a.title) || ' rendue(s) sur ' || count(*) end
         from (select id from public.posts where mod_status <> 'visible' limit 5) p
         left join lateral public.post_public_preview(p.id) a on true)),
  -- ⚠️ Les mains d'un compte BANNI sont exclues de la source de ce contrôle-ci : la fonction les
  -- refuse à bon droit, et sans ce filtre un seul banni en base ferait sortir un KO mensonger.
  -- C'est le piège de `verif-sql-pieges`, qui a déjà coûté une demi-heure sur le DEV.
  (8, 'sur de vraies mains publiques, les deux langues sortent',
      (select case when count(*) = 0 then 'OK — aucune main publique en base'
                   when count(a.title) < count(*) then 'KO — ' || (count(*) - count(a.title))
                        || ' main(s) publique(s) sans apercu'
                   else 'OK — ' || count(*) || ' main(s), dont '
                        || count(a.author_language) || ' dont l''auteur a une langue' end
         from (select q.id from public.posts q
                where q.visibility = 'public' and q.mod_status = 'visible'
                  and not private.is_banned(q.author_id) limit 5) p
         left join lateral public.post_public_preview(p.id) a on true)),
  (9, 'anon ne peut TOUJOURS PAS lire la table profiles (F-08 reste ferme)',
      (select case when count(*) = 0 then 'OK'
                   else 'KO — ' || count(*) || ' colonne(s) lisibles par anon' end
         from information_schema.column_privileges
        where grantee = 'anon' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT')),
  (10, 'le filtre des comptes bannis est dans les 2 corps',
      (select case when count(*) = 2 then 'OK'
                   else 'KO — ' || count(*) || ' sur 2 filtrent les bannis' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc like '%is_banned%'
          and p.proname in ('post_public_preview', 'post_by_share_token')))
) as t(n, controle, resultat);

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- APRÈS COUP : si `post_public_preview` répond PGRST202 « function not found » dans la minute qui
-- suit, c'est le cache du catalogue de PostgREST — `notify pgrst, 'reload schema';` règle la
-- question. La fonction étant NEUVE, ce cas est plus probable ici que pour les précédentes.
-- ════════════════════════════════════════════════════════════════════════════
