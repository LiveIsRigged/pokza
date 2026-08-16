import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../utils/errorMessage';

/** Attente avant la 1re nouvelle tentative, puis doublée à chaque échec, plafonnée. Un jeton qui
 * se rafraîchit se règle en quelques centaines de millisecondes ; une coupure réseau peut durer,
 * d'où le plafond qui évite de marteler le serveur. */
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 10_000;

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
  /** Message prêt à afficher quand l'état du profil n'a PAS pu être déterminé — à distinguer
   * absolument de « ce compte n'a pas de profil ». Tant qu'il est renseigné, `hasProfile` garde sa
   * dernière valeur connue plutôt que de basculer à `false`. Une nouvelle tentative est déjà
   * programmée : ce message dit « on n'a pas encore réussi », pas « c'est perdu ». */
  error: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setHasProfile(null);
      setDisplayName(null);
      setAvatarUrl(undefined);
      setIsAdmin(false);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let echecs = 0;

    const charger = async () => {
      setLoading(true);
      try {
        const [nom, profil, admin] = await Promise.all([
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
        ]);
        if (cancelled) return;

        // ⚠️ LE CŒUR DU CORRECTIF. Un client Supabase RÉSOUT avec `{ data, error }` quand le
        // serveur répond une erreur — il ne rejette pas. L'ancien code lisait `data` sans jamais
        // regarder `error` : le moindre incident passager (jeton en cours de rafraîchissement,
        // coupure d'une seconde) donnait `data = null`, donc `hasProfile = false`, donc l'écran
        // « Complète ton profil » servi à quelqu'un qui a déjà un profil. Le seul moyen d'en
        // sortir était de se déconnecter, puisque le bouton « Retour » appelle `signOut()`.
        if (nom.error) throw nom.error;

        setHasProfile(Boolean(nom.data));
        setDisplayName(nom.data ?? null);
        // L'avatar n'a pas voix au chapitre sur l'existence du profil : en cas d'erreur on garde
        // celui qu'on avait plutôt que de le faire disparaître.
        if (!profil.error) setAvatarUrl(profil.data?.avatar_url ?? undefined);
        setIsAdmin(Boolean(admin.data));
        setError(null);
        setLoading(false);
        echecs = 0;
      } catch (err) {
        if (cancelled) return;
        // On ne touche NI à `hasProfile` NI à `displayName` : leur dernière valeur connue vaut
        // mieux qu'une valeur inventée. Au premier chargement ils restent à `null`, ce que
        // `App.tsx` traite déjà comme « pas encore su ».
        setError(errorMessage(err));
        setLoading(false);
        echecs += 1;
        // L'ancien code ne réessayait jamais : l'effet ne se relance que si `userId` change, or au
        // rafraîchissement du jeton l'identifiant ne bouge pas. Un incident d'une seconde restait
        // donc affiché jusqu'à la déconnexion. Ici la situation se répare toute seule.
        timer = setTimeout(charger, Math.min(RETRY_BASE_MS * 2 ** (echecs - 1), RETRY_MAX_MS));
      }
    };

    charger();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, refetchCount]);

  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  return { hasProfile, displayName, avatarUrl, isAdmin, loading, error, refetch };
}
