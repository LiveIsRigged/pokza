-- Boost du feed selon le format préféré du joueur
-- =================================================
-- Un post remonte un peu dans TON fil quand sa variante ET son type de jeu correspondent à tes
-- préférences (profil). Bonus volontairement PLUS PETIT que l'amitié (+5 contre +30) : un ami passe
-- donc toujours devant n'importe quel inconnu, même très pertinent —
--   max inconnu = 8 amis communs (24) + format (5) = 29 < 30 (ami nu).
-- Le +5 est un chiffre unique, recalibrable comme les trois autres du barème d'affinité.
--
-- Idempotent : relançable sans risque (IF NOT EXISTS + CREATE OR REPLACE).
-- Éditeur SQL : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

-- ── Étape 1 : la variante préférée sur le profil (Hold'em par défaut) ─────────────────────────────
alter table public.profiles
  add column if not exists variante_favorite text not null default 'nlhe';

alter table public.profiles
  drop constraint if exists profiles_variante_favorite_check;
alter table public.profiles
  add constraint profiles_variante_favorite_check
  check (variante_favorite in ('nlhe', 'plo', 'plo5'));

-- ── Étape 2 : le boost dans la vue de classement ─────────────────────────────────────────────────
-- security_invoker = on IMPÉRATIF (comme la version d'origine) : la vue s'exécute avec les droits de
-- l'appelant, donc auth.uid() = le lecteur et la RLS de `profiles` s'applique normalement.
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
        -- Format préféré : variante ET type de jeu doivent correspondre. Mains anciennes sans
        -- `variant`/`gameType` traitées comme NLHE / cash (leurs défauts historiques).
        + case
            when coalesce(f.hand ->> 'variant', 'nlhe') = p.pref_variant
             and coalesce(f.hand ->> 'gameType', 'cash') = p.pref_game_type
            then 5
            else 0
        end
    )::numeric - extract(epoch from now() - f.created_at) / 86400.0 as affinity_score
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
     -- LEFT JOIN (pas CROSS) : si le lecteur n'a pas de profil, pref_* est NULL, le bonus vaut 0 et
     -- AUCUN post ne disparaît. `format_favori` cash_*/tournoi_*/spins → cash sinon tournament.
     left join lateral (
        select
            coalesce(pr.variante_favorite, 'nlhe') as pref_variant,
            case when pr.format_favori like 'cash%' then 'cash' else 'tournament' end as pref_game_type
        from profiles pr
        where pr.id = auth.uid()
     ) p on true;
