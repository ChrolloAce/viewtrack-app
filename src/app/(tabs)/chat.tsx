import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, BottomTabInset, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useInbox, type InboxItem } from '@/lib/use-inbox';
import { useUnread } from '@/lib/use-unread';

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ChatTab() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  return <Inbox />;
}

function Inbox() {
  const theme = useTheme();
  const router = useRouter();
  const { isAdmin, session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { items, loading, reload } = useInbox();
  const { map: unread } = useUnread();
  const [banner, setBanner] = useState<string | null>(null);
  const [agent, setAgent] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

  // Make sure a creator always has their support thread.
  useEffect(() => {
    if (!isAdmin && userId) {
      supabase.rpc('get_or_create_conversation', {}).then(() => reload());
    }
  }, [isAdmin, userId, reload]);

  // The admin a creator is chatting with (so the support thread shows a name).
  useEffect(() => {
    if (isAdmin) return;
    (supabase.rpc as unknown as (fn: string) => Promise<{ data: { full_name: string | null; avatar_url: string | null }[] | null }>)(
      'support_agent',
    ).then(({ data }) => setAgent(data?.[0] ?? null));
  }, [isAdmin]);

  // Admins get a live "someone joined" banner.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel(`join-feed:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'join_events' },
        async (payload) => {
          const profileId = (payload.new as { profile_id: string }).profile_id;
          const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).single();
          setBanner(`🟢 ${data?.full_name ?? 'Someone'} just joined`);
          setTimeout(() => setBanner(null), 6000);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  function describe(item: InboxItem) {
    if (item.type === 'group') {
      return { name: item.title ?? 'Channel', kind: 'group' as const, avatar: item.cover_url };
    }
    // A direct thread: if I'm the customer, this is my chat with the admin.
    if (item.customer?.id === userId) {
      return { name: agent?.full_name || 'Support', kind: 'support' as const, avatar: agent?.avatar_url ?? null };
    }
    return {
      name: item.customer?.full_name ?? 'Unknown creator',
      kind: 'person' as const,
      avatar: item.customer?.avatar_url ?? null,
    };
  }

  // WhatsApp-style last-message preview.
  function preview(item: InboxItem): string {
    let text = item.last_body?.trim() ?? '';
    if (!text && item.last_attachment) {
      text = item.last_attachment.startsWith('audio') ? '🎤 Voice message' : '📷 Photo';
    }
    if (!text) return item.subject ?? 'No messages yet';
    // In groups, prefix the sender like WhatsApp ("You:" / "~Name:").
    if (item.type === 'group' && item.last_sender_id) {
      const who = item.last_sender_id === userId ? 'You' : item.last_sender_name?.split(' ')[0] ?? '';
      if (who) return `${who}: ${text}`;
    }
    return text;
  }

  const renderItem = ({ item }: { item: InboxItem }) => {
    const d = describe(item);
    const count = unread[item.id] ?? 0;
    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/thread/[id]',
            params: { id: item.id, name: d.name, avatar: d.avatar ?? '', type: item.type },
          })
        }
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
        {d.kind === 'group' ? (
          d.avatar ? (
            <BrutalAvatar name={d.name} uri={d.avatar} size={54} />
          ) : (
            <View style={[styles.iconAvatar, { backgroundColor: theme.accent }]}>
              <Ionicons name="people" size={26} color="#1A1A1A" />
            </View>
          )
        ) : (
          <BrutalAvatar name={d.name} uri={d.avatar} size={54} />
        )}
        <View style={[styles.rowBody, { borderBottomColor: theme.border }]}>
          <View style={styles.rowTop}>
            <ThemedText style={styles.rowName} numberOfLines={1}>
              {d.name}
            </ThemedText>
            <ThemedText style={[styles.rowTime, { color: count > 0 ? theme.primary : theme.textSecondary }]}>
              {ago(item.last_message_at)}
            </ThemedText>
          </View>
          <View style={styles.rowBottom}>
            <ThemedText
              style={[styles.rowPreview, { color: theme.textSecondary }, count > 0 && { color: theme.text, fontWeight: '600' }]}
              numberOfLines={1}>
              {preview(item)}
            </ThemedText>
            {count > 0 && (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <ThemedText style={styles.badgeText}>{count > 99 ? '99+' : count}</ThemedText>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>{isAdmin ? 'community' : 'chats'}</ThemedText>
          {isAdmin && (
            <Pressable
              onPress={() => router.push('/new-channel')}
              style={({ pressed }) => [
                styles.newBtn,
                { backgroundColor: theme.primary, borderColor: theme.border },
                brutalShadow(theme.shadow, 3),
                pressed && { transform: [{ scale: 0.95 }] },
              ]}>
              <Ionicons name="add" size={24} color={theme.primaryText} />
            </Pressable>
          )}
        </View>

        {banner && (
          <View style={[styles.banner, { backgroundColor: theme.accent, borderColor: theme.border }]}>
            <ThemedText style={styles.bannerText}>{banner}</ThemedText>
          </View>
        )}

        {loading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.center}>
                <ThemedText type="small" themeColor="textSecondary">
                  No conversations yet.
                </ThemedText>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.six },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  headerTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  newBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: Border.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderWidth: Border.width,
    borderRadius: Radius.sm,
  },
  bannerText: { fontWeight: '800', color: '#0A0A0A' },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.three,
  },
  // Sleek WhatsApp-style flat row: avatar + (name/time over preview/badge),
  // divider runs from after the avatar to the edge.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingLeft: Spacing.three,
  },
  iconAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    paddingVertical: Spacing.three - 2,
    paddingRight: Spacing.three,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowName: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  rowTime: { fontSize: 12, fontWeight: '600' },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowPreview: { flex: 1, fontSize: 14, lineHeight: 19 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
