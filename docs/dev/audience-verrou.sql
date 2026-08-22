-- ══════════════════════════════════════════════════════════════════════════════════════════
-- VERROU D'AUDIENCE — l'audience d'une main publiée ne change plus
--
-- À jouer sur DEV D'ABORD, puis PROD :
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- La MESURE est dans `audience-verrou-test.sql`, à jouer juste après sur la même base.
--
-- ── POURQUOI
-- Commentaires, j'aime ET votes suivent tous la visibilité du post, relue à CHAQUE lecture :
-- policy « Les commentaires sont visibles si le post l'est » pour les premiers,
-- `private.post_visible(post_id)` (lot 2, F-10) pour les deux autres. Faire passer une main d'un
-- groupe privé à public rend donc publics un commentaire écrit devant huit amis, et l'opinion que
-- chacun a votée — sans préavis, sans trace, et sans que les intéressés puissent l'apprendre.
-- Dans l'autre sens, la policy de lecture des commentaires ne prévoit AUCUNE exception pour
-- l'auteur du commentaire : rétrécir l'audience lui retire l'accès à son propre texte.
--
-- Même geste que celui déjà interdit sur `hand` le 22/08 — changer le décor sous les commentaires
-- qui le discutent — et donc même réponse : on verrouille, et « Dupliquer la main » sert de sortie
-- de secours (republication en main neuve, 0 commentaire, 0 like, 0 vote).
--
-- ── CE QUI RESTE PERMIS, ET POURQUOI
--   • Un BROUILLON (`visibility = 'private'`) peut prendre n'importe quelle audience : personne
--     d'autre ne l'a jamais vue, donc personne n'a rien écrit dessous. C'est le cas d'usage
--     « je prépare, je publie plus tard ».
--   • Tout le reste de « Modifier le post » (titre, description, lieu, buy-in, niveau, vote) reste
--     modifiable sur n'importe quelle main. Le verrou ne porte QUE sur l'audience.
--
-- ── POURQUOI UN TRIGGER ET PAS UN `revoke update (visibility, group_id)`
-- C'est la première idée, et elle ne marche pas : les droits par colonne sont tout-ou-rien
-- (cf. `securite-f21-droits-colonnes.sql`, qui accorde justement ces deux colonnes). Les retirer
-- interdirait AUSSI le brouillon → public, qui est précisément ce qu'on veut garder. Il faut une
-- règle conditionnelle, donc un trigger.
--
-- ── LE PIÈGE : `group_id` COMPTE AUTANT QUE `visibility`
-- Passer une main du groupe A au groupe B laisse `visibility = 'group'` et ne touche que
-- `group_id`. C'est pourtant exactement la même fuite : les commentaires écrits devant les 8
-- membres de A deviennent lisibles par les 30 de B. Un verrou qui ne regarderait que `visibility`
-- laisserait ce trou grand ouvert.
--
-- ── L'AUTRE PIÈGE : NE PAS CASSER LA SUPPRESSION D'UN GROUPE
-- `revert_group_posts_to_private()` (trigger BEFORE DELETE sur `groups`) fait
-- `update posts set visibility = 'private', group_id = null` : c'est un group → private, donc
-- exactement ce qu'on interdit. Sans exemption, supprimer un groupe deviendrait IMPOSSIBLE dès
-- qu'il contient une main.
-- L'exemption se lit sur `current_user` et pas sur un drapeau applicatif : PostgREST exécute les
-- requêtes de l'app sous le rôle `authenticated`, tandis qu'une fonction SECURITY DEFINER (celle
-- du revert, comme les outils de modération) tourne sous son propriétaire. Le verrou ne s'applique
-- donc qu'aux écritures venues de l'app, ce qui est exactement sa cible. Rien à modifier dans les
-- fonctions existantes : l'exemption est automatique.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.posts_lock_audience()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Écriture système (SECURITY DEFINER : suppression d'un groupe, modération, maintenance).
  -- L'app, elle, arrive toujours sous `authenticated`.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Brouillon : jamais montré à personne, son audience est encore libre.
  if old.visibility = 'private' then
    return new;
  end if;

  if new.visibility is distinct from old.visibility
     or new.group_id is distinct from old.group_id then
    -- 42501 = insufficient_privilege : PostgREST le rend en 403, et l'app affiche le message.
    -- C'est un filet, pas le chemin normal — l'écran de modification n'offre plus le choix.
    raise exception
      'L''audience d''une main publiée ne change plus. Utilise « Dupliquer la main » pour la republier ailleurs.'
      using errcode = '42501';
  end if;

  return new;
end $$;

-- BEFORE UPDATE, comme `posts_mark_edited`. L'ordre alphabétique des noms les départage :
-- `posts_lock_audience` passe avant `posts_mark_edited`, donc une tentative interdite est refusée
-- sans avoir posé `edited_at` au passage.
drop trigger if exists posts_lock_audience on public.posts;
create trigger posts_lock_audience
  before update on public.posts
  for each row execute function public.posts_lock_audience();

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES DE POSE (l'objet existe-t-il). Le comportement, lui, se mesure dans
-- `audience-verrou-test.sql` : ici, tout tourne sous `postgres`, donc sous l'exemption —
-- une vérification jouée telle quelle ne prouverait RIEN sur le verrou lui-même.
-- ══════════════════════════════════════════════════════════════════════════════════════════

select 'fonction posts_lock_audience' as controle,
       case when exists (select 1 from pg_proc p
                          join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'posts_lock_audience')
            then 'OK' else 'KO — fonction absente' end as resultat
union all
select 'trigger posts_lock_audience sur posts',
       case when exists (select 1 from pg_trigger t
                          join pg_class c on c.oid = t.tgrelid
                         where c.relname = 'posts' and t.tgname = 'posts_lock_audience'
                           and not t.tgisinternal)
            then 'OK' else 'KO — trigger absent' end
union all
select 'trigger toujours actif (non désactivé)',
       case when exists (select 1 from pg_trigger t
                          join pg_class c on c.oid = t.tgrelid
                         where c.relname = 'posts' and t.tgname = 'posts_lock_audience'
                           and t.tgenabled = 'O')
            then 'OK' else 'KO — trigger désactivé' end
union all
select 'posts_mark_edited toujours en place',
       case when exists (select 1 from pg_trigger t
                          join pg_class c on c.oid = t.tgrelid
                         where c.relname = 'posts' and t.tgname = 'posts_mark_edited')
            then 'OK' else 'ABSENT — la migration post-modifie.sql n''a pas encore ete jouee ici' end;
