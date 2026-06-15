import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const sb = supabase as unknown as { from: (t: string) => any };

type Format = {
  external_id: string;
  platform: string | null;
  url: string | null;
  creator_handle: string | null;
  title: string | null;
  caption: string | null;
  cover: string | null;
  views: number;
  likes: number;
  comments: number;
  breakout_ratio: number | null;
  engagement_rate: number | null;
  app_track_id: number | null;
  app_name: string | null;
  app_icon: string | null;
  format: string | null;
  style_tags: string[] | null;
  posted_at: string | null;
};

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);
const openUrl = (u: string) => (Platform.OS === 'web' ? window.open(u, '_blank') : Linking.openURL(u));
const appStoreUrl = (id: number) => `https://apps.apple.com/app/id${id}`;
const HAIR = 'rgba(0,0,0,0.08)';
const soft = { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } as const;

type Sort = 'views' | 'breakout' | 'recent';
const SORTS: DropdownOption<Sort>[] = [
  { value: 'views', label: 'Top views', icon: 'eye' },
  { value: 'breakout', label: 'Biggest breakout', icon: 'trending-up' },
  { value: 'recent', label: 'Most recent', icon: 'time' },
];

const PAGE = 60;

/** Admin: the viral-format library scraped from LightReel — clean, light layout. */
export function ViralFormatsBoard() {
  const theme = useTheme();
  const [rows, setRows] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('views');
  const [appFilter, setAppFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE);

  const reload = useCallback(async () => {
    const { data } = await sb.from('viral_formats').select('*').order('views', { ascending: false }).limit(5000);
    setRows((data as Format[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase
      .channel(`viral-formats:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viral_formats' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload]);

  const appOpts = useMemo<DropdownOption<string>[]>(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.app_name && m.set(r.app_name, (m.get(r.app_name) ?? 0) + 1));
    return [{ value: 'all', label: 'All apps', icon: 'apps-outline' }, ...[...m.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ value: n, label: `${n} (${c})`, icon: 'phone-portrait-outline' as const }))];
  }, [rows]);

  const formatOpts = useMemo<DropdownOption<string>[]>(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => r.format && m.set(r.format, (m.get(r.format) ?? 0) + 1));
    return [{ value: 'all', label: 'All formats', icon: 'shapes-outline' }, ...[...m.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ value: n, label: `${n} (${c})`, icon: 'pricetag-outline' as const }))];
  }, [rows]);

  const platformOpts: DropdownOption<string>[] = [
    { value: 'all', label: 'All platforms', icon: 'apps-outline' },
    { value: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
    { value: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
    { value: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  ];

  const shown = useMemo(() => {
    let arr = [...rows];
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter((r) => `${r.title} ${r.caption} ${r.creator_handle} ${r.app_name}`.toLowerCase().includes(q));
    if (appFilter !== 'all') arr = arr.filter((r) => r.app_name === appFilter);
    if (formatFilter !== 'all') arr = arr.filter((r) => r.format === formatFilter);
    if (platformFilter !== 'all') arr = arr.filter((r) => r.platform === platformFilter);
    if (sort === 'views') arr.sort((a, b) => b.views - a.views);
    else if (sort === 'breakout') arr.sort((a, b) => (b.breakout_ratio ?? 0) - (a.breakout_ratio ?? 0));
    else arr.sort((a, b) => new Date(b.posted_at ?? 0).getTime() - new Date(a.posted_at ?? 0).getTime());
    return arr;
  }, [rows, query, appFilter, formatFilter, platformFilter, sort]);

  useEffect(() => setLimit(PAGE), [query, appFilter, formatFilter, platformFilter, sort]);

  return (
    <ScrollView style={[styles.flex, { backgroundColor: theme.background }]} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>Viral Formats</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
        trending UGC formats and the apps they promote · {rows.length.toLocaleString()} tracked
      </ThemedText>

      <View style={styles.controls}>
        <View style={[styles.searchRow, { borderColor: HAIR, backgroundColor: theme.card }]}>
          <Ionicons name="search" size={15} color={theme.textSecondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search formats, creators, apps" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.text }]} />
        </View>
        <Dropdown value={sort} options={SORTS} onChange={setSort} minWidth={160} />
        <Dropdown value={platformFilter} options={platformOpts} onChange={setPlatformFilter} minWidth={150} />
        {formatOpts.length > 1 && <Dropdown value={formatFilter} options={formatOpts} onChange={setFormatFilter} minWidth={170} />}
        {appOpts.length > 1 && <Dropdown value={appFilter} options={appOpts} onChange={setAppFilter} minWidth={200} />}
      </View>

      {!loading && (
        <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>
          {shown.length.toLocaleString()} {shown.length === 1 ? 'format' : 'formats'}
        </ThemedText>
      )}

      {loading ? null : shown.length === 0 ? (
        <View style={[styles.empty, { borderColor: HAIR }]}>
          <Ionicons name="flame-outline" size={30} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {rows.length === 0 ? 'No formats imported yet.' : 'No formats match.'}
          </ThemedText>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            {shown.slice(0, limit).map((f) => (
              <View key={f.external_id} style={[styles.card, { backgroundColor: theme.card, borderColor: HAIR }, soft]}>
                <Pressable onPress={() => f.url && openUrl(f.url)} style={styles.coverWrap}>
                  {f.cover ? <Image source={{ uri: f.cover }} style={styles.cover} contentFit="cover" /> : <View style={[styles.cover, { backgroundColor: theme.backgroundElement }]} />}
                  <View style={styles.platBadge}>
                    <Ionicons name={PLATFORM_ICON[f.platform ?? ''] as never} size={12} color={PLATFORM_COLOR[f.platform ?? ''] ?? theme.text} />
                  </View>
                  {f.breakout_ratio != null && f.breakout_ratio >= 1 && (
                    <View style={styles.breakoutBadge}>
                      <Ionicons name="trending-up" size={10} color="#fff" />
                      <ThemedText style={styles.breakoutText}>{f.breakout_ratio.toFixed(1)}x</ThemedText>
                    </View>
                  )}
                  <View style={styles.viewsOverlay}>
                    <Ionicons name="eye" size={11} color="#fff" />
                    <ThemedText style={styles.viewsText}>{compact(f.views)}</ThemedText>
                  </View>
                </Pressable>

                <View style={styles.body}>
                  {!!f.format && (
                    <View style={styles.tagRow}>
                      <View style={[styles.fmtChip, { backgroundColor: 'rgba(244,115,30,0.12)' }]}>
                        <ThemedText style={[styles.fmtChipText, { color: theme.primary }]}>{f.format}</ThemedText>
                      </View>
                      {(f.style_tags ?? []).slice(0, 2).map((t) => (
                        <View key={t} style={[styles.styleChip, { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText style={styles.styleChipText}>{t}</ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.caption}>
                    @{f.creator_handle} · {f.caption || f.title}
                  </ThemedText>

                  {!!f.app_name && (
                    <Pressable
                      onPress={() => f.app_track_id && openUrl(appStoreUrl(f.app_track_id))}
                      style={({ pressed }) => [styles.appRow, { borderColor: HAIR, backgroundColor: theme.background }, pressed && { opacity: 0.6 }]}>
                      {f.app_icon ? <Image source={{ uri: f.app_icon }} style={styles.appIcon} contentFit="cover" /> : <View style={[styles.appIcon, { backgroundColor: theme.backgroundElement }]} />}
                      <ThemedText style={styles.appName} numberOfLines={1}>
                        {f.app_name}
                      </ThemedText>
                      <Ionicons name="open-outline" size={13} color={theme.textSecondary} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>

          {limit < shown.length && (
            <Pressable onPress={() => setLimit((l) => l + PAGE * 2)} style={[styles.loadMore, { borderColor: HAIR, backgroundColor: theme.card }]}>
              <ThemedText style={{ fontWeight: '700', color: theme.text }}>Load more</ThemedText>
              <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.six },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  controls: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', alignItems: 'center', marginTop: Spacing.three, marginBottom: Spacing.two },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, height: 40, borderRadius: Radius.full, borderWidth: 1, minWidth: 240, flex: 1 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500' },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six, borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  card: { width: 232, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  coverWrap: { width: '100%', height: 300 },
  cover: { width: '100%', height: '100%' },
  platBadge: { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  breakoutBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#16A34A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  breakoutText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  viewsOverlay: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  viewsText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  body: { padding: Spacing.two + 2, gap: Spacing.two - 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  fmtChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full },
  fmtChipText: { fontSize: 11, fontWeight: '800' },
  styleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  styleChipText: { fontSize: 11, fontWeight: '600' },
  caption: { lineHeight: 17 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: 6, borderRadius: 10, borderWidth: 1, marginTop: 1 },
  appIcon: { width: 26, height: 26, borderRadius: 6 },
  appName: { fontWeight: '700', fontSize: 13, flex: 1 },
  loadMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', marginTop: Spacing.four, paddingHorizontal: Spacing.five, height: 44, borderRadius: Radius.full, borderWidth: 1 },
});
