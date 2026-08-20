import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { colors } from '../../theme/theme';

// Icônes fonctionnelles de l'app — celles qui remplacent les emojis (🔍 🔔 ✉️ 🤝 👥 ⚙️ ⏻ 🗑 📷 💬 ♡ ↗).
// Un emoji se rend différemment selon la plateforme et la police système, et jurait à côté des
// icônes dessinées de `authIcons.tsx` : c'était le signal « prototype » le plus visible de l'app.
//
// Règles communes, reprises de `authIcons.tsx` : grille 24×24, trait 1.8, bouts et jointures
// arrondis, MONOCHROME (la couleur vient du seul prop `color`, jamais d'un remplissage décoratif).
// Aucune dépendance ajoutée : `react-native-svg` est déjà là (cf. `TableSurface`, `authIcons`).

export interface IconProps {
  size?: number;
  color?: string;
}

const DEFAULT_SIZE = 22;
const STROKE = 1.8;

/** Attributs de trait communs : évite de répéter les mêmes quatre props sur chaque tracé. */
const line = (color: string) => ({
  stroke: color,
  strokeWidth: STROKE,
  fill: 'none' as const,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Loupe — bouton Recherche de la barre du feed. */
export function SearchIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={10.5} cy={10.5} r={6.5} {...line(color)} />
      <Path d="M15.3 15.3 L20.5 20.5" {...line(color)} />
    </Svg>
  );
}

/** Cloche — bouton Notifications de la barre du feed, et bandeau d'activation des notifications. */
export function BellIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.2 16.4 V10.6 A5.8 5.8 0 0 1 17.8 10.6 V16.4 L19.6 18.8 H4.4 Z" {...line(color)} />
      <Path d="M9.9 21 A2.4 2.4 0 0 0 14.1 21" {...line(color)} />
    </Svg>
  );
}

/** Enveloppe — champ email de l'écran d'accueil, et entrée « Mes invitations » du menu. */
export function MailIcon({ size = 18, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} {...line(color)} />
      <Path d="M4 7 L12 13 L20 7" {...line(color)} />
    </Svg>
  );
}

/** Deux personnes — entrées « Mes amis » et « Ajouter des amis ». */
export function FriendsIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9} cy={8.4} r={3.5} {...line(color)} />
      <Path d="M2.6 20 V19.2 A6.2 6.2 0 0 1 15.4 19.2 V20" {...line(color)} />
      <Path d="M16.4 5.4 A3.5 3.5 0 0 1 16.4 11.4" {...line(color)} />
      <Path d="M17.8 13.6 A6.2 6.2 0 0 1 21.5 19.2 V20" {...line(color)} />
    </Svg>
  );
}

/**
 * Table de poker vue du dessus, six joueurs autour — « Mes groupes privés », et pastille de groupe
 * sur les mains du feed. Une tablée plutôt que trois silhouettes : dans le menu, l'entrée suit
 * immédiatement « Mes amis », et deux icônes de personnes s'y confondraient à cette taille.
 */
export function GroupTableIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Table resserrée et sièges grossis : à 21 px dans le menu, des pastilles de 2,7 px se
          perdaient contre le trait de l'ellipse, qui prenait le dessus. */}
      <Ellipse cx={12} cy={12} rx={7.4} ry={4.6} {...line(color)} />
      <Circle cx={12} cy={4.2} r={1.7} fill={color} />
      <Circle cx={12} cy={19.8} r={1.7} fill={color} />
      <Circle cx={21} cy={15.8} r={1.7} fill={color} />
      <Circle cx={3} cy={15.8} r={1.7} fill={color} />
      <Circle cx={3} cy={8.2} r={1.7} fill={color} />
      <Circle cx={21} cy={8.2} r={1.7} fill={color} />
    </Svg>
  );
}

/** Roue crantée à six dents — « Réglages ». Silhouette fermée, et non des rayons partant d'un
 *  cercle, qui donnaient un soleil plutôt qu'un engrenage. */
