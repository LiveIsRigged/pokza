# Textes légaux Pokza — état & à compléter

**Statut : BROUILLON.** À faire relire par un juriste avant l'ouverture publique.
Tant que ce n'est pas relu, un bandeau « Version provisoire, en cours de relecture juridique »
s'affiche dans l'app. Pour le retirer : passer `LEGAL_DRAFT` à `false` dans
`pokza-app/src/legal/legalContent.ts`.

## Où vit le contenu (source de vérité unique)

Tout le texte est dans **`pokza-app/src/legal/legalContent.ts`** — c'est ce qui s'affiche dans
l'app *et* sur le web (même base de code Expo). Ce fichier `.md` n'est qu'un guide ; il ne faut pas
recopier le texte ailleurs. Pour relire, ouvre soit `legalContent.ts`, soit l'écran rendu dans
l'app (menu → « Informations légales »).

## Les 4 documents

1. **Conditions générales d'utilisation** (`cgu`)
2. **Politique de confidentialité** (`confidentialite`)
3. **Mentions légales** (`mentions`)
4. **Jeu responsable** (`jeu-responsable`) — avertissement ANJ + Joueurs Info Service

## Où c'est accessible dans l'app

- **Menu latéral → « Informations légales »** : index des 4 documents, consultable à tout moment.
- **Écran d'inscription** : case à cocher obligatoire « Je certifie avoir 18 ans et j'accepte les
  conditions d'utilisation et la politique de confidentialité », avec les deux liens cliquables.
  Impossible de créer un compte sans cocher.

## Parti pris rédactionnel

- Éditeur = **personne physique (Victor Hoogstoël), à titre non professionnel**, service gratuit :
  pas de société, pas de SIRET, pas de médiation de la consommation à ce stade (à mettre en place si
  le service devient payant/professionnel).
- La **date et le lieu de naissance de l'éditeur ne sont volontairement PAS publiés** (aucune
  obligation légale, donnée sensible).
- Adresse postale de l'éditeur non publiée par défaut (option prévue par la LCEN art. 1-1, II pour
  un éditeur non professionnel : adresse communiquée à l'hébergeur, pas au public).

## À COMPLÉTER / VÉRIFIER

### Déjà rempli
- [x] **Email de contact** général (`CONTACT_EMAIL`) → `contact@pokza.app` (alias Cloudflare Email Routing → Gmail).
- [x] **Email données personnelles** (`PRIVACY_EMAIL`) → `privacy@pokza.app` (idem).
- [x] **abuse@pokza.app** — alias Cloudflare Email Routing → Gmail, en place.
- [x] **Adresse de l'éditeur** : décision = **non publiée** (LCEN art. 1-1, II, éditeur non professionnel).
- [x] **Hébergeur Supabase** → Supabase Pte. Ltd, 65 Chulia Street #38-02/03, OCBC Centre, Singapour
      049513 (adresse du DPA officiel), infra AWS UE (Francfort).
- [x] **Hébergeur / e-mails Resend** → Plus Five Five, Inc., 2261 Market Street #5039, San Francisco,
      CA 94114, USA (transfert hors UE encadré par clauses contractuelles types).
- [x] **PostHog** : décision = **conservé, offre UE (`eu.posthog.com`)** — pas de transfert hors UE pour
      l'analytics.
- [x] **Transferts hors UE** : rédigés — Resend (e-mails) et GIPHY (GIF) = US, encadrés par CCT ;
      données principales + analytics restent en UE.
- [x] **Durée de conservation des journaux techniques** → **12 mois max**.
- [x] **Cookies / mesure d'audience** : décision = **pas de bandeau**, PostHog rédigé en mode
      **exempté de consentement** (voir conditions ci-dessous).

### Reste à faire
- [ ] **Date de mise en ligne** (`LEGAL_UPDATED`) : à figer le jour du passage `LEGAL_DRAFT=false`
      (= jour de publication, avant le 25 août). Ce n'est PAS la date de mise en ligne du service, mais
      la date d'entrée en vigueur de cette version des textes.
