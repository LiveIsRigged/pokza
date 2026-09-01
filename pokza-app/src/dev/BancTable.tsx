import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Card, Hand } from '../types/poker';
import { colors } from '../theme/theme';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { DisplayUnitProvider } from '../state/displayUnit';
import { HandReplayer } from '../components/replayer/HandReplayer';
import { LiveHandCreator } from '../creator/LiveHandCreator';
import { PostCard } from '../components/post/PostCard';
import { postToSeed } from '../creator/rehydrate';
import type { Post } from '../types/poker';

/**
 * BANC D'ESSAI TEMPORAIRE — à supprimer.
 * Rend le replayer sur une main synthétique, sans compte, pour comparer un rendu AVANT et APRÈS un
 * refactor. Atteignable via `?banc=1` (cf. le branchement dans `App.tsx`, à retirer aussi).
 */

const c = (rank: string, suit: string): Card => ({ rank, suit } as Card);

const seats = [
  { id: 's-utg', position: 'UTG', isHero: false, startingStack: 500 },
  { id: 's-hj', position: 'HJ', isHero: false, startingStack: 500 },
  { id: 's-co', position: 'CO', isHero: true, startingStack: 500, holeCards: [c('A', 's'), c('K', 'h')] },
  { id: 's-btn', position: 'BTN', isHero: false, startingStack: 500, holeCards: [c('Q', 'd'), c('Q', 'c')] },
  { id: 's-sb', position: 'SB', isHero: false, startingStack: 500 },
  { id: 's-bb', position: 'BB', isHero: false, startingStack: 500 },
] as Hand['seats'];

const actions = [
  { id: 'a1', street: 'preflop', seatId: 's-sb', type: 'post-sb', amount: 2, order: 1 },
  { id: 'a2', street: 'preflop', seatId: 's-bb', type: 'post-bb', amount: 5, order: 2 },
  { id: 'a3', street: 'preflop', seatId: 's-utg', type: 'fold', order: 3 },
  { id: 'a4', street: 'preflop', seatId: 's-hj', type: 'call', amount: 5, order: 4 },
  { id: 'a5', street: 'preflop', seatId: 's-co', type: 'raise', amount: 20, order: 5 },
  { id: 'a6', street: 'preflop', seatId: 's-btn', type: 'raise', amount: 65, order: 6 },
  { id: 'a7', street: 'preflop', seatId: 's-sb', type: 'fold', order: 7 },
  { id: 'a8', street: 'preflop', seatId: 's-bb', type: 'fold', order: 8 },
  { id: 'a9', street: 'preflop', seatId: 's-hj', type: 'fold', order: 9 },
  { id: 'a10', street: 'preflop', seatId: 's-co', type: 'call', amount: 65, order: 10 },
  { id: 'a11', street: 'flop', seatId: 's-co', type: 'check', order: 11 },
  { id: 'a12', street: 'flop', seatId: 's-btn', type: 'bet', amount: 70, order: 12 },
  { id: 'a13', street: 'flop', seatId: 's-co', type: 'call', amount: 70, order: 13 },
] as Hand['actions'];

const MAIN: Hand = {
  id: 'banc-1',
  variant: 'nlhe',
  gameType: 'cash',
  blinds: { sb: 2, bb: 5 },
  effectiveStack: 500,
  visibility: 'public',
  seats,
  board: { flop: [c('K', 's'), c('7', 'd'), c('2', 'c')] },
  actions,
  currency: 'EUR',
};

/** La même main, remontée en réglages de créateur pour ouvrir directement sur une street. */
const POST: Post = {
  id: 'banc-post', authorId: 'banc', authorName: 'Banc',
  createdAt: new Date().toISOString(), title: 'Banc', likeCount: 0, commentCount: 0,
  visibility: 'public', hand: MAIN,
};

/** Une main menée jusqu'au bout avec DEUX adversaires encore debout : de quoi ouvrir l'abattage
 *  et vérifier qu'on peut passer de l'un à l'autre. */
