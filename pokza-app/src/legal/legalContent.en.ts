import type { LegalDoc } from './legalContent';
import { ABUSE_EMAIL, CONTACT_EMAIL, EDITEUR, PRIVACY_EMAIL } from './legalContent';

// ============================================================================
// LEGAL TEXTS — ENGLISH. Traduction à droit constant du français : même contenu,
// même droit applicable, rien de vendu. Validé dans son principe par Alexis.
//
// ⚠️ LE FRANÇAIS RESTE LA SEULE VERSION QUI ENGAGE. C'est l'objet de la première
// section de chaque document ci-dessous, et c'est ce qui rend cette traduction
// possible sans repasser par une rédaction par marché. Elle n'est PAS décorative :
// la retirer changerait la nature de ce fichier.
//
// ⚠️ MODIFIER UN TEXTE ICI SANS MODIFIER SON JUMEAU FRANÇAIS LES FAIT DIVERGER.
// Le français est la source ; cette version le suit, jamais l'inverse.
// ============================================================================

/**
 * La clause de primauté, en tête de chaque document. Formulation PROPOSÉE — à faire valider par
 * Alexis avant de considérer la traduction comme acquise : c'est une clause juridique, pas une
 * étiquette d'interface, et elle est la condition de tout le reste.
 */
const PRIMAUTE =
  'This English text is a translation provided for convenience. Pokza is governed by French law, and the French version of this document is the only legally binding one. In the event of any discrepancy, the French version prevails.';

const mentions: LegalDoc = {
  id: 'mentions',
  title: 'Legal notice',
  shortTitle: 'Legal notice',
  sections: [
    { body: [PRIMAUTE] },
    {
      heading: 'Publisher',
      body: [
        `The Pokza service is published by ${EDITEUR}, a natural person acting in a non-professional capacity (no company has been incorporated at this stage; the service is free and non-profit).`,
        `Contact: ${CONTACT_EMAIL}.`,
        `In accordance with article 1-1, II of French law no. 2004-575 of 21 June 2004 (LCEN), as a non-professional publisher, the publisher's postal address is not made public; it is provided to the host and may be obtained from the host under the conditions set out by law.`,
      ],
    },
    {
      heading: 'Publication director',
      body: [`${EDITEUR}.`],
    },
    {
      heading: 'Hosting',
      body: [
        'The application and its data are hosted by Supabase (Supabase Pte. Ltd, 65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513), on Amazon Web Services (AWS) infrastructure, within the European Union, Europe region (Frankfurt, Germany).',
        'Service e-mails (confirmation, password reset, notifications) are delivered by Resend (Plus Five Five, Inc., 2261 Market Street #5039, San Francisco, CA 94114, United States).',
      ],
    },
    {
      heading: 'Reporting content',
      body: [
        `To report content you believe to be unlawful: use the “Report” button in the application, or write to ${ABUSE_EMAIL}. We handle reports reactively (see the Terms of use).`,
      ],
    },
  ],
};

