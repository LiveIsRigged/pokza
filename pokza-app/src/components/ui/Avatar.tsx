import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/theme';

interface AvatarProps {
  /** Photo choisie par la personne — absente tant qu'elle n'en a pas mis. */
  url?: string;
  /** Sert uniquement à l'avatar par défaut : jamais affiché quand une photo existe. */
  name: string;
  size?: number;
  /** 'circle' pour une personne (défaut), 'square' pour un groupe — même distinction visuelle
   * que l'ancien avatar à initiale (rond pour les gens, carré arrondi pour les groupes). */
  shape?: 'circle' | 'square';
}

/**
 * Avatar par défaut, affiché tant que la personne n'a pas choisi de photo.
 *
 * C'est la SEULE pièce à changer le jour où le logo Pokza existe : remplacer le `<Text>` par un
 * `<Image source={require('…')} />` ici suffit à mettre à jour tout le reste de l'app (feed, menu,
 * profils, invitations, membres de groupe), et permet aussi de revenir en arrière au même prix si
 * un logo identique pour tout le monde rend le feed trop uniforme.
 */
function DefaultAvatar({ name, size }: { name: string; size: number }) {
  return (
    <Text style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
      {name.charAt(0).toUpperCase()}
    </Text>
  );
}

/** Photo de profil ronde (ou carrée arrondie pour un groupe), avec repli automatique sur l'avatar
 * par défaut. */
export function Avatar({ url, name, size = 36, shape = 'circle' }: AvatarProps) {
  const borderRadius = shape === 'circle' ? size / 2 : Math.round(size * 0.2);
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius }]}>
      {url ? (
        // `cover` et non `contain` : la photo n'est pas forcément carrée (le web n'offre pas
        // d'interface de recadrage), et `contain` laisserait des bandes vides dans le rond.
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <DefaultAvatar name={name} size={size} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.tableFelt,
    alignItems: 'center',
    justifyContent: 'center',
    // Sans ça, la photo carrée déborderait du rond au lieu d'être découpée dedans.
    overflow: 'hidden',
  },
  initial: {
    color: colors.gold,
    fontWeight: '700',
  },
});
