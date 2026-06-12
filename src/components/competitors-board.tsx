import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { fnErrorMessage, vtCreatorActivity, type CreatorActivity } from '@/lib/viewtrack';

const sb = supabase as unknown as { from: (t: string) => any };

type CompApp = {
  track_id: number;
  name: string;
  icon: string | null;
  developer: string | null;
  category: string | null;
  release_date: string | null;
  created_at: string;
};
type Snap = { track_id: number; day: string; rating: number | null; rating_count: number | null; revenue_estimate: number | null; downloads_estimate: number | null; rank: number | null; version: string | null };
type SearchHit = { trackId: number; name: string; icon: string | null; developer: string | null; category: string | null; rating: number | null; ratingCount: number | null };
type Creator = { id: string; full_name: string | null; avatar_url: string | null };

const money = (n: number | null) => (n == null ? '—' : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M/mo` : n >= 1_000 ? `$${Math.round(n / 1_000)}K/mo` : `$${n}/mo`);
const compact = (n: number | null) => (n == null ? '—' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);

async function invoke(body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  const { data, error } = await supabase.functions.invoke('competitors', { body });
  if (error) return { ok: false, error: await fnErrorMessage(error) };
  return { ok: true, data };
}

/** Admin: competitor App Store apps — revenue/downloads/rank tracking with
 *  daily snapshots, plus our creators linked per app for views context. */
export function CompetitorsBoard() {
  const theme = useTheme();
  const [apps, setApps] = useState<CompApp[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [links, setLinks] = useState<{ track_id: number; profile_id: string }[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [activity, setActivity] = useState<Record<string, CreatorActivity>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openApp, setOpenApp] = useState<CompApp | null>(null);
  const [creatorPickFor, setCreatorPickFor] = useState<CompApp | null>(null);

  const reload = useCallback(async () => {
    const [{ data: a }, { data: s }, { data: l }, { data: c }] = await Promise.all([
      sb.from('competitor_apps').select('*').order('created_at'),
      sb.from('competitor_snapshots').select('*').order('day'),
      sb.from('competitor_app_creators').select('track_id, profile_id'),
      supabase.from('profiles').select('id, full_name, avatar_url').eq('role', 'creator').order('full_name'),
    ]);
    setApps((a as CompApp[]) ?? []);
    setSnaps((s as Snap[]) ?? []);
    setLinks((l as { track_id: number; profile_id: string }[]) ?? []);
    setCreators(((c as unknown as Creator[]) ?? []) as Creator[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    vtCreatorActivity().then(setActivity);
  }, [reload]);

  const snapsByApp = useMemo(() => {
    const m: Record<number, Snap[]> = {};
    for (const s of snaps) (m[s.track_id] ??= []).push(s);
    return m;
  }, [snaps]);

  const creatorsByApp = useMemo(() => {
    const m: Record<number, Creator[]> = {};
    for (const l of links) {
      const c = creators.find((x) => x.id === l.profile_id);
      if (c) (m[l.track_id] ??= []).push(c);
    }
    return m;
  }, [links, creators]);

  async function runSearch() {
    if (!query.trim() || searching) return;
    setSearching(true);
    const r = await invoke({ action: 'search', term: query.trim() });
    setSearching(false);
    setHits(r.ok ? (r.data?.results ?? []) : []);
  }

  async function addApp(hit: SearchHit) {
    setBusy(`add-${hit.trackId}`);
    const r = await invoke({ action: 'add', trackId: hit.trackId });
    setBusy(null);
    if (!r.ok && Platform.OS === 'web') window.alert(r.error);
    setHits(null);
    setQuery('');
    reload();
  }

  async function refresh(trackId?: number) {
    setBusy(trackId ? `r-${trackId}` : 'all');
    await invoke({ action: 'refresh', ...(trackId ? { trackId } : {}) });
    setBusy(null);
    reload();
  }

  async function remove(app: CompApp) {
    if (Platform.OS === 'web' && !window.confirm(`Stop tracking ${app.name}? Its history goes too.`)) return;
    await invoke({ action: 'remove', trackId: app.track_id });
    reload();
  }

  const latest = (id: number): Snap | undefined => snapsByApp[id]?.[snapsByApp[id].length - 1];

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>Competitors</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            App Store rivals — revenue, downloads and rank, snapshotted on every refresh
          </ThemedText>
        </View>
        <Pressable
          onPress={() => refresh()}
          disabled={!!busy}
          style={({ pressed }) => [styles.refreshAll, { borderColor: theme.border, backgroundColor: theme.primary }, brutalShadow(theme.shadow, 3), busy === 'all' && { opacity: 0.6 }, pressed && styles.pressIn]}>
          {busy === 'all' ? <ActivityIndicator size="small" color={theme.primaryText} /> : <Ionicons name="refresh" size={16} color={theme.primaryText} />}
          <ThemedText style={{ color: theme.primaryText, fontWeight: '900', fontSize: 14 }}>Refresh all</ThemedText>
        </Pressable>
      </View>

      {/* add via iTunes search */}
      <View style={{ gap: 6 }}>
        <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={runSearch}
            placeholder="Search the App Store to track an app (e.g. Hallow)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
          <Pressable onPress={runSearch} disabled={!query.trim() || searching} style={[styles.searchBtn, { backgroundColor: query.trim() ? theme.primary : theme.backgroundElement }]}>
            {searching ? <ActivityIndicator size="small" color={theme.primaryText} /> : <ThemedText style={{ color: query.trim() ? theme.primaryText : theme.textSecondary, fontWeight: '900', fontSize: 13 }}>search</ThemedText>}
          </Pressable>
        </View>
        {hits !== null && (
          <BrutalCard style={{ gap: 4, padding: Spacing.two }} shadow={3}>
            {hits.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ padding: Spacing.two }}>
                No App Store matches.
              </ThemedText>
            ) : (
              hits.map((h) => {
                const tracked = apps.some((a) => a.track_id === h.trackId);
                return (
                  <Pressable
                    key={h.trackId}
                    onPress={() => !tracked && addApp(h)}
                    disabled={tracked || busy === `add-${h.trackId}`}
                    style={({ pressed }) => [styles.hitRow, pressed && { backgroundColor: theme.backgroundElement }]}>
                    {h.icon ? <Image source={{ uri: h.icon }} style={styles.hitIcon} contentFit="cover" /> : <View style={[styles.hitIcon, { backgroundColor: theme.backgroundElement }]} />}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: '800' }} numberOfLines={1}>
                        {h.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {h.developer} · ★{h.rating?.toFixed(1) ?? '—'} ({compact(h.ratingCount)})
                      </ThemedText>
                    </View>
                    {busy === `add-${h.trackId}` ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Ionicons name={tracked ? 'checkmark-circle' : 'add-circle'} size={24} color={tracked ? theme.success : theme.primary} />
                    )}
                  </Pressable>
                );
              })
            )}
            <Pressable onPress={() => setHits(null)} style={{ alignSelf: 'center', padding: 6 }}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                close
              </ThemedText>
            </Pressable>
          </BrutalCard>
        )}
      </View>

      {/* tracked apps */}
      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.five }} />
      ) : apps.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="podium-outline" size={32} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            Track your first competitor — search above.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.grid}>
          {apps.map((app) => {
            const cur = latest(app.track_id);
            const series = snapsByApp[app.track_id] ?? [];
            const linked = creatorsByApp[app.track_id] ?? [];
            const linkedViews = linked.reduce((s, c) => s + (activity[c.id]?.views ?? 0), 0);
            return (
              <BrutalCard key={app.track_id} style={styles.appCard} shadow={4}>
                <View style={styles.appHead}>
                  {app.icon ? <Image source={{ uri: app.icon }} style={styles.appIcon} contentFit="cover" /> : <View style={[styles.appIcon, { backgroundColor: theme.backgroundElement }]} />}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.appName} numberOfLines={1}>
                      {app.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {app.developer} · {app.category}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => refresh(app.track_id)} hitSlop={6} style={styles.iconBtn}>
                    {busy === `r-${app.track_id}` ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="refresh" size={17} color={theme.text} />}
                  </Pressable>
                  <Pressable onPress={() => remove(app)} hitSlop={6} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  </Pressable>
                </View>

                <View style={styles.metricsRow}>
                  <Metric label="revenue" value={money(cur?.revenue_estimate ?? null)} strong />
                  <Metric label="downloads" value={`${compact(cur?.downloads_estimate ?? null)}/mo`} />
                  <Metric label="rank" value={cur?.rank != null ? `#${cur.rank}` : '—'} />
                  <Metric label="rating" value={cur?.rating != null ? `★${Number(cur.rating).toFixed(2)}` : '—'} />
                </View>

                <MiniSpark series={series} />

                {/* our creators promoting this app */}
                <Pressable onPress={() => setCreatorPickFor(app)} style={[styles.creatorsRow, { borderColor: theme.border }]}>
                  {linked.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      + link creators to see their views here
                    </ThemedText>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row' }}>
                        {linked.slice(0, 4).map((c, i) => (
                          <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                            <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={24} />
                          </View>
                        ))}
                      </View>
                      <ThemedText type="small" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                        {linked.length} creator{linked.length === 1 ? '' : 's'} · {compact(linkedViews)} views
                      </ThemedText>
                      <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
                    </>
                  )}
                </Pressable>

                <Pressable onPress={() => setOpenApp(app)} style={({ pressed }) => [styles.historyBtn, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="stats-chart" size={13} color={theme.text} />
                  <ThemedText style={{ fontWeight: '800', fontSize: 13 }}> history</ThemedText>
                </Pressable>
              </BrutalCard>
            );
          })}
        </View>
      )}

      {openApp && <CompHistoryModal app={openApp} series={snapsByApp[openApp.track_id] ?? []} onClose={() => setOpenApp(null)} />}
      {creatorPickFor && (
        <CreatorLinkModal
          app={creatorPickFor}
          creators={creators}
          linked={new Set((creatorsByApp[creatorPickFor.track_id] ?? []).map((c) => c.id))}
          onClose={() => {
            setCreatorPickFor(null);
            reload();
          }}
        />
      )}
    </ScrollView>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <ThemedText style={[styles.metricValue, strong && { color: theme.primary }]} numberOfLines={1}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