const cgu: LegalDoc = {
  id: 'cgu',
  title: 'Terms and conditions of use',
  shortTitle: 'Terms of use',
  sections: [
    { body: [PRIMAUTE] },
    {
      heading: '1. Purpose',
      body: [
        `These terms govern access to and use of Pokza (“the Service”), published by ${EDITEUR}. By creating an account or using the Service, you accept these terms.`,
      ],
    },
    {
      heading: '2. What Pokza is (and is not)',
      body: [
        'Pokza is a social network for sharing, replaying, commenting on and voting about poker hands, and for building a network (friends, private groups).',
        'Pokza is NOT a gambling operator. No stake, no winnings and no real money are played, wagered or won on the Service. The amounts shown in hands are purely illustrative and serve to describe a game situation.',
      ],
    },
    {
      heading: '3. Access and registration',
      body: [
        'The Service is strictly reserved for people aged 18 or over. By creating an account, you declare that you are 18 or over. The rules are as follows:',
        '• one account per person;',
        '• you provide accurate information and keep it up to date;',
        '• you are responsible for keeping your password confidential and for activity carried out from your account.',
      ],
    },
    {
      heading: '4. Content and rules of conduct',
      body: [
        'You are solely responsible for the content you publish (hands, texts, images, GIFs, comments, polls).',
        'The following are prohibited in particular:',
        '• insults and harassment;',
        '• hateful or discriminatory speech;',
        '• sexual or shocking content;',
        '• impersonation;',
        '• spam and unauthorised commercial solicitation;',
        '• promoting unlicensed gambling operators;',
        '• scams and fraud;',
        '• any content involving minors or aimed at minors;',
        '• more generally, any unlawful content or content contrary to these terms.',
      ],
    },
    {
      heading: '5. Moderation',
      body: [
        'Moderation is reactive: we do not monitor content in advance, but we act promptly when manifestly unlawful content is reported to us, in accordance with our status as a host within the meaning of the French law on confidence in the digital economy (LCEN).',
        'You can report content or an account using the “Report” button. Depending on the situation, we may hide or remove content, and warn, suspend or ban an account. These measures are reversible, and the author of removed content is informed.',
        'You can also block another user: you will no longer see each other’s content and interactions.',
      ],
    },
    {
      heading: '6. Intellectual property',
      body: [
        'You remain the owner of the rights to the content you publish. You grant Pokza a non-exclusive, royalty-free licence to host, display and technically adapt this content, for the sole purpose of operating the Service.',
        'You warrant that you hold the necessary rights to what you publish. GIFs are provided through the GIPHY service and remain subject to GIPHY’s terms.',
      ],
    },
    {
      heading: '7. Personal data',
      body: [
        'The processing of your personal data is described in the Privacy policy, which forms an integral part of these terms.',
      ],
    },
    {
      heading: '8. Availability and liability',
      body: [
        'The Service is provided “as is”, without any guarantee of continuous availability or of freedom from error. Pokza may change, suspend or discontinue all or part of the Service.',
        'Pokza is not responsible for content published by users. To the extent permitted by law, the host cannot be held liable for indirect damages related to use of the Service.',
      ],
    },
    {
      heading: '9. Term, suspension and termination',
      body: [
        'You can delete your account at any time from “Edit my profile” — this results in the deletion of your content, under the conditions described in the Privacy policy.',
        'In the event of a breach of these terms, Pokza may suspend or terminate access to the account concerned.',
      ],
    },
    {
      heading: '10. Changes to the terms',
      body: [
        'These terms may be amended. In the event of a significant change, you will be informed. Using the Service after a change constitutes acceptance of the updated version.',
      ],
    },
    {
      heading: '11. Governing law and disputes',
      body: [
        'These terms are governed by French law.',
        `In the event of a dispute, we invite you to contact us first at ${CONTACT_EMAIL} to seek an amicable solution.`,
        'Failing an amicable agreement, the judicial court of Paris has jurisdiction, subject to the mandatory rules allowing a consumer to bring proceedings before the court of their place of residence.',
      ],
    },
  ],
};

