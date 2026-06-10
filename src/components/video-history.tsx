import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const sb = supabase as unknown as { from: (t: string) => any };

type Snap = { day: string; views: number; likes: number; comments: number; shares: number; saves: number };
type Metric = 'views' | 'likes' | 'comments' | 'shares' | 'saves';
const METRICS: DropdownOption<Metric>[] = [
  { value: 'views', label: 'Views', icon: 'eye' },
  { value: 'likes', label: 'Likes', icon: 'heart' },
  { value: 'comments', label: 'Comments', icon: 'chatbubble' },
  { value: 'shares', label: 'Shares', icon: 'arrow-redo' },
  { value: 'saves', label: 'Saves', icon: 'bookmark' },
];

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

/**
 * Per-video metric history — daily snapshots recorded every time the grid
 * syncs, charted with a metric dropdown. History accumulates day by day.
 */
export function VideoHistory({ videoId }: { videoId: string }) {
  const theme = useTheme();
  const [snaps, setSnaps] = useState<Snap[] | null>(null);
  const [metric, setMetric] = useState<Metric>('views');

  useEffect(() => {
    let active = true;
    sb.from('video_snapshots')
      .select('day, views, likes, comments, shares, saves')
      .eq('video_id', videoId)
      .order('day')
      .then(({ data }: { data: Snap[] | null }) => {
        if (active) setSnaps(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [videoId]);

  if (!snaps) return null;

  const values = snaps.map((s) => Number(s[metric] ?? 0));
  const max = Math.max(...values, 1);
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const delta = last - first;

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.head}>
        <ThemedText style={[styles.label, { color: theme.primary }]}>HISTORY</ThemedText>
        <Dropdown value={metric} options={METRICS} onChange={setMetric} minWidth={150} />
      </View>

      {snaps.length < 2 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {snaps.length === 0
            ? 'No snapshots yet — history starts recording the next time the grid syncs.'
            : `1 snapshot so far (${dayLabel(snaps[0].day)}) — the chart appears as more days accumulate.`}
        </ThemedText>
      ) : (
        <>
          <View style={styles.statsRow}>
            <ThemedText style={styles.bigValue}>{compact(last)}</ThemedText>
            <View style={[styles.deltaChip, { backgroundColor: delta >= 0 ? theme.success : theme.danger }]}>
              <Ionicons name={delta >= 0 ? 'trending-up' : 'trending-down'} size={12} color="#fff" />
              <ThemedText style={styles.deltaText}>
                {delta >= 0 ? '+' : '−'}
                {compact(Math.abs(delta))}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              over {snaps.length} days
            </ThemedText>
          </View>

          <View style={styles.chart}>
            {snaps.map((s, i) => {
              const v = Number(s[metric] ?? 0);
              const h = Math.max(3, Math.round((v / max) * 110));
              return (
                <View key={s.day} style={styles.barCol}>
                  <View style={[styles.bar, { height: h, backgroundColor: i === snaps.length - 1 ? theme.primary : theme.primaryMuted, borderColor: theme.border }]} />
                </View>
              );
            })}
          </View>
          <View style={styles.axis}>
            <ThemedText type="small" themeColor="textSecondary">
              {dayLabel(snaps[0].day)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              max {compact(max)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {dayLabel(snaps[snaps.length - 1].day)}
            </ThemedText>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bigValue: { fontSize: 24, lineHeight: 30, fontWeight: '900' },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  deltaText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 116, gap: 2 },
  barCol: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  bar: { borderRadius: 3, borderWidth: 1 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
