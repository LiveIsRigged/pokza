import React, { useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { deleteOwnAccount, updateProfile, type ProfileDetails } from '../data/profiles';
import { supabase } from '../lib/supabase';
import { Chip } from '../creator/Chip';
import { FORMAT_OPTIONS, FREQUENCE_OPTIONS, VARIANTE_OPTIONS } from './profileOptions';

const BIO_MAX_LENGTH = 150;
const PSEUDO_MAX_LENGTH = 24;

interface EditProfileScreenProps {
  profile: ProfileDetails;
  userId: string;
  onCancel: () => void;
  onSaved: (updated: ProfileDetails) => void;
}

/**
 * Champs modifiables après l'inscription : pseudo, préférence d'affichage, description, format
 * favori, fréquence de jeu. Prénom/nom/date de naissance restent verrouillés — ils vivent dans
 * `profiles_private`, une table à part avec ses propres règles, et changent rarement en pratique.
 */
export function EditProfileScreen({ profile, userId, onCancel, onSaved }: EditProfileScreenProps) {
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const [displayPreference, setDisplayPreference] = useState<'pseudo' | 'nom'>(profile.displayPreference);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [formatFavori, setFormatFavori] = useState(profile.formatFavori);
  const [varianteFavorite, setVarianteFavorite] = useState(profile.varianteFavorite);
  const [frequenceJeu, setFrequenceJeu] = useState(profile.frequenceJeu);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canSubmit = pseudo.trim().length > 0 && !submitting;

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeletingAccount(true);
    try {
      await deleteOwnAccount(userId);
      await supabase.auth.signOut();
    } catch (err) {
      setDeletingAccount(false);
      setConfirmingDelete(false);
      setDeleteError(errorMessage(err));
    }
  };

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const updated = await updateProfile(userId, {
        pseudo: pseudo.trim(),
        displayPreference,
        formatFavori,
        varianteFavorite,
        frequenceJeu,
        bio,
      });
      onSaved(updated);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(code === '23505' ? 'Ce pseudo est déjà pris, choisis-en un autre.' : errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>Modifier mon profil</Text>

        <Text style={styles.label}>Pseudo</Text>
        <TextInput
          style={styles.input}
          value={pseudo}
          onChangeText={setPseudo}
          autoCapitalize="none"
          placeholder="Ton pseudo sur Pokza"
          maxLength={PSEUDO_MAX_LENGTH}
        />

        <Text style={styles.label}>Afficher sur Pokza</Text>
        <View style={styles.row}>
          <Chip label="Mon pseudo" selected={displayPreference === 'pseudo'} onPress={() => setDisplayPreference('pseudo')} />
          <Chip label="Mon nom" selected={displayPreference === 'nom'} onPress={() => setDisplayPreference('nom')} />
        </View>

        <View style={styles.bioLabelRow}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.bioCounter}>
            {bio.length}/{BIO_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, BIO_MAX_LENGTH))}
          placeholder="Quelques mots sur toi…"
          multiline
          maxLength={BIO_MAX_LENGTH}
        />

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
        <Text style={styles.hint}>Les mains de cette variante remontent un peu dans ton fil.</Text>

        <Text style={styles.label}>À quelle fréquence joues-tu au poker ?</Text>
        <View style={styles.column}>
          {FREQUENCE_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={opt.label} selected={frequenceJeu === opt.value} onPress={() => setFrequenceJeu(opt.value)} />
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSave} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Enregistrer</Text>}
        </Pressable>

        {deleteError && <Text style={styles.error}>{deleteError}</Text>}

        <View style={styles.dangerZone}>
          {!confirmingDelete ? (
            <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8}>
              <Text style={styles.deleteLink}>Supprimer mon compte</Text>
            </Pressable>
          ) : (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>
                Supprimer définitivement ton compte, tes mains et tes commentaires ?
              </Text>
              <View style={styles.confirmButtonsRow}>
                <Pressable onPress={() => setConfirmingDelete(false)} hitSlop={8} disabled={deletingAccount}>
                  <Text style={styles.confirmCancel}>Non</Text>
                </Pressable>
                <Pressable onPress={handleDeleteAccount} hitSlop={8} disabled={deletingAccount}>
                  {deletingAccount ? (
                    <ActivityIndicator size="small" color="#C0392B" />
                  ) : (
                    <Text style={styles.confirmConfirm}>Oui, supprimer</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.feedBackground,
    zIndex: 10,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 60,
  },
  topRow: {
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.tableFelt,
    marginBottom: 20,
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
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  column: {
    flexDirection: 'column',
    alignItems: 'flex-start',
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
  dangerZone: {
    marginTop: 32,
    alignItems: 'center',
  },
  deleteLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  confirmCancel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmConfirm: {
    fontSize: 13,
    color: '#C0392B',
    fontWeight: '700',
  },
});
