-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CHERCHER QUELQU'UN PAR SON NOM, PAS SEULEMENT PAR SON PSEUDO
--
-- À jouer sur DEV D'ABORD, puis PROD :
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- La MESURE est dans `recherche-par-nom-test.sql`, à jouer juste après sur la même base.
-- Ce script est IDEMPOTENT.
--
-- ── LE PROBLÈME (Victor, 23/08/2026)
-- Depuis que « Mon nom » est le choix par défaut à l'inscription, la plupart des joueurs
-- apparaissent partout sous leur prénom et leur nom. Or la recherche ne cherche QUE la colonne
-- `pseudo`, et affiche QUE le pseudo. Dans les mots de Victor : « pour les personnes qui affichent
-- leur nom on ne va pas rechercher le pseudo, on ne le connaît même pas. » Ces gens-là sont donc
-- introuvables, et quand on tombe dessus autrement, ils s'affichent sous un pseudo que personne
-- n'associe à eux.
--
-- Chercher le nom depuis le client est impossible aujourd'hui, et ce n'est pas un oubli : prénom
-- et nom vivent dans `profiles_private`, dont la policy est « Visible uniquement par son
-- propriétaire ».
--
-- ── POURQUOI UNE COLONNE ET PAS UNE FONCTION `security definer`
-- La solution évidente serait une fonction `search_profiles()` en `security definer` qui lit les
-- deux tables. Elle a un défaut grave : `security definer` CONTOURNE la RLS, donc elle devrait
-- réappliquer À LA MAIN tout ce que les policies de `profiles` font déjà — bannissements, blocages,
-- et tout ce qui sera ajouté ensuite. Un filtre oublié le jour où une policy évolue, et la
-- recherche devient le seul endroit de l'app qui montre un profil que tout le reste cache. C'est
-- exactement le piège déjà rencontré sur `post_by_share_token` (cf. `partage-lien.sql`).
--
-- On stocke donc le nom d'affichage dans une colonne de `public.profiles`. La recherche redevient
-- une requête client ordinaire, soumise aux policies EXISTANTES de la table, quelles qu'elles
-- soient et quoi qu'elles deviennent. Rien à dupliquer, rien à maintenir en parallèle.
--
-- ── CE QUE LA COLONNE EXPOSE : RIEN DE NEUF
-- Elle contient le prénom et le nom UNIQUEMENT quand `display_preference = 'nom'` — c'est-à-dire
-- exactement ce que `get_display_name()` renvoie déjà publiquement, et ce qui s'affiche déjà sous
-- chaque main et chaque commentaire de la personne. Pour tous les autres, elle contient le pseudo,
-- déjà public. Et si quelqu'un repasse sur « Mon pseudo », le déclencheur réécrit la colonne dans
-- la seconde : son nom disparaît de la table publique.
--
-- Conséquence directe : on ne peut PAS chercher le nom de quelqu'un qui l'a gardé privé. Sans ça,
-- taper un nom de famille permettrait de confirmer celui d'un inconnu qui a justement refusé de
-- l'afficher — une fuite, sans même que le nom soit jamais montré à l'écran.
--
-- ── LE DÉCLENCHEUR SE POSE SUR *TOUTES* LES MISES À JOUR, ET C'EST DÉLIBÉRÉ
-- La tentation est d'écrire `before update of pseudo, display_preference` : deux fois moins
-- d'appels. Mais un `update` qui ne toucherait QUE `display_name` ne déclencherait alors rien, et
-- la valeur envoyée par le client resterait telle quelle — n'importe qui pourrait se donner le nom
-- de n'importe qui. En se posant sur toute mise à jour, le déclencheur RECALCULE toujours et la
-- colonne devient impossible à écrire à la main, sans avoir à retirer le moindre droit.
--
-- ── COUPLAGE À CONNAÎTRE
-- Le calcul ci-dessous reproduit le `case` de `get_display_name()`, qui reste la source des vues
-- (`posts_feed`, `comments_feed`, `notifications_feed`). Si l'un change, l'autre doit suivre — la
-- ligne de contrôle finale compare les deux sur toutes les lignes, elle le dira.
-- ══════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. LA COLONNE ─────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists display_name text;

