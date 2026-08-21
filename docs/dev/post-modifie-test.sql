-- ============================================================================
-- MESURE du trigger posé par `post-modifie.sql`.
--
-- POURQUOI CE FICHIER SÉPARÉ : un script qui se juge lui-même ne prouve rien.
-- Celui-ci écrit vraiment dans `posts`, relit ce que la base a décidé, et
-- affiche chaque lecture — succès comme échec.
--
--   Dev  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   Prod : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ LE PIÈGE QUE CE TEST A DÛ CONTOURNER, ET QUI L'AURAIT RENDU AVEUGLE
-- `now()` renvoie l'heure de DÉBUT DE TRANSACTION : elle ne bouge pas d'une
-- instruction à l'autre. Comparer « edited_at avant » et « edited_at après »
-- aurait donc donné la même valeur des deux côtés — un trigger qui se déclenche
-- à tort aurait passé le test en vert. D'où la MARQUE : avant chaque mesure, on
-- pose `edited_at` à une date sentinelle (2000-01-01), et on regarde si la base
-- l'a remplacée. Aucune dépendance à l'horloge, aucun ex æquo possible.
-- (Poser la sentinelle ne réveille pas le trigger : elle ne touche aucune des
-- 7 colonnes de contenu — ce que la mesure nº 2 vérifie au passage.)
--
-- CE QUI EST MESURÉ, sur une main JETABLE créée puis supprimée :
--   1. changer le titre                  → marqué
--   2. incrémenter like_count            → PAS marqué  (le vrai piège : chaque
--      like déclenche un UPDATE sur la ligne du post)
--   3. changer la visibilité             → PAS marqué  (décision produit)
--   4. réenregistrer à l'identique       → PAS marqué
--   5. description null → texte          → marqué  (le cas que `<>` raterait)
--
-- La main d'essai est créée en `private` (personne d'autre ne peut la lire), ne
-- vit que le temps du script, et est supprimée à la fin — y compris si une
-- mesure échoue. Le récapitulatif final confirme qu'il n'en reste rien.
--
-- ATTENDU : 5 lignes « OK », puis « main d'essai supprimee : OK ».
-- ============================================================================

drop table if exists _res;
drop table if exists _essai;
create temp table _res (n serial, mesure text, lu text, verdict text);
-- L'id de la main d'essai vit ici et pas dans une variable : le ménage de fin doit pouvoir la
-- désigner par SON ID. Supprimer « par titre » effacerait la main d'un vrai joueur qui aurait eu
-- l'idée d'appeler la sienne pareil.
create temp table _essai (id uuid);

do $$
declare
  SENTINELLE constant timestamptz := '2000-01-01 00:00:00+00';
  v_auteur uuid;
  v_post   uuid;
  v_e      timestamptz;
begin
  select id into v_auteur from public.profiles order by created_at limit 1;
  if v_auteur is null then
    insert into _res (mesure, lu, verdict) values ('compte support', '(aucun profil)', 'ARRET — test impossible');
    return;
  end if;

  insert into public.posts (author_id, title, hand, visibility)
  values (
    v_auteur,
    'test edited_at',
    '{"id":"test","variant":"nlhe","gameType":"cash","blinds":{"sb":1,"bb":2},
      "effectiveStack":100,"visibility":"private","seats":[],"board":{},"actions":[]}'::jsonb,
    'private'
  )
  returning id, edited_at into v_post, v_e;
  insert into _essai values (v_post);

  insert into _res (mesure, lu, verdict) values (
    '0. main d''essai creee',
    'edited_at = ' || coalesce(v_e::text, 'null'),
    case when v_e is null then 'OK — une main neuve n''est pas « modifiee »' else 'KO — edited_at pose des l''insertion' end
  );

  -- ── 1. Changer le titre DOIT marquer ──────────────────────────────────────
  update public.posts set edited_at = SENTINELLE where id = v_post;
  update public.posts set title = 'test edited_at 2' where id = v_post;
  select edited_at into v_e from public.posts where id = v_post;
  insert into _res (mesure, lu, verdict) values (
    '1. titre modifie',
    'edited_at = ' || coalesce(v_e::text, 'null'),
    case when v_e is distinct from SENTINELLE and v_e is not null then 'OK — marque' else 'KO — la base n''a rien marque' end
  );

  -- ── 2. Un like NE DOIT PAS marquer ────────────────────────────────────────
  update public.posts set edited_at = SENTINELLE where id = v_post;
  update public.posts set like_count = like_count + 1 where id = v_post;
  select edited_at into v_e from public.posts where id = v_post;
  insert into _res (mesure, lu, verdict) values (
    '2. like_count incremente (le piege)',
    'edited_at = ' || coalesce(v_e::text, 'null'),
    case when v_e = SENTINELLE then 'OK — non marque' else 'KO — un like marque la main comme modifiee' end
  );

  -- ── 3. Changer la visibilite NE DOIT PAS marquer ──────────────────────────
  update public.posts set edited_at = SENTINELLE where id = v_post;
  update public.posts set visibility = 'public' where id = v_post;
  select edited_at into v_e from public.posts where id = v_post;
  insert into _res (mesure, lu, verdict) values (
    '3. visibilite private -> public',
    'edited_at = ' || coalesce(v_e::text, 'null'),
    case when v_e = SENTINELLE then 'OK — non marque' else 'KO — la portee marque la main' end
  );
  update public.posts set visibility = 'private' where id = v_post;

  -- ── 4. Reenregistrer a l'identique NE DOIT PAS marquer ────────────────────
  update public.posts set edited_at = SENTINELLE where id = v_post;
  update public.posts set title = title, description = description where id = v_post;
  select edited_at into v_e from public.posts where id = v_post;
  insert into _res (mesure, lu, verdict) values (
    '4. enregistrement a l''identique',
    'edited_at = ' || coalesce(v_e::text, 'null'),
    case when v_e = SENTINELLE then 'OK — non marque' else 'KO — enregistrer sans rien changer marque la main' end
  );

  -- ── 5. null -> texte DOIT marquer (le cas que `<>` raterait) ──────────────
  update public.posts set edited_at = SENTINELLE where id = v_post;
  update public.posts set description = 'une premiere relecture' where id = v_post;
  select edited_at into v_e from public.posts where id = v_post;
  insert into _res (mesure, lu, verdict) values (
    '5. description null -> texte',
    'edited_at = ' || coalesce(v_e::text, 'null'),
    case when v_e is distinct from SENTINELLE and v_e is not null then 'OK — marque' else 'KO — passage depuis null non detecte' end
  );

exception when others then
  -- Le bloc entier est annulé par cette clause — y compris la création de la main d'essai, donc
  -- rien ne traîne. On perd les mesures déjà faites : c'est le prix d'un nettoyage garanti.
  insert into _res (mesure, lu, verdict) values ('ERREUR', sqlerrm, 'KO — rien n''a ete mesure');
end $$;

-- Le ménage est hors du bloc : il doit passer même si une mesure a levé une erreur.
delete from public.posts where id in (select id from _essai);

select mesure, lu, verdict from (
  select n, mesure, lu, verdict from _res
  union all
  select 99, 'menage — main d''essai supprimee',
         count(*)::text || ' ligne(s) restante(s)',
         case when count(*) = 0 then 'OK' else 'KO — supprimer a la main' end
  from public.posts where id in (select id from _essai)
) t order by n;
