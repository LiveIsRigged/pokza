import { supabase } from '../lib/supabase';
import { assertWritten, refusedMessage } from './writeGuard';
import {
  cropAndResizeToBase64,
  pickImage,
  pickImageFromCamera,
  uploadImageToBucket,
  type CropRegion,
  type PickedImage,
} from './images';

export type { CropRegion, PickedImage };

const BUCKET = 'avatars';

/** Un avatar ne dépasse jamais 72 px à l'écran ; 512 couvre les écrans à forte densité tout en
 * gardant des fichiers de quelques dizaines de Ko. Sans ce plafond, une photo d'iPhone partirait
 * telle quelle (~1 Mo) et serait retéléchargée à chaque carte du feed. */
const AVATAR_MAX_SIZE = 512;

export const pickAvatarImage = pickImage;
export const pickAvatarFromCamera = pickImageFromCamera;

/**
 * Recadre selon la région choisie, envoie dans le bucket `avatars`, puis enregistre l'adresse sur
 * le profil. Renvoie l'adresse publique à afficher immédiatement.
 */
export async function uploadAvatar(userId: string, uri: string, region: CropRegion): Promise<string> {
  const base64 = await cropAndResizeToBase64(uri, region, AVATAR_MAX_SIZE);

  // Chemin fixe : un seul fichier par personne, donc jamais d'anciennes photos orphelines qui
  // s'accumulent. Le premier dossier porte l'identifiant du compte — c'est sur lui que reposent
  // les règles de sécurité côté base (on ne peut écrire que dans son propre dossier).
  const url = await uploadImageToBucket(BUCKET, `${userId}/avatar.jpg`, base64);
  await saveAvatarUrl(userId, url);
  return url;
}

async function saveAvatarUrl(userId: string, url: string | null): Promise<void> {
  // Le fichier part dans le bucket AVANT cette ligne. Sans garde-fou, une modification refusée par
  // la base répondait `204` sans erreur : la fonction rendait l'adresse, l'écran affichait la
  // nouvelle photo, et elle redevenait l'ancienne au rechargement suivant sans que rien ne l'ait
  // annoncé. `profiles` fait partie des tables où « pouvoir écrire » implique « pouvoir lire »
  // (cf. l'analyse policy par policy dans `writeGuard.ts`), le `.select()` est donc sûr ici.
  const { data, error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId).select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage(url ? "La photo de profil n'a pas été enregistrée" : "La photo de profil n'a pas été retirée"));
}

/**
 * Retire la photo. On efface d'abord la référence sur le profil (c'est elle que tout le monde
 * lit), puis le fichier : si la seconde étape échoue il reste un fichier inutilisé que plus
 * personne n'affiche, alors que l'ordre inverse laisserait des avatars cassés partout.
 */
export async function removeAvatar(userId: string): Promise<void> {
  await saveAvatarUrl(userId, null);
  await supabase.storage.from(BUCKET).remove([`${userId}/avatar.jpg`]);
}
