import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrutalAvatar } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Section = 'home' | 'record' | 'chat' | 'creators' | 'videos' | 'clicks' | 'requests' | 'leaderboard' | 'payouts' | 'reports' | 'profile';

const DIVIDER = 'rgba(0,0,0,0.08)';

type RailProfile = { full_name: string | null; avatar_url: string | null } | null;

/** The persistent left navigation rail. Pure/presentational — the parent owns
 *  which section is active and what happens on select, so the same rail works
 *  inside the desktop shell (section state) and around detail screens (routing). */
export function DesktopRail({
  active,
  onSelect,
  isAdmin,
  profile,
  pending = 0,
}: {
  active: Section | null;
  onSelect: (s: Section) => void;
  isAdmin: boolean;
  profile: RailProfile;
  pending?: number;
}) {
  const theme = useTheme();

  const items: { key: Section; icon: string; label: string; badge?: number }[] = isAdmin
    ? [
        { key: 'chat', icon: 'chatbubble-ellipses', label: 'Community' },
        { key: 'creators', icon: 'people', label: 'Creators' },
        { key: 'videos', icon: 'film', label: 'Videos' },
        { key: 'clicks', icon: 'link', label: 'Link Clicks' },
        { key: 'payouts', icon: 'cash', label: 'Payouts' },
        { key: 'requests', icon: 'download', label: 'Requests', badge: pending },
        { key: 'reports', icon: 'flag', label: 'Reports' },
        { key: 'leaderboard', icon: 'trophy', label: 'Leaderboard' },
      ]
    : [
        { key: 'home', icon: 'grid', label: 'Home' },
        { key: 'record', icon: 'videocam', label: 'Record' },
        { key: 'chat', icon: 'chatbubble-ellipses', label: 'Chats' },
        { key: 'leaderboard', icon: 'trophy', label: 'Leaderboard' },
      ];

  return (
    <View style={[styles.rail, { backgroundColor: theme.card, borderRightColor: DIVIDER }]}>
      <View style={styles.railBrand}>
        <Image source={require('../../assets/images/app-logo.png')} style={styles.railLogo} contentFit="contain" />
        <ThemedText style={styles.railBrandText}>ViewTrack</ThemedText>
      </View>

      <ThemedText style={styles.railSection}>MENU</ThemedText>
      <View style={styles.railItems}>
        {items.map((it) => {
          const on = active === it.key;
          return (
            <Pressable
              key={it.key}
              onPress={() => onSelect(it.key)}
              style={({ pressed }) => [styles.railBtn, on && { backgroundColor: theme.primaryMuted }, pressed && !on && { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name={(on ? it.icon : `${it.icon}-outline`) as never} size={20} color={on ? theme.primary : theme.textSecondary} />
              <ThemedText style={[styles.railLabel, { color: on ? theme.primary : theme.text }]} numberOfLines={1}>
                {it.label}
              </ThemedText>
              {!!it.badge && it.badge > 0 && (
                <View style={[styles.railBadge, { backgroundColor: theme.danger }]}>
                  <ThemedText style={styles.railBadgeText}>{it.badge > 99 ? '99+' : it.badge}</ThemedText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => onSelect('profile')}
        style={({ pressed }) => [
          styles.railUser,
          { borderTopColor: DIVIDER },
          active === 'profile' && { backgroundColor: theme.primaryMuted },
          pressed && active !== 'profile' && { backgroundColor: theme.backgroundElement },
        ]}>
        <BrutalAvatar name={profile?.full_name} uri={profile?.avatar_url} size={36} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.railUserName} numberOfLines={1}>
            {profile?.full_name || 'Profile'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {isAdmin ? 'Admin' : 'Creator'}
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 232, borderRightWidth: 1, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three },
  railBrand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, marginBottom: Spacing.four },
  railLogo: { width: 38, height: 38, borderRadius: Radius.md },
  railBrandText: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  railSection: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, opacity: 0.4, marginLeft: Spacing.two, marginBottom: Spacing.one },
  railItems: { gap: 4 },
  railBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 44, paddingHorizontal: Spacing.two + 2, borderRadius: Radius.md },
  railLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  railBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  railBadgeText: { color: '#fff', fontWeight: '900', fontSize: 11, lineHeight: 14 },
  railUser: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 'auto', padding: Spacing.two, borderRadius: Radius.md, borderTopWidth: 1 },
  railUserName: { fontSize: 14, fontWeight: '800' },
});
