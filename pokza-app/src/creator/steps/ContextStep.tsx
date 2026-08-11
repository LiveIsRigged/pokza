import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text, TextInput, TextStyle, View } from 'react-native';
import type { Position } from '../../types/poker';
import { holeCardCount } from '../../types/poker';
import { colors } from '../../theme/theme';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { POSITION_SETS } from '../positions';
import { straddleAwarePositionLabel } from '../../engine/handEngine';
import type { ContextData } from '../types';

// Un TextInput contrôlé qui reflète `String(nombre)` se mord la queue dès qu'on tape une virgule
// ou un point : "0." → parseFloat → 0 → réaffiché "0", le "." tapé disparaît aussitôt, rendant
// tout nombre décimal (ex: blindes 0,25/0,5) impossible à saisir caractère par caractère. On garde
// donc le texte tapé comme état local propre à l'input, et on ne le resynchronise depuis la valeur
// numérique que si elle change de source EXTÉRIEURE (preset cliqué...), jamais en écho de sa propre frappe.
function DecimalTextInput({
  value,
  onChangeValue,
  style,
  placeholder,
}: {
  value: number;
  onChangeValue: (n: number) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    const parsed = parseFloat(text.replace(',', '.'));
    const isOwnEcho = parsed === value || (Number.isNaN(parsed) && value === 0);
    if (!isOwnEcho) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      value={text}
      onChangeText={(t) => {
        setText(t);
        const parsed = parseFloat(t.replace(',', '.'));
        onChangeValue(Number.isNaN(parsed) ? 0 : parsed);
      }}
    />
  );
}

// Variante pour un champ facultatif (le stack d'un siège précis, sinon le stack effectif par
// défaut s'applique) : un champ vidé revient à "pas de valeur" plutôt qu'à 0.
function OptionalDecimalTextInput({
  value,
  onChangeValue,
  style,
  placeholder,
}: {
  value: number | undefined;
  onChangeValue: (n: number | undefined) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');

  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : parseFloat(text.replace(',', '.'));
    const isOwnEcho = parsed === value || (typeof parsed === 'number' && Number.isNaN(parsed) && value == null);
    if (!isOwnEcho) setText(value != null ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      value={text}
      onChangeText={(t) => {
        setText(t);
        if (t.trim() === '') {
          onChangeValue(undefined);
          return;
        }
        const parsed = parseFloat(t.replace(',', '.'));
        onChangeValue(Number.isNaN(parsed) ? undefined : parsed);
      }}
    />
  );
}

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
  /** Cette étape est la première du wizard : "retour" ici annule la création et revient au feed. */
  onBack?: () => void;
  step?: number;
  totalSteps?: number;
}

