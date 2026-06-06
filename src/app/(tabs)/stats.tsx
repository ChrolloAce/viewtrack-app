import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ViewsBreakdown } from '@/components/views-breakdown';
import { ThemedView } from '@/components/themed-view';
import { XpBar } from '@/components/xp-bar';
import { Border, BottomTabInset, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { badgeFor } from '@/lib/badges';
import { useProgress } from '@/lib/use-progress';
import { useStats } from '@/lib/use-stats';
import type { VtVideo } from '@/lib/viewtrack';

type Timeframe = '3d' | '7d' | '14d' | '30d' | 'all';
const TF_OPTIONS: Timeframe[] = ['3d', '7d', '14d', '30d', 'all'];
const TF_DAYS: Record<Timeframe, number> = { '3d': 3, '7d': 7, '14d': 14, '30d': 30, all: Infinity };
const TF_LABEL: Record<Timeframe, string> = {
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
  '14d': 'Last 14 days',
  '30d': 'Last 30 days',
  all: 'All time',
};

const PLATFORM_ICON: Record<string, string> = {
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
  youtube: 'logo-youtube',
};
const PLATFORM_COLOR: Record<string, string> = {
  tiktok: '#000000',
  instagram: '#E1306C',
  youtube: '#FF0000',
};

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function StatsScreen() {
  const isDesktop = useIsDesktop();
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { levelNum, current } = useProgress();
  const { loading, accounts, videos, totalFollowing, totalViews, totalVideos, paidOut, nextPayout, nextPayoutDate, payoutLogs, connected } = useStats();
  const payoutDay = nextPayoutDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const [tf, setTf] = useState<Timeframe>('all');
  const [ddOpen, setDdOpen] = useState(false);

  // Top-performing videos for the chosen timeframe (sorted by views).
  const tfVideos = useMemo(() => {
    const cutoff = tf === 'all' ? 0 : Date.now() - TF_DAYS[tf] * 86400 * 1000;
    return videos
      .filter((v) => tf === 'all' || (v.uploadDate ? new Date(v.uploadDate).getTime() >= cutoff : false))
      .sort((a, b) => b.views - a.views);
  }, [videos, tf]);
  // following is always current; views/videos reflect the timeframe (all-time
  // uses the accurate account aggregates).
  const showViews = tf === 'all' ? totalViews : tfVideos.reduce((s, v) => s + v.views, 0);
  const showVideos = tf === 'all' ? totalVideos : tfVideos.length;

  if (isDesktop) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatarRing, { borderColor: current?.color ?? theme.primary }]}>
                <BrutalAvatar name={profile?.full_name} uri={profile?.avatar_url} size={36} />
              </View>
              <Image source={badgeFor(levelNum).source} style={styles.headerBadge} contentFit="contain" />
            </View>
            <ThemedText style={styles.headerTitle}>profile</ThemedText>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={10}
            style={({ pressed }) => [styles.gear, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.6 }]}>
            <Ionicons name="settings-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Paid out + next payout — each taps into its own breakdown */}
          <View style={styles.payoutRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/payout-breakdown', params: { mode: 'paid' } })}
              style={({ pressed }) => [styles.payoutMini, { backgroundColor: theme.success, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
              <View style={styles.miniTop}>
                <ThemedText style={styles.miniLabel}>paid out</ThemedText>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </View>
              {loading ? (
                <Skeleton width={90} height={34} radius={Radius.sm} style={styles.skelOnPrimary} />
              ) : (
                <ThemedText style={styles.miniValue}>${paidOut.toLocaleString()}</ThemedText>
              )}
              <ThemedText style={styles.miniSub}>
                {payoutLogs.length} {payoutLogs.length === 1 ? 'payment' : 'payments'}
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => router.push({ pathname: '/payout-breakdown', params: { mode: 'next' } })}
              style={({ pressed }) => [styles.payoutMini, { backgroundColor: theme.primary, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
              <View style={styles.miniTop}>
                <ThemedText style={[styles.miniLabel, { color: theme.primaryText }]}>next payout</ThemedText>
                <Ionicons name="chevron-forward" size={14} color={theme.primaryText} />
              </View>
              {loading ? (
                <Skeleton width={80} height={34} radius={Radius.sm} style={styles.skelOnPrimary} />
              ) : (
                <ThemedText style={[styles.miniValue, { color: theme.primaryText }]}>${nextPayout.toLocaleString()}</ThemedText>
              )}
              <ThemedText style={[styles.miniSub, { color: theme.primaryText }]}>by {payoutDay}</ThemedText>
            </Pressable>
          </View>

          {/* Creator level + XP to next */}
          <Pressable
            onPress={() => router.push('/levels')}
            style={({ pressed }) => [styles.levelCard, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
            <Image source={badgeFor(levelNum).source} style={styles.levelBadge} contentFit="contain" />
            <View style={styles.levelInfo}>
              <View style={styles.levelTopRow}>
                <ThemedText style={styles.levelTitle} numberOfLines={1}>
                  Level {levelNum}
                  {current?.title ? ` · ${current.title}` : ''}
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>
              <XpBar height={12} color={current?.color ?? theme.primary} />
            </View>
          </Pressable>

          {/* Top videos header + timeframe dropdown */}
          <View style={styles.sectionHead}>
            <ThemedText style={styles.sectionTitle}>Stats</ThemedText>
            <Pressable
              onPress={() => setDdOpen(true)}
              style={({ pressed }) => [styles.ddBtn, pressed && { opacity: 0.6 }]}>
              <ThemedText style={[styles.ddText, { color: theme.text }]}>{TF_LABEL[tf]}</ThemedText>
              <Ionicons name="chevron-down" size={16} color={theme.primary} />
            </Pressable>
          </View>

          {/* Granular stat cards (respect the timeframe) */}
          <View style={styles.statRow}>
            <StatCard icon="people" label="following" value={connected ? compact(totalFollowing) : '—'} loading={loading} />
            <StatCard icon="eye" label="views" value={connected ? compact(showViews) : '—'} loading={loading} />
            <StatCard icon="videocam" label="videos" value={connected ? `${showVideos}` : '—'} loading={loading} />
          </View>

          {/* Video slider */}
          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={152} height={250} radius={Radius.md} />
              ))}
            </ScrollView>
          ) : tfVideos.length === 0 ? (
            <BrutalCard style={styles.emptyCard}>
              <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                No videos in {TF_LABEL[tf].toLowerCase()}.
              </ThemedText>
            </BrutalCard>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
              {tfVideos.map((v) => (
                <VideoCard key={v.id} video={v} onPress={() => router.push({ pathname: '/video/[id]', params: { id: v.id, v: JSON.stringify(v) } })} />
              ))}
            </ScrollView>
          )}

          {/* views per platform + per-day chart + posting activity (timeframe-aware) */}
          {connected && <ViewsBreakdown accounts={accounts} videos={videos} days={tf === 'all' ? null : TF_DAYS[tf]} />}
        </ScrollView>

        {/* Timeframe picker sheet */}
        <Modal visible={ddOpen} transparent animationType="fade" onRequestClose={() => setDdOpen(false)}>
          <Pressable style={styles.ddBackdrop} onPress={() => setDdOpen(false)}>
            <View style={[styles.ddSheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText style={styles.ddTitle}>Timeframe</ThemedText>
              {TF_OPTIONS.map((t) => {
                const on = t === tf;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setTf(t);
                      setDdOpen(false);
                    }}
                    style={({ pressed }) => [styles.ddOpt, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText style={[styles.ddOptText, on && { color: theme.primary, fontWeight: '900' }]}>{TF_LABEL[t]}</ThemedText>
                    {on && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatCard({ icon, label, value, loading }: { icon: string; label: string; value: string; loading: boolean }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.statCard}>
      <Ionicons name={icon as never} size={18} color={theme.primary} />
      {loading ? <Skeleton width={44} height={24} /> : <ThemedText style={styles.statValue}>{value}</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </BrutalCard>
  );
}

function VideoCard({ video, onPress }: { video: VtVideo; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress ?? (() => video.url && Linking.openURL(video.url))}
      style={({ pressed }) => [styles.videoCard, { borderColor: theme.border }, brutalShadow(theme.shadow, 3), pressed && { opacity: 0.85 }]}>
      <View>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={styles.videoThumb} contentFit="cover" />
        ) : (
          <View style={[styles.videoThumb, styles.videoThumbEmpty, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
          </View>
        )}
        <Ionicons name={PLATFORM_ICON[video.platform] as never} size={22} color="#fff" style={styles.platformBadge} />
      </View>
      <View style={styles.videoMeta}>
        <Ionicons name="eye" size={18} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {compact(video.views)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatarWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { padding: 2, borderRadius: 30, borderWidth: 2.5 },
  headerBadge: { position: 'absolute', bottom: -4, right: -6, width: 24, height: 24 },
  headerTitle: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  gear: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.six },
  payoutRow: { flexDirection: 'row', gap: Spacing.two },
  payoutMini: { flex: 1, gap: 2, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: Border.widthThick, justifyContent: 'center', minHeight: 104 },
  miniTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  miniLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: '#fff', opacity: 0.95 },
  miniValue: { fontSize: 32, lineHeight: 38, fontWeight: '900', color: '#fff' },
  miniSub: { fontSize: 12, fontWeight: '700', opacity: 0.9, color: '#fff' },
  skelOnPrimary: { backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 4 },
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: Border.widthThick },
  levelBadge: { width: 72, height: 72 },
  levelInfo: { flex: 1, gap: Spacing.one },
  levelTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  levelTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  bonusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  bonusChip: { paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1.5 },
  bonusText: { fontSize: 12, fontWeight: '800' },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  statCard: { flex: 1, alignItems: 'flex-start', gap: 2, paddingHorizontal: Spacing.two, minHeight: 78, justifyContent: 'center' },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: Spacing.one },
  ddBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: 3 },
  ddText: { fontSize: 15, fontWeight: '800' },
  ddBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  ddSheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderWidth: Border.widthThick, borderBottomWidth: 0, paddingTop: Spacing.three, paddingBottom: Spacing.six, paddingHorizontal: Spacing.three },
  ddTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', opacity: 0.6, marginBottom: Spacing.one, marginLeft: Spacing.two },
  ddOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.three, paddingHorizontal: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  ddOptText: { fontSize: 17, fontWeight: '700' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.two + 2, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  linkBtnText: { fontSize: 12, fontWeight: '900' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  accPic: { width: 46, height: 46, borderRadius: 23 },
  accTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  accName: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  accFollowers: { alignItems: 'flex-end' },
  accFollowersNum: { fontSize: 17, fontWeight: '900' },
  cancelBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  linkSheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderWidth: Border.widthThick, borderBottomWidth: 0, padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  linkSheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkSheetTitle: { fontSize: 20, fontWeight: '900' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: Spacing.one },
  addRowText: { fontSize: 14, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  slider: { gap: Spacing.three, paddingVertical: Spacing.one, paddingRight: Spacing.three },
  videoCard: { width: 152, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  platformBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  videoThumb: { width: '100%', height: 215 },
  videoThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: Spacing.two },
});
