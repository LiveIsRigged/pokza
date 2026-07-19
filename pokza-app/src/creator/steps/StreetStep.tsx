import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Action, ActionType, Card, Seat, Street } from '../../types/poker';
import { colors, typography } from '../../theme/theme';
import { getActingOrder, getActingOrderAfter } from '../positions';
import { WizardScreen } from '../WizardScreen';
import { MultiCardPicker } from '../MultiCardPicker';

const STREET_TITLES: Record<Street, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

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
  /** Total déjà misé par chaque siège lors des streets précédentes */
  priorCommitted?: Record<string, number>;
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
  priorCommitted = {},
  onBack,
  onComplete,
  onHandEndsEarly,
  step,
  totalSteps,
}: StreetStepProps) {
  const [boardCards, setBoardCards] = useState<(Card | undefined)[]>(Array(boardCount).fill(undefined));

  // Chips qu'un siège peut engager sur CETTE street (son stack restant en début de street).
  const availableAtStart = (id: string) => {
    const seat = seats.find((s) => s.id === id);
    return (seat?.startingStack ?? 0) - (priorCommitted[id] ?? 0);
  };

  // Seuls les sièges encore en jeu ET qui ont des jetons agissent (les joueurs déjà à tapis passent).
  const order = getActingOrder(seats, street).filter(
    (s) => activeSeatIds.includes(s.id) && availableAtStart(s.id) > 0
  );
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

  // Stack restant d'un siège en tenant compte de ce qu'il a déjà mis sur cette street.
  const remainingFor = (id: string) => availableAtStart(id) - (contributions[id] ?? 0);
  const currentRemaining = currentSeatId ? availableAtStart(currentSeatId) : 0;
  const callTo = Math.min(betAmount, currentRemaining); // suivre est plafonné au tapis
  const isCallAllIn = callTo >= currentRemaining && callTo < betAmount;

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
    // Suivre est plafonné au stack : si le joueur ne peut pas couvrir, il suit à tapis.
    const nextRecorded = pushAction('call', callTo);
    setContributions((c) => ({ ...c, [currentSeatId]: callTo }));
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  // Mise/relance à un montant cumulé sur la street (déjà plafonné au stack en amont).
  const commitBetTo = (amount: number, type: ActionType) => {
    pushHistory();
    const nextRecorded = pushAction(type, amount);
    const nextQueue = reorderAfter(active.filter((id) => id !== currentSeatId), currentSeatId);
    setBetAmount(amount);
    setContributions((c) => ({ ...c, [currentSeatId]: amount }));
    setQueue(nextQueue);
    setAmountInput('');
    setEnteringAmount(null);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  const confirmAmount = () => {
    let amount = Number(amountInput);
    if (!amount) return;
    // On ne peut jamais miser plus que son stack.
    amount = Math.min(amount, currentRemaining);
    if (amount <= betAmount && amount < currentRemaining) return; // relance insuffisante (sauf tapis)
    commitBetTo(amount, enteringAmount === 'raise' ? 'raise' : 'bet');
  };

  const handleAllIn = () => {
    if (currentRemaining <= 0) return;
    if (currentRemaining <= betAmount) {
      // Pas de quoi relancer : tapis = suivre à tapis (les autres restent redevables du betAmount).
      pushHistory();
      const nextRecorded = pushAction('call', currentRemaining);
      setContributions((c) => ({ ...c, [currentSeatId]: currentRemaining }));
      const nextQueue = queue.slice(1);
      setQueue(nextQueue);
      finishIfDone(nextQueue, active, nextRecorded);
    } else {
      commitBetTo(currentRemaining, betAmount > 0 ? 'raise' : 'bet');
    }
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
          <MultiCardPicker
            count={boardCount}
            selected={boardCards}
            disabledCards={usedCardsElsewhere}
            onChange={(next) => {
              const filled = [...next];
              while (filled.length < boardCount) filled.push(undefined);
              setBoardCards(filled);
            }}
          />
        </View>
      )}

      {boardComplete && (
        <View style={styles.actionSection}>
          <View style={styles.summary}>
            {recorded.map((a) => (
              <Text key={a.id} style={styles.summaryLine}>
                {seatDisplay(seats.find((s) => s.id === a.seatId)!)} · {a.type}
                {a.amount ? ` ${a.amount}` : ''}
              </Text>
            ))}
          </View>

          {/* Rappel des stacks restants pour chaque joueur encore en jeu */}
          <View style={styles.stacksRow}>
            {getActingOrder(seats, street)
              .filter((s) => active.includes(s.id))
              .map((s) => (
                <View key={s.id} style={styles.stackChip}>
                  <Text style={styles.stackChipName}>{seatDisplay(s)}</Text>
                  <Text style={styles.stackChipValue}>{Math.max(remainingFor(s.id), 0)}</Text>
                </View>
              ))}
          </View>

          {currentSeat ? (
            <>
              <View style={styles.actorRow}>
                <Text style={[typography.postTitle, styles.actor]}>
                  {seatDisplay(currentSeat)} agit · reste {Math.max(remainingFor(currentSeatId), 0)}
                </Text>
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
                    placeholder={`Montant (max ${currentRemaining})`}
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
                    <Pressable style={styles.actionButton} onPress={handleCheck}>
                      <Text style={styles.actionText}>Check</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable style={styles.actionButton} onPress={handleFold}>
                        <Text style={styles.actionText}>Fold</Text>
                      </Pressable>
                      <Pressable style={styles.actionButton} onPress={handleCall}>
                        <Text style={styles.actionText}>
                          Suivre ({callTo}){isCallAllIn ? ' · tapis' : ''}
                        </Text>
                      </Pressable>
                    </>
                  )}
                  {currentRemaining > betAmount && (
                    <Pressable style={styles.actionButtonPrimary} onPress={() => setEnteringAmount(betAmount > 0 ? 'raise' : 'bet')}>
                      <Text style={styles.actionTextPrimary}>{betAmount > 0 ? 'Relancer' : 'Miser'}</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.allInButton} onPress={handleAllIn}>
                    <Text style={styles.allInText}>Tapis ({currentRemaining})</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            // Plus personne ne peut agir (tous les joueurs restants sont à tapis) : on passe la street.
            <View>
              <Text style={styles.allInNote}>Les joueurs restants sont à tapis.</Text>
              <Pressable style={styles.primaryButton} onPress={() => onComplete(finalBoard(), [], active)}>
                <Text style={styles.primaryText}>Continuer</Text>
              </Pressable>
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
    marginBottom: 12,
    maxHeight: 100,
  },
  summaryLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  stacksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  stackChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(22,35,61,0.06)',
  },
  stackChipName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  stackChipValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.tableFelt,
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
  allInButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: '#FBF3DC',
  },
  allInText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  allInNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
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
