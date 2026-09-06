# Le corpus de hand histories

**Dix-sept** vraies mains — **cinq** rooms et **un outil de suivi** —, toutes vérifiées au jeton et
au centime près. Elles alimentent
`scripts/test-import.js`, qui les rejoue dans le moteur de Pokza et compare le résultat à ce que
chaque fichier annonce de lui-même.

**Ce dossier est le vrai coût du chantier.** Le parseur ne coûte rien à faire tourner ; ce qui est
rare, c'est la matière. Une main d'une salle qu'on n'a jamais vue vaut plus que dix mains de plus
sur celles-ci — la grammaire est aujourd'hui ajustée sur deux points, ce qui ne définit pas encore
une famille.

## ⚠️ LES PSEUDOS SONT REMPLACÉS. NE PAS LES REMETTRE.

Le dépôt est **public**. Une hand history porte les pseudos, les tapis et parfois les cartes de
joueurs qui n'ont rien demandé — exactement ce que l'architecture de l'import évite en gardant
toute la lecture sur l'appareil. Chaque nom a donc été remplacé par un nom **de même forme**, et
rien d'autre n'a bougé : aucun montant, aucune carte, aucun espace, aucune ligne.

« De même forme » n'est pas cosmétique — c'est ce que le parseur regarde :

| Propriété préservée | Pourquoi elle compte |
|---|---|
| Les espaces **dans** les noms (`Grande pile`) | Interdit toute découpe des lignes sur les blancs |
| Les **espaces doubles** (`Roi  faucon`) | Aucune normalisation des blancs n'est permise |
| Les noms **tout en chiffres** (`40118732`) | Un nom peut ne pas ressembler à un nom |
| Les chiffres **dans** un nom (`villas27QJ`) | Un nom peut contenir ce qui ressemble à un montant |
| Les **préfixes communs** (`Incognito 1` / `Incognito 2`) | Force le rapprochement du plus long au plus court |

Les deux masques `Incognito 1` et `Incognito 2` sont **conservés tels quels** : ce ne sont pas des
identités mais les placeholders que Winamax écrit lui-même sur ses tables anonymes, et ils sont un
cas de test à part entière (importer ces noms-là serait pire que rien — l'acronyme de position en
dit plus).

**Note sur GGPoker** : ses pseudos sont **déjà anonymes à la source** (`bf27d3a`, `Hero`) — la room
anonymise elle-même. Rien à retirer, et c'est un cas de test à part entière : un nom peut n'être
qu'une empreinte.

**Pour ajouter une main :** retirer les pseudos de la même façon avant de la commiter, en gardant
la forme. Une main dont on ne peut pas retirer les noms sans casser sa structure n'a pas sa place
ici — la garder hors du dépôt et la faire tourner localement vaut mieux que la publier.

## Ce que chaque main éprouve

