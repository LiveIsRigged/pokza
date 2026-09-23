-- Amorçage du réseau — tableau de bord
-- ===========================================================================
-- ⚠️ LECTURE SEULE. Rien n'est créé, modifié ni supprimé : ce script ne fait que compter. On peut
-- le relancer aussi souvent qu'on veut, sur DEV comme sur PROD, sans aucun risque.
--
--   Éditeur SQL DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Éditeur SQL PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ── À QUOI ÇA SERT
-- Les critères de réussite du chantier social (« un nouveau a-t-il au moins 3 liens sociaux à
-- J7 ? », « revient-il ? ») sont des questions PAR PERSONNE, sur une COHORTE. PostHog ne peut pas
-- y répondre : `identify` a été retiré le 22/08 et `person_profiles: 'identified_only'` garantit
-- qu'aucun profil individuel n'est jamais créé — c'est la condition de l'exemption de consentement
-- CNIL, et ça ne se remet pas pour une mesure. La base, elle, a déjà toute la donnée, sans aucun
-- traçage supplémentaire et sans le moindre enjeu juridique.
--
-- Partage des rôles, à garder en tête :
--   • PostHog répond « quelle porte est utilisée, combien de fois » (gestes, anonymes, agrégés) ;
--   • ce script répond « où en est le réseau, et qui reste » (cohortes, par personne).
--
-- ── DEUX PIÈGES ÉVITÉS ICI (payés le 22/08, cf. mémoire des vérifications SQL)
--   1. L'éditeur SQL n'affiche que le résultat de la DERNIÈRE requête → tout tient en UNE seule.
--   2. Une ligne de résultat peut disparaître en silence et passer pour un vrai zéro → chaque
--      mesure est une sous-requête SCALAIRE dans un `values`, donc la ligne sort TOUJOURS, vide
--      si le calcul ne renvoie rien.
--
-- Ni la modération ni les bannissements ne sont déduits : sans objet à la taille actuelle, et les
-- déduire ferait dépendre tout le script de colonnes qu'il n'a pas besoin de connaître.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

with amis as (
  -- Un compte qui a au moins une amitié acceptée, quel que soit le sens de la demande.
  select sender_id as id from public.friend_requests where status = 'accepted'
  union
  select receiver_id from public.friend_requests where status = 'accepted'
),
auteurs as (
  select distinct author_id as id from public.posts
)
select * from (values

  -- ── LE MONDE ────────────────────────────────────────────────────────────────────────────
  (10, 'comptes',
       (select count(*)::text from public.profiles)),
  (11, 'comptes créés ces 30 derniers jours',
       (select count(*)::text from public.profiles where created_at > now() - interval '30 days')),

  -- ── LE GRAPHE ───────────────────────────────────────────────────────────────────────────
  (20, 'amitiés acceptées',
       (select count(*)::text from public.friend_requests where status = 'accepted')),
  (21, 'demandes d''ami en attente',
       (select count(*)::text from public.friend_requests where status = 'pending')),
  (22, 'comptes avec au moins 1 ami',
       (select count(*)::text from amis)),
  (23, 'comptes SANS aucun ami',
       (select (count(*) - (select count(*) from amis))::text from public.profiles)),
  (24, 'amis par compte (moyenne)',
       (select round(2.0 * (select count(*) from public.friend_requests where status = 'accepted')
                     / nullif((select count(*) from public.profiles), 0), 1)::text)),

  -- ── LE CONTENU, C'EST-À-DIRE CE QUE VOIT UN NOUVEAU ─────────────────────────────────────
  -- La ligne 30 est celle qui dimensionne le lot 2 : à 20 mains, « éditorialiser » veut dire les
  -- ranger à la main et le nouveau les épuise en une séance ; à 200, c'est un vrai tri.
  (30, 'mains PUBLIQUES (tout ce qu''un nouveau peut voir)',
       (select count(*)::text from public.posts where visibility = 'public')),
  (31, 'mains de groupe',
       (select count(*)::text from public.posts where visibility = 'group')),
  (32, 'mains privées (brouillons et archives)',
       (select count(*)::text from public.posts where visibility = 'private')),
  (33, 'auteurs distincts d''au moins une main publique',
       (select count(distinct author_id)::text from public.posts where visibility = 'public')),
  (34, 'mains publiques des 30 derniers jours',
       (select count(*)::text from public.posts
        where visibility = 'public' and created_at > now() - interval '30 days')),
  (35, 'commentaires des 30 derniers jours',
       (select count(*)::text from public.comments where created_at > now() - interval '30 days')),
  (36, 'j''aime des 30 derniers jours',
       (select count(*)::text from public.likes where created_at > now() - interval '30 days')),

  -- ── LES GROUPES ─────────────────────────────────────────────────────────────────────────
  (40, 'groupes',
       (select count(*)::text from public.groups)),
  (41, 'groupes à 2 membres ou plus',
       (select count(*)::text from (select group_id from public.group_members
                                    where status = 'accepted'
                                    group by group_id having count(*) >= 2) g)),
  (42, 'adhésions acceptées',
       (select count(*)::text from public.group_members where status = 'accepted')),
  (43, 'invitations de groupe en attente',
       (select count(*)::text from public.group_members where status = 'pending')),

  -- ── L'AMORÇAGE — les nombres que le chantier doit faire bouger ──────────────────────────
  (50, 'comptes de plus de 7 jours',
       (select count(*)::text from public.profiles where created_at < now() - interval '7 days')),
  (51, '… dont au moins 1 ami dans leurs 7 premiers jours',
       (select count(*)::text from public.profiles p
        where p.created_at < now() - interval '7 days'
          and exists (select 1 from public.friend_requests f
                      where f.status = 'accepted'
                        and (f.sender_id = p.id or f.receiver_id = p.id)
                        and coalesce(f.responded_at, f.created_at) <= p.created_at + interval '7 days'))),
  (52, 'comptes n''ayant JAMAIS publié',
       (select (count(*) - (select count(*) from auteurs))::text from public.profiles)),
  (53, 'délai médian inscription → 1re main (jours)',
       -- `::double precision` explicite : depuis Postgres 14 `extract` rend un `numeric`, que
       -- `percentile_cont` ne prend pas tel quel.
       (select round(percentile_cont(0.5) within group (
                 order by (extract(epoch from (x.premiere - p.created_at)) / 86400.0)::double precision
               )::numeric, 1)::text
        from public.profiles p
        join lateral (select min(created_at) as premiere from public.posts where author_id = p.id) x on true
        where x.premiere is not null))

) as t(n, mesure, valeur)
order by n;
