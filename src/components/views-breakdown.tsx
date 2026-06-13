import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VtAccount, VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Per-platform views + views-per-day chart + posting activity for a window.
 * `days` is the selected timeframe (null = all time → uses a 30-day window for
 * the chart/grid and all-time account totals for platform views).
 */
export function ViewsBreakdown({ accounts, videos, days, profileId }: { accounts: VtAccount[]; videos: VtVideo[]; days: number | null; profileId?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const openDay = (key: string, span = 1) =>
    router.push({ pathname: '/day/[date]', params: { date: key, span: String(span), ...(profileId ? { profileId } : {}) } });
  const allTime = days === null;
  const windowDays = days ?? 30;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - (windowDays - 1));
  const winStartTs = windowStart.getTime();

  // first post ever (earliest we have) — days before this aren't "missed"
  const firstPostTs = videos.reduce(
    (min, v) => (v.uploadDate ? Math.min(min, new Date(v.uploadDate).getTime()) : min),
    Infinity,
  );

  // views per platform (windowed for a timeframe, all-time totals for "all")
  const winViews = (p: string) =>
    videos
      .filter((v) => v.platform === p && v.uploadDate && new Date(v.uploadDate).getTime() >= winStartTs)
      .reduce((s, v) => s + (v.views ?? 0), 0);
  const platformViews = ['instagram', 'tiktok', 'youtube']
    .filter((p) => accounts.some((a) => a.platform === p))
    .map((p) => ({
      platform: p,
      views: allTime ? accounts.filter((a) => a.platform === p).reduce((s, a) => s + (a.totalViews ?? 0), 0) : winViews(p),
    }));

  // daily buckets — drive the posting-activity grid + "missed" days
  const dayBucket = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (windowDays - 1 - i));
    return { date: d, key: ymd(d), views: 0, posted: false };
  });
  videos.forEach((v) => {
    if (!v.uploadDate) return;
    const k = ymd(new Date(v.uploadDate));
    const b = dayBucket.find((x) => x.key === k);
    if (b) {
      b.views += v.views ?? 0;
      b.posted = true;
    }
  });

  const before = (ts: number) => firstPostTs !== Infinity && ts < firstPostTs;
  const missed = dayBucket.filter((d) => !d.posted && !before(d.date.getTime()) && d.date.getTime() <= todayTs);

  // Chart buckets: daily for short windows, weekly for long ones — so the
  // x-axis labels stay coherent (dated weeks) instead of a wall of thin bars.
  const bucketSize = windowDays <= 14 ? 1 : 7;
  const chartCount = Math.ceil(windowDays / bucketSize);
  const chartBucket = Array.from({ length: chartCount }, (_, i) => {
    const startD = new Date(today);
    startD.setDate(today.getDate() - (windowDays - 1) + i * bucketSize);
    return { date: startD, key: ymd(startD), views: 0, posted: false };
  });
  dayBucket.forEach((db, di) => {
    const cb = chartBucket[Math.floor(di / bucketSize)];
    if (cb) {
      cb.views += db.views;
      if (db.posted) cb.posted = true;
    }
  });
  const maxDayViews = Math.max(1, ...chartBucket.map((d) => d.views));
  const chartTitle = bucketSize === 1 ? 'views per day' : 'views per week';

  const label = (d: Date, i: number) => {
    if (bucketSize > 1) return `${d.getMonth() + 1}/${d.getDate()}`;
    if (windowDays <= 8) return WD[d.getDay()];
    const step = Math.ceil(chartCount / 6);
    return i === chartCount - 1 || i % step === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '';
  };

  return (
    <>
      {platformViews.length > 0 && (
        <View style={styles.platRow}>
          {platformViews.map((p) => (
            <BrutalCard key={p.platform} style={styles.platCard} shadow={3}>
              <Ionicons name={PLATFORM_ICON[p.platform] as never} size={20} color={PLATFORM_COLOR[p.platform] ?? theme.text} />
              <ThemedText style={styles.platViews}>{compact(p.views)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {p.platform} views · {allTime ? 'all time' : `last ${windowDays}d`}
              </ThemedText>
            </BrutalCard>
          ))}
        </View>
      )}

      <BrutalCard style={styles.card}>
        <ThemedText style={styles.cardTitle}>{chartTitle} · peak {compact(maxDayViews)}</ThemedText>
        <View style={styles.chart}>
          {chartBucket.map((d, i) => (
            <Pressable
              key={d.key}
              onPress={() => openDay(d.key, bucketSize)}
              disabled={!d.posted}
              style={({ pressed }) => [styles.chartCol, pressed && { opacity: 0.6 }]}
              hitSlop={4}>
              <View style={[styles.bar, { height: Math.max(3, (d.views / maxDayViews) * 110), backgroundColor: d.views > 0 ? theme.primary : theme.backgroundElement }]} />
              <ThemedText style={[styles.chartLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                {label(d.date, i)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </BrutalCard>

      <BrutalCard style={styles.card}>
        <View style={styles.cardHead}>
          <ThemedText style={styles.cardTitle}>posting activity · {windowDays} days</ThemedText>
          <View style={[styles.missPill, { backgroundColor: missed.length === 0 ? theme.success : theme.accent }]}>
            <ThemedText style={styles.missText}>{missed.length === 0 ? 'no misses' : `${missed.length} missed`}</ThemedText>
          </View>
        </View>
        <View style={styles.squares}>
          {dayBucket.map((d) => {
            const isBefore = before(d.date.getTime());
            const bg = d.posted ? theme.success : isBefore ? 'transparent' : theme.backgroundElement;
            return (
              <Pressable
                key={d.key}
                onPress={() => openDay(d.key)}
                disabled={!d.posted}
                style={({ pressed }) => [styles.square, { backgroundColor: bg, borderColor: theme.border, opacity: isBefore ? 0.4 : pressed ? 0.6 : 1 }]}
              />
            );
          })}
        </View>
        {missed.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Missed: {missed.map((d) => `${WD[d.date.getDay()]} ${d.date.getDate()}`).join(', ')}
          </ThemedText>
        )}
      </BrutalCard>
    </>
  );
}

const styles = StyleSheet.create({
  platRow: { flexDirection: 'row', gap: Spacing.two },
  platCard: { flex: 1, alignItems: 'flex-start', gap: 2, paddingHorizontal: Spacing.two + 2, minHeight: 78, justifyContent: 'center' },
  platViews: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  card: { gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 132, gap: 2, marginTop: Spacing.one },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  bar: { width: '78%', borderRadius: 3, minHeight: 3 },
  chartLabel: { fontSize: 10, fontWeight: '700' },
  missPill: { paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full },
  missText: { fontSize: 11, fontWeight: '900', color: '#1A1A1A' },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  square: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5 },
});