- [x] **Entité Supabase** — TRANCHÉ le 21/08/2026 : on garde **celle du DPA** (Supabase Pte. Ltd,
      Singapour). Le juriste : « celle du DPA ça doit être bon, après y'a un moment où tu peux pas
      faire beaucoup plus que te fier à leurs informations. » Aucun changement de texte.
- [ ] **CONDITION cookies (bloquant technique)** : la section « exemptée de consentement » n'est vraie
      QUE si PostHog est effectivement configuré ainsi : mesure d'audience seule, IP anonymisée, pas
      de suivi inter-sites, pas de recoupement, durée de vie ≤ 13 mois, pas de partage à des tiers.
      Si l'une de ces conditions n'est pas remplie → il FAUT un bandeau de consentement.
      **PostHog est désormais intégré** (`pokza-app/src/analytics/index.web.ts`, web seulement) et le
      code coupe déjà autocapture, session replay, heatmaps, sondages, web vitals et cookies
      inter-sous-domaines. **Restent à confirmer dans le dashboard PostHog** (hors code) :
      l'anonymisation d'IP et la rétention ≤ 13 mois. Le juriste a rendu ce point porteur le
      21/08 (voir son point 4 plus bas) : sans anonymisation d'IP, l'exemption tombe.
- [x] **Téléphone hébergeur** — TRANCHÉ le 21/08/2026 : **laissé absent**. Supabase ne publie pas
      de numéro ; le juriste : « laisse absent si tu trouves vraiment rien ». Aucun changement de
      texte. À reprendre seulement si Supabase venait à en publier un.
- [x] **Relecture juriste ami** : 1er passage + ses réponses aux 5 questions reçus et intégrés le
      21/08/2026 (voir plus bas). La case à cocher de consentement est codée, la trace en base est
      posée et mesurée sur DEV et PROD.
