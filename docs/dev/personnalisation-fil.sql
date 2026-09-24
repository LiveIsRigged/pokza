-- ============================================================================
-- PERSONNALISATION DU FIL — la variante et le type de partie comptent SÉPARÉMENT
-- (chantier social, lot 4 · décision de Victor du 23/09/2026).
--
-- À JOUER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent, tout en transaction. Aucune modification côté app : le classement seul change.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QU'ON CORRIGE
--
-- `bonus_format` valait 0,5 SEULEMENT si la variante ET le type de partie correspondaient tous
-- les deux. Un joueur de PLO cash à qui on montre du PLO tournoi ne touchait rien du tout — la
-- moitié juste ne valait pas mieux que rien. Le formulaire d'inscription prend quatre réponses
-- (pays, format, variante, fréquence) et le fil n'en lisait que deux, ensemble.
--
-- Deux termes à 0,25 remplacent l'unique terme à 0,5 : une correspondance partielle compte
-- désormais pour moitié, et le total possible ne bouge pas d'un iota.
--
-- ⚠️ LE PLAFOND DU BONUS EST DE 2 JOURS ET IL EST PLEIN : engagement 1,0 + ce terme 0,5 + amis
-- communs 0,5. Tout ce qu'on ajouterait ici devrait se prendre sur l'un des trois, sans quoi un
-- bonus finirait par battre un jour de fraîcheur — la règle qui gouverne tout `ordre-du-feed.sql`.
--
-- ÉCARTÉS le même jour, et pour de bonnes raisons (ne pas les reproposer) :
--   · live/online — refusé par Victor ;
--   · la fréquence de jeu — elle dit à quel rythme on joue, pas ce qu'on veut lire ;
--   · les ENJEUX — on ne les demande jamais à un joueur (« peut être inconfortable à devoir les
--     donner, et ça peut évoluer »). Déductibles des mains publiées, mais la grosse blinde n'est
--     pas un niveau d'enjeux : c'est un nombre dans une devise, et l'app en accepte trente. Une
--     partie à 1 000/2 000 dongs serait classée tout en haut. Reporté, pas abandonné.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LES DEUX RÉGLAGES
--    La vue lit `feed_tuning` en `left join lateral … limit 1` avec un `coalesce` sur CHAQUE
--    colonne : une table de réglages absente ne peut pas vider le fil. Les deux nouvelles colonnes
--    suivent la même règle, valeurs de repli comprises.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.feed_tuning
  add column if not exists bonus_variante    numeric not null default 0.25,
  add column if not exists bonus_type_partie numeric not null default 0.25;

comment on column public.feed_tuning.bonus_variante is
  'Bonus quand la variante de la main est celle du lecteur (NLHE / PLO / PLO5). Ex-moitie de bonus_format.';
comment on column public.feed_tuning.bonus_type_partie is
  'Bonus quand le type de partie (cash / tournoi) est celui du lecteur. Ex-moitie de bonus_format.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LA VUE
--    Copie conforme de celle d'`ordre-du-feed.sql`, à l'exception du terme de format. Si tu
--    modifies l'une, modifie l'autre : c'est le même objet.
--
-- ⚠️ L'ORDRE DES TROIS ORDRES CI-DESSOUS N'EST PAS NÉGOCIABLE, ET LA RAISON N'EST PAS ÉVIDENTE.
--    La vue lit les réglages par `left join lateral (select * from public.feed_tuning limit 1)`.
--    PostgreSQL DÉVELOPPE CE `*` À LA CRÉATION DE LA VUE : la définition enregistrée cite donc
--    nommément toutes les colonnes de `feed_tuning`, y compris celles dont le barème ne se sert
--    pas. Recréer la vue d'abord et supprimer la colonne ensuite échoue :
--
--        cannot drop column bonus_format of table feed_tuning because other objects depend on it
--        DETAIL: view posts_ranked depends on column bonus_format of table feed_tuning
--
--    (mesuré sur DEV le 23/09/2026). On supprime donc la colonne pendant que la vue n'existe pas,
--    et le `*` se développe ensuite sur les colonnes restantes.
--
--    Corollaire à retenir : un `select *` dans une vue n'apporte AUCUNE souplesse — il est figé
--    à la création comme le reste — mais il crée une dépendance sur chaque colonne de la table.
-- ────────────────────────────────────────────────────────────────────────────

drop view if exists public.posts_ranked;

-- La suppression de l'ancien réglage NE PEUT PAS faire échouer ce script : elle n'est que du
-- rangement, alors que les deux nouveaux termes, eux, sont le sujet. Si quoi que ce soit dépend
-- encore de `bonus_format` — autre chose que `posts_ranked`, dans un autre schéma, une vue qu'on
-- ne connaît pas —, on l'apprend par le contrôle 6 au lieu de tout perdre.
-- Le bloc attrape l'erreur et continue : en PL/pgSQL un `exception` pose un point de reprise,
-- donc la transaction survit.
do $$
begin
  alter table public.feed_tuning drop column if exists bonus_format;
exception
  when dependent_objects_still_exist then
    raise notice 'bonus_format gardee : quelque chose en depend encore (cf. controle 6)';
