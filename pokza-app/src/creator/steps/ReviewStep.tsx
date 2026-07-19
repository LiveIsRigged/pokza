import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/theme';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import type { ReviewData } from '../types';

interface ReviewStepProps {
  value: ReviewData;
  onChange: (value: ReviewData) => void;
  onSubmit: () => void;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
}

export function ReviewStep({ value, onChange, onSubmit, onBack, step, totalSteps }: ReviewStepProps) {
  const update = (patch: Partial<ReviewData>) => onChange({ ...value, ...patch });

  return (
    <WizardScreen
      title="Publier"
      subtitle="Derniers détails"
      onNext={onSubmit}
      nextLabel="Publier la main"
      nextDisabled={!value.title.trim()}
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <Text style={styles.label}>Titre</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Hero call contre un reg"
          value={value.title}
          onChangeText={(t) => update({ title: t })}
        />

        <Text style={styles.label}>Question au vote (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Tu payes cette river ?"
          value={value.voteQuestion ?? ''}
          onChangeText={(t) => update({ voteQuestion: t })}
        />

        <Text style={styles.label}>Visibilité</Text>
        <View style={styles.row}>
          <Chip label="Public" selected={value.visibility === 'public'} onPress={() => update({ visibility: 'public' })} />
          <Chip label="Privé" selected={value.visibility === 'private'} onPress={() => update({ visibility: 'private' })} />
        </View>
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
  input: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
  },
});
