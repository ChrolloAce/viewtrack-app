import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BrutalCard } from '@/components/brutal';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
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

type Sort = 'views' | 'breakout' | 'recent';
const SORTS: DropdownOption<Sort>[] = [
  { value: 'views', label: 'Top views', icon: 'eye' },
  { value: 'breakout', label: 'Biggest breakout', icon: 'trending-up' },
  { value: 'recent', label: 'Most recent', icon: 'time' },
];

/** Admin: the viral-format library scraped from LightReel — each format with its
 *  link, metrics, AI format type, and the App Store app it promotes. */
export function ViralFormatsBoard() {
  const theme = useTheme();
  const [rows, setRows] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('views');
  const [appFilter, setAppFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');

  const reload = useCallback(async () => {
    const { data } = await sb.from('viral_formats').select('*').order('views', { ascending: false }).limit(1000);
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

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>Viral Formats</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        trending UGC formats and the App Store apps they promote · {rows.length} tracked
      </ThemedText>

      <View style={styles.controls}>
        <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="search" size={15} color={theme.textSecondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search formats, creators, apps" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.text }]} />
        </View>
        <Dropdown value={sort} options={SORTS} onChange={setSort} minWidth={160} />
        <Dropdown value={platformFilter} options={platformOpts} onChange={setPlatformFilter} minWidth={150} />
        {formatOpts.length > 1 && <Dropdown value={formatFilter} options={formatOpts} onChange={setFormatFilter} minWidth={170} />}
        {appOpts.length > 1 && <Dropdown value={appFilter} options={appOpts} onChange={setAppFilter} minWidth={200} />}
      </View>

      {loading ? null : shown.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="flame-outline" size={32} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {rows.length === 0 ? 'No formats imported yet.' : 'No formats match.'}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.grid}>
          {shown.map((f) => (
            <BrutalCard key={f.external_id} style={styles.card} shadow={3}>
              <Pressable onPress={() => f.url && openUrl(f.url)} style={styles.coverWrap}>
                {f.cover ? <Image source={{ uri: f.cover }} style={styles.cover} contentFit="cover" /> : <View style={[styles.cover, { backgroundColor: theme.backgroundElement }]} />}
                <View style={[styles.platBadge, { backgroundColor: '#fff', borderColor: theme.border }]}>
                  <Ionicons name={PLATFORM_ICON[f.platform ?? ''] as never} size={13} color={PLATFORM_COLOR[f.platform ?? ''] ?? theme.text} />
                </View>
                {f.breakout_ratio != null && f.breakout_ratio >= 1 && (
                  <View style={styles.breakoutBadge}>
                    <Ionicons name="trending-up" size={11} color="#fff" />
                    <ThemedText style={styles.breakoutText}>{f.breakout_ratio.toFixed(1)}x</ThemedText>
                  </View>
                )}
                <View style={styles.viewsOverlay}>
                  <Ionicons name="eye" size={12} color="#fff" />
                  <ThemedText style={styles.viewsText}>{compact(f.views)}</ThemedText>
                </View>
              </Pressable>

              <View style={styles.body}>
                {!!f.format && (
                  <View style={styles.tagRow}>
                    <View style={[styles.fmtChip, { backgroundColor: theme.primary }]}>
                      <ThemedText style={styles.fmtChipText}>{f.format}</ThemedText>
                    </View>
                    {(f.style_tags ?? []).slice(0, 2).map((t) => (
                      <View key={t} style={[styles.styleChip, { borderColor: theme.border }]}>
                        <ThemedText type="small" style={{ fontWeight: '700' }}>{t}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  @{f.creator_handle} · {f.caption || f.title}
                </ThemedText>

                {/* the app it promotes — links to the App Store */}
                {!!f.app_name && (
                  <Pressable
                    onPress={() => f.app_track_id && openUrl(appStoreUrl(f.app_track_id))}
                    style={({ pressed }) => [styles.appRow, { borderColor: theme.border, backgroundColor: theme.background }, pressed && { opacity: 0.7 }]}>
                    {f.app_icon ? <Image source={{ uri: f.app_icon }} style={styles.appIcon} contentFit="cover" /> : <View style={[styles.appIcon, { backgroundColor: theme.backgroundElement }]} />}
                    <ThemedText style={{ fontWeight: '800', fontSize: 13, flex: 1 }} numberOfLines={1}>
                      {f.app_name}
                    </ThemedText>
                    <Ionicons name="open-outline" size={14} color={theme.textSecondary} />
                  </Pressable>
                )}

                <Pressable onPress={() => f.url && openUrl(f.url)} style={({ pressed }) => [styles.watchBtn, { borderColor: theme.border, backgroundColor: theme.card }, brutalShadow(theme.shadow, 2), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
                  <Ionicons name="play" size={13} color={theme.text} />
                  <ThemedText style={{ fontWeight: '800', fontSize: 13 }}> watch original</ThemedText>
                </Pressable>
              </View>
            </BrutalCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, gap: Spacing.one, paddingBottom: Spacing.six },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  controls: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', alignItems: 'center', marginTop: Spacing.three, marginBottom: Spacing.three },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, height: 40, borderRadius: Radius.full, borderWidth: Border.width, minWidth: 240, flex: 1 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six, borderRadius: Radius.lg, borderWidth: Border.width, borderStyle: 'dashed' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  card: { width: 230, padding: 0, overflow: 'hidden', gap: 0 },
  coverWrap: { width: '100%', height: 300 },
  cover: { width: '100%', height: '100%' },
  platBadge: { position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  breakoutBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#16A34A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1.5, borderColor: '#fff' },
  breakoutText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  viewsOverlay: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  viewsText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  body: { padding: Spacing.two + 2, gap: Spacing.two },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  fmtChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  fmtChipText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  styleChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: 6, borderRadius: Radius.sm, borderWidth: Border.width },
  appIcon: { width: 28, height: 28, borderRadius: 7 },
  watchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: Radius.sm, borderWidth: Border.width },
});
