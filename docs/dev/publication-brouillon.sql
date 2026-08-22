-- ══════════════════════════════════════════════════════════════════════════════════════════
-- PUBLIER UN BROUILLON, C'EST PUBLIER MAINTENANT
--
-- À jouer sur DEV D'ABORD, puis PROD :
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- La MESURE est dans `publication-brouillon-test.sql`, à jouer juste après sur la même base.
--
-- ── LE PROBLÈME (constaté par Victor le 22/08, en testant le verrou d'audience)
-- Un brouillon écrit il y a une semaine et publié aujourd'hui gardait sa date d'origine : il
-- ressortait donc enterré à une semaine de profondeur dans un fil qui ne charge que 10 mains à la
-- fois. Personne ne l'aurait vu.
--
-- Et la date n'était que la moitié du problème. `notify_friend_posted` sort immédiatement si
-- `visibility <> 'public'`, `notify_group_posted` si `visibility <> 'group'` — et les deux
-- déclencheurs sont posés **AFTER INSERT uniquement**. Un brouillon ne notifie donc personne à sa
-- création (c'est normal, il n'est visible que de son auteur), et ne notifiait toujours personne
-- au moment d'être publié. Corriger la date sans corriger ça aurait remonté la main en tête du
-- fil sans prévenir un seul ami.
--
-- ── CE QU'ON POSE : trois déclencheurs qui partagent MOT POUR MOT la même condition
--     when (old.visibility = 'private' and new.visibility <> 'private')
-- Cette transition est le seul moment où une main devient visible par quelqu'un d'autre que son
-- auteur. Elle n'arrive qu'UNE fois dans la vie d'une main : depuis `audience-verrou.sql`, une
-- main qui a quitté l'état privé n'y revient jamais. Le geste n'est donc pas répétable, et aucune
-- notification ne peut être déclenchée en boucle.
--
-- La condition vit dans le `when` et NULLE PART AILLEURS — pas recopiée dans le corps des
-- fonctions. C'est PostgreSQL qui l'évalue, elle se lit dans `\d posts`, et un `update` ordinaire
-- (changer un titre) n'appelle même pas la fonction.
--
-- ── CE QU'ON NE TOUCHE PAS
-- Le corps de `notify_friend_posted` et de `notify_group_posted` reste intact, garde-fous compris
-- (12 h par ami, 2 h par groupe). On ajoute seulement un second déclencheur qui les appelle sur la
-- transition ; les déclencheurs AFTER INSERT d'origine ne bougent pas d'un caractère.
--
-- ── `created_at` N'EST PAS ACCORDÉE EN ÉCRITURE, ET C'EST VOULU
-- `securite-f21-droits-colonnes.sql` n'accorde que 9 colonnes en update à `authenticated`, et
-- `created_at` n'en fait pas partie. Un trigger `before` écrit `new.created_at` avant
-- l'enregistrement : ça ne passe pas par la liste SET, donc pas par les droits par colonne. Même
-- mécanique que `edited_at` (cf. `post-modifie.sql`). Personne ne gagne le droit de dater une main
-- à la main.
--
-- ── EFFET DE BORD HEUREUX, À NE PAS CASSER : PAS DE « MODIFIÉ » À LA PUBLICATION
-- Publier un brouillon en retouchant son titre au passage écrit `edited_at` (c'est le rôle de
-- `posts_mark_edited`). Mais `wasEdited()` compare `edited_at` à `created_at`, pas à maintenant :
-- les deux valant `now()` dans la même transaction, l'écart est nul et la mention ne s'affiche
-- pas. Une main que personne n'a jamais vue n'arrive donc pas au monde en portant « modifié ».
-- Un brouillon retouché il y a une semaine non plus : sa date de publication est désormais
-- POSTÉRIEURE à sa dernière modification.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. LA DATE ────────────────────────────────────────────────────────────────────────────
-- Le corps ne teste rien : la condition est dans le `when` du déclencheur, à un seul endroit.
create or replace function public.posts_stamp_published_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  return new;
end $$;

drop trigger if exists posts_publish_date on public.posts;
create trigger posts_publish_date
  before update on public.posts
  for each row
  when (old.visibility = 'private' and new.visibility <> 'private')
  execute function public.posts_stamp_published_at();

-- ── 2. LES NOTIFICATIONS ──────────────────────────────────────────────────────────────────
-- Mêmes fonctions que la publication directe, appelées sur la transition. Chacune commence par
-- filtrer sur la visibilité : publier un brouillon dans un groupe ne réveille donc pas les amis,
-- et le publier en public ne réveille pas un groupe.
drop trigger if exists trg_notify_friend_published on public.posts;
create trigger trg_notify_friend_published
  after update on public.posts
  for each row
  when (old.visibility = 'private' and new.visibility <> 'private')
  execute function public.notify_friend_posted();

drop trigger if exists trg_notify_group_published on public.posts;
create trigger trg_notify_group_published
  after update on public.posts
  for each row
  when (old.visibility = 'private' and new.visibility <> 'private')
  execute function public.notify_group_posted();

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES DE POSE. Le comportement se mesure dans `publication-brouillon-test.sql`.
-- ══════════════════════════════════════════════════════════════════════════════════════════

with attendus(nom) as (
  values ('posts_publish_date'), ('trg_notify_friend_published'), ('trg_notify_group_published')
)
select a.nom as controle,
       case
         when d.def is null then 'KO — declencheur absent'
         when d.def not ilike '%old.visibility%private%' then 'KO — pose SANS la condition de transition'
         when d.enabled <> 'O' then 'KO — pose mais desactive'
         else 'OK — pose, actif, condition presente'
       end as resultat
from attendus a
left join lateral (
  select pg_get_triggerdef(t.oid) as def, t.tgenabled as enabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'posts' and t.tgname = a.nom and not t.tgisinternal
) d on true

union all

-- Non-régression : les déclencheurs d'origine, ceux de la publication directe, doivent être
-- restés exactement là où ils étaient.
select 'les 2 declencheurs AFTER INSERT d origine sont intacts',
       case when (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   where c.relname = 'posts'
                     and t.tgname in ('trg_notify_friend_posted', 'trg_notify_group_posted')
                     and not t.tgisinternal) = 2
            then 'OK — les 2 sont la' else 'KO — il en manque un' end;
