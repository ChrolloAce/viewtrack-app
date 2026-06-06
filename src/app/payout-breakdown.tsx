import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStats } from '@/lib/use-stats';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function PayoutBreakdown() {
  const theme = useTheme();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isNext = mode === 'next';
  const {
    loading,
    paidOut,
    nextPayout,
    nextPayoutDate,
    payoutLogs,
    currentPeriodVideos,
    perVideo,
    bonusUnit,
    bonusPer,
  } = useStats();

  const payoutDay = nextPayoutDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  // Current-period line items (for the "next payout" view).
  const periodVideoPart = currentPeriodVideos.length * perVideo;
  const periodBonusPart = currentPeriodVideos.reduce((s, v) => s + Math.floor((v.views ?? 0) / bonusUnit) * bonusPer, 0);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/stats'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>{isNext ? 'next payout' : 'paid out'}</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Hero */}
          <BrutalCard style={[styles.summary, { backgroundColor: isNext ? theme.primary : theme.success, borderColor: theme.border }]}>
            <ThemedText style={[styles.sumLabel, { color: '#fff' }]}>{isNext ? 'pays this period' : 'total paid out'}</ThemedText>
            {loading ? (
              <Skeleton width={150} height={46} radius={Radius.sm} style={{ backgroundColor: 'rgba(255,255,255,0.35)', marginTop: 4 }} />
            ) : (
              <ThemedText style={[styles.sumValue, { color: '#fff' }]}>${(isNext ? nextPayout : paidOut).toLocaleString()}</ThemedText>
            )}
            {isNext && <ThemedText style={[styles.sumSub, { color: '#fff' }]}>pays by {payoutDay}</ThemedText>}
            {!isNext && (
              <ThemedText style={[styles.sumSub, { color: '#fff' }]}>
                {payoutLogs.length} {payoutLogs.length === 1 ? 'weekly payment' : 'weekly payments'} settled
              </ThemedText>
            )}
          </BrutalCard>

          {isNext ? (
            <>
              <BrutalCard style={styles.lineCard}>
                <View style={styles.line}>
                  <View style={styles.lineLeft}>
                    <Ionicons name="videocam" size={18} color={theme.primary} />
                    <ThemedText style={styles.lineText}>
                      {currentPeriodVideos.length} videos × ${perVideo}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.lineAmt}>${periodVideoPart.toLocaleString()}</ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.line}>
                  <View style={styles.lineLeft}>
                    <Ionicons name="trophy" size={18} color={theme.primary} />
                    <ThemedText style={styles.lineText}>100k view bonuses (${bonusPer}/100k)</ThemedText>
                  </View>
                  <ThemedText style={styles.lineAmt}>${periodBonusPart.toLocaleString()}</ThemedText>
                </View>
              </BrutalCard>

              <ThemedText style={styles.sectionTitle}>posted this period</ThemedText>
              {loading ? (
                <View style={{ gap: Spacing.two }}>
                  <Skeleton height={86} radius={Radius.md} />
                  <Skeleton height={86} radius={Radius.md} />
                </View>
              ) : currentPeriodVideos.length === 0 ? (
                <BrutalCard style={styles.empty}>
                  <Ionicons name="cloud-upload-outline" size={28} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                    No posts yet this period — post to start earning toward {payoutDay}.
                  </ThemedText>
                </BrutalCard>
              ) : (
                currentPeriodVideos.map((v) => {
                  const amount = perVideo + Math.floor((v.views ?? 0) / bonusUnit) * bonusPer;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => router.push({ pathname: '/video/[id]', params: { id: v.id, v: JSON.stringify(v) } })}
                      style={({ pressed }) => [styles.vRow, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
                      <View>
                        {v.thumbnail ? (
                          <Image source={{ uri: v.thumbnail }} style={styles.vThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.vThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="film-outline" size={20} color={theme.textSecondary} />
                          </View>
                        )}
                        <View style={[styles.vBadge, { backgroundColor: '#fff', borderColor: theme.border }]}>
                          <Ionicons name={PLATFORM_ICON[v.platform] as never} size={12} color={PLATFORM_COLOR[v.platform] ?? theme.text} />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.vTitle} numberOfLines={1}>
                          @{v.accountUsername || 'video'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {compact(v.views)} views
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.vAmt, { color: theme.primary }]}>+${amount}</ThemedText>
                    </Pressable>
                  );
                })
              )}
            </>
          ) : (
            <>
              <ThemedText style={styles.sectionTitle}>payment log</ThemedText>
              {loading ? (
                <View style={{ gap: Spacing.two }}>
                  <Skeleton height={72} radius={Radius.md} />
                  <Skeleton height={72} radius={Radius.md} />
                  <Skeleton height={72} radius={Radius.md} />
                </View>
              ) : payoutLogs.length === 0 ? (
                <BrutalCard style={styles.empty}>
                  <Ionicons name="receipt-outline" size={28} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                    No payments yet — your first weekly payout lands once a period closes.
                  </ThemedText>
                </BrutalCard>
              ) : (
                payoutLogs.map((log) => {
                  const dateStr = log.paidDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                  const weekStr = log.periodStart.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  return (
                    <View
                      key={log.paidDate.getTime()}
                      style={[styles.logRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={[styles.logIcon, { backgroundColor: theme.success }]}>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.logTitle}>Paid {dateStr}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          week of {weekStr} · {log.videoCount} {log.videoCount === 1 ? 'video' : 'videos'}
                        </ThemedText>
                      </View>
                      <ThemedText style={[styles.logAmt, { color: theme.success }]}>+${log.amount.toLocaleString()}</ThemedText>
                    </View>
                  );
                })
              )}
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
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  summary: { alignItems: 'center', gap: 2, paddingVertical: Spacing.four },
  sumLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', opacity: 0.9 },
  sumValue: { fontSize: 44, lineHeight: 50, fontWeight: '900' },
  sumSub: { fontSize: 13, fontWeight: '700', opacity: 0.9, marginTop: 2 },
  lineCard: { gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 },
  lineText: { fontSize: 15, fontWeight: '700' },
  lineAmt: { fontSize: 16, fontWeight: '900' },
  divider: { height: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: Spacing.one },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  vRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  vThumb: { width: 54, height: 70, borderRadius: Radius.sm },
  vBadge: { position: 'absolute', top: -5, right: -5, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vTitle: { fontSize: 15, fontWeight: '800' },
  vAmt: { fontSize: 17, fontWeight: '900' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  logIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: 15, fontWeight: '800' },
  logAmt: { fontSize: 17, fontWeight: '900' },
});
