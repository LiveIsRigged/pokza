# Tasks

Pokza development backlog. All tasks V0-V4. Each task < 1 day of work.

> ⚠️ **Note réalité vs docs :** le code réel (`pokza-app/`) est une app **Expo/React Native**
> avec un créateur de main + replayer + feed déjà fonctionnels (in-memory). Une partie des
> tâches P0 ci-dessous est donc déjà faite ou hors-sujet (ex : « Setup Next.js »). À réconcilier.

---

- **2026-07-29 — Routage web des liens de partage/invitation (`navigation/deepLink`).**
  Les boutons Partager (main) et Partager mon lien d'invitation, ainsi que le QR code, construisaient
  des URL `pokza.app/invite/:id` et `pokza.app/post/:id` qui ne menaient nulle part (aucun routage).
  Nouveau module `navigation/deepLink.ts` : `webOrigin()` résout l'origine réelle à l'exécution
  (localhost en dev, domaine déployé en prod) au lieu d'un domaine codé en dur — `share.ts` s'en sert
  désormais. `readInitialDeepLink()` lit `window.location.pathname` au chargement (web uniquement) et
  le traduit en intention : `/invite/:userId` → ouvre le profil de la personne (bouton "Ajouter en
  ami"), `/post/:postId` → ouvre la main. `clearDeepLinkFromUrl()` remet l'URL à la racine via
  `history.replaceState` une fois le lien consommé (évite de rejouer au refresh/retour navigateur).
  `App.tsx` consomme le lien une seule fois dès que le profil est prêt ; nouvel état `postReturnMode`
  pour que le retour d'une main aille au feed (arrivée par lien) ou aux notifications (ouverture
  normale). Vérifié dans le navigateur : `/invite/<id>` atterrit bien sur le profil cible avec
  "Ajouter en ami" et l'URL nettoyée ; `tsc` sans erreur ; aucune erreur console.
  Limite connue : en dev Metro sert le fallback SPA, donc les liens marchent localhost ; le vrai
  fonctionnement public attend le déploiement avec un hébergement à fallback SPA.

- **2026-07-29 — Suggestions d'amis + aperçu "amis en commun que tu connais déjà".**
  Dernier des trois chantiers issus de la réflexion RGPD/croissance. Deux nouvelles fonctions SQL
  `SECURITY DEFINER` (`auth.uid()` toujours forcé côté "moi", jamais un tiers arbitraire — même
  garde-fou que `mutual_friend_count` existant) :
  `mutual_friends_preview(p_other)` renvoie l'intersection entre MES amis et ceux de `p_other` —
  littéralement la définition d'un "ami en commun", donc par construction ça ne peut renvoyer QUE
  des gens déjà dans ma propre liste d'amis : aucune information nouvelle n'est révélée (l'astuce
  suggérée par la réflexion IA en amont). `suggested_friends()` classe les amis d'amis par nombre
  d'amis en commun décroissant, exclut soi-même et toute relation déjà existante (ami confirmé OU
  demande en attente dans un sens ou l'autre) — jamais la liste d'amis d'un tiers exposée, juste un
  compte agrégé par candidat.
  Affichage : `ProfileScreen` montre désormais une ligne "🤝 Amis en commun : Alice, Bob et 2 de
  plus" sous le bouton d'ami (seulement si non-vide, échoue silencieusement sinon — pas une info
  critique). `AddFriendsScreen` gagne un troisième onglet "Suggestions" listant les amis d'amis
  avec leur nombre d'amis en commun, cliquable vers le profil (réutilise `onSelectProfile`, renommé
  depuis `onScannedProfile` puisqu'il sert maintenant aussi bien au scan qu'aux suggestions).
  Vérifié par API avec un scénario à 5 comptes de test jetables (M, F1, F2, X, Y) : M ami avec F1 et
  F2 ; F1 ami avec X et Y ; F2 ami avec Y — `mutual_friends_preview` vu par M sur X renvoie
  exactement `[F1]` (pas F2, qui n'est pas ami avec X) ; `suggested_friends` vu par M renvoie `[Y
  (2 amis en commun), X (1 ami en commun)]`, bien classé ; après envoi d'une demande d'ami de M vers
  X, X disparaît des suggestions (exclusion des relations en attente confirmée). Toutes les
  relations de test supprimées ensuite (les 5 profils restent, comme d'habitude — pas de suppression
  possible via l'API). Dans le navigateur : onglet "Suggestions" affiche correctement le message
  d'état vide (aucune suggestion actuellement pour le vrai compte), aucune erreur console.
  **Non vérifié visuellement** : le rendu de la ligne "amis en commun" sur `ProfileScreen` avec un
  cas non-vide — la logique est prouvée par API, mais pas encore vue à l'écran (aurait nécessité de
  créer des relations d'amitié sur le vrai compte `pokza_founder`, écarté pour ne pas toucher à ses
  vraies données sans lui demander). `tsc --noEmit` propre.

- **2026-07-29 — Ajouter des amis par QR code (scan en vrai) + lien d'invitation partageable.**
  Suite à la réflexion RGPD/croissance (consultation IA sur la stratégie légale), fonctionnalité
  classée verte ("risque quasi nul, bénéfice croissance élevé") : nouvel écran
  `src/friends/AddFriendsScreen.tsx`, accessible depuis le menu latéral ("Ajouter des amis" 🤝),
  avec deux onglets.
  **"Mon code"** : QR code (`react-native-qrcode-svg`, nouvelle dépendance) encodant
  `pokza:friend:{userId}` — l'id utilisateur existant sert directement de code, aucune nouvelle
  colonne SQL nécessaire. Plus un bouton "Partager mon lien d'invitation" qui réutilise EXACTEMENT
  le mécanisme déjà construit pour le partage d'une main (`Share.share` natif, repli
  copier-coller sur desktop) — cette logique a été extraite de `PostCard.tsx` vers
  `src/utils/share.ts` (`shareOrCopy`) pour être partagée entre les deux écrans plutôt que dupliquée.
  Même lien `https://pokza.app/invite/{userId}`, même limite assumée : ne mène nulle part tant que
  l'app n'est pas déployée avec un vrai routage.
  **"Scanner"** : caméra (`expo-camera`, nouvelle dépendance + plugin `app.json` avec message de
  permission en français) qui décode les QR codes ; un code reconnu (préfixe `pokza:friend:`)
  ouvre directement le profil de la personne scannée (réutilise la page de profil existante, avec
  son bouton "Ajouter en ami" déjà là — pas de nouvelle logique de demande d'ami dupliquée). Scanner
  son propre code affiche un message au lieu de naviguer. Fonctionne **dès maintenant**, sans
  attendre le déploiement — deux personnes qui ont Pokza ouvert se scannent et se retrouvent.
  **Incohérence découverte en lisant le code source d'`expo-camera`** (la doc officielle ne le
  précise pas) : sur web, `onBarcodeScanned` reçoit `{ nativeEvent: { data } }`, alors que l'exemple
  natif officiel destructure `{ data }` directement — signe que le natif ne wrappe probablement pas
  de la même façon. Le handler lit les deux formes plutôt que de parier sur une seule, faute de
  pouvoir tester sur un vrai appareil dans cette session.
  Vérifié dans le navigateur : QR code bien rendu (3 coins de repérage visibles), bouton de partage
  fonctionnel (confirmé par instrumentation console, comme pour le partage de post — même
  mécanisme), onglet "Scanner" affiche correctement l'écran de permission caméra et ne plante pas
  quand l'accès caméra est refusé/indisponible (navigateur de test sans caméra réelle). **Non
  vérifié** : la détection réelle d'un QR par la caméra et la navigation qui en découle — nécessite
  un vrai appareil avec caméra, à tester au prochain essai sur téléphone. `tsc --noEmit` propre.

- **2026-07-29 — Inscription réservée aux personnes majeures (18 ans et plus).**
  Suite à une réflexion RGPD/conformité menée avec l'utilisateur (consultation d'une IA sur la
  stratégie légale, hors code) : la date de naissance était déjà collectée à l'inscription mais
  jamais vérifiée au-delà de sa validité de format — n'importe quel âge passait. Signalé comme un
  signal déclencheur à traiter tôt (mineurs + contexte poker), indépendamment des autres décisions
  de conformité.
  Double vérification, comme pour l'unicité du pseudo : côté client (`isAtLeastAge`, retour
  immédiat sans aller-retour réseau) ET côté base (contrainte `check` sur
  `profiles_private.date_naissance`), cette dernière étant la vraie protection — un appel API
  direct pourrait contourner le client. Code `23514` (violation de contrainte) mappé vers un
  message clair, sur le même principe que `23505` déjà géré pour le pseudo dupliqué.
  Vérifié par API sur un compte de test jetable : date de naissance de 16 ans → 400/23514 avec le
  bon message ; date de naissance de 30 ans → 204 (succès). Contrairement à ce qui avait été noté
  initialement ici, la ligne `profiles` (pseudo `age_test_adult_1785337799`) n'a **pas** pu être
  supprimée par API — `profiles` n'a pas de policy DELETE, comme déjà documenté pour d'autres
  comptes fantômes ; le `204` d'une requête DELETE ne garantit pas qu'une ligne ait été touchée.
  Reste en base, visible dans la recherche, à supprimer manuellement avec le compte `auth.users`
  associé (nécessite `service_role`). `tsc --noEmit` propre.

- **2026-07-29 — Bouton de partage (↗) fonctionnel.**
  L'icône existait déjà dans la barre d'engagement mais ne faisait rien. Utilise `Share.share`
  (React Native) : ouvre le partage natif (WhatsApp, Discord, Messages…) sur mobile et sur web
  mobile ; sur desktop, où `navigator.share` n'existe pas, bascule automatiquement sur un
  copier-coller silencieux (`expo-clipboard`, nouvelle dépendance) avec un petit texte de
  confirmation ("Lien copié dans le presse-papiers !") qui disparaît après 2,5s. Si la personne
  annule un vrai partage natif, rien ne se passe — comportement standard, pas traité comme un échec.
  **Limite connue et assumée** : l'app n'a pas encore de routage par URL ni de déploiement web, donc
  le lien partagé (`https://pokza.app/post/{id}`) ne mène nulle part pour l'instant — décision prise
  avec l'utilisateur de construire le mécanisme dès maintenant plutôt que d'attendre le déploiement,
  pour ne rien avoir à refaire ce jour-là.
  Vérifié dans le navigateur (desktop, donc chemin "copier-coller") : `console.log` temporaire a
  confirmé toute la chaîne réelle sur un clic effectif — `handleShare` appelé, `Share.share` rejette
  bien avec "not supported", écriture presse-papiers réussie, texte de confirmation déclenché.
  La confirmation visuelle du texte à l'écran n'a pas pu être capturée par une capture d'écran
  (le replayer de démonstration du post de test rejoue automatiquement et déplace le contenu entre
  le clic et la capture) — sans rapport avec le code, uniquement une contrainte de l'environnement
  de test automatisé. `tsc --noEmit` propre.

- **2026-07-29 — La couronne du fondateur s'affiche aussi sur ses posts dans le groupe.**
  Déjà présente dans la liste des membres (`GroupScreen`), la distinction 👑 du fondateur apparaît
  maintenant aussi à côté de son nom sur ses propres mains partagées dans la page du groupe — nouveau
  prop `isGroupFounder` sur `PostCard`, calculé simplement (`post.authorId === group.ownerId`) là où
  `GroupScreen` a déjà `group` en portée. Vérifié dans le navigateur sur le groupe "Les français".

- **2026-07-29 — Visionneuse plein écran pour les photos/GIF de commentaire.**
  Un tap sur la vignette compacte d'un commentaire (photo ou GIF) l'ouvre désormais en grand dans
  une visionneuse plein écran (fond sombre, `resizeMode="contain"`, bouton ✕) — referme au tap sur
  le fond ou sur le ✕. Contrairement à la vignette dans le fil, où toute bande est un défaut, ici
  une bande autour de l'image en plein écran est normale et attendue (comme n'importe quelle
  visionneuse photo). Vérifié dans le navigateur : ouverture au tap sur un GIF de commentaire
  existant, image affichée en grand sans déformation, fermeture par les deux méthodes.

- **2026-07-29 — Correction (v2) : les vignettes photo/GIF de commentaire restaient trop grandes et
  affichaient des bandes grises.**
  Un premier correctif (affichage selon `aspectRatio` + `resizeMode="contain"` + plafond de 280px
  de haut) évitait bien le recadrage, mais gardait une largeur forcée à 100% de la bulle — presque
  toujours différente du vrai ratio de l'image, donc `contain` ajoutait quasi systématiquement des
  bandes vides (pilier/lettrebox) en plus d'un rendu bien trop imposant comparé à la référence
  Instagram. Nouveau retour utilisateur avec capture à l'appui a confirmé les deux problèmes.
  Fix définitif : calcul explicite (`fitWithinBox`) d'une taille `{width, height}` finale qui
  respecte EXACTEMENT le ratio réel de l'image tout en tenant dans un plafond de 200×200 — la boîte
  ne peut alors jamais différer du ratio de l'image, donc `cover`/`contain` deviennent équivalents
  et aucune bande n'est plus possible, quel que soit le format (paysage, portrait, carré). Taille
  compacte façon vignette Instagram plutôt que pleine largeur.
  Toujours basé sur les colonnes `image_width`/`image_height` de `comments` (photo : dimensions
  réelles renvoyées par `resizeToBase64` après redimensionnement ; GIF : dimensions connues via
  GIPHY). Repli sur un ratio 4/3 pour les commentaires antérieurs à l'ajout de ces colonnes.
  Vérifié dans le navigateur sur un post de test jetable avec deux commentaires aux dimensions
  réelles connues (paysage 480×360, portrait 270×480) : boîtes rendues à exactement 200×150 et
  113×200 (ratios 1.333 et 0.565, identiques aux ratios sources), aucune bande, aucun recadrage.
  Post et commentaires de test supprimés après vérification. `tsc --noEmit` propre.

