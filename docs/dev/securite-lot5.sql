-- LOT 5 — F-08 + F-05
-- ===================
--   F-08 : `age_confirmed` est lisible par TOUT LE MONDE (profiles est en SELECT USING(true)).
--   F-05 : les photos de groupe sont énumérables par n'importe quel compte connecté, et deux
--          policies de remplacement de fichier ne contrôlent pas la destination.
--
-- ⚠️ ORDRE : DEV d'abord, PROD ensuite.
--   DEV  : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
--   PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
--
-- ⚠️ EN DEV, la partie F-05 ne fera rien : le projet DEV n'a ni bucket ni policy de stockage
-- (constaté à l'étape 0). C'est normal, le script est écrit pour ne pas échouer dans ce cas.
--
-- Script IDEMPOTENT. Ne touche à AUCUNE donnée. Retour arrière en fin de fichier.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-08 — Sortir `age_confirmed` de la vue publique
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME : `age_confirmed` est le drapeau que pose la modération sur un compte soupçonné
-- d'être mineur. Il vit sur `public.profiles`, dont la policy de lecture est `USING (true)` —
-- donc lisible par n'importe qui, y compris sans compte :
--     GET /rest/v1/profiles?select=pseudo,age_confirmed&age_confirmed=eq.false
-- renvoie la liste nominative des comptes signalés comme mineurs présumés. C'est une donnée
-- de modération, potentiellement relative à un enfant, exposée publiquement.
--
-- Le lot 1 a empêché de l'ÉCRIRE. Il reste à empêcher de la LIRE.
--
-- CORRECTIF : droit de lecture accordé colonne par colonne — même technique qu'au lot 1, dans
-- l'autre sens. La RLS ne sait pas filtrer une colonne ; les GRANT, si.
--
-- Les 10 colonnes ci-dessous sont celles que le client lit réellement (vérifié : aucune requête
-- de l'app ne fait `select('*')` sur `profiles`, elles nomment toutes leurs colonnes).
-- La modération, elle, continue de lire le drapeau : `admin_get_user_context` est SECURITY
-- DEFINER, donc elle s'exécute en tant que propriétaire et ignore ces restrictions.
--
-- Effet de bord VOULU : la personne concernée ne peut pas non plus lire son propre drapeau.
-- Un compte signalé n'a pas à savoir qu'il l'est — sinon autant prévenir avant de vérifier.

revoke select on table public.profiles from anon, authenticated;

grant select (
  id,
  pseudo,
  avatar_url,
  display_preference,
  format_favori,
  variante_favorite,
  frequence_jeu,
  bio,
  country,
  created_at
) on table public.profiles to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- F-05 — Stockage : énumération des groupes privés, et destination des remplacements
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PROBLÈME 1 : la policy de lecture des photos de groupe est `USING (bucket_id =
-- 'group-avatars')` — sans aucune autre condition. N'importe quel compte connecté peut donc
-- LISTER le bucket entier et récupérer l'identifiant de TOUS les groupes privés de Pokza, y
-- compris ceux dont il ignore l'existence. Ces identifiants sont la clé d'entrée de toutes les
-- autres tentatives (publier dedans, liker, deviner des URL).
--
-- PROBLÈME 2 : les deux policies de remplacement de fichier n'ont qu'un `USING`, sans
-- `WITH CHECK`. `USING` contrôle le fichier AVANT modification, `WITH CHECK` contrôle son état
-- APRÈS. Sans le second, rien ne vérifie la destination : un remplacement peut déplacer le
-- fichier vers le dossier de quelqu'un d'autre. Ajouter `WITH CHECK` referme ça.
--
-- Le tout est encadré par un test d'existence des buckets, pour que le script passe sans erreur
-- en DEV où le stockage n'est pas configuré.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'group-avatars') then
    raise notice 'Stockage non configure dans cet environnement : partie F-05 ignoree.';
    return;
  end if;

  -- 1. Lecture des photos de groupe réservée aux participants.
  --    Le `exists` porte sur `public.groups`, dont la RLS s'applique (owner ou participant) —
  --    c'est elle qui fait le tri, on ne réécrit donc pas la règle d'appartenance ici.
  drop policy if exists "Photos de groupe lisibles par tous" on storage.objects;
  drop policy if exists "Photos de groupe lisibles par les participants" on storage.objects;
  create policy "Photos de groupe lisibles par les participants" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'group-avatars'
      and exists (
        select 1 from public.groups g
        where g.id::text = (storage.foldername(objects.name))[1]
      )
    );

  -- 2. Remplacements : on contrôle aussi la DESTINATION.
  drop policy if exists "Remplacement dans son propre dossier" on storage.objects;
  create policy "Remplacement dans son propre dossier" on storage.objects
    for update to authenticated
    using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  drop policy if exists "Le createur remplace la photo de son groupe" on storage.objects;
  create policy "Le createur remplace la photo de son groupe" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'group-avatars'
      and exists (select 1 from public.groups g
                  where g.id::text = (storage.foldername(objects.name))[1] and g.owner_id = auth.uid())
    )
    with check (
      bucket_id = 'group-avatars'
      and exists (select 1 from public.groups g
                  where g.id::text = (storage.foldername(objects.name))[1] and g.owner_id = auth.uid())
    );
