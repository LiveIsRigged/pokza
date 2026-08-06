-- Visibilité des mains privées / de groupe dans le feed
-- ========================================================
-- 1. Une main privée n'apparaît plus jamais dans le feed (posts_ranked) — même la sienne. Elle
--    reste visible sur le profil de son auteur (posts_feed n'est pas touchée), où le PostCard
--    affiche désormais un badge "🔒 Privé" pour la distinguer.
-- 2. Une main de groupe garde sa place dans le feed, mais expose maintenant `group_id` et
--    `group_name` : le PostCard affiche un badge "👥 Nom du groupe" pour la distinguer d'une main
--    publique. Le nom vient d'une jointure directe sur `posts`/`groups` (par id) plutôt que de
--    `posts_feed`, pour ne pas dépendre de sa définition interne.
--
-- Idempotent : relançable sans risque (CREATE OR REPLACE).
-- Éditeur SQL : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

create or replace view public.posts_ranked
  with (security_invoker = on) as
select f.id,
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
    (
        case
            when r.author_is_friend or f.author_id = auth.uid() then 30
            else 0
        end
        + least(r.mutual_friend_count, 8) * 3
        + case
            when coalesce(f.hand ->> 'variant', 'nlhe') = p.pref_variant
             and coalesce(f.hand ->> 'gameType', 'cash') = p.pref_game_type
            then 5
            else 0
        end
    )::numeric - extract(epoch from now() - f.created_at) / 86400.0 as affinity_score,
    -- Ajoutées en dernier : PostgreSQL interdit d'insérer une colonne au milieu d'une vue existante
    -- avec CREATE OR REPLACE (seulement en ajouter à la fin, sinon "cannot change name of view column").
    g.group_id,
    g.group_name
   from posts_feed f
     cross join lateral (
        select
            exists (
                select 1
                from friend_requests fr
                where fr.status = 'accepted'::text
                  and (fr.sender_id = auth.uid() and fr.receiver_id = f.author_id
                    or fr.sender_id = f.author_id and fr.receiver_id = auth.uid())
            ) as author_is_friend,
            mutual_friend_count(f.author_id) as mutual_friend_count
     ) r
     left join lateral (
        select
            coalesce(pr.variante_favorite, 'nlhe') as pref_variant,
            case when pr.format_favori like 'cash%' then 'cash' else 'tournament' end as pref_game_type
        from profiles pr
        where pr.id = auth.uid()
     ) p on true
     -- Récupère group_id/nom directement sur les tables de base (pas via posts_feed, dont on ne
     -- connaît pas la définition interne) : posts.group_id, puis groups.name pour ce groupe. Le
     -- lecteur voit déjà cette ligne via posts_feed, donc sa RLS sur `posts`/`groups` laisse passer
     -- la même ligne sans rien cacher de plus.
     left join lateral (
        select po.group_id, gr.name as group_name
        from posts po
        left join groups gr on gr.id = po.group_id
        where po.id = f.id
     ) g on true
  where f.visibility <> 'private';
