import React from 'react';
import { View } from 'react-native';
import type { Card } from '../../types/poker';
import { MultiCardPicker } from '../MultiCardPicker';
import { WizardScreen } from '../WizardScreen';
import { TableVue } from '../../components/table/TableVue';
import { GABARIT_ATELIER, hauteurTableCartes } from '../../engine/layout';
import { potDeReglage, siegesDeReglage } from '../tableReglage';
import type { ContextData } from '../types';

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
  /** La table réglée à l'étape précédente : les cartes choisies ici s'y posent devant Hero. */
  context: ContextData;
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
  context,
}: HoleCardsStepProps) {
  const chosenCount = cards.filter(Boolean).length;
  const canContinue = chosenCount === count;
  // Les cartes se posent devant Hero À MESURE qu'on les choisit, et pas seulement une fois les
  // deux (ou quatre, ou cinq) réunies : c'est le seul écran où l'on voit sa propre main arriver.
  const choisies = cards.filter(Boolean) as Card[];
  // Taper une carte SUR LA TABLE la retire, exactement comme taper la même carte dans le sélecteur.
  // C'est ce qui autorise à supprimer l'aperçu sous la table : la sélection ne se relit plus dans
  // une rangée à part, elle se relit — et se défait — là où elle se joue.
  const sieges = siegesDeReglage(context, choisies).map((s) =>
    s.seat.isHero
      ? {
          ...s,
          // Les cartes pas encore choisies se dessinent en pointillés devant Hero, à leur place.
          // Deux dos de carte diraient « il a une main qu'on ne connaît pas » — l'inverse de ce
          // qui se passe ici, où on attend justement qu'il la choisisse.
          cartesAttendues: true,
          onCartePress: (i: number) => onChange(choisies.filter((_, j) => j !== i)),
        }
      : s
  );

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
      zoneFixe={
        <TableVue
          sieges={sieges}
          board={[]}
          sansBoard
          sansGeste
          pot={potDeReglage(context)}
          gameType={context.gameType}
          currency={context.currency}
          bb={context.bombPot ? context.bombAnte : context.bb}
          holeCardCount={count}
          hauteur={hauteurTableCartes(context.numPlayers)}
          gabarit={GABARIT_ATELIER}
        />
      }
    >
      <View>
        <MultiCardPicker count={count} selected={cards} onChange={onChange} sansApercu />
      </View>
    </WizardScreen>
  );
}
