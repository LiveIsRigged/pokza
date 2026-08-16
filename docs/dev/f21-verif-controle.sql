-- F-21 — CONTRÔLE du script de vérification
-- =========================================
-- `f21-verif-droits-colonnes.sql` est un rapport d'exceptions : il ne liste pas ce qui va bien, il
-- liste ce qui manque. « Aucune ligne » y est donc le bon résultat. Mais un test qui ne peut pas
-- échouer ne prouve rien — celui-ci le rend falsifiable, en trois questions.
--
-- Ne modifie rien.

-- 1. Le mécanisme voit-il quelque chose ? Combien de colonnes le rôle `authenticated` peut-il
--    écrire sur ces deux tables. Attendu : des nombres NON NULS, et nettement inférieurs au nombre
--    total de colonnes — c'est tout l'objet de F-21.
select
  p.table_name                                                     as "table",
  count(*) filter (where p.privilege_type = 'INSERT')              as "colonnes en INSERT",
  count(*) filter (where p.privilege_type = 'UPDATE')              as "colonnes en UPDATE",
  (select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p.table_name) as "colonnes au total"
from information_schema.column_privileges p
where p.table_schema = 'public'
  and p.table_name in ('posts', 'comments')
  and p.grantee = 'authenticated'
group by p.table_name
order by 1;

-- 2. Le verrou F-21 tient-il toujours ? Ces colonnes ne doivent JAMAIS être modifiables par
--    l'auteur : c'est par elles qu'il pouvait annuler sa propre modération et gonfler ses
--    compteurs. Attendu : « VERROUILLE » sur les six lignes.
with sensibles(tbl, col) as (
  values ('posts','like_count'), ('posts','comment_count'), ('posts','mod_status'),
         ('posts','removed_at'), ('posts','author_id'), ('comments','like_count')
)
select
  s.tbl || '.' || s.col as "colonne sensible",
  case when exists (
    select 1 from information_schema.column_privileges p
    where p.table_schema = 'public' and p.table_name = s.tbl
      and p.column_name = s.col and p.privilege_type = 'UPDATE' and p.grantee = 'authenticated'
  ) then '❌ MODIFIABLE — F-21 rouvert' else '✅ VERROUILLE' end as "etat"
from sensibles s
order by 1;

-- 3. Le test SAIT-IL échouer ? Même formulation exacte que le script de vérification, mais sur une
--    colonne qu'on sait interdite. Attendu : UNE ligne. Si celle-ci ne sort pas non plus, alors le
--    « aucune ligne » du script principal ne valait rien et il faut chercher pourquoi.
select 'posts.like_count' as "droit deliberement absent", 'UPDATE' as "operation"
where not exists (
  select 1 from information_schema.column_privileges p
  where p.table_schema = 'public' and p.table_name = 'posts'
    and p.column_name = 'like_count' and p.privilege_type = 'UPDATE' and p.grantee = 'authenticated'
);
