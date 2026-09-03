import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { supabase } from '../lib/supabase';
import { Chip } from '../creator/Chip';
import { CountryPicker } from '../components/ui/CountryPicker';
import { countryByCode, flagEmoji } from '../data/countries';
import { borders, colors, radius, tints } from '../theme/theme';
import { LegalScreen } from '../legal/LegalScreen';
import type { LegalDocId } from '../legal/legalContent';
import { FORMAT_OPTIONS, FREQUENCE_OPTIONS, VARIANTE_OPTIONS } from './profileOptions';

interface CompleteProfileScreenProps {
  onComplete: () => void;
  /** Revenir en arrière depuis cet écran = se déconnecter : le compte existe déjà (l'inscription
   * est faite), mais tant que le profil n'est pas créé il n'y a rien d'autre où aller. */
  onBack: () => void;
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

export function CompleteProfileScreen({ onComplete, onBack }: CompleteProfileScreenProps) {
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
      setError("Pour valider ton profil, tu dois consentir au traitement de ton prénom, de ton nom et de ta date de naissance.");
      return;
    }
    const dateNaissance = parseBirthDate(day, month, year);
    if (!dateNaissance) {
      setError('Date de naissance invalide.');
      return;
    }
    if (!isAtLeastAge(dateNaissance, MINIMUM_AGE)) {
      setError('Pokza est réservé aux personnes majeures (18 ans et plus).');
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
        setError('Ce pseudo est déjà pris, choisis-en un autre.');
      } else if (rpcError.code === '23514') {
        setError('Pokza est réservé aux personnes majeures (18 ans et plus).');
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
          <Text style={styles.backText}>‹ Retour</Text>
        </Pressable>

        <Text style={styles.title}>Complète ton profil</Text>
        <Text style={styles.subtitle}>Dernière étape avant de rejoindre Pokza</Text>

        <Text style={styles.label}>Pseudo</Text>
        <TextInput
          autoComplete="off"
          style={styles.input}
          value={pseudo}
          onChangeText={setPseudo}
          autoCapitalize="none"
          placeholder="Ton pseudo sur Pokza"
          maxLength={PSEUDO_MAX_LENGTH}
        />

        <Text style={styles.label}>Prénom</Text>
        <TextInput style={styles.input} value={prenom} onChangeText={setPrenom} placeholder="Prénom" />

        <Text style={styles.label}>Nom</Text>
        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Nom" />

        <Text style={styles.label}>Afficher sur Pokza</Text>
        <View style={styles.row}>
          <Chip label="Mon nom" selected={displayPreference === 'nom'} onPress={() => setDisplayPreference('nom')} />
          <Chip label="Mon pseudo" selected={displayPreference === 'pseudo'} onPress={() => setDisplayPreference('pseudo')} />
        </View>
        {apercuNomAffiche ? (
          <Text style={styles.reassurance}>
            Tu apparaîtras comme <Text style={styles.reassuranceFort}>{apercuNomAffiche}</Text>.
          </Text>
        ) : null}

        <Text style={styles.label}>Pays</Text>
        <Pressable style={styles.selector} onPress={() => setCountryPickerOpen(true)}>
          {country ? (
            <Text style={styles.selectorValue}>
              {flagEmoji(country)} {countryByCode(country)?.name ?? country}
            </Text>
          ) : (
            <Text style={styles.selectorPlaceholder}>Choisir un pays</Text>
          )}
          <Text style={styles.selectorChevron}>›</Text>
        </Pressable>

        <Text style={styles.label}>Date de naissance</Text>
        <View style={styles.dobRow}>
          <TextInput
            autoComplete="off"
            style={styles.dobInput}
            value={day}
            onChangeText={setDay}
            placeholder="JJ"
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextInput
            autoComplete="off"
            style={styles.dobInput}
            value={month}
            onChangeText={setMonth}
            placeholder="MM"
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextInput
            autoComplete="off"
            style={[styles.dobInput, styles.dobInputYear]}
            value={year}
            onChangeText={setYear}
            placeholder="AAAA"
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <Text style={styles.reassurance}>Ta date de naissance reste privée — elle n'est jamais affichée, quel que soit ton choix ci-dessus.</Text>

        <Pressable style={styles.consentBox} onPress={() => setIdentityConsent((v) => !v)}>
          <View style={[styles.checkbox, identityConsent && styles.checkboxChecked]}>
            {identityConsent && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            Je consens à ce que Pokza traite mes données personnelles, dont mon prénom, mon nom et ma date de
            naissance, afin de vérifier ma majorité — voir la{' '}
            <Text style={styles.consentLink} onPress={() => setLegalDoc('confidentialite')}>
              politique de confidentialité
            </Text>
            .
          </Text>
        </Pressable>

        <View style={styles.bioLabelRow}>
          <Text style={styles.label}>Description (optionnel)</Text>
          <Text style={styles.bioCounter}>
            {bio.length}/{BIO_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          autoComplete="off"
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, BIO_MAX_LENGTH))}
          placeholder="Quelques mots sur toi…"
          multiline
          maxLength={BIO_MAX_LENGTH}
        />
        <Text style={styles.reassurance}>Affichée sur ton profil. Tu peux la laisser vide et l'écrire plus tard.</Text>

        <Text style={styles.label}>Format favori</Text>
        <View style={styles.row}>
          {FORMAT_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={opt.label} selected={formatFavori === opt.value} onPress={() => setFormatFavori(opt.value)} />
          ))}
        </View>

        <Text style={styles.label}>Variante préférée</Text>
        <View style={styles.row}>
          {VARIANTE_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={opt.label} selected={varianteFavorite === opt.value} onPress={() => setVarianteFavorite(opt.value)} />
          ))}
        </View>
        <Text style={styles.reassurance}>Les mains de cette variante remonteront un peu dans ton fil. Modifiable à tout moment.</Text>

        <Text style={styles.label}>À quelle fréquence joues-tu au poker ?</Text>
        <View style={styles.column}>
          {FREQUENCE_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={opt.label} selected={frequenceJeu === opt.value} onPress={() => setFrequenceJeu(opt.value)} />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Valider mon profil</Text>}
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