end;
$$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION — structure ET lecture réelle
-- ═══════════════════════════════════════════════════════════════════════════════════════
drop table if exists _res;
create temp table _res (n int, controle text, resultat text);

do $$
declare
  v_user    uuid;
  v_n       bigint;
  v_storage boolean;
  v_lines   text[] := '{}';
begin
  -- À relever MAINTENANT, en tant que postgres : `storage.buckets` a la RLS active et aucune
  -- policy, donc une fois passé en `authenticated` ce test répondrait toujours « non ».
  select exists (select 1 from storage.buckets where id = 'group-avatars') into v_storage;
  -- ---- F-08, contrôle des droits -------------------------------------------------------
  v_lines := v_lines || format('1|F-08 age_confirmed illisible|%s',
    case when not has_column_privilege('authenticated', 'public.profiles', 'age_confirmed', 'select')
          and not has_column_privilege('anon', 'public.profiles', 'age_confirmed', 'select')
         then 'OK' else '*** ECHEC : encore lisible ***' end);

  select count(*) into v_n
  from unnest(array['id','pseudo','avatar_url','display_preference','format_favori',
                    'variante_favorite','frequence_jeu','bio','country','created_at']) col
  where not has_column_privilege('authenticated', 'public.profiles', col, 'select');
  v_lines := v_lines || format('2|F-08 les 10 colonnes du client restent lisibles|%s',
    case when v_n = 0 then 'OK' else '*** ECHEC : ' || v_n || ' colonne(s) bloquee(s) ***' end);

  -- ---- F-08, lecture réelle en tant qu'utilisateur connecté ----------------------------
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_user, 'role', 'authenticated')::text, false);
    set role authenticated;

    begin
      select count(*) into v_n from public.profiles;
      v_lines := v_lines || format('3|Lecture des profils (doit marcher)|OK — %s profil(s)', v_n);
    exception when others then
      v_lines := v_lines || format('3|Lecture des profils (doit marcher)|*** ECHEC *** %s', sqlerrm);
    end;

    begin
      select count(*) into v_n from public.profiles where age_confirmed;
      v_lines := v_lines || '4|Lire age_confirmed (doit etre refuse)|*** ECHEC : lisible ***'::text;
    exception when others then
      v_lines := v_lines || '4|Lire age_confirmed (doit etre refuse)|OK — refuse'::text;
    end;

    begin
      select count(*) into v_n from public.posts_feed;
      v_lines := v_lines || format('5|Le feed fonctionne toujours|OK — %s main(s)', v_n);
    exception when others then
      v_lines := v_lines || format('5|Le feed fonctionne toujours|*** ECHEC *** %s', sqlerrm);
    end;

    -- ---- F-05, énumération du stockage --------------------------------------------------
    if v_storage then
      begin
        select count(*) into v_n from storage.objects where bucket_id = 'group-avatars';
        v_lines := v_lines || format(
          '6|F-05 photos de groupe visibles par ce compte|%s visible(s) — a comparer au total ci-dessous', v_n);
      exception when others then
        v_lines := v_lines || format('6|F-05 photos de groupe visibles par ce compte|*** ECHEC *** %s', sqlerrm);
      end;
    end if;

    reset role;
    perform set_config('request.jwt.claims', '', false);
  end if;

  if v_storage then
    select count(*) into v_n from storage.objects where bucket_id = 'group-avatars';
    v_lines := v_lines || format('7|F-05 total reel des photos de groupe|%s (si la ligne 6 est plus petite, le filtre marche)', v_n);
  else
    v_lines := v_lines || '7|F-05 stockage|NON APPLICABLE — aucun bucket dans cet environnement'::text;
  end if;

  insert into _res
  select split_part(l, '|', 1)::int, split_part(l, '|', 2), split_part(l, '|', 3)
  from unnest(v_lines) l;

exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', false);
  insert into _res values (99, 'ERREUR DU SCRIPT', sqlerrm);
end;
$$;

select controle, resultat from _res order by n;


-- ═══════════════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   grant select on table public.profiles to anon, authenticated;
--   drop policy if exists "Photos de groupe lisibles par les participants" on storage.objects;
--   create policy "Photos de groupe lisibles par tous" on storage.objects
--     for select to public using (bucket_id = 'group-avatars');
-- commit;
