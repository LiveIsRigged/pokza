# Plan — « mains non vues » par groupe privé

Document de passation, écrit le 2026-08-22 pour être exécuté par une autre session.
Il est autonome : tout ce qu'il faut savoir est ici.

---

## 1. Ce qu'on veut

Dans **Mes groupes privés**, chaque ligne affiche une pastille orange pleine avec le nombre de
mains publiées dans ce groupe que le joueur n'a pas encore vues. Et la même pastille sur l'entrée
**« Mes groupes privés »** du menu latéral, avec le total tous groupes confondus.

**Pourquoi ça compte plus qu'un ornement.** Depuis le 2026-08-22, le déclencheur
`notify_group_posted` saute un destinataire déjà prévenu pour ce groupe dans les deux dernières
heures. Ce garde-fou vit dans le déclencheur : les notifications sautées **ne sont pas écrites**,
donc les mains 2 à 8 d'une soirée n'existent nulle part pour les autres membres — ni en push, ni
dans la liste des notifications. Ce compteur est la moitié manquante : il rend l'information sans
interrompre.

⚠️ **Ne PAS compter les notifications non lues** (`notifications.read_at`) : à cause de ce même
garde-fou, ça afficherait « 1 main non vue » pour une soirée entière. Il faut une vraie date de
dernière visite.

---

## 2. Décisions déjà prises — ne pas les rouvrir

Toutes tranchées avec Victor le 2026-08-22.

| Point | Décision |
|---|---|
| Couleur | **Orange plein** (`colors.action`), pas rouge — le rouge est celui des erreurs et des refus dans ce produit |
| Plafond d'affichage | **99+** |
| Ce qui marque « vu » | **Ouvrir la page du groupe**. Conséquence assumée : entrer et ressortir aussitôt efface le compteur |
| Ses propres mains | **Exclues** du compte |
| Nouveau membre | Le compte part de sa **date d'adhésion**, pas du début du groupe — sinon quelqu'un qui rejoint un groupe de deux ans y lit « 412 mains non vues » |
| Pastille dans le menu | **Oui**, en plus de celle des lignes |

Si une valeur produit non listée ici se présente (un seuil, un délai, un plafond), **demander à
Victor avant d'implémenter**. C'est une règle de ce projet, pas une politesse.

---

## 3. À savoir avant de toucher quoi que ce soit

**Le serveur de dev tape la PRODUCTION.** `pokza-app/.env` pointe sur le projet PROD
`blfoycuvvyxaxftzuidf`. Donc : toute migration doit être jouée **avant** de déployer le code qui en
dépend, sinon l'écran tombe en erreur. Ordre imposé : base d'abord, app ensuite.

**Les scripts SQL se jouent à la main dans l'éditeur Supabase**, par Victor. `psql` n'est pas
installé et aucun mot de passe de base n'est disponible localement.
- DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
- PROD : https://supabase.com/dashboard/project/blfoycuvvyxaxftzuidf/sql/new
- **Toujours coller le lien à côté du script.** Règle du projet.

**Deux pièges de l'éditeur SQL, payés récemment :**
1. `auth.uid()` y est **NUL** — pas de jeton, donc pas d'utilisateur courant. Tout script appelant
   une fonction qui s'appuie dessus échoue. Pour se faire passer pour quelqu'un :
   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claims',
     json_build_object('sub','<uuid>','role','authenticated')::text, true);
   -- …
   rollback;
   ```
2. Il n'affiche que le résultat de la **dernière** requête. Pour poser plusieurs questions,
   les assembler en un seul `select … union all select …` avec une colonne d'ordre.

**Le CLI Supabase est lié à la PROD.** Toujours passer `--project-ref` explicitement.

**L'iPhone lit la PWA déployée**, construite depuis `main`. Un changement non poussé n'y est pas
visible, et il faut **rouvrir complètement la PWA**, pas seulement rafraîchir.

**Le dump `docs/dev/dev-schema-clean.sql` est périmé.** Il a déjà induit en erreur deux fois dans
la même journée. La source de vérité est la base : vérifier par requête avant de conclure.

**Style de commit** : français, sans accents, `type(scope): la phrase décrit l'effet pour le joueur`.
Voir `git log`. Terminer par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## 4. Le travail, dans l'ordre

