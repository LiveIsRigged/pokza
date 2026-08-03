-- Correctifs de sécurité issus de l'audit RLS (docs/audit-rls.sql).
--
-- À lancer dans le SQL editor :
-- https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- L'ORDRE COMPTE : les policies de `comments` sont élargies AVANT que la vue `comments_feed` ne soit
-- fermée. Dans l'autre sens, il existerait un instant où les commentaires des groupes privés
-- deviennent invisibles pour leurs propres membres.
--
-- Tout est enveloppé dans une transaction : en cas d'erreur, rien n'est appliqué.

begin;

-- ============================================================================
-- 1. `comments` : ajouter la branche "groupe privé", oubliée dans les deux policies.
--
-- La policy de `posts` autorise trois cas (public / auteur / membre du groupe) mais celles de
-- `comments` n'en couvraient que deux. Conséquence : un membre d'un groupe privé ne pouvait pas
-- commenter la main d'un autre membre (erreur RLS à l'insertion), et la lecture ne fonctionnait que
-- parce que `comments_feed` contournait le RLS — ce qu'on ferme en 2.
-- ============================================================================

drop policy if exists "Les commentaires sont visibles si le post l'est" on comments;

create policy "Les commentaires sont visibles si le post l'est"
on comments for select
using (
  exists (
    select 1
    from posts p
    where p.id = comments.post_id
      and (
        p.visibility = 'public'
        or p.author_id = auth.uid()
        or (p.visibility = 'group' and is_group_member(p.group_id))
      )
  )
);

drop policy if exists "Un utilisateur peut commenter un post qu'il peut voir" on comments;

create policy "Un utilisateur peut commenter un post qu'il peut voir"
on comments for insert
with check (
  auth.uid() = author_id
  and exists (
    select 1
    from posts p
    where p.id = comments.post_id
      and (
        p.visibility = 'public'
        or p.author_id = auth.uid()
        or (p.visibility = 'group' and is_group_member(p.group_id))
      )
  )
);

-- ============================================================================
-- 2. `comments_feed` : fermer la fuite.
--
-- La vue ne filtre rien (`select ... from comments` sans restriction) et, sans `security_invoker`,
-- s'exécute avec les droits de son propriétaire `postgres` : elle contourne donc le RLS de
-- `comments`. N'importe qui muni de la clé publique — présente en clair dans le bundle JS — pouvait
-- lire TOUS les commentaires de la base, groupes privés inclus.
-- Les 4 autres vues sont déjà en `security_invoker = on` ; celle-ci avait été oubliée.
-- ============================================================================

alter view comments_feed set (security_invoker = on);

-- ============================================================================
-- 3. Buckets : plafonner la taille et le type des fichiers.
--
-- Le redimensionnement se fait côté client (`resizeToBase64` dans src/data/images.ts), donc il est
-- contournable en appelant l'API de stockage directement avec la clé publique. Sans limite côté
-- serveur, tout compte peut saturer le stockage et faire grimper l'egress.
-- Les limites ci-dessous sont très généreuses par rapport à ce que l'app produit réellement (JPEG
-- redimensionné, de l'ordre de 100 à 400 Ko) : elles bloquent l'abus sans gêner l'usage normal.
-- `image/jpeg` seul suffit : uploadBytes envoie tout en `contentType: 'image/jpeg'`. Ça ferme au
-- passage la possibilité de déposer un SVG dans un bucket public, qui serait un vecteur de XSS
-- stocké.
-- ============================================================================

update storage.buckets
set file_size_limit = 1048576,               -- 1 Mo
    allowed_mime_types = array['image/jpeg']
where id in ('avatars', 'group-avatars');

update storage.buckets
set file_size_limit = 3145728,               -- 3 Mo
    allowed_mime_types = array['image/jpeg']
where id = 'comment-photos';

-- ============================================================================
-- 4. `friend_requests` : le garde-fou anti-doublon ne faisait rien.
--
-- L'ancienne condition testait `r.sender_id = r.receiver_id AND r.receiver_id = r.sender_id`, soit
-- les colonnes de `r` comparées à elles-mêmes — elle ne référençait jamais la ligne insérée. Elle
-- était donc inopérante, et pire : si une seule ligne avec sender_id = receiver_id était apparue
-- dans la table, elle aurait bloqué TOUTES les demandes d'ami de l'app d'un coup.
--
-- La nouvelle version bloque les deux vrais cas (demande déjà existante dans un sens ou dans
-- l'autre) et interdit de s'envoyer une demande à soi-même.
-- ============================================================================

drop policy if exists "Envoyer une demande en son nom sauf si deja recue" on friend_requests;
drop policy if exists "Envoyer une demande en son nom sauf si deja existante" on friend_requests;

create policy "Envoyer une demande en son nom sauf si deja existante"
on friend_requests for insert
with check (
  auth.uid() = sender_id
  and status = 'pending'
  and sender_id <> receiver_id
  and not exists (
    select 1
    from friend_requests r
    where (r.sender_id = friend_requests.sender_id and r.receiver_id = friend_requests.receiver_id)
       or (r.sender_id = friend_requests.receiver_id and r.receiver_id = friend_requests.sender_id)
  )
);

-- ============================================================================
-- 5. Ménage : `profiles` avait deux policies UPDATE redondantes, toutes deux sur id = auth.uid().
--    Les policies permissives s'additionnent en OR, donc l'effet net était correct — mais deux
--    règles identiques sur la même opération rendent la prochaine relecture inutilement confuse.
-- ============================================================================

drop policy if exists "Un utilisateur peut modifier son propre profil" on profiles;

commit;

-- ============================================================================
-- Vérification post-correctifs : doit renvoyer `on` pour les 5 vues, et les limites sur les buckets.
-- ============================================================================

with verif as (
  select 'vue' as objet, c.relname::text as nom,
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), '*** MANQUANT ***') as etat
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
  union all
  select 'bucket', id::text,
         coalesce(file_size_limit::text, '*** AUCUNE LIMITE ***') || ' octets, types: ' ||
         coalesce(array_to_string(allowed_mime_types, ','), '*** TOUS ***')
  from storage.buckets
)
select string_agg(objet || ' | ' || nom || ' | ' || etat, chr(10) order by objet, nom) as rapport
from verif;
