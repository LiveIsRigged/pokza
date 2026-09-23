/**
 * Événements analytics VOLONTAIREMENT explicites — pas d'autocapture (mesure d'audience minimale,
 * exemptée de consentement CNIL). Pour émettre un nouvel événement, ajoute d'abord son nom ici.
 */
export type AnalyticsEvent =
  | 'signed_up'
  | 'hand_created'
  | 'hand_corrected'
  /** Republication d'une copie devant une autre audience — la sortie de secours du verrou
   *  d'audience. Sa fréquence dit si l'interdiction de changer de public gêne vraiment. */
  | 'hand_duplicated'
  | 'report_submitted'
  // ── CHANTIER SOCIAL (16/09/2026) ──────────────────────────────────────────────────────────
  // Ces six-là comptent des GESTES, jamais des personnes : PostHog n'a plus d'`identify` depuis
  // le 22/08 et ne crée aucun profil individuel. Les questions par personne et par cohorte
  // (« a-t-il un ami à J7 ? », « revient-il ? ») se lisent en base, cf.
  // `docs/dev/amorcage-tableau-de-bord.sql` — pas ici, et surtout pas en remettant `identify`.
  /** Quelqu'un partage son lien d'invitation. `issue` dit si le partage a abouti : sur desktop il
   *  n'y a pas de feuille de partage, on retombe sur un copier-coller. */
  | 'invitation_partagee'
  /** Un lien d'invitation est OUVERT. Part aussi (et surtout) pour un visiteur sans compte —
   *  c'est la seule mesure de ce que valent les liens envoyés. */
  | 'invitation_ouverte'
  /** Une main est ouverte par un lien extérieur — `publique` = `/post/:id`, `jeton` = `/s/:token`. */
  | 'main_ouverte_par_lien'
  /** Le profil est rempli et validé. Couplé à `signed_up`, il mesure l'abandon entre le compte
   *  créé et le premier écran utile — neuf champs plus loin. */
  | 'profil_complete'
  /** LE plus important du lot : `origine` dit par quelle PORTE la demande est partie (recherche,
   *  suggestion, QR, lien d'invitation…). Toutes passent par la page de profil, donc sans cette
   *  propriété on saurait qu'il y a eu une demande et jamais d'où elle venait. */
  | 'demande_ami_envoyee'
  /** Une demande reçue est acceptée ou refusée, et depuis quel écran. */
  | 'demande_ami_traitee'
  /** Quelqu'un entre dans un groupe. `origine` = `lien` quand il n'était pas encore invité : c'est
   *  la seule mesure de ce que rapporte l'invitation par lien de quelqu'un qui n'était pas sur Pokza. */
  | 'groupe_rejoint';

/**
 * D'où vient l'ouverture d'une page de profil. Sert UNIQUEMENT à la mesure : c'est la valeur que
 * `demande_ami_envoyee` reportera, puisque toutes les façons d'ajouter quelqu'un finissent sur la
 * même page. `autre` couvre ce d'où aucune demande d'ami n'est attendue (son propre profil, la
 * liste des comptes bloqués).
 */
export type OrigineProfil =
  | 'recherche'
  | 'suggestion'
  | 'qr'
  | 'invitation'
  | 'notification'
  | 'fil'
  | 'main'
  | 'groupe'
  | 'amis'
  | 'profil'
  | 'autre';

/** Propriétés simples attachées à un événement (jamais de données personnelles). */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
