import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/theme';
import { fetchTrendingGifs, searchGifs, type GifResult } from '../../data/gifs';

interface GifPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (gif: GifResult) => void;
}

const SEARCH_DEBOUNCE_MS = 400;

/** Écran de recherche de GIF (GIPHY), affiché tendances par défaut comme sur WhatsApp/iMessage.
 * La recherche est retardée de 400ms après la dernière frappe pour ne pas interroger l'API à
 * chaque lettre tapée. */
export function GifPicker({ visible, onClose, onSelect }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = (text: string) => {
    setLoading(true);
    setError(null);
    searchGifs(text)
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setLoading(true);
    setError(null);
    fetchTrendingGifs()
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TextInput
              style={styles.searchInput}
              placeholder="Chercher un GIF…"
              value={query}
              onChangeText={handleQueryChange}
              autoFocus
            />
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {loading ? (
            <ActivityIndicator color={colors.textSecondary} style={styles.loader} />
          ) : (
            <ScrollView contentContainerStyle={styles.grid}>
              {results.length === 0 && <Text style={styles.empty}>Aucun résultat.</Text>}
              {results.map((gif) => (
                <Pressable key={gif.id} style={styles.gifWrap} onPress={() => onSelect(gif)}>
                  <Image source={{ uri: gif.previewUrl }} style={styles.gifThumb} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    height: '85%',
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,35,61,0.15)',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: '#fff',
  },
  closeButton: {
    fontSize: 18,
    color: colors.textSecondary,
    padding: 4,
  },
  error: {
    fontSize: 12,
    color: '#C0392B',
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  loader: {
    marginTop: spacing.xl,
  },
  empty: {
    fontSize: 13,
    color: colors.textSecondary,
    padding: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  gifWrap: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(22,35,61,0.05)',
  },
  gifThumb: {
    width: '100%',
    height: '100%',
  },
});
