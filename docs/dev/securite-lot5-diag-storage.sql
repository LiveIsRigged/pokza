-- LOT 5 — DIAGNOSTIC : à quoi correspondent les 2 photos de groupe ? (lecture seule)
-- =================================================================================
-- Le contrôle précédent a montré 0 photo visible pour les 3 comptes, sur 2 existantes. Deux
-- lectures possibles, opposées :
--   (a) ces fichiers sont ORPHELINS — leur groupe a été supprimé, plus personne n'y a droit.
--       C'est alors le comportement correct, et il reste un ménage de fichiers à faire.
--   (b) la règle est TROP STRICTE — même le créateur ne voit plus la photo de son groupe.
--       Il faudrait alors la corriger.
--
-- Cette requête tranche : elle lit les fichiers en tant que `postgres` (donc sans filtre) et
-- regarde si un groupe correspond au dossier, et qui en est le propriétaire.
--
-- 100 % LECTURE SEULE. PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

select
  o.name                                        as fichier,
  (storage.foldername(o.name))[1]               as dossier_attendu_id_du_groupe,
  case when g.id is null
       then '*** ORPHELIN — aucun groupe ne porte cet identifiant ***'
       else 'groupe « ' || g.name || ' »' end   as groupe,
  coalesce(p.pseudo, '—')                       as proprietaire,
  (select count(*) from public.group_members m
    where m.group_id = g.id and m.status = 'accepted') as membres_acceptes,
  o.created_at
from storage.objects o
left join public.groups g   on g.id::text = (storage.foldername(o.name))[1]
left join public.profiles p on p.id = g.owner_id
where o.bucket_id = 'group-avatars'
order by o.created_at;
