import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Action, ActionType, Card, Seat, Street } from '../../types/poker';
import { colors, typography } from '../../theme/theme';
import { getActingOrder, getActingOrderAfter } from '../positions';
import { WizardScreen } from '../WizardScreen';
import { CardPicker } from '../CardPicker';

const STREET_TITLES: Record<Street, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

const SLOT_LABELS = ['Première carte', 'Deuxième carte', 'Troisième carte'];

interface Snapshot {
  queue: string[];
  active: string[];
  betAmount: number;
  contributions: Record<string, number>;
  recorded: Action[];
  orderCounter: number;
}

interface StreetStepProps {
  street: Street;
  boardCount: number;
  usedCardsElsewhere: Card[];
  seats: Seat[];
  activeSeatIds: string[];
  startOrder: number;
  initialBetAmount?: number;
  initialContributions?: Record<string, number>;
  onBack: () => void;
  onComplete: (boardCards: Card[], actions: Action[], remainingActiveSeatIds: string[]) => void;
  onHandEndsEarly: (boardCards: Card[], actions: Action[], remainingActiveSeatIds: string[]) => void;
  step?: number;
  totalSteps?: number;
}

function seatDisplay(seat: Seat): string {
  const label = seat.playerName ?? seat.position;
  return seat.isHero ? `Hero (${label})` : label;
}

