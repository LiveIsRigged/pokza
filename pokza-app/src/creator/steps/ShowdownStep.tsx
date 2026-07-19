import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Card, Seat } from '../../types/poker';
import { colors, typography } from '../../theme/theme';
import { WizardScreen } from '../WizardScreen';
import { MultiCardPicker } from '../MultiCardPicker';
import { CardView } from '../../components/replayer/CardView';

interface ShowdownStepProps {
  /** Sièges adverses encore en jeu à l'abattage, à qui on peut attribuer des cartes */
  villains: Seat[];
  /** Cartes révélées par siège (seatId -> deux cartes, éventuellement partielles) */
  revealed: Record<string, (Card | undefined)[]>;
  onChange: (seatId: string, cards: (Card | undefined)[]) => void;
  /** Cartes déjà prises par le hero et le board */
  baseUsedCards: Card[];
  onNext: () => void;
  onBack: () => void;
}

function seatLabel(seat: Seat): string {
  return seat.playerName ?? seat.position;
}

export function ShowdownStep({ villains, revealed, onChange, baseUsedCards, onNext, onBack }: ShowdownStepProps) {
  const [selectedId, setSelectedId] = useState<string>(villains[0]?.id ?? '');

  const selectedCards = revealed[selectedId] ?? [];

  // Cartes indisponibles pour le siège en cours d'édition : hero + board + cartes des AUTRES adversaires.
  const disabledForSelected: Card[] = [
    ...baseUsedCards,
    ...villains
      .filter((v) => v.id !== selectedId)
      .flatMap((v) => (revealed[v.id] ?? []).filter(Boolean) as Card[]),
  ];

  return (
    <WizardScreen
      title="Abattage"
      subtitle="Cartes montrées par les adversaires (optionnel)"
      onNext={onNext}
      nextLabel="Continuer"
      onBack={onBack}
    >
      <View style={styles.villainRow}>
        {villains.map((v) => {
          const cards = revealed[v.id] ?? [];
          const isSelected = v.id === selectedId;
          return (
            <Pressable
              key={v.id}
              onPress={() => setSelectedId(v.id)}
              style={[styles.villainChip, isSelected && styles.villainChipSelected]}
            >
              <Text style={[styles.villainName, isSelected && styles.villainNameSelected]}>{seatLabel(v)}</Text>
              <View style={styles.miniCards}>
                {[0, 1].map((i) =>
                  cards[i] ? (
                    <CardView key={i} card={cards[i]} size="small" />
                  ) : (
                    <View key={i} style={styles.miniEmpty} />
                  )
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedId ? (
        <View style={styles.pickerSection}>
          <Text style={[typography.contextLine, styles.hint]}>
            Cartes de {seatLabel(villains.find((v) => v.id === selectedId)!)}
          </Text>
          <MultiCardPicker
            count={2}
            selected={selectedCards}
            disabledCards={disabledForSelected}
            onChange={(next) => onChange(selectedId, next)}
          />
        </View>
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  villainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  villainChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    alignItems: 'center',
    gap: 6,
  },
  villainChipSelected: {
    borderColor: colors.gold,
    borderWidth: 1.5,
    backgroundColor: '#FBF3DC',
  },
  villainName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  villainNameSelected: {
    color: colors.textPrimary,
  },
  miniCards: {
    flexDirection: 'row',
    gap: 3,
  },
  miniEmpty: {
    width: 22,
    height: 30,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(22,35,61,0.3)',
  },
  pickerSection: {
    marginTop: 4,
  },
  hint: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
});