export function GearIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17.36 10.36 L20.38 10.07 L20.38 13.93 L17.36 13.64 L16.10 15.82 L17.87 18.29 L14.51 20.22 L13.26 17.46 L10.74 17.46 L9.49 20.22 L6.13 18.29 L7.90 15.82 L6.64 13.64 L3.62 13.93 L3.62 10.07 L6.64 10.36 L7.90 8.18 L6.13 5.71 L9.49 3.78 L10.74 6.54 L13.26 6.54 L14.51 3.78 L17.87 5.71 L16.10 8.18 Z"
        {...line(color)}
      />
      <Circle cx={12} cy={12} r={2.7} {...line(color)} />
    </Svg>
  );
}

/** Bouton d'alimentation — « Déconnexion ». */
export function PowerIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7.4 6.6 A7.2 7.2 0 1 0 16.6 6.6" {...line(color)} />
      <Path d="M12 3 V11.2" {...line(color)} />
    </Svg>
  );
}

/** Cœur — « J'aime ». `filled` le remplit (état actif), sinon simple contour. */
export function HeartIcon({ size = DEFAULT_SIZE, color = colors.textPrimary, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20.4 C12 20.4 3.6 15 3.6 9.4 A4.8 4.8 0 0 1 12 6.6 A4.8 4.8 0 0 1 20.4 9.4 C20.4 15 12 20.4 12 20.4 Z"
        {...line(color)}
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}

/** Bulle de discussion — commentaires d'une main. */
export function CommentIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.5 4.5 H19.5 A2.6 2.6 0 0 1 22.1 7.1 V14.6 A2.6 2.6 0 0 1 19.5 17.2 H11.5 L7.3 21.2 V17.2 H4.5 A2.6 2.6 0 0 1 1.9 14.6 V7.1 A2.6 2.6 0 0 1 4.5 4.5 Z"
        {...line(color)}
      />
    </Svg>
  );
}

/** Boîte et flèche montante — bouton Partager d'une main. Même geste que `FeatureShareIcon` de
 *  l'écran d'accueil, redessiné sur la grille 24 des icônes d'interface (celle-ci est illustrative
 *  et plus grande, elle appartient au trio Crée/Partage/Débat). */
export function ShareIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.5 11.5 V19.5 H17.5 V11.5" {...line(color)} />
      <Path d="M12 15 V4" {...line(color)} />
      <Path d="M8.4 7.4 L12 3.8 L15.6 7.4" {...line(color)} />
    </Svg>
  );
}

/** Corbeille — toutes les suppressions (main, commentaire, groupe, compte, photo). */
export function TrashIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 6.4 H20" {...line(color)} />
      <Path d="M9.6 6.4 V4.2 H14.4 V6.4" {...line(color)} />
      <Path d="M6.6 6.4 L7.6 20 A1 1 0 0 0 8.6 20.8 H15.4 A1 1 0 0 0 16.4 20 L17.4 6.4" {...line(color)} />
    </Svg>
  );
}

/** Appareil photo — pastille de retouche d'avatar, et pièce jointe d'un commentaire. */
export function CameraIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5.6 6.8 H8.6 L10.1 4.2 H13.9 L15.4 6.8 H18.4 A3 3 0 0 1 21.4 9.8 V17.2 A3 3 0 0 1 18.4 20.2 H5.6 A3 3 0 0 1 2.6 17.2 V9.8 A3 3 0 0 1 5.6 6.8 Z" {...line(color)} />
      <Circle cx={12} cy={13.5} r={3.9} {...line(color)} />
    </Svg>
  );
}

/** Pique plein — notification « un ami a publié une main ». Même symbole que l'icône « Crée » de
 *  l'écran d'accueil, ici réduit à sa silhouette pour rester lisible en petit. */
export function SpadeIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.4 C12 3.4 3.6 9.4 3.6 14 A3.9 3.9 0 0 0 10.6 16.4 L9.4 20.6 H14.6 L13.4 16.4 A3.9 3.9 0 0 0 20.4 14 C20.4 9.4 12 3.4 12 3.4 Z"
        fill={color}
      />
    </Svg>
  );
}

/** Crayon — « Modifier » (une main, un groupe). */
export function PencilIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 20 L4.9 15.9 L15.9 4.9 A2.2 2.2 0 0 1 19.1 8.1 L8.1 19.1 Z" {...line(color)} />
      <Path d="M14.4 6.4 L17.6 9.6" {...line(color)} />
    </Svg>
  );
}