end $$;

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
      -- CE QUE LE LECTEUR A DIT AIMER — en DEUX termes depuis le 23/09/2026, alors qu'un seul
      -- exigeait les deux correspondances à la fois. Un joueur de PLO cash à qui on montrait du
      -- PLO tournoi ne touchait rien, exactement comme si rien ne correspondait.
      -- Le total reste 0,25 + 0,25 = 0,5, la valeur de l'ancien terme unique : le plafond du
      -- bonus est de 2 jours et il est déjà plein (engagement 1,0 + ici 0,5 + amis communs 0,5).
      -- Les deux nombres se règlent d'un UPDATE sur `feed_tuning`, sans toucher à la vue.
      + case when coalesce(b.hand ->> 'variant', 'nlhe') = pf.pref_variant
             then coalesce(t.bonus_variante, 0.25) else 0 end
      + case when coalesce(b.hand ->> 'gameType', 'cash') = pf.pref_game_type
             then coalesce(t.bonus_type_partie, 0.25) else 0 end
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
-- 3. CONTRÔLES — tout doit être OK
-- ────────────────────────────────────────────────────────────────────────────

select * from (values
  (1, 'les 2 nouveaux reglages sont poses',
      (select case when count(*) = 2 then 'OK' else 'KO — ' || count(*) || ' sur 2' end
         from information_schema.columns
        where table_schema = 'public' and table_name = 'feed_tuning'
          and column_name in ('bonus_variante', 'bonus_type_partie'))),
  (2, 'valeurs par defaut : 0,25 + 0,25 = l''ancien 0,5',
      (select case when bonus_variante + bonus_type_partie = 0.5
                   then 'OK — ' || bonus_variante || ' + ' || bonus_type_partie
                   else 'KO — ' || bonus_variante || ' + ' || bonus_type_partie end
         from public.feed_tuning limit 1)),
  (3, 'la vue est refaite et cite les 2 termes',
      -- On ne peut PAS exiger que `bonus_format` ait disparu de la définition : le
      -- `select * from feed_tuning` la ramènerait nommément si la colonne existait encore.
      -- Ce qui compte, c'est que le BARÈME cite les deux nouveaux termes.
      --
      -- ⚠️ `ilike` ET NON `like`, et ce n'est pas du confort : `pg_views.definition` n'est pas le
      -- texte qu'on a écrit, c'est la vue REDÉPARSÉE par Postgres. Le déparseur réécrit `coalesce`
      -- en `COALESCE` — un `like` sensible à la casse ne peut donc JAMAIS correspondre, et ce
      -- contrôle sortait KO sur DEV comme sur PROD alors que la vue était juste (24/09/2026).
      -- Le même piège ne touche PAS `prosrc` (corps de fonction), qui est stocké mot pour mot.
      (select case when v.definition ilike '%coalesce(t.bonus_variante%'
                    and v.definition ilike '%coalesce(t.bonus_type_partie%'
                    and v.definition not ilike '%coalesce(t.bonus_format%'
                   then 'OK'
                   -- Un KO nu ne se diagnostique pas : on dit lequel des trois termes cloche.
                   else 'KO — variante:' ||
                        case when v.definition ilike '%coalesce(t.bonus_variante%' then 'oui' else 'NON' end ||
                        ' type_partie:' ||
                        case when v.definition ilike '%coalesce(t.bonus_type_partie%' then 'oui' else 'NON' end ||
                        ' ancien_format_encore_la:' ||
                        case when v.definition ilike '%coalesce(t.bonus_format%' then 'OUI' else 'non' end end
         from pg_views v where v.schemaname = 'public' and v.viewname = 'posts_ranked')),
  (4, 'la vue tourne encore et rend ses colonnes',
      (select case when count(*) >= 0 then 'OK — ' || count(*) || ' main(s) lisibles ici'
                   else 'KO' end
         from public.posts_ranked)),
  (5, 'le plafond du bonus reste a 2 jours',
      (select case when coalesce(bonus_engagement_cap, 1.0) + bonus_variante + bonus_type_partie
                        + coalesce(bonus_mutual_cap, 0.5) <= 2.0
                   then 'OK — ' || (coalesce(bonus_engagement_cap, 1.0) + bonus_variante
                                    + bonus_type_partie + coalesce(bonus_mutual_cap, 0.5))
                   else 'KO — plafond depasse' end
         from public.feed_tuning limit 1)),
  (6, 'l''ancien reglage bonus_format',
      (select case
         when not exists (select 1 from information_schema.columns
                           where table_schema = 'public' and table_name = 'feed_tuning'
                             and column_name = 'bonus_format')
           then 'OK — supprimee'
         else 'RESTE — en dependent : ' || coalesce((
                select string_agg(distinct ns.nspname || '.' || c.relname, ', ')
                  from pg_depend d
                  join pg_rewrite rw on rw.oid = d.objid
                  join pg_class c on c.oid = rw.ev_class
                  join pg_namespace ns on ns.oid = c.relnamespace
                  join pg_class src on src.oid = d.refobjid
                  join pg_namespace sns on sns.oid = src.relnamespace
                  join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
                 where sns.nspname = 'public' and src.relname = 'feed_tuning'
                   and a.attname = 'bonus_format'
                   and c.relname <> 'feed_tuning'), 'RIEN — donc le fichier joue n''etait pas celui-ci')
         end))
) as t(n, controle, resultat);

commit;
