import React from 'react';
import { View } from 'react-native';
import type { Card } from '../../types/poker';
import { MultiCardPicker } from '../MultiCardPicker';
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
  const canContinue = Boolean(cards[0] && cards[1]);

  return (
    <WizardScreen
      title="Tes cartes"
      subtitle="Choisis tes deux cartes"
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!canContinue}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <MultiCardPicker
          count={2}
          selected={cards}
          onChange={(next) => onChange([next[0], next[1]])}
        />
      </View>
    </WizardScreen>
  );
}
