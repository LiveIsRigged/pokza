# Note de confidentialité — beta fermée Pokza

À afficher/partager avec les testeurs avant qu'ils créent un compte (ex : lien envoyé avec l'invitation).
Ceci est une note d'information minimale pour la phase de beta fermée entre amis — **pas des CGU**. À
remplacer par un document complet (mentions légales, CGU, politique de confidentialité formelle) avant
toute ouverture publique.

---

## Qui traite tes données

Pokza est développé par Victor Hoogstoël, à titre personnel (pas de société à ce stade). Contact :
victorhoogstoel@gmail.com.

## Quelles données sont collectées

- **Compte** : email, mot de passe (jamais stocké en clair — géré par Supabase Auth).
- **Profil** : pseudo, photo de profil, date de naissance (vérification d'âge, 18 ans minimum).
- **Contenu que tu publies** : parties de poker enregistrées, commentaires, photos jointes aux
  commentaires.
- **Relations** : demandes d'ami, appartenance à des groupes, invitations envoyées/reçues.
- **Technique** : horodatages de création/modification, adresse IP au moment des requêtes (logs
  d'infrastructure Supabase, pas exploités par l'app elle-même).

Rien n'est collecté à but publicitaire, rien n'est vendu ou partagé avec un tiers.

## Pourquoi

Uniquement pour faire fonctionner l'app : afficher tes parties et celles de tes amis, gérer les groupes
privés, permettre les commentaires et l'ajout d'amis. Ton email sert aussi à t'envoyer un lien de
réinitialisation de mot de passe si besoin.

## Où c'est hébergé

Base de données, authentification et stockage de fichiers : Supabase, hébergé dans l'Union européenne.
Application web : Cloudflare.

## Combien de temps c'est gardé

Tant que ton compte existe. Tu peux le supprimer à tout moment depuis l'app (Profil → Supprimer mon
compte) : ça efface ton compte et ton profil immédiatement. Les parties/commentaires que tu as postés
dans des groupes restent visibles à leurs autres membres (comme n'importe quel réseau social), sauf ceux
dont tu es seul auteur.

## Tes droits

Accès, rectification, suppression : directement via l'app (modifier ton profil, supprimer ton compte),
ou par email à victorhoogstoel@gmail.com pour toute demande que l'app ne permet pas de faire seul.

## Le fait que ce soit une beta

C'est un produit en cours de développement testé par un petit groupe de proches. Des bugs peuvent
survenir, des données peuvent être réinitialisées si nécessaire pendant cette phase (ce sera annoncé
avant si c'est le cas).
