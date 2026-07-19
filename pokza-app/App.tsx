import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Fraunces_400Regular, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PostCard } from './src/components/post/PostCard';
import { LiveHandCreator } from './src/creator/LiveHandCreator';
import { testPost } from './src/data/testHand';
import { colors } from './src/theme/theme';
import type { Post } from './src/types/poker';

export default function App() {
  const [fontsLoaded] = useFonts({ Fraunces_400Regular, Fraunces_600SemiBold });
  const [mode, setMode] = useState<'feed' | 'create'>('feed');
  const [posts, setPosts] = useState<Post[]>([testPost]);

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  if (mode === 'create') {
    return (
      <View style={styles.container}>
        <LiveHandCreator
          onCancel={() => setMode('feed')}
          onCreated={(post) => {
            setPosts((p) => [post, ...p]);
            setMode('feed');
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.createButton} onPress={() => setMode('create')}>
          <Text style={styles.createButtonText}>+ Créer une main</Text>
        </Pressable>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </ScrollView>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  scrollContent: {
    paddingTop: 50,
    paddingBottom: 40,
  },
  createButton: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: colors.action,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
