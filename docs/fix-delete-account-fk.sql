-- Corrige le blocage de suppression de compte découvert en testant en conditions réelles :
-- `delete_own_account` échoue avec une violation de contrainte dès que le compte a invité
-- quelqu'un dans un groupe privé, parce que `group_members.invited_by` référence auth.users(id)
-- en NO ACTION (aucun des 14 autres FK vers auth.users n'a ce problème — audit complet fait avant
-- d'écrire ce correctif, voir docs/audit-fk-auth-users.sql).
--
-- Passage à ON DELETE SET NULL plutôt que CASCADE : qui a invité qui est une métadonnée
-- secondaire — supprimer la ligne d'appartenance au groupe supprimerait aussi l'appartenance de la
-- personne invitée, qui elle n'a rien demandé à voir avec la suppression du compte de l'inviteur.
--
-- À lancer dans le SQL editor :
-- https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new

begin;

-- Si la colonne était NOT NULL, ON DELETE SET NULL échouerait au moment précis où quelqu'un
-- supprime son compte — donc on s'assure qu'elle est nullable avant de poser la contrainte
-- (no-op si elle l'est déjà).
alter table group_members alter column invited_by drop not null;

alter table group_members
  drop constraint group_members_invited_by_fkey,
  add constraint group_members_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null;

commit;

-- Vérification : doit renvoyer "n" (SET NULL).
select confdeltype from pg_constraint where conname = 'group_members_invited_by_fkey';
