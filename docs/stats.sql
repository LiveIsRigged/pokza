-- Stats produit Pokza — à lancer dans l'éditeur SQL Supabase
-- =========================================================
-- Éditeur SQL : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- "Actif" = s'est connecté récemment (auth.users.last_sign_in_at). C'est un proxy correct pour un
-- petit beta : la valeur se rafraîchit aussi au renouvellement de session, donc elle surestime un
-- peu la vraie activité. Pour de l'engagement réel, regarde plutôt les posteurs uniques (§4).

-- ── 1. Tableau de bord en une ligne (le plus utile au quotidien) ─────────────────────────────────
select
  (select count(*) from auth.users)                                                      as inscrits,
  (select count(*) from profiles)                                                        as profils_completes,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours')  as actifs_24h,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days')    as actifs_7j,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')   as actifs_30j,
  (select count(*) from posts)                                                           as mains_postees,
  (select count(distinct author_id) from posts where created_at > now() - interval '7 days') as posteurs_7j,
  (select count(*) from likes)                                                           as likes_total,
  (select count(*) from comments)                                                        as commentaires_total;

-- ── 2. Inscriptions par jour ─────────────────────────────────────────────────────────────────────
select date(created_at) as jour, count(*) as inscrits
from auth.users
group by 1
order by 1 desc;

-- ── 3. Entonnoir d'inscription (combien finissent leur profil) ───────────────────────────────────
select
  (select count(*) from auth.users) as comptes_crees,
  (select count(*) from profiles)   as profils_completes,
  round(100.0 * (select count(*) from profiles) / nullif((select count(*) from auth.users), 0), 1) as taux_completion_pct;

-- ── 4. Engagement : mains postées par jour + posteurs uniques ────────────────────────────────────
select date(created_at) as jour,
       count(*)                    as mains,
       count(distinct author_id)   as posteurs_uniques
from posts
group by 1
order by 1 desc;

-- ── 5. Top contributeurs (mains publiées) ────────────────────────────────────────────────────────
select p.pseudo, count(*) as mains
from posts po
join profiles p on p.id = po.author_id
group by p.pseudo
order by mains desc
limit 20;

-- ── 6. Utilisateurs jamais revenus depuis l'inscription (à relancer ?) ───────────────────────────
select count(*) as inscrits_jamais_revenus
from auth.users
where last_sign_in_at is null
   or last_sign_in_at <= created_at + interval '5 minutes';
