import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Position } from '../../types/poker';
import { colors } from '../../theme/theme';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { POSITION_SETS } from '../positions';
import type { ContextData } from '../types';

const CASH_BLIND_PRESETS: [number, number][] = [
  [1, 2],
  [1, 3],
  [2, 5],
  [5, 10],
];

const TOURNAMENT_BLIND_PRESETS: [number, number][] = [
  [100, 200],
  [500, 1000],
  [5000, 10000],
  [50000, 100000],
];

// Un stack de départ se raisonne en "nombre de BB" plutôt qu'en valeur absolue : le stack effectif
// par défaut suit donc la BB (100BB en cash game, 50BB en tournoi — convention plus courte).
function defaultStackFor(gameType: ContextData['gameType'], bb: number): number {
  return bb * (gameType === 'tournament' ? 50 : 100);
}

function formatBlind(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(n);
}

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
          <Chip
            label="Cash game"
            selected={value.gameType === 'cash'}
            onPress={() => update({ gameType: 'cash', sb: 2, bb: 5, effectiveStack: defaultStackFor('cash', 5) })}
          />
          <Chip
            label="Tournoi"
            selected={value.gameType === 'tournament'}
            onPress={() =>
              update({
                gameType: 'tournament',
                sb: 100,
                bb: 200,
                effectiveStack: defaultStackFor('tournament', 200),
              })
            }
          />
        </View>

        <Text style={styles.label}>Blindes</Text>
        <View style={styles.row}>
          {(value.gameType === 'tournament' ? TOURNAMENT_BLIND_PRESETS : CASH_BLIND_PRESETS).map(([sb, bb]) => (
            <Chip
              key={`${sb}-${bb}`}
              label={`${formatBlind(sb)}/${formatBlind(bb)}`}
              selected={value.sb === sb && value.bb === bb}
              onPress={() => update({ sb, bb, effectiveStack: defaultStackFor(value.gameType, bb) })}
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
            onChangeText={(t) => {
              const bb = Number(t) || 0;
              update({ bb, effectiveStack: defaultStackFor(value.gameType, bb) });
            }}
          />
        </View>

        <Text style={styles.label}>Ante</Text>
        <View style={styles.row}>
          <Chip label="Aucun" selected={value.anteType === 'none'} onPress={() => update({ anteType: 'none' })} />
          <Chip
            label="BB ante"
            selected={value.anteType === 'bb'}
            onPress={() => update({ anteType: 'bb', ante: value.bb })}
          />
          <Chip
            label="Ante par joueur"
            selected={value.anteType === 'per-player'}
            onPress={() =>
              update({ anteType: 'per-player', ante: value.ante || Math.max(1, Math.round(value.bb / 4)) })
            }
          />
        </View>
        {value.anteType === 'bb' && (
          <Text style={styles.helperText}>Montant de l'ante : {value.bb} (identique à la BB)</Text>
        )}
        {value.anteType === 'per-player' && (
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Ante par joueur"
            value={String(value.ante)}
            onChangeText={(t) => update({ ante: Number(t) || 0 })}
          />
        )}

        {value.gameType === 'cash' && (
          <>
            <Text style={styles.label}>Straddle</Text>
            <View style={styles.row}>
              <Chip
                label="Aucun"
                selected={!value.straddle}
                onPress={() => update({ straddle: false })}
              />
              <Chip
                label="Straddle"
                selected={value.straddle}
                onPress={() => update({ straddle: true, straddleAmount: value.straddleAmount || value.bb * 2 })}
              />
            </View>
            {value.straddle && (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="Montant du straddle"
                value={String(value.straddleAmount)}
                onChangeText={(t) => update({ straddleAmount: Number(t) || 0 })}
              />
            )}
          </>
        )}

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

        <Text style={styles.label}>Joueurs (nom et stack, optionnel)</Text>
        {availablePositions.map((pos) => {
          const isHero = pos === value.heroPosition;
          return (
            <View key={pos} style={styles.playerRow}>
              <Text style={styles.playerRowLabel}>{isHero ? `${pos} (toi)` : pos}</Text>
              {!isHero && (
                <TextInput
                  style={[styles.input, styles.playerNameInput]}
                  placeholder="Nom"
                  value={value.opponentNames?.[pos] ?? ''}
                  onChangeText={(t) => update({ opponentNames: { ...value.opponentNames, [pos]: t } })}
                />
              )}
              <TextInput
                style={[styles.input, styles.playerStackInput]}
                keyboardType="numeric"
                placeholder={String(value.effectiveStack)}
                value={value.seatStacks?.[pos] != null ? String(value.seatStacks[pos]) : ''}
                onChangeText={(t) =>
                  update({ seatStacks: { ...value.seatStacks, [pos]: t ? Number(t) || 0 : undefined } })
                }
              />
            </View>
          );
        })}

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
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  playerRowLabel: {
    width: 56,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  playerNameInput: {
    flex: 2,
    marginBottom: 0,
  },
  playerStackInput: {
    flex: 1,
    marginBottom: 0,
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
});
