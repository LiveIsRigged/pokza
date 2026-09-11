import { LEGAL_DOCS_FR, LEGAL_UPDATED_ISO, type LegalDoc, type LegalDocId } from './legalContent';
import { LEGAL_DOCS_EN } from './legalContent.en';
import { langueCourante } from '../i18n/traduire';

/**
 * Quel jeu de documents montrer, et dans quelle langue.
 *
 * ⚠️ LE REPLI N'EST PAS LE FRANÇAIS. Un germanophone doit lire l'anglais, pas une langue qu'il ne
 * lit pas : c'est la même règle que partout ailleurs dans l'app. Le français reste la version qui
 * ENGAGE — la clause de primauté en tête de chaque traduction le dit —, mais l'opposabilité n'a
 * rien à voir avec la lisibilité.
 *
 * Un fichier de traduction est TOUT ou RIEN, contrairement au catalogue d'interface : un document
 * légal à moitié traduit, dont la moitié des sections tomberaient dans une autre langue, serait
 * pire que pas de traduction du tout.
 */
const PAR_LANGUE: Record<string, LegalDoc[]> = {
  fr: LEGAL_DOCS_FR,
  en: LEGAL_DOCS_EN,
};

export function documentsLegaux(): LegalDoc[] {
  return PAR_LANGUE[langueCourante()] ?? LEGAL_DOCS_EN;
}

export function getLegalDoc(id: LegalDocId): LegalDoc | undefined {
  return documentsLegaux().find((d) => d.id === id);
}

/** « 22 août 2026 » / « 22 August 2026 » — le format appartient à la langue, pas au texte. */
export function derniereMiseAJour(): string {
  const [annee, mois, jour] = LEGAL_UPDATED_ISO.split('-').map(Number);
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  try {
    return new Intl.DateTimeFormat(langueCourante(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return LEGAL_UPDATED_ISO;
  }
}
