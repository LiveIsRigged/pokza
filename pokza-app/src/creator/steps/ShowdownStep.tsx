import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Action, Card, Seat } from '../../types/poker';
import { colors, typography } from '../../theme/theme';
import { WizardScreen } from '../WizardScreen';
import { MultiCardPicker } from '../MultiCardPicker';
import { CardView } from '../../components/replayer/CardView';
import { Chip } from '../Chip';
import { straddleSeatLabel } from '../../engine/handEngine';

interface ShowdownStepProps {
  /** Nombre de cartes fermées par joueur selon la variante : 2 (Hold'em), 4 (PLO) ou 5 (PLO5). */
  count: number;
  /** Sièges adverses encore en jeu à l'abattage, à qui on peut attribuer des cartes */
  villains: Seat[];
  /** TOUS les sièges de la main (pas seulement les villains) — nécessaire pour calculer le rang
   * d'un siège dans l'ordre d'action préflop (cf. `straddleSeatLabel`), faux sur un sous-ensemble filtré. */
  seats: Seat[];
  /** Cartes révélées par siège (seatId -> deux cartes, éventuellement partielles) */
  revealed: Record<string, (Card | undefined)[]>;
  onChange: (seatId: string, cards: (Card | undefined)[]) => void;
  /** Cartes déjà prises par le hero et le board */
  baseUsedCards: Card[];
  /** Actions de la main (dont un éventuel straddle préflop) — sert uniquement à l'affichage du nom des sièges */
  actions: Action[];
  /** Une fois activé, les mains adverses saisies ci-dessous restent visibles dans le replayer même
   * si elles perdent (sinon mucking classique) — ne concerne jamais Hero, toujours visible dès le
   * départ. Réglage global à la main, pas par adversaire. */
  revealShowdown: boolean;
  onChangeRevealShowdown: (value: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

function seatLabel(seat: Seat, seats: Seat[], actions: Action[]): string {
  return seat.playerName ?? straddleSeatLabel(seats, actions, seat.id) ?? seat.position;
}

export function ShowdownStep({
  count,
  villains,
  seats,
  revealed,
  onChange,
  baseUsedCards,
  actions,
  revealShowdown,
  onChangeRevealShowdown,
  onNext,
  onBack,
}: ShowdownStepProps) {
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
      <Text style={styles.label}>Révéler les mains à l'abattage</Text>
      <View style={styles.revealRow}>
        <Chip label="Non" selected={!revealShowdown} onPress={() => onChangeRevealShowdown(false)} />
        <Chip label="Oui" selected={revealShowdown} onPress={() => onChangeRevealShowdown(true)} />
      </View>
      <Text style={styles.revealHint}>
        {revealShowdown
          ? "Les cartes saisies ci-dessous resteront cachées pendant tout le coup, et n'apparaîtront qu'à l'abattage — gagnant ou perdant."
          : 'Les cartes saisies ci-dessous seront visibles dans le replay dès le début, comme celles de Hero.'}
      </Text>

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
              <Text style={[styles.villainName, isSelected && styles.villainNameSelected]}>
                {seatLabel(v, seats, actions)}
              </Text>
              <View style={styles.miniCards}>
                {Array.from({ length: count }).map((_, i) =>
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
            Cartes de {seatLabel(villains.find((v) => v.id === selectedId)!, seats, actions)}
          </Text>
          <MultiCardPicker
            count={count}
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
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  revealRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  revealHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 18,
  },
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
