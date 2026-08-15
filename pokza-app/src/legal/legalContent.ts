// ============================================================================
// TEXTES LÉGAUX — source de vérité rendue dans l'app par LegalScreen ET exposée
// à l'inscription (consentement). Rédigés pour un éditeur PERSONNE PHYSIQUE, à
// titre non professionnel, service gratuit (pas de société / SIRET à ce stade).
//
// ⚠️ BROUILLON : à faire relire par un juriste avant l'ouverture publique.
//    Les 〔…〕 sont des champs à confirmer/compléter — voir docs/legal/README.md.
//    Passer LEGAL_DRAFT à false une fois la relecture faite (retire le bandeau).
// ============================================================================

export type LegalDocId = 'mentions' | 'cgu' | 'confidentialite' | 'jeu-responsable';

export interface LegalSection {
  heading?: string;
  /** Paragraphes ; une ligne commençant par « • » est rendue comme puce. */
  body: string[];
}

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  /** Libellé court pour l'index et les liens. */
  shortTitle: string;
  sections: LegalSection[];
}

export const LEGAL_DRAFT = true;
export const LEGAL_UPDATED = '〔date de mise en ligne à définir〕';

// ── Coordonnées éditeur (à confirmer) ────────────────────────────────────────
const EDITEUR = 'Victor Hoogstoël';
const CONTACT_EMAIL = 'contact@pokza.app';
const ABUSE_EMAIL = 'abuse@pokza.app';
const PRIVACY_EMAIL = 'privacy@pokza.app';

const mentions: LegalDoc = {
  id: 'mentions',
  title: 'Mentions légales',
  shortTitle: 'Mentions légales',
  sections: [
    {
      heading: 'Éditeur',
      body: [
        `Le service Pokza est édité par ${EDITEUR}, personne physique agissant à titre non professionnel (aucune société n'est constituée à ce stade, le service est gratuit et sans but lucratif).`,
        `Contact : ${CONTACT_EMAIL}.`,
        `Conformément à l'article 6, III, 2° de la loi n° 2004-575 du 21 juin 2004 (LCEN), en tant qu'éditeur non professionnel, l'adresse postale de l'éditeur n'est pas rendue publique ; elle est communiquée à l'hébergeur et peut être obtenue auprès de lui dans les conditions prévues par la loi.`,
      ],
    },
    {
      heading: 'Directeur de la publication',
      body: [`${EDITEUR}.`],
    },
    {
      heading: 'Hébergement',
      body: [
        "L'application et les données sont hébergées par Supabase (Supabase Pte. Ltd, 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513), sur l'infrastructure Amazon Web Services (AWS), au sein de l'Union européenne, région Europe (Francfort, Allemagne).",
        "Les e-mails du service (confirmation, réinitialisation de mot de passe, notifications) sont acheminés par Resend (Plus Five Five, Inc., 2261 Market Street #5039, San Francisco, CA 94114, États-Unis).",
      ],
    },
    {
      heading: 'Signalement de contenu',
      body: [
        `Pour signaler un contenu que tu estimes illicite : utilise le bouton « Signaler » dans l'application, ou écris à ${ABUSE_EMAIL}. Nous traitons les signalements de manière réactive (voir les Conditions d'utilisation).`,
      ],
    },
  ],
};