| Fichier | Ce qu'elle apporte au filet |
|---|---|
| `winamax-cash-bbcode.txt` | Notation BBCode : balises `[b]…[/b]`, **cartes sur la ligne suivante**, un crochet par carte, couleur en MAJUSCULE. Table incognito. Un tapis déduit d'un « and is all-in ». |
| `winamax-cash-incognito-heads-up.txt` | **Celle qu'un essai à l'écran a trouvée** (main de 2025/12) : Winamax écrit sur ses tables incognito une ligne `Player Info: Seat1: P1-<32 hexa>` qui donne l'**identifiant stable** du joueur masqué. Le dialecte ne la connaissait pas et refusait toute la main. Plus : **2 joueurs sur une table 3-max**, le bouton qui poste la petite blinde, `raises 3€ to 5€` (incrément *et* total sur la même ligne), et un masque `Incognito 1` à côté d'un joueur nommé. ⚠️ L'identifiant est **remplacé** ici : il suit le joueur de main en main, donc il identifie mieux qu'un pseudo. |
| `winamax-cash-sidepot.txt` | L'autre notation Winamax (`*** … ***`, couleur en minuscule). Abattage à trois, **pots secondaires**, une mise non suivie de 149 €, et le résumé qui **nomme les blindes**. |
| `winamax-tournoi-split.txt` | Tournoi : **un ante par joueur**, une prime en euros sur la ligne de siège, un nom d'épreuve de 41 caractères, un niveau, un **pot partagé**, un nom à espace double, le Dix écrit `T`. |
| `betclic-cash-fold.txt` | Signature **anonyme** (aucune salle nommable). 4 distribués sur une table `Size: 5`. Séparateur de milliers (`€1,330.78`). `Call` en incrément. Aucun `Board:` de résumé. |
| `betclic-cash-showdown.txt` | `Shows` contre `Mucks`. Cartes dans l'**ordre inverse** (`[SK SA]`). Égalité au sommet des engagements → aucune mise non suivie. |
| `betclic-tournoi.txt` | **La main qui a révélé la limite des contrôles** : des `€` sur des jetons de tournoi. Lue comme du cash, tout est cohérent et les six contrôles passent. Plus le verbe `Allin`, qui est un incrément. |
| `ggpoker-cash-cashout.txt` | **Gardée pour ce qu'elle REFUSE** : un cashout, où le gagnant touche un quart de moins que le pot affiché (décision de Victor). Sans ses deux lignes de cashout elle se lit parfaitement — c'est le cashout qu'on refuse, pas GGPoker. C'était aussi la première room sans dialecte dédié. `Dealt to <nom>` sans cartes pour chaque joueur, les lignes de **Cashout**, les mains **montrées en cours de street** (qui polluaient le board), et une **troisième convention de pot** : Σ − non suivi, rake NON déduit. |
| `pokerstars-tournoi-ante-prime.txt` | 9-max, un ante par joueur, niveau en chiffres **ROMAINS**, buy-in à **trois parts** avec code ISO, et une **prime d'élimination** qui n'est pas un gain de pot. |
| `pokerstars-cash-heads-up.txt` | **Deux joueurs** : le bouton EST la petite blinde. `Uncalled bet` annoncé, `doesn't show hand`, et un siège du résumé qui porte **deux parenthèses** (`(button) (small blind)`). |
| `pokerstars-cash-8max.txt` | Cash 8-max ordinaire — la main de contrôle, celle qui n'a rien de spécial. |
| `positions-cash-totaux.txt` | **La notation par POSITIONS**, celle d'un outil de suivi et non d'une salle : les sièges *sont* les positions, il n'y a ni numéro de siège, ni bouton, ni nom de table. Board donné **en bloc et collé** en tête (`8h7h6dKc3h`), montants en **TOTAUX** de street (l'inverse de la famille partypoker), **six sièges portant le même libellé** (`Unknown`), et des tapis déclarés sur deux sièges seulement. Σ = 1155 = le gain annoncé. |
| `positions-cash-straddle.txt` | **Le premier straddle jamais lu depuis un fichier** : `post TB 8` sur des blindes 2/4, par le premier parleur. Plus une table de **10**, un `MP` que Pokza appelle `UTG3`, un `UTG1` qui est l'`UTG` de Pokza — et un **pot partagé** (423 + 423 = 846 = Σ). |
| `positions-observee-sans-heros.txt` | **Celle qui m'a corrigé deux fois.** Une main de tournoi de l'outil : Σ = 608 = le gain annoncé, l'ordre de parole tombe exact — et pourtant elle est **refusée**, faute de point de vue. Elle a démenti que `c/` marque le héros (elle en porte **quatre** : `c/` veut dire « cartes connues »), et révélé qu'un siège peut n'avoir **aucun libellé** (`: Unknown`) — le compter donnait 8 places pour 7 joueurs. Plus `Xx` (carte inconnue), `mucked`, et un siège qui mucke alors que le tirage connaît ses cartes. ⚠️ **Et rien dedans ne dit que c'est un tournoi** : blindes 2/5, comme la main de cash. |
| `positions-cash-tronquee.txt` | **Gardée pour ce qu'elle REFUSE** : `*** RIVER ***` annoncé, la 5ᵉ carte au board, et rien dessous. Elle publiait une river que personne n'a jouée. C'est elle qui a fait ajouter le contrôle « une carte distribuée doit avoir eu de l'action, sauf si tout le monde est à tapis ». Sans sa river muette, elle se lit. |
| `pmu-tournoi-pots-secondaires.txt` | **PMU, et c'est la famille partypoker** (PMU Poker tourne sur PartyGaming). Tournoi : un ante par joueur, `Trny:`/`Level:` **répétés en lignes à part**, `Blinds-Antes(2 500/5 000 -500)` où l'espace sépare les milliers, un `€` dans le **nom d'épreuve**, des tapis à virgule (`77,261`), **quatre pots secondaires** emportés par le même joueur, et des **places payées en euros** au milieu d'une main en jetons. Σ = 223 226 = la somme des quatre pots, et **quatre tapis atteints au jeton près**. |
| `pokerstars-tournoi-siege-leve.txt` | **Celle qui m'a corrigé** : un joueur marqué `is sitting out` **poste quand même son ante** et se couche. Le drapeau ne veut pas dire « non servi ». |

