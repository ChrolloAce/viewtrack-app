import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrutalAvatar } from '@/components/brutal';
import { ChatThread } from '@/components/chat-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function ThreadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name, avatar, type } = useLocalSearchParams<{
    id: string;
    name?: string;
    avatar?: string;
    type?: string;
  }>();
  const isGroup = type === 'group';

  // Mark read on open, on every new message while open, and on unmount — so
  // the unread badge clears live while you're reading and stays cleared.
  useEffect(() => {
    if (!id) return;
    const mark = () => supabase.rpc('mark_read', { p_conversation: id });
    mark();
    const channel = supabase
      .channel(`thread-read:${id}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        () => mark(),
      )
      .subscribe();
    return () => {
      mark();
      supabase.removeChannel(channel);
    };
  }, [id]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
            style={({ pressed }) => [
              styles.back,
              { borderColor: theme.border, backgroundColor: theme.background },
              pressed && { opacity: 0.6 },
            ]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          {isGroup && !avatar ? (
            <View style={[styles.groupAvatar, { backgroundColor: theme.accent }]}>
              <Ionicons name="people" size={20} color="#1A1A1A" />
            </View>
          ) : (
            <BrutalAvatar name={name} uri={avatar || null} size={36} />
          )}
          <ThemedText style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {name ?? 'Conversation'}
          </ThemedText>
          {isGroup && (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/channel-members', params: { id, name: name ?? 'Channel' } })
              }
              style={({ pressed }) => [
                styles.membersBtn,
                { borderColor: theme.border, backgroundColor: theme.background },
                pressed && { opacity: 0.6 },
              ]}>
              <Ionicons name="people" size={20} color={theme.text} />
            </Pressable>
          )}
        </View>

        <ChatThread
          conversationId={id ?? null}
          bottomInset={insets.bottom}
          showSenders={isGroup}
          keyboardOffset={insets.top + 54}
        />
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
    marginRight: Spacing.one,
  },
  groupAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  membersBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: Border.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
