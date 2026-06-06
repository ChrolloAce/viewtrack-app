import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { pickImages, uploadLocalImage } from '@/lib/chat-media';
import { supabase } from '@/lib/supabase';

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Member = { profile_id: string; role: string; profile: Profile | null };

export default function ChannelMembersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { session, isAdmin } = useAuth();
  const userId = session?.user?.id ?? null;
  const [members, setMembers] = useState<Member[]>([]);
  const [creators, setCreators] = useState<Profile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: m } = await supabase
      .from('conversation_participants')
      .select('profile_id, role, profile:profiles!conversation_participants_profile_id_fkey(id, full_name, avatar_url)')
      .eq('conversation_id', id);
    setMembers((m as unknown as Member[]) ?? []);
    const { data: c } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('role', 'creator')
      .order('full_name');
    setCreators((c as Profile[]) ?? []);
    const { data: conv } = await supabase.from('conversations').select('cover_url').eq('id', id).single();
    setCover(conv?.cover_url ?? null);
  }, [id]);

  async function changeCover() {
    if (!userId) return;
    try {
      const uris = await pickImages();
      if (!uris.length) return;
      setCoverBusy(true);
      const url = await uploadLocalImage(userId, uris[0]);
      await supabase.from('conversations').update({ cover_url: url }).eq('id', id);
      setCover(url);
    } catch {
      // ignore
    } finally {
      setCoverBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  const memberIds = new Set(members.map((m) => m.profile_id));
  const addable = creators.filter((c) => !memberIds.has(c.id));

  async function add(pid: string) {
    setBusy(pid);
    await supabase.rpc('add_member', { p_conversation: id, p_profile: pid });
    await load();
    setBusy(null);
  }
  async function remove(pid: string) {
    setBusy(pid);
    await supabase.rpc('remove_member', { p_conversation: id, p_profile: pid });
    await load();
    setBusy(null);
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
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {name ?? 'Channel'}
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={changeCover} disabled={coverBusy || !isAdmin} style={styles.coverPick}>
            {cover ? (
              <Image source={{ uri: cover }} style={[styles.cover, { borderColor: theme.border }]} contentFit="cover" />
            ) : (
              <View style={[styles.cover, { backgroundColor: theme.accent, borderColor: theme.border }]}>
                <Ionicons name="people" size={30} color="#1A1A1A" />
              </View>
            )}
            {isAdmin && (
              <View style={[styles.coverBadge, { backgroundColor: theme.primary, borderColor: theme.background }]}>
                {coverBusy ? (
                  <ActivityIndicator size="small" color={theme.primaryText} />
                ) : (
                  <Ionicons name="camera" size={15} color={theme.primaryText} />
                )}
              </View>
            )}
          </Pressable>

          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
            MEMBERS ({members.length})
          </ThemedText>
          {members.map((m) => (
            <View key={m.profile_id} style={[styles.row, { borderColor: theme.border }]}>
              <BrutalAvatar name={m.profile?.full_name} uri={m.profile?.avatar_url} size={42} />
              <View style={styles.rowText}>
                <ThemedText style={styles.name} numberOfLines={1}>
                  {m.profile?.full_name ?? 'Unknown'}
                </ThemedText>
                {m.role === 'owner' && (
                  <ThemedText type="small" themeColor="textSecondary">
                    owner
                  </ThemedText>
                )}
              </View>
              {isAdmin &&
                m.role !== 'owner' &&
                (busy === m.profile_id ? (
                  <ActivityIndicator size="small" color={theme.danger} />
                ) : (
                  <Pressable onPress={() => remove(m.profile_id)} hitSlop={8}>
                    <Ionicons name="remove-circle" size={26} color={theme.danger} />
                  </Pressable>
                ))}
            </View>
          ))}

          {isAdmin && addable.length > 0 && (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
                ADD CREATORS
              </ThemedText>
              {addable.map((c) => (
                <View key={c.id} style={[styles.row, { borderColor: theme.border }]}>
                  <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={42} />
                  <ThemedText style={[styles.name, styles.rowText]} numberOfLines={1}>
                    {c.full_name ?? 'Unknown'}
                  </ThemedText>
                  {busy === c.id ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Pressable onPress={() => add(c.id)} hitSlop={8}>
                      <Ionicons name="add-circle" size={26} color={theme.primary} />
                    </Pressable>
                  )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
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
  headerTitle: { flex: 1, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  content: { padding: Spacing.three, gap: Spacing.two },
  coverPick: { alignSelf: 'center', marginVertical: Spacing.two },
  cover: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
  section: { letterSpacing: 0.5, marginTop: Spacing.two, marginBottom: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700' },
});