/** Drapeau — « Signaler » une main ou un joueur. */
export function FlagIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 21 V3.5" {...line(color)} />
      <Path d="M6 4.5 H18.5 L15.5 9.2 L18.5 13.9 H6" {...line(color)} />
    </Svg>
  );
}

/** Cercle barré — « Bloquer » un joueur. */
export function BlockIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} {...line(color)} />
      <Path d="M6 6 L18 18" {...line(color)} />
    </Svg>
  );
}

/** Flèche revenant en arrière — « Débloquer ». */
export function UndoIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9.5 H14.5 A5.5 5.5 0 0 1 14.5 20.5 H8" {...line(color)} />
      <Path d="M7.8 5.7 L4 9.5 L7.8 13.3" {...line(color)} />
    </Svg>
  );
}

/** Cadre avec un relief — « Choisir une photo » dans la photothèque. */
export function ImageIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={4.5} width={18} height={15} rx={2.6} {...line(color)} />
      <Circle cx={8.6} cy={9.6} r={1.7} {...line(color)} />
      <Path d="M3.6 17 L9.4 12 L13.6 15.6 L16.4 13.2 L20.4 16.6" {...line(color)} />
    </Svg>
  );
}

/** Personne avec un moins — « Retirer cet ami ». */
export function PersonMinusIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={9.5} cy={8} r={3.8} {...line(color)} />
      <Path d="M2.8 20.4 V19.6 A6.7 6.7 0 0 1 16.2 19.6 V20.4" {...line(color)} />
      <Path d="M17.4 10 H22.4" {...line(color)} />
    </Svg>
  );
}

/** Chronomètre — sanction temporaire en modération. */
export function ClockIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12.8} r={8} {...line(color)} />
      <Path d="M12 8.4 V12.8 L15 15" {...line(color)} />
      <Path d="M9.5 2.6 H14.5" {...line(color)} />
    </Svg>
  );
}

/** Triangle d'alerte — confirmations de modération (signalement, compte mineur soupçonné). */
export function WarningIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.6 L22 20.4 H2 Z" {...line(color)} />
      <Path d="M12 9.6 V14.4" {...line(color)} />
      <Circle cx={12} cy={17.4} r={1.05} fill={color} />
    </Svg>
  );
}

/** Une seule personne — retrait d'un membre d'un groupe. */
export function PersonIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} {...line(color)} />
      <Path d="M4.5 20.5 V19.6 A7.5 7.5 0 0 1 19.5 19.6 V20.5" {...line(color)} />
    </Svg>
  );
}

/** Barres croissantes — « Statistiques » (menu du fondateur). */
export function ChartIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 20 H20.5" {...line(color)} />
      <Path d="M6.8 20 V13.5" {...line(color)} />
      <Path d="M12 20 V8.5" {...line(color)} />
      <Path d="M17.2 20 V4.5" {...line(color)} />
    </Svg>
  );
}

/** Bouclier — « Modération » (menu du fondateur). */
export function ShieldIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.2 L20 6.2 V12 C20 16.4 16.6 19.6 12 21 C7.4 19.6 4 16.4 4 12 V6.2 Z" {...line(color)} />
    </Svg>
  );
}

/** Feuillet ligné — « Journal d'audit » (menu du fondateur). */
export function AuditIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5.5 3.5 H14.5 L18.5 7.5 V20.5 H5.5 Z" {...line(color)} />
      <Path d="M14.5 3.5 V7.5 H18.5" {...line(color)} />
      <Path d="M8.5 12 H15.5 M8.5 16 H15.5" {...line(color)} />
    </Svg>
  );
}

/** Porte ouverte avec flèche — « Quitter le groupe » (départ volontaire, pas une suppression). */
export function ExitIcon({ size = DEFAULT_SIZE, color = colors.textPrimary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13.5 4 H6.5 A2 2 0 0 0 4.5 6 V18 A2 2 0 0 0 6.5 20 H13.5" {...line(color)} />
      <Path d="M10.5 12 H20.5" {...line(color)} />
      <Path d="M17.2 8.7 L20.5 12 L17.2 15.3" {...line(color)} />
    </Svg>
  );
}
