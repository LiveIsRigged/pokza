import React from 'react';
import { View } from 'react-native';
import type { Card } from '../../types/poker';
import { CardPicker } from '../CardPicker';
import { WizardScreen } from '../WizardScreen';

interface HoleCardsStepProps {
  cards: [Card | undefined, Card | undefined];
  onChange: (cards: [Card | undefined, Card | undefined]) => void;
  onNext: () => void;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
}

export function HoleCardsStep({ cards, onChange, onNext, onBack, step, totalSteps }: HoleCardsStepProps) {
  const [first, second] = cards;
  const canContinue = Boolean(first && second);

  return (
    <WizardScreen
      title="Tes cartes"
      subtitle="Les deux cartes du hero"
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!canContinue}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <CardPicker
          label="Première carte"
          value={first}
          disabledCards={second ? [second] : []}
          onChange={(card) => onChange([card, second])}
        />
        <CardPicker
          label="Deuxième carte"
          value={second}
          disabledCards={first ? [first] : []}
          onChange={(card) => onChange([first, card])}
        />
      </View>
    </WizardScreen>
  );
}
