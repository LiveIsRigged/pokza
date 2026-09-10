-- ============================================================================
-- ORDRE DU FEED — refonte complète du classement (chantier des 09-10/09/2026).
--
-- À JOUER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent : rejouable sans risque, le tout dans une transaction.
-- ⚠️ ORDRE IMPOSÉ : ce script AVANT le déploiement de l'app. Le serveur de dev tape la PROD.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QU'ON REMPLACE, ET POURQUOI
--
-- L'ancien `affinity_score` valait `+30 si ami · +3 par ami commun (max 24) · +5 si format
-- favori · −1 par jour`. Trois pannes, toutes mesurées :
--
--   1. L'ENTERREMENT. Le `+30` vaut trente jours. Tant qu'un ami a publié dans le mois, une main
--      d'inconnu ne PEUT PAS atteindre le haut du fil. La panne se referme sur elle-même : on ne
--      voit pas d'inconnus, donc on ne s'en fait pas, donc le graphe social se fige.
--   2. LE FIGEMENT. Le score s'écrit `f(main, amitiés, heure)` — l'historique du lecteur n'entre
--      nulle part. La décroissance étant uniforme, l'ordre est RIGOUREUSEMENT identique trois
--      jours plus tard. Accélérer le `−1/jour` n'y change rien, par construction.
--   3. L'AVEUGLEMENT. `like_count`, `comment_count` et les votes sont exposés par la vue et
--      ignorés du classement.
--
-- Et un effet de bord : `mutual_friend_count(auth.uid())` sur sa propre main renvoie TOUS ses
-- amis (l'intersection de mes amis avec mes amis), soit +24 en plus du +30. Base 59 — le maximum
-- du barème — à chaque publication.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LE PRINCIPE DU NOUVEAU SYSTÈME
--
-- Les mains qui se disputent le haut du fil sont séparées par des HEURES. L'ancien bonus valait
-- jusqu'à 37 jours : il n'était donc jamais un départage, il ÉTAIT le classement, et la fraîcheur
-- n'était qu'un bruit de fond. D'où la règle qui gouverne tout ce fichier :
--
--     un bonus doit pouvoir départager deux mains publiées à quelques heures d'écart,
--     il ne doit pas pouvoir battre un jour de fraîcheur.
--
-- Plafond total du bonus : 2 jours. Et l'ordre des termes vient des objectifs produit — ce qu'on
-- veut plus, c'est de l'interaction, donc c'est l'ENGAGEMENT qui pèse le plus (il était le plus
-- faible). Les amis communs, eux, ne servent qu'à départager deux inconnus publiés le même soir :
-- la répartition par affinité est portée par les RÉSERVOIRS, pas par le barème.
--
--     score        = âge apparent − bonus                     (le plus petit devant)
--     âge apparent = âge réel × (1 + k × lectures) + F × lectures
--     lectures     = min(5, lues) − réactions nouvelles ÷ 3    (borné à 0)
--
-- k = 3 et F = 5 j sur les mains des autres ; k = 7 et F = 12 j sur les siennes (« on s'en fout
-- un peu de revoir sa main, on a les notifs »). Le forfait F est le nombre que la calibration a
-- fait sortir : le multiplicateur seul, étant proportionnel, ne retire presque rien à une main
-- FRAÎCHE déjà lue — sans lui il faudrait 7 lectures pour déloger la main d'hier, avec lui 2.
--
-- Le plafond à 5 lectures n'est pas là pour borner l'enterrement (au fond, l'ordre ne se voit
-- pas) mais pour qu'une main puisse TOUJOURS revenir : à r = 3, quinze réactions la ramènent à
-- « pas lue ». Sans plafond, une main assez croisée sortirait définitivement et silencieusement
-- du jeu, et « réagir rajeunit » deviendrait lettre morte sans que rien ne le signale.
--
-- La composition de page vit dans `feed_order()`, plus bas : un score ne garantit jamais rien,
-- il est toujours dominé par son plus gros terme. C'est l'architecture de X, d'Instagram et de
-- Meta — aucun ne trie un seul tas.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LES RÉGLAGES, TOUS AU MÊME ENDROIT
--
-- Contrainte posée pendant le chantier : les nombres du vieillissement et du barème doivent tenir
-- au même endroit, pour qu'un réglage soit un script d'UNE LIGNE et non une réécriture de la vue.
-- D'où cette table à ligne unique (`id boolean primary key check (id)` → au plus une ligne).
--
-- ⚠️ La vue la lit en `left join lateral … limit 1` avec un `coalesce` sur CHAQUE colonne. C'est
-- délibéré : si la ligne manquait ou devenait illisible, un `cross join` renverrait ZÉRO ligne et
-- le feed serait vide. Là, il retombe sur les valeurs de référence et continue de tourner.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.feed_tuning (
  id                      boolean primary key default true check (id),
  -- vieillissement par la lecture
  k_other                 numeric not null default 3,    -- multiplicateur, mains des autres
  k_own                   numeric not null default 7,    -- … et des siennes
  f_other                 numeric not null default 5,    -- forfait en jours, mains des autres
  f_own                   numeric not null default 12,   -- … et des siennes
  read_cap                integer not null default 5,    -- au-delà, lire n'enterre plus
  reactions_per_read      numeric not null default 3,    -- r : réactions annulant une lecture
  -- barème du bonus — plafond total 2 jours
  bonus_engagement_factor numeric not null default 0.7,
  bonus_engagement_cap    numeric not null default 1.0,
  bonus_format            numeric not null default 0.5,
  bonus_mutual_each       numeric not null default 0.1,
  bonus_mutual_cap        numeric not null default 0.5,
  -- composition de page
  floor_first_discovery   integer not null default 6,    -- ≥ 1 main d'ailleurs dans les 6 premières
  floor_second_discovery  integer not null default 10,   -- ≥ 2 dans les 10 premières
  fresh_circle_hours      integer not null default 48,   -- priorité des mains d'amis fraîches
  page_depth              integer not null default 200   -- profondeur rendue par feed_order()
);

insert into public.feed_tuning (id) values (true) on conflict (id) do nothing;

alter table public.feed_tuning enable row level security;

drop policy if exists "Les reglages du feed sont lisibles" on public.feed_tuning;
create policy "Les reglages du feed sont lisibles"
  on public.feed_tuning for select to authenticated using (true);

-- Personne n'écrit depuis l'app : le réglage est un UPDATE joué à la main dans l'éditeur SQL.
revoke insert, update, delete on public.feed_tuning from authenticated, anon;
grant select on public.feed_tuning to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LE COMPTEUR DE VOTES
--
-- Mesuré pendant le chantier : il n'y a AUCUN déclencheur ni compteur sur `votes`, contrairement
-- à `likes`/`comments` dont `like_count`/`comment_count` sont déjà des colonnes stockées. Or la
-- colonne sert TROIS fois — l'engagement, la remontée par réaction, et plus tard les paliers de
-- notification de vote. Et il ne faut SURTOUT pas la compter par sous-requête par ligne : ce
-- serait la forme de `mutual_friend_count`, déjà le poste le plus lourd du classement.
--
-- L'UPDATE est traité alors qu'aucune policy ne l'autorise aujourd'hui (changer de vote = delete
-- puis insert). C'est de l'assurance à zéro coût : le jour où une policy UPDATE apparaîtra, le
-- compteur ne se mettra pas silencieusement à mentir.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.posts add column if not exists vote_count integer not null default 0;

update public.posts p
   set vote_count = v.n
  from (select post_id, count(*)::int as n from public.votes group by post_id) v
 where v.post_id = p.id and p.vote_count is distinct from v.n;

create or replace function public.handle_vote_change() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set vote_count = vote_count + 1 where id = new.post_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
    return old;
  elsif TG_OP = 'UPDATE' and new.post_id is distinct from old.post_id then
    update public.posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
    update public.posts set vote_count = vote_count + 1 where id = new.post_id;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists on_vote_change on public.votes;
create trigger on_vote_change
  after insert or delete or update on public.votes
  for each row execute function public.handle_vote_change();

-- F-21 : droits par colonne. Le lot F-21 n'accorde que 9 colonnes nommées sur `posts`, donc
-- `vote_count` n'est déjà accessible à personne — comme `like_count` et `comment_count`, qui sont
-- eux aussi tenus par un déclencheur. Ce `revoke` ne corrige rien : il rend l'intention opposable
-- et protège d'un futur `grant update` écrit trop large.
revoke update (vote_count) on public.posts from authenticated, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LE JOURNAL DES LECTURES
--
-- ⚠️ STRICTEMENT PRIVÉ À SON LECTEUR. Une seule policy, `user_id = auth.uid()`, et RIEN qui
-- laisse l'auteur d'une main lire les lignes la concernant : la table n'a donc jamais à être
-- jointe à `posts` pour un contrôle de droits. Décision du 10/09 : PAS de « qui a vu ma main ».
-- Corollaire à ne pas rater plus tard : pas de compteur de vues non plus — à peu d'utilisateurs,
-- « 2 personnes ont vu cette main » désigne les deux personnes aussi sûrement qu'une liste.
--
-- `reactions_at_read` est la moitié qui rend la remontée possible sans coût : on stocke le total
-- de réactions AU MOMENT de la lecture, et la remontée est alors une différence de deux entiers.
-- Compter les réactions « depuis » par sous-requête par ligne aurait été la forme de
-- `mutual_friend_count`, c'est-à-dire le poste le plus lourd, une seconde fois.
--
-- Pas de durée de conservation : écartée de la v1 le 10/09, parce que purger une vue n'a pas
-- d'effet produit dans la pente (oublier la lecture d'une main de 6 mois : 2905 → 180 jours
-- apparents, d'enterrée à enterrée). Restent les deux CASCADES, qui sont des obligations et non
-- des réglages — d'où les `on delete cascade` ci-dessous.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.post_views (
  user_id           uuid        not null references auth.users(id) on delete cascade,
  post_id           uuid        not null references public.posts(id) on delete cascade,
  read_count        integer     not null default 1,
  last_read_at      timestamptz not null default now(),
  reactions_at_read integer     not null default 0,
  primary key (user_id, post_id)
);

alter table public.post_views enable row level security;

drop policy if exists "Chacun ne lit que son propre journal" on public.post_views;
create policy "Chacun ne lit que son propre journal"
  on public.post_views for select to authenticated using (user_id = auth.uid());

-- Aucune écriture directe : tout passe par `mark_post_read`, qui porte l'anti-rebond et le
-- plafond. Sans ce verrou, un client pourrait écrire `read_count = 99` ou rafraîchir
-- `reactions_at_read` et annuler la remontée d'une main qui le dérange.
revoke insert, update, delete on public.post_views from authenticated, anon;
grant select on public.post_views to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. MARQUER UNE MAIN COMME LUE
--
-- Ce qu'est une main LUE (tranché le 10/09) : `déroulée OU 8 s à l'écran, moitié de carte
-- visible, minuteur suspendu en arrière-plan`. Le déroulé n'est PAS un proxy : `HandReplayer` est
-- monté DANS la carte du fil, donc c'est un évènement réel sans quitter le fil — c'est ce qui
-- permet un seuil aussi long sans rien perdre. Toutes les surfaces valent une lecture (fil, page
-- dédiée, notification), d'où une seule fonction appelée de partout.
--
-- ANTI-REBOND 12 H, et le piège qu'il évite : sans lui, descendre puis remonter le fil vaudrait
-- trois lectures. C'est aussi lui qui fait que « voir la carte puis ouvrir sa page » ne compte
-- qu'une fois. Même fenêtre que le garde-fou de `notify_friend_posted`.
--
-- ⚠️ DANS la fenêtre, on ne touche À RIEN — pas même `last_read_at`. Rafraîchir la date ferait
-- GLISSER la fenêtre : quelqu'un qui repasse sur la même main toutes les onze heures ne verrait
-- jamais son compteur bouger. Et rafraîchir `reactions_at_read` annulerait en silence la remontée
-- acquise depuis la vraie lecture.
--
-- SECURITY DEFINER, volontairement étroit — même forme que `mark_group_seen` : la fonction
-- n'écrit QUE la ligne de l'appelant, ne lit rien qu'elle ne rende, et le seul effet possible
-- d'un appel sur une main quelconque est d'enterrer cette main DANS SON PROPRE FIL. Il n'y a donc
-- pas de contrôle de visibilité à faire : il n'y a rien à exfiltrer.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.mark_post_read(p_post_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_user      uuid := auth.uid();
  v_reactions integer;
  v_cap       integer;
begin
  if v_user is null then return; end if;

  select coalesce(p.like_count, 0) + coalesce(p.comment_count, 0) + coalesce(p.vote_count, 0)
    into v_reactions
    from public.posts p where p.id = p_post_id;

  if not found then return; end if;   -- main supprimée entre l'affichage et l'appel

  select coalesce(t.read_cap, 5) into v_cap from public.feed_tuning t limit 1;
  v_cap := coalesce(v_cap, 5);

  insert into public.post_views (user_id, post_id, read_count, last_read_at, reactions_at_read)
  values (v_user, p_post_id, 1, now(), v_reactions)
  on conflict (user_id, post_id) do update set
    read_count = case
        when post_views.last_read_at > now() - interval '12 hours'
          then post_views.read_count
        else least(post_views.read_count + 1, v_cap)
      end,
    last_read_at = case
        when post_views.last_read_at > now() - interval '12 hours'
          then post_views.last_read_at
        else now()
      end,
    reactions_at_read = case
        when post_views.last_read_at > now() - interval '12 hours'
          then post_views.reactions_at_read
        else v_reactions
      end;
end;
$$;

revoke all on function public.mark_post_read(uuid) from public, anon;
grant execute on function public.mark_post_read(uuid) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. `posts_ranked` — LE SCORE PAR LIGNE
--
-- ⚠️ AUCUN FICHIER DU DÉPÔT NE DÉTIENT LA DÉFINITION QUI TOURNE VRAIMENT. La vue a été redéfinie
-- au moins cinq fois (feed-boost, visibilité groupe, modération, « modifié », nom du tournoi), et
-- les deux dernières fois par enveloppement dynamique. On ne la recopie donc pas : on la LIT en
-- place avec `pg_get_viewdef`, une seule fois, et on la fige sous le nom `posts_ranked_base`.
--
-- Pourquoi une vue socle plutôt que l'enveloppement direct des deux scripts précédents : ceux-là
-- ajoutaient une colonne et ne repassaient jamais. Ici les nombres vont être RÉGLÉS à l'usage, et
-- réenvelopper une vue déjà enveloppée dupliquerait les colonnes. Avec le socle, rejouer ce
-- fichier ne fait que remplacer la couche extérieure — autant de fois qu'on veut.
--
-- Le socle garde ses `reloptions` : perdre `security_invoker = true` transformerait une vue
-- filtrée par la RLS en vue qui la contourne. C'est la ligne la plus importante du bloc.
--
-- `affinity_score` survit dans `b.*` : il ne sert plus à rien mais rien ne le lit non plus une
-- fois l'app déployée, et le laisser évite un `drop` qui casserait un client resté en arrière.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def  text;
  v_opts text[];
begin
  if to_regclass('public.posts_ranked_base') is null then
    select pg_get_viewdef('public.posts_ranked'::regclass, true), c.reloptions
      into v_def, v_opts
      from pg_class c where c.oid = 'public.posts_ranked'::regclass;

    execute format(
      'create view public.posts_ranked_base %s as %s',
      case when v_opts is null then '' else 'with (' || array_to_string(v_opts, ', ') || ')' end,
      rtrim(btrim(v_def), ';')
    );
    grant all on table public.posts_ranked_base to anon, authenticated, service_role;
    raise notice 'posts_ranked_base : socle fige depuis la definition en place';
  else
    raise notice 'posts_ranked_base : deja present, on ne retouche pas au socle';
  end if;
end $$;

drop view if exists public.posts_ranked;

create view public.posts_ranked with (security_invoker='on') as
select
  b.*,
  coalesce(pv.read_count, 0)                                              as read_count,
  l.lectures,
  (l.lectures = 0)                                                        as is_unread,
  c.is_own,
  c.is_cercle,
  (c.is_cercle and l.lectures = 0
     and a.age_days < coalesce(t.fresh_circle_hours, 48) / 24.0)          as is_fresh_circle,
  (ap.apparent - bo.bonus)                                                as feed_score
from public.posts_ranked_base b
  -- `vote_count` n'est pas dans le socle : c'est une colonne de `posts` créée par ce script.
  left join public.posts p2 on p2.id = b.id
  -- Le journal du LECTEUR, pas celui de la main. La RLS de `post_views` rendrait de toute façon
  -- les lignes des autres invisibles ; la condition explicite dit l'intention sur place.
  left join public.post_views pv on pv.user_id = auth.uid() and pv.post_id = b.id
  -- `left join lateral … limit 1` et non `cross join` : voir le commentaire de `feed_tuning`.
  -- Une table de réglages absente ne doit jamais pouvoir vider le fil.
  left join lateral (select * from public.feed_tuning limit 1) t on true
  left join lateral (
    select coalesce(pr.variante_favorite, 'nlhe') as pref_variant,
           case when pr.format_favori like 'cash%' then 'cash' else 'tournament' end as pref_game_type
      from public.profiles pr where pr.id = auth.uid()
  ) pf on true
  cross join lateral (
    select extract(epoch from (now() - b.created_at)) / 86400.0 as age_days,
           (b.author_id = auth.uid())                           as is_own_x,
           -- Deux comptes de réactions, et la différence n'est pas un oubli :
           --  · `reactions_now` est BRUT — c'est celui de la remontée (r = 3). Un commentaire y
           --    vaut 1, sinon UN seul commentaire annulerait une lecture entière.
           --  · `engagement_raw` est PONDÉRÉ — un commentaire vaut 3, parce que le bonus
           --    d'engagement récompense le débat et qu'écrire coûte plus qu'un doigt sur l'écran.
           --    (1 vote = 1 like : l'un et l'autre sont un doigt sur l'écran.)
           coalesce(b.like_count, 0) + coalesce(b.comment_count, 0)
             + coalesce(p2.vote_count, 0)                       as reactions_now,
           coalesce(b.like_count, 0) + coalesce(p2.vote_count, 0)
             + 3 * coalesce(b.comment_count, 0)                 as engagement_raw
  ) a
  cross join lateral (
    select a.is_own_x as is_own,
           -- CERCLE = amis, groupes, ses propres mains. DÉCOUVERTE = tout le reste. Les amis
           -- communs sont un signal de DÉCOUVERTE et non d'amitié : ils ne jouent que là.
           (coalesce(b.author_is_friend, false) or a.is_own_x or b.group_id is not null) as is_cercle
  ) c
  cross join lateral (
    -- `greatest(0, …)` extérieur : le plancher « comme si je ne l'avais pas lue ». C'est lui qui
    -- empêche le double comptage avec le bonus d'engagement — une main très commentée ne peut pas
    -- devenir PLUS neuve que neuve.
    -- `greatest(0, réactions − snapshot)` intérieur : un like retiré ne doit pas enterrer la main.
    select greatest(
             0::numeric,
             least(coalesce(pv.read_count, 0), coalesce(t.read_cap, 5))::numeric
               - greatest(0, a.reactions_now - coalesce(pv.reactions_at_read, 0))::numeric
                 / nullif(coalesce(t.reactions_per_read, 3), 0)
           ) as lectures
  ) l
  cross join lateral (
    select a.age_days
             * (1 + case when c.is_own then coalesce(t.k_own, 7) else coalesce(t.k_other, 3) end
                    * l.lectures)
           + case when c.is_own then coalesce(t.f_own, 12) else coalesce(t.f_other, 5) end
             * l.lectures as apparent
  ) ap
  cross join lateral (
    select
      -- ENGAGEMENT — le terme le plus fort du barème, parce que c'est le seul qui récompense ce
      -- qu'on veut de plus. Logarithmique : la première réaction doit compter plus que la
      -- vingtième, sinon une main déjà populaire écrase tout le reste.
      least(coalesce(t.bonus_engagement_cap, 1.0),
            coalesce(t.bonus_engagement_factor, 0.7) * log(10, (1 + a.engagement_raw)::numeric))
      -- FORMAT FAVORI du lecteur.
      + case when coalesce(b.hand ->> 'variant', 'nlhe') = pf.pref_variant
              and coalesce(b.hand ->> 'gameType', 'cash') = pf.pref_game_type
             then coalesce(t.bonus_format, 0.5) else 0 end
      -- AMIS COMMUNS, en découverte SEULEMENT, et le plus faible des trois. Leur métier réel est
      -- de départager deux inconnus publiés le même soir ; la répartition par affinité, elle, est
      -- portée par les réservoirs. À 3 points plafonnés à 24 ils valaient 24 JOURS et écrasaient
      -- tout — c'est ce qui rendait la découverte impossible.
      + case when not c.is_cercle
             then least(coalesce(b.mutual_friend_count, 0) * coalesce(t.bonus_mutual_each, 0.1),
                        coalesce(t.bonus_mutual_cap, 0.5))
             else 0 end as bonus
  ) bo;

grant all on table public.posts_ranked to anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. `feed_order()` — LA COMPOSITION DE PAGE
--
-- Un score ne garantit JAMAIS rien : il est toujours dominé par son plus gros terme. C'est la
-- leçon structurelle du chantier, et la raison pour laquelle aucun grand réseau ne trie un seul
-- tas. Les trois règles qui ne peuvent pas s'écrire en `order by` vivent donc ici.
--
--   a) LA PARTITION. Aucune main jamais lue n'est masquée par une main déjà lue. « Jamais lue »
--      veut dire `lectures = 0` — donc une main dont trois réactions ont annulé la lecture
--      REPASSE dans le bloc du haut : la remontée traverse la frontière au lieu de buter dessus,
--      et `r = 3` prend enfin un sens observable.
--
--   b) LA PRIORITÉ 48 H. Une main d'ami publiée depuis moins de 48 h et non lue passe toujours
--      devant un inconnu. C'est l'ancien `+30` débarrassé des deux choses qui le rendaient
--      toxique : il durait trente jours (celui-ci deux) et il s'appliquait aux mains DÉJÀ LUES
--      (celui-ci non). Sous cette forme il ne peut plus produire l'enterrement.
--
--   c) LE PLANCHER DE DÉCOUVERTE. Au moins une main d'ailleurs dans les six premières, au moins
--      deux dans les dix. C'est un PLANCHER, pas une assignation — le rejeu du scénario a tranché
--      entre les deux lectures possibles : avec des positions FIXES, une main de 192 jours lue
--      deux fois prenait la 7e place devant une main à −9 que personne n'avait lue. Absurde.
--      Et c'est ce plancher qui résout la collision avec (b) : le « toujours » de la priorité
--      48 h devient « sauf à la sixième », et c'est le seul mot qui tombe.
--      ⚠️ Il ne réserve de place qu'à des mains d'ailleurs JAMAIS LUES. Ça n'était pas dit au
--      moment de trancher, et c'est l'épreuve par corpus tirés au sort qui l'a rendu nécessaire :
--      forcer une main de découverte déjà lue la ferait passer devant des mains non lues, soit
--      exactement l'inverse du but. Quand toutes les mains d'ailleurs ont été lues, il n'y a rien
--      à faire découvrir et le plancher se tait — (a) prime (c), sans exception.
--
-- ⚠️ Le gabarit « 8 / 2 » n'a pas besoin d'être écrit : « au plus 8 mains du cercle dans les dix
-- premières » et « au moins 2 mains d'ailleurs dans les dix premières » sont la MÊME contrainte.
-- Une seule règle, pas deux.
--
-- AUCUN SÉPARATEUR ni bandeau ne marque la frontière (tranché le 10/09). Conséquence assumée :
-- les jours creux, rien n'expliquera qu'on revoit des mains — seule la rotation reste.
--
-- POURQUOI CETTE FONCTION NE REND QUE DES IDENTIFIANTS. La pagination par `offset` sur une vue
-- reclassée est instable par nature, et elle le devient BEAUCOUP plus ici : lire une main change
-- son rang, donc dérouler le fil le réordonne SOUS LE POUCE. L'app appelle donc `feed_order()`
-- UNE fois à l'ouverture, fige la liste, et pagine dedans. C'est ce qui remplace le `Set` de
-- déduplication d'`App.tsx`, qui rattrapait le symptôme.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.feed_order()
returns table (post_id uuid, feed_rank integer)
language plpgsql stable security invoker set search_path to 'public' as $$
declare
  v_floor1 integer; v_floor2 integer; v_depth integer;
  v_c_id uuid[]; v_c_rn integer[];
  v_d_id uuid[]; v_d_rn integer[]; v_d_unread boolean[];
  i_c integer := 1; i_d integer := 1;
  n_c integer; n_d integer;
  v_pos integer := 0; v_emis integer := 0; v_force boolean;
begin
  select coalesce(t.floor_first_discovery, 6), coalesce(t.floor_second_discovery, 10),
         coalesce(t.page_depth, 200)
    into v_floor1, v_floor2, v_depth
    from public.feed_tuning t limit 1;
  v_floor1 := coalesce(v_floor1, 6);
  v_floor2 := coalesce(v_floor2, 10);
  v_depth  := coalesce(v_depth, 200);

  -- L'ORDRE DE BASE, puis les deux réservoirs extraits en gardant cet ordre.
  with ordonne as (
    select r.id, (not r.is_cercle) as is_discovery, r.is_unread,
           (row_number() over (
             order by r.is_unread       desc,   -- (a) la partition
                      r.is_fresh_circle desc,   -- (b) la priorité 48 h, neutre hors du bloc non lu
                      r.feed_score      asc,    -- le score, le plus petit devant
                      r.created_at      desc,   -- départage des ex æquo…
                      r.id                      -- … et départage TOTAL : deux appels successifs
           ))::int as rn                        --     doivent rendre le même ordre
      from public.posts_ranked r
  )
  select array_agg(o.id        order by o.rn) filter (where not o.is_discovery),
         array_agg(o.rn        order by o.rn) filter (where not o.is_discovery),
         array_agg(o.id        order by o.rn) filter (where     o.is_discovery),
         array_agg(o.rn        order by o.rn) filter (where     o.is_discovery),
         array_agg(o.is_unread order by o.rn) filter (where     o.is_discovery)
    into v_c_id, v_c_rn, v_d_id, v_d_rn, v_d_unread
    from ordonne o;

  n_c := coalesce(array_length(v_c_id, 1), 0);
  n_d := coalesce(array_length(v_d_id, 1), 0);

  -- LA FUSION. Par défaut on prend la meilleure des deux têtes — ce qui redonne exactement
  -- l'ordre de base. Le plancher n'intervient que pour FORCER une main d'ailleurs.
  --
  -- ⚠️ Le plancher est une contrainte de COMPTE, pas de POSITION. Une version antérieure
  -- promouvait « à la 6e » et « à la 10e » par une clé de tri : elle est FAUSSE dès que les deux
  -- promotions se cumulent — la première insère une ligne, décale tout d'un cran, et la seconde
  -- atterrit en 11e. Éprouvé sur 4000 corpus tirés au sort.
  while (i_c <= n_c or i_d <= n_d) and v_pos < v_depth loop
    v_pos := v_pos + 1;

    -- « Même en prenant une main d'ailleurs à chaque place restante, arriverait-on encore à
    -- l'échéance ? » Si non, c'est maintenant ou jamais.
    --
    -- ⚠️ ET SEULEMENT DES MAINS JAMAIS LUES. Une main de découverte déjà lue n'a aucune place à
    -- réserver — il n'y a rien à faire découvrir — et la remonter masquerait du contenu non lu,
    -- c'est-à-dire exactement ce que ce classement existe pour empêcher. La partition prime le
    -- plancher, sans exception.
    v_force := i_d <= n_d and v_d_unread[i_d] and (
                    (v_emis < 1 and v_pos >= v_floor1)
                 or (v_emis < 2 and v_pos >= v_floor2 - (2 - v_emis) + 1));

    if i_d > n_d then
      post_id := v_c_id[i_c]; i_c := i_c + 1;
    elsif i_c > n_c or v_force or v_d_rn[i_d] < v_c_rn[i_c] then
      post_id := v_d_id[i_d]; i_d := i_d + 1; v_emis := v_emis + 1;
    else
      post_id := v_c_id[i_c]; i_c := i_c + 1;
    end if;

    feed_rank := v_pos;
    return next;
  end loop;
end;
$$;

revoke all on function public.feed_order() from public, anon;
grant execute on function public.feed_order() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. VÉRIFICATIONS
--
-- ⚠️ `auth.uid()` est NUL dans l'éditeur SQL — pas de jeton, donc pas d'utilisateur courant.
-- Appeler `feed_order()` ici ne prouverait donc rien (la RLS de `posts` ne rendrait rien). Ces
-- contrôles portent sur la STRUCTURE ; le classement lui-même se vérifie depuis l'app connectée.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_manquantes text;
  v_ecart      integer;
  v_reglages   integer;
begin
  select string_agg(c, ', ') into v_manquantes
    from unnest(array['read_count','lectures','is_unread','is_own','is_cercle',
                      'is_fresh_circle','feed_score']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'posts_ranked'
                        and column_name = c);
  if v_manquantes is not null then
    raise exception 'posts_ranked : colonnes manquantes (%)', v_manquantes;
  end if;

  select count(*) into v_ecart
    from public.posts p
    left join (select post_id, count(*)::int n from public.votes group by post_id) v
      on v.post_id = p.id
   where p.vote_count is distinct from coalesce(v.n, 0);
  if v_ecart > 0 then
    raise exception 'vote_count : % main(s) en desaccord avec la table votes', v_ecart;
  end if;

  select count(*) into v_reglages from public.feed_tuning;
  if v_reglages <> 1 then
    raise exception 'feed_tuning : % ligne(s), il en faut exactement une', v_reglages;
  end if;

  if to_regclass('public.post_views') is null then
    raise exception 'post_views : table absente';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'on_vote_change') then
    raise exception 'on_vote_change : declencheur absent';
  end if;

  raise notice 'ordre du feed : structure conforme (vue, journal, compteur de votes, reglages)';
end $$;

commit;

-- ============================================================================
-- POUR RÉGLER LES NOMBRES ENSUITE — un UPDATE d'une ligne, jamais une réécriture de la vue :
--
--   update public.feed_tuning set f_other = 8;              -- forfait par lecture
--   update public.feed_tuning set bonus_mutual_each = 0.2;  -- poids d'un ami commun
--   select * from public.feed_tuning;                       -- l'état courant
--
-- CE QUI RESTE OUVERT, ET C'EST VOULU :
--  · La profondeur `page_depth` (200) est une borne de charge, PAS un horizon de classement.
--    L'horizon a été écarté de la v1 : une main d'un mois est déjà doublée par tout ce qui est
--    plus récent et non lu, donc c'est un outil de COÛT sans objet au volume actuel. À rouvrir le
--    jour où le chargement du fil se voit, ou vers quelques milliers de mains.
--  · `floor_first_discovery` (6) est PROVISOIRE. Tout l'argument reposait sur « il lit ~4 mains
--    par session », déduit des 942 px par carte et JAMAIS mesuré. Si la profondeur réelle est de
--    4, un inconnu en 6e n'est jamais vu — et `post_views.read_count` mesure exactement ça.
--  · Le socle `posts_ranked_base` traîne encore l'ancien `affinity_score` ET un
--    `mutual_friend_count()` calculé PAR LIGNE SUR TOUT LE CORPUS, y compris sur les mains
--    d'amis où il ne sert plus à rien. C'est le poste le plus lourd du classement. Le nettoyer
--    demande de repartir de la définition en place (`select pg_get_viewdef('public.posts_ranked_base'::regclass, true);`)
--    — à faire dans un script séparé, une fois celui-ci vert.
-- ============================================================================
