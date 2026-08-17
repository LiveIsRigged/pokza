# Parcours multi-comptes sur le DEV — ce que les tests SQL ne peuvent pas voir

**Durée : une dizaine de minutes.** À dérouler dans l'app pointée sur le DEV, avec deux comptes
ouverts en même temps.

Les 32 tests SQL (`tests-angle-mort.sql` et `tests-angle-mort-2.sql`) ont prouvé que les **données
et les permissions** tiennent : personne ne peut écrire chez un autre, un non-membre ne voit rien
d'un groupe, les notifications partent au bon destinataire et disparaissent quand l'action est
annulée. Ce qu'ils ne peuvent pas voir, c'est **l'écran** : est-ce que l'invitation s'affiche, est-ce
que le fil de commentaires s'imbrique correctement, est-ce que le feed range les mains dans un ordre
qui a du sens.

C'est ce parcours-là. Il ne redémontre rien de ce qui est déjà prouvé.

---

## Préparation (3 minutes)

### 1. Sauvegarder le fichier d'environnement, puis basculer sur le DEV

Le fichier concerné est le `.env` du dossier `pokza-app`, à la racine du dépôt. La commande se place
d'elle-même au bon endroit, quel que soit le dossier courant :

```bash
cd "$(git rev-parse --show-toplevel)" && cp pokza-app/.env pokza-app/.env.prod.bak && echo "sauvegarde faite"
```

Puis l'ouvrir et y remplacer l'URL et la clé par celles du projet **DEV** (`ahdikgckctvduuestzrh`),
à récupérer dans *Project Settings → API* :
<https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/settings/api>

```bash
cd "$(git rev-parse --show-toplevel)" && open -e pokza-app/.env
```

### 2. ⚠️ Le piège qui empêche de se connecter : Turnstile

Le CAPTCHA est activé sur la **production**, pas sur le DEV. Et la clé du widget est liée au
domaine `pokza.app`, donc elle ne validera jamais sur `localhost`.

Dans le `.env` de DEV, **vider** la ligne :

```
EXPO_PUBLIC_TURNSTILE_SITE_KEY=
```

Si jamais le DEV avait le CAPTCHA activé côté Supabase, mettre à la place la clé de test qui réussit
toujours : `1x00000000000000000000AA`. Les deux vont ensemble — une clé vide avec un CAPTCHA activé
côté serveur, et plus personne ne se connecte.

### 3. Ouvrir deux sessions en parallèle

Une fenêtre normale pour le premier compte, une fenêtre **de navigation privée** pour le second.
C'est le seul moyen d'avoir deux sessions vivantes en même temps, et sans ça la moitié du parcours
demande de se déconnecter/reconnecter à chaque étape.

Les mots de passe des 7 comptes sont dans `seed-passwords.sql`, juste à côté de ce document —
fichier volontairement **exclu du dépôt**, celui-ci étant public.

### 4. Ce qui ne marchera pas sur le DEV, et qui n'est pas un bug

- **Photos et avatars** : le projet DEV n'a aucun bucket de stockage. Toute mise en ligne d'image
  échouera. Ne pas le signaler.
- **Notifications poussées** : pas de clés VAPID ni de table `push_subscriptions` sur le DEV. Les
  notifications s'afficheront **dans l'app** (c'est ce qu'on teste), jamais sur le téléphone.
- **Pagination du feed** : elle se déclenche à 10 mains, il n'y en a que 6. Non testable ici.

### Les comptes, et pourquoi ceux-là

`carol_dev`, `dave_dev` et `frank_dev` sont les trois seuls comptes **sans drapeau**. `alice_dev` est
dans un blocage, `bob_dev` est sanctionné *et* bloqué, `mallory_dev` est sanctionnée — pratique pour
l'étape 9, piégeux pour tout le reste.

---

## Le parcours

### A. Groupes — le trou le plus large (5 min)

C'est la partie qui n'a **jamais** tourné à l'écran : il n'y avait aucun groupe en base.

| # | Qui | Geste | Attendu |
|---|---|---|---|
| 1 | carol | Créer un groupe « Les mardis » | Le groupe apparaît dans sa liste |
| 2 | carol | Y inviter dave | Confirmation, dave passe « en attente » |
| 3 | dave | Ouvrir ses notifications | L'invitation est là, lisible, avec le nom du groupe |
| 4 | dave | Accepter | Il rejoint le groupe, l'invitation quitte les notifications |
| 5 | carol | Publier une main **dans le groupe** | La main se crée sans erreur |
| 6 | dave | Regarder son feed | La main de carol apparaît, identifiée comme venant du groupe |
| 7 | frank | Regarder son feed | La main **n'y est pas**, et le groupe est introuvable |

L'étape 3 est celle qui m'intéresse le plus : le texte de l'invitation et sa navigation n'ont jamais
été vus avec de vraies données.

### B. Commentaires et fil (3 min)

| # | Qui | Geste | Attendu |
|---|---|---|---|
| 8 | dave | Commenter une main de carol | Le commentaire s'affiche, le compteur passe à 1 |
| 9 | carol | Répondre à ce commentaire | La réponse s'imbrique **sous** celui de dave, pas à côté |
| 10 | dave | Ouvrir ses notifications, taper celle du commentaire | Arrive bien sur la main, au bon endroit |
| 11 | dave | Supprimer son commentaire | Il disparaît, le compteur redescend, et la réponse de carol reste rattachée quelque part — jamais invisible |

L'étape 11 vise le correctif du 16/08 sur les réponses orphelines : un parent supprimé ne doit pas
faire disparaître sa réponse du fil.

### C. Feed multi-auteurs (2 min)

| # | Qui | Geste | Attendu |
|---|---|---|---|
| 12 | carol | Regarder l'ordre de son feed | Les mains de ses amis remontent avant celles des inconnus |
| 13 | carol | Tirer pour rafraîchir | L'ordre reste cohérent, rien ne disparaît ni ne se duplique |

Le feed n'a jamais été regardé avec plusieurs auteurs — jusqu'ici 17 mains sur 18 avaient le même.
C'est un jugement à l'œil, pas un test : si l'ordre te paraît absurde, dis-le-moi.

### D. Déjà prouvé — à ne PAS refaire

Le filtrage du feed par blocage et par bannissement (alice ne voit ni bob ni mallory), le bandeau
« Retiré par la modération » visible du seul auteur, et tout le back-office : validés end-to-end le
10/08. Les permissions croisées et les notifications : validées par les 32 tests SQL.

---

## Après

```bash
cd "$(git rev-parse --show-toplevel)" && cp pokza-app/.env.prod.bak pokza-app/.env && echo "production restauree"
```

⚠️ **Ne pas oublier.** Tant que le fichier pointe sur le DEV, le serveur local travaille sur les
données de DEV — et l'inverse est pire : l'app locale tape la **production** par défaut.

Pour chaque étape qui ne se comporte pas comme annoncé : une capture, le numéro de l'étape, et le
compte utilisé. C'est le compte qui manque le plus souvent quand on reprend un constat.
