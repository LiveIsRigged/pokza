import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, Switch, Text, TextInput, TextStyle, View } from 'react-native';
import type { Position } from '../../types/poker';
import { holeCardCount } from '../../types/poker';
import { colors } from '../../theme/theme';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { POSITION_SETS } from '../positions';
import { straddleAwarePositionLabel } from '../../engine/handEngine';
import type { ContextData } from '../types';
import {
  BUY_IN_MAX_LENGTH,
  LEVEL_DIGITS_MAX,
  LOCATION_MAX_LENGTH,
  OPPONENT_NAME_MAX_LENGTH,
} from '../../constants/limits';

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

// Le joueur ne tape que le numéro (ex: "12") ; le préfixe "Niveau" est fixe et non éditable, et la
// valeur stockée reste "Niveau 12" (même format qu'avant, affiché tel quel dans le contexte du post).
function LevelNumberInput({
  value,
  onChangeValue,
}: {
  value: string | undefined;
  onChangeValue: (level: string | undefined) => void;
}) {
  const extractDigits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');
  const [digits, setDigits] = useState(extractDigits(value));

  useEffect(() => {
    const parsed = extractDigits(value);
    if (parsed !== digits) setDigits(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={styles.levelInputRow}>
      <Text style={styles.levelInputPrefix}>Niveau</Text>
      <TextInput
        style={[styles.input, styles.levelInputField]}
        keyboardType="number-pad"
        placeholder="12"
        maxLength={LEVEL_DIGITS_MAX}
        value={digits}
        onChangeText={(t) => {
          const d = t.replace(/\D/g, '').slice(0, LEVEL_DIGITS_MAX);
          setDigits(d);
          onChangeValue(d ? `Niveau ${d}` : undefined);
        }}
      />
    </View>
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

  return (
    <WizardScreen
      title="La table"
      subtitle="Contexte de la main"
      onNext={onNext}
      nextDisabled={!heroValid || !value.sb || !value.bb || !value.effectiveStack}
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        <Text style={styles.label}>Type de partie</Text>
        {/* Le bomb pot tient sur la même ligne que Cash game / Tournoi : c'est une variation du type
            de partie, pas un réglage de plus. Format spécial et rare, il reste un interrupteur
            discret à droite plutôt qu'un choix de premier plan, et n'existe qu'en cash game (une
            bombe n'a pas de sens en structure de tournoi). Les chips gardent leur `flexWrap` et
            peuvent passer à la ligne si la largeur manque, sans pousser l'interrupteur dehors. */}
        <View style={styles.gameTypeRow}>
          <View style={[styles.row, styles.gameTypeChips]}>
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
                  // Le bomb pot n'existe qu'en cash game — on l'éteint pour ne pas laisser un état
                  // caché actif si l'utilisateur l'avait coché avant de basculer sur Tournoi.
                  bombPot: false,
                })
              }
            />
          </View>
          {value.gameType === 'cash' && (
            <View style={styles.bombPotToggle}>
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
          )}
        </View>

        <Text style={styles.label}>Variante</Text>
        <View style={styles.row}>
          <Chip label="NLHE" selected={value.variant === 'nlhe'} onPress={() => update({ variant: 'nlhe' })} />
          <Chip label="PLO" selected={value.variant === 'plo'} onPress={() => update({ variant: 'plo' })} />
          <Chip label="PLO5" selected={value.variant === 'plo5'} onPress={() => update({ variant: 'plo5' })} />
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

        {/* Une bombe se joue sans preflop : ni ante classique (elle a le sien), ni straddle. */}
        {!value.bombPot && (
          <>
            {/* Le straddle prolonge les blindes (c'est une 3e blinde volontaire) : il vient donc
                juste après elles, avant l'ante. N'existe qu'en cash game. */}
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

            {value.gameType === 'tournament' && (
              <View style={styles.inlineFieldRow}>
                <Text style={styles.inlineFieldLabel}>Niveau de blindes (optionnel)</Text>
                <LevelNumberInput value={value.level} onChangeValue={(level) => update({ level })} />
              </View>
            )}
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
                  maxLength={OPPONENT_NAME_MAX_LENGTH}
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
          maxLength={LOCATION_MAX_LENGTH}
          value={value.location ?? ''}
          onChangeText={(t) => update({ location: t })}
        />

        {value.gameType === 'tournament' && (
          <>
            <Text style={styles.label}>Buy-in (optionnel)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : 100€"
              maxLength={BUY_IN_MAX_LENGTH}
              value={value.buyIn ?? ''}
              onChangeText={(t) => update({ buyIn: t })}
            />
          </>
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
    fontSize: 16,
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
  inlineFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 6,
  },
  inlineFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  levelInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelInputPrefix: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  levelInputField: {
    width: 56,
    marginBottom: 0,
    paddingVertical: 8,
    textAlign: 'center',
  },
  gameTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Les chips prennent la place restante et peuvent passer à la ligne ; l'interrupteur garde la
  // sienne à droite (`flexShrink: 0`) pour ne jamais être compressé sur un écran étroit.
  gameTypeChips: {
    flex: 1,
  },
  bombPotToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    // Même marge basse que les chips (`Chip.marginBottom: 8`) : les deux boîtes se centrent alors
    // sur la même bande, l'interrupteur reste aligné avec les chips et non 4 px plus bas.
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