### Étape 1 — SQL (`docs/dev/mains-non-vues.sql`)

Un seul fichier, idempotent, dans une transaction. **DEV d'abord, puis PROD.**

**1.a — La date de dernière visite.** `group_members` est l'endroit évident : déjà clé sur
(group_id, user_id).

```sql
alter table public.group_members
  add column if not exists last_seen_at timestamptz;
```

**1.b — Le compteur dans `my_groups()`.** La fonction existe déjà (`docs/dev/my-groups.sql`), en
`security invoker`, et renvoie déjà `last_post_at` et `member_count` par deux `left join lateral`.
Il faut la **recréer à l'identique en ajoutant un troisième lateral** et la colonne
`unseen_count integer` dans le `returns table`. Reprendre le fichier existant comme base — ne pas
réécrire de mémoire, notamment le tri.

```sql
  left join lateral (
    select count(*)::int as unseen_count
    from posts po
    where po.group_id = g.id
      and po.author_id <> auth.uid()
      and po.created_at > coalesce(me.last_seen_at, me.responded_at, me.created_at)
  ) u on true
```

Notes :
- `me` est l'alias de `group_members` déjà présent dans la requête.
- Le `coalesce` porte la décision « nouveau membre » : on part de la date d'adhésion.
- Pas besoin de filtrer la modération : la fonction est en `security invoker`, la RLS de `posts`
  masque déjà ce que le joueur n'a pas le droit de voir.
- ⚠️ **Conserver le tri tel quel**, y compris le départage :
  `order by coalesce(p.last_post_at, g.created_at) desc, g.name, g.id`. Sans `g.name, g.id`, des
  groupes créés dans une même transaction partagent leur `created_at` à la microseconde et Postgres
  les rend dans un ordre différent d'un appel à l'autre. Constaté, corrigé, ne pas le défaire.

**1.c — Marquer comme vu.** Une RPC plutôt qu'un `update` direct depuis le client : ça évite
d'ouvrir une policy UPDATE sur `group_members` et des droits par colonne.

```sql
create or replace function public.mark_group_seen(p_group_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update group_members
     set last_seen_at = now()
   where group_id = p_group_id
     and user_id = auth.uid()
     and status = 'accepted';
$$;

revoke all on function public.mark_group_seen(uuid) from public, anon;
grant execute on function public.mark_group_seen(uuid) to authenticated, service_role;
```

**1.d — Terminer par** `notify pgrst, 'reload schema';` — sinon PostgREST peut répondre
« function not found » pendant quelques secondes.

### Étape 2 — Couche données (`pokza-app/src/data/groups.ts`)

- Ajouter `unseenCount?: number` à l'interface `Group`, avec un commentaire disant d'où ça vient.
- Dans `fetchMyGroups`, mapper `unseen_count` (le fichier a déjà `MyGroupRow` et le motif
  `row.last_post_at ?? undefined`).
- Ajouter `export async function markGroupSeen(groupId: string): Promise<void>` qui appelle
  `supabase.rpc('mark_group_seen', { p_group_id: groupId })`.

### Étape 3 — Les deux pastilles

**3.a — Les lignes de la liste** (`pokza-app/src/groups/GroupsListScreen.tsx`). La ligne affiche
déjà un avatar, le nom et une méta « N membres · dernière main … ». Ajouter la pastille à droite,
alignée en bout de ligne. Reprendre les valeurs de `rowBadge` de `SideMenu.tsx` pour que les deux
pastilles du produit soient identiques : `minWidth: 20, height: 20, borderRadius: radius.full,
paddingHorizontal: 6, backgroundColor: colors.action`, texte blanc.

