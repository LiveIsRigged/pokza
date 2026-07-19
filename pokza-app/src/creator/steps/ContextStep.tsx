import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Position } from '../../types/poker';
import { colors } from '../../theme/theme';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { POSITION_SETS } from '../positions';
import type { ContextData } from '../types';

const BLIND_PRESETS: [number, number][] = [
  [1, 2],
  [1, 3],
  [2, 5],
  [5, 10],
];

interface ContextStepProps {
  value: ContextData;
  onChange: (value: ContextData) => void;
  onNext: () => void;
  step?: number;
  totalSteps?: number;
}

export function ContextStep({ value, onChange, onNext, step, totalSteps }: ContextStepProps) {
  const availablePositions = POSITION_SETS[value.numPlayers] ?? POSITION_SETS[6];
  const heroValid = availablePositions.includes(value.heroPosition);

  const update = (patch: Partial<ContextData>) => onChange({ ...value, ...patch });

  return (
    <WizardScreen
      title="La table"
      subtitle="Contexte de la main"
      onNext={onNext}
      nextDisabled={!heroValid || !value.sb || !value.bb || !value.effectiveStack}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <Text style={styles.label}>Type de partie</Text>
        <View style={styles.row}>
          <Chip label="Cash game" selected={value.gameType === 'cash'} onPress={() => update({ gameType: 'cash' })} />
          <Chip label="Tournoi" selected={value.gameType === 'tournament'} onPress={() => update({ gameType: 'tournament' })} />
        </View>

        <Text style={styles.label}>Blindes</Text>
        <View style={styles.row}>
          {BLIND_PRESETS.map(([sb, bb]) => (
            <Chip
              key={`${sb}-${bb}`}
              label={`${sb}/${bb}`}
              selected={value.sb === sb && value.bb === bb}
              onPress={() => update({ sb, bb })}
            />
          ))}
        </View>
        <View style={styles.inlineInputs}>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="SB"
            value={String(value.sb)}
            onChangeText={(t) => update({ sb: Number(t) || 0 })}
          />
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="BB"
            value={String(value.bb)}
            onChangeText={(t) => update({ bb: Number(t) || 0 })}
          />
        </View>

        <Text style={styles.label}>Stack effectif</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="Stack"
          value={String(value.effectiveStack)}
          onChangeText={(t) => update({ effectiveStack: Number(t) || 0 })}
        />

        <Text style={styles.label}>Nombre de joueurs</Text>
        <View style={styles.row}>
          {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <Chip
              key={n}
              label={String(n)}
              selected={value.numPlayers === n}
              onPress={() => {
                const newPositions = POSITION_SETS[n];
                const stillValid = newPositions.includes(value.heroPosition);
                update({ numPlayers: n, heroPosition: stillValid ? value.heroPosition : newPositions[0] });
              }}
            />
          ))}
        </View>

        <Text style={styles.label}>Ta position</Text>
        <View style={styles.row}>
          {availablePositions.map((pos: Position) => (
            <Chip key={pos} label={pos} selected={value.heroPosition === pos} onPress={() => update({ heroPosition: pos })} />
          ))}
        </View>

        <Text style={styles.label}>Lieu (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Club Circus, Bruxelles"
          value={value.location ?? ''}
          onChangeText={(t) => update({ location: t })}
        />

        {value.gameType === 'tournament' && (
          <>
            <Text style={styles.label}>Buy-in (optionnel)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : 100€"
              value={value.buyIn ?? ''}
              onChangeText={(t) => update({ buyIn: t })}
            />
            <Text style={styles.label}>Niveau de blindes (optionnel)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : Niveau 12"
              value={value.level ?? ''}
              onChangeText={(t) => update({ level: t })}
            />
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    marginBottom: 4,
  },
});