## ⚠️ Ce dossier ne contient QUE du réel

Les mains **synthétiques** — écrites d'après ce qu'on croit savoir d'un format, pour éprouver la
grammaire générique — vivent dans `scripts/test-import.js`, pas ici. La distinction n'est pas
cosmétique : une main de ce dossier prouve quelque chose sur le monde, une main synthétique ne
prouve que la cohérence du lecteur avec sa propre hypothèse. Les mélanger ferait passer la seconde
pour la première.

## ⚠️ AUCUN JEU DE TEST NE REMPLACE UNE VRAIE MAIN DE PLUS

Mesuré le 06/09/2026, et c'est la leçon la plus utile du dossier : **25 vraies mains Winamax au banc
et 16 au corpus n'avaient jamais montré la ligne `Player Info:`**. Un écran essayé UNE fois par son
auteur a trouvé ce que ni le corpus ni le banc ne contenaient. Le corpus prouve la non-régression ;
il ne prouve pas la couverture.

## Où trouver de vraies mains
Le web en est plein — forums d'assistance de PokerTracker et Holdem Manager, fils de revue de main,
Wikipédia. **Deux précautions**, apprises le 04/09/2026 :
* **le balisage abîme le texte** : une main tirée de Wikipédia arrivait avec ses astérisques
  enveloppées dans `<nowiki>`, et se faisait refuser au stade de la signature. Vérifier le brut ;
* **noter la date** : les formats bougent (une main de 2009 dit `PokerStars Game #`, les récentes
  `PokerStars Hand #`). Une main ancienne qui se vérifie enseigne quand même la structure ; elle ne
  prouve rien sur le format d'aujourd'hui.
Le filtre, c'est les six contrôles : une main tronquée ou reformatée par un forum ne tombe pas
juste et se fait refuser. Si le pot se recoupe au centime, la main est authentique ET complète.

## La famille partypoker / 888 — lue depuis le 05/09, sans une seule main ici

`party888` lit **partypoker, 888poker et leurs habillages** (`LuckyAcePoker.com`, `Cassava`).
Grammaire mesurée sur **84 vrais fichiers**, et **aucun n'est commitable** : le dépôt d'où ils
viennent n'a aucune licence. Les mains qui éprouvent ce dialecte sont donc **synthétiques**, et
vivent dans `scripts/test-import.js` — pas ici, conformément à la règle ci-dessus.

**Le tournoi de cette famille est mesuré depuis le 05/09** : `pmu-tournoi-pots-secondaires.txt`
est une vraie main PMU, et elle est ici. Ce qui manque encore, c'est une main de **cash game** de
partypoker ou de 888 — les 84 fichiers du banc en sont pleins, mais aucun n'est commitable.

⚠️ **Et cette main prouve pourquoi le garde-fou des tournois était juste.** Avant elle, le dialecte
refusait `Trny:` faute d'avoir jamais vu un tournoi de la famille. Sans ce refus, elle se lisait
comme un **cash game à 2 500/5 000 €** — le `€0.50` du buy-in habillant des jetons — et elle passait
**les six contrôles**, exactement comme `betclic-tournoi.txt`. Un en-tête qui porte `Tournament` ou
`Level` **sans** `Trny:` reste refusé : cette forme-là n'a toujours pas été mesurée.

Ce que la mesure a donné, et qui ne s'invente pas :