**3.b — Le menu** (`pokza-app/src/components/ui/SideMenu.tsx` et `App.tsx`). Tout existe déjà :
`SideMenuItem` a un champ `badge?: number` et la pastille est déjà en `colors.action`. Il suffit,
dans `App.tsx`, de passer `badge:` sur l'entrée « Mes groupes privés » — la somme des `unseenCount`
de `myGroups` (voir `pendingInvitationsCount` juste à côté, même motif, ligne ~1194).

**3.c — Le plafond 99+.** Le mettre **dans `SideMenu`**, pas seulement pour les groupes : la
pastille fait 20 pt de haut, un nombre à trois chiffres la déforme, et « Mes invitations » a le même
problème. Puis appliquer la même règle à la pastille de la liste.

### Étape 4 — Marquer comme vu (`pokza-app/src/groups/GroupScreen.tsx`)

Appeler `markGroupSeen(groupId)` à l'ouverture, dans le `useEffect` qui charge déjà le groupe
(fonction `load`). L'échec ne doit rien interrompre : `.catch(() => {})`, comme ailleurs.

Le rafraîchissement de la liste au retour est **déjà en place** : le `onBack` du mode `'group'`
dans `App.tsx` appelle `refreshMyGroups()`. Rien à ajouter.

---

## 5. Vérifier

**Le compteur, sans deuxième compte.** Le compte de test `pokza_founder` est seul dans ses groupes,
et ses propres mains sont exclues — il verra donc toujours zéro. Pour éprouver le calcul, utiliser
l'impersonation SQL (recette en section 3) sur un utilisateur qui n'est pas l'auteur, et comparer
`select name, unseen_count from public.my_groups();` avant et après avoir reculé son `last_seen_at`.

**Le rendu**, dans le panneau navigateur (`preview_start` avec le nom `pokza-web`, port 8081).
Victor doit être connecté : ne jamais saisir de mot de passe à sa place.

⚠️ **Les clics de l'outil `computer` échouent souvent** sur ce projet (« Browser pane is currently
hidden »). Contournement éprouvé : piloter en JavaScript, en cherchant l'élément dont les props
React portent `onClick`, puis en dispatchant un `MouseEvent`.

```js
const propsOf = (n) => { const k = Object.keys(n).find(k => k.startsWith('__reactProps$')); return k ? n[k] : null; };
const tap = (text) => {
  const all = [...document.querySelectorAll('div,span')].filter(el => (el.textContent||'').trim() === text);
  all.sort((a,b) => { const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect(); return ra.width*ra.height - rb.width*rb.height; });
  let node = all[0];
  while (node && !(propsOf(node)||{}).onClick) node = node.parentElement;
  const r = node.getBoundingClientRect();
  node.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, clientX:r.x+r.width/2, clientY:r.y+r.height/2, button:0}));
};
```

Pour lire l'état réel plutôt que le rendu (la liste est virtualisée, toutes les lignes ne sont pas
montées) : remonter la chaîne `__reactFiber$` depuis une ligne jusqu'au composant dont
`memoizedProps.data` est le tableau des groupes.

**Contrôles attendus** : la pastille n'apparaît pas à zéro ; ouvrir un groupe puis revenir la fait
disparaître ; le total du menu vaut la somme des lignes ; « 99+ » au-delà de 99.

---

## 6. Ce qui n'est PAS demandé

- Pas de marquage « vu » au défilement : ouvrir la page suffit.
- Pas de compteur ailleurs que dans la liste et le menu.
- Ne pas toucher aux garde-fous des déclencheurs (`notify_group_posted`, 2 h par groupe ;
  `notify_friend_posted`, 12 h par ami-auteur). Ils sont récents et arbitrés.
- Ne pas commiter ni pousser sans que Victor le demande.
