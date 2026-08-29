import React from 'react';
import { View } from 'react-native';
import type { Card } from '../../types/poker';
import { MultiCardPicker } from '../MultiCardPicker';
import { WizardScreen } from '../WizardScreen';

interface HoleCardsStepProps {
  /** Nombre de cartes à choisir selon la variante : 2 (Hold'em), 4 (PLO) ou 5 (PLO5). */
  count: number;
  cards: (Card | undefined)[];
  onChange: (cards: (Card | undefined)[]) => void;
  onNext: () => void;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
  /** Correction en cours : « Valider » publie directement au lieu de continuer l'assistant. */
  nextLabel?: string;
  /** La phrase collée au bouton, qui annonce ce que le changement en cours va coûter. */
  footerNote?: string | null;
  /** Empêche de valider une correction qui ne change rien — elle coûterait ses réactions pour rien. */
  nextBloque?: boolean;
}

export function HoleCardsStep({
  count,
  cards,
  onChange,
  onNext,
  onBack,
  step,
  totalSteps,
  nextLabel,
  footerNote,
  nextBloque,
}: HoleCardsStepProps) {
  const chosenCount = cards.filter(Boolean).length;
  const canContinue = chosenCount === count;

  return (
    <WizardScreen
      title="Tes cartes"
      subtitle={`Choisis tes ${count} cartes`}
      onNext={onNext}
      nextLabel={nextLabel}
      footerNote={footerNote}
      onBack={onBack}
      nextDisabled={!canContinue || Boolean(nextBloque)}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <MultiCardPicker count={count} selected={cards} onChange={onChange} />
      </View>
    </WizardScreen>
  );
}
