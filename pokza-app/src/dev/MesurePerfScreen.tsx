import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Card, Rank, Suit, Variant } from '../types/poker';
import { computeEquity } from '../engine/equity';
import { colors, spacing, typography } from '../theme/theme';

/**
 * ÉCRAN TEMPORAIRE — à supprimer une fois le nombre de tirages arbitré.
 * ────────────────────────────────────────────────────────────────────
 * Atteignable sur `/mesure`, sans compte. Il ne sert qu'à répondre à UNE question : de combien
 * l'iPhone est-il plus lent que le Mac sur le calcul d'équité ?
 *
 * Les durées ci-dessous ont été mesurées sur un Mac, sur EXACTEMENT ces situations (même
 * générateur, même graine 999, mêmes 5 premières situations, médiane de 5). Le rapport entre les
 * deux colonnes est donc directement le facteur cherché — pas une estimation.
 *
 * Ce qui en dépend : la lecture automatique avance toutes les 1400 ms et un changement de pas
 * annule le calcul en cours. Un calcul plus long que ça n'aboutit jamais en lecture auto, et le
 * pourcentage ne s'affiche pas du tout. C'est ce plafond qui décide du nombre de tirages, pas le
 * confort.
 */

const REFERENCE_MAC_MS: Record<string, number> = {
  'NLHE 2 joueurs': 23,
  'NLHE 3 joueurs': 30,
  'NLHE 4 joueurs': 37,
  'PLO 4 joueurs': 86,
  'PLO5 2 joueurs': 72,
  'PLO5 4 joueurs': 136,
};

const CAS: { titre: string; variant: Variant; joueurs: number }[] = [
  { titre: 'NLHE 2 joueurs', variant: 'nlhe', joueurs: 2 },
  { titre: 'NLHE 3 joueurs', variant: 'nlhe', joueurs: 3 },
  { titre: 'NLHE 4 joueurs', variant: 'nlhe', joueurs: 4 },
  { titre: 'PLO 4 joueurs', variant: 'plo', joueurs: 4 },
  { titre: 'PLO5 2 joueurs', variant: 'plo5', joueurs: 2 },
  { titre: 'PLO5 4 joueurs', variant: 'plo5', joueurs: 4 },
];

const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: Suit[] = ['h', 'd', 'c', 's'];
const DECK: Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));

