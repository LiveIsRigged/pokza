import { supabase } from '../lib/supabase';
import { assertWritten, refusedMessage } from './writeGuard';
import { cropAndResizeToBase64, uploadImageToBucket, type CropRegion } from './images';

export type { CropRegion };

const BUCKET = 'group-avatars';

/** Même plafond que les avatars personnels — un logo de groupe ne s'affiche jamais plus grand
 * qu'un avatar à l'écran. */
const GROUP_AVATAR_MAX_SIZE = 512;

/**
 * Recadre selon la région choisie, envoie dans le bucket `group-avatars`, puis enregistre
 * l'adresse sur le groupe. Renvoie l'adresse publique à afficher immédiatement.
 */
export async function uploadGroupAvatar(groupId: string, uri: string, region: CropRegion): Promise<string> {
  const base64 = await cropAndResizeToBase64(uri, region, GROUP_AVATAR_MAX_SIZE);

  // Chemin fixe : un seul fichier par groupe, jamais d'orphelins. Le premier dossier porte
  // l'identifiant du groupe — les règles de sécurité côté base vérifient qu'on en est le créateur.
  const url = await uploadImageToBucket(BUCKET, `${groupId}/avatar.jpg`, base64);
  await saveGroupAvatarUrl(groupId, url);
  return url;
}

async function saveGroupAvatarUrl(groupId: string, url: string | null): Promise<void> {
  // Même garde-fou que pour l'avatar personnel, et plus exposé encore : seul le créateur du groupe
  // a le droit de modifier la ligne. Pour un simple membre, la modification ne touchait aucune
  // ligne, ne renvoyait aucune erreur, et le logo semblait changé jusqu'au rechargement.
  const { data, error } = await supabase.from('groups').update({ avatar_url: url }).eq('id', groupId).select('id');
  if (error) throw error;
  assertWritten(data, refusedMessage(url ? "Le logo du groupe n'a pas été enregistré" : "Le logo du groupe n'a pas été retiré"));
}

/** Retire la photo — même ordre (référence d'abord, fichier ensuite) que pour un avatar
 * personnel, pour ne jamais laisser d'avatar cassé affiché entre les deux étapes. */
export async function removeGroupAvatar(groupId: string): Promise<void> {
  await saveGroupAvatarUrl(groupId, null);
  await supabase.storage.from(BUCKET).remove([`${groupId}/avatar.jpg`]);
}
