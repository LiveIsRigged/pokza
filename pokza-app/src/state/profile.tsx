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
  /** Compte admin (présent dans la table `admins`) — n'affiche la page Stats que pour lui. Simple
   * gating d'UI : la vraie protection est côté base (fonction `get_admin_stats`). */
  isAdmin: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refetchCount, setRefetchCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setHasProfile(null);
      setDisplayName(null);
      setAvatarUrl(undefined);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.rpc('get_display_name', { profile_id: userId }),
      supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle(),
      // Vérif admin isolée : une erreur ici (table absente, réseau) ne doit jamais casser le
      // chargement du nom/avatar → on absorbe l'échec en "non-admin".
      supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
        .then((r) => r, () => ({ data: null })),
    ]).then(([{ data: name }, { data: row }, { data: adminRow }]) => {
      if (cancelled) return;
      setHasProfile(Boolean(name));
      setDisplayName(name ?? null);
      setAvatarUrl(row?.avatar_url ?? undefined);
      setIsAdmin(Boolean(adminRow));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refetchCount]);

  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  return { hasProfile, displayName, avatarUrl, isAdmin, loading, refetch };
}
