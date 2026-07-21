# Tasks

Pokza development backlog. All tasks V0-V4. Each task < 1 day of work.

> ⚠️ **Note réalité vs docs :** le code réel (`pokza-app/`) est une app **Expo/React Native**
> avec un créateur de main + replayer + feed déjà fonctionnels (in-memory). Une partie des
> tâches P0 ci-dessous est donc déjà faite ou hors-sujet (ex : « Setup Next.js »). À réconcilier.

---

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

