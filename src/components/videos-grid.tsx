import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AnalyzeModal } from '@/components/creator-database';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVideoAnalyses, type AnalysisState } from '@/lib/use-analyses';
import { vtListVideos, type VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);

type Sort = 'views' | 'recent' | 'likes';
const SORTS: DropdownOption<Sort>[] = [
  { value: 'recent', label: 'Most recent', icon: 'time' },
  { value: 'views', label: 'Top views', icon: 'eye' },
  { value: 'likes', label: 'Most liked', icon: 'heart' },
];

type Timeframe = '3d' | '7d' | '14d' | '30d' | 'all';
const TFS: { value: Timeframe; label: string; days: number | null }[] = [
  { value: '3d', label: 'Last 3 days', days: 3 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '14d', label: 'Last 14 days', days: 14 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: 'all', label: 'All time', days: null },
];
const TF_OPTS: DropdownOption<Timeframe>[] = TFS.map((t) => ({ value: t.value, label: t.label, icon: 'calendar-outline' }));

/** Admin Videos tab — every tracked video in a timeframe, sortable, tap to analyze. */
export function VideosGrid() {
  const theme = useTheme();
  const [videos, setVideos] = useState<VtVideo[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('views');
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [open, setOpen] = useState<VtVideo | null>(null);
  const { map: analyses } = useVideoAnalyses();

  useEffect(() => {
    let active = true;
    setLoading(true);
    const days = TFS.find((t) => t.value === timeframe)?.days ?? null;
    // all-time is bounded so the grid stays responsive on big projects
    vtListVideos(days, days == null ? 1500 : undefined).then((r) => {
      if (!active) return;
      setVideos(r.videos);
      setTotal(r.total);
      setTruncated(r.truncated);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [timeframe]);

  const sorted = useMemo(() => {
    const arr = [...videos];
    if (sort === 'recent') arr.sort((a, b) => new Date(b.uploadDate ?? 0).getTime() - new Date(a.uploadDate ?? 0).getTime());
    else if (sort === 'likes') arr.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    else arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    return arr;
  }, [videos, sort]);

  const tfLabel = (TFS.find((t) => t.value === timeframe)?.label ?? '').toLowerCase();

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>Videos</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        every tracked video across all creators · tap one to open and run an AI breakdown
      </ThemedText>

      {/* timeframe + sort dropdowns */}
      <View style={styles.controls}>
        <Dropdown value={timeframe} options={TF_OPTS} onChange={setTimeframe} minWidth={170} />
        <Dropdown value={sort} options={SORTS} onChange={setSort} minWidth={170} />
        {!loading && (
          <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {sorted.length} {timeframe === 'all' ? `of ${total} videos` : `videos · ${tfLabel}`}
            {truncated ? ' (capped)' : ''}
          </ThemedText>
        )}
      </View>

      {loading ? (
        <View style={styles.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} width={150} height={224} radius={Radius.md} />
          ))}
        </View>
      ) : sorted.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.five, textAlign: 'center' }}>
          {timeframe === 'all' ? 'No videos tracked yet — hit Sync now in Creators.' : `No videos in the ${tfLabel}. Try a wider timeframe.`}
        </ThemedText>
      ) : (
        <View style={styles.grid}>
          {sorted.map((v) => (
            <VideoCard key={v.id} video={v} state={analyses[v.id]} onPress={() => setOpen(v)} />
          ))}
        </View>
      )}

      {open && <AnalyzeModal video={open} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

function VideoCard({ video: v, state, onPress }: { video: VtVideo; state?: AnalysisState; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { borderColor: theme.border, backgroundColor: theme.card }, brutalShadow(theme.shadow, 3), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
      <View style={styles.thumbWrap}>
        {v.thumbnail ? (
          <Image source={{ uri: v.thumbnail }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
          </View>
        )}
        <View style={[styles.platBadge, { backgroundColor: '#fff', borderColor: theme.border }]}>
          <Ionicons name={PLATFORM_ICON[v.platform] as never} size={13} color={PLATFORM_COLOR[v.platform] ?? theme.text} />
        </View>
        <AnalyzedBadge state={state} />
        <View style={styles.viewsOverlay}>
          <Ionicons name="eye" size={12} color="#fff" />
          <ThemedText style={styles.viewsText}>{compact(v.views)}</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.acct} numberOfLines={1}>
        @{v.accountUsername || 'video'}
      </ThemedText>
    </Pressable>
  );
}

/** Corner badge reflecting AI-analysis state: analyzing / done / error. */
function AnalyzedBadge({ state }: { state?: AnalysisState }) {
  const theme = useTheme();
  if (!state) return null;
  if (state.status === 'processing') {
    return (
      <View style={[styles.aiBadge, { backgroundColor: theme.accent, borderColor: theme.card }]}>
        <ActivityIndicator size="small" color="#1A1A1A" />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={[styles.aiBadge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
        <Ionicons name="alert" size={13} color="#fff" />
      </View>
    );
  }
  return (
    <View style={[styles.aiBadge, { backgroundColor: theme.success, borderColor: theme.card }]}>
      <Ionicons name="sparkles" size={12} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  controls: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', alignItems: 'center', marginTop: Spacing.three, marginBottom: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: { width: 150, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  thumbWrap: { width: '100%', height: 200 },
  thumb: { width: '100%', height: '100%' },
  platBadge: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  aiBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  viewsOverlay: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  viewsText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  acct: { fontSize: 13, fontWeight: '800', padding: 7 },
});