/** Même générateur que le script de mesure côté Mac — sinon les deux colonnes ne comparent rien. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function situations(variant: Variant, joueurs: number, combien: number, graine: number) {
  const rand = mulberry32(graine);
  const n = variant === 'plo5' ? 5 : variant === 'plo' ? 4 : 2;
  const out: { seatId: string; holeCards: Card[] }[][] = [];
  for (let k = 0; k < combien; k++) {
    const d = [...DECK];
    for (let i = 0; i < d.length - 1; i++) {
      const j = i + Math.floor(rand() * (d.length - i));
      [d[i], d[j]] = [d[j], d[i]];
    }
    const contenders = [];
    let p = 0;
    for (let s = 0; s < joueurs; s++) contenders.push({ seatId: 's' + s, holeCards: d.slice(p, (p += n)) });
    out.push(contenders);
  }
  return out;
}

interface Resultat {
  titre: string;
  ms: number;
  mac: number;
}

export function MesurePerfScreen() {
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [enCours, setEnCours] = useState(false);

  const lancer = () => {
    setResultats([]);
    setEnCours(true);
    // Une situation par tour de boucle d'événements : l'écran peut repeindre entre chaque, sinon
    // il resterait figé du début à la fin sans montrer la moindre progression.
    const suivant = (i: number, acc: Resultat[]) => {
      if (i >= CAS.length) {
        setEnCours(false);
        return;
      }
      const cas = CAS[i];
      const sits = situations(cas.variant, cas.joueurs, 7, 999);
      const t: number[] = [];
      for (let k = 0; k < 5; k++) {
        const debut = Date.now();
        computeEquity(sits[k], [], cas.variant);
        t.push(Date.now() - debut);
      }
      t.sort((a, b) => a - b);
      const ligne = { titre: cas.titre, ms: t[2], mac: REFERENCE_MAC_MS[cas.titre] };
      const nouveau = [...acc, ligne];
      setResultats(nouveau);
      setTimeout(() => suivant(i + 1, nouveau), 0);
    };
    setTimeout(() => suivant(0, []), 0);
  };

  const facteurs = resultats.map((r) => r.ms / r.mac);
  const facteurMax = facteurs.length ? Math.max(...facteurs) : 0;
  // Le PLO5 à 4 joueurs est le cas le plus coûteux : c'est lui qui fixe le plafond.
  const plo5 = resultats.find((r) => r.titre === 'PLO5 4 joueurs');
  // 1400 ms = intervalle de la lecture auto. On garde une marge : le calcul doit tenir dans 1000 ms.
  const tiragesMax = plo5 ? Math.floor((1000 / plo5.ms) * 2000) : 0;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.contenu}>
      <Text style={styles.titre}>Mesure — coût du calcul d'équité</Text>
      <Text style={styles.intro}>
        Écran temporaire. Il rejoue sur ce téléphone les situations déjà chronométrées sur Mac, à 2000
        tirages. Reste sur la page pendant la mesure.
      </Text>

      <TouchableOpacity style={[styles.bouton, enCours && styles.boutonInactif]} onPress={lancer} disabled={enCours}>
        <Text style={styles.boutonTexte}>{enCours ? 'Mesure en cours…' : 'Lancer la mesure'}</Text>
      </TouchableOpacity>

      {resultats.length > 0 && (
        <View style={styles.tableau}>
          <View style={styles.ligne}>
            <Text style={[styles.cellule, styles.entete, styles.colTitre]}>situation</Text>
            <Text style={[styles.cellule, styles.entete, styles.colNombre]}>Mac</Text>
            <Text style={[styles.cellule, styles.entete, styles.colNombre]}>ici</Text>
            <Text style={[styles.cellule, styles.entete, styles.colNombre]}>facteur</Text>
          </View>
          {resultats.map((r) => (
            <View key={r.titre} style={styles.ligne}>
              <Text style={[styles.cellule, styles.colTitre]}>{r.titre}</Text>
              <Text style={[styles.cellule, styles.colNombre]}>{r.mac} ms</Text>
              <Text style={[styles.cellule, styles.colNombre, styles.gras]}>{r.ms} ms</Text>
              <Text style={[styles.cellule, styles.colNombre, styles.gras]}>×{(r.ms / r.mac).toFixed(1)}</Text>
            </View>
          ))}
        </View>
      )}

      {!enCours && resultats.length === CAS.length && (
        <View style={styles.conclusion}>
          <Text style={styles.conclusionTitre}>Facteur le plus défavorable : ×{facteurMax.toFixed(1)}</Text>
          <Text style={styles.conclusionTexte}>
            Cas le plus coûteux (PLO5 à 4 joueurs) : {plo5?.ms} ms pour 2000 tirages. En gardant le calcul
            sous 1000 ms — la lecture auto avance toutes les 1400 ms et annule ce qui n'a pas abouti — le
            plafond tient à environ <Text style={styles.gras}>{tiragesMax.toLocaleString('fr-FR')} tirages</Text>.
          </Text>
          <Text style={styles.conclusionTexte}>Envoie-moi ces chiffres, je règle la précision dessus.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.feedBackground },
  contenu: { padding: spacing.lg, paddingTop: spacing.xl * 2, gap: spacing.lg },
  titre: { ...typography.postTitle, color: colors.textPrimary },
  intro: { ...typography.description, color: colors.textSecondary },
  bouton: {
    backgroundColor: colors.action,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  boutonInactif: { opacity: 0.5 },
  boutonTexte: { ...typography.voteQuestion, color: '#FFFFFF' },
  tableau: { gap: 2 },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  cellule: { ...typography.contextLine, color: colors.textPrimary },
  entete: { color: colors.textSecondary },
  colTitre: { flex: 1 },
  colNombre: { width: 64, textAlign: 'right' },
  gras: { fontWeight: '700' },
  conclusion: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  conclusionTitre: { ...typography.voteQuestion, color: colors.textPrimary },
  conclusionTexte: { ...typography.description, color: colors.textSecondary },
});
