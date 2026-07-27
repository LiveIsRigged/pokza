# Tasks

Pokza development backlog. All tasks V0-V4. Each task < 1 day of work.

> ⚠️ **Note réalité vs docs :** le code réel (`pokza-app/`) est une app **Expo/React Native**
> avec un créateur de main + replayer + feed déjà fonctionnels (in-memory). Une partie des
> tâches P0 ci-dessous est donc déjà faite ou hors-sujet (ex : « Setup Next.js »). À réconcilier.

---

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

