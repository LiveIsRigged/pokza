# Glossaire de traduction

À quoi ça sert : traduire 1200 chaînes, c'est trancher une cinquantaine de fois sur le
vocabulaire. Si ces arbitrages ne vivent que dans `en.json`, la personne qui fera l'allemand
les rederive un par un — et diverge. Ce fichier les fige, et sert de consigne au relecteur
d'une nouvelle langue.

**Se lit avec** `pokza-app/src/i18n/contexte.json`, qui note les clés qu'on ne peut pas
traduire en lisant seulement leur texte.

## La règle qui prime sur tout

**Le jargon du poker reste en anglais** (décision du 10/09/2026). Mais la frontière n'est pas
la même d'une langue à l'autre : un Allemand dit « Fold / Call / Raise » là où un Français dit
« Se coucher / Suivre / Relancer ». Le français livré est déjà un mélange assumé — « Relancer »,
« Miser », « Suivre » en français, mais « Flop », « Turn », « River », « Pot », « Straddle » en
anglais.

**Consigne au relecteur** : garde en anglais ce qu'un joueur de ta langue dit en anglais à la
table. Tu es le seul à savoir où passe la ligne pour ta langue — ne recopie pas la nôtre.

## Ne se traduit jamais

| Terme | Pourquoi |
|---|---|
| Pokza | nom du produit |
| Flop, Turn, River, Board | jargon, déjà en anglais en français |
| Pot, Stack, Straddle, Ante | idem |

## Français → anglais

| Français | Anglais | Note |
|---|---|---|
| main | hand | jamais « game » ni « round » |
| se connecter (bouton) | sign in | pas « log in » : une seule forme dans toute l'app |
| s'inscrire | sign up | |
| compte | account | |
| mot de passe | password | |
| conditions d'utilisation | terms of use | doit désigner le même document que le texte légal |
| politique de confidentialité | privacy policy | idem |
| signaler | report | signaler un contenu, pas « flag » |
| réglages | settings | |
| comptes bloqués | blocked accounts | |
| informations légales | legal information | |
| corriger (une main) | correct | republier après correction, pas « edit » |
| dupliquer | duplicate | |
| bloquer (quelqu'un) | block | |
| masquer / retirer | hide / remove | deux mesures de modération DISTINCTES, ne pas confondre |
| voir plus / voir moins | see more / see less | |
| à l'instant | just now | |
| j'aime (nom) | like | |

## Ce qui ne passe pas par le catalogue

| Quoi | Où | Pourquoi |
|---|---|---|
| jours de la semaine, mois, dates longues | `utils/relativeDate.ts` | `Intl` les connaît dans toutes les langues — 19 entrées de moins à ressaisir par langue |
| motifs des analyseurs d'import | `import/dialectes/` | ils reconnaissent l'anglais des rooms (`PRE-FLOP`, `SHOW DOWN`) : les traduire casserait l'import |
| « Pokza » | partout | nom du produit |

**Piège mesuré** : `Intl` rend « lundi » en minuscule alors que l'app affiche « Lundi ». On remet
la majuscule initiale — sans quoi traduire ferait régresser le français.

## Ton

Le français tutoie (« tu dois », « ton compte »). L'anglais n'a pas la distinction : « you »
partout. Les langues qui l'ont (allemand, espagnol) doivent trancher une fois pour toutes —
**Pokza tutoie**, c'est une app entre amis, pas un service bancaire.
