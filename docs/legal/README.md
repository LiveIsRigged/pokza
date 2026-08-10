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
- Adresse postale de l'éditeur non publiée par défaut (option prévue par la LCEN art. 6-III-2 pour
  un éditeur non professionnel : adresse communiquée à l'hébergeur, pas au public).

## À COMPLÉTER / VÉRIFIER

### Déjà rempli
- [x] **Email de contact** général (`CONTACT_EMAIL`) → `contact@pokza.app` (alias Cloudflare Email Routing → Gmail).
- [x] **Email données personnelles** (`PRIVACY_EMAIL`) → `privacy@pokza.app` (idem).
- [x] **abuse@pokza.app** — alias Cloudflare Email Routing → Gmail, en place.
- [x] **Adresse de l'éditeur** : décision = **non publiée** (LCEN 6-III-2, éditeur non professionnel).
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
- [ ] **Entité Supabase à confirmer** : Supabase contracte selon des entités régionales (Inc. US vs
      Pte. Ltd Singapour). L'adresse retenue vient du DPA ; le juriste confirme l'entité exacte.
- [ ] **CONDITION cookies (bloquant technique)** : la section « exemptée de consentement » n'est vraie
      QUE si PostHog est effectivement configuré ainsi lors de l'intégration : mesure d'audience seule,
      IP anonymisée, pas de suivi inter-sites, pas de recoupement, durée de vie ≤ 13 mois, pas de
      partage à des tiers. Si l'une de ces conditions n'est pas remplie → il FAUT un bandeau de
      consentement. À vérifier au moment d'intégrer PostHog (pas encore présent dans le code).
- [ ] **Téléphone hébergeur** : la LCEN demande le téléphone de l'hébergeur dans les mentions légales.
      Non renseigné (Supabase ne le publie pas) → point à valider avec le juriste.
- [ ] **Relecture juriste ami** de l'ensemble, puis `LEGAL_DRAFT = false`.

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