const confidentialite: LegalDoc = {
  id: 'confidentialite',
  title: 'Privacy policy',
  shortTitle: 'Privacy',
  sections: [
    { body: [PRIMAUTE] },
    {
      heading: 'Data controller',
      body: [
        `The controller of your data is ${EDITEUR}, publisher of Pokza. For any question about your data: ${PRIVACY_EMAIL}.`,
      ],
    },
    {
      heading: 'Personal data and purposes of processing',
      body: [
        '• Identification: e-mail address and password (the latter is stored encrypted by our authentication provider);',
        '• Profile: username, profile picture, description, country, playing preferences;',
        '• Civil status: first name, last name and date of birth — used to verify that you are of age (18) and, depending on your choice, to display your name;',
        '• Usage and technical data: in-app interactions measured by our analytics tool, technical logs, IP address and technical identifiers of your browser or device.',
        'This usage and technical data is processed to maintain the Service, to moderate it and to keep users safe.',
        'Your IP address is personal data in its own right: independently of analytics, it is recorded in technical logs and passed to the anti-bot verification service (Cloudflare) and the GIF display service (GIPHY) described below.',
      ],
    },
    {
      heading: 'Legal bases for processing personal data',
      body: [
        '• E-mail address and password: performance of the contract;',
        '• Username and profile picture: performance of the contract;',
        '• First name, last name and date of birth: consent;',
        '• IP address, technical identifiers: performance of the contract.',
      ],
    },
    {
      heading: 'Who has access to your data',
      body: [
        'We do not sell your data. It is processed by providers (processors) acting on our behalf:',
        '• Supabase (hosting, database, authentication, storage) — AWS infrastructure, European Union (Frankfurt);',
        '• PostHog (analytics), hosted in the European Union (eu.posthog.com);',
        '• Resend (sending the e-mails needed to operate the Service), established in the United States — transfer covered by the standard contractual clauses;',
        '• GIPHY (supplying GIFs): when you display a GIF, a request is made to GIPHY, which may pass your IP address to that service;',
        '• Cloudflare (protecting the sign-in and sign-up forms against automated account creation, Turnstile service), established in the United States — transfer covered by the standard contractual clauses. During this check, your IP address and the technical signals of your browser are passed to that service.',
      ],
    },
    {
      heading: 'Transfers outside the European Union',
      body: [
        'Our main data (database, authentication, storage) and our analytics are hosted in the European Union. However, sending the Service’s e-mails (Resend), displaying GIFs (GIPHY) and the anti-bot check at sign-in and sign-up (Cloudflare) rely on providers established in the United States: these transfers outside the European Union are covered by the safeguards provided for by the GDPR, in particular the European Commission’s standard contractual clauses.',
      ],
    },
    {
      heading: 'Retention periods',
      body: [
        '• Personal account data: kept for as long as your account exists; deleted when you delete your account;',
        '• Reports: deleted 12 months after they are handled;',
        '• Content removed by moderation: permanently deleted 30 days after removal;',
        '• Technical logs (sign-in, security): kept for a maximum of 12 months.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'You have the rights of access, rectification, erasure, restriction, objection and portability over your data.',
        `You can delete your account and your content yourself from “Edit my profile”. To exercise your other rights, write to ${PRIVACY_EMAIL}.`,
        'You may also lodge a complaint with the CNIL, the French data protection authority (www.cnil.fr).',
      ],
    },
    {
      heading: 'Minors',
      body: [
        'The Service is prohibited to anyone under 18. We do not knowingly collect data from minors. If an account belonging to a minor is identified, it is blocked and then deleted.',
      ],
    },
    {
      heading: 'Cookies and trackers',
      body: [
        'On the web, strictly necessary local storage is used to keep you signed in; it does not require your consent.',
        'Our analytics tool (PostHog, hosted in the European Union) is configured to be exempt from consent in accordance with the CNIL’s recommendations: purpose limited to audience measurement, anonymised data, no tracking of your browsing on other sites and no cross-referencing with other processing. No advertising cookie or third-party tracker for targeting purposes is placed.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'We implement appropriate technical measures: encryption in transit, data access partitioned at database level, and restricted, logged administration access.',
        'On top of this, the sign-in and sign-up forms are protected against automated account creation, and security headers limit the scripts and servers the application can call from your browser.',
      ],
    },
  ],
};

const jeuResponsable: LegalDoc = {
  id: 'jeu-responsable',
  title: 'Responsible gambling',
  shortTitle: 'Responsible gambling',
  sections: [
    { body: [PRIMAUTE] },
    {
      body: [
        'Pokza is not a gambling site: nothing is wagered here, and no money is won here. It is a place to share and analyse poker hands among enthusiasts. The Service is reserved for adults (18 and over).',
      ],
    },
    {
      heading: 'Gambling carries risks',
      body: [
        'Played for real money (anywhere other than Pokza), poker can lead to addiction, debt and isolation. Never treat gambling as a source of income, and set yourself limits.',
      ],
    },
    {
      heading: 'Need help or someone to talk to',
      body: [
        // ⚠️ LE NUMÉRO RESTE LE NUMÉRO FRANÇAIS, et c'est volontaire : l'éditeur est français, le
        // droit applicable est français, et un anglophone qui lit ces textes est le plus souvent
        // en France. Le jour où une version par marché existera, ce sera le premier bloc à changer.
        'Joueurs Info Service (France): 09 74 75 13 13 (standard rate, every day from 8am to 2am).',
        'Online: www.joueurs-info-service.fr',
      ],
    },
    {
      heading: 'Licensed operators',
      body: [
        'In France, only operators licensed by the Autorité Nationale des Jeux (ANJ) are allowed to offer real-money poker online. Promoting unlicensed operators is prohibited on Pokza and can be reported.',
      ],
    },
  ],
};

export const LEGAL_DOCS_EN: LegalDoc[] = [cgu, confidentialite, mentions, jeuResponsable];