const cgu: LegalDoc = {
  id: 'cgu',
  title: "Conditions générales d'utilisation",
  shortTitle: "Conditions d'utilisation",
  sections: [
    {
      heading: '1. Objet',
      body: [
        `Les présentes conditions régissent l'accès et l'utilisation de Pokza (« le Service »), édité par ${EDITEUR}. En créant un compte ou en utilisant le Service, tu acceptes ces conditions.`,
      ],
    },
    {
      heading: '2. Ce qu\'est (et n\'est pas) Pokza',
      body: [
        "Pokza est un réseau social permettant de partager, rejouer, commenter et voter des mains de poker, et de se constituer un réseau (amis, groupes privés).",
        "Pokza n'est PAS un opérateur de jeux d'argent et de hasard. Aucune mise, aucun gain et aucune somme d'argent réelle ne sont joués, misés ou gagnés sur le Service. Les montants affichés dans les mains sont purement illustratifs et servent à décrire une situation de jeu.",
      ],
    },
    {
      heading: '3. Accès et inscription',
      body: [
        "Le Service est strictement réservé aux personnes âgées d'au moins 18 ans. En créant un compte, tu déclares avoir 18 ans révolus.",
        "• Un seul compte par personne.",
        "• Tu fournis des informations exactes et les tiens à jour.",
        "• Tu es responsable de la confidentialité de ton mot de passe et des activités réalisées depuis ton compte.",
      ],
    },
    {
      heading: '4. Contenu et règles de conduite',
      body: [
        "Tu es seul responsable des contenus que tu publies (mains, textes, images, GIF, commentaires, sondages).",
        "Sont notamment interdits :",
        "• les insultes et le harcèlement ;",
        "• les propos haineux ou discriminatoires ;",
        "• les contenus sexuels ou choquants ;",
        "• l'usurpation d'identité ;",
        "• le spam et la sollicitation commerciale non autorisée ;",
        "• la promotion d'opérateurs de jeux d'argent illégaux ;",
        "• les arnaques et escroqueries ;",
        "• tout contenu impliquant des mineurs ou destiné à des mineurs ;",
        "• plus généralement tout contenu illicite ou contraire aux présentes conditions.",
      ],
    },
    {
      heading: '5. Modération',
      body: [
        "La modération est réactive : nous ne surveillons pas les contenus a priori, mais nous agissons promptement lorsqu'un contenu manifestement illicite nous est signalé, conformément à notre statut d'hébergeur (LCEN).",
        "Tu peux signaler un contenu ou un compte via le bouton « Signaler ». Selon la situation, nous pouvons masquer ou retirer un contenu, et avertir, suspendre ou bannir un compte. Ces mesures sont réversibles et l'auteur d'un contenu retiré en est informé.",
        "Tu peux aussi bloquer un autre utilisateur : vous ne verrez plus vos contenus et interactions respectifs.",
      ],
    },
    {
      heading: '6. Propriété intellectuelle',
      body: [
        "Tu restes titulaire des droits sur les contenus que tu publies. Tu accordes à Pokza une licence non exclusive et gratuite pour héberger, afficher et adapter techniquement ces contenus, aux seules fins de faire fonctionner le Service.",
        "Tu garantis disposer des droits nécessaires sur ce que tu publies. Les GIF proposés le sont via le service GIPHY et restent soumis aux conditions de GIPHY.",
      ],
    },
    {
      heading: '7. Données personnelles',
      body: [
        "Le traitement de tes données personnelles est décrit dans la Politique de confidentialité, qui fait partie intégrante des présentes conditions.",
      ],
    },
    {
      heading: '8. Disponibilité et responsabilité',
      body: [
        "Le Service est fourni « en l'état », sans garantie de disponibilité continue ni d'absence d'erreur. Pokza peut faire évoluer, suspendre ou interrompre tout ou partie du Service.",
        "Pokza n'est pas responsable des contenus publiés par les utilisateurs. Dans les limites permises par la loi, la responsabilité de l'éditeur ne saurait être engagée pour les dommages indirects liés à l'utilisation du Service.",
      ],
    },
    {
      heading: '9. Durée, suspension et résiliation',
      body: [
        "Tu peux supprimer ton compte à tout moment depuis « Modifier mon profil » — cela entraîne la suppression de tes contenus, dans les conditions décrites par la Politique de confidentialité.",
        "En cas de violation des présentes conditions, Pokza peut suspendre ou résilier l'accès au compte concerné.",
      ],
    },
    {
      heading: '10. Modification des conditions',
      body: [
        "Ces conditions peuvent être modifiées. En cas de changement important, tu en seras informé. L'utilisation du Service après une modification vaut acceptation de la version à jour.",
      ],
    },
    {
      heading: '11. Droit applicable et litiges',
      body: [
        "Les présentes conditions sont soumises au droit français.",
        "En cas de différend, nous t'invitons à nous contacter d'abord à " + CONTACT_EMAIL + " pour rechercher une solution amiable.",
        "À défaut d'accord amiable, les tribunaux français sont compétents dans les conditions prévues par la loi.",
      ],
    },
  ],
};

