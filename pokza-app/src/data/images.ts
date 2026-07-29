import { toByteArray } from 'base64-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/** Région carrée choisie par la personne dans `AvatarCropper`, en pixels de l'image ORIGINALE
 * (pas de l'aperçu à l'écran) — c'est ce que `expo-image-manipulator` attend. */
export interface CropRegion {
  originX: number;
  originY: number;
  size: number;
}

/**
 * Ouvre la galerie et renvoie l'image choisie telle quelle (non recadrée), ou `null` si la
 * personne annule. Générique : sert aussi bien à une photo de profil personnelle qu'à une photo
 * de groupe. Le recadrage est fait ensuite par `AvatarCropper` : `allowsEditing` n'aurait de toute
 * façon aucun effet sur le web (pas d'interface de recadrage native), autant avoir le même
 * parcours de cadrage partout plutôt qu'un natif sur mobile et rien sur le web.
 */
export async function pickImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Pokza a besoin d'accéder à tes photos.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/** Découpe la région choisie puis ramène au carré `maxSize`×`maxSize` en un seul passage. */
export async function cropAndResizeToBase64(uri: string, region: CropRegion, maxSize: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.crop({
    originX: Math.round(region.originX),
    originY: Math.round(region.originY),
    width: Math.round(region.size),
    height: Math.round(region.size),
  });
  context.resize({ width: maxSize, height: maxSize });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!result.base64) throw new Error("L'image n'a pas pu être préparée pour l'envoi.");
  return result.base64;
}

export interface ResizedImage {
  base64: string;
  /** Dimensions RÉELLES du fichier envoyé (après redimensionnement) — pas celles de l'image
   * d'origine. C'est ce qu'il faut conserver pour recalculer le bon format à l'affichage, sans quoi
   * l'aperçu ne peut être qu'une boîte de taille arbitraire qui recadre l'image pour la remplir. */
  width: number;
  height: number;
}

/**
 * Ramène le plus grand côté à `maxDimension` en préservant le format d'origine — contrairement à
 * `cropAndResizeToBase64`, rien n'est recadré : une photo jointe à un commentaire garde sa forme
 * (portrait, paysage...), pas de carré imposé comme pour un avatar. Ne remonte pas la qualité
 * d'une image déjà plus petite.
 */
export async function resizeToBase64(image: PickedImage, maxDimension: number): Promise<ResizedImage> {
  const context = ImageManipulator.manipulate(image.uri);
  const largestSide = Math.max(image.width || 0, image.height || 0);
  if (largestSide > maxDimension) {
    const shrinkByWidth = image.width >= image.height;
    context.resize(shrinkByWidth ? { width: maxDimension } : { height: maxDimension });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!result.base64) throw new Error("L'image n'a pas pu être préparée pour l'envoi.");
  return { base64: result.base64, width: result.width, height: result.height };
}

async function uploadBytes(bucket: string, path: string, base64: string): Promise<void> {
  // `fetch(uri).then((r) => r.blob())` — la méthode la plus évidente — produit des fichiers de
  // 0 octet en React Native. Décoder le base64 en octets fonctionne sur mobile comme sur le web.
  const bytes = toByteArray(base64);
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}

/**
 * Envoie l'image à un chemin fixe d'un bucket PUBLIC, et renvoie son adresse avec un marqueur de
 * date — sans lui, l'ancienne version resterait affichée, mise en cache par le navigateur et le
 * CDN. Réservé aux buckets publics (avatars perso/groupe) : pour un bucket privé, voir
 * `uploadPrivateImage` — une URL publique construite sur un bucket privé ne serait pas utilisable.
 */
export async function uploadImageToBucket(bucket: string, path: string, base64: string): Promise<string> {
  await uploadBytes(bucket, path, base64);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Envoie l'image à un chemin fixe d'un bucket PRIVÉ. Ne renvoie pas d'adresse : l'affichage passe
 * par une URL signée temporaire, générée séparément au moment de la lecture. */
export async function uploadPrivateImage(bucket: string, path: string, base64: string): Promise<void> {
  await uploadBytes(bucket, path, base64);
}