| Fait mesuré | Conséquence |
|---|---|
| `raises [$0.70]` **n'a pas de « to »** | Prouvé INCRÉMENT par l'arithmétique de 2 mains, dont une où l'autre lecture donne un rake négatif. La grammaire générique, elle, a raison de refuser cette tournure : les deux lectures y sont plausibles. |
| `is all-In  [$4.90]` (double espace) | L'exact reste du tapis, au centime, sur deux mains |
| L'en-tête **se nomme, ou pas** | `***** 888poker Hand History for Game N *****` contre `***** Hand History for Game N *****`. Le nom est CAPTURÉ, jamais listé — c'est ce qui a fait apparaître tout seuls `LuckyAcePoker.com` et `Cassava` (la maison mère de 888) |
| **Deux équations du pot dans la même famille** | `wins $X` (partypoker) = Σ − rake, la mise non suivie DEDANS ; `collected [ $X ]` (888) = Σ − non suivi − rake. C'est le VERBE du gain qui les sépare, et les deux ne cohabitent dans aucun fichier |
| **Ni « Total pot » ni rake** | Le contrôle nº 6 perd son équation exacte. D'où la borne ajoutée : *on n'encaisse pas plus qu'on n'a misé* — une inégalité, sans aucun seuil |
| Un siège **assis mais non servi**, sans que rien ne le dise | Aucun `is sitting out`, aucun drapeau : le joueur n'écrit simplement AUCUNE autre ligne. Lu comme servi, la grosse blinde tombait sur son voisin |
| `Total number of players : 6/6` | Témoin gratuit sur un collage tronqué |
| Blinde morte : `posts big blind + dead [$3]` et `posts dead blind [$1 + $2]` | **Refusée**, comme le straddle : Pokza n'a pas de modèle pour une part morte, et le formulaire non plus |

## La notation par positions — ce qu'elle donne, ce qu'elle enlève

Le dialecte `positions` lit un **outil de suivi**, pas une salle. Conformément à la décision nº 4,
**un outil ne donne son nom à rien** : le champ « Lieu » reste vide et la main s'affiche « importée »
tout court. Le dialecte porte le nom de sa *notation*, pas celui du produit — ce qui est de toute
façon la règle du chantier, et vaudra pour le prochain outil qui écrira pareil.

**Elle donne le placement.** Partout ailleurs, tout dépend d'une seule donnée — quel siège porte le
bouton — que rien d'autre ne dit. Ici elle est écrite. Le dialecte fabrique donc des numéros de
siège tels que l'anneau du montage redonne exactement ces positions : **aucune ligne de logique
partagée ne bouge**. Et ce n'est pas trivialement vrai pour autant — c'est l'ORDRE des lignes du
tirage qui fait l'anneau (de la SB au bouton), et le contrôle nº 2 le vérifie.

**Elle enlève trois choses**, et il faut le savoir :

| Ce qui manque | Ce que Pokza en fait |
|---|---|
| **Les tapis** — seuls les sièges annotés portent un `s/` | Les autres reçoivent le stack effectif, le défaut que `buildSeats` applique déjà à un siège non renseigné du formulaire. Ce n'est pas une invention, mais **le contrôle nº 4 n'a plus rien à mordre** sur ces sièges. |
| **La devise** — aucun signe, aucun code | `devise` reste absente et l'affichage retombe sur l'euro. Corrigible par l'auteur en remontant d'une étape. |
| **Le type de partie** — rien ne distingue le cash du tournoi | Lu comme du **cash**. C'est le trou connu de ce dialecte, du même genre que celui qui a fait écarter WinningPoker ; la différence est qu'ici l'intégration est une demande explicite. |

⚠️⚠️ **LE TROU N'EST PLUS UNE SUPPOSITION, IL EST MESURÉ.** `positions-observee-sans-heros.txt` est
une main de **tournoi** — et **rien dedans ne le dit** : mêmes blindes (2/5) que la main de cash,
aucun ante, aucun niveau, aucun buy-in, aucune devise. La notation ne distingue pas les deux, point.
Une main de tournoi avec un héros se lirait donc comme du cash, avec des euros sur des jetons.
L'auteur le voit sur la ligne de contexte à l'étape « Publier » et peut redescendre le corriger —
**mais rien ne l'en prévient**, et c'est la question ouverte (faut-il avertir à chaque import de
cette notation ?).