const confidentialite: LegalDoc = {
  id: 'confidentialite',
  title: 'Politique de confidentialité',
  shortTitle: 'Confidentialité',
  sections: [
    {
      heading: 'Responsable du traitement',
      body: [
        `Le responsable du traitement de tes données est ${EDITEUR}, éditeur de Pokza. Pour toute question relative à tes données : ${PRIVACY_EMAIL}.`,
      ],
    },
    {
      heading: 'Données que nous traitons',
      body: [
        "• Identification : adresse e-mail et mot de passe (celui-ci est stocké chiffré par notre prestataire d'authentification, jamais en clair).",
        "• Profil : pseudo, photo de profil, description, pays, préférences de jeu.",
        "• État civil : prénom, nom et date de naissance — utilisés pour vérifier ta majorité (18 ans) et, selon ton choix, afficher ton nom.",
        "• Contenus : mains publiées, commentaires, images et GIF, mentions « j'aime », votes et sondages.",
        "• Relations : amis, demandes d'amis, groupes privés.",
        "• Notifications liées à ton activité.",
        "• Données d'usage et techniques : interactions dans l'app, journaux, adresse IP, identifiants techniques — via notre outil de mesure d'audience.",
      ],
    },
    {
      heading: 'Pourquoi et sur quelle base',
      body: [
        "• Fournir le Service et gérer ton compte — exécution du contrat.",
        "• Vérifier ta majorité (18 ans) — obligation légale et intérêt légitime.",
        "• Assurer la sécurité, prévenir les abus et modérer les contenus — obligation légale (hébergeur) et intérêt légitime.",
        "• Mesurer l'audience et améliorer le Service — intérêt légitime, ou ton consentement lorsque la loi l'exige.",
        "• T'envoyer les e-mails nécessaires au compte (confirmation, réinitialisation, notifications importantes) — exécution du contrat.",
      ],
    },
    {
      heading: 'Qui a accès à tes données',
      body: [
        "Nous ne vendons pas tes données. Elles sont traitées par des prestataires (sous-traitants) agissant pour notre compte :",
        "• Supabase (hébergement, base de données, authentification, stockage) — infrastructure AWS, Union européenne (Francfort).",
        "• PostHog (mesure d'audience), hébergé dans l'Union européenne (eu.posthog.com).",
        "• Resend (envoi des e-mails du service), établi aux États-Unis — transfert encadré par les clauses contractuelles types.",
        "• GIPHY (fourniture des GIF) : lorsque tu affiches un GIF, une requête est faite vers GIPHY, ce qui peut transmettre ton adresse IP à ce service.",
        "• Cloudflare (protection du formulaire de connexion et d'inscription contre les créations de comptes automatisées, service Turnstile), établi aux États-Unis — transfert encadré par les clauses contractuelles types. Lors de cette vérification, ton adresse IP et des signaux techniques de ton navigateur sont transmis à ce service.",
      ],
    },
    {
      heading: 'Transferts hors Union européenne',
      body: [
        "Nos données principales (base de données, authentification, stockage) et la mesure d'audience sont hébergées dans l'Union européenne. En revanche, l'envoi des e-mails du service (Resend), l'affichage des GIF (GIPHY) et la vérification anti-robots à la connexion et à l'inscription (Cloudflare) reposent sur des prestataires établis aux États-Unis : ces transferts hors Union européenne sont encadrés par les garanties prévues par le RGPD, notamment les clauses contractuelles types de la Commission européenne.",
      ],
    },
    {
      heading: 'Durées de conservation',
      body: [
        "• Compte et contenus : conservés tant que ton compte existe ; supprimés lorsque tu supprimes ton compte.",
        "• Signalements : supprimés 12 mois après leur traitement.",
        "• Contenus retirés par la modération : supprimés définitivement 30 jours après leur retrait.",
        "• Journaux techniques (connexion, sécurité) : conservés au maximum 12 mois.",
      ],
    },
    {
      heading: 'Tes droits',
      body: [
        "Tu disposes des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité sur tes données.",
        "Tu peux supprimer toi-même ton compte et tes contenus depuis « Modifier mon profil ». Pour exercer tes autres droits, écris à " + PRIVACY_EMAIL + ".",
        "Tu peux aussi introduire une réclamation auprès de la CNIL (www.cnil.fr).",
      ],
    },
    {
      heading: 'Mineurs',
      body: [
        "Le Service est interdit aux moins de 18 ans. Nous ne collectons pas sciemment de données de mineurs. Si un compte de mineur est identifié, il est bloqué puis supprimé.",
      ],
    },
    {
      heading: 'Cookies et traceurs',
      body: [
        "Sur le web, un stockage local strictement nécessaire est utilisé pour te maintenir connecté ; il ne requiert pas ton consentement.",
        "Notre outil de mesure d'audience (PostHog, hébergé dans l'Union européenne) est configuré pour être exempté de consentement conformément aux recommandations de la CNIL : finalité limitée à la mesure d'audience, données anonymisées, absence de suivi de ta navigation sur d'autres sites et absence de recoupement avec d'autres traitements. Aucun cookie publicitaire ni traceur tiers à des fins de ciblage n'est déposé.",
      ],
    },
    {
      heading: 'Sécurité',
      body: [
        "Nous mettons en œuvre des mesures techniques adaptées : chiffrement des échanges, cloisonnement des accès aux données au niveau de la base, accès d'administration restreints et journalisés.",
        "S'y ajoutent une protection du formulaire de connexion et d'inscription contre les créations de comptes automatisées, et des en-têtes de sécurité qui limitent les scripts et les serveurs que l'application peut solliciter depuis ton navigateur.",
      ],
    },
  ],
};

