import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Action, ActionType, Card, GameType, Seat, Street } from '../../types/poker';
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

const POT_SHORTCUTS: { label: string; fraction: number }[] = [
  { label: '1/3 pot', fraction: 1 / 3 },
  { label: '1/2 pot', fraction: 1 / 2 },
  { label: '2/3 pot', fraction: 2 / 3 },
  { label: 'Pot', fraction: 1 },
];

// Préflop : le %pot n'est pas le repère habituel, on raisonne en multiples de BB.
const CASH_PREFLOP_BB_MULTIPLES = [3, 4, 5, 10];
const TOURNAMENT_PREFLOP_BB_MULTIPLES = [2, 3.5, 6, 10];

function formatBbMultiple(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}BB`;
}

// En tournoi, les montants dépassent vite 4-5 chiffres : au-delà de 1000 jetons, on affiche en
// "k" (2 décimales, virgule) pour ne pas surcharger l'écran. Le cash game garde la valeur brute.
function formatChipAmount(n: number, gameType: GameType): string {
  if (gameType !== 'tournament' || n < 1000) return String(n);
  return `${(n / 1000).toFixed(2).replace('.', ',')}k`;
}

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
  /** Ante déjà posté par chaque siège sur CETTE street (dead money, indépendant du niveau de mise à suivre) */
  anteCommitted?: Record<string, number>;
  /** Si un siège a posté un straddle (ou autre mise forcée), l'action reprend juste après lui plutôt qu'à l'ordre naturel */
  firstToActAfterSeatId?: string;
  /** BB de la main, utilisée pour les raccourcis de taille en multiples de BB au préflop */
  bb?: number;
  gameType?: GameType;
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
  anteCommitted = {},
  firstToActAfterSeatId,
  bb = 0,
  gameType = 'cash',
  onBack,
  onComplete,
  onHandEndsEarly,
  step,
  totalSteps,
}: StreetStepProps) {
  const [boardCards, setBoardCards] = useState<(Card | undefined)[]>(Array(boardCount).fill(undefined));

  // Chips qu'un siège peut engager sur CETTE street (son stack restant en début de street).
  // L'ante posté sur cette street est de l'argent mort indépendant du niveau de mise à suivre :
  // il réduit bien le stack jouable, mais ne doit pas être compté dans `contributions` (qui sert
  // au calcul du montant dû, lui-même basé uniquement sur les blindes/mises/relances).
  const availableAtStart = (id: string) => {
    const seat = seats.find((s) => s.id === id);
    return (seat?.startingStack ?? 0) - (priorCommitted[id] ?? 0) - (anteCommitted[id] ?? 0);
  };

  // Seuls les sièges encore en jeu ET qui ont des jetons agissent (les joueurs déjà à tapis passent).
  // Si un straddle (ou autre mise forcée) a été posté, l'action reprend juste après ce siège au lieu
  // de l'ordre naturel (le siège qui a straddlé agit en dernier, comme le ferait la BB normalement).
  const baseOrder = firstToActAfterSeatId
    ? getActingOrderAfter(seats, street, firstToActAfterSeatId)
    : getActingOrder(seats, street);
  const order = baseOrder.filter((s) => activeSeatIds.includes(s.id) && availableAtStart(s.id) > 0);
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
  const fmt = (n: number) => formatChipAmount(n, gameType);

  // Pot total en direct : ce qui a été misé sur les streets précédentes (déjà réglé) + l'ante de
  // cette street si elle vient d'être postée (préflop uniquement, cf. anteCommitted) + ce qui a été
  // misé sur la street courante jusqu'ici. Sert de repère pour la taille de mise (ex: "environ 1/3 pot").
  const sumValues = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const potNow = sumValues(priorCommitted) + sumValues(anteCommitted) + sumValues(contributions);

  // Raccourcis de taille : en multiples de BB au préflop (le %pot n'est pas le repère habituel
  // avant le flop), en %pot sur les streets suivantes.
  const sizeShortcuts: { label: string; amount: number }[] =
    street === 'preflop'
      ? (gameType === 'tournament' ? TOURNAMENT_PREFLOP_BB_MULTIPLES : CASH_PREFLOP_BB_MULTIPLES).map((m) => ({
          label: formatBbMultiple(m),
          amount: Math.round(bb * m),
        }))
      : POT_SHORTCUTS.map(({ label, fraction }) => ({ label, amount: Math.round(potNow * fraction) }));

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
          {/* Rappel du pot : repère pour estimer une taille de mise (ex: "environ 1/3 pot") */}
          <View style={styles.potRow}>
            <Text style={styles.potLabel}>Pot</Text>
            <Text style={styles.potValue}>{fmt(potNow)}</Text>
          </View>

          <View style={styles.summary}>
            {recorded.map((a) => (
              <Text key={a.id} style={styles.summaryLine}>
                {seatDisplay(seats.find((s) => s.id === a.seatId)!)} · {a.type}
                {a.amount ? ` ${fmt(a.amount)}` : ''}
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
                  <Text style={styles.stackChipValue}>{fmt(Math.max(remainingFor(s.id), 0))}</Text>
                </View>
              ))}
          </View>

          {currentSeat ? (
            <>
              <View style={styles.actorRow}>
                <Text style={[typography.postTitle, styles.actor]}>
                  {seatDisplay(currentSeat)} agit · reste {fmt(Math.max(remainingFor(currentSeatId), 0))}
                </Text>
                {history.length > 0 && (
                  <Pressable onPress={handleUndo} style={styles.undoButton}>
                    <Text style={styles.undoText}>↩ Annuler</Text>
                  </Pressable>
                )}
              </View>

              {enteringAmount ? (
                <View>
                  {/* Raccourcis de taille (BB au préflop, %pot ensuite), pour miser/relancer sans calcul de tête */}
                  <View style={styles.potShortcutsRow}>
                    {sizeShortcuts.map(({ label, amount: rawAmount }) => {
                      const amount = Math.max(1, Math.min(rawAmount, currentRemaining));
                      return (
                        <Pressable
                          key={label}
                          style={styles.potShortcutChip}
                          onPress={() => setAmountInput(String(amount))}
                        >
                          <Text style={styles.potShortcutLabel}>{label}</Text>
                          <Text style={styles.potShortcutValue}>{fmt(amount)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    style={styles.amountInput}
                    keyboardType="numeric"
                    autoFocus
                    placeholder={`Montant (max ${fmt(currentRemaining)})`}
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
                          Suivre ({fmt(callTo)}){isCallAllIn ? ' · tapis' : ''}
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
                    <Text style={styles.allInText}>Tapis ({fmt(currentRemaining)})</Text>
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
  potRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  potLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  potValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  potShortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  potShortcutChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.5)',
    backgroundColor: '#FBF3DC',
    alignItems: 'center',
  },
  potShortcutLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  potShortcutValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.tableFelt,
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
