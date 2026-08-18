-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Titre d'une main : 80 → 40 caractères                                        2026-08-18
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Jumeau de TITLE_MAX_LENGTH dans pokza-app/src/constants/limits.ts. Les deux doivent rester
-- alignés (cf. l'en-tête de securite-lot6.sql, dont la ligne `posts_title_length` a été mise à
-- jour au même chiffre pour qu'une réexécution du lot 6 ne remette pas 80).
--
-- POURQUOI 40. Le titre s'affiche sur une seule ligne dans le feed (19 px, gras). Mesuré sur la
-- fonte réelle (SF Pro Bold, opsz 19) : une phrase française y coûte ~9,2 px par caractère, soit
-- 37 caractères dans les 343 px utiles d'un iPhone SE. Au-delà, le titre est tronqué à
-- l'affichage. Mieux vaut que l'auteur le voie dans le compteur du formulaire.
--
-- ⚠️ EFFET SUR LES MAINS DÉJÀ PUBLIÉES. La contrainte est posée en `NOT VALID` : les lignes
-- existantes ne sont pas rejetées et restent affichées. En revanche `NOT VALID` s'applique bien
-- aux écritures suivantes — MODIFIER une ancienne main dont le titre dépasse 40 caractères
-- échouera tant que son auteur ne l'aura pas raccourci. L'inventaire en fin de fichier dit
-- combien de mains sont concernées : à lancer AVANT de décider quoi faire.

begin;

alter table public.posts drop constraint if exists posts_title_length;
alter table public.posts add  constraint posts_title_length
  check (char_length(title) between 1 and 40) not valid;

commit;


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer après le bloc ci-dessus
-- ═══════════════════════════════════════════════════════════════════════════════════════

select 'Contrainte posee' as controle,
       case when exists (
         select 1 from pg_constraint
         where conname = 'posts_title_length'
           and pg_get_constraintdef(oid) like '%40%'
       ) then 'OK — 40' else '*** ECHEC ***' end as resultat
union all
select 'Mains dont le titre depasse 40 caracteres',
       count(*)::text from public.posts where char_length(title) > 40
union all
select 'Titre le plus long actuellement',
       coalesce(max(char_length(title))::text, '0') from public.posts;


-- Le détail des mains concernées, si le compte ci-dessus n'est pas nul :
-- select id, author_id, char_length(title) as longueur, title
-- from public.posts
-- where char_length(title) > 40
-- order by longueur desc;


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — validation pleine                                    joué en DEV le 2026-08-18
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- À ne lancer QUE si « Mains dont le titre depasse 40 caracteres » vaut 0 ci-dessus.
-- `NOT VALID` ne protège que les écritures suivantes ; la validation étend la garantie à tout
-- le contenu déjà en base et permet au planificateur de s'y fier. Aucune ligne n'étant en
-- infraction, l'opération est instantanée.

alter table public.posts validate constraint posts_title_length;

select 'posts_title_length' as contrainte,
       case when convalidated then 'VALIDEE' else '*** encore NOT VALID ***' end as etat,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'posts_title_length';
