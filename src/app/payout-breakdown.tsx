import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { DesktopFrame } from '@/components/desktop-frame';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { usePayouts } from '@/lib/payouts';
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
  const { session } = useAuth();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isOwed = mode === 'owed';
  const { loading, videos, payout, perVideo, bonusUnit, bonusPer } = useStats();
  const { payouts, totalPaid, loading: payLoading } = usePayouts(session?.user?.id ?? null);
  const owed = Math.max(0, payout - totalPaid);

  const videoPay = (v: { views?: number }) => perVideo + Math.floor((v.views ?? 0) / bonusUnit) * bonusPer;

  // Timeframe filter for the earnings breakdown.
  const [tf, setTf] = useState<'all' | '7d' | '30d'>('all');
  const [openPay, setOpenPay] = useState<string | null>(null);
  const since = tf === 'all' ? 0 : Date.now() - (tf === '7d' ? 7 : 30) * 86400000;
  const periodVids = tf === 'all' ? videos : videos.filter((v) => v.uploadDate && new Date(v.uploadDate).getTime() >= since);
  const pBase = periodVids.length * perVideo;
  const pBonusCount = periodVids.reduce((s, v) => s + Math.floor((v.views ?? 0) / bonusUnit), 0);
  const pBonus = pBonusCount * bonusPer;
  const pEarned = pBase + pBonus;
  const periodEarners = [...periodVids].sort((a, b) => videoPay(b) - videoPay(a)).slice(0, 25);
  const tfLabel = tf === 'all' ? 'all time' : tf === '7d' ? 'last 7 days' : 'last 30 days';

  return (
    <DesktopFrame active="payouts">
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/stats'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>{isOwed ? 'owed to you' : 'paid out'}</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Hero */}
          <BrutalCard style={[styles.summary, { backgroundColor: isOwed ? theme.primary : theme.success, borderColor: theme.border }]}>
            <ThemedText style={[styles.sumLabel, { color: '#fff' }]}>{isOwed ? 'outstanding balance' : 'total paid out'}</ThemedText>
            {loading || payLoading ? (
              <Skeleton width={150} height={46} radius={Radius.sm} style={{ backgroundColor: 'rgba(255,255,255,0.35)', marginTop: 4 }} />
            ) : (
              <ThemedText style={[styles.sumValue, { color: '#fff' }]}>${(isOwed ? owed : totalPaid).toLocaleString()}</ThemedText>
            )}
            <ThemedText style={[styles.sumSub, { color: '#fff' }]}>
              {isOwed
                ? `$${payout.toLocaleString()} earned · $${totalPaid.toLocaleString()} paid`
                : `${payouts.length} ${payouts.length === 1 ? 'payment' : 'payments'}`}
            </ThemedText>
          </BrutalCard>

          {isOwed ? (
            <>
              {/* timeframe filter */}
              <View style={styles.tfRow}>
                {(['all', '7d', '30d'] as const).map((t) => {
                  const on = tf === t;
                  return (
                    <Pressable key={t} onPress={() => setTf(t)} style={[styles.tfPill, { borderColor: theme.border }, on && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                      <ThemedText style={[styles.tfText, { color: on ? theme.primaryText : theme.textSecondary }]}>
                        {t === 'all' ? 'All time' : t === '7d' ? '7 days' : '30 days'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <BrutalCard style={styles.lineCard}>
                <View style={styles.line}>
                  <ThemedText style={[styles.lineText, { fontWeight: '900' }]}>Earned · {tfLabel}</ThemedText>
                  <ThemedText style={[styles.lineAmt, { color: theme.primary }]}>${pEarned.toLocaleString()}</ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.line}>
                  <View style={styles.lineLeft}>
                    <Ionicons name="videocam" size={18} color={theme.primary} />
                    <ThemedText style={styles.lineText}>
                      {periodVids.length} videos × ${perVideo}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.lineAmt}>${pBase.toLocaleString()}</ThemedText>
                </View>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.line}>
                  <View style={styles.lineLeft}>
                    <Ionicons name="trophy" size={18} color={theme.primary} />
                    <ThemedText style={styles.lineText}>
                      {pBonusCount} bonuses × ${bonusPer}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.lineAmt}>${pBonus.toLocaleString()}</ThemedText>
                </View>
                {tf === 'all' && (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.line}>
                      <View style={styles.lineLeft}>
                        <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                        <ThemedText style={styles.lineText}>already paid out</ThemedText>
                      </View>
                      <ThemedText style={[styles.lineAmt, { color: theme.success }]}>−${totalPaid.toLocaleString()}</ThemedText>
                    </View>
                  </>
                )}
              </BrutalCard>

              <ThemedText style={styles.sectionTitle}>{tf === 'all' ? 'top earners' : `posted · ${tfLabel}`}</ThemedText>
              {loading ? (
                <View style={{ gap: Spacing.two }}>
                  <Skeleton height={86} radius={Radius.md} />
                  <Skeleton height={86} radius={Radius.md} />
                </View>
              ) : periodEarners.length === 0 ? (
                <BrutalCard style={styles.empty}>
                  <Ionicons name="cloud-upload-outline" size={28} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                    No posts in this period.
                  </ThemedText>
                </BrutalCard>
              ) : (
                periodEarners.map((v) => (
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
                    <ThemedText style={[styles.vAmt, { color: theme.primary }]}>+${videoPay(v)}</ThemedText>
                  </Pressable>
                ))
              )}
            </>
          ) : (
            <>
              <ThemedText style={styles.sectionTitle}>payment history</ThemedText>
              {payLoading ? (
                <View style={{ gap: Spacing.two }}>
                  <Skeleton height={72} radius={Radius.md} />
                  <Skeleton height={72} radius={Radius.md} />
                </View>
              ) : payouts.length === 0 ? (
                <BrutalCard style={styles.empty}>
                  <Ionicons name="receipt-outline" size={28} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                    No payments yet — they'll show here the moment you get paid.
                  </ThemedText>
                </BrutalCard>
              ) : (
                payouts.map((p) => {
                  const d = new Date(p.created_at);
                  const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  const open = openPay === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setOpenPay(open ? null : p.id)}
                      style={[styles.logRow, styles.logCol, { backgroundColor: theme.card, borderColor: open ? theme.success : theme.border }]}>
                      <View style={styles.logTop}>
                        <View style={[styles.logIcon, { backgroundColor: theme.success }]}>
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.logTitle}>Paid {dateStr}</ThemedText>
                          {!open && !!p.note && (
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                              {p.note}
                            </ThemedText>
                          )}
                        </View>
                        <ThemedText style={[styles.logAmt, { color: theme.success }]}>+${Number(p.amount).toLocaleString()}</ThemedText>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
                      </View>
                      {open && (
                        <View style={[styles.logDetail, { borderTopColor: theme.border }]}>
                          <View style={styles.line}>
                            <ThemedText type="small" themeColor="textSecondary">Amount</ThemedText>
                            <ThemedText type="smallBold">${Number(p.amount).toLocaleString()}</ThemedText>
                          </View>
                          <View style={styles.line}>
                            <ThemedText type="small" themeColor="textSecondary">Date</ThemedText>
                            <ThemedText type="smallBold">{d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</ThemedText>
                          </View>
                          <View style={styles.line}>
                            <ThemedText type="small" themeColor="textSecondary">Note</ThemedText>
                            <ThemedText type="smallBold">{p.note || '—'}</ThemedText>
                          </View>
                          <View style={styles.line}>
                            <ThemedText type="small" themeColor="textSecondary">Method</ThemedText>
                            <ThemedText type="smallBold">Recorded by admin</ThemedText>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
    </DesktopFrame>
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
  tfRow: { flexDirection: 'row', gap: Spacing.two },
  tfPill: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: Border.width },
  tfText: { fontSize: 13, fontWeight: '800' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  logCol: { flexDirection: 'column', alignItems: 'stretch', gap: Spacing.two },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  logDetail: { gap: Spacing.one + 2, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  logIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontSize: 15, fontWeight: '800' },
  logAmt: { fontSize: 17, fontWeight: '900' },
});
