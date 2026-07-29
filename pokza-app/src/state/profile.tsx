import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ProfileStatus {
  /** null tant que le profil n'a pas encore été créé par l'utilisateur */
  hasProfile: boolean | null;
  /** Pseudo ou "prénom nom" selon la préférence choisie (cf. fonction SQL get_display_name) — même
   * source que celle utilisée pour n'importe quel profil, pas de logique dupliquée côté client. */
  displayName: string | null;
  /** Photo de profil du compte courant — sert au menu latéral, seul endroit hors de la page de
   * profil elle-même qui affiche "mon" avatar. */
  avatarUrl: string | undefined;
  loading: boolean;
  refetch: () => void;
}

/**
 * Sait si CE compte a déjà rempli son profil, et sous quel nom/quelle photo l'afficher — les deux
 * requêtes partent en parallèle plutôt qu'en série.
 */
export function useProfileStatus(userId: string | undefined): ProfileStatus {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refetchCount, setRefetchCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setHasProfile(null);
      setDisplayName(null);
      setAvatarUrl(undefined);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.rpc('get_display_name', { profile_id: userId }),
      supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle(),
    ]).then(([{ data: name }, { data: row }]) => {
      if (cancelled) return;
      setHasProfile(Boolean(name));
      setDisplayName(name ?? null);
      setAvatarUrl(row?.avatar_url ?? undefined);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refetchCount]);

  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  return { hasProfile, displayName, avatarUrl, loading, refetch };
}
