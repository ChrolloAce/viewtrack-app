import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useUnread } from '@/lib/use-unread';

/** Live count of pending account-link requests (admins only). */
function usePendingRequests(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const sb = supabase as unknown as { from: (t: string) => any };
    const load = async () => {
      const { count: c } = await sb.from('account_links').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      if (active) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel(`pending-links:${enabled}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_links' }, () => load())
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [enabled]);
  return count;
}

type TabMeta = { label: string; icon: string; iconOutline: string };

const TABS: Record<string, TabMeta> = {
  // creators' "stats" screen is now their Profile
  stats: { label: 'profile', icon: 'person-circle', iconOutline: 'person-circle-outline' },
  record: { label: 'record', icon: 'videocam', iconOutline: 'videocam-outline' },
  leaderboard: { label: 'leaderboard', icon: 'trophy', iconOutline: 'trophy-outline' },
  creators: { label: 'creators', icon: 'people', iconOutline: 'people-outline' },
  requests: { label: 'requests', icon: 'download', iconOutline: 'download-outline' },
  chat: { label: 'chat', icon: 'chatbubble-ellipses', iconOutline: 'chatbubble-ellipses-outline' },
  profile: { label: 'profile', icon: 'person', iconOutline: 'person-outline' },
};

// Admins see creators + requests + their own profile tab; creators see
// record + their stats screen (shown as "profile").
const ADMIN_ONLY = new Set(['creators', 'requests', 'profile']);
const CREATOR_ONLY = new Set(['stats', 'record']);

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

function FloatingTabBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { total } = useUnread();
  const { isAdmin } = useAuth();
  const pendingRequests = usePendingRequests(isAdmin);

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || Spacing.three }]} pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          { backgroundColor: theme.card, borderColor: theme.border },
          brutalShadow(theme.shadow, 9),
        ]}>
        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          // Role-gated surfaces.
          if (isAdmin && CREATOR_ONLY.has(route.name)) return null;
          if (!isAdmin && ADMIN_ONLY.has(route.name)) return null;
          const focused = state.index === i;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tab, focused && { backgroundColor: theme.backgroundElement }]}>
              <View>
                <Ionicons
                  name={(focused ? meta.icon : meta.iconOutline) as never}
                  size={23}
                  color={focused ? theme.primary : theme.textSecondary}
                />
                {route.name === 'chat' && total > 0 && (
                  <View style={[styles.tabBadge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                    <ThemedText style={styles.tabBadgeText} numberOfLines={1}>
                      {total > 99 ? '99+' : total}
                    </ThemedText>
                  </View>
                )}
                {route.name === 'requests' && pendingRequests > 0 && (
                  <View style={[styles.tabBadge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                    <ThemedText style={styles.tabBadgeText} numberOfLines={1}>
                      {pendingRequests > 99 ? '99+' : pendingRequests}
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText
                style={[styles.label, { color: focused ? theme.primary : theme.textSecondary }]}>
                {meta.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...(props as unknown as TabBarProps)} />} screenOptions={{ headerShown: false }}>
      {/* index + level are routable but off the tab bar (level lives under profile) */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="level" options={{ href: null }} />
      <Tabs.Screen name="stats" />
      <Tabs.Screen name="record" />
      <Tabs.Screen name="creators" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    borderRadius: Radius.full,
    borderWidth: Border.width,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabBadge: {
    position: 'absolute',
    top: -7,
    right: -9,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { color: '#fff', fontWeight: '900', fontSize: 11, lineHeight: 14, textAlign: 'center' },
});

