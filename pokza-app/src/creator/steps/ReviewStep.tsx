import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/theme';
import type { Group } from '../../data/groups';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { DESCRIPTION_MAX_LENGTH, type ReviewData } from '../types';
import {
  TITLE_MAX_LENGTH,
  VOTE_OPTION_MAX_LENGTH,
  VOTE_QUESTION_MAX_LENGTH,
} from '../../constants/limits';

const MAX_VOTE_OPTIONS = 4;

interface ReviewStepProps {
  value: ReviewData;
  onChange: (value: ReviewData) => void;
  onSubmit: () => void;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
  /** Groupes dont l'utilisateur est membre — le chip "Groupe privé" n'apparaît que s'il y en a au moins un. */
  groups: Group[];
  /** Publication en cours : verrouille le bouton et le dit. Sans ça, un second appui pendant
   * l'aller-retour réseau publie la main une deuxième fois — et rien côté base ne l'en empêche
   * (vérifié : deux insertions identiques simultanées sont toutes deux acceptées). */
  submitting?: boolean;
}

export function ReviewStep({ value, onChange, onSubmit, onBack, step, totalSteps, groups, submitting }: ReviewStepProps) {
  const update = (patch: Partial<ReviewData>) => onChange({ ...value, ...patch });

  const voteOptions = value.voteOptions ?? ['', ''];
  const hasVoteQuestion = (value.voteQuestion ?? '').trim().length > 0;

  const updateOption = (index: number, text: string) => {
    const next = [...voteOptions];
    next[index] = text;
    update({ voteOptions: next });
  };

  const filledOptions = voteOptions.map((o) => o.trim()).filter(Boolean);

  return (
    <WizardScreen
      title="Publier"
      subtitle="Derniers détails"
      onNext={onSubmit}
      nextLabel={submitting ? 'Publication…' : 'Publier la main'}
      nextDisabled={
        submitting || !value.title.trim() || (value.visibility === 'group' && !value.groupId)
      }
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <Text style={styles.label}>Titre</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Hero call contre un reg"
          maxLength={TITLE_MAX_LENGTH}
          value={value.title}
          onChangeText={(t) => update({ title: t })}
        />

        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelNoMargin]}>Description (optionnel)</Text>
          <Text style={styles.counter}>
            {(value.description ?? '').length}/{DESCRIPTION_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="Contexte, action street par street, ce que vous demandez aux lecteurs…"
          value={value.description ?? ''}
          onChangeText={(t) => update({ description: t.slice(0, DESCRIPTION_MAX_LENGTH) })}
          maxLength={DESCRIPTION_MAX_LENGTH}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Question au vote (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Tu payes cette river ?"
          maxLength={VOTE_QUESTION_MAX_LENGTH}
          value={value.voteQuestion ?? ''}
          onChangeText={(t) => update({ voteQuestion: t })}
        />

        {hasVoteQuestion && (
          <>
            <Text style={styles.label}>Réponses possibles (2 à 4)</Text>
            {[0, 1, 2, 3].map((i) => (
              <TextInput
                key={i}
                style={[styles.input, styles.optionInput]}
                placeholder={i < 2 ? `Réponse ${i + 1}` : `Réponse ${i + 1} (optionnel)`}
                value={voteOptions[i] ?? ''}
                onChangeText={(t) => updateOption(i, t)}
                maxLength={VOTE_OPTION_MAX_LENGTH}
              />
            ))}

            {filledOptions.length > 0 && (
              <>
                <Text style={styles.label}>Aperçu du vote</Text>
                <View style={styles.previewRow}>
                  {filledOptions.slice(0, MAX_VOTE_OPTIONS).map((opt, i) => (
                    <View key={i} style={styles.previewBubble}>
                      <Text style={styles.previewBubbleText}>{opt}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.label}>Visibilité</Text>
        <View style={styles.row}>
          <Chip label="Public" selected={value.visibility === 'public'} onPress={() => update({ visibility: 'public', groupId: undefined })} />
          <Chip label="Privé" selected={value.visibility === 'private'} onPress={() => update({ visibility: 'private', groupId: undefined })} />
          {groups.length > 0 && (
            <Chip
              label="Groupe privé"
              selected={value.visibility === 'group'}
              onPress={() => update({ visibility: 'group', groupId: value.groupId ?? groups[0].id })}
            />
          )}
        </View>

        {value.visibility === 'group' && groups.length > 0 && (
          <>
            <Text style={styles.label}>Quel groupe privé ?</Text>
            <View style={styles.row}>
              {groups.map((g) => (
                <Chip key={g.id} label={g.name} selected={value.groupId === g.id} onPress={() => update({ groupId: g.id })} />
              ))}
            </View>
          </>
        )}
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
    marginBottom: 6,
  },
  labelNoMargin: {
    marginTop: 0,
    marginBottom: 0,
  },
  counter: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
  },
  descriptionInput: {
    minHeight: 88,
  },
  optionInput: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewBubble: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  previewBubbleText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
});