- **2026-07-29 — Commentaires avec photo ou GIF.**
  Deux pièces jointes possibles par commentaire, une à la fois (en choisir une remplace l'autre) :
  une photo depuis la galerie, ou un GIF cherché via GIPHY (nouveau module `src/data/gifs.ts` +
  écran `src/components/post/GifPicker.tsx`, tendances par défaut, recherche avec 400ms de
  temporisation). Le texte devient optionnel : un commentaire peut n'être qu'une image.
  **Différence volontaire avec les avatars** : une photo de commentaire peut appartenir à une main
  **privée** ou de **groupe**, donc son bucket (`comment-photos`) est **privé** (contrairement à
  `avatars`/`group-avatars`) — l'affichage passe par une URL signée temporaire (1h), régénérée à
  chaque chargement des commentaires. La policy de lecture s'appuie sur celle déjà en place sur
  `comments` (visible seulement si la main l'est) plutôt que de la dupliquer : si la ligne
  `comments` n'est pas visible pour l'appelant, `exists()` échoue automatiquement.
  Nouveau module partagé `src/data/images.ts` étendu : `resizeToBase64` (recadrage désactivé,
  contrairement à `cropAndResizeToBase64` pour les avatars — une photo de commentaire garde sa
  forme) et `uploadPrivateImage` (upload sans URL publique, pour un bucket privé).
  **Bug trouvé et corrigé pendant la vérification** : la contrainte "texte ou pièce jointe
  obligatoire" ajoutée côté base bloquait le cas "photo seule" — la ligne `comments` doit exister
  AVANT de connaître son id (utilisé comme chemin de stockage), donc un instant transitoire sans
  aucun des trois. Retirée : le client garantit déjà cette règle (bouton "Envoyer" désactivé sinon).
  Si l'envoi de la photo échoue après coup, le commentaire tout juste créé est supprimé plutôt que
  laissé orphelin sans image.
  Vérifié en deux temps : (1) dans le navigateur sur le vrai post de l'utilisateur — sélecteur de
  GIF (tendances + recherche "poker"), aperçu avant envoi avec bouton "Envoyer" activé sans texte,
  **retiré sans envoyer** pour ne rien ajouter au vrai post ; (2) par API sur une main de test
  privée jetable — commentaire GIF seul, commentaire photo seule (upload, lien signé, lecture
  refusée pour un autre utilisateur ET pour anonyme, "Object not found" sans confirmer l'existence),
  tout supprimé ensuite. `tsc --noEmit` propre, aucune erreur console.

- **2026-07-29 — Petite distinction visuelle pour le membre fondateur d'un groupe privé.**
  Un 👑 accolé au pseudo du créateur dans la liste "Membres" de `GroupScreen` (`m.userId ===
  group.ownerId`) — cohérent avec le tag "en attente" déjà présent pour les invitations et le
  langage d'icônes déjà utilisé partout ailleurs dans l'app (📷, ✏️, 🗑️…). Vérifié dans le
  navigateur sur le vrai groupe de l'utilisateur, couronne bien affichée à côté du fondateur.
  `tsc --noEmit` propre, aucune erreur console.

- **2026-07-29 — Photo et description pour les groupes privés, réservées au créateur.**
  Extension du système d'avatar déjà construit pour les profils : nouveau module partagé
  `src/data/images.ts` (sélection, cadrage/redimensionnement, envoi vers un bucket) factorisé hors
  de `src/data/avatars.ts`, réutilisé par un nouveau `src/data/groupAvatars.ts`. `AvatarCropper` et
  `Avatar` sont restés inchangés — le second gagne juste un prop `shape` ('circle' pour une
  personne, 'square' pour un groupe, même distinction visuelle que l'ancienne initiale). Nouvel
  écran `EditGroupScreen` (description, 300 caractères, compteur), même mécanique que
  `EditProfileScreen`. Modifiable uniquement par le créateur du groupe — cohérent avec le reste
  (lui seul invite/supprime déjà) ; policy déjà existante (`update using(owner_id = auth.uid())`),
  aucun ajout nécessaire côté `groups` pour l'autoriser.
  Nouveau bucket `group-avatars`, **lecture publique** — décision prise avec l'utilisateur après
  explication du compromis réel : une photo de groupe privé n'apparaît jamais dans le feed public
  (contrairement à un avatar perso), donc le public-read laisse une fenêtre théorique sur la
  photo SEULE si son URL exacte fuitait ailleurs — jamais sur le nom, les membres ou les mains du
  groupe, toujours protégés par RLS. Écriture réservée au créateur (chemin `{groupId}/avatar.jpg`).
  **Bug trouvé et corrigé en vérifiant** : la première version de la policy d'écriture comparait
  `(storage.foldername(name))[1]` à l'id du groupe, mais `name` à l'intérieur du `exists (select
  from groups g where ...)` se résolvait à `groups.name` (le NOM du groupe) plutôt qu'au chemin du
  fichier envoyé — `groups` a elle-même une colonne `name`, donc SQL préfère la table la plus
  proche. Résultat : la comparaison ne correspondait jamais à rien, upload refusé même pour le
  créateur. Fix : qualifier explicitement `storage.objects.name`.
  Vérifié en deux temps, comme pour le profil : (1) dans le navigateur, sur le vrai groupe de
  l'utilisateur — rendu de l'avatar carré et du bouton "Modifier le groupe", saisie de la
  description avec compteur, **annulé sans enregistrer** ; le sélecteur de fichier système
  lui-même n'a pas pu être testé de bout en bout ici (l'injection de fichier de test qui avait
  fonctionné pour l'avatar personnel s'est montrée trop instable dans cet environnement — sans
  rapport avec le code de l'app, qui réutilise le composant de cadrage déjà validé à l'identique).
  (2) Par API sur un groupe jetable créé pour l'occasion : upload par le créateur (200), lecture
  publique anonyme (200), upload refusé pour un non-créateur (403), mise à jour de la description
  (200), description à 301 caractères refusée (400/23514), modification refusée pour un
  non-créateur (RLS filtre silencieusement, 0 ligne modifiée) — groupe et fichier de test supprimés
  ensuite (le fichier lié à un groupe déjà supprimé est resté orphelin, la policy de suppression
  exige de prouver qu'on est le créateur d'un groupe qui n'existe plus : comportement attendu, sans
  conséquence, un seul petit fichier de test que rien ne référence).
  `tsc --noEmit` propre, aucune erreur console.

- **2026-07-29 — Édition du profil après inscription (pseudo, préférence d'affichage, format,
  fréquence, description) + reformulation du résumé par défaut.**
  Jusqu'ici `CompleteProfileScreen` ne s'exécutait qu'à la création du compte (`hasProfile ===
  false`), laissant pseudo/format favori/fréquence de jeu verrouillés à vie ensuite. Aucune SQL
  nouvelle nécessaire pour ces champs : la policy de modification ajoutée pour l'avatar autorisait
  déjà la mise à jour de n'importe quelle colonne de `profiles`.
  **Nouvelle colonne `bio`** (texte libre façon Instagram, 150 caractères, contrainte `check`
  côté base en plus de la limite dans le champ) — script SQL exécuté par l'utilisateur.
  Nouvel écran `src/profile/EditProfileScreen.tsx` (affiché en overlay par-dessus `ProfileScreen`,
  même mécanique que `AvatarCropper`) : pseudo, choix pseudo/nom, description avec compteur
  "X/150", format favori, fréquence de jeu. Prénom/nom/date de naissance restent verrouillés —
  privés, dans `profiles_private`, rarement à corriger. `data/profiles.ts` : `updateProfile()`
  relit le profil après écriture plutôt que de reconstruire `displayName` à la main, pour rester
  sur la même source de vérité (`get_display_name`) que partout ailleurs.
  **Retour utilisateur en cours de route** : le résumé par défaut ("Cash game live · Très
  régulièrement...") ne coulait pas bien, et une description ne faisait que s'ajouter dessus au
  lieu de le remplacer. Fix : `playerSummary()` dans `profileOptions.ts` réduit les 4 fréquences à
  2 catégories ("régulier" = régulièrement/très régulièrement, "occasionnel" = les deux autres) et
  produit "Joueur régulier de cash game live" ; la description, quand elle existe, **remplace**
  entièrement ce résumé au lieu de s'afficher en plus.
  Vérifié en deux temps pour ne jamais toucher aux vraies données du compte réel connecté dans le
  navigateur de test (`pokza_founder`, qui avait déjà sa propre vraie photo — signe que l'upload
  d'avatar fonctionne aussi en usage réel) : (1) interaction complète de l'écran d'édition dans le
  navigateur — pré-remplissage correct, compteur de description en temps réel, sélection des puces
  — puis **annulé sans enregistrer** ; (2) l'enregistrement réel, l'unicité du pseudo (409/23505,
  message "Ce pseudo est déjà pris" déjà géré comme à l'inscription) et la contrainte de longueur
  de la description (400/23514) vérifiés par API sur un compte de test dédié, remis dans son état
  d'origine ensuite. `tsc --noEmit` propre, aucune erreur console.

- **2026-07-29 — Cadrage manuel de la photo de profil (déplacer + zoomer) avant l'envoi.**
  Suite au retour utilisateur : la version précédente uploadait la photo telle quelle et laissait
  l'affichage ("cover") en centrer automatiquement le milieu — sur une photo mal cadrée (sujet
  décentré), le résultat pouvait mal rendre sans aucun moyen de corriger.
  Nouvel écran `AvatarCropper` (`src/components/ui/AvatarCropper.tsx`), affiché juste après avoir
  choisi une photo : elle est montrée en entier dans un cercle, déplaçable au doigt/à la souris
  (`PanResponder`, disponible tel quel sur le web via `react-native-web`) et zoomable via deux
  boutons +/-. Le zoom minimal est calculé pour que le cercle soit toujours entièrement rempli
  (jamais de bord vide), le déplacement est borné pour la même raison, et zoomer garde le point
  actuellement au centre du cercle plutôt que de recadrer autour d'un coin.
  `src/data/avatars.ts` : `pickAvatarImage` ne demande plus de recadrage natif à `expo-image-picker`
  (`allowsEditing` n'avait de toute façon aucun effet sur le web, autant avoir le même parcours de
  cadrage partout) ; `uploadAvatar` prend maintenant la région carrée choisie et appelle
  `ImageManipulator.crop()` avant `resize()`, donc c'est la vraie zone choisie qui part en base —
  l'affichage circulaire ne fait plus qu'arrondir une image déjà carrée, il ne cache plus rien de
  surprenant.
  Vérifié en conditions réelles dans le navigateur, sur le compte réel de l'utilisateur (sans
  jamais envoyer de donnée : le sélecteur de fichier système ne pouvant pas être piloté depuis le
  navigateur automatisé, une image de test à 4 quadrants colorés a été injectée directement dans le
  champ caché du sélecteur pour déclencher l'écran de cadrage) : glisser révèle bien le quadrant
  opposé au sens du geste, zoomer avant/arrière se fait bien autour du centre visible et se bloque
  exactement aux bornes sans jamais montrer de vide, "Annuler" ferme l'écran sans aucun appel
  réseau (le profil et l'avatar restent inchangés — vérifié par capture d'écran après coup).
  `tsc --noEmit` propre, aucune erreur console.

- **2026-07-29 — Photo de profil : affichage partout + upload/suppression sur sa propre page.**
  La donnée `avatar_url` était déjà remontée par toutes les vues (feed, recherche, groupes,
  invitations, notifications) mais **affichée nulle part** — chaque avatar de l'app était un rond
  coloré avec l'initiale du pseudo. Comportement voulu par l'utilisateur : **par défaut le logo
  Pokza** (pas encore créé) **si personne n'a choisi de photo**, la photo sinon. En attendant le
  logo, l'initiale reste l'avatar par défaut — construite comme la SEULE pièce à changer plus tard
  (`DefaultAvatar` dans `src/components/ui/Avatar.tsx`), pour que brancher le logo, ou revenir en
  arrière si un logo identique pour tout le monde rend le feed trop uniforme, tienne en une ligne.
  Nouveau composant partagé `Avatar` (photo ronde + repli sur l'initiale), branché dans `PostCard`,
  `SideMenu`, `ProfileScreen` (avatar principal + invitations d'amis en attente), `SearchScreen`,
  `GroupScreen` (membres). Les avatars de **groupe** (initiale du nom du groupe) restent inchangés,
  hors sujet.
  **Upload** (`src/data/avatars.ts`) : sélection via `expo-image-picker`, redimensionnement au plus
  petit côté à 512px via la nouvelle API `ImageManipulator.manipulate().resize().renderAsync()`
  (l'ancienne `manipulateAsync` est dépréciée en SDK 57), conversion du base64 renvoyé en octets via
  `base64-js` — `fetch(uri).then(r => r.blob())`, la méthode la plus évidente, produit des fichiers
  de 0 octet avec Supabase en React Native, ce détour fonctionne aussi bien sur mobile que web.
  Chemin fixe `{userId}/avatar.jpg` (un seul fichier par personne, jamais d'orphelins) avec un
  paramètre `?v=timestamp` sur l'URL enregistrée pour forcer le rechargement après un remplacement
  (sinon l'ancienne photo resterait affichée, mise en cache par le navigateur/CDN). Bouton photo
  visible uniquement sur son propre profil (badge appareil-photo sur l'avatar), avec "Retirer la
  photo" quand une photo existe.
  SQL exécuté par l'utilisateur (bucket `avatars` en lecture publique, écriture/suppression limitée
  à son propre dossier, plus une policy de modification de `profiles` qui servira aussi à l'édition
  de profil à venir).
  Vérifié en conditions réelles : le sélecteur de fichier système ne peut pas être piloté depuis le
  navigateur automatisé, donc le remplacement du chemin fichier a été testé directement par API
  (upload d'une image de test dans le bucket + mise à jour de `avatar_url`), puis l'app rechargée a
  bien affiché la vraie photo sur la page de profil et dans le menu latéral. Le bouton **"Retirer la
  photo" a lui été testé par un vrai clic dans l'app** : retour immédiat à l'initiale partout,
  confirmé côté base (`avatar_url` à `null`, fichier supprimé du bucket — 400 au lieu de 200).
  `tsc --noEmit` propre, aucune erreur console à aucune étape.
  **Non fait ici, volontairement** : l'ajout de la photo à l'inscription (friction inutile à ce
  moment) et l'édition du reste du profil (pseudo/format favori/fréquence), qui reste la prochaine
  tâche.

- **2026-07-29 — Feed rafraîchissable et paginé : voir les mains des autres sans recharger la page.**
  Jusqu'ici `fetchFeed()` chargeait **toutes** les mains visibles d'un coup, une seule fois au
  démarrage. Avec plusieurs personnes qui postent, rien n'apparaissait sans recharger le navigateur
  — ce qui rendait un test à plusieurs à peu près impossible.
  **Pagination** : `fetchFeed(offset)` avec `FEED_PAGE_SIZE = 10` et un bouton "Charger plus de
  mains" qui disparaît quand la dernière page est atteinte (une page incomplète = fin du feed).
  Ajout d'un **tri secondaire par date** dans la requête, qui n'est pas cosmétique : `affinity_score`
  produit énormément d'ex æquo (tous les inconnus sans ami commun partagent le même score) et sans
  départage stable Postgres peut renvoyer ces lignes dans un ordre différent d'un appel à l'autre —
  une même main apparaîtrait alors sur deux pages, ou sur aucune. Les deux points de fusion de
  listes dédoublonnent quand même par id, parce qu'une main publiée entre deux pages décale la
  fenêtre : deux cartes identiques feraient planter le rendu (clés React en double).
  **Rafraîchissement** : `RefreshControl` (geste "tirer pour rafraîchir") **plus** un rechargement
  automatique quand l'app redevient active. Les deux sont nécessaires, pas redondants — j'ai lu la
  source de `react-native-web` : son `RefreshControl` est un composant vide qui jette `onRefresh` et
  rend un simple `View`, donc le geste n'existe **que** sur téléphone. `AppState`, lui, est branché
  sur `visibilitychange` côté web : revenir sur l'onglet (ou sur l'app depuis le multitâche du
  téléphone) recharge le feed et le compteur de notifications. C'est le seul moyen de voir du
  nouveau sur navigateur sans recharger la page entière.
  Le rechargement **fusionne** au lieu de remplacer quand plusieurs pages sont déjà chargées :
  sinon un simple aller-retour sur l'onglet renverrait l'utilisateur en haut du feed, les mains
  qu'il avait déroulées disparaissant sous ses yeux.
  Vérifié en navigateur avec 12 mains de test créées pour l'occasion : 10 affichées + bouton, clic →
  12 sans doublon et bouton disparu ; puis une main publiée par API **pendant que l'onglet était en
  arrière-plan**, retour sur l'onglet → elle apparaît en tête sans rechargement, et la 2e page
  déjà chargée est toujours là. Les 13 mains de test ont ensuite été supprimées et le feed vérifié
  revenu à son état initial. Aucune erreur console.
  **Non vérifié comportementalement** : le geste de tirage lui-même, impossible à déclencher sur
  navigateur de bureau — il ne pourra l'être qu'à l'essai sur téléphone.

- **2026-07-29 — Page dédiée à une main : les notifications ouvrent enfin ce dont elles parlent.**
  Jusqu'ici, cliquer sur "Julien a aimé ta main" ouvrait le **profil** de Julien plutôt que la main
  elle-même — la seule destination existante pour une notification était `onSelectProfile`, alors
  que `notifications_feed` renvoie bien `post_id` depuis le début. Nouvel écran `PostScreen.tsx` :
  une seule `PostCard` (le même composant que le feed, pour ne pas donner l'impression d'une main
  différente) alimentée par une nouvelle fonction `fetchPost(postId)` sur la vue
  `posts_feed_with_group`. En `maybeSingle()` et pas `single()` : si la main a été supprimée, est
  repassée en privé ou si le groupe a été quitté depuis l'envoi de la notification, RLS renvoie
  zéro ligne — cas d'affichage normal ("Cette main n'est plus disponible."), pas une erreur.
  `NotificationsScreen` route maintenant vers cette page dès qu'une notification porte un `post_id`
  (like, commentaire, réponse, "ami a posté", "main postée dans un groupe privé") — avant même de
  regarder le groupe, puisqu'une notif de main parle d'une main précise, pas du groupe entier.
  Seule exception : `group_invite` continue d'ouvrir le profil de l'inviteur, parce que la page du
  groupe reste inaccessible tant que l'invitation n'est pas acceptée (`is_group_member` exige le
  statut accepté) — les boutons Accepter/Refuser de la ligne restent le vrai chemin pour ce cas.
  Une notification de commentaire (`post_comment`/`comment_reply`/`comment_like`) ouvre en plus
  directement le fil de commentaires (nouvelle prop `initialCommentsOpen` sur `PostCard`) : le
  commentaire est ce que l'utilisateur vient lire, pas seulement la main.
  L'écran de modification peut désormais aussi être ouvert depuis cette page (`editReturnMode`
  gagne la valeur `'post'`) et y revenir après enregistrement.
  **Deux bugs préexistants corrigés au passage**, découverts en écrivant `fetchPost` : (1)
  `rowToPost` ne recopiait jamais `group_id` depuis la ligne de la vue — un post de groupe rouvert
  en modification perdait son groupe et le bouton Enregistrer restait désactivé ; (2) le feed n'est
  chargé qu'une fois au démarrage, donc une main publiée depuis un autre appareil après ce
  chargement n'y figure pas — si on arrive dessus via une notification puis qu'on clique modifier,
  `editingPost` ne la trouvait pas dans `posts`. Un repli (`onLoaded` remonte la main fraîchement
  chargée par `PostScreen`) couvre ce second cas.
  Vérifié avec deux comptes de test créés pour l'occasion (main publique de l'un, like + commentaire
  de l'autre) : notification "a aimé" → main seule affichée avec bons compteurs ; notification "a
  commenté" → main + panneau de commentaires déjà ouvert avec le bon commentaire ; modification
  depuis cette page → pré-remplie, enregistrement ramène bien sur la page de la main ; main
  supprimée puis notification rouverte → "Cette main n'est plus disponible." sans erreur. Aucune
  erreur console à aucune étape.

- **2026-07-29 — Vocabulaire et icône des groupes : "groupe privé" partout, trèfle remplacé par 👥.**
  Deux retours de l'utilisateur, appliqués ensemble. D'abord l'icône : le ♣ utilisé pour l'entrée
  "Mes groupes" du menu et pour les 3 types de notification de groupe a été remplacé par 👥. Les
  **deux autres ♣ du code n'ont pas été touchés** (`MultiCardPicker.tsx:12` et `CardView.tsx:9`) :
  ce sont de vraies couleurs de cartes, pas de la décoration — un remplacement global aurait cassé
  le sélecteur de cartes. Ensuite le libellé : chaque occurrence visible par l'utilisateur dit
  maintenant "groupe privé" et plus seulement "groupe", dans `App.tsx`, `GroupsListScreen.tsx`,
  `GroupScreen.tsx`, `NotificationsScreen.tsx`, `ReviewStep.tsx` et `EditPostScreen.tsx` — y compris
  le chip de visibilité du créateur et de l'écran de modification, le sélecteur "Quel groupe privé ?",
  les confirmations de suppression et les 3 textes de notification. La raison est produit, pas
  cosmétique : "groupe" seul laisse croire à un espace public type page Facebook, alors que le
  contenu n'y est visible que des membres acceptés. Vérifié écran par écran dans le navigateur
  (menu, liste, page de groupe, écran de modification), console sans erreur.

- **2026-07-29 — Groupes privés : dernière étape du chantier "réseau social" (public / privé / groupe, avec page dédiée par groupe).**
  Deux tables : `groups` (id, name, owner_id) et `group_members` (group_id, user_id, status
  pending/accepted, invited_by), sur le même modèle que `friend_requests` — invitation et
  appartenance sont la même ligne, accepter = passer le statut, refuser/quitter/retirer un membre =
  supprimer la ligne. Le créateur devient automatiquement membre accepté à la création, via une RPC
  `create_group` qui fait les deux insertions (groupe + appartenance du créateur) en une seule
  opération SECURITY DEFINER : sans ça un groupe pourrait exister brièvement sans aucun membre si le
  réseau coupe entre les deux écritures.
  **Seul le créateur peut inviter** (policy INSERT sur `group_members` : `invited_by = auth.uid()`
  + créateur du groupe + statut forcé à `pending`) et **une main d'un groupe supprimé repasse en
  privé** (trigger `BEFORE DELETE` sur `groups` qui met à jour les posts concernés avant que la
  suppression n'ait lieu, sinon la contrainte de clé étrangère `posts.group_id` bloquerait le delete)
  — les deux décisions demandées explicitement par l'utilisateur.
  **Bug de récursion RLS rencontré et corrigé en cours de route** : la policy de lecture de `groups`
  interrogeait directement `group_members`, qui interrogeait directement `groups` en retour →
  boucle infinie (`infinite recursion detected in policy`), qui rendait TOUTE lecture de groupe et
  même la vue `notifications_feed` (qui fait un join vers `groups`) inutilisable pour tout le monde.
  J'avais bien empêché la récursion *à l'intérieur* de `group_members` (fonction SECURITY DEFINER
  `is_group_member`), mais pas ce cas *croisé* entre les deux tables. Corrigé en ajoutant
  `is_group_owner` (même principe) et en remplaçant **toutes** les sous-requêtes brutes
  inter-tables par des appels à ces deux fonctions, qui contournent RLS et cassent donc le cycle.
  **Second bug trouvé en vérifiant** : après ce correctif, un invité *en attente* ne voyait plus le
  nom du groupe auquel il était invité (`is_group_member` exige `status = 'accepted'`, trop strict
  pour ce cas). Ajouté `is_group_participant` (accepted OU pending) utilisée uniquement pour la
  lecture du nom du groupe — `is_group_member` reste stricte pour la visibilité du contenu et de la
  liste complète des membres, qu'un invité non encore accepté ne doit pas voir.
  Vue `posts_feed_with_group` : construite PAR-DESSUS `posts_feed` (comme `posts_ranked` avant elle),
  simple jointure ajoutant `group_id` sans dupliquer la logique de résolution auteur/compteurs.
  Notifications étendues avec 3 types : `group_invite`, `group_accept`, `group_posted` — ce dernier
  systématique et SANS le plafond de 12h qui s'applique à "ami qui poste en public" (le cercle d'un
  groupe est déjà volontairement restreint, décision explicite de l'utilisateur).
  Écrans : `src/groups/GroupsListScreen.tsx` (liste + création inline) et
  `src/groups/GroupScreen.tsx` (membres, inviter, quitter/supprimer avec confirmation, mains du
  groupe). `SearchScreen` gagne un `inviteMode` réutilisant l'écran existant plutôt que d'en dupliquer
  un. Chip "Groupe" ajouté dans le créateur de main et l'écran d'édition (n'apparaît que si
  l'utilisateur a au moins un groupe). "Mes groupes" rejoint le menu latéral ☰.
  Vérifié à la fois par REST avec 3 comptes de test (création, auto-appartenance du créateur,
  invitation, refus d'inviter par un non-créateur, acceptation, post de groupe, notification reçue
  par le membre, invisibilité pour un tiers extérieur, suppression du groupe → post repassé en
  privé + `group_members` vidée en cascade) et dans le navigateur avec le vrai compte (création,
  page de groupe, chip visibilité + sélecteur dans l'édition, suppression avec confirmation).
  Aucune erreur console à aucune étape.

- **2026-07-28 — Système de notifications, fusionné avec l'ancien écran Invitations (📥 devient 🔔).**
  Sept types couverts : like sur une main, like sur un commentaire, commentaire sur sa main,
  réponse à son commentaire, demande d'ami reçue, demande d'ami acceptée, ami qui poste une main
  publique. Le vote sur un sondage ne notifie personne (choix délibéré : un vote est pensé comme
  un geste discret, contrairement au like qui est un signal social affiché).
  Écriture entièrement par déclencheurs SQL (SECURITY DEFINER, même schéma que les compteurs de
  likes/commentaires) plutôt que par l'app : infalsifiable, et fonctionne quel que soit l'endroit
  d'où vient l'action. Deux règles anti-bruit systématiques : (1) jamais de notification à
  soi-même (ex: liker sa propre main) ; (2) retirer un like ou annuler/refuser une demande d'ami
  retire la notification correspondante plutôt que de la laisser traîner comme obsolète.
  Cas particulier "un ami poste une main publique" : plafonné à UNE notification toutes les 12h,
  tous amis confondus, sur demande explicite de l'utilisateur (un ami actif en génèrerait sinon une
  par main). Choix déterministe plutôt qu'un tirage aléatoire ("une notif sur trois") : plus
  prévisible, plus facile à expliquer si un réglage utilisateur est ajouté un jour. Implémenté par
  une condition `not exists` dans le déclencheur (`notify_friend_posted`), pas de file d'attente —
  les posts sautés dans la fenêtre ne ressurgissent pas plus tard. Ne se déclenche que sur la
  création d'une main, jamais sur un changement de visibilité a posteriori. Les mains de groupe
  (visibility='group') seront traitées séparément avec une notification systématique une fois les
  groupes construits — sur demande explicite de l'utilisateur, contrairement au cas public throttlé.
  Sécurité : la table `notifications` n'a NI policy INSERT NI policy DELETE pour `authenticated` —
  toute écriture passe par les fonctions SECURITY DEFINER, qui contournent RLS comme le fait déjà
  `mutual_friend_count`. La policy UPDATE existe (pour marquer "lu") mais un `revoke`/`grant` limite
  la modification à la seule colonne `read_at` : sans cette restriction de colonne, RLS (qui ne
  filtre que des LIGNES, jamais des colonnes) aurait aussi permis à un utilisateur de réécrire
  l'auteur ou le type de ses propres notifications.
  Vue `notifications_feed` (security_invoker = on, même piège que pour `posts_feed`/`posts_ranked`
  lors du chantier précédent) résout nom/avatar de l'auteur de l'action et titre/lieu de la main
  concernée côté base — le texte "Paul a posté une main à Las Vegas 2026" vient de là.
  `src/data/notifications.ts` (nouveau) : fetchNotifications/fetchUnreadNotificationCount/
  markNotificationRead/markAllNotificationsRead.
  `src/notifications/NotificationsScreen.tsx` remplace `src/invitations/InvitationsScreen.tsx`
  (supprimé) : les demandes d'ami gardent leurs boutons Accepter/Refuser inline (comportement
  identique à l'ancien écran — la ligne disparaît de la vue une fois traitée, même si la notif
  persiste en base comme historique), les autres types sont des lignes cliquables qui ouvrent le
  profil de l'auteur de l'action (pas de vue "un seul post" dans l'app pour l'instant, donc pas de
  lien direct vers le post exact — à revoir si une telle vue est construite un jour) et se marquent
  lues au clic. Ouvrir l'écran marque aussi tout comme lu automatiquement (comme la plupart des
  centres de notifications). `App.tsx` : mode `invitations` renommé `notifications`, badge basé sur
  `fetchUnreadNotificationCount()` au lieu du nombre de demandes en attente.
  Sur demande explicite de l'utilisateur, les invitations en attente restent aussi consultables
  depuis son propre profil : nouvelle section dans `ProfileScreen.tsx` (visible seulement si
  `isOwnProfile`), qui réutilise telles quelles les fonctions de `friends.ts` déjà écrites pour
  l'ancien écran Invitations plutôt qu'une nouvelle abstraction partagée (les deux emplacements
  chargent les données différemment — vue générique pour l'un, requête ciblée pour l'autre — donc
  pas encore assez similaires pour justifier un composant commun). `onSelectProfile` réintroduit
  comme prop optionnelle de `ProfileScreen` pour permettre ce lien (à ne pas confondre avec la
  fonctionnalité de liste d'amis publique annulée plus tôt pour raisons RGPD — ceci n'expose que
  ses propres demandes en attente, jamais le graphe social d'un tiers).
  Vérifié en conditions réelles avec trois comptes de test (A, B, C) couvrant les 15 comportements
  attendus dans l'ordre : demande d'ami → notif reçue ; acceptation → notif à l'émetteur d'origine ;
  main publique postée → notif "ami a posté" avec le bon lieu ; une 2e main postée dans la foulée →
  toujours une seule notif "ami a posté" (plafond 12h vérifié dans son sens "supprime l'excédent" —
  la remise à zéro après 12h n'a PAS pu être vérifiée par le comportement, faute de clé service_role
  pour antidater une ligne, seulement relue dans le code du déclencheur, même limitation assumée que
  pour le plafond d'amis en commun) ; like → notif → retrait du like → notif supprimée ; like sur
  son propre post → aucune notif (garde-fou) ; commentaire → notif ; réponse à ce commentaire →
  notif au bon destinataire (l'auteur du commentaire parent, pas l'auteur de la main) ; like sur un
  commentaire → notif → retrait → notif supprimée ; demande d'ami refusée → notif supprimée ;
  isolation RLS confirmée (un tiers ne peut lire les notifications d'un autre même avec un filtre
  explicite dessus) ; restriction de colonne confirmée (modifier `type` échoue en 403, modifier
  `read_at` réussit) ; comptage des non-lues correct. Toutes les données de test supprimées après
  coup ; les 3 comptes fantômes restants nécessitent la suppression manuelle habituelle
  (`delete from auth.users`, RLS n'autorisant pas la suppression de `profiles` via l'API).

- **2026-07-28 — Les visibilités "public" et "privé" sont enfin respectées à la lecture (bug préexistant corrigé).**
  Les chips Public/Privé existaient depuis longtemps dans le créateur et l'édition
  (`ReviewStep.tsx`, `EditPostScreen.tsx`) mais rien ne filtrait dessus : une main "Privé" restait
  lisible par tout le monde. Corrigé par une policy RLS unique sur `posts` : lecture si
  `visibility = 'public'` OU `author_id = auth.uid()`. Insert/update/delete restreints à l'auteur
  (ces règles n'existaient pas explicitement non plus, elles reposaient sur le comportement par
  défaut).
  Point technique qui aurait pu rendre le correctif inopérant sans qu'on s'en aperçoive : le feed
  ne lit pas `posts` directement, il passe par les vues `posts_feed`/`posts_ranked`. Par défaut,
  Postgres évalue les policies RLS d'une vue avec les droits de son créateur (le rôle admin), pas
  du visiteur — poser la règle sur la table seule n'aurait donc rien changé à ce que le feed
  affiche. Les deux vues sont passées en `security_invoker = on` pour forcer l'évaluation avec les
  droits du lecteur réel.
  Vérifié en conditions réelles avec un nouveau compte de test (`priv_test`, créé et supprimé pour
  l'occasion) : un post posté en "privé" est absent en lecture anonyme sur les trois surfaces
  (table `posts`, vue `posts_feed`, vue `posts_ranked`) mais reste visible par son auteur sur les
  trois ; le post public existant (`test` de pokza_founder) reste lisible normalement. Les likes
  ont aussi été revérifiés après coup (comptage toujours correct) pour s'assurer que le changement
  RLS n'avait rien cassé de collatéral. Post et like de test supprimés après vérification.
  Les mains "Groupe" restent invisibles pour tout le monde sauf leur auteur tant que
  [[groupes]] n'existe pas — sans conséquence actuellement, aucune main n'est dans ce cas.

- **2026-07-28 — Menu latéral ouvert par une pile de jetons, à la place du bouton Déconnexion en haut.**
  La barre du haut arrivait à saturation (Créer une main, 🔍, 📥, Déconnexion) alors qu'il reste des
  fonctionnalités à y brancher. Plutôt qu'une barre d'onglets en bas — écartée parce que Pokza n'a
  qu'une seule destination fréquente, le feed, et qu'une barre à 5 onglets serait surtout composée
  de cases vides — un panneau latéral façon Facebook, qui devient le rangement de tout ce qui ne
  mérite pas une place permanente à l'écran.
  `src/components/ui/ChipStackIcon.tsx` : trois jetons empilés vus de côté. La silhouette est
  volontairement identique à celle d'un menu hamburger (trois barres horizontales de même largeur,
  aucun décalage) — c'est ce qui garantit qu'on comprend l'icône sans réfléchir ; l'alternance
  navy/or et la tranche cerclée ne sont qu'un habillage poker par-dessus. Rien à recycler côté
  visuel : le replayer ne dessine aucun jeton, son pot est une pastille (choix assumé, cf. le
  commentaire en tête de `ChipsView.tsx`).
  `src/components/ui/SideMenu.tsx` : panneau de 288 px qui glisse depuis la gauche (translation +
  fondu du voile, 220 ms). Il reste monté pendant l'animation de fermeture, sinon il disparaîtrait
  d'un coup au lieu de glisser. La carte de profil en haut EST l'entrée "Mon profil" — une ligne
  "Mon profil" séparée aurait fait doublon dans le menu même qu'on crée pour désencombrer.
  Déconnexion en bas. Une prop `items` est prévue pour les entrées à venir ("Mes groupes"), avec
  pastille de comptage optionnelle.
  "Créer un groupe" n'ira PAS dans ce menu : ce sera un bouton à l'intérieur de la page Mes groupes.
  On crée un groupe deux fois dans sa vie, ça ne justifie pas une ligne permanente.
  📥 reste dans la barre du haut et n'ira pas dans le menu : c'est le seul élément qui porte un
  badge, et un badge caché derrière un menu est une notification que personne ne voit.
  Vérifié dans le navigateur en 1280 px et en 375 px : ouverture par l'icône, fermeture par le
  voile, "Voir mon profil" ouvre bien son propre profil (sans le bloc d'amitié, comme attendu).
  Aucune erreur console, typecheck propre.

- **2026-07-28 — Le feed est classé par affinité sociale (amis + amis en commun + récence) au lieu de l'ordre chronologique (étape 4 du chantier "réseau social").**
  SQL : fonction `mutual_friend_count(p_other)` et vue `posts_ranked`, construite PAR-DESSUS
  `posts_feed` (pas de duplication de sa logique). Barème : auteur ami ou soi-même = +30, chaque
  ami en commun = +3 (plafonné à 8 amis), moins l'âge du post en jours. Un inconnu n'est jamais
  masqué, seulement moins prioritaire — sinon rencontrer de nouvelles personnes deviendrait
  impossible sur une app qui démarre. Barème facile à recalibrer : ce sont trois nombres dans la vue.
  Le plafond était initialement à 10, ce qui portait le bonus max des amis communs à 10 × 3 = 30,
  soit exactement le bonus d'amitié : un inconnu avec 10+ amis communs arrivait donc à égalité avec
  un ami direct (les deux bonus s'additionnant, un ami n'était jamais en dessous, mais l'égalité
  n'était pas voulue). Descendu à 8 sur remarque de l'utilisateur : le bonus max tombe à 24,
  strictement sous les 30 de l'amitié, donc un ami passe toujours devant à âge égal.
  Confidentialité : compter les amis en commun oblige à lire la liste d'amis d'un tiers, ce que RLS
  interdit. `mutual_friend_count` est donc en SECURITY DEFINER mais volontairement étroite — elle ne
  renvoie QU'UN COMPTE (jamais la liste) et le "moi" de la comparaison est forcé à `auth.uid()`,
  donc impossible d'interroger la relation entre deux tiers ni de reconstituer une liste d'amis.
  Une version rendant les listes d'amis publiques a été codée puis annulée après discussion :
  l'article 25 du RGPD (protection des données par défaut) vise directement ce cas, d'autant qu'une
  amitié est une donnée à deux et que le contexte poker rend le graphe social plus sensible. Le
  classement n'en avait de toute façon pas besoin. À reprendre plus tard sous forme d'un réglage
  par utilisateur (tout le monde / mes amis / personne) si la découverte de proche en proche est
  souhaitée. `src/data/posts.ts` : `fetchFeed()` (vue `posts_ranked`, tri par `affinity_score`)
  séparé de `fetchPosts(authorId)` (page de profil, resté chronologique — le classement social n'a
  pas de sens quand tout vient de la même personne).
  Vérifié en conditions réelles avec trois comptes de test et des scores exacts, vu depuis
  `amie_test` : (1) le post d'un AMI vieux de 5 jours (score 24,98) passe devant celui d'un inconnu
  vieux de 10 h (-0,42) — l'ordre chronologique l'aurait mis en dernier, donc le boost d'amitié est
  bien ce qui décide ; (2) deux posts d'inconnus datés à la seconde près identique se départagent
  d'exactement 3,00 points, soit précisément le poids d'un ami en commun (2,58 contre -0,42), l'âge
  étant neutralisé. L'app consomme bien la vue et affiche l'ordre classé. Aucune erreur console.
  Le passage du plafond de 10 à 8 n'a PAS été vérifié par le comportement : il aurait fallu un
  compte ayant plus de 8 amis en commun, donc une douzaine de comptes de test supplémentaires,
  non supprimables avec la clé publique (nettoyage manuel dans le dashboard). Vérifié à la place
  par lecture de la définition réelle de la vue en base (`pg_get_viewdef`), qui montre bien
  `LEAST(r.mutual_friend_count, 8)` — `least()` étant une fonction native de Postgres.

- **2026-07-28 — Système d'ami : demande, boîte "Invitations", acceptation, retrait avec confirmation (étape 3 du chantier "réseau social").**
  À la demande de l'utilisateur, deux règles précises : impossible d'envoyer une demande à
  quelqu'un qui nous en a déjà envoyé une (on voit sa demande à accepter à la place du bouton
  "Ajouter en ami") ; retirer un ami demande une confirmation, comme pour la suppression d'un post.
  SQL : table `friend_requests` (sender_id, receiver_id, status pending/accepted, clé primaire
  composite). Trois policies RLS notables : SELECT visible par les deux parties ; INSERT en son
  propre nom uniquement, avec un `not exists` qui bloque la demande si la personne visée a déjà une
  demande en attente vers nous (la règle métier est donc appliquée aussi côté base, pas seulement
  dans l'interface) ; UPDATE (passage à `accepted`) réservé au destinataire, pour empêcher
  l'expéditeur de s'auto-accepter. Refuser/annuler/retirer un ami sont tous les trois une simple
  suppression de la ligne (delete autorisé aux deux parties) — pas de statut "declined" séparé.
  `src/data/friends.ts` : `fetchFriendStatus`, `sendFriendRequest`, `acceptFriendRequest`,
  `deleteFriendRelation` (réutilisée pour les trois cas de suppression), `fetchPendingRequests`.
  `ProfileScreen.tsx` : bouton contextuel selon la relation (Ajouter en ami / Demande envoyée ·
  Annuler / Accepter la demande d'ami / ✓ Amis · Retirer avec confirmation inline "Non"/"Oui,
  retirer"). Nouvel écran `src/invitations/InvitationsScreen.tsx` (liste des demandes reçues,
  Accepter/Refuser). `App.tsx` : icône 📥 avec badge de compteur à côté de 🔍, nouveau mode
  `invitations`.
  Vérifié en conditions réelles avec un second compte de test (`amie_test`, créé pour l'occasion) :
  recherche "pokza" depuis amie_test → profil de pokza_founder → "Ajouter en ami" → "Demande
  envoyée · Annuler" affiché → connecté en tant que pokza_founder, badge "1" sur 📥 → boîte
  Invitations affiche "amie_test" avec Refuser/Accepter → Accepter → profil d'amie_test affiche
  "✓ Amis" → "Retirer" → confirmation "Retirer cet ami ? Non/Oui, retirer" → "Non" annule bien →
  "Retirer" à nouveau → "Oui, retirer" → retour à "Ajouter en ami", confirmé identique après
  rechargement complet de la page (donc bien supprimé côté serveur, pas juste en local). Aucune
  erreur console à aucune étape.

- **2026-07-28 — Correctif : un vote posé depuis la page de profil n'apparaissait pas en revenant sur le feed.**
  Signalé par l'utilisateur juste après l'ajout de la recherche/profil. `VotePoll.tsx` gardait son
  vote dans un état local initialisé une seule fois au montage (`useState(myVote ?? null)`) ; comme
  `postId` ne change jamais pour un post donné, le composant n'est jamais démonté en revenant d'un
  profil consulté — il ignorait donc silencieusement la nouvelle valeur de `myVote` reçue en props
  après le rafraîchissement du feed (`refreshFeed()` ajouté dans le correctif précédent).
  `VotePoll.tsx` : nouveau `useEffect` qui resynchronise `voted`/`counts` et les animations à chaque
  fois que `myVote`/`initialCounts` changent réellement (donc uniquement sur un vrai refetch, pas
  sur un re-render sans rapport — les autres posts gardent la même référence d'objet quand un seul
  post est modifié via `.map()`, l'effet ne se redéclenche pas pour eux).
  Vérifié en conditions réelles : vote retiré au préalable (confirmé vide en base) → ouverture du
  profil "pokza_founder" → vote "non" → confirmé "1 vote" sur le profil → clic sur la flèche retour
  (sans recharger la page) → le feed affiche immédiatement "✓ non · 1 · 100%", alors qu'avant le
  correctif il serait resté bloqué sur les boutons oui/non. Aucune erreur console.

- **2026-07-28 — Recherche de pseudo et page de profil consultable (première étape du chantier "réseau social" : recherche → profil → amis → groupes → classement du feed par affinité).**
  Jusqu'ici impossible de retrouver quelqu'un dans l'app ni de voir son profil autrement que le
  sien propre à la création.
  Pas de nouveau SQL : la table `profiles` (pseudo, avatar_url, format favori, fréquence de jeu)
  était déjà publiquement lisible depuis la mise en place de la base — seul `profiles_private`
  (prénom/nom/date de naissance) reste protégé, jamais touché ici.
  `src/data/profiles.ts` : `searchProfiles(query)` (recherche `ilike` sur le pseudo, jusqu'à 20
  résultats) et `fetchProfile(id)` (ligne `profiles` + `get_display_name` en un seul aller,
  résolution du nom d'affichage cohérente avec le reste de l'app). `src/data/posts.ts` :
  `fetchPosts()` accepte maintenant un `authorId` optionnel pour filtrer les posts d'un profil.
  `src/profile/profileOptions.ts` : libellés FORMAT_OPTIONS/FREQUENCE_OPTIONS extraits de
  `CompleteProfileScreen` pour être réutilisés sur la page de profil (une seule source, pas de
  duplication).
  Nouveaux écrans : `src/search/SearchScreen.tsx` (champ de recherche avec léger débounce, liste de
  résultats pseudo + avatar) et `src/profile/ProfileScreen.tsx` (avatar, nom d'affichage, format
  favori/fréquence, puis la liste de ses posts — comportements like/suppression/édition identiques
  au feed principal). `PostCard.tsx` : header auteur (avatar + nom) devenu pressable via un nouveau
  prop `onPressAuthor`, pour ouvrir le profil de l'auteur directement depuis le feed. `App.tsx` :
  nouveau bouton 🔍 à côté de "+ Créer une main", deux nouveaux modes `search`/`profile`, le feed
  se recharge automatiquement en revenant d'un profil consulté (évite un feed périmé après un
  like/suppression fait depuis là-bas), et l'édition d'un post rouvert depuis un profil y ramène
  après sauvegarde plutôt que de basculer sur le feed.
  Vérifié en conditions réelles : recherche "pokza" → résultat "pokza_founder" affiché → clic →
  page de profil correcte (avatar, "Cash game live · Très régulièrement", ses posts) → clic sur
  le nom d'auteur depuis le feed → même page de profil ouverte directement → édition d'un post
  depuis le profil → "Retour" ramène bien au profil (pas au feed) → retour au feed depuis le profil
  fonctionne. Aucune erreur console à aucune étape.

- **2026-07-28 — Un vote déjà posé peut maintenant être retiré, pour permettre de revoter.**
  Jusqu'ici un vote était définitif une fois posé (cf. entrée précédente) — l'utilisateur a demandé
  la possibilité de décocher. Première version avec un lien dédié "Annuler mon vote" sous les
  résultats, remplacée à la demande de l'utilisateur par une interaction plus légère : recliquer sur
  l'option déjà votée (surlignée, avec ✓) l'annule, sans élément d'interface supplémentaire.
  SQL : ajout de la politique RLS manquante `for delete using (auth.uid() = user_id)` sur
  `public.votes` (seule SELECT-tous et INSERT-son-propre-vote existaient ; sans cette politique,
  une suppression aurait été silencieusement bloquée par RLS — 0 ligne affectée, pas d'erreur).
  `src/data/posts.ts` : nouvelle fonction `retractVote(postId, userId)` (delete sur `post_id`+
  `user_id`, même schéma que `setLiked()` pour un unlike). `VotePoll.tsx` : la ligne de résultat déjà
  votée devient elle-même pressable et appelle `retractVote`, avec mise à jour optimiste (décrémente
  le compteur, repasse aux boutons de vote, réinitialise les animations) et retour en arrière propre
  si l'appel échoue.
  Vérifié en conditions réelles sur le post "test"/question "tapis" : vote "oui" → confirmé en base
  via requête REST directe (table `votes`) → clic sur "✓ oui" → retour aux boutons oui/non → confirmé
  vide en base via la même requête REST → revote → de nouveau confirmé en base. Aucune erreur console
  à aucune étape.

- **2026-07-28 — Le vote ("Tu payes cette river ?") est maintenant persisté en base, au lieu de vivre uniquement en état local.**
  Comme pour les likes/commentaires avant eux : un vote disparaissait au rechargement et n'était vu
  de personne d'autre. Un seul vote par utilisateur et par post, définitif (l'interface ne permettait
  déjà pas de changer d'avis une fois voté, donc pas de politique UPDATE nécessaire).
  SQL : table `votes` (clé primaire composite post/utilisateur). L'ancienne colonne
  `posts.vote_counts` n'a jamais été mise à jour par rien depuis sa création (toujours vide) —
  supprimée, remplacée par un calcul en direct dans `posts_feed` (`jsonb_object_agg` groupé par
  option) ; la vue expose aussi `my_vote` (l'option déjà choisie par l'utilisateur courant, pour
  rouvrir un post déjà voté directement sur les résultats plutôt que de réafficher les boutons).
  `src/data/posts.ts` : `castVote()`. `VotePoll.tsx` : accepte maintenant `postId`/`currentUserId`/
  `myVote`, appelle `castVote` au vote (avec retour en arrière propre si l'appel échoue), et saute
  l'animation d'apparition des résultats quand le vote vient d'une session précédente (pas de
  réanimation à chaque fois qu'on rouvre un post déjà voté).
  Vérifié en conditions réelles sur une main existante avec une question de vote : vote "oui" →
  résultats affichés (100%, 1 vote) → confirmé identique après rechargement complet de la page
  (résultats directement affichés, pas les boutons). Aucune erreur console.

- **2026-07-28 — Les commentaires s'ouvrent maintenant dans une modale plein écran façon réseau social (Instagram), plus une expansion inline façon forum ; ajout du like sur chaque commentaire.**
  Aperçu visuel validé avec l'utilisateur avant codage (mockup HTML) : feuille glissant du bas,
  feed visible en transparence derrière, en-tête "Commentaires" + croix pour fermer, liste à
  défilement propre, saisie fixée en bas.
  `CommentsSection.tsx` transformé en modale (`Modal` de React Native, déjà inclus — aucune
  dépendance ajoutée) pilotée par `visible`/`onClose` au lieu d'un simple rendu conditionnel inline ;
  recharge les commentaires à chaque ouverture (pas seulement au premier montage, pour voir les
  commentaires ajoutés par d'autres entre deux ouvertures).
  SQL : table `comment_likes` (une ligne par utilisateur/commentaire) + colonne
  `comments.like_count` maintenue par trigger SECURITY DEFINER (même principe que les likes de
  post) ; `comments_feed` étendue avec `like_count`/`liked_by_me`. `src/data/comments.ts` :
  `setCommentLiked()`. Chaque commentaire affiche maintenant ♡/♥ + compteur, à côté du lien
  "Répondre" déjà existant.
  Vérifié en conditions réelles sur une main déjà existante avec plusieurs commentaires/réponses :
  la modale s'ouvre bien par-dessus le feed (feed visible en transparence en haut) ; like sur un
  commentaire → cœur plein, compteur à 1, confirmé après rechargement complet de la page (donc bien
  en base) ; fermeture par la croix ramène proprement au feed. Aucune erreur console.

- **2026-07-28 — Likes et commentaires réels (avec réponses à un commentaire), persistés en base.**
  SQL : tables `likes` (une ligne par utilisateur/post, clé primaire composite) et `comments`
  (`parent_comment_id` nullable → réponse à un commentaire, une seule profondeur volontairement,
  pas de fil imbriqué à l'infini). `posts.like_count`/`comment_count` maintenus par des triggers
  SECURITY DEFINER (liker le post de quelqu'un d'autre nécessite de modifier SON compteur, hors de
  portée normale de RLS pour l'utilisateur qui like — d'où le SECURITY DEFINER, strictement limité à
  cette incrémentation). Nouvelle vue `comments_feed` (résout l'auteur via `get_display_name`,
  comme `posts_feed`) ; `posts_feed` étendue avec `liked_by_me` (le post courant a-t-il été liké par
  l'utilisateur connecté). RLS `comments` : visible/commentable seulement si le post l'est
  (public, ou privé + on en est l'auteur).
  Nouveaux fichiers : `src/data/comments.ts`, `src/components/post/CommentsSection.tsx` (liste
  imbriquée premier niveau + réponses indentées, bouton "Répondre" par commentaire, bandeau "Réponse
  à X" avec annulation). `PostCard.tsx` : le ♡/♥ et son compteur utilisent maintenant
  `post.likedByMe`/`likeCount` réels (plus l'ancien état local factice) ; la bulle 💬 déplie/replie
  les commentaires.
  Bug trouvé et corrigé pendant la vérification : le compteur de commentaires dans la barre
  d'engagement ne bougeait pas après ajout/suppression (il ne lisait que `post.commentCount`, figé
  depuis le dernier chargement du feed, sans savoir que `CommentsSection` venait d'ajouter une
  ligne) — corrigé avec un callback `onCountChange` qui ajuste un compteur local dans `PostCard`
  (delta correct aussi à la suppression d'un commentaire qui a des réponses : tout ce qui disparaît
  est décompté, pas seulement la ligne cliquée).
  Vérifié en conditions réelles : like → cœur plein, compteur à 1, survit à un rechargement complet ;
  unlike → retour à 0 ; commentaire ajouté → apparaît immédiatement ; réponse ajoutée → bien
  indentée sous son parent ; compteur d'engagement passé à 2 (commentaire + réponse), confirmé après
  rechargement complet (donc bien en base, pas juste local) ; suppression du post → cascade
  vérifiée par requête directe (`comments` et `likes` vides après coup). Aucune erreur console.

- **2026-07-28 — Possibilité de modifier un post déjà publié (titre, description, lieu, buy-in, niveau, vote, visibilité).**
  Le déroulé de la main (cartes, actions, board) reste figé après publication — seul le texte/
  contexte est modifiable, décision confirmée avec l'utilisateur (pas besoin de rouvrir tout le
  wizard multi-étapes pour ça).
  Nouveau fichier `src/post/EditPostScreen.tsx` : formulaire dédié (pas de réutilisation du wizard
  de création, qui contient plein de champs hors-sujet ici comme les blindes/sièges), pré-rempli
  avec les valeurs actuelles du post. `src/data/posts.ts` : `updatePost()` (ne touche jamais à la
  colonne `hand`). `App.tsx` : nouveau mode `'edit'`, bascule dessus via l'icône ✏️ ajoutée dans
  `PostCard.tsx` à côté de 🗑 (visible uniquement sur ses propres posts).
  Vérifié en conditions réelles : titre/description modifiés, question de vote ajoutée après coup,
  visibilité changée en "Privé" → tout s'affiche immédiatement, ET survit à un rechargement complet
  de la page (donc bien enregistré en base, pas juste en local) — ce qui confirme au passage que la
  règle RLS corrigée plus tôt (l'auteur peut relire ses propres posts privés) fonctionne réellement,
  pas seulement en théorie. Aucune erreur console.

- **2026-07-28 — Les mains créées sont maintenant persistées dans Supabase (lecture, création, suppression), au lieu de vivre uniquement en mémoire.**
  SQL exécuté par l'utilisateur : règle `posts` SELECT corrigée pour qu'un auteur puisse relire ses
  propres posts privés (`visibility = 'public' or auth.uid() = author_id`, remplace l'ancienne
  règle qui ne laissait voir que le public, même à l'auteur) ; vue `posts_feed` qui résout le nom
  d'auteur via `get_display_name` directement en base, pour que l'app n'ait qu'une seule requête à
  faire pour afficher le feed.
  Nouveau fichier `src/data/posts.ts` : `fetchPosts()` (lit `posts_feed`), `createPost()` (insère
  dans `posts`, laisse Postgres générer le vrai UUID plutôt que l'ancien id local `post-${Date.now()}`),
  `deletePost()`. `App.tsx` : le feed se charge désormais depuis Supabase au montage (fini le post de
  démonstration statique — `src/data/testHand.ts` supprimé, plus référencé nulle part) ; "Créer une
  main" écrit vraiment en base ; suppression optimiste (retirée localement tout de suite, restaurée
  si l'appel réseau échoue). `PostCard.tsx` : icône 🗑 visible uniquement sur ses propres posts, avec
  confirmation inline ("Supprimer ce post ? Oui/Non") avant suppression réelle — pas de suppression
  accidentelle en un seul clic.
  Vérifié en conditions réelles avec le compte `pokza_founder` : main créée → confirmée présente en
  base via requête REST directe (UUID généré par Postgres) → survit à un rechargement complet de la
  page → suppression confirmée → disparaît du feed ET de la base (revérifié par requête REST).
  Aucune erreur console à aucune étape.

- **2026-07-27 — Le siège de Hero dans le replayer affichait sa position (ex: "CO") au lieu de "Hero".**
  Fichier : `components/replayer/SeatView.tsx`.
  Bug préexistant, indépendant du changement d'auteur ci-dessous : le calcul du libellé de siège
  (`seat.playerName ?? straddleLabel ?? seat.position`) n'a jamais eu de cas spécifique pour Hero —
  ça ne se voyait pas parce que la main de démonstration (`data/testHand.ts`) avait "Hero" codé en
  dur comme `playerName` de son siège, masquant le problème. Toute main réellement créée via le
  formulaire (où Hero n'a jamais de `playerName`, cf. `creator/positions.ts`) retombait donc sur
  l'acronyme de position brut. Fix : `seat.isHero` vérifié en premier, retombe toujours sur "Hero"
  peu importe la position ou un éventuel nom personnalisé (que Hero n'a de toute façon jamais).
  Vérifié en créant une vraie main (position CO, cartes AK) : le siège du bas affiche bien "Hero",
  les autres gardent leur position (SB, UTG, BTN, HJ, BB). Aucune erreur console.

- **2026-07-27 — Le créateur de main utilise maintenant le vrai profil connecté comme auteur du post, au lieu de "Hero" en dur.**
  Fichiers : `creator/LiveHandCreator.tsx` (nouvelles props `authorId`/`authorName`, utilisées dans
  `finalize()` à la place des valeurs `'user-1'`/`'Hero'` codées en dur), `src/state/profile.tsx`
  (`useProfileStatus` renvoie maintenant aussi `displayName`, obtenu via la fonction SQL
  `get_display_name` déjà existante — un seul appel sert à la fois à savoir si le profil existe ET
  quel nom afficher), `App.tsx` (passe `authorId={session.user.id}` et
  `authorName={displayName}` au créateur).
  Ne touche pas au concept distinct de "Hero" DANS la main (le siège qui représente le narrateur
  dans le replayer) — seul le nom d'auteur affiché en haut du post change.
  Vérifié dans l'app : main créée avec le compte réel de l'utilisateur (pseudo `pokza_founder`) →
  le post publié affiche bien "pokza_founder" comme auteur (avatar "P"), plus "Hero". Aucune erreur
  console.

- **2026-07-27 — Structure de la base de données Supabase (`profiles`, `profiles_private`, `posts`) + écran "complète ton profil".**
  SQL exécuté par l'utilisateur dans le SQL Editor Supabase (pas de fichier de migration local pour
  l'instant) : table `profiles` (publique : pseudo unique, avatar_url, préférence d'affichage,
  format favori, fréquence de jeu) ; table `profiles_private` (prénom, nom, date de naissance —
  RLS strict "propriétaire uniquement", jamais exposée à qui que ce soit d'autre) ; fonction
  `get_display_name(profile_id)` en SECURITY DEFINER qui renvoie le pseudo ou "prénom nom" selon la
  préférence choisie, sans jamais exposer les colonnes brutes ni la date de naissance ; fonction
  `create_profile(...)` (SECURITY INVOKER) qui crée les deux lignes (`profiles` + `profiles_private`)
  en une seule transaction, pour ne jamais laisser un profil à moitié créé si une des deux échoue
  (ex: pseudo déjà pris). Table `posts` avec la main stockée en JSONB (pas de découpage relationnel,
  vu que sa forme évolue encore régulièrement).
  Nouveaux fichiers app : `src/state/profile.tsx` (`useProfileStatus`, sait si le compte courant a
  déjà un profil), `src/profile/CompleteProfileScreen.tsx` (formulaire pseudo/prénom/nom/préférence
  d'affichage/date de naissance/format favori/fréquence de jeu, avec rappel explicite que
  prénom+nom+date de naissance restent privés). `App.tsx` : après la session, si aucun profil
  n'existe encore pour ce compte, affiche cet écran avant le feed.
  Vérifié en conditions réelles (requêtes REST directes + parcours dans l'app) : `profiles` et
  `posts` lisibles publiquement (vides avant tout post/profil) ; `profiles_private` bien
  inaccessible via la clé anon (RLS). Un compte de test s'est vu proposer l'écran de complétion (pas
  encore de profil), a rempli le formulaire, et `create_profile` a bien inséré les deux lignes :
  `profiles` contient le pseudo/préférences en clair (vérifié via requête REST), `profiles_private`
  reste vide côté anon (donc bien caché), et `get_display_name` renvoie correctement "qa_tester".
  Aucune erreur console à aucune étape.

- **2026-07-27 — Ajout de la connexion joueurs (Supabase Auth) : écran login/signup, session persistée, gate sur toute l'app.**
  Nouveaux fichiers : `src/state/auth.tsx` (`AuthProvider`/`useAuth`, écoute `supabase.auth.onAuthStateChange`
  + `getSession()` au démarrage), `src/auth/AuthScreen.tsx` (email/mot de passe, bascule connexion/inscription,
  affiche les erreurs Supabase telles quelles). `App.tsx` : enveloppé dans `AuthProvider`, affiche
  `AuthScreen` tant qu'il n'y a pas de session, ajoute un bouton "Déconnexion" dans le feed.
  Vérifié en conditions réelles (pas de mock) : une inscription avec un email `@example.com` a été
  rejetée par Supabase lui-même ("Email address ... is invalid", domaine test connu) — preuve que la
  requête atteint bien l'API. La confirmation par email (activée par défaut) a vite buté sur la
  limite d'envoi du service email par défaut de Supabase ("rate limit exceeded") — désactivée pour le
  développement (dashboard Supabase > Authentication > Providers > Email), à réactiver avec un vrai
  fournisseur SMTP (ex. Resend) avant ouverture publique. Confirmation désactivée confirmée bien
  prise en compte : cycle complet vérifié — inscription → session immédiate (pas d'email à attendre)
  → feed affiché avec bouton "Déconnexion" → déconnexion → retour à l'écran de connexion. Aucune
  erreur console à aucune étape.

- **2026-07-27 — Rééquilibrage de taille entre le bouton play et les flèches précédent/suivant du replayer.**
  Fichier : `components/replayer/PlaybackControls.tsx`.
  Le bouton play (52px) paraissait plus petit visuellement que les flèches (44px) une fois leurs
  triangles pleins mis côte à côte. Premier réglage (60px/24) corrigé en place après retour
  utilisateur ("trop gros par rapport aux flèches") : flèches 44→40px (triangle 12/8→10/7), bouton
  play 52→54px. Icône play (▶) ensuite ajustée seule (20→24) car le triangle blanc paraissait un
  peu petit par rapport au jeton de 54px une fois celui-ci stabilisé.
  Vérifié dans le replayer : le bouton play reste le plus imposant des trois sans écraser les
  flèches à côté, et son triangle blanc remplit correctement le jeton.

- **2026-07-27 — Flèches précédent/suivant du replayer : triangle plein propre au lieu du glyphe texte ‹/›.**
  Fichier : `components/replayer/PlaybackControls.tsx`.
  Les glyphes texte `‹`/`›` rendaient fins et pas toujours bien centrés selon la police. Remplacés
  par un vrai triangle plein (astuce CSS des bordures : `View` de largeur/hauteur 0 avec une seule
  bordure colorée en blanc, les deux autres transparentes) — forme géométrique nette et identique
  partout, dans le jeton orange du bouton précédent/suivant.
  Vérifié dans le replayer : les deux boutons (actif et désactivé/pâle) affichent un triangle blanc
  bien plein et centré, cohérent avec le bouton play/pause central.

- **2026-07-24 — Quand des mains sont cachées jusqu'au showdown (`revealShowdown`), leur retournement (dos → face) est maintenant un step à part, distinct de "untel gagne le pot".**
  Fichiers : `engine/handEngine.ts` (`ReplayEvent.revealCards`, `HandState.cardsRevealed`),
  `components/replayer/HandReplayer.tsx` (`showCardBacks` suit `cardsRevealed`, plus `hasWinner`).
  Suite du fix précédent (le gagnant est déjà un step séparé de la dernière action) : quand
  `revealShowdown` est actif, le retournement des cartes cachées ARRIVAIT au même step que la
  désignation du gagnant — deux moments encore confondus.
  Fix : `buildReplayEvents` insère un event `{ kind: 'revealCards' }` entre la dernière
  action/révélation et l'event terminal `{ kind: 'showdown' }`, mais UNIQUEMENT si la main a
  effectivement une main adverse cachée à révéler (`revealShowdown` actif ET au moins un adversaire
  avec des cartes saisies) — sinon aucun step superflu n'est ajouté. `computeHandState` expose
  `cardsRevealed` (vrai dès l'event `revealCards`, ou `showdown` à défaut), et `showCardBacks` dans
  le replayer s'appuie dessus au lieu de `hasWinner` : les cartes se retournent un cran avant que
  le gagnant ne soit désigné.
  Vérifié avec 9 tests unitaires purs (event inséré seulement si pertinent, `cardsRevealed`/
  `winningSeatIds` distincts à chaque step) puis en replay réel : le step de la dernière action
  montre encore un dos de carte ; un clic plus loin, la main se retourne (nom toujours blanc, pot
  encore séparé) ; encore un clic, le nom passe en doré et le pot glisse vers le vainqueur — trois
  steps, trois moments.

- **2026-07-24 — Le segment "untel gagne" (jetons qui glissent vers le vainqueur) est maintenant un step à part entière, distinct de la dernière action de la main.**
  Fichier : `engine/handEngine.ts` (`ReplayEvent`, `buildReplayEvents`, `computeHandState`).
  Avant : `winningSeatIds` (et donc le style "vainqueur" + le glissement des jetons) se déterminait
  dès le step de la toute DERNIÈRE action ou révélation de la main — la dernière décision ("BB
  check", "Hero se couche"...) et "voilà qui gagne, les jetons partent vers lui" arrivaient donc
  dans le même clic, sans transition distincte.
  Fix : `buildReplayEvents` ajoute désormais un event terminal `{ kind: 'showdown' }` après toutes
  les actions/révélations — `computeHandState` ne détermine `winningSeatIds` qu'à ce step précis
  (`step >= totalSteps`, mécanisme déjà en place, simplement décalé d'un cran par ce nouvel event).
  `currentStreet` ne change pas sur ce dernier event (reste sur la dernière street jouée), et
  `lastEvent.kind !== 'action'` à ce step supprime naturellement toute bulle d'action (déjà géré
  par `HandReplayer.tsx`, aucun changement nécessaire côté replayer).
  Vérifié avec 5 tests unitaires purs (event terminal, +1 step, gagnant absent puis présent d'un
  cran à l'autre, `lastAction` toujours la vraie dernière action) puis en replay réel : le step du
  fold affiche encore le pot "177€" au centre, non attribué ; un clic "suivant" de plus fait glisser
  le pot vers le vainqueur (stack mis à jour) — deux clics, deux moments distincts.

- **2026-07-24 — Le % d'équité ne s'affiche pour PERSONNE (y compris Hero) dès qu'un adversaire du coup a les cartes cachées (`revealShowdown`).**
  Fichier : `components/replayer/HandReplayer.tsx`.
  Premier correctif insuffisant : il ne supprimait le % que pour le siège dont les cartes sont
  cachées, en laissant Hero afficher le sien normalement. Or l'équité est une comparaison ENTRE
  toutes les mains en lice — un chiffre n'a de sens que si on peut voir ce contre quoi il se
  compare ; l'afficher pour Hero (ou tout autre siège visible) pendant qu'au moins une main du même
  calcul reste secrète est tout aussi incohérent que de le montrer pour le siège caché lui-même.
  Fix : `equities` n'existe de toute façon que si TOUS les contendants ont des cartes connues (cf.
  `computeHandState`), donc dès que `hand.revealShowdown` est actif, au moins un adversaire du
  calcul est forcément caché tant que la main n'est pas résolue — condition simplifiée en
  `equityPct` supprimé pour TOUT le monde dès que `hand.revealShowdown` est vrai, plus seulement
  pour le siège individuellement caché.
  Vérifié sur la même main (Hero et un adversaire à tapis avant la river, cartes saisies, "Oui"
  activé) : aucun pourcentage n'apparaît nulle part sur la page, Hero ET l'adversaire affichent
  tous deux "ALL-IN".

- **2026-07-24 — Le % d'équité ne s'affiche plus pour un adversaire dont les cartes sont encore cachées (`revealShowdown`).**
  Fichier : `components/replayer/HandReplayer.tsx`.
  `computeHandState` calcule le % d'équité (tapis avant la river) à partir des VRAIES cartes de
  tous les contendants, sans se soucier de `hand.revealShowdown` — un adversaire dont les cartes
  sont censées rester cachées jusqu'au showdown aurait quand même affiché son % d'équité, révélant
  la force de sa main en clair pendant qu'elle est censée être secrète.
  Fix : `equityPct` passé à `SeatView` vaut `undefined` tant que ce siège affiche un dos de carte
  (`showCardBacks`), quel que soit le résultat déjà calculé par `computeHandState` — retombe sur
  "ALL-IN" (un fait neutre sur le stack, pas sur la main). Hero et les adversaires dont les cartes
  sont déjà visibles (revealShowdown désactivé, ou main résolue) ne sont pas concernés.
  Vérifié sur une main où Hero et un adversaire (cartes saisies, "Oui" activé) sont tous deux à
  tapis avant la river : au step juste après le tapis, l'adversaire affiche "ALL-IN" (pas de %)
  avec ses cartes toujours dos caché, tandis que Hero affiche bien son propre % d'équité ("85%") —
  un seul pourcentage visible sur toute la page.

- **2026-07-24 — Option pour contrôler QUAND une main adverse saisie à l'abattage devient visible dans le replay : dès le début, ou seulement au moment du showdown.**
  Fichiers : `types/poker.ts` (`Hand.revealShowdown`), `creator/steps/ShowdownStep.tsx`
  (interrupteur "Révéler les mains à l'abattage"), `creator/LiveHandCreator.tsx`,
  `components/replayer/HandReplayer.tsx` (`showFoldLabel`/`showCardBacks`, séparés),
  `components/replayer/SeatView.tsx` (nouvelle prop `showCardBacks`, distincte de `folded`).
  C'est le CRÉATEUR qui décide, pas le lecteur (pas de révélation interactive côté replay) : un
  seul interrupteur "Révéler les mains à l'abattage" (Oui/Non, défaut Non) sur l'étape Abattage,
  global à la main entière — pas par adversaire.
  - Désactivé (défaut) : les cartes saisies pour un adversaire sont visibles dans le replay dès le
    début, comme celles de Hero (gagnant ou perdant, jamais muckées).
  - Activé : ce siège garde ses cartes FACE CACHÉE (comme n'importe quel adversaire dont on ignore
    la main) PENDANT tout le coup, et elles se retournent face visible dès que la main se résout
    (showdown) — gagnant ou perdant. Hero n'est jamais concerné (toujours visible dès le départ) ;
    un adversaire dont les cartes n'ont pas été saisies reste mucké normalement s'il perd, quel que
    soit ce réglage.
  Deux itérations avant d'arriver là : la première mélangeait le libellé "fold" et l'opacité des
  cartes dans une seule prop `folded` de `SeatView`, faisant afficher "fold" à un adversaire
  toujours en jeu. La deuxième corrigeait ce libellé mais cachait encore les cartes en opacité 0
  (invisibles, comme un vrai mucking) au lieu de les montrer face cachée — aucun dos de carte
  visible pendant le coup, alors qu'un adversaire "inconnu" normal en affiche un. Fix final :
  `showCardBacks` ne touche ni à l'opacité ni au libellé, juste à la valeur passée à `CardView`
  (`undefined` → dos de carte, comme un adversaire inconnu) tant que la main n'est pas résolue ;
  la vraie carte apparaît d'un coup dès que la main se résout.
  Vérifié avec 10 tests unitaires purs (tous les croisements fold/hero/cartes connues/gagnant-
  perdant/réglage) puis en main réelle : l'adversaire affiche un dos de carte (identique à un
  adversaire inconnu) pendant tout le coup, sans jamais afficher "fold" ni disparaître, puis ses
  vraies cartes apparaissent d'un coup exactement au moment du showdown — testé pour une main
  gagnante et une main perdante.

- **2026-07-24 — Créateur : les raccourcis de relance préflop se basent sur le straddle (simple/double/triple) au lieu de la BB, quand il y en a un.**
  Fichier : `creator/steps/StreetStep.tsx`.
  Avec un straddle, le niveau à suivre au préflop n'est plus la BB mais le (dernier) straddle posté
  — les raccourcis "3BB/4BB/5BB/10BB" continuaient pourtant à multiplier la BB brute, donnant des
  montants sans rapport avec le niveau réel à suivre (ex : "3BB" à 15€ alors que suivre coûtait déjà
  20€ de double straddle).
  Fix : `preflopRaiseUnit` vaut `initialBetAmount` (déjà égal au montant du dernier straddle côté
  créateur) au lieu de `bb` dès qu'un straddle est en jeu (`firstToActAfterSeatId` défini,
  uniquement vrai en cas de straddle). Libellés ajustés en conséquence : "BB" serait un mensonge une
  fois le repère changé, remplacé par "x" générique ("3x" au lieu de "3BB") — comportement inchangé
  sans straddle.
  Vérifié sur une main 2/5 en double straddle (10/20) : les raccourcis affichent "3x 60€, 4x 80€,
  5x 100€, 10x 200€" (3/4/5/10 fois les 20€ du double straddle, pas les 5€ de BB).

- **2026-07-24 — Le(s) straddle(s) n'ont plus leur propre segment/bulle dans le replayer (comme SB/BB), et la dénomination du post affiche le straddle ("Cash game 5/10/25").**
  Fichiers : `engine/handEngine.ts` (`initialReplayStep`), `components/post/PostCard.tsx`
  (`formatContextLine`).
  Poster un straddle (simple/double/triple) n'est pas plus une décision du joueur que poster la
  SB/BB — `initialReplayStep` skippait déjà `post-sb`/`post-bb` au tout début du replay (pas de
  bulle "SB poste (2€)", les jetons apparaissent déjà postés dès la première frame) ; `post-straddle`
  rejoint maintenant cette liste. Le replay démarre directement à la première vraie décision (ex :
  "HJ se couche"), et le nombre de segments dans la barre de progression diminue d'autant —
  `computeHandState` incluait déjà tous les events jusqu'au step courant (skippés ou non), donc les
  stacks/pot reflètent le straddle dès la première frame sans changement nécessaire là.
  Par ailleurs, `formatContextLine` (ligne "Cash game · X/Y" sous la date) ajoute maintenant le(s)
  montant(s) de straddle après la BB, dans l'ordre ("5/10" → "5/10/25" pour un simple straddle à
  25 ; double/triple ajouteraient chacun leur montant).
  Vérifié en publiant une main 5/10 avec straddle simple à 25 : le sous-titre affiche "Cash game ·
  5/10/25", et le premier step navigable du replay est "HJ se couche" (le straddleur a déjà 975€ et
  le pot affiche déjà 40€ dès la première frame, sans bulle "Straddle poste (25€)" dédiée).

- **2026-07-23 — Créateur : dans "Ta position", le(s) chip(s) straddleur(s) s'affichent en dernier plutôt qu'en premier.**
  Fichier : `creator/steps/ContextStep.tsx` (`positionChipOrder`, nouveau).
  Plus logique visuellement : un straddle est perçu comme un "ajout" à la table plutôt que la
  position de référence, il n'a donc pas à occuper le premier créneau de la liste.
  Fix : `positionChipOrder` réordonne `availablePositions` en déplaçant les `straddleCount`
  premiers rangs (ceux qui deviennent Straddle/Double straddle/Triple straddle) à la fin, en
  conservant l'ordre relatif du reste — utilisé UNIQUEMENT pour l'affichage des chips "Ta
  position" (l'ordre réel d'action préflop `availablePositions`, utilisé partout ailleurs — liste
  "Joueurs", assignation des straddleurs, ordre d'action du créateur/replayer — reste inchangé).
  Vérifié sur une main 9-max en double straddle : les chips "Ta position" affichent "UTG, LJ, HJ,
  CO, BTN, SB, BB, Straddle, Double straddle" (au lieu de "Straddle, Double straddle, UTG,
  LJ..."), et cliquer sur le chip "Straddle" affecte bien Hero à ce siège (la liste "Joueurs"
  affiche alors "Straddle (toi)").

- **2026-07-23 — Le siège straddleur n'est plus le "premier parleur" : la position UTG (family UTG/UTG1/UTG2) se décale pour repartir du vrai premier parleur une fois le straddle posté.**
  Fichiers : `engine/handEngine.ts` (`straddleAwarePositionLabel`, `straddleSeatLabel` — signature
  changée), `components/replayer/HandReplayer.tsx`, `creator/steps/StreetStep.tsx`,
  `creator/steps/ShowdownStep.tsx` (+ nouvelle prop `seats`), `creator/LiveHandCreator.tsx`,
  `creator/steps/ContextStep.tsx`.
  Constat : "Straddle" est une position relative au siège APRÈS la BB (fait de placement à table),
  pas au premier à parler (fait d'action) — le straddleur poste une mise forcée mais agit en
  DERNIER préflop (déjà correct). Donc le nom "UTG" (qui désigne justement "premier à parler")
  devient disponible pour le siège suivant. Sur une table 7-9 joueurs, ce siège suivant s'appelait
  UTG1 (ou UTG2) — il doit récupérer le nom UTG, et tout le reste de la "famille" UTG/UTG1/UTG2 se
  décale d'un cran en cascade. LJ/HJ/CO/BTN/SB/BB sont des noms fixes relatifs au BOUTON : ils ne
  bougent jamais, peu importe le straddle.
  Fix : `straddleAwarePositionLabel(orderedPositions, rank, straddleCount)` — fonction pure
  (aucune dépendance à `Seat`/`Action`) qui centralise cette règle ; réutilisée à la fois par
  `straddleSeatLabel` (une fois les actions connues) et par `ContextStep.tsx` (avant, à partir du
  seul rang dans l'ordre des positions). `straddleSeatLabel` prend maintenant `seats` en plus
  d'`actions` (le rang d'un siège dans l'ordre d'action préflop = son index dans `hand.seats`, qui
  est TOUJOURS dans cet ordre depuis `buildSeats` — mais faux si on lui passe un sous-ensemble
  filtré, d'où le nouveau prop `seats` sur `ShowdownStep`, qui n'avait jusqu'ici que `villains`).
  Vérifié avec 9 tests unitaires purs (6/7/8/9-max, straddle simple/double/triple, cas sans famille
  UTG) puis en créant une main 9-max avec straddle simple : le formulaire ET le replayer publié
  affichent "Straddle, UTG, UTG1, LJ, HJ, CO, BTN, SB, BB" (au lieu de "Straddle, UTG1, UTG2, LJ,
  HJ..."), et "UTG agit" (le nouveau) est bien le premier joueur à devoir prendre une vraie
  décision, pas le straddleur.

- **2026-07-23 — Le libellé "Straddle" (fix précédent) manquait encore à l'étape 1/7 du créateur (le formulaire "Contexte") — corrigé.**
  Fichier : `creator/steps/ContextStep.tsx`, `engine/handEngine.ts` (`straddleRankLabel`, extrait).
  Cause : le fix précédent couvrait tout ce qui s'affiche APRÈS que les actions de straddle existent
  (généré à l'étape "Contexte" → "Cartes"), mais la liste "Ta position" et "Joueurs (nom et stack)"
  s'affichent sur l'étape "Contexte" ELLE-MÊME, avant que ces actions n'existent — donc toujours
  "UTG"/"HJ" bruts, même juste après avoir sélectionné Simple/Double/Triple straddle sur ce même
  écran.
  Fix : `straddleRankLabel(rank)` extrait de `straddleSeatLabel` (même tableau de libellés, partagé
  pour rester synchronisé) ; `ContextStep` calcule directement le rang d'une position dans
  `availablePositions` (= l'ordre d'action préflop, déjà exactement l'ordre utilisé pour assigner
  les straddleurs dans `LiveHandCreator.tsx`) sans attendre que les actions existent.
  Vérifié : double straddle sur une main 6-max 2/5 → les chips "Ta position" affichent "Straddle" /
  "Double straddle" / CO / BTN / SB / BB (au lieu de "UTG" / "HJ" / ...), et la liste "Joueurs"
  reprend les mêmes libellés en lignes.

- **2026-07-23 — Quand un straddle est configuré, le(s) siège(s) concerné(s) s'affichent "Straddle" (/"Double straddle"/"Triple straddle") au lieu de l'acronyme de position brut (UTG, HJ...).**
  Fichiers : `engine/handEngine.ts` (`straddleSeatLabel`, nouveau, exporté), `components/replayer/SeatView.tsx`
  (`straddleLabel`), `components/replayer/HandReplayer.tsx`, `creator/steps/StreetStep.tsx`,
  `creator/steps/ShowdownStep.tsx`, `creator/LiveHandCreator.tsx`.
  Avant : le badge de siège (créateur ET replayer) et le "qui agit" affichaient toujours
  `playerName ?? position` — un siège straddleur restait "UTG" même une fois le straddle configuré,
  ce qui masquait visuellement son rôle particulier (mise forcée, agit en dernier).
  Fix : `straddleSeatLabel(actions, seatId)` (nouveau helper partagé) retourne "Straddle" / "Double
  straddle" / "Triple straddle" selon le rang du siège parmi les `post-straddle` de la main, sinon
  `null`. Branché comme fallback ENTRE `playerName` et `position` (`playerName ?? straddleSeatLabel
  ?? position`) partout où un siège est affiché sans nom personnalisé : badge du replayer, actions
  "qui agit"/résumé du créateur, onglets de l'abattage. La bulle d'action du straddle lui-même
  ("Straddle poste (10€)") a été ajustée pour ne pas répéter le mot ("Straddle straddle (10€)")
  quand le siège n'a pas de nom personnalisé — sinon (nom personnalisé), la phrase garde le mot
  ("Marco_75 straddle (10€)").
  Vérifié en créant une main 2/5 avec straddle simple : le créateur affiche "Straddle 490€" (au lieu
  de "UTG 490€") dans la liste des stacks et l'abattage, et le replayer publié affiche le badge de
  siège "Straddle" ainsi que la bulle "Straddle poste (10€)".

- **2026-07-23 — Créateur : possibilité de double straddle et triple straddle (cash game uniquement).**
  Fichiers : `creator/types.ts` (`straddleCount`), `creator/steps/ContextStep.tsx`,
  `creator/LiveHandCreator.tsx`, `engine/handEngine.ts` (`describeAction`).
  Avant : un seul straddle possible (booléen `straddle`), posté par le premier joueur à parler
  préflop. Remplacé par `straddleCount: 0 | 1 | 2 | 3` (Aucun/Simple/Double/Triple) : chaque
  straddle successif est posté par le joueur suivant dans l'ordre d'action préflop, à 2x le
  montant du précédent (convention standard : straddle 2x BB, double 4x BB, triple 8x BB — le
  premier montant reste éditable). Le niveau à suivre et la reprise de l'action après le
  DERNIER straddleur (qui garde l'option, comme la BB normalement) fonctionnaient déjà pour un
  straddle simple (`getActingOrderAfter`) et se généralisent sans changement au double/triple —
  seul le nombre d'actions `post-straddle` à générer et le calcul du montant de chacune ont
  changé. `describeAction` distingue maintenant "straddle" / "double straddle" / "triple
  straddle" dans le replay selon le rang de l'action parmi les post-straddle de la main.
  Vérifié en créant une main 2/5 avec double straddle (UTG 10€, HJ 20€) : l'ordre d'action
  préflop reprend bien à Hero (CO) après HJ, revient à UTG puis HJ pour leur option de relance
  après que les autres foldent, et le replay affiche "UTG straddle (10€)" puis "HJ double
  straddle (20€)" comme deux callouts distincts.

- **2026-07-23 — Blindes fractionnaires (ex : 0.2/0.4) : le pot s'affichait avec des résidus flottants ("0.600000000001€") — corrigé.**
  Fichiers : `utils/chipFormat.ts` (`roundMoney`), `engine/handEngine.ts` (`computeHandState`),
  `components/replayer/BoardView.tsx` (`potShares`).
  Cause : classique erreur d'addition flottante JS (`0.2 + 0.4 === 0.6000000000000001`) — le pot et
  les stacks cash sont des sommes de montants réels potentiellement fractionnaires, jamais
  ré-arrondis avant affichage. Un second bug, lié, existait dans le partage d'un split pot :
  `potShares` distribuait le reste comme s'il s'agissait toujours de jetons entiers (logique
  correcte en tournoi), ce qui aurait cassé un split pot fractionnaire en cash (ex : pot 0.6€ à
  partager en 2 aurait donné "1€"/"0€" au lieu de "0.3€"/"0.3€").
  Fix : `roundMoney(n)` (arrondi au centime) ajouté à `chipFormat.ts`, appliqué dans
  `formatChipAmount` (branche cash) et à l'accumulation du pot/des stacks dans `computeHandState` —
  sans effet sur les jetons de tournoi (déjà entiers). `potShares` rendu conscient du `gameType` :
  arithmétique en centimes entiers pour le cash (au lieu de jetons entiers), inchangée pour le
  tournoi.
  Vérifié : main de test 0.2/0.4 (SB complète, tout check jusqu'à river, chop) — le pot affiche
  proprement "Pot 0.6€" à l'étape intermédiaire (juste après les blindes, avant tout arrondi) puis
  "Pot 0.8€" en fin de main, et le split pot se répartit exactement en "0.4€"/"0.4€" pour chaque
  gagnant (confirmé via lecture directe du DOM, pas seulement visuellement) — plus aucun résidu
  flottant, aucune perte de centime.

- **2026-07-23 — Créateur : impossible de saisir une blinde (ou tout autre montant) inférieure à 1 — corrigé.**
  Fichier : `creator/steps/ContextStep.tsx`.
  Cause : les champs SB/BB/ante/straddle/stack étaient des `TextInput` contrôlés directement par
  `String(nombre)`, mis à jour via `Number(texte) || 0` — un classique piège de saisie décimale :
  taper "0." donne `Number("0.")=0`, réaffiché "0", le point tapé disparaît aussitôt ; impossible
  de taper "0,25" caractère par caractère (ça finissait en "25"). Ne touchait pas qu'aux blindes :
  les 6 champs numériques de cet écran avaient exactement le même défaut.
  Fix : `DecimalTextInput` (+ `OptionalDecimalTextInput` pour le stack par siège, où un champ vidé
  doit revenir à "pas de valeur" plutôt qu'à 0) — garde le texte tapé comme état local propre à
  l'input, ne le resynchronise depuis la valeur numérique que si elle change de source EXTÉRIEURE
  (preset cliqué), jamais en écho de sa propre frappe. Virgule française acceptée en plus du point.
  `keyboardType` passé à `decimal-pad` (clavier avec point décimal sur mobile).
  Vérifié : "0.42" et "0,33" tapés caractère par caractère dans le champ SB s'affichent
  correctement sans être tronqués. Les raccourcis de blindes cash restent inchangés
  (1/2, 1/3, 2/5, 5/10) — la demande portait uniquement sur la saisie libre, pas sur les presets.

- **2026-07-23 — Créateur : impossible d'annuler la création d'une main dès la première étape — corrigé.**
  Fichiers : `creator/steps/ContextStep.tsx`, `creator/LiveHandCreator.tsx`.
  Cause : `LiveHandCreator` gère déjà l'annulation (`goBack()` appelle `onCancel()` quand
  l'historique est vide, donc dès la première étape) mais `ContextStep` — la toute première étape
  du wizard — n'acceptait ni ne transmettait de prop `onBack` à `WizardScreen` : le bouton "‹
  Retour" ne s'affichait tout simplement jamais sur cet écran précis, alors que la logique
  d'annulation existait déjà et fonctionnait sur toutes les AUTRES étapes.
  Fix : `onBack` ajouté aux props de `ContextStep` (transmis à `WizardScreen`), et
  `onBack={goBack}` branché sur son instanciation dans `LiveHandCreator`.
  Vérifié : le bouton "‹ Retour" apparaît maintenant dès l'étape 1/7, et y cliquer ramène bien au
  feed.

- **2026-07-23 — Engine + Replayer : les split pots (égalité exacte) partagent réellement le pot entre tous les gagnants au lieu d'en choisir un seul arbitrairement.**
  Fichiers : `engine/handEvaluator.ts` (`bestHandWinners`, partagé), `engine/handEngine.ts`
  (`determineWinner` → `string[]`, `HandState.winningSeatIds`), `components/replayer/BoardView.tsx`
  (refonte : N parts du pot au lieu d'une), `components/replayer/HandReplayer.tsx`.
  C'était une limitation documentée depuis la mise en place du showdown : en cas d'égalité exacte,
  `determineWinner` retournait le premier gagnant trouvé, les autres perdant silencieusement leur
  part. Extrait la logique de départage (déjà correcte et dupliquée dans `equity.ts`) vers
  `bestHandWinners`, une seule implémentation réutilisée par les deux. `HandState.winningSeatId`
  (singulier) devient `winningSeatIds: string[]` (vide si indéterminé) — tous les usages en aval
  adaptés (`isWinner`/mucking via `.includes()`, cible du jeton de chaque siège = le gagnant le
  plus proche pour ne pas fragmenter un petit tas de jetons entre plusieurs directions).
  `BoardView` n'anime plus UNE pastille vers UN point : elle en anime une par gagnant, chacune
  affichant SA part exacte du pot (répartition entière, le reste va aux premiers de la liste —
  aucun jeton perdu par arrondi), chacune filant vers son propre gagnant.
  Vérifié par 5 cas unitaires (chop à 3 sur board qui joue, split à 2 par égalité de kickers,
  non-régression sur un cas sans égalité, bout en bout via `computeHandState`) puis en navigateur
  sur une vraie main split : les deux joueurs gagnants restent affichés (aucun ne mucke), et le pot
  (24€) se scinde bien en deux pastilles "Pot 12€" distinctes, chacune arrivant sur son propre
  gagnant.

- **2026-07-22 — Replayer : la carte qui tombe et la première décision de la street sont maintenant deux temps distincts (pas le même step).**
  Fichiers : `engine/handEngine.ts` (refonte du modèle de steps), `components/replayer/HandReplayer.tsx`.
  Avant, changer de street ET appliquer la première action de cette street se faisaient dans le
  MÊME step — trop brutal ("la turn tombe" et "SB check" en même temps). Le replay est maintenant
  reconstruit comme une suite d'ÉVÉNEMENTS (`buildReplayEvents`) plutôt qu'une simple liste
  d'actions : un changement de street insère un événement "reveal" AVANT la première action de
  cette street — aussi bien pour une transition normale qu'un run-out en fin de main (même
  mécanisme, unifié). `currentStreet` avance désormais à CHAQUE événement (reveal ou action), ce
  qui élimine au passage l'ancien double système `currentStreet`/`displayStreet` (une seule
  source de vérité maintenant, qui pilote à la fois le libellé et les mises "en cours" — les
  jetons de la street précédente repartent au pot dès la révélation, pas seulement à la première
  action suivante).
  Vérifié par 13 cas unitaires (position exacte des reveals, séparation stricte des deux temps,
  board/mises qui avancent au bon moment, main de fold-out toujours résolue correctement) puis en
  navigateur : au flop, le segment avance et le board se met à jour, jetons déjà nettoyés au pot ;
  le pas suivant affiche "BB check" séparément.
  Retouche le même jour : les bulles "Le flop tombe"/"La turn tombe"/"La river tombe" ajoutées pour
  l'event reveal ont été retirées sur retour utilisateur (pas utiles) — l'event reste un step à
  part entière (le segment avance, board/mises se mettent à jour) mais sans texte affiché ; la
  bulle centrale ne s'affiche plus que pour les vraies actions.

- **2026-07-22 — Replayer : devise (€) accolée aux montants en cash game (pas en tournoi, pas en mode BB).**
  Fichier : `utils/chipFormat.ts`.
  `formatChipAmount` accole maintenant "€" à tout montant cash game affiché tel quel ("10" → "10€"),
  sauf en mode BB (déjà une unité explicite) ou en tournoi (jetons, pas de l'argent réel — garde
  son format "k" existant). Devise câblée en dur (`CASH_CURRENCY_SYMBOL`) plutôt qu'un sélecteur —
  une seule devise pour l'instant par choix explicite, un sélecteur pourra remplacer cette constante
  plus tard sans toucher au reste.
  Vérifié : stacks/mises/pot affichent bien "500€", "5€", "Pot 7€" en cash ; bascule en BB → aucune
  devise mélangée ("100 bb", pas "100€ bb").

- **2026-07-22 — Replayer : à la fin de la main, le(s) perdant(s) mucke(nt) leurs cartes (même animation qu'un fold).**
  Fichier : `components/replayer/HandReplayer.tsx`.
  Auparavant, un siège qui allait au showdown et perdait gardait ses cartes visibles indéfiniment
  après la résolution — seul un fold EN COURS de main les cachait. Le `folded` passé à `SeatView`
  inclut maintenant aussi : main résolue (`winningSeatId` non nul) ET ce siège n'est pas le
  vainqueur — réutilise directement l'animation de fold existante (fondu + léger décalage),
  aucune nouvelle animation à écrire. Le vainqueur seul garde ses cartes visibles.
  Vérifié sur une main de test (showdown check-down) : les deux joueurs gardent leurs cartes
  visibles tout du long de la main, puis à la toute fin, le perdant mucke (fold) pendant que le
  vainqueur garde sa main affichée avec le pot qui arrive sur lui.

- **2026-07-22 — Replayer : % d'équité affiché quand la main part à tapis avant la river.**
  Fichiers : `engine/equity.ts` (nouveau), `engine/handEngine.ts` (`equities`),
  `components/replayer/{HandReplayer,SeatView}.tsx`.
  `computeEquity` évalue chaque contendant sur l'ensemble des run-outs possibles étant donné leurs
  cartes connues et le board actuel : énumération EXACTE quand il reste ≤2 cartes à distribuer
  (turn/river déjà là, ≤1035 combinaisons), simulation Monte Carlo (2000 tirages) sinon (préflop/
  flop, où les ~1,7M combinaisons exactes seraient trop coûteuses côté client). Une main tirée à
  plusieurs sur un run-out donné partage la part également entre les gagnants.
  Déclenché dans `computeHandState` uniquement quand : plus aucune vraie action possible (steps de
  run-out), board incomplet, main non résolue, et 2+ joueurs encore en lice avec cartes connues —
  couvre le cas visé (tapis) sans ajouter de champ dédié "isAllIn" à la condition, puisque ces
  critères ne peuvent être réunis QUE via un tapis. `SeatView` affiche le %, à la place du texte
  ALL-IN/stack habituel (même emplacement, pas d'espace supplémentaire) ; revient automatiquement
  à ALL-IN une fois la main résolue.
  Vérifié : 8 cas unitaires (main à cartes déterministe 100/0, deux références préflop connues —
  AA vs KK ~82%, AK vs QQ ~54,5% — dans la tolérance Monte Carlo, sommes à 100% exactes en
  énumération, et un cas 3-way recalculé à la main carte par carte confirmant 80,95% pile). Puis
  bout en bout sur une main de test (tapis préflop A9s vs KQo) : équité affichée et mise à jour
  correctement à chaque street du run-out (63/38 préflop → 98/2 au flop après le flop favorable →
  95/5 au turn), et disparaît bien au river une fois le vainqueur déterminé.

- **2026-07-22 — Replayer : option d'affichage des montants en BB, mémorisée pour tout le feed.**
  Fichiers : `state/displayUnit.tsx` (nouveau), `utils/chipFormat.ts`, `engine/handEngine.ts`
  (`describeAction`), `components/replayer/{PlaybackControls,HandReplayer,SeatView,BoardView,ChipsView}.tsx`,
  `App.tsx`.
  Un seul état partagé (`DisplayUnitProvider`, monté à la racine de l'app) plutôt qu'un état par
  replayer : le choix fait sur un post s'applique immédiatement à tous les autres, présents et à
  venir dans le feed. `formatChipAmount` accepte maintenant un `bbOptions` optionnel ({bb, useBB})
  qui convertit n'importe quel montant en grosses blindes (1 décimale, zéro superflu coupé — ex :
  500 avec BB=5 → "100 bb", 7 → "1,4 bb"), sans toucher au format "k" existant pour les tournois.
  Petit toggle "BB" ajouté à côté du libellé de street dans `PlaybackControls`, appliqué à trois
  endroits : stack sous chaque siège, mise affichée (jeton + bulle d'action "X relance à Y"), et
  pastille du pot.
  Vérifié : bascule sur un post → stacks/mises/pot du MÊME post convertis en bb, ET confirmé par
  requête DOM que le second post du feed (contexte partagé) affiche exactement les mêmes valeurs
  bb sans avoir été touché directement.

- **2026-07-22 — Replayer : le libellé de street (PRÉFLOP/FLOP/TURN/RIVER) restait figé sur la dernière street jouée pendant le run-out — corrigé.**
  Fichiers : `engine/handEngine.ts` (`displayStreet`), `components/replayer/HandReplayer.tsx`.
  Cause : le libellé lisait `state.currentStreet`, dérivé de la street de la dernière VRAIE action —
  qui se fige dès la fin des actions (mécanisme de run-out déjà rencontré pour d'autres bugs de ce
  jour). Résultat : un tapis au flop, par exemple, laissait le libellé bloqué sur "Flop" même une
  fois le turn et la river révélés. `displayStreetIndex` (déjà calculé, sert à afficher les bonnes
  cartes du board) avance correctement pendant le run-out — il manquait juste une street "affichée"
  distincte de la street "de mise" (`currentStreet`, qui doit elle rester figée : c'est ce qui pilote
  correctement `streetContribution`). Ajout de `displayStreet` dans `HandState`, branché sur le
  libellé à la place de `currentStreet`.
  Vérifié avec la main de test all-in preflop : le libellé passe bien Préflop→Flop→Turn→River au
  fil des trois steps de run-out, jusqu'à la fin de la main.

- **2026-07-22 — Replayer : animation ALL-IN en rouge quand un joueur part à tapis.**
  Fichiers : `engine/handEngine.ts` (`allInSeatIds` + `describeAction`), `components/replayer/SeatView.tsx`,
  `components/replayer/ActionCallout.tsx`, `components/replayer/HandReplayer.tsx`.
  Détection basée sur le stack cumulé plutôt qu'un type d'action dédié (le modèle n'en a pas) :
  `allInSeatIds` (nouveau champ de `HandState`) marque tout siège non couché dont le stack atteint
  0 — couvre bet/call/raise ET une blinde postée avec un stack déjà très court. Persiste jusqu'à la
  fin de la main (comme `foldedSeatIds`).
  Trois signaux réutilisant le langage visuel existant plutôt qu'un nouveau composant :
  1. Halo rouge fixe autour du badge (remplace le halo doré "à toi de jouer" pour ce siège — les
     deux ne peuvent pas coexister, un siège à tapis ne rejoue plus) + un pop ponctuel du badge à
     l'instant du tapis (même ressort que le bounce du vainqueur, réutilisé sans conflit possible).
  2. Le stack affiché ("X bb") est remplacé par "ALL-IN" en rouge tant que le siège y reste.
  3. La bulle d'action centrale passe en rouge et ajoute "— ALL-IN" à la description normale
     (`describeAction` accepte un flag optionnel), uniquement pour L'action précise qui vide le
     stack — pas pour les steps suivants qui repointent sur la même action (run-out).
  Vérifié avec une main de test (short stack all-in preflop contre un stack profond) : halo rouge +
  "ALL-IN" sur le siège concerné, jeton de mise correctement affiché, et bulle d'action confirmée
  par requête DOM ("ShortStack relance à 20 — ALL-IN", texte blanc sur fond rouge).

- **2026-07-22 — Replayer : bouton donneur (BTN) affiché à côté du siège concerné.**
  Fichier : `components/replayer/SeatView.tsx`.
  Petit disque blanc "D" (bordure continue, contrairement au pointillé des jetons de mise, pour
  bien le distinguer visuellement d'un jeton misé) affiché en permanence sur le siège dont
  `position === 'BTN'`, sans dépendre du fold/de l'action en cours — c'est un repère de place à
  table, pas un élément lié à la main. Même principe géométrique que le jeton (sortie du bloc
  siège dérivée de la direction réelle, pas un décalage fixe à l'écran) mais PERPENDICULAIRE à la
  direction vers le centre plutôt que vers le centre : le bouton se pose sur le côté du siège,
  jamais sur le trajet du jeton ni sur le board.
  Vérifié : reste bien positionné, sans chevauchement, du début à la fin de la main (y compris
  après le fold du siège BTN et une fois le board complet).
  Correction du même jour : le bouton apparaissait du côté du siège PRÉCÉDENT (CO) plutôt que du
  suivant (SB) dans l'ordre de jeu — signe de la perpendiculaire inversé (`(dirY, -dirX)` au lieu
  de `(-dirY, dirX)`, pour suivre le sens des sièges croissant dans `layoutSeats`). Revérifié : le
  bouton se pose maintenant bien entre BTN et SB, du bon côté.
  Seconde correction : un décalage purement perpendiculaire laisse le bouton au même "rayon" que le
  siège lui-même — trop près du rail sur un siège excentré. Ajout d'une composante vers le centre
  (`BTN_INWARD_NUDGE`, direction déjà calculée pour le jeton) pour le ramener sur le feutre sans
  changer de côté — affinée en deux temps (16 puis 40, sur retour visuel de l'utilisateur avec une
  image de référence d'un autre replayer) jusqu'à une position bien avancée sur le feutre.

- **2026-07-22 — Replayer : les jetons qui filent vers le vainqueur dépassaient la table au lieu de s'arrêter dessus — corrigé.**
  Fichier : `components/replayer/SeatView.tsx`.
  Cause : le trajet pot→vainqueur (`winnerSlideAnim`, ajouté plus tôt aujourd'hui) est un décalage
  calculé DEPUIS le pot (`restLocal`), en supposant que le premier trajet siège→pot (`slideAnim`)
  est déjà arrivé. Mais pour le siège qui mise sur la toute dernière street jouée, `currentStreet`
  se fige dès la fin de la main (steps de run-out, cf. `handEngine`) et son `currentBet` ne retombe
  donc jamais à zéro — le premier trajet ne se déclenche jamais, le jeton reste devant le siège.
  Le second segment partait alors de ce point resté faux au lieu du pot, et la somme des deux
  trajets envoyait le jeton bien au-delà du vainqueur, hors de la table.
  Fix : `slideAnim.setValue(1)` (jeton forcé au pot, sans animation) juste avant de lancer le
  second trajet — sans effet si le jeton y était déjà (cas normal), corrige uniquement le cas où
  il ne l'était pas.
  Vérifié : main de test (Marco gagne par fold, son jeton de mise 70 sur le turn était le cas
  reproductible) — le jeton et la pastille du pot s'arrêtent maintenant proprement sur lui, plus
  aucun dépassement de la table.

- **2026-07-22 — Replayer : les segments de progression (au-dessus des boutons play/flèches) sont cliquables pour sauter directement à ce point de la main.**
  Fichiers : `components/replayer/PlaybackControls.tsx`, `components/replayer/HandReplayer.tsx`.
  Chaque segment est maintenant un `Pressable` (zone tactile élargie par `paddingVertical` autour
  de la barre de 3px, sans changer son apparence) qui appelle `onSeek(index)`. `HandReplayer`
  traduit l'index relatif du segment en step absolu (`initialStep + index + 1`) et met en pause
  l'autoplay, exactement comme le font déjà les flèches précédent/suivant.
  Vérifié dans le navigateur : clic sur un segment du milieu → saute au bon point (bon board, bon
  pot, bonne action affichée) ; clic sur le dernier segment → va jusqu'à la fin (main gagnée par
  Marco) ; clic sur un segment précoce → revient en arrière jusqu'au préflop correspondant. Les
  deux sens (avancer/reculer) fonctionnent, en plus du bouton play et des flèches existantes.

- **2026-07-22 — Engine : au showdown, un joueur dont les cartes ne sont pas renseignées est traité comme perdant (exclu), pas comme "main indéterminable".**
  Fichier : `engine/handEngine.ts` (`determineWinner`).
  Avant : si UN SEUL joueur non couché au showdown n'avait pas ses cartes renseignées (créateur
  n'ayant rempli que certains villains), toute la main devenait indéterminable (`null`) — aucun
  vainqueur, donc ni la pastille du pot ni les jetons ne bougeaient, même si 3 des 4 joueurs
  avaient des cartes connues et comparables.
  Désormais, `contenders` filtre aux seuls sièges non couchés dont les cartes sont connues ; le
  meilleur parmi EUX gagne (une main inconnue = non montrée = ne peut pas remporter le pot, comme
  une main "mucked" en vrai poker). Seul le cas où PERSONNE n'a de cartes connues reste `null`.
  Vérifié par 4 cas unitaires : 3 connus/1 inconnu → le meilleur des 3 gagne (l'inconnu perd même
  s'il aurait pu tenir la main gagnante, invisible pour l'app) ; tous inconnus → `null` ; un seul
  connu → gagne par défaut.

- **2026-07-22 — Engine : le showdown détermine un vrai vainqueur par la force des mains (pas seulement par élimination sur fold).**
  Fichiers : `engine/handEvaluator.ts` (nouveau), `engine/handEngine.ts` (`determineWinner`).
  Avant : `determineWinner` ne gérait que le cas "un seul joueur pas couché → il gagne" ; dès que
  2+ joueurs allaient au showdown, `winningSeatId` restait `null` pour toujours (donc ni la pastille
  du pot, ni les jetons du milieu, ne se déplaçaient jamais vers un vainqueur de showdown — la
  fonctionnalité posée hier ne fonctionnait que pour les mains qui se terminent par un fold).
  `handEvaluator.ts` évalue une main de 7 cartes (2 en main + 5 au board) en testant les C(7,5)=21
  combinaisons de 5 cartes, et retourne un rang comparable `[catégorie, ...départages]` (quinte
  flush en haut, carte haute en bas, avec gestion de la quinte basse A-2-3-4-5). `determineWinner`
  compare les mains de tous les joueurs encore en lice quand le board est complet ET que leurs
  cartes sont toutes connues (sinon `null`, indéterminable). Égalité exacte (split pot) : renvoie
  le premier trouvé — le partage réel du pot entre plusieurs gagnants n'est pas géré, à faire si
  le besoin se présente.
  Vérifié : 16 cas unitaires (une catégorie de main par test + comparaisons, quinte basse, égalité)
  tous corrects ; puis bout en bout via une main de test heads-up jouée jusqu'à la river (check
  partout, deux paires vs paire de rois) — `computeHandState` résout le bon vainqueur, ET en
  vérification visuelle dans le replayer, la pastille du pot + le jeton du siège gagnant glissent
  tous les deux correctement jusqu'à lui (même mécanisme que pour un fold, aucune régression).

- **2026-07-22 — Replayer : en fin de main, les jetons "au pot" (pas seulement la pastille "Pot X") glissent aussi vers le vainqueur.**
  Fichiers : `components/replayer/HandReplayer.tsx`, `components/replayer/SeatView.tsx`.
  Avant : seule la pastille "Pot X" (`BoardView`) se déplaçait vers le siège gagnant ; les petits
  tas de jetons de chaque siège, déjà glissés au pot au fil des streets, restaient immobiles.
  `HandReplayer` calcule maintenant `winnerSeatPos` (coordonnées ABSOLUES du siège gagnant, même
  source que le calcul existant pour `BoardView`) et le transmet à chaque `SeatView`. Un second
  segment d'animation (`winnerSlideAnim`) part du point de repos (au pot) vers ce siège, ne
  s'active que si le siège a encore un tas affiché (`displayBet`), et s'additionne simplement au
  premier segment (siège→pot) puisque les deux sont exprimés dans le même repère local.
  Vérifié : la pastille du pot arrive bien sur le vainqueur (comportement déjà existant, inchangé),
  aucun jeton ne reste visible ailleurs sur le tapis une fois la main terminée. Limite de la main de
  test : elle se termine par un fold en cours de street (pas un vrai showdown), donc la mise du
  dernier miseur ne rejoint jamais le pot avant la fin (bug préexistant, indépendant de ce fix, lié
  au fait que `currentStreet` se fige pendant le run-out) — le mouvement pot→vainqueur est donc
  surtout visible sur les jetons des sièges qui ont foldé plus tôt, pas testable finement sur celui
  du gagnant avec ces données précises.

- **2026-07-21 — Feed : description de post, limitée à 600 caractères, avec troncature "… voir plus" en fin de 3e ligne.**
  Fichiers : `theme/theme.ts`, `types/poker.ts`, `creator/types.ts` (`DESCRIPTION_MAX_LENGTH`),
  `creator/steps/ReviewStep.tsx` (champ + compteur live), `creator/LiveHandCreator.tsx`,
  `components/post/PostCard.tsx` (`ExpandableDescription`), `data/testHand.ts`.
  Le nombre de lignes réellement pris par le texte dépend de la largeur d'écran et n'est jamais
  deviné : un exemplaire invisible du texte complet (sans limite de lignes) est mesuré et comparé
  à la hauteur du texte tronqué à 3 lignes pour détecter le dépassement.
  Bug corrigé en cours de vérification : la mesure utilisait d'abord `onTextLayout`, qui n'est
  **pas implémenté par react-native-web** (confirmé dans `node_modules/react-native-web`) — le lien
  "… voir plus" ne s'affichait donc jamais sur le web, silencieusement (le "…" visible venait du
  troncature CSS native du navigateur, pas du composant). Remplacé par une mesure via `onLayout`
  (comparaison de hauteurs), qui fonctionne aussi bien sur web que sur natif.
  Vérifié à 375px : troncature à 3 lignes + lien orange "… voir plus" correctement positionné en
  fin de 3e ligne, expansion vers le texte complet + "voir moins", et retour à l'état tronqué —
  aucun chevauchement visuel constaté.

- **2026-07-21 — Replayer : refonte complète du placement des mises — table plus haute que large + placement radial universel. (résout enfin le problème après ~4 sessions)**
  Fichiers : `src/components/replayer/HandReplayer.tsx`, `src/components/replayer/SeatView.tsx`,
  `src/engine/layout.ts`, `src/components/replayer/BoardView.tsx`.
  Cause racine (enfin identifiée par le calcul, pas par tâtonnement) : sur la table large
  (`aspectRatio 1.25`), le board (~186px) touchait presque les sièges de côté — l'espace "devant le
  joueur, vers le centre" n'existait tout simplement pas géométriquement. Aucun algorithme ne peut
  placer un jeton dans un espace inexistant ; toutes les tentatives précédentes échouaient pour ça.
  Fix en deux parties, toutes deux universelles (aucune constante calée sur un cas précis) :
  1. **Table plus haute que large** (`aspectRatio 1.25 → 0.8`, l'inverse exact — "l'ovale dans
     l'autre sens" suggéré par l'utilisateur). C'est ce qui crée l'anneau de felt entre les sièges
     et le board central, en remontant la hauteur disponible.
  2. **Placement radial** (`SeatView`) : chaque jeton se pose sur la ligne siège→centre, juste
     au-delà du bloc cartes+badge du siège (distance = sortie du bloc + marge + demi-hauteur du
     jeton, calculée par trigonométrie sur la direction réelle). Deux sièges voisins étant à des
     angles différents, leurs jetons divergent et ne peuvent structurellement pas se chevaucher —
     ce que l'ancien décalage purement vertical ne garantissait pas (il envoyait le jeton d'un
     siège de côté sur le siège empilé en dessous). Suppression de toute la logique
     fitsRail/fitsBoard/compact : avec l'anneau, un jeton COMPLET et COHÉRENT tient partout.
  3. **Board en fraction de largeur** (`boardCardSize` : plafond 0.6→0.5 de la largeur de table,
     min carte 20→18) : sur petit écran le board rétrécit proportionnellement au lieu de rester
     large et de manger l'anneau — corrige un chevauchement résiduel de Marco au board à 320px.
  Vérifié par mesure DOM précise (intersection de rectangles, pas à l'œil) sur QUATRE largeurs
  (320, 375, 700 + logique identique aux autres) et pour les 4 sièges misants (SB, BB, Hero,
  Marco) : ZÉRO chevauchement avec leurs propres cartes, le siège voisin empilé, le board ou la
  pastille du pot, à chaque taille. Jetons tous pleins et cohérents, posés devant chaque joueur.
  Limite connue : testable seulement en 6-max (seule main de test) ; le placement radial est
  count-agnostic par construction mais le 9-max sur très petit écran reste non vérifié
  empiriquement (et a un problème préexistant de sièges hors-table, hors périmètre).

- **2026-07-21 — Replayer : jetons réduits de 20% et empilés bien droit plutôt qu'en éventail diagonal, pour gagner de la marge dans les vérifications board/ovale.**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Sur suggestion utilisateur : la pile de jetons illustrée s'étalait en éventail diagonal
  (translateX + translateY par jeton), ce qui lui donnait une largeur (34px) et une hauteur (20px)
  bien plus grandes que nécessaire — exactement ce qui manquait de marge dans les vérifications
  `fitsBoard`/`fitsRail`. Fix : jetons individuels réduits de 20% (14px→11px), empilés avec un seul
  décalage vertical (le "chant" de chaque jeton qui dépasse, comme une vraie pile) au lieu d'un
  décalage diagonal — la pile occupe désormais une largeur proche d'un seul jeton (17px) au lieu de
  34px. `CHIP_HEIGHT_FULL` (32→27) et la largeur du conteneur de mise (40→32, donc `CHIP_HALF_WIDTH`
  20→16) mis à jour en conséquence, ce qui assouplit les deux vérifications de marge. Revérifié par
  mesure DOM précise sur 3 largeurs (375, 430, 700px) : aucun chevauchement (board, pot, cartes des
  sièges voisins, propre badge) sur aucune des deux, et le rendu bascule proprement en jeton complet
  (nouveau style empilé) dès que la marge le permet.

- **2026-07-21 — Replayer : le placement des jetons dépendait de constantes en pixels figées, cassé sur toute autre taille d'écran que celle testée.**
  Fichiers : `src/engine/layout.ts`, `src/components/replayer/SeatView.tsx`, `src/components/replayer/BoardView.tsx`.
  Retour utilisateur (avec capture d'écran, écran plus large que mon test) : jetons flottants,
  disproportionnés. Root cause : les corrections précédentes (`fitsBoard`, la marge de sécurité
  contre l'ovale, la cible des jetons "posés") mélangeaient des tailles fixes légitimes (police,
  icônes — qui doivent rester lisibles quel que soit l'écran) avec des DÉCISIONS DE PLACEMENT
  validées une seule fois à 375px, jamais recalculées à partir de la table réellement rendue.
  Fix : chaque décision se calcule maintenant à partir de la largeur/hauteur RÉELLES de la table au
  moment du rendu :
  - `fitsBoard` (jeton complet ou compact pour BB/Hero) : nouvelle fonction `centerSeatChipFits`
    dans `layout.ts`, qui recalcule la marge réellement disponible (dérivée de `seatEllipseRy` et
    de la vraie taille des cartes du board, `boardCardSize`) — remplace l'ancien
    `fitsBoard = isSideSeat`, qui forçait le rendu compact tout le temps, à toute taille.
  - `boardCardSize` (taille des cartes du board) : extrait de `BoardView` vers `layout.ts`, SOURCE
    UNIQUE partagée avec `SeatView` — auparavant dupliqué, donc susceptible de diverger.
  - Cible des jetons "posés" (`restTarget`) : recalculée à partir de `boardCardSize` +
    `POT_PILL_HEIGHT`, plus l'ancienne valeur "-30" mesurée une seule fois à 375px.
  - `boardVerticalOffset` (décalage du board) : vérifié par le calcul qu'il est déjà indépendant de
    la taille de la table (la hauteur des sièges et des cartes s'annulent dans l'écart BB/Hero,
    seule l'asymétrie de la pastille du pot compte) — aucun changement nécessaire, mais documenté
    explicitement pour ne pas le re-casser par erreur plus tard.
  Vérifié cette fois sur **cinq largeurs d'écran** (320, 375, 430, 700, 1100px), chacune sur un
  onglet fraîchement chargé (pas de resize sur une page déjà montée, qui peut laisser un rendu
  périmé) : aucun chevauchement à aucune taille, et le rendu bascule correctement de compact
  (mobile) à complet (grand écran) quand la marge réelle le permet — comportement adaptatif, pas
  figé sur un seul cas testé.

- **2026-07-21 — Replayer : implémentation de l'architecture retenue après revue design (anneau/décalage vers le rail + board et pot recentrés).**
  Fichiers : `src/engine/layout.ts` (nouveau), `src/components/replayer/SeatView.tsx`,
  `src/components/replayer/BoardView.tsx`, `src/components/replayer/HandReplayer.tsx`.
  Suite à la revue d'architecture (schémas comparés, décision : recentrer le bloc board+pot plutôt
  que décaler les jetons des sièges du milieu sur le côté) :
  - `layout.ts` exporte désormais la géométrie du contenu d'un siège (hauteur cartes/badge) et
    `boardVerticalOffset()` — une seule source de vérité, partagée entre le placement des sièges,
    des mises, et du board, pour ne plus jamais désynchroniser ces constantes entre fichiers.
  - `BoardView` reçoit un `verticalOffset` (calculé dans `HandReplayer`) qui recentre le bloc
    board + pot : celui-ci n'était pas symétrique (seule la pastille du pot dépasse d'un côté des
    cartes), ce qui donnait bien plus de marge à Hero qu'à BB — pas une particularité de BB, un
    défaut de centrage. `SeatView` n'a donc plus besoin du décalage latéral arbitraire (`CENTER_DODGE`)
    précédemment utilisé pour éviter le pot.
  - Vérification par mesure DOM précise (pas juste visuelle) : une fois le board recentré, la marge
    réellement disponible pour BB et Hero (118px entre leurs bords internes, cartes+pot en prenant
    64) s'est révélée insuffisante pour la pile de jetons illustrée pleine taille (~38px par côté
    nécessaires, seulement ~54px disponibles au total) — un chevauchement de plusieurs pixels
    persistait malgré le recentrage, contrairement à ce que l'estimation initiale (au brouillon)
    laissait penser. Root cause : les sièges "du milieu" ont structurellement moins de marge
    verticale que les sièges de côté (rayon de l'ellipse plafonné par `CARD_MARGIN` pour éviter un
    bug précédent). Fix : rendu compact (point coloré + montant en ligne, `BetChipPopIn` prop
    `compact`) pour les sièges du milieu (BB, Hero) uniquement — décidé par la même règle
    géométrique que la direction du jeton (`isSideSeat`), pas par un cas spécial nommé. Revérifié :
    BB (marge 7px avec le pot), Hero (marge ~10px avec le board), SB/Marco (jeton complet, aucun
    chevauchement avec BTN/UTG) — tous positifs, mesurés dans le DOM réel, pas estimés sur schéma.
  - Non commité : en attente de validation utilisateur avant commit.

- **2026-07-21 — Replayer : la mise active de Marco (et par symétrie SB, BTN, UTG) débordait de l'ovale de la table dans son coin.**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Retour utilisateur (avec capture d'écran) : chez Marco_75, le jeton + "15" recouvrait son propre
  nom/stack et débordait visiblement de la table dans le coin bas-droit. Root cause : la table est
  un OVALE (`TableSurface` dessine deux `<Ellipse>`, rx=largeur/2, ry=hauteur/2), pas un rectangle —
  à un angle diagonal, l'ovale rentre bien avant les bords de la zone de jeu. Le fix précédent (pousser
  les sièges de côté "vers le rail") restait dans les limites largeur/hauteur mais pouvait déborder
  de l'ovale lui-même dans les coins. Une première tentative de correction (clamp de la position sur
  l'ovale) a créé une régression inverse : le jeton reculait alors sur les propres cartes du siège.
  Fix retenu : la décision jeton complet / compact (déjà introduite pour BB/Hero face au board)
  s'appuie maintenant sur DEUX contraintes mesurées, pas une seule — la place disponible face au
  board (sièges du milieu) ET la place disponible face à l'ovale (calculée par siège, à sa position
  horizontale réelle) — et bascule en compact dès que l'une des deux ne suffit pas pour la pile
  pleine taille. Toujours décidé par la géométrie mesurée, jamais par le nom du siège. Revérifié par
  capture d'écran fraîche : Marco et SB restent maintenant dans l'ovale, sans chevaucher leurs
  propres cartes.

- **2026-07-21 — Replayer : la mise active d'un siège recouvrait encore le siège VOISIN (empilé du même côté) et la pastille "Pot X".**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Retour utilisateur (avec capture d'écran) : après le fix géométrique précédent (qui dégageait bien
  les cartes/le stack DU SIÈGE LUI-MÊME), un nouveau chevauchement est apparu — la mise de SB
  atterrissait sur les cartes de BTN, empilé juste en dessous sur le même côté de la table. Root
  cause : sur une table à 6 sièges, deux sièges sont toujours empilés du même côté (SB/BTN à gauche,
  UTG/Marco à droite) ; comme les deux poussaient leur jeton "vers le centre" (même logique que les
  sièges du milieu isolés, BB/Hero), ils convergeaient tous les deux dans le même espace réduit entre
  eux. Un décalage horizontal (`HORIZONTAL_PUSH`) avait été essayé en rustine mais s'est avéré
  insuffisant à toute valeur raisonnable (soit ça chevauchait encore, soit ça débordait du feutre).
  Fix : distinction entre sièges "de côté" (x nettement différent du centre — SB/BTN/UTG/Marco) et
  sièges "du milieu" (BB/Hero) ; un siège de côté pousse maintenant son jeton VERS LE RAIL (à
  l'opposé du centre, cet espace n'étant occupé par aucun autre siège) plutôt que vers le centre —
  suppression du `horizontalBias` devenu inutile. Deuxième chevauchement trouvé en vérifiant : BB et
  Hero (sièges du milieu) poussaient toujours pile vers le centre, exactement là où flotte la
  pastille "Pot X" — fix : léger décalage horizontal (`CENTER_DODGE`, 46px) ajouté uniquement pour
  ces deux sièges, sans toucher leur position verticale. Vérifié par mesures DOM précises : jeton de
  SB/Marco plus aucun chevauchement avec BTN/UTG (siège voisin empilé), jeton de BB séparé de la
  pastille "Pot X" par 4px, et toutes les positions restent dans les limites du feutre.

- **2026-07-20 — Replayer : la mise active recouvrait encore les cartes/le stack — position calculée explicitement au lieu d'une direction.**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Retour utilisateur (avec capture d'écran) : SB sur ses cartes, BB sur son stack, Marco/Hero à 15
  aussi sur leurs cartes. Root cause : un déplacement "vers le centre" (direction + distance fixe)
  ne suffit pas à sortir de la zone cartes+badge, qui occupe presque toute la largeur ET la hauteur
  du wrapper du siège — une poussée diagonale modeste y reste. Fix : position calculée
  explicitement à partir de la géométrie connue du wrapper (hauteur cartes + badge), du côté qui
  fait face au centre de la table (`isTopHalf`) : juste sous le badge pour les sièges du haut,
  juste au-dessus des cartes pour ceux du bas — sans décalage horizontal, donc toujours centré
  "devant" le siège. Vérifié par mesures DOM précises sur les 4 sièges (BB, SB, Hero, Marco) :
  chevauchement nul avec leurs propres cartes/nom/stack dans chaque cas.

- **2026-07-20 — Replayer : la mise active flotte trop loin des sièges excentrés (SB) — déplacement fixe au lieu d'une fraction.**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Retour utilisateur : les blindes restaient mal placées, "pas assez devant le joueur". Root cause :
  la position active se calculait comme une FRACTION (42%) de la distance jusqu'à une cible
  partagée — donc plus un siège est loin de cette cible (SB, sur le côté, vs BB tout proche), plus
  son jeton s'éloignait en valeur absolue, perdant tout lien visuel avec son siège. Fix : direction
  normalisée + déplacement fixe de 30px vers le centre, identique pour tous les sièges quel que
  soit leur angle — chaque jeton reste maintenant à la même distance de son propre siège. Vérifié :
  SB et BB montrent tous les deux leur jeton collé à leurs propres cartes.

- **2026-07-20 — Replayer : mise active et mise "posée" séparées en deux cibles distinctes.**
  Fichiers : `src/components/replayer/SeatView.tsx`, `HandReplayer.tsx`.
  Retour utilisateur : (1) la mise active de SB/BB était mal placée (trop sur le côté pour SB,
  sur les cartes pour BB) ; (2) les mises "posées" au pot semblaient en vrac et trop proches de BB
  (on aurait dit sa propre mise) plutôt qu'un seul tas discret. Root cause : les deux états (mise
  active à 42% du chemin, mise posée glissée à 100%) partageaient la même cible, donc reculer la
  cible pour corriger le repos décalait aussi la position active. Fix : `activeTarget` (décalage
  modeste, -50, calibré pour dégager les propres cartes du siège) et `restTarget` (décalage -30,
  bien plus proche du pot que du siège) sont maintenant deux points indépendants. Root cause n°2 :
  le pot (dans `BoardView`, zIndex interne) se faisait quand même recouvrir par les jetons "posés"
  car son zIndex ne joue que face à ses propres frères, pas face à l'arbre `SeatView` — corrigé en
  donnant à `boardWrapper` (dans `HandReplayer`) un zIndex supérieur à tous les sièges. Résultat :
  les mises posées se fondent maintenant discrètement derrière la pastille "Pot X" (un seul endroit
  bien identifié), et les mises actives ne débordent plus sur les cartes.

- **2026-07-20 — Replayer : les jetons "posés" au pot cachaient le stack de BB — surcharge corrigée.**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Deux causes : (1) tous les sièges glissaient jusqu'au même point exact (le pot), donc leurs piles
  se superposaient parfaitement — plus un siège est proche du centre (BB en particulier, le plus
  proche), plus sa propre pile finissait près de son propre badge. Fix : le glissement s'arrête
  désormais à 75% du chemin (`RESTING_FRACTION`) plutôt que 100% — chaque siège garde une pile
  distincte au lieu de converger vers un point unique partagé. (2) Le point cible du pot a été
  reculé (58→85px au-dessus du centre) : calculé précisément à partir des mesures DOM réelles du
  badge de BB pour garantir qu'à 75% du chemin, sa propre pile ne chevauche plus son propre nom.
  Plafond de jetons visibles abaissé de 5 à 3 (moins de surcharge visuelle par pile). Vérifié : le
  nom "BB" est de nouveau lisible, sa pile de jetons flotte au-dessus sans chevaucher le texte.

- **2026-07-20 — Replayer : montant masqué une fois le jeton posé au pot (déjà affiché par "Pot X").**
  Fichier : `src/components/replayer/SeatView.tsx` (`BetChipPopIn`, nouvelle prop `showAmount`).
  Le montant sous chaque petit tas de jetons faisait doublon avec la pastille "Pot X" une fois la
  mise "posée" (street terminée) — surcharge inutile. Fix : `showAmount={Boolean(currentBet)}` —
  le montant ne s'affiche que tant que la mise est active pour ce siège sur la street en cours ;
  une fois la street terminée, seuls les jetons (sans chiffre) restent visibles au pot. Vérifié
  avec un rythme de clics réaliste (un par un, avec pause) : la mise de BB (15, préflop) reste
  affichée sous forme de jetons seuls après le passage au flop, pendant que la mise active de
  Marco_75 (30, flop en cours) affiche bien son montant.

- **2026-07-20 — Replayer : les jetons restent au pot au lieu de disparaître après leur glissement, et 2 bugs corrigés au passage.**
  Fichier : `src/components/replayer/SeatView.tsx`.
  Sur retour utilisateur ("il faut que les jetons restent au milieu, pas qu'ils disparaissent") :
  suppression du fondu vers l'opacité 0 et du `setDisplayBet(undefined)` en fin de glissement — la
  mise reste maintenant affichée au pot indéfiniment (jusqu'à ce que ce siège mise à nouveau).
  Deux bugs trouvés en vérifiant ce changement : (1) la cible du glissement était le centre
  géométrique exact de la table, qui coïncide avec la rangée de cartes du board — les jetons qui
  restaient en place se retrouvaient donc posés sur les cartes communes. Fix : cible décalée de 55px
  au-dessus du centre (`potTarget`), dans la zone du pot. (2) L'animation d'apparition (pop-in)
  d'une nouvelle mise pouvait rester bloquée à son état initial (échelle 0.4, quasi invisible) à
  cause d'une comparaison manuelle à une ref précédente peu fiable avec les doubles rendus de React.
  Fix : extraction en sous-composant `BetChipPopIn` remonté via `key={montant}` — React redémarre
  l'animation nativement à chaque nouveau montant, sans dépendre d'une comparaison manuelle.
  Note de vérification : l'environnement de preview utilisé pour tester (navigateur automatisé)
  ne fait tourner `requestAnimationFrame` que de façon très irrégulière, rendant impossible la
  vérification visuelle fiable du rendu progressif de l'animation elle-même dans cet outil — la
  logique a été vérifiée par relecture de code (le montage/démontage via `key` est un mécanisme
  React standard et fiable) plutôt que par capture d'écran de l'animation en cours. Le
  positionnement final (hors du board) et la persistance (pas de disparition) ont eux été vérifiés.

- **2026-07-20 — Replayer : les jetons glissent vers le pot à la fin d'une street au lieu de disparaître d'un coup.**
  Fichier : `src/components/replayer/SeatView.tsx` (nouvel état local `displayBet`, nouvelle
  `Animated.Value` `slideAnim`).
  `currentBet` (dérivé de l'état de la main pour la street courante) retombe à zéro dès que la
  street change, ce qui faisait disparaître instantanément les jetons de mise. Fix : un état local
  `displayBet` retient le dernier montant misé et ne se réinitialise qu'après une animation de
  450ms glissant les jetons de leur position de repos (42% du chemin vers le centre) jusqu'au pot
  (100% du chemin) en fondu. Vérifié : comportement stable sur un cycle complet d'autoplay (aucune
  erreur console), et confirmé avec une durée temporairement allongée (3000ms) que le mécanisme de
  disparition différée fonctionne avant de revenir à 450ms.

- **2026-07-20 — Replayer : la mise devant chaque siège se décompose en plusieurs jetons empilés.**
  Fichier : `src/components/replayer/SeatView.tsx` (nouvelle fonction `chipStackFor`).
  Même avec la recoloration par dénomination, un seul rond générique par mise donnait toujours
  l'impression d'un jeton unique. Fix : décomposition gloutonne par dénominations décroissantes
  (cash : 1000/100/25/5/1 ; tournoi : 5000/1000/100/25/10/5/1, palette inchangée), plafonnée à 5
  jetons visibles, rendus en petite pile décalée (cascade diagonale) au-dessus du montant. Exemples
  vérifiés : mise 5 → 1 jeton rouge ; mise 15 → 3 jetons rouges ; mise 2 → 2 jetons bleus (9 jetons
  au total comptés dans le DOM pour ces 4 sièges, tous de la bonne couleur/quantité).

- **2026-07-20 — Replayer : jetons de mise recolorés par dénomination réelle (cash game uniquement).**
  Fichiers : `src/theme/theme.ts` (nouveau `cashChipColors`), `src/components/replayer/SeatView.tsx`
  (`chipColorFor` prend désormais `gameType`).
  La palette de jetons avait été resserrée vers gold/orange/navy plus tôt cette session, rendant
  plusieurs paliers de montant quasi indiscernables. Retrouvé dans l'historique git (avant cette
  session) une palette par dénomination bien plus lisible ; l'utilisateur a confirmé/précisé le
  mapping exact à utiliser, cash game seulement : 1→bleu, 5→rouge, 25→vert, 100→noir, 1000→jaune.
  Le tournoi garde `chipColors` (palette existante) inchangé. Vérifié : SB(2)→bleu, BB(5)/mise 15→
  rouge, mise 30→vert, tous corrects.

- **2026-07-20 — Replayer : boutons ‹/› en orange plein (au lieu de translucide) + jetons de mise
  remplacés par une icône de jeton avec montant en dessous (au lieu d'une pastille avec texte
  dedans).** Fichiers : `src/components/replayer/PlaybackControls.tsx`, `SeatView.tsx`,
  `HandReplayer.tsx`. (1) Les boutons retour/avance étaient à 12% d'opacité — peu engageants.
  Passés à la même teinte pleine que le bouton play (38px→44px, toujours plus petits que le play
  pour garder la hiérarchie). (2) Sur retour utilisateur (comparaison avec un replayer concurrent) :
  la mise en cours devant chaque siège devient une icône de jeton (rond, bordure festonnée,
  couleur par palier de `chipColors`) avec le montant affiché SOUS le jeton plutôt que dans une
  pastille texte. Ce nouvel élément (jeton + montant, ~32px de haut) ne tenait plus dans le petit
  espace entre les cartes et le badge (débordait sur les propres cartes du siège ou sur le badge
  selon la position) : repositionné pour flotter à mi-chemin entre le siège et le centre de la
  table (fraction de la distance réelle siège→centre, pas un décalage fixe), en terrain dégagé —
  comme une vraie mise posée devant le joueur plutôt que collée sur son badge. Vérifié : jetons de
  SB/BB/Hero/Marco_75 tous lisibles et sans chevauchement de texte, y compris pour les sièges très
  proches de l'axe centre-siège (BB, Hero) où le risque de collision était le plus fort.

- **2026-07-20 — Replayer : les steps "post SB"/"post BB" ne sont plus des clics séparés.**
  Fichiers : `src/engine/handEngine.ts` (nouvelle fonction `initialReplayStep`),
  `src/components/replayer/HandReplayer.tsx`.
  Poster la SB/BB n'est pas une décision du joueur — les rejouer pas à pas ne faisait que coûter
  deux clics avant d'arriver à la première vraie action. Fix : le replay démarre juste après ces
  deux posts (`initialReplayStep` compte les actions `post-sb`/`post-bb` en tête de liste), le pot
  et les stacks les reflètent déjà à l'écran initial, le bouton retour ne permet plus de redescendre
  en dessous de ce point, et aucune bulle d'action ("poste la grosse blinde…") ne s'affiche au step
  de départ. Le compteur/la barre de progression n'affichent que les steps "utiles" (décalés de
  `initialReplayStep`), donc la barre démarre bien vide. Vérifié : la main s'ouvre directement avec
  "Pot 7" (SB 2 + BB 5) affiché, retour désactivé, et la première action réelle (ex: "UTG se
  couche") apparaît bien au premier clic.

- **2026-07-20 — Replayer : badges de siège allégés (suppression des capsules pleines) + cartes agrandies au niveau du board.**
  Fichiers : `src/components/replayer/SeatView.tsx`, `src/components/replayer/HandReplayer.tsx`,
  `src/engine/layout.ts`.
  Deux retours utilisateur successifs (comparaison avec un replayer concurrent) : (1) la "bulle"
  de siège (nom/position/stack dans une capsule pleine avec bordure) était trop lourde visuellement
  — remplacée par du texte simple (ombre portée pour la lisibilité sur le feutre), le halo actif
  n'entoure plus qu'une fine bordure autour du texte, "fold" est un simple texte doré discret au
  lieu d'un badge, nom+position fusionnés puis position retirée entièrement quand un pseudo est
  défini (juste "Hero", plus "Hero · CO"). (2) Les cartes des joueurs (20×30) étaient trop petites
  alors que "c'est le cœur du replayer, ce qui attire l'œil" — passées à la taille des cartes du
  board (34×46, preset `size="medium"` de `CardView`). Ce doublement de hauteur des cartes cassait
  la marge anti-chevauchement pot/badge calibrée précédemment (`CARD_MARGIN`) : recalculé
  précisément via mesures DOM réelles plutôt qu'estimation — la contrainte devient asymétrique
  (le siège du bas déborde désormais du bord de la table côté badge, pas le siège du haut côté pot)
  car cartes+badge gardent un ordre d'empilement fixe. Solution : centrer le wrapper du siège
  symétriquement sur sa coordonnée (`translateY` = -moitié de la hauteur totale du contenu, soit
  -39 au lieu de -30) pour égaliser les deux contraintes plutôt que d'en satisfaire une seule, et
  agrandi la table elle-même (`aspectRatio` 1.55→1.25, donc plus haute) pour absorber le surcroît de
  hauteur. Vérifié via mesures DOM exactes : siège du haut (BB) top pile à `svgTop`, siège du bas
  (Hero) bottom pile à `svgBottom`, marge pot/badge de 20px — zéro rognage, zéro chevauchement.

- **2026-07-20 — Refonte design replayer (mandat "Senior Product Designer") : pot/badge, jeton de mise, halo actif.**
  Fichiers : `src/engine/layout.ts` (`CARD_MARGIN` 38→30), `src/components/replayer/SeatView.tsx`,
  `BoardView.tsx`, `ChipsView.tsx`, `CardView.tsx`, `HandReplayer.tsx`.
  Trois bugs de layout trouvés en vérifiant l'écran à l'état final (main gagnée) :
  (1) Le pot flottant (pastille "Pot X") et le badge du siège du haut (nom/stack) se chevauchaient
  de ~23px sur une table mobile compacte (343×221px) — invisible car le badge, peint après le
  plateau dans le JSX, l'occultait silencieusement. Mesures DOM précises prises pour prouver que
  les deux contraintes (pas de chevauchement pot/badge ET pas de rognage des cartes du siège par le
  bord de la table) étaient mathématiquement incompatibles avec les tailles d'éléments d'alors.
  Fix : réduction des empreintes (cartes 22×30→20×26, padding badge/pastille resserrés), pastille
  du pot passée en fond opaque + élévation (`zIndex`/`shadow`) pour que le chevauchement résiduel
  de ~0.5px (badge/pot) soit invisible plutôt que glitché. Note : une première version inversait
  l'ordre cartes/badge pour les sièges du haut (cartes plus proches du centre) — retirée sur retour
  utilisateur ("les cartes doivent être au-dessus du pseudo, pas en dessous, sinon c'est dégeu") ;
  l'ordre est maintenant identique pour tous les sièges (cartes toujours au-dessus du badge), et le
  chevauchement résiduel avec le pot est géré uniquement par la réduction de tailles + l'opacité de
  la pastille. (2) `isActive` restait vrai pour le dernier siège à
  avoir agi même s'il venait de se coucher → halo doré pulsant affiché en même temps que le tag
  "FOLD" (contradictoire). Fix : `isActive` exclut désormais les sièges couchés (`HandReplayer.tsx`).
  (3) Le jeton de mise flottant (pastille ronde avec le montant) se déplaçait horizontalement vers
  le centre de la table pour son animation, ce qui le faisait atterrir sur le texte du badge des
  sièges latéraux (ex: nom "Marco_75" affiché tronqué "rco_75" par le jeton "70" par-dessus). Fix :
  jeton repositionné à une position fixe calculée (le point de jonction cartes/badge selon l'ordre
  du siège) avec une simple animation d'apparition (échelle+fondu) au lieu d'une translation.
  Vérifié en rejouant une main complète jusqu'au winner (autoplay) : plus aucun texte recouvert,
  plus de rognage aux bords, halo actif cohérent avec l'état couché/actif.

- **2026-07-20 — Formatage "k" tournoi : suppression des zéros superflus après la virgule.**
  Fichier : `pokza-app/src/utils/chipFormat.ts`. `toFixed(2)` produisait toujours 2 décimales même
  pour des montants ronds (200000 → "200,00k" au lieu de "200k"). Fix : arrondi à 2 décimales puis
  `parseFloat` pour supprimer les zéros de fin avant conversion en texte. Vérifié : 200000 → "200k",
  225500 → "225,5k", 250669 → "250,67k" (correspond exactement aux exemples demandés). Testé en
  conditions réelles dans le créateur avec BB=4510/stack=225500 : stacks "225,5k"/"225,4k" (SB après
  blinde)/"220,99k" (BB), pot "4,61k".

- **2026-07-20 — Replayer : le formatage "k" des montants tournoi ne s'appliquait qu'au créateur, pas à la main publiée.**
  Fichiers : nouveau `pokza-app/src/utils/chipFormat.ts` (extraction de `formatChipAmount` partagée),
  `src/engine/handEngine.ts` (`describeAction` formate `action.amount` via `hand.gameType`),
  `src/components/replayer/SeatView.tsx` / `BoardView.tsx` / `ChipsView.tsx` (nouveau prop `gameType`),
  `src/components/replayer/HandReplayer.tsx` (transmet `hand.gameType` aux sous-composants).
  Le fix précédent ne touchait que `StreetStep.tsx` (l'écran de saisie pendant la création) — une fois
  la main publiée et rejouée dans le replayer, les montants (pot, stacks, mises devant les sièges,
  libellés d'action) réaffichaient la valeur brute ("100000" au lieu de "100k"). Fix : la fonction de
  formatage vit maintenant dans un utilitaire partagé, importé à la fois par le créateur et le
  replayer. Vérifié : main tournoi 50k/100k publiée → replayer affiche "Pot 150,00k", stacks
  "4950,00k"/"4900,00k", bulles de mise "50,00k"/"100,00k" devant SB/BB.

- **2026-07-20 — Créateur de main : montants en tournoi affichés en "k" au-delà de 1000 (2 décimales).**
  Fichier : `pokza-app/src/creator/steps/StreetStep.tsx` (`formatChipAmount`).
  En tournoi les montants dépassent vite 4-5 chiffres et surchargent l'écran (pot, stacks, mises).
  Fix : au-delà de 1000 jetons, affichage `X,XXk` (2 décimales, virgule) — ex: 1428 → "1,43k".
  Appliqué à tous les affichages (Pot, stacks restants, "reste X", résumé des actions, chips de
  taille, "Suivre (X)", "Tapis (X)", placeholder du champ montant). Le cash game n'est pas affecté
  (valeur brute). Important : seul l'AFFICHAGE est formaté — le champ de saisie du montant garde
  toujours la valeur numérique brute (ex: "6000"), donc reste éditable/soumis correctement. Vérifié :
  tournoi BB=1000 → Pot "1,50k", stacks "50,00k"/"49,50k", raccourcis BB "2,00k"/"3,50k"/"6,00k"/
  "10,00k", clic sur un chip remplit le champ avec "6000" (brut, pas "6,00k").

- **2026-07-20 — Créateur de main : stack effectif par défaut désormais un multiple de BB (cash ET tournoi).**
  Fichier : `pokza-app/src/creator/steps/ContextStep.tsx` (`defaultStackFor`).
  Un stack de départ se raisonne en "nombre de BB" plutôt qu'en valeur absolue. D'abord fait pour le
  tournoi seul (stack = BB × 50), puis généralisé au cash game (stack = BB × 100) sur demande —
  `defaultStackFor(gameType, bb)` centralise le multiplicateur (100 cash / 50 tournoi), appliqué
  automatiquement à chaque changement de BB (preset de blindes, saisie manuelle, ou bascule
  Cash/Tournoi). Vérifié : cash BB 5→500 (inchangé, cohérent avec l'ancien défaut fixe), BB 10→1000 ;
  tournoi BB 200→10000, BB 1000→50000, BB 1200→60000.

- **2026-07-20 — Créateur de main : raccourcis de taille en BB au préflop au lieu du %pot.**
  Fichier : `pokza-app/src/creator/steps/StreetStep.tsx`, `src/creator/LiveHandCreator.tsx` (passe
  `bb`/`gameType` au `StreetStep` préflop).
  Retour utilisateur : le %pot n'est pas le repère habituel avant le flop. Fix : au préflop, les 4
  chips affichent des multiples de BB au lieu de fractions de pot — Cash : 3BB/4BB/5BB/10BB, Tournoi :
  2BB/3.5BB/6BB/10BB (presets différents car les tailles d'open standards diffèrent). Le %pot reste
  inchangé sur flop/turn/river. Vérifié : Cash (BB=5) → 15/20/25/50 ; Tournoi (BB=200, stack 500) →
  2BB=400, les autres plafonnés au stack disponible (500) comme c'était déjà le cas pour les mises.

- **2026-07-20 — Créateur de main : rappel du pot + raccourcis de taille (1/3, 1/2, 2/3, pot) lors des mises.**
  Fichier : `pokza-app/src/creator/steps/StreetStep.tsx`.
  Ajout d'un calcul `potNow` (streets précédentes + ante de la street courante si applicable + mises
  déjà faites sur la street en cours), affiché en permanence ("POT X") dès que le board est complet.
  Lors de la saisie d'un montant de mise/relance, 4 chips ("1/3 pot", "1/2 pot", "2/3 pot", "Pot")
  affichent le montant correspondant et pré-remplissent le champ en un clic (plafonné au stack
  disponible). Objectif : permettre de reconstituer une taille de mise dont on se souvient en
  fraction du pot plutôt qu'en valeur exacte. Vérifié : préflop (pot 7) → chips 2/4/5/7 ; flop
  (pot 16, après raise+call) → chips 5/8/11/16, tous corrects.

- **2026-07-20 — Créateur de main : stack personnalisable par joueur (plus seulement un stack effectif global).**
  Fichiers : `pokza-app/src/creator/types.ts` (`ContextData.seatStacks`), `src/creator/positions.ts`
  (`buildSeats` accepte un 5e paramètre `seatStacks`), `src/creator/steps/ContextStep.tsx` (fusion de
  l'ancienne section "Noms des adversaires" avec les stacks : une ligne par siège, nom + stack au lieu
  de deux listes séparées), `src/creator/LiveHandCreator.tsx`.
  Le modèle (`Seat.startingStack`) supportait déjà un stack par siège ; il manquait l'UI. Chaque ligne
  affiche le nom (adversaires uniquement) et le stack (tous les sièges, y compris Hero), pré-rempli en
  placeholder avec "Stack effectif" — donc rien à changer si tout le monde a le même stack, sinon
  override au cas par cas (ex : un adversaire short stack). Vérifié : BB avec stack custom à 150 →
  affiche bien 145 après sa blinde (150-5), les autres sièges restent au stack effectif (500).

- **2026-07-20 — Créateur de main : ajout du straddle (cash game).**
  Fichiers : `pokza-app/src/types/poker.ts` (`ActionType.post-straddle`), `src/creator/types.ts`
  (`ContextData.straddle`/`.straddleAmount`), `src/creator/steps/ContextStep.tsx` (section "Straddle",
  visible en cash game uniquement, montant par défaut 2x BB), `src/creator/LiveHandCreator.tsx`
  (construction de l'action de straddle par le premier joueur à parler préflop, `initialBetAmount`/
  `initialContributions` ajustés en conséquence), `src/creator/steps/StreetStep.tsx` (nouveau prop
  `firstToActAfterSeatId`), `src/engine/handEngine.ts` (`describeAction`).
  Le straddle est une mise volontaire (généralement 2x BB) postée par le premier joueur à parler
  avant les cartes : elle devient le niveau à suivre (au lieu de la BB), et l'action reprend juste
  après le straddleur au lieu de l'ordre naturel — le straddleur agit en dernier avec l'option, comme
  le ferait la BB normalement. `post-straddle` est un type de mise "normale" (pas ante) : son montant
  écrase, comme une blinde/relance, la contribution précédente du siège sur la street (sémantique
  cumulative existante), donc aucun changement necessaire dans `committedBySeat`/`computeHandState`.
  Vérifié bout en bout (6 joueurs, blindes 2/5, straddle 10 posté par Hero en UTG) : HJ agit en
  premier (pas Hero), "Suivre (10)" partout, Hero récupère l'option en dernier (Check disponible),
  stacks corrects (Hero et BB à 490 après straddle+call), Pot final = 22 (2 SB + 10 BB + 10 straddle).

- **2026-07-20 — Replayer : l'ante s'affichait comme mise devant le siège au lieu d'aller directement au pot.**
  Fichier : `pokza-app/src/engine/handEngine.ts` (`computeHandState`). `streetContribution` (la bulle
  de jeton devant chaque siège) sommait blinde+ante, donc BB en "BB ante" (ex: 200/200) affichait 400
  devant lui au lieu de 200. Fix : `streetContribution` ne lit plus que `contributions` (blinde/mise/
  relance), pas `anteContributions` — l'ante continue d'être comptée dans `potTotal`/`stacks` (donc
  reste bien déduite du stack et ajoutée au pot immédiatement) mais n'apparaît plus dans la bulle de
  mise du joueur. Vérifié : BB ante 5 (blindes 2/5) → bulle devant BB affiche "5" et Pot passe
  directement de 7 à 12 dès l'action d'ante, stack BB à 490.

- **2026-07-20 — Créateur de main : ajout de l'ante (BB ante ou ante par joueur).**
  Fichiers : `pokza-app/src/creator/types.ts` (`AnteType`, `ContextData.anteType`/`.ante`),
  `src/creator/steps/ContextStep.tsx` (section "Ante" : Aucun / BB ante / Ante par joueur),
  `src/creator/LiveHandCreator.tsx` (construction des actions `post-ante`), `src/engine/handEngine.ts`
  (`committedBySeat`, `computeHandState`), `src/creator/steps/StreetStep.tsx` (nouveau prop
  `anteCommitted`).
  Point technique clé : `Action.amount` est cumulé par street pour les mises normales (check/call/
  bet/raise/blindes) — un seul montant "gagne" par siège+street. L'ante est une mise forcée
  indépendante (elle ne compte pas dans ce qu'il faut suivre), donc `committedBySeat`/
  `computeHandState` la somment séparément au lieu de l'écraser, pour gérer le cas où un même siège
  poste blinde + ante sur la même street (ex: BB ante) sans perdre l'un des deux montants. Second
  bug trouvé en testant : le stack "reste" affiché pendant la création du préflop ignorait l'ante
  (le calcul `availableAtStart` se basait sur `priorCommitted`, qui exclut par construction la
  street courante). Fix : nouveau prop `anteCommitted` passé à `StreetStep` uniquement pour la
  street preflop, qui soustrait l'ante déjà posté sans toucher au calcul du montant à suivre (qui,
  lui, doit rester basé seulement sur les blindes/mises, pas sur l'ante qui n'est pas "callable").
  Vérifié bout en bout : 6 joueurs, ante 1/joueur, SB 2, BB 5, Hero call 5 puis tout le monde
  check jusqu'à la river → Pot final = 18 (6×1 ante + 2 SB + 5 BB + 5 call), stacks corrects à
  chaque street.

- **2026-07-20 — Créateur de main : presets de blindes cash appliqués aussi en mode Tournoi.**
  Fichier : `pokza-app/src/creator/steps/ContextStep.tsx`. Les presets 1/2, 1/3, 2/5, 5/10 n'ont pas de
  sens pour un tournoi (blindes bien plus élevées). Fix : deux jeux de presets (`CASH_BLIND_PRESETS` /
  `TOURNAMENT_BLIND_PRESETS`), sélectionnés selon `gameType` — tournoi : 100/200, 500/1k, 5k/10k,
  50k/100k (format compact via `formatBlind`, ex: 1000 → "1k"). Cliquer sur "Cash game"/"Tournoi"
  réinitialise aussi sb/bb à un preset par défaut cohérent (2/5 ou 100/200) pour éviter d'hériter de
  valeurs de l'autre mode. Vérifié dans le preview : bascule Cash ↔ Tournoi met à jour les chips et
  les champs numériques correctement.

- **2026-07-20 — Replayer : le libellé d'action ("CO check", "BTN mise 30") obstruait la table.**
  Fichiers : `pokza-app/src/components/replayer/ActionCallout.tsx`, `HandReplayer.tsx`.
  Le libellé était une bulle en `position:absolute` superposée au milieu de la table (au-dessus des
  cartes/jetons), ce qui masquait le board pendant les 900ms d'affichage. Fix : sorti de `tableArea`
  et affiché comme légende en flux normal, sous la table et au-dessus des contrôles de lecture — ne
  peut donc plus jamais chevaucher le board. Le fondu d'apparition/disparition (900ms + 500ms) est
  conservé. Vérifié dans le preview : table dégagée, plus aucun texte flottant sur le feutre.

- **2026-07-20 — Créateur de main : impossible de nommer les adversaires (positions seules : UTG, HJ...).**
  Fichiers : `pokza-app/src/creator/types.ts` (`ContextData.opponentNames`), `src/creator/positions.ts`
  (`buildSeats` accepte un 4e paramètre optionnel `opponentNames`), `src/creator/steps/ContextStep.tsx`
  (champ texte par position adverse, sous "Ta position"), `src/creator/LiveHandCreator.tsx` (passe
  `context.opponentNames` à `buildSeats`). Les champs sont optionnels (placeholder = acronyme de
  position) ; si rempli, le nom remplace la position partout dans le replayer et les écrans d'action
  (ex : "Fish_du_coin agit" au lieu de "UTG agit"). Vérifié dans le flow complet de création.

- **2026-07-20 — Replayer : le board (cartes) était décentré verticalement à cause du bloc jetons.**
  Fichier : `pokza-app/src/components/replayer/BoardView.tsx`.
  Root cause : le composant jetons (`ChipsView`, 60px de haut) et les cartes étaient centrés ensemble
  comme un seul bloc de 112px sur le centre de la table — les cartes, qui occupaient la moitié basse
  du bloc, se retrouvaient donc en dessous du vrai centre. Fix : les jetons sont maintenant positionnés
  en `absolute` (`bottom: '100%'`) au-dessus des cartes au lieu d'être dans le flux normal, si bien que
  seule la rangée de cartes détermine la hauteur du bloc centré. Vérifié via mesure DOM : le centre Y
  de la rangée de cartes correspond exactement au centre Y de la table (367.5 = 367.5), avant et pendant
  l'animation des jetons vers le gagnant.

- **2026-07-20 — Vote personnalisé : l'utilisateur choisit ses réponses (2 à 4) au lieu de Oui/Non fixe.**
  Fichiers : `pokza-app/src/types/poker.ts` (`Post.voteOptions`), `src/creator/types.ts` (`ReviewData.voteOptions`),
  `src/creator/steps/ReviewStep.tsx`, `src/creator/LiveHandCreator.tsx`, `src/components/post/PostCard.tsx`.
  Après la question du vote (étape Publier), 4 champs texte apparaissent (2 obligatoires, 2 optionnels,
  max 20 caractères chacun) avec un aperçu live des boutons en dessous. `PostCard` affiche dynamiquement
  les boutons selon `post.voteOptions`, avec fallback sur `['Oui', 'Non']` si absent (compat mains existantes
  comme `testHand` qui n'a pas encore ce champ). Vérifié : création d'une main avec vote "Fold / Call / Raise",
  affichage correct des 3 boutons dans le feed après publication.

- **2026-07-20 — Replayer : animation des jetons vers le gagnant à la fin de la main.**
  Fichiers : `pokza-app/src/engine/handEngine.ts` (`determineWinner`), `src/components/replayer/BoardView.tsx`,
  `src/components/replayer/HandReplayer.tsx` (new: `ChipsView.tsx`).
  Ajout de `determineWinner(hand)` qui retourne l'ID du siège gagnant si un seul joueur n'a pas folded.
  Nouvelle `HandState.winningSeatId` et passage à BoardView.
  Création de `ChipsView` : affiche une pile de chips colorées (décomposition en dénominations).
  `BoardView` utilise Animated API pour déplacer les chips vers le siège du gagnant (800ms, opacity fade).
  Les coordonnées du gagnant sont calculées relativement au centre de la table (seatCoords - tableCenter).
  Résultat : au dernier step, les chips glissent depuis le centre vers le siège du gagnant sans message.
  Au dernier step avec Hero fold au turn : chips animés vers Marco_75 (HJ).

- **2026-07-20 — Replayer : le turn et la river s'affichaient ensemble au lieu de carte par carte.**
  Fichier : `pokza-app/src/engine/handEngine.ts` (`totalReplaySteps`, `computeHandState`).
  Après le fix du 2026-07-19, le board s'affichait en entier au dernier step au lieu de progressivement.
  Root cause : quand `step > hand.actions.length` (run-out), on affichait directement jusqu'à 
  `streetIndex` (la street de la dernière action), sans compter les steps intermédiaires.
  Fix : ajouter `totalReplaySteps(hand)` qui compte actions.length + nombre de streets du board 
  après la dernière action (chaque street distribuée = 1 step supplémentaire). Dans `computeHandState`,
  calculer un `runoutOffset` et progressivement révéler le board street par street pendant le run-out.
  Résultat : turn et river s'affichent maintenant comme steps séparés (vérif : step 14 = flop+turn,
  step 15 = flop+turn+river).

- **2026-07-19 — Replayer : le board ne se déroulait pas sur un tapis avant la river.**
  Fichier : `pokza-app/src/engine/handEngine.ts` (`computeHandState`). La révélation du board
  était pilotée par la street de la *dernière action*. Or un tapis avant la river « run out »
  le turn/la river **sans action** sur ces streets → elles n'étaient jamais révélées au replay.
  Fix : quand la main est terminée (`step >= hand.actions.length`), on révèle tout le board
  réellement distribué (`handComplete`), y compris les streets sans action. Vérifié dans le
  preview avec une main de test all-in au flop : turn + river se dévoilent au step final.

---

## P0: V0 MVP Core (Must-have for launch)

These 25 tasks are the minimum viable product. Do these first. Ship in 8 weeks solo.

### Database Setup (3 tasks)

- [ ] **Setup Supabase project**
  - Create free tier Supabase account
  - Create database instance (free tier)
  - Setup auth (email/password)
  - Get DB connection string
  - Time: 1-2 hours

- [ ] **Create users table & auth integration**
  - Create `profiles` table (id, user_id, display_name, avatar_url, created_at)
  - Create `user_stats` table (user_id, hands_created, hands_liked, followers_count, created_at, updated_at)
  - Setup RLS policies (users can read own profile, everyone reads public stats)
  - Add auth triggers (auto-create profile on signup)
  - Time: 3-4 hours

- [ ] **Create hands & posts tables**
  - Create `hands` table (id, user_id, game_type, stakes, hero_position, hero_cards, board_flop/turn/river, actions_json, result, profit_loss, created_at)
  - Create `posts` table (id, hand_id, title, description, visibility, created_at, updated_at)
  - Add indexes (user_id, created_at, visibility)
  - Setup RLS (creator can edit, others read if public)
  - Time: 3-4 hours

### Backend API (6 tasks)

- [ ] **Setup Express server & auth middleware**
  - Initialize Node.js project
  - Install Express, TypeScript, Supabase client
  - Create authentication middleware (verify JWT)
  - Create error handling middleware
  - Setup CORS, logging
  - Time: 2-3 hours

- [ ] **Create auth endpoints**
  - POST /auth/signup (email, password)
  - POST /auth/login (email, password)
  - POST /auth/logout
  - GET /auth/me (current user)
  - Time: 2-3 hours

- [ ] **Create hand creation endpoints**
  - POST /api/hands (create hand: game_type, stakes, hero_position, hero_cards, board, result, profit_loss)
  - Validation (stakes > 0, valid cards, valid positions)
  - Auto-calculate profit/loss
  - Return hand_id
  - Time: 3-4 hours

- [ ] **Create hand replay endpoint**
  - GET /api/hands/{id} (return full hand data)
  - Include board, actions, result
  - Format for frontend consumption
  - Time: 1-2 hours

- [ ] **Create feed endpoint**
  - GET /api/feed (return 50 latest public hands, pagination)
  - Include hand, creator name, stats
  - Filter by visibility (public only)
  - Support cursor-based pagination (?cursor=post-123&limit=50)
  - Time: 3-4 hours

- [ ] **Create user profile endpoints**
  - GET /api/users/{id} (public profile)
  - GET /api/users/{id}/hands (user's hands, paginated)
  - GET /api/me (authenticated user's profile)
  - PATCH /api/me (update display_name, avatar_url)
  - Time: 3-4 hours

### Frontend Setup (4 tasks)

- [ ] **Setup Next.js project & basic layout**
  - Create Next.js app (npx create-next-app)
  - Install Tailwind CSS
  - Create basic layout (header, nav, footer)
  - Setup routing structure (pages/auth, pages/feed, pages/hands, pages/profile)
  - Time: 2-3 hours

- [ ] **Create authentication UI**
  - Signup form (email, password, confirm password)
  - Login form (email, password)
  - Form validation (email format, password strength)
  - Error messages
  - Redirect on success
  - Time: 3-4 hours

- [ ] **Create hand creation form**
  - Game type dropdown (6max, HU, full ring)
  - Stakes input (number)
  - Hero position dropdown (SB, BTN, CO, etc.)
  - Hero cards input (2 cards: 2h, 3d, etc.)
  - Board input (flop 3 cards, turn, river)
  - Result radio (win, loss, fold, all-in)
  - Submit button
  - Error handling
  - Time: 4-5 hours

- [ ] **Create feed page**
  - Display list of hands (title, creator, result, date)
  - Infinite scroll / pagination
  - Click to view hand detail
  - Loading states
  - Time: 3-4 hours

### Social Features (5 tasks)

- [ ] **Create likes table & endpoint**
  - Create `likes` table (post_id, user_id, created_at, UNIQUE composite)
  - POST /api/posts/{id}/like (like a post)
  - DELETE /api/posts/{id}/like (unlike)
  - GET /api/posts/{id}/likes (return like count)
  - Update post stats on like/unlike
  - Time: 2-3 hours

- [ ] **Create comments table & endpoint**
  - Create `comments` table (id, post_id, user_id, content, created_at)
  - POST /api/posts/{id}/comments (create comment)
  - GET /api/posts/{id}/comments (list comments)
  - DELETE /api/comments/{id} (delete own comment)
  - Time: 2-3 hours

- [ ] **Create follows table & endpoint**
  - Create `follows` table (follower_id, following_id, created_at, UNIQUE composite)
  - POST /api/users/{id}/follow (follow user)
  - DELETE /api/users/{id}/follow (unfollow)
  - GET /api/users/{id}/followers (list followers)
  - GET /api/users/{id}/following (list following)
  - Update user stats on follow
  - Time: 2-3 hours

- [ ] **Create likes UI**
  - Heart icon on each hand
  - Click to like/unlike (instant feedback)
  - Show like count
  - Time: 2 hours

- [ ] **Create comments UI**
  - Comment section on hand detail
  - Comment form (text input, submit)
  - List comments (user, content, date)
  - Delete button (own comments only)
  - Time: 3-4 hours

### User Features (4 tasks)

- [ ] **Create user profile page**
  - Display user name, avatar
  - Show stats (hands created, followers, following)
  - Show hands grid (thumbnails, click to view)
  - Follow/unfollow button
  - Time: 3-4 hours

- [ ] **Create user settings page**
  - Update display name
  - Update avatar (upload to Cloudinary)
  - Logout button
  - Time: 2-3 hours

- [ ] **Create follow button & functionality**
  - Follow button on profile/hand creator
  - Toggle follow/unfollow
  - Update follower count
  - Time: 2 hours

- [ ] **Create search (basic)**
  - Search bar in header
  - Search by username
  - Return list of users
  - Click to view profile
  - Time: 2-3 hours

### Deployment & Infrastructure (3 tasks)

- [ ] **Setup Railway backend deployment**
  - Create Railway account (free tier)
  - Connect GitHub repo
  - Configure environment variables (Supabase URL, keys, JWT secret)
  - Deploy backend
  - Setup automatic deploys on push
  - Time: 2-3 hours

- [ ] **Setup Vercel frontend deployment**
  - Create Vercel account (free tier)
  - Connect GitHub repo
  - Configure environment variables (API URL)
  - Deploy frontend
  - Setup automatic deploys on push
  - Time: 1-2 hours

- [ ] **Setup Cloudinary for image storage**
  - Create Cloudinary account (free tier, 5GB)
  - Get API key
  - Create upload widget for avatars
  - Test upload & display
  - Time: 2-3 hours

---

## P1: V0/V1 Polish & Monetization

These 30 tasks polish V0 and add V1 monetization. Do after P0 is live.

### Design & UI (8 tasks)

- [ ] **Create design system file**
  - CSS variables for colors (navy #16233D, gold #C9A227, orange #E8571F, parchemin #EDEAE2)
  - Typography scale (H1-H4, Body, Label, Caption)
  - Spacing scale (4px base)
  - Document in DESIGN_SYSTEM.md (already done, just implement CSS)
  - Time: 2-3 hours

- [ ] **Implement Tailwind CSS config for design system**
  - Configure colors in tailwind.config.js
  - Configure typography
  - Configure spacing
  - Test in components
  - Time: 2 hours

- [ ] **Redesign auth pages (signup/login)**
  - Apply design system colors & typography
  - Better form styling (44px inputs)
  - Better error messages (red text, icons)
  - Add forgot password link
  - Time: 3-4 hours

- [ ] **Redesign hand creation form**
  - Better dropdowns (custom styled)
  - Better inputs (card selector visual)
  - Form progress indicator (step 1/5)
  - Better submit button
  - Time: 4-5 hours

- [ ] **Redesign feed page**
  - Hand cards (image, title, creator, stats, actions)
  - Better layout (grid or list)
  - Hover effects
  - Loading skeletons
  - Time: 4-5 hours

- [ ] **Redesign profile page**
  - Cover photo
  - Avatar
  - Stats cards (wins, followers, hands)
  - Hands grid
  - Better follow button
  - Time: 3-4 hours

- [ ] **Add dark mode support**
  - Add dark mode toggle in settings
  - CSS variables for light/dark
  - Update all components
  - Test all pages
  - Time: 3-4 hours

- [ ] **Create hand detail page redesign**
  - Better replayer visualization
  - Card display (hero cards, board)
  - Action history (if we track it)
  - Like/comment section
  - Share button
  - Time: 4-5 hours

### Premium Tier (6 tasks)

- [ ] **Create subscriptions table & Stripe integration**
  - Create `subscriptions` table (user_id, tier, status, price_per_month, current_period_start/end, stripe_subscription_id)
  - Setup Stripe account (free)
  - Get publishable & secret keys
  - Test mode cards
  - Time: 2-3 hours

- [ ] **Create premium signup flow**
  - "Upgrade to Premium" button in settings
  - Show pricing ($9/month, 30-day free trial)
  - Stripe payment form (card input)
  - Handle payment success/failure
  - Redirect to dashboard
  - Time: 4-5 hours

- [ ] **Create premium features flag**
  - Add `is_premium` method to user
  - Query subscriptions table
  - Check subscription status
  - Cache in Redis (5 min TTL)
  - Time: 2-3 hours

- [ ] **Create analytics dashboard (premium-only)**
  - Win rate % (hands won / total hands)
  - Profit/loss total
  - Hands by game type breakdown
  - Hands by position breakdown
  - Charts (line graph of profit over time)
  - Time: 5-6 hours

- [ ] **Create opponent stats endpoint (premium-only)**
  - GET /api/premium/opponent-stats/{opponent_name}
  - Return: hands vs opponent, win rate, profit/loss
  - Create `opponent_stats` table
  - Denormalize on hand creation
  - Time: 3-4 hours

- [ ] **Add premium badge to profiles**
  - Show ✓ premium badge next to name
  - Gold color, small icon
  - Appear on profile page & feed
  - Time: 1-2 hours

### Coaching Setup (4 tasks)

- [ ] **Create coaches table**
  - Create `coaches` table (id, user_id, hourly_rate, specializations, bio, calendar_link, created_at)
  - Add RLS policies
  - Time: 1-2 hours

- [ ] **Create coach profile pages**
  - Profile view for coaches (name, rate, specializations, bio, calendar link)
  - Coach directory listing (searchable by specialization)
  - "Book a session" button → links to Calendly
  - Time: 3-4 hours

- [ ] **Create coach onboarding flow**
  - Form to become a coach (rate, specializations, bio, Calendly link)
  - POST /api/coaches/signup
  - Verification email
  - Add coach badge
  - Time: 3-4 hours

- [ ] **Create coach directory page**
  - List all coaches
  - Filter by specialization (6max, tournament, cash game, live, etc.)
  - Filter by rate (min/max hourly)
  - Sort by rating (later, for now just newest)
  - Time: 3-4 hours

### Email & Notifications (4 tasks)

- [ ] **Setup Sendgrid (email)**
  - Create Sendgrid account (free tier, 100 emails/day)
  - Get API key
  - Setup email templates (welcome, coaching reminder, digest)
  - Test send
  - Time: 2-3 hours

- [ ] **Create welcome email**
  - Trigger on signup
  - Welcome message + link to features
  - Sendgrid template
  - POST /api/emails/welcome
  - Time: 2 hours

- [ ] **Create weekly digest email**
  - Collect trending hands from past week
  - Send Friday 5pm (user timezone?)
  - Include: top hands, new coaches, leaderboard updates
  - Sendgrid template + scheduler
  - Time: 3-4 hours

- [ ] **Create push notifications (web)**
  - Service worker for web push
  - Ask permission on signup
  - Send notification on like (optional, maybe not for MVP)
  - Time: 3-4 hours

### Analytics & Tracking (3 tasks)

- [ ] **Setup Sentry error tracking**
  - Create Sentry account (free tier)
  - Add Sentry SDK to backend + frontend
  - Configure environment
  - Test error reporting
  - Time: 2-3 hours

- [ ] **Create basic analytics**
  - Track signups (POST /api/analytics/signup)
  - Track hand creation (POST /api/analytics/hand_created)
  - Track premium conversion (POST /api/analytics/premium_converted)
  - Store in `analytics` table
  - Time: 2-3 hours

- [ ] **Create analytics dashboard (admin-only)**
  - View: daily signups, active users, premium subscribers, hands created
  - Simple stats page
  - Refresh data hourly
  - Time: 2-3 hours

### Testing & QA (3 tasks)

- [ ] **Write integration tests for auth**
  - Test signup (valid, invalid email, weak password)
  - Test login (valid, invalid credentials)
  - Test logout
  - Test JWT refresh
  - Use Jest + Supertest
  - Time: 3-4 hours

- [ ] **Write integration tests for hands**
  - Test hand creation (valid, invalid stakes, invalid cards)
  - Test hand retrieval
  - Test feed pagination
  - Time: 3-4 hours

- [ ] **Manual QA & bug fixing**
  - Test all user flows end-to-end
  - Check mobile responsiveness
  - Fix bugs found
  - Estimate varies, allocate 2-3 days before launch
  - Time: 8-12 hours (split across days)

---

## P2: V1 Growth Features

These 25 tasks add growth features. Do after V0 launch when you have users.

### Advanced Hand Features (6 tasks)

- [ ] **Add action history tracking**
  - Create `actions` table (id, hand_id, street, seat_id, action_type, amount, cumulative_amount)
  - Modify hand creation to track preflop/postflop actions
  - Display action history on replay
  - Time: 4-5 hours

- [ ] **Add showdown cards (optional villain cards)**
  - Modify `hands` table to track villain cards (villain_card_1, villain_card_2)
  - UI to input villain cards (optional, on publish)
  - Display villain cards on replay
  - Time: 3-4 hours

- [ ] **Add hand categories/tags**
  - Create `hand_tags` table (hand_id, tag)
  - Common tags: #3bet, #cooler, #badbeat, #hero-fold, #suckout
  - UI to select tags on publish
  - Filter feed by tags
  - Time: 3-4 hours

- [ ] **Add hand collections (curated)**
  - Create `collections` table (id, name, description, created_by, is_public)
  - Create `collection_hands` junction table
  - Admin curates collections ("Best 3bets", "Worst beats")
  - Display collections on homepage
  - Time: 3-4 hours

- [ ] **Add hand export (CSV, JSON)**
  - Endpoint: GET /api/hands/{id}/export?format=csv
  - Export hand data (game type, stakes, result, profit, cards, actions)
  - Download as file
  - Time: 2-3 hours

- [ ] **Add hand sharing (public link with custom message)**
  - Generate shareable link: pokza.com/hands/abc123?shared_by=user123
  - Add message when sharing
  - Increment share count
  - Track clicks
  - Time: 2-3 hours

### Social Amplification (5 tasks)

- [ ] **Add trending hands calculation**
  - Create materialized view: trending_hands (computed daily)
  - Rank by: likes + 2× comments (engagement metric)
  - Update daily at 2 AM
  - Time: 3-4 hours

- [ ] **Create trending page**
  - Display top 50 hands of past week
  - Filter by game type, position, result
  - Show trending badge on feed
  - Time: 2-3 hours

- [ ] **Add leaderboard**
  - Create leaderboard page
  - Rank players by: followers, hands created, win rate
  - Top 100 visible
  - Update hourly
  - Time: 3-4 hours

- [ ] **Add verified badges system**
  - Badge types: Pro Player (self-reported), Coach (verified), Streamer (Twitch link)
  - Admin endpoint to verify badges
  - Display badges on profile & feed
  - Time: 2-3 hours

- [ ] **Add user mentions & @notifications**
  - Support @username in comments
  - Parse mentions, store in DB
  - Send notification to mentioned user
  - Link to user profile
  - Time: 3-4 hours

### Monetization (6 tasks)

- [ ] **Add coaching session booking (Calendly integration)**
  - Coach adds Calendly URL to profile
  - "Book a session" button links to Calendly
  - Don't take commission yet (too complex). Just drive traffic to coaches.
  - Track clicks (POST /api/analytics/coaching_click)
  - Time: 2-3 hours

- [ ] **Create sponsored hands feature**
  - Poker companies pay $100-500 to promote a hand
  - Feature badge on hand ("Sponsored by XYZ")
  - Separate sponsored section on homepage
  - Admin endpoint to approve sponsorships
  - Time: 3-4 hours

- [ ] **Add affiliate links (PokerStars, GTO Wizard)**
  - Create partners table (name, affiliate_url, commission_percent)
  - Add affiliate links in coach profiles, hand descriptions
  - Track clicks (POST /api/analytics/affiliate_click)
  - Time: 2-3 hours

- [ ] **Create ads dashboard**
  - Admin view: sponsored hands, affiliate clicks, revenue
  - Show: earnings, top sponsors, top partners
  - Time: 2-3 hours

- [ ] **Add creator revenue share (future)**
  - Create `creator_payments` table (creator_id, hand_id, views, revenue, status)
  - Calculate monthly payouts (hand views × $0.01-0.05)
  - Stripe payouts to creator account
  - Time: 4-5 hours (complex, maybe defer to V2)

- [ ] **Create payment webhooks**
  - Stripe webhooks for subscription events
  - Handle: customer.subscription.created, updated, deleted
  - Update subscriptions table
  - Update user premium status
  - Time: 3-4 hours

### Content Tools (3 tasks)

- [ ] **Add hand replay recording (optional)**
  - Record replay as video (client-side, use canvas?)
  - Save to S3
  - Auto-generate thumbnail
  - Share as video link
  - Time: 5-6 hours (complex, maybe defer)

- [ ] **Add batch hand import (CSV)**
  - Upload CSV with hands data
  - Parse & validate
  - Create hands in bulk
  - Show import progress
  - Time: 4-5 hours

- [ ] **Add hand statistics by game type**
  - Track stats per game type: 6max, HU, full ring, tournament
  - Dashboard shows breakdown
  - Filter hands by game type
  - Time: 2-3 hours

### Retention & Engagement (3 tasks)

- [ ] **Create onboarding tutorial**
  - Step 1: Create your first hand
  - Step 2: Like a hand
  - Step 3: Comment on a hand
  - Step 4: Follow a player
  - Show on first login
  - Time: 3-4 hours

- [ ] **Add daily streak counter**
  - Track days in a row user posted a hand
  - Show on profile
  - Fire notification if streak broken
  - Time: 2-3 hours

- [ ] **Create achievement system (future)**
  - Achievement types: 10 hands posted, 100 likes, 1K followers
  - Show badges on profile
  - Send notification on unlock
  - Maybe defer to V2
  - Time: 3-4 hours

### Testing & QA (2 tasks)

- [ ] **End-to-end tests (Playwright)**
  - Test full flow: signup → create hand → like → comment → follow
  - Test premium signup
  - Test coaching booking link
  - Run on every deploy
  - Time: 4-5 hours

- [ ] **Load testing**
  - Simulate 1000 concurrent users
  - Test feed endpoint latency
  - Identify bottlenecks
  - Use Apache JMeter or similar
  - Time: 3-4 hours

---

## P3: V2+ Advanced Features

These 40+ tasks are for V2, V3, V4. Do after achieving P0/P1 goals.

### Coaching Marketplace (10 tasks)

- [ ] **Create coaching sessions table**
  - `coaching_sessions` table (id, coach_id, student_id, scheduled_at, duration_minutes, cost, status, meeting_url, payment_intent_id)
  - Time: 2 hours

- [ ] **Implement Stripe Connect for coaches**
  - Setup Stripe Connect (marketplace payout)
  - Create coach stripe account during onboarding
  - Handle payouts (weekly to coach account)
  - Time: 6-8 hours (complex)

- [ ] **Create coaching session booking flow**
  - Calendar view of coach availability
  - Student picks time slot
  - Enter payment info
  - Confirm booking
  - Send confirmation email
  - Time: 6-8 hours

- [ ] **Create session recording & storage**
  - Record video during session (Zoom/OBS)
  - Upload to S3
  - Store recording URL
  - Coach + student can download
  - Time: 5-6 hours

- [ ] **Create session review system**
  - Student rates session (1-5 stars)
  - Provide feedback: communication, value, would book again
  - Calculate coach average rating
  - Time: 2-3 hours

- [ ] **Create coach payouts automation**
  - Weekly payout calculation (Stripe Connect)
  - Payout to coach bank account
  - Send payout report email
  - Webhook handling
  - Time: 4-5 hours

- [ ] **Create coaching profile analytics**
  - Coach dashboard: sessions booked, revenue, ratings, student reviews
  - Chart: revenue over time
  - List: upcoming sessions, past reviews
  - Time: 3-4 hours

- [ ] **Add coaching session notes (private)**
  - Coach can add notes after session
  - Linked to session record
  - Private (only coach sees)
  - Support markdown
  - Time: 2 hours

- [ ] **Create hand analysis within session (future)**
  - Coach can annotate hands during session
  - Shared screen (coach analyzes, student watches)
  - Auto-record annotations
  - Time: 8+ hours (complex, defer)

- [ ] **Create coaching certifications**
  - Create `certifications` table
  - Coach exam (multiple choice, 50 questions)
  - Pass = verified badge
  - Certification cost $50-100
  - Time: 5-6 hours (defer to V3)

### Analytics & Stats (8 tasks)

- [ ] **Create opponent database**
  - `opponent_stats` table (user_id, opponent_id, hands_vs, win_rate, profit_loss, last_played)
  - Denormalize stats on hand creation
  - Query opponent: GET /api/opponents/{opponent_name}
  - Time: 4-5 hours

- [ ] **Create position breakdown stats**
  - Track win rate by position (SB, BTN, CO, HJ, LJ, UTG)
  - Store in opponent_stats JSON or separate table
  - Dashboard widget
  - Time: 3-4 hours

- [ ] **Create game type breakdown stats**
  - Track win rate by game: 6max, HU, full ring, tournament
  - Dashboard breakdown
  - Time: 2-3 hours

- [ ] **Create variance calculator**
  - Calculate: hands played, win rate, BB/100, standard deviation
  - Estimate downswing probability
  - Show on dashboard
  - Time: 3-4 hours

- [ ] **Create hand filter system**
  - Filter by: position, game type, result, date range, opponent
  - Support multiple filters at once
  - Save filter presets
  - Time: 4-5 hours

- [ ] **Create PDF report export**
  - Monthly report: stats, charts, trends
  - Include: win rate, profit, hands, game breakdown
  - Export as PDF
  - Email to user option
  - Time: 4-5 hours

- [ ] **Create ROI calculator**
  - Track buy-ins, cashes, profit
  - Calculate ROI %
  - Tournament-specific metrics
  - Time: 3-4 hours

- [ ] **Create heat maps (position, action)**
  - Show positions where you win most
  - Show actions where you're profitable
  - Visual heat map
  - Time: 5-6 hours

### Mobile App (8 tasks)

- [ ] **Setup Expo project & navigation**
  - Create Expo project (npx create-expo-app)
  - Setup React Navigation (bottom tab + stack)
  - Create main screens (Feed, Create, Profile, Settings)
  - Time: 3-4 hours

- [ ] **Implement mobile auth screens**
  - Signup form (mobile-optimized)
  - Login form
  - Biometric login (Face ID, Touch ID)
  - Time: 4-5 hours

- [ ] **Implement mobile hand creation**
  - Form optimized for mobile (bigger inputs)
  - Card picker (visual, tap to select)
  - Camera integration (photo of hand, optional)
  - Time: 5-6 hours

- [ ] **Implement mobile feed**
  - Infinite scroll (React Native FlatList)
  - Swipe to like
  - Tap to view detail
  - Time: 3-4 hours

- [ ] **Implement mobile profile**
  - User profile view
  - Edit profile (photo upload)
  - Hands grid
  - Time: 3-4 hours

- [ ] **Setup push notifications (Expo)**
  - Request permission on first open
  - Register device token
  - Send test notification
  - Handle notification received
  - Time: 3-4 hours

- [ ] **Create offline mode (hands saved locally)**
  - Use AsyncStorage for cache
  - Save hands to device
  - Sync when online
  - Time: 4-5 hours

- [ ] **Build & submit to stores**
  - Build iOS + Android with EAS
  - Create app store accounts
  - Submit to Apple App Store, Google Play
  - Handle review process
  - Time: 2-3 hours (wait for review: 1-3 days)

### Advanced Social (6 tasks)

- [ ] **Create direct messages (1-on-1 chat)**
  - `messages` table (id, sender_id, recipient_id, content, read, created_at)
  - WebSocket for real-time
  - Message list + chat UI
  - Time: 6-8 hours

- [ ] **Create groups / communities**
  - `groups` table (id, name, description, created_by, is_private)
  - `group_members` table (group_id, user_id, role, joined_at)
  - Group feed (only members see)
  - Group settings
  - Time: 6-8 hours

- [ ] **Add emoji reactions to hands**
  - Emoji picker
  - Store reactions (post_id, user_id, emoji)
  - Display emoji counts
  - Time: 2-3 hours

- [ ] **Create user blocking**
  - Block user → don't see their hands
  - Blocked user can't see your profile
  - `blocked_users` table
  - Time: 2 hours

- [ ] **Create moderation tools**
  - Report hand/comment/user
  - `reports` table (id, reporter_id, reported_id, reason, status)
  - Admin dashboard to review reports
  - Ban users
  - Time: 4-5 hours

- [ ] **Create community guidelines**
  - Publish community guidelines page
  - During signup, user agrees to terms
  - Link in footer + help
  - Time: 1 hour

### Integrations (8 tasks)

- [ ] **Setup PokerTracker API integration**
  - Get PT4 API access
  - Create endpoint: POST /api/integrations/pokertracker/import
  - Parse PT4 hand history
  - Import hands in bulk
  - Time: 6-8 hours

- [ ] **Setup Hold'em Manager integration**
  - Get HM3 API access
  - Create endpoint: POST /api/integrations/hm/import
  - Parse HM hand history
  - Time: 6-8 hours

- [ ] **Setup PokerStars API (if available)**
  - Auto-import hands from PokerStars
  - Real-time sync option
  - User authenticates PokerStars account
  - Time: 8+ hours

- [ ] **Setup Twitch integration**
  - OAuth for Twitch login
  - Get user's Twitch channel info
  - Link to Pokza profile
  - Embed last Twitch clip on profile
  - Time: 4-5 hours

- [ ] **Setup GTO Wizard API**
  - Link solver analyses to hands
  - Show solver suggestion on hand detail
  - Affiliate link
  - Time: 4-5 hours

- [ ] **Create YouTube export**
  - Auto-generate video from hand (cards + board + actions)
  - Add music, transitions
  - Upload to YouTube (if user authed)
  - Share link
  - Time: 8+ hours (video generation is complex)

- [ ] **Setup Calendly for coaches**
  - OAuth for Calendly
  - Auto-sync availability
  - Booking redirects to Calendly
  - Maybe use Calendly API for direct booking
  - Time: 4-5 hours

- [ ] **Create Twitch stream overlay (future)**
  - Browser source for OBS
  - Show hand replayer in corner of stream
  - Real-time overlay during stream
  - Time: 8+ hours (defer)

### Gamification & Tournaments (6 tasks)

- [ ] **Create Pokza Leagues**
  - `leagues` table (id, name, start_date, end_date, prize_pool, status)
  - Leaderboard per league (points, hands)
  - Monthly leagues
  - Time: 5-6 hours

- [ ] **Create tournament bracket**
  - `tournaments` table (id, name, players, format)
  - Bracket generation (single elim, round robin)
  - Bracket display
  - Match results entry
  - Time: 6-8 hours

- [ ] **Create points/ranking system**
  - Award points for: hands posted, likes, comments, wins
  - Rank users by points
  - Display rank badge
  - Time: 3-4 hours

- [ ] **Create achievement badges**
  - Achievements: "10 hands", "100 followers", "1K likes"
  - Award on milestone
  - Display on profile
  - Send notification
  - Time: 3-4 hours

- [ ] **Create league/tournament prizes**
  - Admin set prizes (cash, poker coaching)
  - Auto-payout winners (Stripe)
  - Announce winners
  - Send payout confirmation
  - Time: 4-5 hours

- [ ] **Create tournament registration flow**
  - User registers for tournament
  - Pay entry fee (via Stripe)
  - Confirm registration
  - Send confirmation email
  - Time: 3-4 hours

### International (4 tasks)

- [ ] **Add multi-language support (i18n)**
  - Setup next-i18next
  - Translate UI: English, French, German, Spanish, Portuguese
  - Language selector in settings
  - Time: 6-8 hours (first language setup) + 2-3 hours per additional language

- [ ] **Add currency localization**
  - Support: USD, EUR, GBP, CAD, etc.
  - Convert stakes to user's currency (via API)
  - Show currency symbol
  - Stripe pricing in local currency
  - Time: 4-5 hours

- [ ] **Add regional leaderboards**
  - Leaderboard by country
  - Detect user location (IP geolocation)
  - Show regional top 100
  - Time: 3-4 hours

- [ ] **Create geo-restricted content (compliance)**
  - Restrict certain countries (poker regulations)
  - Show "not available in your region" message
  - Time: 2 hours

### Enterprise (5 tasks)

- [ ] **Create white-label replayer**
  - Embeddable hand replayer (iframe)
  - Custom branding (logo, colors)
  - API for poker sites
  - Documentation
  - Time: 8+ hours

- [ ] **Create B2B licensing API**
  - License hand database to PokerTracker, PT5, etc.
  - API endpoints: GET /api/b2b/hands (paginated)
  - Rate limiting per customer
  - Billing integration
  - Time: 6-8 hours

- [ ] **Create poker room dashboard**
  - For venue operators
  - Track popular hands created by players
  - Track popular coaching sessions
  - Venue analytics
  - Time: 6-8 hours

- [ ] **Create API documentation & SDKs**
  - OpenAPI/Swagger docs
  - Python/JavaScript SDK
  - Code examples
  - Time: 4-5 hours

- [ ] **Create customer support portal (Zendesk integration)**
  - Support tickets
  - FAQ
  - Chat support
  - Time: 4-5 hours

### AI & ML (5 tasks)

- [ ] **Create hand strength evaluation (future)**
  - Use Equilab or GTO algorithms
  - Evaluate hand: preflop strength, postflop decisions, range consistency
  - Display "quality score" on hand
  - Time: 8+ hours (defer to V3+)

- [ ] **Create leak detection (ML)**
  - Analyze user hands
  - Identify patterns (overfold SB, underbet flop, etc.)
  - Suggest improvements
  - Time: 8+ hours (defer, needs ML expertise)

- [ ] **Create personalized feed recommendation (ML)**
  - Recommend hands similar to ones user liked
  - Use collaborative filtering
  - A/B test engagement
  - Time: 8+ hours (defer)

- [ ] **Create cheat detection (ML)**
  - Flag suspicious patterns (impossible consistency)
  - Alert moderation team
  - Time: 8+ hours (complex, defer)

- [ ] **Create AI hand analyzer**
  - Integrate with GTO Wizard or custom solver
  - Provide line suggestions
  - Educational explanations
  - Time: 12+ hours (complex, defer)

---

## P4: Future Nice-to-Haves

These are ideas for later (V4+). Don't start these yet.

- [ ] Live table tracking (phone as scorecard)
- [ ] Real-time tournament coverage
- [ ] NFT hands (blockchain collectibles)
- [ ] Poker news aggregation
- [ ] Bankroll management tools
- [ ] Insurance products
- [ ] Lending services
- [ ] Esports broadcasts
- [ ] VR poker (future)
- [ ] AR hand visualization (future)

---

## Summary by Phase

**V0 (P0): 25 tasks, 8 weeks solo**
- Core: DB, API, Frontend, Social, Users, Deployment
- Estimated: 80-100 hours total

**V1 (P0 + P1): 30 additional P1 tasks**
- Polish, Monetization, Coaching, Email, Analytics, Testing
- Estimated: 60-80 hours additional

**V2 (P1 + P2): 25 additional P2 tasks**
- Advanced hands, Social amplification, Monetization, Content tools, Retention
- Estimated: 80-100 hours additional

**V3+ (P3): 40+ tasks**
- Coaching marketplace, Analytics, Mobile, Integrations, Tournaments, International, Enterprise
- Estimated: 200+ hours total

---

## How to Use This Backlog

1. **Start with P0.** These 25 tasks are your MVP. Do them in order (DB → Backend → Frontend → Social → Users → Deployment).

2. **Track progress.** Mark tasks complete as you finish.

3. **Estimate time.** Use the time estimates as a rough guide. Adjust based on your experience.

4. **Communicate status.** Update this file weekly with how many P0/P1/P2/P3 tasks you've completed.

5. **Reprioritize as needed.** If you discover a blocker or dependency, move tasks around.

6. **Ship incrementally.** Don't wait to complete all P0 tasks before deploying. Deploy after Database + Backend API is ready (week 2). Then Frontend (week 4). Then each new feature.

---

## Velocity Tracking

Track your progress here:

```
Week 1-2: Database + Backend setup (3 DB tasks, 6 Backend tasks) = 9 tasks
Week 3-4: Frontend auth + hand creation (4 Frontend tasks) = 4 tasks
Week 5-6: Social features (5 tasks) = 5 tasks
Week 7-8: User features + deployment (4 User tasks, 3 Deploy tasks) = 7 tasks
Total: 25 P0 tasks ✓ Launch!

Week 9-14: P1 tasks (30 tasks, 12 weeks part-time) = Polish + Monetize
Week 15+: P2 tasks = Growth features
```

**Metric:** If you're doing 3-5 tasks per week solo, you'll ship V0 in 8 weeks (25 tasks / 3-4 per week).

