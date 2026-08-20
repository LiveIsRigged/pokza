import React, { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { colors, radius, spacing } from '../../theme/theme';
import type { CropRegion } from '../../data/avatars';

const VIEWPORT = 280;
const ZOOM_STEP = 1.25;
const MAX_ZOOM_FACTOR = 3;

interface Point {
  x: number;
  y: number;
}

interface AvatarCropperProps {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  onCancel: () => void;
  onConfirm: (region: CropRegion) => void;
}

function clampOffset(offset: Point, scale: number, naturalWidth: number, naturalHeight: number): Point {
  const minX = VIEWPORT - naturalWidth * scale;
  const minY = VIEWPORT - naturalHeight * scale;
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/**
 * Écran de cadrage affiché après avoir choisi une photo, avant l'envoi : la photo entière est
 * chargée (pas de recadrage automatique côté serveur) et la personne déplace/zoome elle-même pour
 * choisir la partie qui sera visible dans le rond — sinon l'avatar prend toujours le centre de la
 * photo par défaut, ce qui rend mal sur un cadrage de travers.
 *
 * Le zoom minimal ("cover") garantit que le cercle est toujours entièrement rempli par la photo,
 * jamais de bord vide. Le pan est ensuite borné pour la même raison.
 */
export function AvatarCropper({ uri, naturalWidth, naturalHeight, onCancel, onConfirm }: AvatarCropperProps) {
  const minScale = Math.max(VIEWPORT / naturalWidth, VIEWPORT / naturalHeight);
  const maxScale = minScale * MAX_ZOOM_FACTOR;

  const [scale, setScale] = useState(minScale);
  const [offset, setOffset] = useState<Point>(() =>
    clampOffset(
      { x: (VIEWPORT - naturalWidth * minScale) / 2, y: (VIEWPORT - naturalHeight * minScale) / 2 },
      minScale,
      naturalWidth,
      naturalHeight
    )
  );
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const dragStart = useRef<Point>({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = { ...offsetRef.current };
      },
      onPanResponderMove: (_, gesture) => {
        const next = clampOffset(
          { x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy },
          scaleRef.current,
          naturalWidth,
          naturalHeight
        );
        offsetRef.current = next;
        setOffset(next);
      },
    })
  ).current;

  const applyZoom = (factor: number) => {
    const nextScale = Math.min(maxScale, Math.max(minScale, scaleRef.current * factor));
    // Le point actuellement au centre du cercle doit y rester après le zoom, sinon chaque clic sur
    // +/- déplace ce qu'on regarde au lieu de se contenter de le rapprocher/l'éloigner.
    const focusX = (VIEWPORT / 2 - offsetRef.current.x) / scaleRef.current;
    const focusY = (VIEWPORT / 2 - offsetRef.current.y) / scaleRef.current;
    const nextOffset = clampOffset(
      { x: VIEWPORT / 2 - focusX * nextScale, y: VIEWPORT / 2 - focusY * nextScale },
      nextScale,
      naturalWidth,
      naturalHeight
    );
    scaleRef.current = nextScale;
    offsetRef.current = nextOffset;
    setScale(nextScale);
    setOffset(nextOffset);
  };

  const handleConfirm = () => {
    const size = VIEWPORT / scaleRef.current;
    onConfirm({
      originX: -offsetRef.current.x / scaleRef.current,
      originY: -offsetRef.current.y / scaleRef.current,
      size,
    });
  };

  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>Cadre ta photo</Text>
      <View style={styles.viewport} {...panResponder.panHandlers}>
        <Image
          source={{ uri }}
          style={{
            position: 'absolute',
            left: offset.x,
            top: offset.y,
            width: naturalWidth * scale,
            height: naturalHeight * scale,
          }}
        />
      </View>
      <View style={styles.zoomRow}>
        <Pressable style={styles.zoomButton} onPress={() => applyZoom(1 / ZOOM_STEP)} hitSlop={8}>
          <Text style={styles.zoomButtonText}>−</Text>
        </Pressable>
        <Text style={styles.zoomLabel}>Zoom</Text>
        <Pressable style={styles.zoomButton} onPress={() => applyZoom(ZOOM_STEP)} hitSlop={8}>
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={styles.cancelButton} onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </Pressable>
        <Pressable style={styles.confirmButton} onPress={handleConfirm} hitSlop={8}>
          <Text style={styles.confirmButtonText}>Valider</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.tableRail,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  title: {
    color: colors.textOnFelt,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  viewport: {
    width: VIEWPORT,
    height: VIEWPORT,
    borderRadius: VIEWPORT / 2,
    overflow: 'hidden',
    backgroundColor: colors.tableFelt,
    // Empêche le geste de cadrage de faire défiler la page derrière sur le web.
    touchAction: 'none',
  } as any,
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.tableFeltLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonText: {
    color: colors.textOnFelt,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  zoomLabel: {
    color: colors.textOnFeltMuted,
    fontSize: 13,
    minWidth: 40,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: colors.textOnFeltMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
