import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AnalyzeModal } from '@/components/creator-database';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { vtListVideos, type VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);

type Sort = 'views' | 'recent' | 'likes';
const SORTS: { key: Sort; label: string; icon: string }[] = [
  { key: 'views', label: 'Top views', icon: 'eye' },
  { key: 'recent', label: 'Recent', icon: 'time' },
  { key: 'likes', label: 'Most liked', icon: 'heart' },
];

/** Admin Videos tab — a grid of every tracked video, sortable, tap to open + analyze. */
export function VideosGrid() {
  const theme = useTheme();
  const [videos, setVideos] = useState<VtVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('views');
  const [open, setOpen] = useState<VtVideo | null>(null);

  useEffect(() => {
    vtListVideos(300).then((v) => {
      setVideos(v);
      setLoading(false);
    });
  }, []);

  const sorted = useMemo(() => {
    const arr = [...videos];
    if (sort === 'recent') arr.sort((a, b) => new Date(b.uploadDate ?? 0).getTime() - new Date(a.uploadDate ?? 0).getTime());
    else if (sort === 'likes') arr.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    else arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    return arr;
  }, [videos, sort]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>Videos</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        every tracked video · tap one to open and run an AI breakdown
      </ThemedText>

      <View style={styles.sortRow}>
        {SORTS.map((s) => {
          const on = sort === s.key;
          return (
            <Pressable key={s.key} onPress={() => setSort(s.key)} style={[styles.sortPill, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : theme.card }]}>
              <Ionicons name={s.icon as never} size={14} color={on ? theme.primaryText : theme.textSecondary} />
              <ThemedText style={[styles.sortText, { color: on ? theme.primaryText : theme.text }]}>{s.label}</ThemedText>
            </Pressable>
          );
        })}
        {!loading && (
          <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {sorted.length} videos
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
          No videos tracked yet — hit Sync now in Creators.
        </ThemedText>
      ) : (
        <View style={styles.grid}>
          {sorted.map((v) => (
            <Pressable key={v.id} onPress={() => setOpen(v)} style={({ pressed }) => [styles.tile, { borderColor: theme.border, backgroundColor: theme.card }, brutalShadow(theme.shadow, 3), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
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
                <View style={styles.viewsOverlay}>
                  <Ionicons name="eye" size={12} color="#fff" />
                  <ThemedText style={styles.viewsText}>{compact(v.views)}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.acct} numberOfLines={1}>
                @{v.accountUsername || 'video'}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      {open && <AnalyzeModal video={open} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.one },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  sortRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.three, marginBottom: Spacing.three },
  sortPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.three, height: 38, borderRadius: Radius.sm, borderWidth: Border.width },
  sortText: { fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: { width: 150, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  thumbWrap: { width: '100%', height: 200 },
  thumb: { width: '100%', height: '100%' },
  platBadge: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  viewsOverlay: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  viewsText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  acct: { fontSize: 13, fontWeight: '800', padding: 7 },
});