export function StreetStep({
  street,
  boardCount,
  usedCardsElsewhere,
  seats,
  activeSeatIds,
  startOrder,
  initialBetAmount = 0,
  initialContributions = {},
  onBack,
  onComplete,
  onHandEndsEarly,
  step,
  totalSteps,
}: StreetStepProps) {
  const [boardCards, setBoardCards] = useState<(Card | undefined)[]>(Array(boardCount).fill(undefined));

  const order = getActingOrder(seats, street).filter((s) => activeSeatIds.includes(s.id));
  const [queue, setQueue] = useState<string[]>(order.map((s) => s.id));
  const [active, setActive] = useState<string[]>(activeSeatIds);
  const [betAmount, setBetAmount] = useState(initialBetAmount);
  const [contributions, setContributions] = useState<Record<string, number>>(initialContributions);
  const [recorded, setRecorded] = useState<Action[]>([]);
  const [orderCounter, setOrderCounter] = useState(startOrder);
  const [amountInput, setAmountInput] = useState('');
  const [enteringAmount, setEnteringAmount] = useState<'bet' | 'raise' | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const boardComplete = boardCards.every(Boolean);
  const currentSeatId = queue[0];
  const currentSeat = seats.find((s) => s.id === currentSeatId);
  const owed = betAmount - (contributions[currentSeatId] ?? 0);
  const canCheck = owed <= 0;

  const reorderAfter = (ids: string[], afterSeatId: string) =>
    getActingOrderAfter(seats, street, afterSeatId)
      .filter((s) => ids.includes(s.id))
      .map((s) => s.id);

  const finalBoard = () => boardCards.filter(Boolean) as Card[];

  const pushHistory = () => {
    setHistory((h) => [...h, { queue, active, betAmount, contributions, recorded, orderCounter }]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setQueue(last.queue);
    setActive(last.active);
    setBetAmount(last.betAmount);
    setContributions(last.contributions);
    setRecorded(last.recorded);
    setOrderCounter(last.orderCounter);
    setEnteringAmount(null);
    setAmountInput('');
  };

  const pushAction = (type: ActionType, amount: number | undefined) => {
    const action: Action = {
      id: `${street}-${orderCounter}`,
      street,
      seatId: currentSeatId,
      type,
      amount,
      order: orderCounter,
    };
    const nextRecorded = [...recorded, action];
    setRecorded(nextRecorded);
    setOrderCounter((o) => o + 1);
    return nextRecorded;
  };

  const finishIfDone = (nextQueue: string[], nextActive: string[], nextRecorded: Action[]) => {
    if (nextActive.length <= 1) {
      onHandEndsEarly(finalBoard(), nextRecorded, nextActive);
      return true;
    }
    if (nextQueue.length === 0) {
      onComplete(finalBoard(), nextRecorded, nextActive);
      return true;
    }
    return false;
  };

  const handleFold = () => {
    pushHistory();
    const nextRecorded = pushAction('fold', undefined);
    const nextActive = active.filter((id) => id !== currentSeatId);
    const nextQueue = queue.slice(1);
    setActive(nextActive);
    setQueue(nextQueue);
    finishIfDone(nextQueue, nextActive, nextRecorded);
  };

  const handleCheck = () => {
    pushHistory();
    const nextRecorded = pushAction('check', undefined);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  const handleCall = () => {
    pushHistory();
    const nextRecorded = pushAction('call', betAmount);
    setContributions((c) => ({ ...c, [currentSeatId]: betAmount }));
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  const confirmAmount = () => {
    const amount = Number(amountInput);
    if (!amount || amount <= betAmount) return;
    pushHistory();
    const type: ActionType = enteringAmount === 'raise' ? 'raise' : 'bet';
    const nextRecorded = pushAction(type, amount);
    const nextQueue = reorderAfter(active.filter((id) => id !== currentSeatId), currentSeatId);
    setBetAmount(amount);
    setContributions((c) => ({ ...c, [currentSeatId]: amount }));
    setQueue(nextQueue);
    setAmountInput('');
    setEnteringAmount(null);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  return (
    <WizardScreen
      title={STREET_TITLES[street]}
      subtitle={boardCount > 0 ? 'Cartes puis actions' : 'Actions des joueurs'}
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
    >
      {boardCount > 0 && (
        <View style={styles.boardSection}>
          {Array.from({ length: boardCount }).map((_, i) => {
            const otherCards = [...usedCardsElsewhere, ...boardCards.filter((c, idx) => idx !== i && c)] as Card[];
            return (
              <CardPicker
                key={i}
                label={SLOT_LABELS[i] ?? `Carte ${i + 1}`}
                value={boardCards[i]}
                disabledCards={otherCards}
                onChange={(card) => {
                  const next = [...boardCards];
                  next[i] = card;
                  setBoardCards(next);
                }}
              />
            );
          })}
        </View>
      )}

      {boardComplete && currentSeat && (
        <View style={styles.actionSection}>
          <View style={styles.summary}>
            {recorded.map((a) => (
              <Text key={a.id} style={styles.summaryLine}>
                {seatDisplay(seats.find((s) => s.id === a.seatId)!)} · {a.type}
                {a.amount ? ` ${a.amount}` : ''}
              </Text>
            ))}
          </View>

          <View style={styles.actorRow}>
            <Text style={[typography.postTitle, styles.actor]}>{seatDisplay(currentSeat)} agit</Text>
            {history.length > 0 && (
              <Pressable onPress={handleUndo} style={styles.undoButton}>
                <Text style={styles.undoText}>↩ Annuler</Text>
              </Pressable>
            )}
          </View>

          {enteringAmount ? (
            <View>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                autoFocus
                placeholder={betAmount > 0 ? `Plus de ${betAmount}` : 'Montant'}
                value={amountInput}
                onChangeText={setAmountInput}
              />
              <View style={styles.row}>
                <Pressable style={styles.secondaryButton} onPress={() => setEnteringAmount(null)}>
                  <Text style={styles.secondaryText}>Annuler</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={confirmAmount}>
                  <Text style={styles.primaryText}>Valider</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              {canCheck ? (
                <>
                  <Pressable style={styles.actionButton} onPress={handleCheck}>
                    <Text style={styles.actionText}>Check</Text>
                  </Pressable>
                  <Pressable style={styles.actionButtonPrimary} onPress={() => setEnteringAmount(betAmount > 0 ? 'raise' : 'bet')}>
                    <Text style={styles.actionTextPrimary}>{betAmount > 0 ? 'Relancer' : 'Miser'}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={styles.actionButton} onPress={handleFold}>
                    <Text style={styles.actionText}>Fold</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={handleCall}>
                    <Text style={styles.actionText}>Suivre ({betAmount})</Text>
                  </Pressable>
                  <Pressable style={styles.actionButtonPrimary} onPress={() => setEnteringAmount('raise')}>
                    <Text style={styles.actionTextPrimary}>Relancer</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      )}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  boardSection: {
    marginBottom: 8,
  },
  actionSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22,35,61,0.15)',
    paddingTop: 16,
    marginTop: 4,
  },
  summary: {
    marginBottom: 16,
    maxHeight: 100,
  },
  summaryLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actor: {
    color: colors.textPrimary,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(22,35,61,0.08)',
  },
  undoText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionButtonPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: colors.action,
  },
  actionTextPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  amountInput: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: colors.action,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