export function ContextStep({ value, onChange, onNext, onBack, step, totalSteps }: ContextStepProps) {
  const availablePositions = POSITION_SETS[value.numPlayers] ?? POSITION_SETS[6];
  const heroValid = availablePositions.includes(value.heroPosition);

  // Même résultat que `straddleSeatLabel` dans handEngine.ts (straddle + décalage UTG/UTG1/UTG2),
  // calculé ici uniquement à partir du rang dans `availablePositions` puisqu'aucune action
  // n'existe encore à cette étape du formulaire.
  const straddleCount = value.gameType === 'cash' ? value.straddleCount : 0;
  const straddleLabelForPosition = (pos: Position): string =>
    straddleAwarePositionLabel(availablePositions, availablePositions.indexOf(pos), straddleCount);

  // Pour le sélecteur "Ta position" uniquement : le(s) straddleur(s) passent en dernier plutôt
  // qu'en premier — plus logique visuellement, un straddle est perçu comme un "ajout" plutôt que
  // la position de référence. Ordre d'action réel (`availablePositions`) inchangé partout ailleurs.
  const positionChipOrder =
    straddleCount > 0
      ? [...availablePositions.slice(straddleCount), ...availablePositions.slice(0, straddleCount)]
      : availablePositions;

  // Plafond de joueurs imposé par le jeu de 52 cartes : chaque joueur prend `holeCardCount` cartes,
  // le(s) board(s) en prennent 5 (ou 10 en double board), donc joueurs × cartes + board ≤ 52.
  // Plafonné à 10 en dur (au-delà, ce n'est plus une vraie table). Concrètement : NLHE et PLO
  // atteignent 10, le PLO5 reste à 9 (10 × 5 + 5 = 55 > 52), et le PLO5 double board tombe à 8.
  const maxPlayersFor = (ctx: ContextData): number => {
    const boardCards = ctx.bombPot && ctx.doubleBoard ? 10 : 5;
    return Math.min(10, Math.floor((52 - boardCards) / holeCardCount(ctx.variant)));
  };
  const maxPlayers = maxPlayersFor(value);

  const update = (patch: Partial<ContextData>) => {
    const next = { ...value, ...patch };
    // Si le changement (variante, double board...) réduit le plafond sous le nombre courant, on
    // ramène le nombre de joueurs au max — et on répare la position du héros si elle n'existe plus.
    const max = maxPlayersFor(next);
    if (next.numPlayers > max) {
      next.numPlayers = max;
      const positions = POSITION_SETS[max] ?? POSITION_SETS[6];
      if (!positions.includes(next.heroPosition)) next.heroPosition = positions[0];
    }
    onChange(next);
  };

  // « Options avancées » : replie les réglages rarement touchés (ante, straddle, noms/stacks par
  // siège, lieu, buy-in, niveau) pour que l'essentiel tienne d'un coup d'œil. La section s'ouvre
  // d'elle-même si l'un de ces réglages n'est pas au défaut, afin de ne jamais masquer un réglage
  // que l'utilisateur emploie réellement (ex. straddle habituel restauré par la mémorisation).
  const hasAdvancedValues =
    (!value.bombPot && (value.anteType !== 'none' || value.straddleCount > 0)) ||
    Object.values(value.opponentNames ?? {}).some((n) => (n ?? '').trim().length > 0) ||
    Object.values(value.seatStacks ?? {}).some((s) => s != null) ||
    !!value.location?.trim() ||
    !!value.buyIn?.trim() ||
    !!value.level?.trim();
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedValues);
  const hadAdvancedValues = useRef(hasAdvancedValues);
  useEffect(() => {
    // Ouvre à la transition « défaut → non-défaut » (typiquement quand la mémorisation charge des
    // réglages), sans jamais refermer de force : l'utilisateur garde la main sur l'ouverture.
    if (hasAdvancedValues && !hadAdvancedValues.current) setAdvancedOpen(true);
    hadAdvancedValues.current = hasAdvancedValues;
  }, [hasAdvancedValues]);

  // La section « Options avancées » est en bas de l'écran : quand on la déplie, les réglages
  // révélés apparaissent hors du champ de vision et rien ne semble bouger. On amène donc l'en-tête
  // en haut du ScrollView à l'ouverture, pour que le contenu déplié soit tout de suite visible.
  const scrollRef = useRef<ScrollView>(null);
  const advancedHeaderYRef = useRef(0);
  const toggleAdvanced = () => {
    setAdvancedOpen((open) => {
      const next = !open;
      if (next) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: Math.max(0, advancedHeaderYRef.current - 8), animated: true });
        });
      }
      return next;
    });
  };

  return (
    <WizardScreen
      title="La table"
      subtitle="Contexte de la main"
      onNext={onNext}
      nextDisabled={!heroValid || !value.sb || !value.bb || !value.effectiveStack}
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
      scrollRef={scrollRef}
    >
      <View>
        <Text style={styles.label}>Variante</Text>
        <View style={styles.row}>
          <Chip label="NLHE" selected={value.variant === 'nlhe'} onPress={() => update({ variant: 'nlhe' })} />
          <Chip label="PLO" selected={value.variant === 'plo'} onPress={() => update({ variant: 'plo' })} />
          <Chip label="PLO5" selected={value.variant === 'plo5'} onPress={() => update({ variant: 'plo5' })} />
        </View>

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

        {/* Format spécial et rare : un interrupteur discret plutôt qu'un choix de premier plan.
            Éteint (défaut, main classique), il n'y a rien à cocher — juste une ligne sobre. */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Bomb pot</Text>
          <Switch
            value={!!value.bombPot}
            onValueChange={(on) =>
              on
                ? // À l'activation, l'ante de la bombe démarre sur la valeur de la BB (repère
                  // naturel), et le straddle n'a plus de sens (pas de preflop) : on le remet à zéro.
                  update({ bombPot: true, bombAnte: value.bombAnte || value.bb, straddleCount: 0 })
                : update({ bombPot: false })
            }
            trackColor={{ false: 'rgba(22,35,61,0.18)', true: colors.action }}
            thumbColor="#fff"
            ios_backgroundColor="rgba(22,35,61,0.18)"
            // `thumbColor` ne pilote QUE le pouce éteint sur react-native-web ; en position allumée il
            // retombe sur son teal Material par défaut. On repasse donc le pouce en blanc via son prop
            // hérité `activeThumbColor` (ignoré côté natif, où `thumbColor` couvre déjà les deux états).
            {...({ activeThumbColor: '#fff' } as object)}
          />
        </View>

        {value.bombPot ? (
          <>
            <Text style={styles.label}>Ante par joueur</Text>
            <DecimalTextInput
              style={styles.input}
              placeholder="Ante"
              value={value.bombAnte}
              onChangeValue={(bombAnte) => update({ bombAnte })}
            />

            <Text style={styles.label}>Boards</Text>
            <View style={styles.row}>
              <Chip label="1 board" selected={!value.doubleBoard} onPress={() => update({ doubleBoard: false })} />
              <Chip label="2 boards" selected={value.doubleBoard} onPress={() => update({ doubleBoard: true })} />
            </View>
            {value.doubleBoard && (
              <Text style={styles.helperText}>
                Deux boards : chacun remporte la moitié du pot (gagner les deux = scoop).
              </Text>
            )}
          </>
        ) : (
          <>
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
          <DecimalTextInput
            style={styles.input}
            placeholder="SB"
            value={value.sb}
            onChangeValue={(sb) => update({ sb })}
          />
          <DecimalTextInput
            style={styles.input}
            placeholder="BB"
            value={value.bb}
            onChangeValue={(bb) => update({ bb, effectiveStack: defaultStackFor(value.gameType, bb) })}
          />
        </View>
          </>
        )}

        <Text style={styles.label}>Stack effectif</Text>
        <DecimalTextInput
          style={styles.input}
          placeholder="Stack"
          value={value.effectiveStack}
          onChangeValue={(effectiveStack) => update({ effectiveStack })}
        />

        <Text style={styles.label}>Nombre de joueurs</Text>
        <View style={styles.row}>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10]
            .filter((n) => n <= maxPlayers)
            .map((n) => (
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
        {maxPlayers < 10 && (
          // Le jeu de 52 cartes borne la table : ex. PLO5 (5 cartes/joueur) plafonne à 9 en simple
          // board, à 8 en double board. On explique la borne plutôt que de faire disparaître le chip 10
          // sans raison visible.
          <Text style={styles.helperText}>Limité à {maxPlayers} joueurs dans cette variante (jeu de 52 cartes).</Text>
        )}

        <Text style={styles.label}>Ta position</Text>
        <View style={styles.row}>
          {positionChipOrder.map((pos: Position) => (
            <Chip
              key={pos}
              label={straddleLabelForPosition(pos)}
              selected={value.heroPosition === pos}
              onPress={() => update({ heroPosition: pos })}
            />
          ))}
        </View>

        <Pressable
          style={[styles.advancedHeader, advancedOpen && styles.advancedHeaderOpen]}
          onPress={toggleAdvanced}
          onLayout={(e) => {
            advancedHeaderYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.advancedHeaderText}>
            <Text style={styles.advancedTitle}>Options avancées</Text>
            <Text style={styles.advancedSubtitle}>
              {value.bombPot ? 'noms & stacks · lieu' : 'ante · straddle · noms & stacks · lieu'}
            </Text>
          </View>
          <Text style={styles.advancedToggleLabel}>{advancedOpen ? 'Masquer' : 'Afficher'}</Text>
          <View style={[styles.advancedChevronBadge, advancedOpen && styles.advancedChevronBadgeOpen]}>
            <Text style={[styles.advancedChevron, advancedOpen && styles.advancedChevronOpen]}>
              {advancedOpen ? '▾' : '▸'}
            </Text>
          </View>
        </Pressable>

        {advancedOpen && (
          <View>
            {!value.bombPot && (
              <>
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
                  <DecimalTextInput
                    style={styles.input}
                    placeholder="Ante par joueur"
                    value={value.ante}
                    onChangeValue={(ante) => update({ ante })}
                  />
                )}

                {value.gameType === 'cash' && (
                  <>
                    <Text style={styles.label}>Straddle</Text>
                    <View style={styles.row}>
                      <Chip label="Aucun" selected={value.straddleCount === 0} onPress={() => update({ straddleCount: 0 })} />
                      <Chip
                        label="Simple"
                        selected={value.straddleCount === 1}
                        onPress={() => update({ straddleCount: 1, straddleAmount: value.straddleAmount || value.bb * 2 })}
                      />
                      <Chip
                        label="Double"
                        selected={value.straddleCount === 2}
                        onPress={() => update({ straddleCount: 2, straddleAmount: value.straddleAmount || value.bb * 2 })}
                      />
                      <Chip
                        label="Triple"
                        selected={value.straddleCount === 3}
                        onPress={() => update({ straddleCount: 3, straddleAmount: value.straddleAmount || value.bb * 2 })}
                      />
                    </View>
                    {value.straddleCount > 0 && (
                      <>
                        <DecimalTextInput
                          style={styles.input}
                          placeholder="Montant du 1er straddle"
                          value={value.straddleAmount}
                          onChangeValue={(straddleAmount) => update({ straddleAmount })}
                        />
                        <Text style={styles.helperText}>
                          {value.straddleCount === 1 && `Straddle : ${formatBlind(value.straddleAmount)}`}
                          {value.straddleCount === 2 &&
                            `Straddle ${formatBlind(value.straddleAmount)}, double straddle ${formatBlind(value.straddleAmount * 2)}`}
                          {value.straddleCount === 3 &&
                            `Straddle ${formatBlind(value.straddleAmount)}, double ${formatBlind(value.straddleAmount * 2)}, triple ${formatBlind(value.straddleAmount * 4)}`}
                        </Text>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            <Text style={styles.label}>Joueurs (nom et stack, optionnel)</Text>
            {availablePositions.map((pos) => {
              const isHero = pos === value.heroPosition;
              const label = straddleLabelForPosition(pos);
              return (
                <View key={pos} style={styles.playerRow}>
                  <Text style={styles.playerRowLabel}>{isHero ? `${label} (toi)` : label}</Text>
                  {!isHero && (
                    <TextInput
                      style={[styles.input, styles.playerNameInput]}
                      placeholder="Nom"
                      value={value.opponentNames?.[pos] ?? ''}
                      onChangeText={(t) => update({ opponentNames: { ...value.opponentNames, [pos]: t } })}
                    />
                  )}
                  <OptionalDecimalTextInput
                    style={[styles.input, styles.playerStackInput]}
                    placeholder={String(value.effectiveStack)}
                    value={value.seatStacks?.[pos]}
                    onChangeValue={(stack) => update({ seatStacks: { ...value.seatStacks, [pos]: stack } })}
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(22,35,61,0.18)',
    backgroundColor: 'rgba(22,35,61,0.04)',
  },
  advancedHeaderOpen: {
    borderColor: colors.action,
    backgroundColor: 'rgba(232,87,31,0.08)',
  },
  advancedHeaderText: {
    flex: 1,
  },
  advancedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  advancedSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  advancedToggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.action,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  advancedChevronBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,35,61,0.10)',
  },
  advancedChevronBadgeOpen: {
    backgroundColor: colors.action,
  },
  advancedChevron: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  advancedChevronOpen: {
    color: '#fff',
  },
});