## Ce qui manque encore

* **Une vraie main de CASH GAME de partypoker ou de 888** (le tournoi est couvert par la main PMU).
* **Unibet** — repérée le 05/09 comme une **troisième famille**, propriétaire depuis qu'Unibet a
  quitté le réseau MicroGaming/Prima vers 2014. Grammaire partiellement relevée sur une main de
  2023 (donc récente, contrairement au banc) :
  `Game #1899891412: Table €8 Unibet Live Freeroll - 50.00/100.00 - No Limit Hold'Em - 10:21:10 2023/06/22`,
  puis des blocs `*** Seated players ***` et `*** Blinds and button ***`, des lignes
  `X has the button`, `X posts ante 12`, `X posts small blind 50` — **montants NUS, sans crochets ni
  sigle**. Il manque les lignes d'ACTION et les marqueurs de street : sans elles, rien à écrire.
  ⚠️ Unibet ne permet pas l'export en masse ; l'onglet « History » du client montre les 500
  dernières mains **une par une**. Une seule main copiée depuis là suffirait.
* **WinningPoker (Americas Cardroom / WPN)** — grammaire ENTIÈREMENT mesurée le 05/09 et pourtant
  **non écrite**, pour trois trous qui portent tous sur de l'ARGENT :
  1. le fichier n'écrit **aucune devise** — pas un seul `$` dans 40 fichiers ;
  2. il n'écrit **aucune limite de mise** — juste `(Hold'em)`, donc rien ne distingue le no-limit
     du limit ;
  3. il n'écrit **rien qui distingue le cash du tournoi**, sur un réseau très orienté tournoi.
  Le troisième est celui qui interdit : lu comme du cash, un tournoi passe les six contrôles avec
  des euros sur des jetons (c'est exactement la main Betclic de `betclic-tournoi.txt`). Ce qui est
  déjà acquis, et qui rendrait le dialecte rapide à écrire : `raises (X)` est un **incrément**
  (prouvé sur 4 mains), `Player X received a card.` désigne **exactement les joueurs servis** (le
  meilleur signal de distribution de toutes les salles mesurées), et le résumé donne le jeu de
  témoins le plus riche du chantier — pot, rake, mise non suivie annoncée, `Board:`, gagnants.
  **Il suffit d'une vraie main de tournoi ACR pour débloquer la salle.**
* **iPoker, Merge, OnGame, Entraction, MicroGaming, BossMedia** — hors des deux familles.
  OnGame et Entraction sont du texte (réseaux fermés) ; **iPoker, Merge, MicroGaming et BossMedia
  écrivent du XML**, et iPoker code même ses actions en NUMÉROS (`type="23"`) : une lecture par
  dialecte texte n'y suffira pas.
* ⚠️ **Ne pas compter sur les jeux de test des parseurs open source.** Mesuré le 04/09 sur 494
  fichiers : **488 sont hors périmètre**, parce que ces outils font du data-mining et travaillent
  donc sur des mains OBSERVÉES — sans héros, donc sans point de vue. Et le plus gros d'entre eux
  n'a AUCUNE LICENCE, donc rien n'en est commitable. Chercher des mains **partagées** (forums,
  revues de main) vaut beaucoup mieux.
* ⚠️ **Et se méfier du classement par « grosse salle ».** Ce qui compte, c'est ce que les joueurs
  de Pokza utilisent. Sur le marché français : Winamax ✅, Betclic ✅, PokerStars.fr ✅ (famille
  générique), **Bwin/partypoker.fr ✅ depuis `party888`**. Restent **PMU** et **Unibet**, qui ont
  chacun leur propre logiciel et dont on n'a **aucun fichier** — elles valent plus que n'importe
  quelle salle du banc.
* Un **straddle** en ligne : la tournure n'a jamais été mesurée, et on refuse plutôt que de
  l'inventer.
* Un **Omaha**, une main **à deux joueurs**, un `Uncalled:N` chez Betclic (l'équation du pot en
  dépend peut-être), et le Dix écrit `10` quelque part.
