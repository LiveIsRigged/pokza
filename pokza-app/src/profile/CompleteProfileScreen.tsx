import React, { useRef, useState } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../analytics';
import { Chip } from '../creator/Chip';
import { CountryPicker } from '../components/ui/CountryPicker';
import { countryByCode, flagEmoji } from '../data/countries';
import { borders, colors, placeholderText, radius, tints } from '../theme/theme';
import { LegalScreen } from '../legal/LegalScreen';
import type { LegalDocId } from '../legal/legalContent';
import { FORMAT_OPTIONS, FREQUENCE_OPTIONS, VARIANTE_OPTIONS } from './profileOptions';

/**
 * Donne le focus à une case de la date de naissance, et place le curseur si on le demande.
 *
 * `preventScroll` : sans lui, `focus()` fait défiler la page pour révéler la case, et `AjusteurHauteur`
 * la remet en haut à l'évènement suivant du viewport. C'est l'explication retenue du saut signalé par
 * Victor le 15/09/2026 (vers le haut puis retour, à chaque changement de case), à confirmer sur iPhone.
 * Les trois cases sont sur la même rangée, déjà visible : il n'y a rien à révéler. iOS respecte
 * l'option depuis Safari 15.5 (bug WebKit 236584).
 *
 * Sur le web, la référence EST l'`<input>` : react-native-web ne redéfinit pas `focus` et ne fournit
 * pas `setSelection`.
 */
function focaliser(champ: TextInput | null, curseur?: number) {
  if (!champ) return;
  if (Platform.OS === 'web') {
    const input = champ as unknown as HTMLInputElement;
    input.focus({ preventScroll: true });
    if (curseur !== undefined) input.setSelectionRange(curseur, curseur);
    return;
  }
  champ.focus();
  if (curseur !== undefined) champ.setSelection(curseur, curseur);
}

/**
 * Date de naissance : effacer dans une case VIDE rend la main à la case d'avant, le curseur après ses
 * chiffres pour que l'effacement suivant en retire un. `preventDefault` : la touche ramène et n'efface
 * rien au passage — une fois le focus déplacé, rien ne garantit que le navigateur n'applique pas
 * l'effacement à la case d'avant.
 */
function revenirSiVide(valeur: string, precedente: React.RefObject<TextInput | null>, valeurPrecedente: string) {
  return (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key !== 'Backspace' || valeur !== '' || !precedente.current) return;
    e.preventDefault();
    focaliser(precedente.current, valeurPrecedente.length);
  };
}

interface CompleteProfileScreenProps {
  onComplete: () => void;
  /** Revenir en arrière depuis cet écran = se déconnecter : le compte existe déjà (l'inscription
   * est faite), mais tant que le profil n'est pas créé il n'y a rien d'autre où aller. */
  onBack: () => void;
  /** Reportée telle quelle par `profil_complete`, pour que l'abandon se lise par porte d'entrée. */
  origine?: 'invitation' | 'direct';
}

// Construit une date ISO (YYYY-MM-DD) à partir de jour/mois/année saisis séparément, et vérifie
// qu'elle est réellement valide (ex: 30 février rejeté) — Date() "corrige" silencieusement les
// dates invalides en changeant de mois, d'où la revérification après construction.
function parseBirthDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || y < 1900 || y > new Date().getFullYear()) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MINIMUM_AGE = 18;
import { BIO_MAX_LENGTH, PSEUDO_MAX_LENGTH } from '../constants/limits';
import { useT } from '../i18n';
import { decouper } from '../i18n/noeuds';

/** Compare année/mois/jour un à un plutôt que de soustraire des millisecondes — insensible aux
 * fuseaux horaires et aux années bissextiles, qui rendraient un calcul par différence peu fiable
 * pile autour d'un anniversaire. */
function isAtLeastAge(dateNaissanceIso: string, minimumAge: number): boolean {
  const [y, m, d] = dateNaissanceIso.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const birthdayPassedThisYear = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!birthdayPassedThisYear) age -= 1;
  return age >= minimumAge;
}