const MAIN_ABATTAGE: Hand = {
  id: 'banc-2',
  variant: 'nlhe',
  gameType: 'cash',
  blinds: { sb: 2, bb: 5 },
  effectiveStack: 1000,
  visibility: 'public',
  currency: 'EUR',
  seats: [
    { id: 's-utg', position: 'UTG', isHero: false, startingStack: 1000 },
    { id: 's-hj', position: 'HJ', isHero: false, startingStack: 1000 },
    { id: 's-co', position: 'CO', isHero: true, startingStack: 1000, holeCards: [c('A', 's'), c('K', 'h')] },
    { id: 's-btn', position: 'BTN', isHero: false, startingStack: 1000 },
    { id: 's-sb', position: 'SB', isHero: false, startingStack: 1000 },
    { id: 's-bb', position: 'BB', isHero: false, startingStack: 1000 },
  ] as Hand['seats'],
  board: { flop: [c('Q', 'd'), c('Q', 'c'), c('Q', 'h')], turn: c('Q', 's'), river: c('K', 'h') },
  actions: [
    { id: 'b1', street: 'preflop', seatId: 's-sb', type: 'post-sb', amount: 2, order: 1 },
    { id: 'b2', street: 'preflop', seatId: 's-bb', type: 'post-bb', amount: 5, order: 2 },
    { id: 'b3', street: 'preflop', seatId: 's-utg', type: 'fold', order: 3 },
    { id: 'b4', street: 'preflop', seatId: 's-hj', type: 'fold', order: 4 },
    { id: 'b5', street: 'preflop', seatId: 's-co', type: 'raise', amount: 20, order: 5 },
    { id: 'b6', street: 'preflop', seatId: 's-btn', type: 'call', amount: 20, order: 6 },
    { id: 'b7', street: 'preflop', seatId: 's-sb', type: 'call', amount: 20, order: 7 },
    { id: 'b8', street: 'preflop', seatId: 's-bb', type: 'fold', order: 8 },
    { id: 'b9', street: 'flop', seatId: 's-sb', type: 'check', order: 9 },
    { id: 'b10', street: 'flop', seatId: 's-co', type: 'check', order: 10 },
    { id: 'b11', street: 'flop', seatId: 's-btn', type: 'check', order: 11 },
    { id: 'b12', street: 'turn', seatId: 's-sb', type: 'check', order: 12 },
    { id: 'b13', street: 'turn', seatId: 's-co', type: 'check', order: 13 },
    { id: 'b14', street: 'turn', seatId: 's-btn', type: 'check', order: 14 },
    { id: 'b15', street: 'river', seatId: 's-sb', type: 'check', order: 15 },
    { id: 'b16', street: 'river', seatId: 's-co', type: 'check', order: 16 },
    { id: 'b17', street: 'river', seatId: 's-btn', type: 'check', order: 17 },
  ] as Hand['actions'],
};

const POST_ABATTAGE: Post = {
  id: 'banc-post-2', authorId: 'banc', authorName: 'Banc',
  createdAt: new Date().toISOString(), title: 'Banc', likeCount: 0, commentCount: 0,
  visibility: 'public', hand: MAIN_ABATTAGE,
};

export function BancTable() {
  const quoi = typeof location !== 'undefined' ? location.search : '';
  if (quoi.includes('carte')) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}><DisplayUnitProvider>
        <ScrollView style={styles.page} contentContainerStyle={styles.inner}>
          <View style={styles.carte}>
            <PostCard
              post={POST}
              currentUserId="banc"
              currentUserName="Banc"
              isOwnPost
              onEdit={() => {}}
              onDuplicate={() => {}}
              onDelete={() => {}}
            />
          </View>
        </ScrollView>
      </DisplayUnitProvider></SafeAreaProvider>
    );
  }
  if (quoi.includes('createur')) {
    const abattage = quoi.includes('abattage');
    // `&neuf=1` : un créateur SANS main de départ, donc `enCorrection` faux — le seul moyen de
    // voir la pastille de reprise, qui se tait sur une correction.
    const neuf = quoi.includes('neuf');
    const seed = postToSeed(abattage ? POST_ABATTAGE : POST);
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}><DisplayUnitProvider>
        <View style={styles.plein}>
          <LiveHandCreator
            authorId="banc"
            authorName="Banc"
            onCreated={async () => {}}
            onCancel={() => {}}
            groups={[]}
            onCreateGroup={async () => ({ id: 'g', name: 'g' }) as any}
            initial={neuf ? undefined : seed}
            initialPhase={
              abattage
                ? 'showdown'
                : quoi.includes('publier')
                ? 'review'
                : quoi.includes('contexte')
                ? 'context'
                : quoi.includes('cartes')
                  ? 'holeCards'
                  : quoi.includes('flop')
                    ? 'street-flop'
                    : quoi.includes('turn')
                      ? 'street-turn'
                      : 'street-preflop'
            }
          />
        </View>
      </DisplayUnitProvider></SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}><DisplayUnitProvider>
      <ScrollView style={styles.page} contentContainerStyle={styles.inner}>
        <View style={styles.carte}>
          <HandReplayer hand={MAIN} />
        </View>
      </ScrollView>
    </DisplayUnitProvider></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.feedBackground },
  inner: { padding: 0 },
  carte: { width: 390, alignSelf: 'flex-start' },
  plein: { flex: 1, width: 390, alignSelf: 'flex-start', backgroundColor: colors.feedBackground },
});
