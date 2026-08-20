import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing } from '../theme/theme';
import { LEGAL_DOCS, LEGAL_DRAFT, LEGAL_UPDATED, getLegalDoc, type LegalDoc, type LegalDocId } from './legalContent';

interface LegalScreenProps {
  /** Ouvrir directement un document (depuis un lien d'inscription) ; sinon on affiche l'index. */
  initialDocId?: LegalDocId;
  onBack: () => void;
}

/**
 * Écran des informations légales, utilisé à deux endroits : depuis le menu (index des 4 documents)
 * et depuis l'écran d'inscription (ouverture directe d'un document via un lien de consentement).
 * Un seul composant, pour que le texte reste à un seul endroit ([legalContent.ts](legalContent.ts)).
 */
export function LegalScreen({ initialDocId, onBack }: LegalScreenProps) {
  const [docId, setDocId] = useState<LegalDocId | null>(initialDocId ?? null);
  const doc = docId ? getLegalDoc(docId) : null;
  // Arrivé via l'index (pas de doc imposé) : le retour depuis un document ramène à l'index.
  const cameFromIndex = initialDocId == null;

  const handleBack = () => {
    if (doc && cameFromIndex) setDocId(null);
    else onBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={handleBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {doc ? doc.shortTitle : 'Informations légales'}
        </Text>
      </View>

      {LEGAL_DRAFT && (
        <View style={styles.draftBanner}>
          <Text style={styles.draftText}>
            ⚠️ Version provisoire, en cours de relecture juridique. Certaines informations restent à
            compléter.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {doc ? <DocBody doc={doc} /> : <DocIndex onSelect={setDocId} />}
      </ScrollView>
    </View>
  );
}

function DocIndex({ onSelect }: { onSelect: (id: LegalDocId) => void }) {
  return (
    <>
      {LEGAL_DOCS.map((d) => (
        <Pressable key={d.id} style={styles.indexRow} onPress={() => onSelect(d.id)}>
          <Text style={styles.indexLabel}>{d.title}</Text>
          <Text style={styles.indexChevron}>›</Text>
        </Pressable>
      ))}
      <Text style={styles.updated}>Dernière mise à jour : {LEGAL_UPDATED}</Text>
    </>
  );
}

function DocBody({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <Text style={styles.docTitle}>{doc.title}</Text>
      {doc.sections.map((section, i) => (
        <View key={i} style={styles.section}>
          {section.heading ? <Text style={styles.sectionHeading}>{section.heading}</Text> : null}
          {section.body.map((para, j) => {
            const isBullet = para.startsWith('•');
            return (
              <Text key={j} style={[styles.paragraph, isBullet && styles.bullet]}>
                {para}
              </Text>
            );
          })}
        </View>
      ))}
      <Text style={styles.updated}>Dernière mise à jour : {LEGAL_UPDATED}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.feedBackground, paddingTop: 50 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 14, marginBottom: 10 },
  backArrow: { fontSize: 22, color: colors.textPrimary, paddingHorizontal: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  draftBanner: {
    marginHorizontal: 14,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(232,87,31,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(232,87,31,0.3)',
  },
  draftText: { fontSize: 12, color: colors.action, fontWeight: '600' },
  content: { paddingHorizontal: 18, paddingBottom: 48 },
  indexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  indexLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  indexChevron: { fontSize: 20, color: colors.textSecondary },
  docTitle: { fontSize: 22, fontWeight: '700', color: colors.tableFelt, marginBottom: spacing.md },
  section: { marginBottom: spacing.md },
  sectionHeading: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  paragraph: { fontSize: 14, lineHeight: 21, color: colors.textPrimary, marginBottom: 8 },
  bullet: { marginBottom: 4, paddingLeft: 6 },
  updated: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.md },
});
