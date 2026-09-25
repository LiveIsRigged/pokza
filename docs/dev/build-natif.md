# Passer Pokza en application native — l'état de la chaîne de build

Posé le 25/09/2026. **Aucun build n'a encore été lancé**, et rien ici n'en lance.

Ce fichier existe parce que `eas.json` doit être du **JSON strict** : il n'accepte pas de
commentaires, contrairement à `wrangler.jsonc`. Tout ce qui s'y expliquerait normalement est ici.

---

## L'identifiant, la seule décision irréversible : `app.pokza`

Tranché par Victor le 25/09. C'est l'envers du domaine qu'il possède (`pokza.app`), ce qui est la
convention : un identifiant se dérive d'un domaine dont on est propriétaire.

**Le même sur iOS et sur Android** (`ios.bundleIdentifier` et `android.package` dans `app.json`).

⚠️ **Il ne change plus une fois l'app publiée.** En changer revient à créer une seconde app : autre
fiche, zéro téléchargement, zéro avis, et les gens qui ont l'ancienne ne reçoivent plus jamais de
mise à jour — il faudrait qu'ils aillent chercher la nouvelle à la main. Ce n'est pas un réglage.

`scheme: "pokza"` a été posé au passage : c'est ce qui fait que `pokza://…` ouvre l'app et non le
navigateur. Indispensable aux liens profonds et aux retours d'authentification. Celui-là se change
tant qu'on n'a pas publié.

## `eas.json` — deux profils, et pourquoi pas trois

    preview     distribution interne — un vrai build, installable par des testeurs (TestFlight),
                jamais sur le store
    production  ce qui part sur les stores, avec autoIncrement du numéro de build

**Le profil `development` manque exprès.** Il exige `developmentClient: true`, qui exige le paquet
`expo-dev-client` — absent du dépôt. Écrire un profil qui référence un paquet qu'on n'a pas, c'est
garantir que le premier `eas build` échoue sur une erreur qui ne dit pas ce qui manque. Il
s'ajoutera avec le paquet, le jour où on itère vraiment sur du natif.

`appVersionSource: "remote"` : c'est EAS qui tient le numéro de build, pas le dépôt. Évite le grand
classique — soumettre deux fois le même numéro, que le store refuse.

Pas de section `submit` non plus : elle demande des identifiants de compte Apple et Google qui
n'existent pas encore.

## ⚠️ Les variables d'environnement — la même leçon qu'avec Cloudflare

`pokza-app/.env` est ignoré par git et **n'a jamais été commité** (vérifié). EAS ne le verra donc
jamais. Ces quatre valeurs doivent exister **du côté d'EAS** avant le premier build :

    EXPO_PUBLIC_SUPABASE_URL
    EXPO_PUBLIC_SUPABASE_ANON_KEY
    EXPO_PUBLIC_GIPHY_API_KEY
    EXPO_PUBLIC_TURNSTILE_SITE_KEY      (widget web ; sans objet en natif, mais inoffensif)

⚠️ **Jamais dans le champ `env` d'`eas.json`.** La doc EAS est explicite : ce champ ne sert qu'à des
valeurs qu'on accepterait de commiter. Le dépôt est PUBLIC. Elles se posent en variables
d'environnement EAS (`eas env:create`, ou le tableau de bord Expo), exactement comme les secrets
posés côté Cloudflare pour le Worker d'aperçus.

## Ce qu'il reste à faire, et par qui

**Victor, et personne d'autre** — ce sont des comptes et de l'argent :

1. Un compte Expo, puis `npx eas init` depuis `pokza-app/` : ça écrit un `extra.eas.projectId` dans
   `app.json` et rattache le dépôt au projet EAS.
2. Poser les quatre variables ci-dessus côté EAS.
3. Compte Apple Developer — **99 $/an**. Sans lui, pas de build signé pour un vrai iPhone, et
   l'identifiant `app.pokza` n'est pas réservé.
4. Compte Google Play Console — **25 $ une fois**.

**Moi, quand ces quatre points sont faits** : le premier build `preview`, les icônes et écrans de
lancement aux formats natifs, les zones sûres, le geste retour, l'en-tête parchemin avec barre
d'état sombre (cf. la décision `native-top-bar-decision`), les liens profonds.

## Ce qui n'est PAS fait, exprès

- **`supportsTablet` vaut toujours `true`.** Conséquence : Apple reviewera Pokza sur iPad, alors que
  la géométrie de la table est calibrée pour des largeurs de téléphone (les batailles se jouaient à
  390 pt). Soit on adapte, soit on passe à `false` — c'est une décision produit, pas un réglage, et
  elle n'est pas prise.
- **Pas d'OTA** (`expo-updates` absent). Les mises à jour par-dessus l'air sont ce qui évite de
  repasser par une revue de store pour un correctif de texte ; elles amènent aussi les *canaux* de
  build, d'où l'absence de `channel` dans les deux profils. À décider séparément.
- **Pas de Sentry.** Vérifié le 25/09 : `@sentry/react-native` couvre android, iOS **et** web depuis
  Expo SDK 50 (on est sur Expo 57), donc un seul paquet pour les trois. Ses plugins Expo et Metro
  téléversent les source maps automatiquement pendant le build EAS — c'est-à-dire que le moment le
  moins cher pour le poser est **pendant** l'écriture de cette chaîne, pas après. Réserve connue :
  la doc Expo ne traite pas le téléversement des source maps pour un export web déployé ailleurs
  (notre cas sur Cloudflare) ; cette moitié-là demandera du travail à la main.
  ⚠️ Sentry est un **sous-traitant** : il s'ajoutera aux trois sections des textes légaux DANS LE
  MÊME COMMIT que le code, règle posée le 25/09 après le retard de dix jours sur Workers AI.
