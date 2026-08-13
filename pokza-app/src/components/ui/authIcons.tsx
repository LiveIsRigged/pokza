import React from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme/theme';

// Icônes de l'écran d'accueil (connexion / inscription), dessinées au trait pour rester sobres et
// cohérentes avec le reste de l'app (aucune dépendance d'icônes ajoutée — on a déjà react-native-svg).
// Toutes sont MONOCHROMES : la couleur vient d'un seul prop `color`, jamais de remplissages décoratifs.

const NAVY = colors.tableFelt;

/** Le « P-drapeau » de la marque, plein. Même glyphe que l'icône d'accueil, ici sans le carré. */
export function PokzaLogo({ size = 58, color = colors.action }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000">
      <Path
        fill={color}
        fillRule="evenodd"
        d="M317 240 H433 L683 405 L433 570 V760 H317 Z M433 342 L563 405 L433 468 Z"
      />
    </Svg>
  );
}

/** Deux cartes en éventail (une « main »), au trait monochrome — pour « Crée ». La carte de devant
 *  porte un ♠ ; le remplissage parchemin masque proprement la carte de derrière sous le chevauchement. */
export function FeatureCardIcon({ size = 30, color = NAVY }: { size?: number; color?: string }) {
  return (
    <Svg width={(size * 34) / 32} height={size} viewBox="0 0 34 32">
      <Rect
        x={10.5}
        y={4}
        width={13}
        height={19}
        rx={2.5}
        stroke={color}
        strokeWidth={1.8}
        fill={colors.feedBackground}
        rotation={-16}
        originX={17}
        originY={24}
      />
      <G rotation={9} originX={17} originY={24}>
        <Rect x={10.5} y={4} width={13} height={19} rx={2.5} stroke={color} strokeWidth={1.8} fill={colors.feedBackground} />
        <SvgText x={17} y={17.5} fontSize={11} fontWeight="bold" fill={color} textAnchor="middle">
          {'♠︎'}
        </SvgText>
      </G>
    </Svg>
  );
}

/** Boîte + flèche vers le haut, monochrome — pour « Partage ». */
export function FeatureShareIcon({ size = 26, color = NAVY }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Path
        d="M8 15 V25 H22 V15"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={15} y1={19} x2={15} y2={5} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M10.5 9 L15 4.5 L19.5 9"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Deux bulles de discussion qui se chevauchent, monochrome — pour « Débat ». La bulle de devant est
 *  remplie de parchemin pour masquer proprement la bulle de derrière. */
export function FeatureChatIcon({ size = 26, color = NAVY }: { size?: number; color?: string }) {
  return (
    <Svg width={(size * 32) / 30} height={size} viewBox="0 0 32 30">
      <Path
        d="M15 3 H27 A3 3 0 0 1 30 6 V12 A3 3 0 0 1 27 15 H15 A3 3 0 0 1 12 12 V6 A3 3 0 0 1 15 3 Z"
        stroke={color}
        strokeWidth={1.8}
        fill={colors.feedBackground}
        strokeLinejoin="round"
      />
      <Path
        d="M5 8 H18 A3 3 0 0 1 21 11 V19 A3 3 0 0 1 18 22 H12 L8 26.5 V22 H5 A3 3 0 0 1 2 19 V11 A3 3 0 0 1 5 8 Z"
        stroke={color}
        strokeWidth={1.8}
        fill={colors.feedBackground}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Enveloppe au trait — champ email. */
export function MailIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} stroke={color} strokeWidth={1.8} fill="none" />
      <Path
        d="M4 7 L12 13 L20 7"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Cadenas au trait — champ mot de passe. */
export function LockIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4.5} y={10} width={15} height={10} rx={2.5} stroke={color} strokeWidth={1.8} fill="none" />
      <Path
        d="M7.5 10 V7.5 A4.5 4.5 0 0 1 16.5 7.5 V10"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Œil ouvert (amande large) — révéler le mot de passe. */
export function EyeIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M1.5 12 C5 4.5 19 4.5 22.5 12 C19 19.5 5 19.5 1.5 12 Z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3.4} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

/** Œil barré — masquer le mot de passe. */
export function EyeOffIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M1.5 12 C5 4.5 19 4.5 22.5 12 C19 19.5 5 19.5 1.5 12 Z"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3.4} stroke={color} strokeWidth={1.8} fill="none" />
      <Line x1={4} y1={4} x2={20} y2={20} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
