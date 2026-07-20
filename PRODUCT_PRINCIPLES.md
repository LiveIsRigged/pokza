# Product Principles

**Pokza est un réseau social pour les joueurs de poker.** Ces principes guident toutes les décisions produit, design et business. Ils priment sur les features et les roadmaps.

---

## Vision
Un véritable réseau social poker où des millions de joueurs live et online publient, analysent et débattent de leurs mains avec leurs coachs, amis et inconnus — en commençant par une plateforme de partage de replayers (Strava poker) qui évoluera progressivement vers un Twitter poker.

## Mission
Rendre le partage et l'analyse de mains aussi simple que partager une photo sur Instagram ou une course sur Strava.

---

## Core Values & Principles

### 1. **Simplicité : Une action = un résultat**

**Le principe :**
Chaque feature doit réduire la friction, jamais l'augmenter. La plateforme doit être accessible aux joueurs de tous niveaux — débutants comme pros.

**Comment on l'applique :**
- Pas de clics inutiles. Si on peut faire en 1 tap au lieu de 3, on le fait.
- Chaque écran a un seul objectif clair.
- Les workflows doivent être intuitifs sans tutoriel.
- Les formulaires sont éliminés ou réduits au minimum critique.
- Quand on ajoute une feature, on doit retirer quelque chose d'autre (ou la tuer).

**Ce qu'on refuse :**
- Complexité gratuite ou "au cas où".
- UI overloadée avec trop d'options.
- Workflows en cascade qui demandent plus de 5 actions.

**Exemple :** Créer une main doit prendre 3-5 minutes, pas 20. Le replayer doit se lancer en un tap.

---

### 2. **Confidentialité : Les données des joueurs sont sacrées**

**Le principe :**
Les joueurs nous font confiance avec leurs données (stratégie, résultats, style de jeu). Cette confiance est notre asset le plus précieux. Jamais on ne la trahit.

**Comment on l'applique :**
- Zéro vente de données, quoi qu'il arrive.
- Transparence complète sur ce qu'on collecte, comment, et pourquoi.
- Contrôle utilisateur total : chaque joueur décide ce qui est public/privé.
- Données chiffrées en transit et au repos.
- RGPD et régulations locales respectées strictement.
- Audit de sécurité réguliers (au moins 2x/an pré-série A).

**Ce qu'on refuse :**
- Tracking caché ou "dark patterns".
- Partage de données avec des tiers sans consentement explicite.
- Monétisation via données utilisateur.

**Exemple :** Un coach veut garder ses analyses privées ? Zéro problème. Un joueur veut supprimer son compte ? Toutes ses données disparaissent en 24h.

---

### 3. **Communauté : Débat respectueux > toxicité**

**Le principe :**
Pokza est un lieu de débat et d'apprentissage collectif. La communauté est l'engine de croissance. On protège l'environnement contre la toxicité.

**Comment on l'applique :**
- Pas d'anonymat total (encourage la toxicité). On peut choisir un pseudo, mais toujours identifiable.
- Modération active : insultes, taunts, harcèlement = ban immédiat.
- Système de réputation : les bons débateurs montent, les toxiques disparaissent.
- Pas de "ratio dunking" ou "trolling encouraged".
- Célébration du partage : les joueurs qui partagent beaucoup reçoivent du crédit.

**Ce qu'on refuse :**
- Bad actors qui détruisent le débat.
- Bots ou automation qui pollue la discussion.
- Économie de likes qui encouragerait les posts clickbait.

**Exemple :** Quelqu'un fait une mauvaise play, les autres la critiquent ? Bienvenue. Quelqu'un harasse ce joueur ? Ban.

---

### 4. **Partage : Chaque action doit être shareable**

**Le principe :**
Le réseau social grandit par partage viral. Chaque feature doit être designed avec partage en tête — c'est notre distribution engine.

**Comment on l'applique :**
- Les replayers doivent être shareable : lien clickable, embed-friendly, beaux à regarder.
- Partage d'une main = simple comme copier un lien.
- Cross-platform : Twitter, Instagram, Reddit, Discord — nos replayers doivent marcher partout.
- Analytics de partage : on sait ce qui est partagé et pourquoi.
- Sharing incentives : partager une analyse donne du crédit public (nombre de partages visible).

