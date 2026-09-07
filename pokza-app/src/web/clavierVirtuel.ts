/**
 * CET APPAREIL OUVRE-T-IL UN CLAVIER VIRTUEL ?
 * ───────────────────────────────────────────
 * Une seule question, deux usages qui en dépendent — d'où ce module partagé plutôt qu'une copie
 * dans chacun.
 *
 * `(pointer: coarse)` interroge le pointeur PRINCIPAL : un iPhone ou un iPad répond oui, un
 * ordinateur non — y compris un portable tactile piloté à la souris, qui n'ouvre aucun clavier
 * quand on clique dans un champ.
 *
 * FAUX EN CAS DE DOUTE, et c'est délibéré : ne pas anticiper laisse au pire Safari faire glisser
 * la page une fois (défaut visible mais passager) ; anticiper à tort immobilise une bande de fond
 * pendant toute la saisie.
 */
export function clavierVirtuelPlausible(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * PEUT-ON DEMANDER LE FOCUS AUTOMATIQUE À L'OUVERTURE D'UN ÉCRAN ?
 *
 * ⚠️ SUR iOS, NON — ET C'EST CE QUI A CAUSÉ LE DÉFAUT SIGNALÉ PAR VICTOR LE 07/09/2026 : « on
 * appuie sur la loupe, un espace blanc s'ouvre une seconde à la place du clavier, se referme, et
 * il faut retoucher le champ pour que le clavier vienne pour de bon. »
 *
 * Le mécanisme est en deux temps, et les deux sont corrects pris séparément :
 *   1. iOS n'ouvre le clavier que sur un GESTE de l'utilisateur SUR LE CHAMP. Un `autoFocus` part
 *      après la fin du geste (au montage de l'écran) : le champ prend le focus, le clavier NON.
 *   2. `AjusteurHauteur` rétrécit l'app dès le `focusin`, avant toute mesure — il le faut, sinon
 *      Safari fait glisser la page (cf. `hauteurVisible.ts`). Il réserve donc la place d'un
 *      clavier qui ne viendra jamais : c'est l'espace blanc. Puis il constate et rend la place.
 *
 * Le remède est de ne pas DEMANDER ce qu'iOS ne donne pas. On n'y perd rien : le clavier ne
 * s'ouvrait pas de toute façon, il fallait déjà toucher le champ. On gagne juste de ne plus faire
 * clignoter l'écran entre-temps.
 *
 * En natif (`window` absent → `false` par le repli), `autoFocus` fonctionne vraiment et ouvre le
 * clavier : on le garde. Sur ordinateur aussi.
 */
export function autoFocusUtile(): boolean {
  return !clavierVirtuelPlausible();
}
