-- ============================================================================
-- LE LIEN VERS UN PROFIL DEVIENT UNE VRAIE INVITATION
-- (chantier social, lot 4 point A · décision de Victor du 23/09/2026).
--
-- À JOUER SUR LE DEV D'ABORD : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- (une fois vert, rejouer ce MÊME fichier sur la PROD :
--  https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new)
--
-- Idempotent, tout en transaction.
-- ⚠️ ORDRE IMPOSÉ : ce script AVANT le déploiement de l'app — PostgREST refuse d'appeler une
-- fonction qui n'existe pas, et la page d'accueil de l'invitation n'aurait rien à montrer.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CE QU'ON CORRIGE
--
-- `/invite/:id` existe depuis longtemps (⋯ → Ajouter des amis → Mon code) et il survit même à
-- l'inscription : une fois le formulaire rempli, on atterrit sur le profil de celui qui invite,
-- « Ajouter en ami » sous les yeux. Mais le visiteur SANS COMPTE — c'est-à-dire précisément celui
-- à qui on envoie ce lien — tombe sur un mur d'inscription nu. Rien ne dit qui l'invite.
--
-- Le lien de groupe, lui, montre depuis le 19/09 l'hôte, le groupe et une de ses mains. Le plus
-- intime des deux liens était donc le moins personnel.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE FONCTION, ET POURQUOI ELLE NE ROUVRE PAS F-08
--
-- `anon` n'a plus le droit de lire `profiles` depuis `profils-lecture-connectes.sql` : c'était la
-- moitié « énumérable » du constat F-08 de l'audit du 14/08. On ne le lui rend pas. La page
-- d'accueil passe par cette fonction `security definer`, qui rend UN profil et seulement quand on
-- en connaît déjà l'identifiant.
--
-- Ce qui empêche l'énumération de revenir, et qu'il ne faut pas casser :
--   · la clé est un uuid v4 — 122 bits tirés au hasard, on ne les devine pas, on ne les parcourt
--     pas. C'est le même raisonnement que le jeton d'un lien de groupe, et que `/s/:token` ;
--   · la fonction rend UNE ligne, jamais une liste : aucun appel ne peut balayer la table ;
--   · elle ne rend que ce qu'il faut pour dire « X t'invite » — nom d'affichage, avatar, nombre de
--     mains publiques, une main publique. Ni pays, ni bio, ni date de naissance, ni pseudo ;
--   · un compte banni ne rend rien du tout, comme pour l'aperçu d'un lien de groupe.
--
-- La main rendue est PUBLIQUE et `visible` : ce sont les deux seules mains que l'app montre déjà
-- à un visiteur sans compte (cf. `PublicPostScreen`, décision produit du 16/08). On ne dévoile
-- donc rien de plus que ce que `/post/:id` montre déjà.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- L'APERÇU
--    Jumeau de `group_link_preview` (cf. invitations-groupe.sql) : même forme, mêmes garde-fous,
--    même grant. Si l'un des deux bouge, regarder l'autre.
--
--    `hand_count` sert la ligne « {n} mains partagées » : à zéro, l'écran n'affiche pas la ligne
--    plutôt que d'écrire « 0 main partagée », qui serait un argument contre soi.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.profile_invite_preview(p_user uuid)
returns table (
  host_id     uuid,
  host_name   text,
  host_avatar text,
  hand_count  integer,
  post_id     uuid
)
language sql
stable
security definer
set search_path = public, private
as $$
  select p.id,
         p.display_name,
         p.avatar_url,
         (select count(*)::integer from public.posts po
           where po.author_id = p.id
             and po.visibility = 'public'
             and po.mod_status = 'visible'),
         (select po.id from public.posts po
           where po.author_id = p.id
             and po.visibility = 'public'
             and po.mod_status = 'visible'
           order by po.created_at desc
           limit 1)
    from public.profiles p
   where p.id = p_user
     and not private.is_banned(p.id);
$$;

-- SANS CE GRANT la page d'accueil est vide pour le seul public qu'elle vise : celui qui n'a pas
-- encore de compte. `anon` est son rôle.
grant execute on function public.profile_invite_preview(uuid) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- CONTRÔLES — tout doit être OK
-- ────────────────────────────────────────────────────────────────────────────

select * from (values
  (1, 'la fonction est posee, en security definer',
      (select case when count(*) = 1 then 'OK' else 'KO — ' || count(*) end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'profile_invite_preview' and p.prosecdef)),
  (2, 'elle est appelable SANS compte (anon)',
      (select case when has_function_privilege('anon', p.oid, 'execute')
                    and has_function_privilege('authenticated', p.oid, 'execute')
                   then 'OK' else 'KO — il manque un grant' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'profile_invite_preview')),
  (3, 'un identifiant inconnu ne rend rien',
      (select case when count(*) = 0 then 'OK' else 'KO' end
         from public.profile_invite_preview('00000000-0000-0000-0000-000000000000'::uuid))),
  (4, 'sur un vrai compte, elle rend une ligne et un nom',
      (select case when count(*) = 0 then 'OK — aucun compte non banni ici, rien a verifier'
                   when count(*) filter (where a.host_name is not null) = count(*) then 'OK — '
                        || count(*) || ' profil(s) rendus'
                   else 'KO — un profil sans nom d''affichage' end
         from (select (public.profile_invite_preview(p.id)).* from public.profiles p limit 5) a)),
  (5, 'anon ne peut TOUJOURS PAS lire la table profiles (F-08 reste ferme)',
      (select case when count(*) = 0 then 'OK'
                   else 'KO — ' || count(*) || ' colonne(s) lisibles par anon' end
         from information_schema.column_privileges
        where grantee = 'anon' and table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'SELECT')),
  (6, 'le filtre des comptes bannis est bien dans le corps',
      (select case when p.prosrc like '%is_banned%' then 'OK'
                   else 'KO — un compte banni serait montre' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'profile_invite_preview'))
) as t(n, controle, resultat);

commit;