**Ce qu'on refuse :**
- Features "walled garden" qu'on ne peut pas partager.
- Replayers lourds qui ne chargent pas vite.
- Paywall autour du contenu shareable.

**Exemple :** Un joueur crée une main cool. Il doit pouvoir la partager sur Twitter avec un lien qui montre le replayer directement dans le tweet — sans app download.

---

### 5. **Pédagogie : Pas de gatekeeping de la connaissance poker**

**Le principe :**
Le poker a besoin de meilleurs joueurs. On rend l'apprentissage accessible. Les coachs doivent pouvoir enseigner. Les pros doivent pouvoir analyser publiquement. Les débutants doivent pouvoir apprendre.

**Comment on l'applique :**
- Les analyses des coachs sont visibles et créditées.
- Pas de "premium analysis features" qui créent une classe d'experts invisible.
- Tags & searchability : on peut trouver "preflop strategy", "3bet defense", etc.
- Explications claires : chaque action/stratégie doit être expliquée pour les débutants aussi.
- Democratize coaching : les coachs petits/moyens ont la même visibilité que les pros.

**Ce qu'on refuse :**
- Freemium models qui cachent l'analyse derrière un paywall.
- Contenu gatekeepé aux "members only".
- Mauvaises explications ou jargon non-défini.

**Exemple :** Un coach partage son analyse d'une main. Un débutant peut la voir, la comprendre, et apprendre. Pas de "upgrade to pro" pour voir l'analyse complète.

---

### 6. **Design Premium : Attention aux détails**

**Le principe :**
Pokza est une plateforme premium. Le design reflète ça. Pas de "cheap" ou "quick & dirty". Chaque pixel compte.

**Comment on l'applique :**
- Cohérence visuelle stricte : typo, couleurs, spacing doivent être parfaits.
- Animation subtile mais délibérée : chaque mouvement doit avoir un but.
- Aucun bug visuel ne part en production.
- Dark/Light mode supportés et testés.
- Responsive design : desktop, tablet, phone — tous parfaits.
- Performance : sub-2s load time, 60fps animations.
- Accessibility : WCAG 2.1 AA minimum.

**Ce qu'on refuse :**
- Designs "placeholder" qui restent "temporaires" 6 mois.
- Inconsistencies entre écrans.
- Mauvaise performance pour une belle animation.
- Inaccessibilité ("we'll fix it later").

**Exemple :** Un replayer doit être beau à regarder et à partager. Les animations doivent raconter l'histoire de la main.

---

## Decision Framework

Quand on doute, on demande :

1. **Est-ce que ça simplifie ou complique ?** Si ça complique, on le tue.
2. **Les données sont-elles sûres ?** Si non, on ne le fait pas.
3. **Est-ce que ça renforce la communauté ?** Si ça la toxifie, on le refuse.
4. **Est-ce que c'est shareable ?** Si personne ne le partage, pourquoi c'est une feature ?
5. **Est-ce que ça éduque ou exploite ?** Si ça exploite, c'est non.
6. **Est-ce que c'est beau ?** Si c'est moyen, on repolish.

---

## What We're NOT

- **Not a gambling platform.** Pas de betting, d'argent réel, ou de casino.
- **Not a Discord clone.** On n'est pas un chat ou une plateforme de messaging.
- **Not subscription-heavy.** On n'est pas un "premium content" business.
- **Not entertainment for entertainment's sake.** Chaque feature doit servir l'analyse ou la communauté.
- **Not a coaching SaaS.** On facilite le coaching, on ne le remplace pas.

---

## Success Criteria for Every Feature

Avant de lancer une feature, on se demande :

- ✅ Est-ce que ça rend le partage/analyse de mains plus simple ?
- ✅ Est-ce que ça protège la confidentialité des joueurs ?
- ✅ Est-ce que ça renforce la communauté (pas la divise) ?
- ✅ Est-ce que les gens vont la partager ?
- ✅ Est-ce que les débutants peuvent la comprendre ?
- ✅ Est-ce que c'est beau et performant ?

Si on répond non à plus d'une seule question : on la tue ou on la redesigne.

