import React, { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, Switch, Text, TextInput, TextStyle, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { CurrencyPicker } from '../../components/ui/CurrencyPicker';
import { devise } from '../../utils/currency';
import type { Position } from '../../types/poker';
import { holeCardCount } from '../../types/poker';
import { borders, colors, tints } from '../../theme/theme';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { POSITION_SETS } from '../positions';
import { straddleAwarePositionLabel } from '../../engine/handEngine';
import {
  boutonPossible,
  cascadeChaine,
  longueurChaine,
  recalerStraddle,
  straddleBoutonActif,
} from '../straddle';
import { TOURNAMENT_DEFAULTS, type ContextData } from '../types';
import {
  BUY_IN_MAX_LENGTH,
  LEVEL_DIGITS_MAX,
  LOCATION_MAX_LENGTH,
  OPPONENT_NAME_MAX_LENGTH,
} from '../../constants/limits';
import { abbreviateChips, formatChipInput, parseChipAmount } from '../../utils/chipFormat';

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
  gameType,
  onFocusChange,
}: {
  value: number;
  onChangeValue: (n: number) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  /** Sert au format abrégé rendu à la sortie du champ ; absent = pas d'abréviation. */
  gameType?: ContextData['gameType'];
  /** Suit l'entrée et la sortie du champ, pour qui veut attendre la fin d'une saisie. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    const parsed = parseChipAmount(text);
    const isOwnEcho = parsed === value || (parsed === undefined && value === 0);
    if (!isOwnEcho) setText(gameType ? formatChipInput(value, gameType) : String(value));
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
        const parsed = parseChipAmount(t);
        onChangeValue(parsed ?? 0);
      }}
      // La réécriture abrégée attend la sortie du champ : la faire à chaque frappe ferait muter
      // "3000" en "3k" au milieu de la saisie de "30000", et la frappe suivante donnerait "3k0".
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => {
        onFocusChange?.(false);
        if (!gameType) return;
        const parsed = parseChipAmount(text);
        if (parsed !== undefined) setText(formatChipInput(parsed, gameType));
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
  gameType,
  editable,
}: {
  value: number | undefined;
  onChangeValue: (n: number | undefined) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  /** Sert au format abrégé rendu à la sortie du champ ; absent = pas d'abréviation. */
  gameType?: ContextData['gameType'];
  editable?: boolean;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');

  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : parseChipAmount(text);
    const isOwnEcho = parsed === value;
    if (!isOwnEcho) setText(value != null ? (gameType ? formatChipInput(value, gameType) : String(value)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      editable={editable}
      value={text}
      onChangeText={(t) => {
        setText(t);
        if (t.trim() === '') {
          onChangeValue(undefined);
          return;
        }
        onChangeValue(parseChipAmount(t));
      }}
      // Même raison que dans `DecimalTextInput` : abréger pendant la frappe casserait la saisie.
      onBlur={() => {
        if (!gameType || text.trim() === '') return;
        const parsed = parseChipAmount(text);
        if (parsed !== undefined) setText(formatChipInput(parsed, gameType));
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

// TROIS raccourcis en tournoi, pas quatre comme en cash : les libellés abrégés (« 50k/100k »)
// sont bien plus larges que « 5/10 », et à quatre la rangée faisait 350,8 px — elle passait donc à
// la ligne sur tout écran de moins de 390 pt (iPhone SE 2/3, 8, 13 mini), et ne tenait sur un
// iPhone 13/14 qu'à 3 px près. À trois, elle fait 253,1 px : une seule ligne partout, jusqu'au
// 320 pt. C'est « 50k/100k » qui a été retiré (décision de Victor, 23/08) — le plus large et le
// moins souvent utile ; ces blindes-là se saisissent à la main dans les deux champs juste en
// dessous, comme n'importe quelle valeur hors raccourci.
const TOURNAMENT_BLIND_PRESETS: [number, number][] = [
  [100, 200],
  [500, 1000],
  [5000, 10000],
];

// Un stack de départ se raisonne en "nombre de BB" plutôt qu'en valeur absolue : le stack effectif
// par défaut suit donc la BB (100BB en cash game, 50BB en tournoi — convention plus courte).
function defaultStackFor(gameType: ContextData['gameType'], bb: number): number {
  return bb * (gameType === 'tournament' ? 50 : 100);
}

// Les libellés de blindes et de straddle reprennent le format abrégé commun (`abbreviateChips`)
// plutôt qu'une variante locale : l'ancienne version arrondissait à 1 décimale et ignorait le
// palier "M", ce qui donnait "5000k" là où le reste de l'app affiche "5M".
const formatBlind = abbreviateChips;

interface ContextStepProps {
  value: ContextData;
  onChange: (value: ContextData) => void;
  onNext: () => void;
  /** Cette étape est la première du wizard : "retour" ici annule la création et revient au feed. */
  onBack?: () => void;
  step?: number;
  totalSteps?: number;
  /** Correction en cours : « Valider » publie directement, « Continuer » fait ressaisir la suite. */
  nextLabel?: string;
  /** La phrase collée au bouton, qui annonce ce que le changement en cours va coûter. */
  footerNote?: string | null;
  /** Empêche de valider une correction qui ne change rien — elle coûterait ses réactions pour rien. */
  nextBloque?: boolean;
}

export function ContextStep({
  value,
  onChange,
  onNext,
  onBack,
  step,
  totalSteps,
  nextLabel,
  footerNote,
  nextBloque,
}: ContextStepProps) {
  const availablePositions = POSITION_SETS[value.numPlayers] ?? POSITION_SETS[6];
  const heroValid = availablePositions.includes(value.heroPosition);
  // La grosse blinde ne peut pas être plus PETITE que la petite : SB 100 / BB 5 n'a aucun sens.
  // Égales, en revanche, c'est légitime et courant (blindes 5-5) — on interdit donc strictement
  // l'inférieur, jamais l'égalité. Rien à valider en bomb pot : il se joue sans blindes.
  const blindsInvalid = !value.bombPot && value.sb > 0 && value.bb > 0 && value.bb < value.sb;
  // ...mais on ne le DIT qu'une fois le champ quitté. Un nombre se tape chiffre par chiffre : pour
  // écrire 60 derrière une SB à 25, on passe forcément par 6, et accuser à cet instant-là reviendrait
  // à reprocher une erreur que personne n'a encore commise. Le bouton Continuer, lui, reste bloqué
  // dès la frappe : la valeur est fausse tant qu'elle l'est, qu'on le dise ou non.
  const [bbFocused, setBbFocused] = useState(false);
  const [deviseOuverte, setDeviseOuverte] = useState(false);
  const showBlindsError = blindsInvalid && !bbFocused;

  // La CHAÎNE de straddles consécutifs, qui est plus courte d'un cran quand le bouton straddle :
  // c'est lui qui prend alors la place du dernier maillon (cf. `straddle.ts`).
  const chaineStraddle = longueurChaine(value);
  const boutonStraddle = straddleBoutonActif(value);

  // Même résultat que `straddleSeatLabel` dans handEngine.ts (straddle + décalage UTG/UTG1/UTG2),
  // calculé ici uniquement à partir du rang dans `availablePositions` puisqu'aucune action
  // n'existe encore à cette étape du formulaire.
  const straddleLabelForPosition = (pos: Position): string =>
    boutonStraddle && pos === 'BTN'
      ? 'BTN straddle'
      : straddleAwarePositionLabel(availablePositions, availablePositions.indexOf(pos), chaineStraddle);

  // Pour le sélecteur "Ta position" uniquement : le(s) straddleur(s) de la chaîne passent en
  // dernier plutôt qu'en premier — plus logique visuellement, un straddle est perçu comme un
  // "ajout" plutôt que la position de référence. Le bouton, lui, ne bouge pas : il est déjà à sa
  // place. Ordre d'action réel (`availablePositions`) inchangé partout ailleurs.
  const positionChipOrder =
    chaineStraddle > 0
      ? [...availablePositions.slice(chaineStraddle), ...availablePositions.slice(0, chaineStraddle)]
      : availablePositions;

  // ICI, ET NULLE PART AILLEURS, un straddle se nomme par le siège qui le poste — « UTG Straddle »,
  // « CO Straddle ». Partout ailleurs (le sélecteur « Ta position », la table, le replayer) ce même
  // siège s'appelle « Straddle » ou « Double straddle » : c'est le renommage voulu, qui dit le rôle
  // plutôt que la place. Le formulaire est l'endroit où l'on PLACE les joueurs, pas où l'on raconte
  // la main — et une ligne qui ne dit pas quel siège elle règle ne se comprend pas (retour de
  // Victor, 29/08). L'exception s'arrête au bloc straddle.
  const nomDuStraddle = (i: number): string => `${availablePositions[i]} Straddle`;



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
    // Le straddle a ses propres règles de cohérence — le bouton qui n'a plus sa place, la longueur
    // de la chaîne, le montant du bouton qui suit ce qui le précède. Elles vivent toutes dans
    // `recalerStraddle`, pour qu'un seul endroit en réponde et qu'elles soient vérifiables.
    Object.assign(next, recalerStraddle(value, next));
    onChange(next);
  };

  return (
    <WizardScreen
      title="La table"
      subtitle="Contexte de la main"
      onNext={onNext}
      nextLabel={nextLabel}
      nextDisabled={
        !heroValid ||
        !value.sb ||
        !value.bb ||
        !value.effectiveStack ||
        blindsInvalid ||
        Boolean(nextBloque)
      }
      footerNote={footerNote}
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
                  ...TOURNAMENT_DEFAULTS,
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
                trackColor={{ false: tints.switchTrack, true: colors.action }}
                thumbColor="#fff"
                ios_backgroundColor={tints.switchTrack}
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
              gameType={value.gameType}
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
          {/* Saisir la SB pose la BB au double : c'est le cas de très loin le plus courant, ça
              évite de taper deux nombres, et surtout ça évite de voir « la BB est plus petite »
              pendant tout le temps où la SB est saisie et la BB pas encore corrigée. Une valeur
              proposée, pas imposée : la BB reste modifiable juste à côté (et les presets 1/3 ou
              2/5, qui ne sont pas des doubles, passent par un autre chemin). Le doublement est
              exact même en décimal — multiplier par 2 ne perd rien en binaire, 0,25 donne 0,5.
              SB vidée (0) : on ne touche pas à la BB, sinon le champ voisin tomberait à zéro. */}
          <DecimalTextInput
            style={styles.input}
            placeholder="SB"
            value={value.sb}
            gameType={value.gameType}
            onChangeValue={(sb) =>
              update(
                sb > 0
                  ? { sb, bb: sb * 2, effectiveStack: defaultStackFor(value.gameType, sb * 2) }
                  : { sb },
              )
            }
          />
          <DecimalTextInput
            style={[styles.input, showBlindsError && styles.inputError]}
            placeholder="BB"
            value={value.bb}
            gameType={value.gameType}
            onFocusChange={setBbFocused}
            onChangeValue={(bb) => update({ bb, effectiveStack: defaultStackFor(value.gameType, bb) })}
          />
        </View>
        {/* On signale plutôt que de corriger tout seul : remonter la BB à la valeur de la SB
            changerait un nombre que le joueur n'a pas touché, et il ne saurait pas lequel des deux
            est faux. Le bouton Suivant reste bloqué tant que ce n'est pas réglé. */}
        {showBlindsError && (
          <Text style={styles.errorText}>La BB ne peut pas être plus petite que la SB.</Text>
        )}
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
                  <Chip label="Simple" selected={value.straddleCount === 1} onPress={() => update({ straddleCount: 1 })} />
                  <Chip label="Double" selected={value.straddleCount === 2} onPress={() => update({ straddleCount: 2 })} />
                  <Chip label="Triple" selected={value.straddleCount === 3} onPress={() => update({ straddleCount: 3 })} />
                </View>
                {value.straddleCount > 0 && (
                  <>
                    {/* UNE LIGNE PAR STRADDLE, chacune nommée par le siège qui le poste et portant
                        son propre montant. Ce que la ligne du bouton fait déjà, les autres le font
                        maintenant aussi : c'est l'asymétrie entre les deux qui rendait le bloc
                        illisible dès qu'on passait à « Double ». */}
                    {Array.from({ length: chaineStraddle }, (_, i) => (
                      <View key={availablePositions[i]} style={styles.straddleRow}>
                        <Text style={styles.straddleRowLabel}>{nomDuStraddle(i)}</Text>
                        <DecimalTextInput
                          style={[styles.input, styles.straddleAmountField]}
                          placeholder={formatBlind(value.bb * 2)}
                          value={value.straddleAmounts[i] ?? 0}
                          gameType={value.gameType}
                          onChangeValue={(montant) =>
                            update({ straddleAmounts: cascadeChaine(value.straddleAmounts, i, montant) })
                          }
                        />
                      </View>
                    ))}
                    {/* Le BTN straddle occupe la DERNIÈRE ligne, celle-là même qu'il prend à la
                        chaîne : allumer l'interrupteur fait disparaître le dernier maillon et
                        apparaître son montant à la place. La règle se regarde au lieu de
                        s'expliquer. L'interrupteur reste à droite, discret. */}
                    {boutonPossible(value.numPlayers, value.straddleCount) && (
                      <View style={styles.straddleRow}>
                        <Text style={styles.straddleRowLabel}>BTN Straddle</Text>
                        {boutonStraddle && (
                          <DecimalTextInput
                            style={[styles.input, styles.straddleAmountField]}
                            placeholder={formatBlind(value.bb * 2)}
                            value={value.straddleBoutonMontant}
                            gameType={value.gameType}
                            onChangeValue={(straddleBoutonMontant) => update({ straddleBoutonMontant })}
                          />
                        )}
                        <Switch
                          style={styles.straddleRowSwitch}
                          value={boutonStraddle}
                          onValueChange={(on) =>
                            update(
                              on
                                ? { straddleBouton: true }
                                : { straddleBouton: false }
                            )
                          }
                          trackColor={{ false: tints.switchTrack, true: colors.action }}
                          thumbColor="#fff"
                          ios_backgroundColor={tints.switchTrack}
                          {...({ activeThumbColor: '#fff' } as object)}
                        />
                      </View>
                    )}
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
                gameType={value.gameType}
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
          gameType={value.gameType}
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
              {/* Le héros a droit à son nom comme les autres, mais son champ est le seul à annoncer
                  sa valeur par défaut : laissé vide, il s'affiche « Hero » partout dans la main.
                  Son nom est rangé à part (`heroName`) et non dans `opponentNames`, indexé par
                  position : sinon changer de siège laisserait son nom sur celui qu'il quitte. */}
              <TextInput
                style={[styles.input, styles.playerNameInput]}
                placeholder={isHero ? 'Hero' : 'Nom'}
                maxLength={OPPONENT_NAME_MAX_LENGTH}
                value={(isHero ? value.heroName : value.opponentNames?.[pos]) ?? ''}
                onChangeText={(t) =>
                  update(isHero ? { heroName: t } : { opponentNames: { ...value.opponentNames, [pos]: t } })
                }
              />
              {/* Le tapis d'un siège parti à tapis reste MODIFIABLE, et descendre sous l'engagé
                  aussi : on n'interdit rien, on annonce le prix (les mises seront à ressaisir) et
                  l'auteur tranche. Bloquer la saisie revenait à lui refuser une correction
                  légitime au nom d'un déroulé qu'il s'apprêtait justement à refaire. */}
              <OptionalDecimalTextInput
                style={[styles.input, styles.playerStackInput]}
                placeholder={formatChipInput(value.effectiveStack, value.gameType)}
                value={value.seatStacks?.[pos]}
                gameType={value.gameType}
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

        {/* LA DEVISE EST TOUT EN BAS, sous le lieu, et pas à côté des blindes : elle décrit OÙ on a
            joué, comme le lieu, le buy-in et le niveau — pas la mécanique du coup. Elle se retient
            d'une main à l'autre comme les blindes, donc celui qui ne quitte jamais son club la règle
            une fois et ne la revoit plus. Absente en tournoi : les jetons n'y sont pas de l'argent
            réel, et rien ne les habille. */}
        {value.gameType === 'cash' && (
          <>
            <Text style={styles.label}>Devise</Text>
            <Pressable style={styles.selector} onPress={() => setDeviseOuverte(true)}>
              <Text style={styles.selectorValue}>
                {devise(value.currency).sigle}  {devise(value.currency).nom}
              </Text>
              <Text style={styles.selectorChevron}>›</Text>
            </Pressable>
            <CurrencyPicker
              visible={deviseOuverte}
              selectedCode={value.currency}
              onSelect={(currency) => {
                update({ currency });
                setDeviseOuverte(false);
              }}
              onClose={() => setDeviseOuverte(false)}
            />
          </>
        )}

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
  // Mêmes bordure, rayon et gouttières que `input` — et surtout PAS de fond : les champs de ce
  // formulaire laissent voir le parchemin. Un fond blanc, recopié d'un autre écran, faisait ressortir
  // la devise comme si elle était le champ important de l'étape.
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorValue: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  selectorChevron: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    flex: 1,
    // Indispensable sur le web : un TextInput devient un <input>, dont la largeur minimale
    // intrinsèque (~203 px) l'emporte sur `flex: 1` tant que `minWidth` vaut `auto`. Deux champs
    // sur une même rangée (SB/BB, Nom/Stack) débordaient donc de l'écran, hors d'atteinte à cause
    // du `overflow-x: hidden` global. Sans effet sur un champ seul sur sa ligne, déjà au large.
    minWidth: 0,
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
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginBottom: 6,
  },
  inputError: {
    borderColor: colors.error,
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
  // Une ligne de straddle reprend le gabarit des lignes « Joueurs (nom et stack) » juste en dessous :
  // un libellé à gauche, un champ à droite. Assez large pour « UTG1 Straddle ».
  straddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  straddleRowLabel: {
    width: 112,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  // L'interrupteur du bouton se range à droite, à l'écart des montants : il ne règle pas une
  // valeur, il déplace un straddle.
  straddleRowSwitch: {
    marginLeft: 'auto',
  },
  straddleAmountField: {
    width: 110,
    // `styles.input` porte `flex: 1` (deux champs sur une rangée, cf. SB/BB) : sans le neutraliser,
    // la base flexible l'emporte sur la largeur et le champ s'étale sur toute la ligne — les
    // montants ne s'aligneraient plus d'une ligne à l'autre.
    flexGrow: 0,
    flexBasis: 'auto',
    marginBottom: 0,
    paddingVertical: 8,
    textAlign: 'center',
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
