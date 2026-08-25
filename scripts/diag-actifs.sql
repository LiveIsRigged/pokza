-- Diagnostic « Actifs 24 h » / « Jamais revenus » — LECTURE SEULE, ne modifie rien.
-- PROD. L'editeur Supabase n'affiche QUE le resultat de la derniere instruction :
-- lancer les deux blocs SEPAREMENT (selectionner le bloc, puis Run).


-- ============================================================================
-- BLOC 1 — l'etat reel de chaque compte, en un seul tableau.
-- ============================================================================
select
  u.email,
  u.created_at                                            as inscrit_le,
  u.last_sign_in_at                                       as derniere_connexion_reelle,
  max((to_jsonb(s) ->> 'refreshed_at')::timestamptz)      as dernier_rafraichissement,
  max(s.created_at)                                       as derniere_session_ouverte,
  count(s.id)                                             as sessions,
  -- ce que comptent les tuiles AUJOURD'HUI
  (u.last_sign_in_at > now() - interval '24 hours')               as actuellement_actif_24h,
  (u.last_sign_in_at is null
     or u.last_sign_in_at <= u.created_at + interval '5 minutes') as actuellement_jamais_revenu,
  -- ce qu'elles compteraient APRES correctif
  (greatest(u.last_sign_in_at,
            max(coalesce((to_jsonb(s) ->> 'refreshed_at')::timestamptz, s.created_at)))
     > now() - interval '24 hours')                               as corrige_actif_24h
from auth.users u
left join auth.sessions s on s.user_id = u.id
group by u.id, u.email, u.created_at, u.last_sign_in_at
order by u.created_at;


-- ============================================================================
-- BLOC 2 — le texte vivant de la fonction, pour la corriger sans rien perdre.
-- Copie-colle le resultat entier (c'est un gros pave de SQL).
-- ============================================================================
select pg_get_functiondef('public.get_admin_stats()'::regprocedure);