const jeuResponsable: LegalDoc = {
  id: 'jeu-responsable',
  title: 'Jeu responsable',
  shortTitle: 'Jeu responsable',
  sections: [
    {
      body: [
        "Pokza n'est pas un site de jeux d'argent : on n'y mise pas, on n'y gagne pas d'argent. C'est un espace pour partager et analyser des mains de poker entre passionnés. Le Service est réservé aux personnes majeures (18 ans et plus).",
      ],
    },
    {
      heading: 'Le jeu d\'argent comporte des risques',
      body: [
        "Pratiqué en argent réel (ailleurs que sur Pokza), le poker peut entraîner une dépendance, un endettement et un isolement. Ne considère jamais le jeu comme une source de revenus, et fixe-toi des limites.",
      ],
    },
    {
      heading: 'Besoin d\'aide ou d\'écoute',
      body: [
        "Joueurs Info Service : 09 74 75 13 13 (appel non surtaxé, 7j/7 de 8h à 2h).",
        "En ligne : www.joueurs-info-service.fr",
      ],
    },
    {
      heading: 'Opérateurs légaux',
      body: [
        "En France, seuls les opérateurs agréés par l'Autorité Nationale des Jeux (ANJ) sont autorisés à proposer du poker en argent réel en ligne. La promotion d'opérateurs illégaux est interdite sur Pokza et peut être signalée.",
      ],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [cgu, confidentialite, mentions, jeuResponsable];

export function getLegalDoc(id: LegalDocId): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.id === id);
}
