import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plAb, plCreatorDetail, plCreators, type AbResult, type CreatorDetail, type PlCreator } from '@/lib/clicks';
import { vtListCreators } from '@/lib/viewtrack';

type Tf = '3d' | '7d' | '30d' | 'all';
const TF_DAYS: Record<Tf, number> = { '3d': 3, '7d': 7, '30d': 30, all: 0 };
const TF_LABEL: Record<Tf, string> = { '3d': 'last 3 days', '7d': 'last 7 days', '30d': 'last 30 days', all: 'all time' };
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${Math.round(n)}`);
const platIcon = (p?: string) => (p === 'ios' ? 'logo-apple' : p === 'android' ? 'logo-android' : 'globe-outline');
// Day buckets are in UTC to match the edge function's per-day traffic keys.
const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const flagOf = (code: string) => (code && code.length === 2 ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐');
const prettyDay = (k: string) => {
  const [y, m, d] = k.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

export function LinkClicks() {
  const theme = useTheme();
  const [tf, setTf] = useState<Tf>('7d');
  const [sortDir, setSortDir] = useState<'top' | 'low'>('top');
  const [creators, setCreators] = useState<PlCreator[]>([]);
  const [ab, setAb] = useState<AbResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [openCreator, setOpenCreator] = useState<PlCreator | null>(null);

  useEffect(() => {
    plAb().then(setAb).catch(() => {});
    vtListCreators().then((cs) => {
      const map: Record<string, string | null> = {};
      for (const c of cs) map[c.name.trim().toLowerCase()] = c.avatarUrl;
      setAvatars(map);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    plCreators(TF_DAYS[tf])
      .then((c) => {
        setCreators(c);
        setLoading(false);
      })
      .catch((e) => {
        setErr(String(e));
        setLoading(false);
      });
  }, [tf]);

  const metric = (c: PlCreator) => (tf === 'all' ? c.totalClicks : c.periodClicks);
  const rows = useMemo(() => [...creators].sort((a, b) => (sortDir === 'top' ? metric(b) - metric(a) : metric(a) - metric(b))), [creators, sortDir, tf]);
  const total = rows.reduce((s, c) => s + metric(c), 0);
  const totalUnique = rows.reduce((s, c) => s + c.uniqueClicks, 0);
  const avatarFor = (c: PlCreator) => avatars[(c.creatorName ?? '').trim().toLowerCase()] ?? null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>Link Clicks</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        bio-link clicks per creator · iOS / Android · referrers · countries · A/B
      </ThemedText>

      {/* granularity + sort */}
      <View style={styles.controls}>
        <View style={styles.tfRow}>
          {(['3d', '7d', '30d', 'all'] as Tf[]).map((t) => {
            const on = tf === t;
            return (
              <Pressable key={t} onPress={() => setTf(t)} style={[styles.tfPill, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : theme.card }]}>
                <ThemedText style={[styles.tfText, { color: on ? theme.primaryText : theme.text }]}>{t === 'all' ? 'All time' : t === '3d' ? '3 days' : t === '7d' ? '7 days' : '30 days'}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setSortDir((d) => (d === 'top' ? 'low' : 'top'))} style={[styles.sortBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Ionicons name={sortDir === 'top' ? 'arrow-down' : 'arrow-up'} size={15} color={theme.text} />
          <ThemedText style={styles.tfText}>{sortDir === 'top' ? 'Top clicks' : 'Fewest'}</ThemedText>
        </Pressable>
      </View>

      {/* totals */}
      <View style={styles.totals}>
        <BrutalCard style={[styles.totalCard, { backgroundColor: theme.primary, borderColor: theme.border }]} shadow={4}>
          <ThemedText style={styles.totalLabel}>CLICKS · {TF_LABEL[tf].toUpperCase()}</ThemedText>
          <ThemedText style={styles.totalValue}>{loading ? '—' : compact(total)}</ThemedText>
        </BrutalCard>
        <BrutalCard style={[styles.totalCard, { backgroundColor: theme.accent, borderColor: theme.border }]} shadow={4}>
          <ThemedText style={[styles.totalLabel, { color: '#1A1A1A' }]}>UNIQUE · ALL TIME</ThemedText>
          <ThemedText style={[styles.totalValue, { color: '#1A1A1A' }]}>{loading ? '—' : compact(totalUnique)}</ThemedText>
        </BrutalCard>
      </View>

      {!!err && (
        <BrutalCard style={{ borderColor: theme.danger }}>
          <ThemedText type="small" themeColor="danger">
            Couldn't reach the click data: {err}
          </ThemedText>
        </BrutalCard>
      )}

      {ab && Object.keys(ab.variants).length > 0 && <AbPanel ab={ab} />}

      <ThemedText style={styles.sectionTitle}>Creators</ThemedText>
      {loading ? (
        <View style={{ gap: Spacing.two }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={64} radius={Radius.lg} />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.four }}>
          No tracked links yet.
        </ThemedText>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {rows.map((c) => {
            const plats = tf === 'all' ? c.platforms : c.periodPlatforms;
            return (
              <Pressable
                key={c.creatorId ?? c.creatorName}
                onPress={() => setOpenCreator(c)}
                style={({ pressed }) => [styles.creatorCard, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 3), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
                <BrutalAvatar name={c.creatorName} uri={avatarFor(c)} size={42} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.creatorName} numberOfLines={1}>
                    {c.creatorName || 'Creator'}
                  </ThemedText>
                  <View style={styles.platLine}>
                    {(['ios', 'android'] as const).map((p) =>
                      plats[p] !== undefined ? (
                        <View key={p} style={styles.platMini2}>
                          <Ionicons name={platIcon(p) as never} size={12} color={theme.textSecondary} />
                          <ThemedText type="small" themeColor="textSecondary">
                            {compact(plats[p] ?? 0)}
                          </ThemedText>
                        </View>
                      ) : null,
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText style={[styles.creatorClicks, { color: theme.primary }]}>{compact(metric(c))}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    clicks
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            );
          })}
        </View>
      )}

      {openCreator && <CreatorModal creator={openCreator} avatar={avatarFor(openCreator)} initialTf={tf} onClose={() => setOpenCreator(null)} />}
    </ScrollView>
  );
}

function AbPanel({ ab }: { ab: AbResult }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const order = ['banner', 'control'].filter((v) => ab.variants[v]);
  const variants = order.length ? order : Object.keys(ab.variants);
  const rate = (v: { exposure: number; conversion: number }) => (v.exposure > 0 ? (v.conversion / v.exposure) * 100 : 0);
  const best = variants.reduce((b, v) => (rate(ab.variants[v]) > rate(ab.variants[b]) ? v : b), variants[0]);

  return (
    <BrutalCard style={{ gap: open ? Spacing.three : 0, borderWidth: Border.widthThick }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.abHead}>
        <Ionicons name="flask" size={18} color={theme.primary} />
        <ThemedText style={[styles.sectionTitle, { flex: 1 }]}>A/B test · {ab.experimentId}</ThemedText>
        {variants.length > 1 && (
          <ThemedText type="smallBold" themeColor="success" style={{ textTransform: 'capitalize' }}>
            {best} winning
          </ThemedText>
        )}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
      </Pressable>
      {open && (
        <View style={styles.abRow}>
          {variants.map((v) => {
            const d = ab.variants[v];
            const r = rate(d);
            const win = v === best && variants.length > 1;
            return (
              <View key={v} style={[styles.abCard, { borderColor: win ? theme.success : theme.border, backgroundColor: theme.background }]}>
                <ThemedText style={styles.abVariant}>{v}</ThemedText>
                <ThemedText style={[styles.abRate, { color: theme.primary }]}>{r.toFixed(1)}%</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {compact(d.conversion)} / {compact(d.exposure)} shown
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}
    </BrutalCard>
  );
}

// ---- per-creator analytics modal ---------------------------------------
function CreatorModal({ creator, avatar, initialTf, onClose }: { creator: PlCreator; avatar: string | null; initialTf: Tf; onClose: () => void }) {
  const theme = useTheme();
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tf, setTf] = useState<Tf>(initialTf);
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // drill into one bar
  const [hoverIdx, setHoverIdx] = useState<number | null>(null); // tooltip on hover

  useEffect(() => {
    if (!creator.creatorId) {
      setLoading(false);
      return;
    }
    plCreatorDetail(creator.creatorId).then((d) => {
      setDetail(d);
      setLoading(false);
    });
  }, [creator.creatorId]);

  // Changing the timeframe clears any single-day drill-down.
  useEffect(() => {
    setSelectedDay(null);
    setHoverIdx(null);
  }, [tf]);

  const series = detail?.linkSeries ?? [];

  // Per-day clicks / unique / platform split, built from the hourly snapshots
  // as a continuous day grid (0 on days with no clicks). A baseline day before
  // the window gives the first day an accurate cumulative delta.
  const dayStats = useMemo(() => {
    if (series.length === 0) return { days: [] as string[], byDay: {} as Record<string, { clicks: number; uniq: number; plat: Record<string, number> }> };
    let startMs: number;
    if (tf !== 'all') startMs = Date.now() - (TF_DAYS[tf] - 1) * 86400000;
    else {
      let min = Infinity;
      for (const l of series) for (const s of l.snaps) min = Math.min(min, new Date(s.ts).getTime());
      startMs = min === Infinity ? Date.now() : min;
    }
    const start = new Date(startMs);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const days: string[] = [];
    for (let d = new Date(start); d <= end && days.length < 92; d.setUTCDate(d.getUTCDate() + 1)) days.push(ymd(d));
    const baseline = new Date(start);
    baseline.setUTCDate(baseline.getUTCDate() - 1);
    const full = [ymd(baseline), ...days];
    const byDay: Record<string, { clicks: number; uniq: number; plat: Record<string, number> }> = {};
    for (const day of days) byDay[day] = { clicks: 0, uniq: 0, plat: {} };
    for (const l of series) {
      const plat = l.platform || 'other';
      const sorted = [...l.snaps].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      const cumV: Record<string, number> = {};
      const cumU: Record<string, number> = {};
      let idx = 0;
      let cv = 0;
      let cu = 0;
      for (const day of full) {
        const dayEnd = new Date(`${day}T23:59:59.999Z`).getTime();
        while (idx < sorted.length && new Date(sorted[idx].ts).getTime() <= dayEnd) {
          cv = sorted[idx].v;
          cu = sorted[idx].u ?? 0;
          idx++;
        }
        cumV[day] = cv;
        cumU[day] = cu;
      }
      for (let i = 1; i < full.length; i++) {
        const day = full[i];
        const dc = Math.max(0, cumV[day] - cumV[full[i - 1]]);
        const du = Math.max(0, cumU[day] - cumU[full[i - 1]]);
        byDay[day].clicks += dc;
        byDay[day].uniq += du;
        byDay[day].plat[plat] = (byDay[day].plat[plat] || 0) + dc;
      }
    }
    return { days, byDay };
  }, [series, tf]);

  // Active window = the whole timeframe, or just the one day the user drilled into.
  const activeDays = selectedDay ? [selectedDay] : dayStats.days;
  const agg = useMemo(() => {
    let clicks = 0;
    let uniq = 0;
    const plat: Record<string, number> = {};
    let visits = 0;
    let conversions = 0;
    const refs: Record<string, number> = {};
    const ctys: Record<string, number> = {};
    for (const day of activeDays) {
      const c = dayStats.byDay[day];
      if (c) {
        clicks += c.clicks;
        uniq += c.uniq;
        for (const k in c.plat) plat[k] = (plat[k] || 0) + c.plat[k];
      }
      const e = detail?.eventDays?.[day];
      if (e) {
        visits += e.visits;
        conversions += e.conversions;
        for (const k in e.refs) refs[k] = (refs[k] || 0) + e.refs[k];
        for (const k in e.ctys) ctys[k] = (ctys[k] || 0) + e.ctys[k];
      }
    }
    return { clicks, uniq, plat, visits, conversions, refs, ctys };
  }, [selectedDay, dayStats, detail]);

  const dmax = Math.max(1, ...dayStats.days.map((d) => dayStats.byDay[d]?.clicks ?? 0));
  const refRows = Object.entries(agg.refs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const refMax = Math.max(1, ...refRows.map((r) => r[1]));
  const ctyRows = Object.entries(agg.ctys)
    .map(([code, count]) => ({ code, name: detail?.countryNames?.[code] ?? code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const ctyMax = Math.max(1, ...ctyRows.map((c) => c.count));

  const tipIdx = hoverIdx ?? (selectedDay ? dayStats.days.indexOf(selectedDay) : null);
  const tipDay = tipIdx != null && tipIdx >= 0 ? dayStats.days[tipIdx] : null;
  const windowLabel = selectedDay ? prettyDay(selectedDay) : TF_LABEL[tf];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
          <View style={styles.modalHead}>
            <BrutalAvatar name={creator.creatorName} uri={avatar} size={44} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.modalName} numberOfLines={1}>
                {creator.creatorName || 'Creator'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {compact(creator.totalClicks)} clicks all-time · {compact(creator.uniqueClicks)} unique
              </ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.tfRow}>
            {(['3d', '7d', '30d', 'all'] as Tf[]).map((t) => {
              const on = tf === t;
              return (
                <Pressable key={t} onPress={() => setTf(t)} style={[styles.tfPill, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                  <ThemedText style={[styles.tfText, { color: on ? theme.primaryText : theme.textSecondary }]}>{t === 'all' ? 'All' : t === '3d' ? '3d' : t === '7d' ? '7d' : '30d'}</ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: Spacing.three, paddingVertical: Spacing.two }}>
            {loading ? (
              <Skeleton height={120} radius={Radius.md} />
            ) : (
              <>
                {/* headline + platform split */}
                <View style={styles.headline}>
                  <ThemedText style={styles.headlineVal}>{compact(agg.clicks)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    clicks · {windowLabel}
                  </ThemedText>
                </View>
                <View style={styles.platSplit}>
                  <View style={[styles.platCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <View style={styles.platCardHead}>
                      <Ionicons name="finger-print" size={15} color={theme.text} />
                      <ThemedText type="smallBold">Unique</ThemedText>
                    </View>
                    <ThemedText style={styles.platVal}>{compact(agg.uniq)}</ThemedText>
                  </View>
                  {(['ios', 'android'] as const).map((p) => (
                    <View key={p} style={[styles.platCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                      <View style={styles.platCardHead}>
                        <Ionicons name={platIcon(p) as never} size={15} color={theme.text} />
                        <ThemedText type="smallBold">{p === 'ios' ? 'iOS' : 'Android'}</ThemedText>
                      </View>
                      <ThemedText style={styles.platVal}>{compact(agg.plat[p] ?? 0)}</ThemedText>
                    </View>
                  ))}
                </View>

                {/* clicks-per-day chart with hover tooltip + click-to-drill */}
                <View>
                  <View style={styles.chartHead}>
                    <ThemedText type="smallBold" themeColor="textSecondary">CLICKS PER DAY</ThemedText>
                    {selectedDay && (
                      <Pressable onPress={() => setSelectedDay(null)} style={[styles.dayChip, { borderColor: theme.primary, backgroundColor: theme.primaryMuted }]}>
                        <Ionicons name="close" size={12} color={theme.primary} />
                        <ThemedText type="small" style={{ color: theme.primary, fontWeight: '800' }}>
                          {prettyDay(selectedDay)}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                  {dayStats.days.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.two }}>
                      No clicks in this window.
                    </ThemedText>
                  ) : (
                    <>
                      <View style={styles.chartWrap}>
                        {tipDay && (
                          <View pointerEvents="none" style={[styles.tip, { left: `${((tipIdx! + 0.5) / dayStats.days.length) * 100}%`, backgroundColor: theme.text, borderColor: theme.text }]}>
                            <ThemedText style={[styles.tipDate, { color: theme.card }]}>{prettyDay(tipDay)}</ThemedText>
                            <ThemedText style={[styles.tipVal, { color: theme.card }]}>{compact(dayStats.byDay[tipDay]?.clicks ?? 0)} clicks</ThemedText>
                            {(detail?.eventDays?.[tipDay]?.visits ?? 0) > 0 && (
                              <ThemedText style={[styles.tipSub, { color: theme.card }]}>{compact(detail?.eventDays?.[tipDay]?.visits ?? 0)} visits</ThemedText>
                            )}
                          </View>
                        )}
                        <View style={styles.chart}>
                          {dayStats.days.map((day, i) => {
                            const v = dayStats.byDay[day]?.clicks ?? 0;
                            const on = selectedDay === day;
                            const dim = hoverIdx != null && hoverIdx !== i && !on;
                            return (
                              <Pressable
                                key={day}
                                onPress={() => setSelectedDay((s) => (s === day ? null : day))}
                                onHoverIn={() => setHoverIdx(i)}
                                onHoverOut={() => setHoverIdx(null)}
                                style={styles.barCol}>
                                <View style={[styles.bar, { height: 4 + (v / dmax) * 66, backgroundColor: on ? theme.accent : theme.primary, opacity: dim ? 0.45 : 1 }]} />
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
                        {selectedDay ? 'Showing one day · tap the bar again to clear' : 'Hover a bar for detail · tap to drill into a day'}
                      </ThemedText>
                    </>
                  )}
                </View>

                {/* traffic sources (landing-page visits — distinct from redirect clicks) */}
                <View style={{ gap: 5 }}>
                  <View style={styles.chartHead}>
                    <ThemedText type="smallBold" themeColor="textSecondary">TRAFFIC SOURCES</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {compact(agg.visits)} visits · {compact(agg.conversions)} taps
                    </ThemedText>
                  </View>
                  {refRows.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      No landing-page visits in this window.
                    </ThemedText>
                  ) : (
                    refRows.map(([label, n]) => (
                      <View key={label} style={styles.barRow}>
                        <ThemedText type="small" numberOfLines={1} style={{ width: 110 }}>
                          {label}
                        </ThemedText>
                        <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                          <View style={[styles.barFill, { width: `${(n / refMax) * 100}%`, backgroundColor: theme.accent }]} />
                        </View>
                        <ThemedText type="smallBold" style={{ width: 40, textAlign: 'right' }}>
                          {n}
                        </ThemedText>
                      </View>
                    ))
                  )}
                </View>

                {/* countries with flags */}
                <View style={{ gap: 5 }}>
                  <ThemedText type="smallBold" themeColor="textSecondary">COUNTRIES</ThemedText>
                  {ctyRows.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">No country data in this window.</ThemedText>
                  ) : (
                    ctyRows.map((c) => (
                      <View key={c.code} style={styles.barRow}>
                        <View style={styles.ctyLabel}>
                          <ThemedText style={{ fontSize: 16 }}>{flagOf(c.code)}</ThemedText>
                          <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                            {c.name}
                          </ThemedText>
                        </View>
                        <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                          <View style={[styles.barFill, { width: `${(c.count / ctyMax) * 100}%`, backgroundColor: theme.success }]} />
                        </View>
                        <ThemedText type="smallBold" style={{ width: 40, textAlign: 'right' }}>
                          {c.count}
                        </ThemedText>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.three },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  tfRow: { flexDirection: 'row', gap: Spacing.one + 2, flexWrap: 'wrap' },
  tfPill: { paddingHorizontal: Spacing.two + 4, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: Border.width },
  tfText: { fontSize: 13, fontWeight: '800' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.three, height: 38, borderRadius: Radius.sm, borderWidth: Border.width, marginLeft: 'auto' },
  totals: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  totalCard: { flex: 1, minWidth: 180, gap: 2, borderWidth: Border.widthThick },
  totalLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: '#fff', opacity: 0.95 },
  totalValue: { fontSize: 34, lineHeight: 40, fontWeight: '900', color: '#fff' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '900' },
  abHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  abRow: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  abCard: { flex: 1, minWidth: 150, gap: 2, padding: Spacing.three, borderRadius: Radius.md, borderWidth: Border.width },
  abVariant: { fontSize: 15, fontWeight: '900', textTransform: 'capitalize' },
  abRate: { fontSize: 28, lineHeight: 32, fontWeight: '900' },
  creatorCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two + 2, borderRadius: Radius.lg, borderWidth: Border.width },
  creatorName: { fontSize: 16, fontWeight: '800' },
  platLine: { flexDirection: 'row', gap: Spacing.three, marginTop: 2 },
  platMini2: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creatorClicks: { fontSize: 20, lineHeight: 24, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  modal: { width: '100%', maxWidth: 640, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.md, padding: Spacing.four },
  ctyLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 120 },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  modalName: { fontSize: 18, fontWeight: '900' },
  headline: { alignItems: 'center', gap: 2 },
  headlineVal: { fontSize: 40, lineHeight: 46, fontWeight: '900' },
  platSplit: { flexDirection: 'row', gap: Spacing.two },
  platCard: { flex: 1, gap: 2, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  platCardHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  platVal: { fontSize: 22, fontWeight: '900' },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  dayChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.sm, borderWidth: Border.width },
  chartWrap: { position: 'relative', paddingTop: 34, marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 74 },
  barCol: { flex: 1, height: 74, justifyContent: 'flex-end', minWidth: 3 },
  bar: { width: '100%', borderRadius: 1, minHeight: 3 },
  tip: { position: 'absolute', top: 0, width: 92, marginLeft: -46, paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.sm, borderWidth: 1.5, alignItems: 'center', zIndex: 10 },
  tipDate: { fontSize: 11, fontWeight: '900' },
  tipVal: { fontSize: 12, fontWeight: '900' },
  tipSub: { fontSize: 10, fontWeight: '700', opacity: 0.85 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barTrack: { flex: 1, height: 14, borderRadius: Radius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.full },
});