-- ── 2. LE CALCUL, À UN SEUL ENDROIT ───────────────────────────────────────────────────────
-- `security definer` : lit `profiles_private`, que l'appelant n'a pas le droit de lire. C'est le
-- seul contournement de RLS du script, et il est confiné à UNE ligne — celle de l'utilisateur
-- concerné — au lieu de porter sur toute une recherche.
create or replace function public.profiles_sync_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.display_name := case
    when new.display_preference = 'nom' then coalesce(
      (select pp.prenom || ' ' || pp.nom from public.profiles_private pp where pp.id = new.id),
      new.pseudo)
    else new.pseudo
  end;
  return new;
end $$;

drop trigger if exists profiles_display_name on public.profiles;
create trigger profiles_display_name
  before insert or update on public.profiles
  for each row execute function public.profiles_sync_display_name();

-- ── 3. QUAND C'EST LE NOM LUI-MÊME QUI CHANGE ─────────────────────────────────────────────
-- Modifier son prénom dans `profiles_private` doit se répercuter sur la colonne publique. L'`update`
-- ci-dessous rejoue le déclencheur du point 2 (qui se pose sur toute mise à jour) : le calcul reste
-- écrit à un seul endroit. Pas de boucle : ce déclencheur-ci est sur `profiles_private`, celui-là
-- sur `profiles`, et aucun des deux n'écrit dans la table de l'autre en retour.
create or replace function public.profiles_private_sync_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set display_name = display_name where id = new.id;
  return new;
end $$;

drop trigger if exists profiles_private_display_name on public.profiles_private;
create trigger profiles_private_display_name
  after insert or update of prenom, nom on public.profiles_private
  for each row execute function public.profiles_private_sync_display_name();

-- ── 4. LES LIGNES EXISTANTES ──────────────────────────────────────────────────────────────
-- Un `update` qui ne change rien suffit : le déclencheur du point 2 remplit la colonne.
update public.profiles set display_name = display_name;

alter table public.profiles alter column display_name set not null;

-- ── 5. DROITS ─────────────────────────────────────────────────────────────────────────────
-- Défensif : sans effet si `profiles` est accordée au niveau table (cas le plus probable), mais
-- indispensable si des droits PAR COLONNE y ont été posés — une nouvelle colonne ne serait alors
-- lisible par personne. En lecture seulement : la colonne n'a pas à être écrite par le client, et
-- le déclencheur la recalcule de toute façon.
grant select (display_name) on public.profiles to anon, authenticated;

commit;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLES DE POSE. Le comportement se mesure dans `recherche-par-nom-test.sql`.
-- ══════════════════════════════════════════════════════════════════════════════════════════

select 'la colonne display_name existe et est obligatoire' as controle,
       case when count(*) = 1 then 'OK — presente, not null' else 'KO — absente ou nullable' end as resultat
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'display_name' and is_nullable = 'NO'

union all

select 'les 2 declencheurs sont poses et actifs',
       case when count(*) = 2 then 'OK — 2 sur 2' else 'KO — ' || count(*)::text || ' sur 2' end
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgenabled = 'O'
  and ((c.relname = 'profiles' and t.tgname = 'profiles_display_name')
    or (c.relname = 'profiles_private' and t.tgname = 'profiles_private_display_name'))

union all

-- Le declencheur de `profiles` doit couvrir TOUTE mise a jour : pose sur une liste de colonnes, il
-- laisserait passer un update qui n'ecrirait que `display_name` (cf. entete).
select 'le declencheur de profiles couvre toutes les mises a jour',
       case when (select pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   where c.relname = 'profiles' and t.tgname = 'profiles_display_name' and not t.tgisinternal)
                 ilike '%before insert or update on%'
            then 'OK — toute mise a jour' else 'KO — restreint a certaines colonnes' end

union all

-- La colonne et `get_display_name()` doivent dire la meme chose sur CHAQUE ligne : c'est ce qui
-- garantit que la recherche et le feed montrent le meme nom.
select 'la colonne dit la meme chose que get_display_name, sur toutes les lignes',
       case when count(*) = 0 then 'OK — aucune divergence'
            else 'KO — ' || count(*)::text || ' profil(s) divergent(s)' end
from public.profiles p
where p.display_name is distinct from public.get_display_name(p.id);
