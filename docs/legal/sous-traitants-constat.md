# Ce qui sort de Pokza, et vers qui — constat du code (25/09/2026)

**Ce document n'est pas un texte juridique et ne prétend pas en être un.** C'est l'inventaire, relevé
dans le code et vérifiable ligne à ligne, des services tiers que Pokza appelle réellement et de ce
qui leur parvient. Il existe parce que la liste des sous-traitants de
`docs/legal/pokza-textes-legaux.html` — celle qu'Alexis a relue — a pris du retard sur l'app.

C'est **à Alexis** de décider ce qui doit être écrit, et comment. Ce fichier lui donne les faits.

## Méthode, pour pouvoir le refaire

    grep -rhoE "https://[a-zA-Z0-9.-]+\.[a-z]{2,}" pokza-app/src pokza-app/public \
        pokza-app/worker.js supabase/functions | sed 's#https://##' | sort | uniq -c | sort -rn

L'URL de Supabase n'y apparaît pas : elle vient d'une variable d'environnement
(`EXPO_PUBLIC_SUPABASE_URL`), pas d'une chaîne écrite dans le code. `docs.expo.dev` et
`necolas.github.io` sont des liens de documentation dans des commentaires, jamais appelés.

## L'inventaire

| Service | Ce qui lui parvient | Où c'est dans le code | Déclaré dans le texte relu ? |
|---|---|---|---|
| **Supabase** | compte, mains, commentaires, fichiers | `pokza-app/src/lib/supabase.ts` | oui |
| **PostHog** | mesure d'audience, anonyme | `eu.i.posthog.com` | oui |
| **Resend** | e-mails du service | `supabase/functions/report-notify/index.ts:71` | oui |
| **GIPHY** | adresse IP à l'affichage d'un GIF | `supabase/functions/giphy/index.ts:23` | oui |
| **Cloudflare** — hébergement | toute requête vers `pokza.app` : IP, en-têtes | `pokza-app/wrangler.jsonc` | **non** |
| **Cloudflare** — Turnstile | à l'inscription : IP et signaux de navigateur | `pokza-app/src/auth/Turnstile.tsx:32` | **non** |
| **Cloudflare** — Workers AI | **du texte écrit par les gens** (voir ci-dessous) | `supabase/functions/traduire/cloudflare.ts:99` | **non** |

## Le point qui pèse le plus : la traduction

Depuis le 15/09/2026, le bouton « Traduire » envoie à
`https://api.cloudflare.com/client/v4/accounts/{compte}/ai/run/{modèle}` :

- `posts.title`, `posts.description`, `posts.vote_question`, `posts.vote_options`
  (`supabase/functions/traduire/index.ts:184`) ;
- `comments.body` (`supabase/functions/traduire/index.ts:197`).

C'est du **contenu écrit par des personnes**, pas une donnée technique — ce qui le distingue des
deux autres usages de Cloudflare. Cette mention RGPD était déjà notée comme due au moment de la
livraison ; elle est restée ouverte depuis.

Ce que je ne sais PAS et qu'il ne faut pas deviner : dans quel pays Cloudflare exécute l'inférence
Workers AI. La section « Transferts hors Union européenne » du texte actuel distingue justement les
prestataires européens des américains — la réponse change ce qui doit y être écrit. Elle se demande
à Cloudflare, elle ne se lit pas dans le code.

## Ce que les deux textes disent aujourd'hui

- **`pokza-textes-legaux.html`** (celui qu'Alexis a relu) nomme quatre sous-traitants : Supabase,
  PostHog, Resend, GIPHY. **Cloudflare n'y apparaît pas une seule fois.**
- **`note-confidentialite-beta.md`** dit « Application web : Cloudflare » — l'hébergement seul. Elle
  est antérieure à Turnstile et à la traduction, et ne les couvre donc pas.

## Pourquoi maintenant, et pourquoi tout d'un coup

Le suivi d'erreurs (Sentry, poste 3 de la phase 0 du plan d'avant natif) ajouterait un
**cinquième** sous-traitant, qui reçoit par construction des fragments de ce que fait la personne au
moment du plantage. L'ajouter à une liste déjà en retard ferait deux allers-retours chez Alexis là
où un seul suffit. D'où l'ordre proposé : fermer ce constat d'abord, écrire le code ensuite.
