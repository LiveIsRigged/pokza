import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { fetchFriends, type Friend } from '../data/friends';

interface FriendsListScreenProps {
  userId: string;
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
}

export function FriendsListScreen({ userId, onBack, onSelectProfile }: FriendsListScreenProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFriends(userId)
      .then((data) => {
        if (!cancelled) {
          setFriends(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Mes amis{friends.length > 0 ? ` · ${friends.length}` : ''}</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.action} />
        ) : friends.length === 0 ? (
          <Text style={styles.statusText}>
            Tu n'as pas encore d'amis. Ajoute-les depuis « Ajouter des amis ».
          </Text>
        ) : (
          friends.map((friend) => (
            <Pressable key={friend.id} style={styles.friendRow} onPress={() => onSelectProfile(friend.id)}>
              <Avatar url={friend.avatarUrl} name={friend.displayName} size={40} />
              <Text style={styles.friendPseudo}>{friend.displayName}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  loader: {
    marginTop: 24,
  },
  statusText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  friendPseudo: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