export function CompleteProfileScreen({ onComplete, onBack, origine = 'direct' }: CompleteProfileScreenProps) {
  const t = useT();
  const [pseudo, setPseudo] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [bio, setBio] = useState('');
  // Défaut « nom » et non « pseudo » (décision de Victor, 23/08) : Pokza se veut un réseau de
  // joueurs qui se connaissent, pas d'avatars anonymes. Le choix reste offert juste en dessous, et
  // la base garde `'pseudo'` comme valeur par défaut de colonne — c'est bien l'app qui envoie
  // explicitement `p_display_preference`, donc rien à migrer.
  const [displayPreference, setDisplayPreference] = useState<'pseudo' | 'nom'>('nom');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // Le jour et le mois passent au champ suivant dès leur deuxième chiffre, et effacer dans une case
  // vide ramène à la précédente (demandes de Victor, 15/09/2026) : il fallait toucher chaque case.
  // Le `focus()` part pendant la frappe, jamais après un `await` ni dans un `setTimeout` : iOS
  // n'ouvre le clavier que pour un focus donné pendant un geste de l'utilisateur.
  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const [formatFavori, setFormatFavori] = useState<string | null>(null);
  // Variante préférée : pré-sélectionnée sur Hold'em (le défaut) pour ne pas ajouter de friction —
  // le champ n'est donc jamais vide et n'entre pas dans `canSubmit`.
  const [varianteFavorite, setVarianteFavorite] = useState<string>('nlhe');
  const [frequenceJeu, setFrequenceJeu] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  // Consentement au traitement de l'état civil (prénom, nom, date de naissance). Distinct de
  // l'acceptation des CGU recueillie à l'inscription : le RGPD interdit de grouper un consentement
  // avec l'acceptation d'un contrat, et il doit être recueilli là où la donnée est saisie — donc
  // ici, pas sur `AuthScreen`. Voir docs/legal/README.md (retour du juriste, 21/08/2026).
  const [identityConsent, setIdentityConsent] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    pseudo.trim().length > 0 &&
    prenom.trim().length > 0 &&
    nom.trim().length > 0 &&
    Boolean(country) &&
    Boolean(formatFavori) &&
    Boolean(frequenceJeu) &&
    identityConsent &&
    !submitting;

  const handleSubmit = async () => {
    setError(null);
    // Doublon volontaire de la garde `canSubmit` : le bouton est déjà désactivé, mais un
    // consentement ne doit jamais pouvoir être contourné par un chemin d'appel oublié.
    if (!identityConsent) {
      setError(t('profil.consentement_requis'));
      return;
    }
    const dateNaissance = parseBirthDate(day, month, year);
    if (!dateNaissance) {
      setError(t('profil.erreur_date_invalide'));
      return;
    }
    if (!isAtLeastAge(dateNaissance, MINIMUM_AGE)) {
      setError(t('profil.erreur_mineur'));
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc('create_profile', {
      p_pseudo: pseudo.trim(),
      p_display_preference: displayPreference,
      p_format_favori: formatFavori,
      p_frequence_jeu: frequenceJeu,
      p_prenom: prenom.trim(),
      p_nom: nom.trim(),
      p_date_naissance: dateNaissance,
      // Trace du consentement : la base horodate elle-même (`now()`), on ne lui
      // envoie que le fait qu'il a été donné. Un horodatage fourni par le client
      // serait une preuve que le client peut écrire lui-même — donc pas une preuve.
      p_consentement_identite: identityConsent,
    });

    if (rpcError) {
      setSubmitting(false);
      if (rpcError.code === '23505') {
        setError(t('profil.erreur_pseudo_pris'));
      } else if (rpcError.code === '23514') {
        setError(t('profil.erreur_mineur'));
      } else {
        setError(rpcError.message);
      }
      return;
    }

    // Ni la variante ni la description ne sont gérées par `create_profile` (RPC SECURITY DEFINER
    // qu'on ne veut pas réécrire à l'aveugle) : la ligne est créée avec leurs défauts, et on ne fait
    // un update de suivi que si l'utilisateur s'est écarté de ces défauts. Le self-update est
    // autorisé par RLS (même chemin que l'écran d'édition). Un échec ici ne bloque pas l'entrée —
    // les deux champs restent modifiables depuis le profil.
    const followUp: { variante_favorite?: string; bio?: string; country?: string } = {};
    if (varianteFavorite !== 'nlhe') followUp.variante_favorite = varianteFavorite;
    if (bio.trim()) followUp.bio = bio.trim();
    if (country) followUp.country = country;
    if (Object.keys(followUp).length > 0) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from('profiles').update(followUp).eq('id', userData.user.id);
      }
    }

    // Compté ICI et pas à l'entrée de l'écran : couplé à `signed_up`, c'est l'écart entre les deux
    // qui dit combien de comptes s'arrêtent devant les neuf champs de ce formulaire.
    trackEvent('profil_complete', { origine });
    setSubmitting(false);
    onComplete();
  };

  // Le nom sous lequel les autres le verront, MONTRÉ plutôt qu'expliqué (décision de Victor,
  // 23/08/2026). Il remplace une phrase de 36 mots sur la vie privée, qui arrivait au pire moment
  // — juste après avoir réclamé un état civil — et dont un tiers faisait doublon avec la ligne
  // sous la date de naissance. Ce que la phrase disait, cet aperçu le démontre.
  // Reproduit la règle de la colonne `display_name` (cf. docs/dev/recherche-par-nom.sql) : prénom
  // + nom quand la préférence est « nom », le pseudo sinon. Si les deux calculs devaient diverger,
  // c'est ici qu'il faudrait corriger — la base fait foi.
  // Vide tant que le champ correspondant n'est pas rempli : « Tu apparaîtras comme . » serait pire
  // que pas de ligne du tout, et l'écran s'ouvre justement sur des champs vides.
  const apercuNomAffiche =
    displayPreference === 'nom'
      ? prenom.trim() && nom.trim()
        ? `${prenom.trim()} ${nom.trim()}`
        : ''
      : pseudo.trim();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={onBack} hitSlop={8} disabled={submitting}>
          <Text style={styles.backText}>{t('createur.retour')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('profil.completer_titre')}</Text>
        <Text style={styles.subtitle}>{t('profil.completer_sous_titre')}</Text>

        <Text style={styles.label}>{t('profil.pseudo')}</Text>
        <TextInput
          autoComplete="off"
          style={styles.input}
          value={pseudo}
          onChangeText={setPseudo}
          autoCapitalize="none"
          placeholder={t('profil.pseudo_placeholder')}
          placeholderTextColor={placeholderText}
          maxLength={PSEUDO_MAX_LENGTH}
        />

        <Text style={styles.label}>{t('profil.prenom')}</Text>
        <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder={t('profil.prenom')} placeholderTextColor={placeholderText} />

        <Text style={styles.label}>{t('profil.nom')}</Text>
        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder={t('profil.nom')} placeholderTextColor={placeholderText} />

        <Text style={styles.label}>{t('profil.afficher_sur_pokza')}</Text>
        <View style={styles.row}>
          <Chip label={t('profil.mon_nom')} selected={displayPreference === 'nom'} onPress={() => setDisplayPreference('nom')} />
          <Chip label={t('profil.mon_pseudo')} selected={displayPreference === 'pseudo'} onPress={() => setDisplayPreference('pseudo')} />
        </View>
        {apercuNomAffiche ? (
          <Text style={styles.reassurance}>
            {decouper(t('profil.apparaitras_comme'), {
              nom: <Text style={styles.reassuranceFort}>{apercuNomAffiche}</Text>,
            })}
          </Text>
        ) : null}

        <Text style={styles.label}>{t('profil.pays')}</Text>
        <Pressable style={styles.selector} onPress={() => setCountryPickerOpen(true)}>
          {country ? (
            <Text style={styles.selectorValue}>
              {flagEmoji(country)} {countryByCode(country)?.name ?? country}
            </Text>
          ) : (
            <Text style={styles.selectorPlaceholder}>{t('pays.titre')}</Text>
          )}
          <Text style={styles.selectorChevron}>›</Text>
        </Pressable>

        <Text style={styles.label}>{t('profil.date_de_naissance')}</Text>
        <View style={styles.dobRow}>
          <TextInput
            ref={dayRef}
            autoComplete="off"
            style={styles.dobInput}
            value={day}
            onChangeText={(text) => {
              setDay(text);
              if (text.length === 2) focaliser(monthRef.current);
            }}
            placeholder={t('profil.jour_court')}
            placeholderTextColor={placeholderText}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextInput
            ref={monthRef}
            autoComplete="off"
            style={styles.dobInput}
            value={month}
            onChangeText={(text) => {
              setMonth(text);
              if (text.length === 2) focaliser(yearRef.current);
            }}
            onKeyPress={revenirSiVide(month, dayRef, day)}
            placeholder={t('profil.mois_court')}
            placeholderTextColor={placeholderText}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextInput
            ref={yearRef}
            autoComplete="off"
            style={[styles.dobInput, styles.dobInputYear]}
            value={year}
            onChangeText={setYear}
            onKeyPress={revenirSiVide(year, monthRef, month)}
            placeholder={t('profil.annee_court')}
            placeholderTextColor={placeholderText}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <Text style={styles.reassurance}>{t('profil.date_privee')}</Text>

        <Pressable style={styles.consentBox} onPress={() => setIdentityConsent((v) => !v)}>
          <View style={[styles.checkbox, identityConsent && styles.checkboxChecked]}>
            {identityConsent && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            {decouper(t('profil.consentement_identite'), {
              confidentialite: (
                <Text style={styles.consentLink} onPress={() => setLegalDoc('confidentialite')}>
                  {t('auth.consentement_confidentialite')}
                </Text>
              ),
            })}
          </Text>
        </Pressable>

        <View style={styles.bioLabelRow}>
          <Text style={styles.label}>{t('profil.description_optionnel')}</Text>
          <Text style={styles.bioCounter}>
            {bio.length}/{BIO_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          autoComplete="off"
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, BIO_MAX_LENGTH))}
          placeholder={t('profil.description_placeholder')}
          placeholderTextColor={placeholderText}
          multiline
          maxLength={BIO_MAX_LENGTH}
        />
        <Text style={styles.reassurance}>{t('profil.description_aide')}</Text>

        <Text style={styles.label}>{t('profil.format_favori')}</Text>
        <View style={styles.row}>
          {FORMAT_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={t(opt.cle)} selected={formatFavori === opt.value} onPress={() => setFormatFavori(opt.value)} />
          ))}
        </View>

        <Text style={styles.label}>{t('profil.variante_preferee')}</Text>
        <View style={styles.row}>
          {VARIANTE_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={t(opt.cle)} selected={varianteFavorite === opt.value} onPress={() => setVarianteFavorite(opt.value)} />
          ))}
        </View>

        <Text style={styles.label}>{t('profil.frequence_question')}</Text>
        <View style={styles.column}>
          {FREQUENCE_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={t(opt.cle)} selected={frequenceJeu === opt.value} onPress={() => setFrequenceJeu(opt.value)} />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('profil.valider_mon_profil')}</Text>}
        </Pressable>

        <CountryPicker
          visible={countryPickerOpen}
          selectedCode={country}
          allowClear={false}
          onSelect={(code) => {
            setCountry(code);
            setCountryPickerOpen(false);
          }}
          onClose={() => setCountryPickerOpen(false)}
        />
      </ScrollView>

      {legalDoc && (
        <View style={styles.legalOverlay}>
          <LegalScreen initialDocId={legalDoc} onBack={() => setLegalDoc(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 60,
    backgroundColor: colors.feedBackground,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.action,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.tableFelt,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  reassurance: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  // Le nom lui-même ressort du gris de la ligne : c'est la seule information de l'aperçu, le reste
  // n'est que la phrase qui la porte.
  reassuranceFort: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  selectorValue: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  selectorPlaceholder: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  selectorChevron: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  bioLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bioCounter: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  column: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  dobRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dobInput: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
    width: 64,
    textAlign: 'center',
  },
  dobInputYear: {
    width: 84,
  },
  // Encadré plutôt qu'une simple ligne : le RGPD veut un consentement « clairement distinguable
  // des autres questions » (art. 7 §2) — noyé entre la date de naissance et la description, il ne
  // le serait pas.
  consentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    padding: 12,
    borderWidth: 1,
    // Fond teinté et trait discret, PAS le blanc et le contour des champs de saisie : avec eux,
    // l'encadré se lisait comme un champ de plus, en plus gros — et sautait à la figure. Le
    // vocabulaire du thème le dit : `tints` est la famille des « zones inertes », ce qu'est une
    // mention de consentement. La séparation exigée par l'art. 7 §2 du RGPD reste lisible.
    borderColor: borders.subtle,
    borderRadius: radius.md,
    backgroundColor: tints.faint,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: borders.strong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  consentLink: {
    color: colors.action,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  legalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  error: {
    color: '#C0392B',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