- [x] **2ᵉ passage juriste** — FAIT le 21/08/2026. Ses 4 réponses (entité Supabase, téléphone
      hébergeur, réserve consommateur, base légale de l'IP) n'ont demandé **aucun changement de
      texte**. La question de l'âge qu'il a rouverte a été tranchée en interne, voir plus bas.
- [ ] **Déploiement de l'app** puis `consentement-identite-cloture.sql` sur DEV et PROD. Suspendu au
      21/08 : une autre session travaille dans l'arbre (chantier groupes + création de main), on ne
      pousse pas tant qu'elle n'a pas fini.
- [ ] **`LEGAL_DRAFT = false`** — le geste final, une fois tout ce qui précède clos.

## Notes pour le juriste
- **Médiation de la consommation** : volontairement NON mentionnée. Le service est gratuit et
  non professionnel → le dispositif de médiation conso (art. L.612-1 C. conso) n'a pas vocation à
  s'appliquer. À mettre en place SI le Service devient payant/professionnel.
- **PostHog** : décision de le garder mais il n'est pas encore intégré dans le code au moment de la
  rédaction — les textes anticipent une intégration en UE avant le lancement.

## Rappels déjà cohérents avec le code

- Rétention **signalements : 12 mois** après traitement ; **contenus retirés : 30 jours** — appliqué
  par les crons pg_cron (`docs/dev/moderation-crons.sql`).
- Suppression de compte en self-service (« Modifier mon profil ») avec cascade.
- Modération réactive + statut d'hébergeur LCEN.

## Retour du juriste — 1er passage (21/08/2026)

Corrections reçues (`Pokza_clean.docx`, sans modifications suivies, 4 commentaires) et **intégrées
dans `legalContent.ts`** :

- CGU §8 : la responsabilité écartée est celle de l'**hébergeur**, non de l'éditeur.
- Mentions légales : l'adresse non publiée relève de l'**art. 1-1, II** de la LCEN (et non 6-III-2).
- Confidentialité : les **bases légales se raisonnent par type de donnée**, pas par finalité — d'où
  la réécriture de la section. Prénom/nom/date de naissance passent sous **consentement**.
- Confidentialité : la liste des données ne retient que les **données personnelles** (contenus,
  relations et notifications retirés).

### Écarts assumés par rapport à son fichier

Repris volontairement, à lui signaler :

- « Nous ne vendons pas tes données. » **conservée** (il l'avait supprimée).
- « Nos données sont traitées par des prestataires » → **« Elles »** (coquille de sa version).
- CGU §5 : « conformément… conformément » dédoublé, et titre officiel rétabli (*loi pour la
  confiance dans l'économie numérique*).
- Accords grammaticaux des durées de conservation (« conservées / supprimées »).

### Ses réponses aux 5 questions (21/08/2026) — toutes intégrées

1. **« Jeu responsable »** : sauté au copier-coller, à conserver tel quel. → conservé, aucun
   changement.
2. **Finalité sécurité** : à ajouter en prose après la puce « Données d'usage et techniques »,
   sans toucher aux bases légales. → phrase ajoutée (maintenance, modération, sécurité des
   utilisateurs).
3. **Majorité sous consentement : CONFIRMÉ.** Son raisonnement : aucune loi n'impose de vérifier
   la majorité ici (réseau social, aucun pari ni jeu d'argent) ; sans obligation légale, **la base
   la plus forte est le consentement**. Et le retrait du consentement vaut suppression du compte —
   c'est l'effet voulu, pas un problème. → texte inchangé, consentement maintenu.
4. **Adresse IP ≠ cookies.** Que la mesure d'audience soit exemptée de consentement ne dit rien de
   l'IP : dès qu'elle est traitée par d'autres mécanismes, il faut le déclarer explicitement.
   → la puce n'attribue plus l'IP au seul outil d'audience, et un paragraphe déclare son traitement
   dans les journaux techniques, chez Cloudflare et chez GIPHY.
5. **Tribunal** : « dans le doute mets le TJ de Paris ». → CGU §11 désigne le tribunal judiciaire
   de Paris.

**« Nous ne vendons pas tes données »** : il trouve la formule inutile (« si tu le fais pas, pourquoi
le dire ? ») mais sans objection juridique — laissé au choix de Victor, **conservé**.

### Les deux arbitrages de rédaction — VALIDÉS le 21/08/2026

- **CGU §11, réserve consommateur** : validée. « Ça mange pas de pain, au pire c'est inutile. »
  Le texte reste tel quel.
- **Base légale de la finalité sécurité** : sa rédaction stricte est CONFIRMÉE, et la suggestion
  d'« intérêt légitime » écartée. Sa règle : **« l'intérêt légitime c'est la base la plus faible,
  il faut éviter de la mettre — c'est quand t'as rien d'autre. »** L'adresse IP reste sous
  *exécution du contrat*, parce que la traiter est inévitable pour faire fonctionner l'app via
  l'hébergeur. **À retenir pour toute rédaction future sur ce projet** : ne pas proposer l'intérêt
  légitime tant qu'une autre base tient.

### Vérification de l'âge — TRANCHÉ EN INTERNE le 21/08/2026 : on ne change rien

Le juriste a rouvert la question en fin de deuxième salve (« tu penses que t'es obligé de vérifier
l'âge sur l'app ? j'en suis pas sûr »), sans la trancher. **Décision prise sans lui**, pour ne pas
faire durer les allers-retours : le service continue de collecter la date de naissance et de se
réserver aux 18 ans et plus. Aucun changement de texte, de code ni de base.

**Pourquoi la décision tient sans avoir à trancher la question juridique.** La bonne question n'est
pas « y a-t-il une obligation de vérifier l'âge », mais « garde-t-on la date de naissance ». Sous
chacune des lectures possibles, la réponse est oui :

1. **L'argument décisif, qui découle de sa propre rédaction.** Il a établi que la seule base légale
   du traitement de l'état civil est le **consentement**. Or l'art. 8 du RGPD rend invalide le
   consentement d'un mineur de moins de 15 ans sans accord d'un titulaire de l'autorité parentale.
   Pour que le consentement sur lequel repose toute l'architecture déployée soit valable, il faut
   donc savoir que l'utilisateur n'a pas moins de 15 ans — et c'est la date de naissance qui le
   permet. **Retirer le contrôle d'âge ferait tomber la validité du consentement qu'on vient de
   tracer.**
2. Même sous la lecture la plus exigeante — celle où la **loi n° 2023-566 du 7 juillet 2023 sur la
   majorité numérique** s'appliquerait pleinement — l'obligation porterait sur le refus des moins
   de 15 ans. Pokza refuse déjà en dessous de 18 : on fait plus, pas moins.
3. S'il n'y a aucune obligation, la base reste le consentement, déjà implémenté et tracé.
4. Retirer le 18+ contredirait les CGU §3, la section *Mineurs* et tout le document *Jeu
   responsable*, qui renvoient à l'ANJ et à Joueurs Info Service. Une plateforme poker qui
   proclame 18+ sans rien contrôler est en plus mauvaise posture que si elle ne le proclamait pas.

**Sur le caractère déclaratif du contrôle** (case « je certifie avoir 18 ans », sans pièce) : ce
point figurait en toutes lettres sur la première page du PDF soumis au juriste, dans la liste des
questions posées. Il a relu les quatre documents et laissé quatre commentaires — aucun là-dessus.
Le déclaratif a donc été vu et non contesté ; son doute tardif porte sur l'utilité du contrôle, pas
sur sa forme.

**Ce qui rouvrirait le dossier** (et là il faudra vraiment son avis) :
- Pokza devient payant, professionnel, ou change d'échelle ;
- publication du décret d'application et du référentiel technique de la loi du 7 juillet 2023 —
  son état d'application n'est PAS établi ici, et c'est assumé ;
- ouverture du service à des mineurs, sous quelque forme que ce soit.

### Chantier produit ouvert par son commentaire n° 4

Il demande une **case à cocher distincte**, au moment où l'utilisateur saisit prénom / nom / date de
naissance (donc dans `CompleteProfileScreen.tsx`, **pas** à l'inscription) :

> « je consens à ce que POKZA traite mes données personnelles dont mon nom, prénom et ma date de
> naissance afin de vérifier ma majorité » + lien vers la politique de confidentialité.

Aujourd'hui il n'existe qu'une case globale « 18 ans + CGU + confidentialité » dans
`AuthScreen.tsx` — or un consentement RGPD ne peut pas être groupé avec l'acceptation des CGU.
**FAIT** (21/08/2026) — `CompleteProfileScreen.tsx` :

- case à cocher distincte, dans un encadré, placée juste sous la date de naissance (donc après les
  trois champs concernés : prénom, nom, date de naissance) ;
- texte : « Je consens à ce que Pokza traite mes données personnelles, dont mon prénom, mon nom et
  ma date de naissance, afin de vérifier ma majorité — voir la **politique de confidentialité** »,
  le lien ouvrant la politique en surcouche sans quitter l'écran ;
- non cochée par défaut, et **bloquante** : elle entre dans `canSubmit` (bouton désactivé) *et*
  dans une garde au début de `handleSubmit`.

L'encadré n'est pas décoratif : le RGPD (art. 7 §2) veut un consentement « clairement distinguable
des autres questions ». Une simple ligne entre la date de naissance et la description ne le serait
pas. À plat si Victor préfère, mais c'est le motif du choix.

**Non vérifié à l'écran** : atteindre cet écran suppose de créer un compte neuf sans profil, ce qui
n'a pas été fait. La structure (`screen: flex 1` + `ScrollView` + surcouche absolue) est copiée
telle quelle de `AuthScreen`, monté par `App.tsx` dans le même conteneur `flex: 1`.

### Trace du consentement (RGPD art. 7 §1) — écrit le 21/08, PAS ENCORE APPLIQUÉ

Le RGPD impose de pouvoir **démontrer** que le consentement a été donné. La case seule ne laisse
aucune trace. Trois scripts dans `docs/dev/` s'en chargent :

| Fichier | Rôle |
|---|---|
| `consentement-identite.sql` | colonne + droits + nouvelle signature de `create_profile` |
| `consentement-identite-test.sql` | mesure sur un compte jetable |
| `consentement-identite-cloture.sql` | retire l'ancienne signature, **après** déploiement app |

Ce que ça pose :

- **`profiles_private.consentement_identite_at`** — pas sur `profiles` : la trace vit à côté des
  données qu'elle couvre (prénom, nom, date de naissance vivent dans `profiles_private`).
- **`create_profile` gagne un 8ᵉ argument** `p_consentement_identite boolean`, **sans valeur par
  défaut** (avec un défaut, un appel à 7 arguments deviendrait ambigu entre les deux signatures et
  PostgreSQL refuserait l'appel). Elle refuse avant toute écriture si le consentement n'est pas
  donné, et horodate avec **l'horloge du serveur** — jamais une date fournie par le client.
- **Droits par colonne sur `profiles_private`** (même remède que le lot F-21) : le titulaire garde
  le droit de modifier `prenom`, `nom`, `date_naissance`, mais **plus celui d'écrire dans la
  colonne de trace**. Sans ça la trace ne prouverait rien : la table a `GRANT ALL` à
  `authenticated` et une policy `FOR UPDATE`, donc chacun pouvait antidater ou effacer son propre
  consentement.

⚠️ **ORDRE DE DÉPLOIEMENT, à ne pas inverser** — l'app déployée avant le SQL casserait la création
de profil :

1. ~~`consentement-identite.sql` sur **DEV**, puis `consentement-identite-test.sql` sur DEV~~
   — **FAIT le 21/08/2026, 6 mesures sur 6 au vert** (trace posée par le serveur, refus sans
   consentement sans écriture, droits de colonne effectifs, compte d'essai nettoyé) ;
2. ~~`consentement-identite.sql` sur **PROD**~~ — **FAIT le 21/08/2026**, et le test rejoué sur
   PROD y donne aussi 6 mesures sur 6 : aucune divergence DEV/PROD sur ce lot ;
3. déployer l'app ;
4. une fois le nouveau bundle bien en ligne : `consentement-identite-cloture.sql`.

L'étape 4 n'est pas cosmétique : tant que l'ancienne signature à 7 arguments existe, un client peut
créer un profil sans consentement et sans trace. Elle est laissée en place aux étapes 1-3 seulement
parce que la PWA est servie depuis un cache et qu'un utilisateur peut encore tourner sur l'ancien
bundle pendant quelques heures.

**Pas de rétro-remplissage.** Les profils créés avant restent à `NULL`. Poser une date de
consentement sur un compte qui n'a jamais vu la case, ce serait fabriquer une preuve. Si tu veux
régulariser les comptes de la bêta, c'est en le leur redemandant.

**Piège rencontré à la première mesure.** Le test échouait sur `violates check constraint` de
`profiles` : les valeurs du profil d'essai (`format_favori`, `frequence_jeu`…) ne sont pas libres,
elles doivent venir de `pokza-app/src/profile/profileOptions.ts`. L'échec venait du test, pas de la
migration — c'est noté en tête du fichier de test.

**Limite connue, assumée.** Un client peut contourner la RPC et écrire directement dans
`profiles_private` via PostgREST, donc créer un profil sans trace. Fermer ça demanderait de retirer
le droit d'INSERT sur la table et de passer `create_profile` en `SECURITY DEFINER` — changement de
posture volontairement écarté. Ce qui est verrouillé, c'est l'**altération après coup** d'une trace
existante.
