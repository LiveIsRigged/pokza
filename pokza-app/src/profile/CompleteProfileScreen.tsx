import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Chip } from '../creator/Chip';
import { colors, radius } from '../theme/theme';
import { FORMAT_OPTIONS, FREQUENCE_OPTIONS, VARIANTE_OPTIONS } from './profileOptions';

interface CompleteProfileScreenProps {
  onComplete: () => void;
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
const PSEUDO_MAX_LENGTH = 24;

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

export function CompleteProfileScreen({ onComplete }: CompleteProfileScreenProps) {
  const [pseudo, setPseudo] = useState('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [displayPreference, setDisplayPreference] = useState<'pseudo' | 'nom'>('pseudo');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [formatFavori, setFormatFavori] = useState<string | null>(null);
  // Variante préférée : pré-sélectionnée sur Hold'em (le défaut) pour ne pas ajouter de friction —
  // le champ n'est donc jamais vide et n'entre pas dans `canSubmit`.
  const [varianteFavorite, setVarianteFavorite] = useState<string>('nlhe');
  const [frequenceJeu, setFrequenceJeu] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    pseudo.trim().length > 0 &&
    prenom.trim().length > 0 &&
    nom.trim().length > 0 &&
    Boolean(formatFavori) &&
    Boolean(frequenceJeu) &&
    !submitting;

  const handleSubmit = async () => {
    setError(null);
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

    // La variante n'est pas gérée par `create_profile` (RPC SECURITY DEFINER qu'on ne veut pas
    // réécrire à l'aveugle) : la ligne est créée avec le défaut 'nlhe', on ne fait un update de
    // suivi que si l'utilisateur a choisi une autre variante. Le self-update est autorisé par RLS
    // (même chemin que l'écran d'édition). Un échec ici ne bloque pas l'entrée — la préférence
    // reste modifiable depuis le profil.
    if (varianteFavorite !== 'nlhe') {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from('profiles').update({ variante_favorite: varianteFavorite }).eq('id', userData.user.id);
      }
    }

    setSubmitting(false);
    onComplete();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Complète ton profil</Text>
      <Text style={styles.subtitle}>Dernière étape avant de rejoindre Pokza</Text>

      <Text style={styles.label}>Pseudo</Text>
      <TextInput
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
      <Text style={styles.reassurance}>
        Ton prénom et ton nom restent privés — ils ne sont jamais affichés publiquement, sauf si tu choisis
        ci-dessous d'afficher ton nom plutôt que ton pseudo.
      </Text>

      <Text style={styles.label}>Afficher sur Pokza</Text>
      <View style={styles.row}>
        <Chip label="Mon pseudo" selected={displayPreference === 'pseudo'} onPress={() => setDisplayPreference('pseudo')} />
        <Chip label="Mon nom" selected={displayPreference === 'nom'} onPress={() => setDisplayPreference('nom')} />
      </View>

      <Text style={styles.label}>Date de naissance</Text>
      <View style={styles.dobRow}>
        <TextInput
          style={styles.dobInput}
          value={day}
          onChangeText={setDay}
          placeholder="JJ"
          keyboardType="number-pad"
          maxLength={2}
        />
        <TextInput
          style={styles.dobInput}
          value={month}
          onChangeText={setMonth}
          placeholder="MM"
          keyboardType="number-pad"
          maxLength={2}
        />
        <TextInput
          style={[styles.dobInput, styles.dobInputYear]}
          value={year}
          onChangeText={setYear}
          placeholder="AAAA"
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
      <Text style={styles.reassurance}>Ta date de naissance reste privée — elle n'est jamais affichée, quel que soit ton choix ci-dessus.</Text>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 60,
    backgroundColor: colors.feedBackground,
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
    borderColor: 'rgba(22,35,61,0.25)',
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
    borderColor: 'rgba(22,35,61,0.25)',
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
