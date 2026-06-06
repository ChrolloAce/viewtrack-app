import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalButton, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { pickImages, uploadLocalImage } from '@/lib/chat-media';
import { supabase } from '@/lib/supabase';

type Creator = { id: string; full_name: string | null; avatar_url: string | null };

export default function NewChannelScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [title, setTitle] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  async function pickCover() {
    try {
      const uris = await pickImages();
      if (uris.length) setCoverUri(uris[0]);
    } catch {
      // cancelled / no permission
    }
  }

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('role', 'creator')
      .order('full_name')
      .then(({ data }) => setCreators((data as Creator[]) ?? []));
  }, []);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    const { data } = await supabase.rpc('create_group', {
      p_title: title.trim(),
      p_members: [...selected],
    });
    if (data && coverUri && userId) {
      try {
        const url = await uploadLocalImage(userId, coverUri);
        await supabase.from('conversations').update({ cover_url: url }).eq('id', data.id);
      } catch {
        // cover optional — ignore upload failures
      }
    }
    setCreating(false);
    if (data) {
      router.replace({ pathname: '/thread/[id]', params: { id: data.id, name: title.trim() } });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>new channel</ThemedText>
        </View>

        <View style={styles.form}>
          <Pressable onPress={pickCover} style={styles.coverPick}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={[styles.cover, { borderColor: theme.border }]} contentFit="cover" />
            ) : (
              <View style={[styles.cover, { backgroundColor: theme.accent, borderColor: theme.border }]}>
                <Ionicons name="image" size={28} color="#1A1A1A" />
              </View>
            )}
            <View style={[styles.coverBadge, { backgroundColor: theme.primary, borderColor: theme.background }]}>
              <Ionicons name={coverUri ? 'pencil' : 'add'} size={14} color={theme.primaryText} />
            </View>
          </Pressable>
          <BrutalInput placeholder="Channel name" value={title} onChangeText={setTitle} />
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
            ADD CREATORS ({selected.size})
          </ThemedText>
        </View>

        <FlatList
          data={creators}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const on = selected.has(item.id);
            return (
              <Pressable
                onPress={() => toggle(item.id)}
                style={[
                  styles.row,
                  { borderColor: theme.border, backgroundColor: on ? theme.primaryMuted : theme.card },
                ]}>
                <BrutalAvatar name={item.full_name} uri={item.avatar_url} size={42} />
                <ThemedText style={styles.name} numberOfLines={1}>
                  {item.full_name ?? 'Unknown'}
                </ThemedText>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={on ? theme.primary : theme.textSecondary}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              No creators yet.
            </ThemedText>
          }
        />

        <View style={styles.footer}>
          <BrutalButton
            label={creating ? 'creating…' : 'create channel'}
            onPress={create}
            loading={creating}
            disabled={!title.trim()}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: Border.width,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: Border.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  form: { padding: Spacing.three, gap: Spacing.two },
  coverPick: { alignSelf: 'center', marginBottom: Spacing.two },
  cover: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: Border.widthThick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { letterSpacing: 0.5, marginTop: Spacing.one },
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  name: { flex: 1, fontSize: 16, fontWeight: '700' },
  empty: { textAlign: 'center', padding: Spacing.four },
  footer: { padding: Spacing.three },
});