/** 30-bar revenue sparkline from snapshots. */
function MiniSpark({ series }: { series: Snap[] }) {
  const theme = useTheme();
  const pts = series.slice(-30).map((s) => s.revenue_estimate ?? 0);
  if (pts.length < 2) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        revenue trend appears as daily snapshots accumulate
      </ThemedText>
    );
  }
  const max = Math.max(...pts, 1);
  return (
    <View style={styles.spark}>
      {pts.map((v, i) => (
        <View key={i} style={[styles.sparkBar, { height: Math.max(2, Math.round((v / max) * 34)), backgroundColor: i === pts.length - 1 ? theme.primary : theme.primaryMuted }]} />
      ))}
    </View>
  );
}

type HistMetric = 'revenue_estimate' | 'downloads_estimate' | 'rank' | 'rating_count';
const HIST_METRICS: DropdownOption<HistMetric>[] = [
  { value: 'revenue_estimate', label: 'Revenue', icon: 'cash' },
  { value: 'downloads_estimate', label: 'Downloads', icon: 'download' },
  { value: 'rank', label: 'Rank', icon: 'podium' },
  { value: 'rating_count', label: 'Rating count', icon: 'star' },
];

function CompHistoryModal({ app, series, onClose }: { app: CompApp; series: Snap[]; onClose: () => void }) {
  const theme = useTheme();
  const [metric, setMetric] = useState<HistMetric>('revenue_estimate');
  const vals = series.map((s) => Number(s[metric] ?? 0));
  const max = Math.max(...vals, 1);
  const fmt = (n: number) => (metric === 'revenue_estimate' ? money(n) : metric === 'rank' ? `#${n}` : compact(n));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.histPanel, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5)]} onPress={() => {}}>
          <View style={styles.histHead}>
            <ThemedText style={styles.histTitle} numberOfLines={1}>
              {app.name}
            </ThemedText>
            <Dropdown value={metric} options={HIST_METRICS} onChange={setMetric} minWidth={160} />
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          {series.length < 2 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {series.length === 0 ? 'No snapshots yet — hit refresh.' : 'One snapshot so far — the chart appears as daily refreshes accumulate.'}
            </ThemedText>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                <ThemedText style={{ fontSize: 24, lineHeight: 30, fontWeight: '900' }}>{fmt(vals[vals.length - 1] ?? 0)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  latest · max {fmt(max)}
                </ThemedText>
              </View>
              <View style={styles.histChart}>
                {series.map((s, i) => (
                  <View key={s.day} style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <View
                      style={{
                        height: Math.max(3, Math.round((Number(s[metric] ?? 0) / max) * 130)),
                        backgroundColor: i === series.length - 1 ? theme.primary : theme.primaryMuted,
                        borderRadius: 3,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <ThemedText type="small" themeColor="textSecondary">
                  {series[0].day}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {series[series.length - 1].day}
                </ThemedText>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CreatorLinkModal({ app, creators, linked, onClose }: { app: CompApp; creators: Creator[]; linked: Set<string>; onClose: () => void }) {
  const theme = useTheme();
  const [sel, setSel] = useState<Set<string>>(new Set(linked));
  const toggle = async (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) {
      n.delete(id);
      await sb.from('competitor_app_creators').delete().eq('track_id', app.track_id).eq('profile_id', id);
    } else {
      n.add(id);
      await sb.from('competitor_app_creators').insert({ track_id: app.track_id, profile_id: id });
    }
    setSel(n);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.histPanel, { backgroundColor: theme.card, borderColor: theme.border, maxWidth: 420 }, brutalShadow(theme.shadow, 5)]} onPress={() => {}}>
          <View style={styles.histHead}>
            <ThemedText style={styles.histTitle} numberOfLines={1}>
              creators on {app.name}
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
            {creators.map((c) => {
              const on = sel.has(c.id);
              return (
                <Pressable key={c.id} onPress={() => toggle(c.id)} style={({ pressed }) => [styles.creatorRow, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryMuted : undefined }, pressed && { opacity: 0.7 }]}>
                  <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={30} />
                  <ThemedText style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {c.full_name || 'Unnamed'}
                  </ThemedText>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? theme.primary : theme.textSecondary} />
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, gap: Spacing.three, paddingBottom: Spacing.six },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  refreshAll: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: Border.width },
  pressIn: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.three, paddingRight: 5, height: 48, borderRadius: Radius.md, borderWidth: Border.width },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', height: '100%' },
  searchBtn: { paddingHorizontal: Spacing.three, height: 38, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.sm },
  hitIcon: { width: 40, height: 40, borderRadius: 9 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six, borderRadius: Radius.lg, borderWidth: Border.width, borderStyle: 'dashed' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  appCard: { width: 360, gap: Spacing.two },
  appHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  appIcon: { width: 44, height: 44, borderRadius: 10 },
  appName: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  iconBtn: { padding: 4 },
  metricsRow: { flexDirection: 'row', gap: Spacing.two },
  metricValue: { fontSize: 15, lineHeight: 20, fontWeight: '900' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 36 },
  sparkBar: { flex: 1, borderRadius: 2 },
  creatorsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.two },
  historyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: Radius.sm, borderWidth: Border.width },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  histPanel: { width: '100%', maxWidth: 640, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  histTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  histChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 136 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
});
