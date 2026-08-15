-- RÈGLES D'ACCÈS AU STOCKAGE — fichier de référence et de restauration
-- =============================================================================================
-- POURQUOI CE FICHIER EXISTE
-- Ces onze règles ont été créées à la main dans le dashboard Supabase, sur plusieurs mois. Elles
-- ne figuraient dans AUCUN fichier du dépôt — l'audit du 14/08/2026 le signalait comme son seul
-- angle mort. Si le projet Supabase devait être reconstruit, elles auraient été perdues, et
-- personne n'aurait su les réécrire.
--
-- Relevé le 2026-08-15 en production, GÉNÉRÉ PAR POSTGRES LUI-MÊME (`docs/dev/dump-storage-
-- policies.sql`) et non recopié à la main : le contenu est exact par construction.
--
-- ⚠️ CE FICHIER NE SE LANCE PAS POUR « METTRE À JOUR » QUOI QUE CE SOIT.
-- Il sert à deux choses, et deux seulement :
--   1. LIRE ce qui protège réellement tes fichiers, sans avoir à ouvrir le dashboard.
--   2. RECONSTRUIRE ces règles sur un environnement neuf (un nouveau projet Supabase, ou le
--      projet DEV le jour où on lui donnera du stockage — il n'en a aucun aujourd'hui).
-- Le lancer sur la production le remettrait dans l'état où il est déjà. Sans effet, mais inutile.
--
-- VÉRIFIÉES FONCTIONNELLEMENT le 15/08/2026 par `docs/dev/test-stockage-ecriture.sql`, lancé en
-- production : les six tentatives d'intrusion sont refusées (écrire dans le dossier avatar d'un
-- autre, remplacer la photo d'un groupe non possédé, déposer une photo de commentaire chez un
-- tiers, renommer ou supprimer le fichier d'un autre), et l'écriture dans son propre dossier
-- fonctionne toujours.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LES DEUX MÉCANISMES À COMPRENDRE AVANT DE TOUCHER À CES RÈGLES
--
-- 1) LE DOSSIER PORTE L'AUTORISATION. Chaque fichier est rangé sous `<identifiant>/…`, et les
--    règles comparent `(storage.foldername(name))[1]` à `auth.uid()`. C'est le premier segment
--    du chemin qui décide, pas le champ « propriétaire » — lequel est souvent vide sur les
--    fichiers anciens.
--
-- 2) UNE SOUS-REQUÊTE DANS UNE RÈGLE EST ELLE-MÊME FILTRÉE PAR LA RLS DE LA TABLE INTERROGÉE.
--    C'est ce qui rend « Photos de groupe lisibles par les participants » correcte alors qu'elle
--    semble ne vérifier que l'EXISTENCE du groupe : le `select … from groups` ne voit que les
--    groupes que l'appelant a le droit de voir. Même mécanisme pour les photos de commentaires.
--    Prouvé empiriquement au lot 2 — ne pas « corriger » ces règles en croyant bien faire.
--
-- ⚠️ ET LE PIÈGE QUI A COÛTÉ UNE DEMI-JOURNÉE AU LOT 5 :
--    dans une sous-requête, `name` seul se résout sur la table du FROM. Écrire
--    `storage.foldername(name)` à l'intérieur d'un `select … from groups g` donne le NOM DU
--    GROUPE au lieu du chemin du fichier — et la règle refuse alors tout le monde, en silence,
--    sans la moindre erreur. Toujours écrire `objects.name` dans une sous-requête.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- UN POINT OUVERT, ASSUMÉ
-- « Avatars lisibles par tout le monde » est accordée à `public` sans condition de dossier : le
-- bucket est donc listable sans compte, et renvoie les identifiants des comptes qui ont un
-- avatar. Vérifié le 15/08. Ce n'est PAS la fuite principale : `select id, pseudo from profiles`
-- répond déjà à n'importe qui, sans compte, avec la liste complète des utilisateurs. Fermer ce
-- bucket sans traiter `profiles` ne changerait donc rien de réel. Les deux se traitent ensemble
-- ou pas du tout — décision en attente.
-- Note utile pour ce jour-là : l'app ne liste JAMAIS ce bucket. Elle stocke l'adresse de l'image
-- dans `profiles.avatar_url` et l'affiche par l'URL publique, qui ne passe pas par ces règles.
-- Restreindre cette règle de lecture ne casserait donc pas l'affichage des avatars.
-- =============================================================================================


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- LECTURE
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- Sans condition de dossier : voir « UN POINT OUVERT » en tête de fichier.
drop policy if exists "Avatars lisibles par tout le monde" on storage.objects;
create policy "Avatars lisibles par tout le monde" on storage.objects
  for select
  to public
  using (bucket_id = 'avatars'::text);

-- Le `exists` paraît ne vérifier que l'existence du groupe — il vérifie en réalité
-- l'appartenance, parce que `groups` est elle-même sous RLS. Cf. mécanisme 2 en tête de fichier.
drop policy if exists "Photos de groupe lisibles par les participants" on storage.objects;
create policy "Photos de groupe lisibles par les participants" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'group-avatars'::text
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "Voir la photo d'un commentaire visible" on storage.objects;
create policy "Voir la photo d'un commentaire visible" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comment-photos'::text
    and exists (
      select 1 from public.comments c
      where c.id::text = (storage.foldername(objects.name))[1]
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- DÉPÔT
-- ═════════════════════════════════════════════════════════════════════════════════════════════

drop policy if exists "Depot dans son propre dossier" on storage.objects;
create policy "Depot dans son propre dossier" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Le createur depose la photo de son groupe" on storage.objects;
create policy "Le createur depose la photo de son groupe" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'group-avatars'::text
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.owner_id = auth.uid()
    )
  );

drop policy if exists "L'auteur ajoute la photo de son commentaire" on storage.objects;
create policy "L'auteur ajoute la photo de son commentaire" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comment-photos'::text
    and exists (
      select 1 from public.comments c
      where c.id::text = (storage.foldername(objects.name))[1]
        and c.author_id = auth.uid()
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- REMPLACEMENT
-- `using` (la ligne visée) ET `with check` (la ligne après modification) : sans le second, on
-- pourrait déplacer son propre fichier dans le dossier de quelqu'un d'autre.
-- `comment-photos` n'a volontairement AUCUNE règle de remplacement : sans règle, l'opération est
-- refusée à tout le monde. Une photo de commentaire est donc immuable une fois publiée.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

drop policy if exists "Remplacement dans son propre dossier" on storage.objects;
create policy "Remplacement dans son propre dossier" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'::text
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Le createur remplace la photo de son groupe" on storage.objects;
create policy "Le createur remplace la photo de son groupe" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'group-avatars'::text
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'group-avatars'::text
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.owner_id = auth.uid()
    )
  );


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- SUPPRESSION
-- ═════════════════════════════════════════════════════════════════════════════════════════════

drop policy if exists "Suppression dans son propre dossier" on storage.objects;
create policy "Suppression dans son propre dossier" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'::text
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Le createur supprime la photo de son groupe" on storage.objects;
create policy "Le createur supprime la photo de son groupe" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'group-avatars'::text
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(objects.name))[1]
        and g.owner_id = auth.uid()
    )
  );

drop policy if exists "L'auteur supprime la photo de son commentaire" on storage.objects;
create policy "L'auteur supprime la photo de son commentaire" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'comment-photos'::text
    and exists (
      select 1 from public.comments c
      where c.id::text = (storage.foldername(objects.name))[1]
        and c.author_id = auth.uid()
    )
  );
