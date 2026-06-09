import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Dropdown } from '@/components/dropdown';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { vtCreatorLeaderboard, type CreatorRank } from '@/lib/viewtrack';

type Timeframe = '7d' | '30d' | 'all';
const TF: { key: Timeframe; label: string; days: number | null }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All time', days: null },
];

type Sort = 'views' | 'posts' | 'avg' | 'recent';
const SORTS: { key: Sort; label: string; icon: string }[] = [
  { key: 'views', label: 'Top views', icon: 'eye' },
  { key: 'posts', label: 'Most posts', icon: 'albums' },
  { key: 'avg', label: 'Best avg', icon: 'trending-up' },
  { key: 'recent', label: 'Recently active', icon: 'time' },
];
const MEDAL: Record<number, string> = { 1: '#FFD43B', 2: '#CBD5E1', 3: '#E0995E' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function ago(ts: number) {
  if (!ts) return 'no posts';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CreatorLeaderboard() {
  const theme = useTheme();
  const router = useRouter();
  const [tf, setTf] = useState<Timeframe>('7d');
  const [sort, setSort] = useState<Sort>('views');
  const [entries, setEntries] = useState<CreatorRank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const days = TF.find((t) => t.key === tf)?.days ?? null;
    vtCreatorLeaderboard(days).then((e) => {
      if (!active) return;
      setEntries(e);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [tf]);

  const ranked = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      if (sort === 'posts') return b.posts - a.posts;
      if (sort === 'avg') return b.avg - a.avg;
      if (sort === 'recent') return b.lastPostTs - a.lastPostTs;
      return b.views - a.views;
    });
    return arr.slice(0, 25);
  }, [entries, sort]);

  return (
    <View style={{ gap: Spacing.three }}>
      {/* filters — compact dropdowns instead of scattered pills */}
      <View style={styles.filters}>
        <View style={styles.filterCol}>
          <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>TIMEFRAME</ThemedText>
          <Dropdown
            value={tf}
            onChange={(v) => setTf(v as Timeframe)}
            options={TF.map((t) => ({ value: t.key, label: t.label, icon: 'calendar-outline' }))}
          />
        </View>
        <View style={styles.filterCol}>
          <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>SORT BY</ThemedText>
          <Dropdown
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={SORTS.map((s) => ({ value: s.key, label: s.label, icon: s.icon }))}
          />
        </View>
      </View>

      {loading ? (
        <View style={{ gap: Spacing.two }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={66} radius={Radius.lg} />
          ))}
        </View>
      ) : ranked.length === 0 ? (
        <BrutalCard style={styles.empty}>
          <Ionicons name="people-outline" size={28} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            No creator activity in this window yet.
          </ThemedText>
        </BrutalCard>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {ranked.map((c, i) => {
            const rank = i + 1;
            const medal = MEDAL[rank];
            const primary =
              sort === 'posts' ? `${c.posts}` : sort === 'avg' ? compact(c.avg) : sort === 'recent' ? ago(c.lastPostTs) : compact(c.views);
            const primaryLabel = sort === 'posts' ? 'posts' : sort === 'avg' ? 'avg' : sort === 'recent' ? 'last post' : 'views';
            return (
              <Pressable
                key={c.profile.id}
                onPress={() => router.push({ pathname: '/creator/[id]', params: { id: c.profile.id } })}
                style={({ pressed }) => [styles.rowCard, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, rank <= 3 ? 5 : 3), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
                <View style={[styles.rankBadge, { backgroundColor: medal ?? theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText style={[styles.rankNum, { color: medal ? '#1A1A1A' : theme.textSecondary }]}>{rank}</ThemedText>
                </View>
                <BrutalAvatar name={c.profile.full_name} uri={c.profile.avatar_url} size={40} />
                <View style={styles.mid}>
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {c.profile.full_name || 'Creator'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {compact(c.views)} views · {c.posts} posts · {compact(c.avg)} avg
                  </ThemedText>
                </View>
                <View style={styles.metric}>
                  <ThemedText style={[styles.metricVal, { color: sort === 'recent' ? theme.text : theme.primary }]} numberOfLines={1}>
                    {primary}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {primaryLabel}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  filterCol: { flex: 1, minWidth: 150, gap: 5 },
  filterLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.lg, borderWidth: Border.width },
  rankBadge: { width: 30, height: 30, borderRadius: 9, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  rankNum: { fontSize: 14, fontWeight: '900' },
  mid: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  metric: { alignItems: 'flex-end' },
  metricVal: { fontSize: 18, lineHeight: 22, fontWeight: '900' },
});
