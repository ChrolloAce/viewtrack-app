import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { createElement, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AnalyzeModal } from '@/components/creator-database';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ChecklistEditor } from '@/components/flag-checklist';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { acctKey, detectCrossPosts } from '@/lib/crossposts';
import { evaluateFlags, isFlagged, useFlagRequirements } from '@/lib/flags';
import { captureFrame, decodeAudio, encodeWav, fetchMediaBlob, pickLocalMedia, safeName, saveBlob } from '@/lib/media-tools';
import { runSectionMatch, useSections, type SectionKind } from '@/lib/sections';
import { supabase } from '@/lib/supabase';
import { useVideoAnalyses, type AnalysisState } from '@/lib/use-analyses';
import { linkedCreatorFilters, vtAnalyzeVideo, vtDownloadMedia, vtListVideos, type CreatorFilterEntry, type VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);

type Sort = 'views' | 'recent' | 'likes';
const SORTS: DropdownOption<Sort>[] = [
  { value: 'recent', label: 'Most recent', icon: 'time' },
  { value: 'views', label: 'Top views', icon: 'eye' },
  { value: 'likes', label: 'Most liked', icon: 'heart' },
];

type PlatformFilter = 'all' | 'tiktok' | 'instagram' | 'youtube';
const PLATFORM_FILTERS: DropdownOption<PlatformFilter>[] = [
  { value: 'all', label: 'All platforms', icon: 'apps-outline' },
  { value: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { value: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { value: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
];

type FlagFilter = 'all' | 'flagged' | 'passing';
const FLAG_FILTERS: DropdownOption<FlagFilter>[] = [
  { value: 'all', label: 'All videos', icon: 'albums-outline' },
  { value: 'flagged', label: 'Flagged only', icon: 'flag' },
  { value: 'passing', label: 'Passing only', icon: 'checkmark-circle-outline' },
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
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [creatorFilter, setCreatorFilter] = useState('all');
  const [creators, setCreators] = useState<CreatorFilterEntry[]>([]);
  const [sectionFilter, setSectionFilter] = useState<Partial<Record<SectionKind, string>>>({});
  const [open, setOpen] = useState<VtVideo | null>(null);
  const [editChecklist, setEditChecklist] = useState(false);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [matching, setMatching] = useState(false);
  const [groupCross, setGroupCross] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  const [frameVid, setFrameVid] = useState<VtVideo | null>(null);
  const { map: analyses } = useVideoAnalyses();
  const { reqs } = useFlagRequirements();
  const { clusters, byVideo, reload: reloadSections } = useSections();

  // flag verdict per analyzed video — recomputed live when requirements change
  const flaggedById = useMemo(() => {
    const out: Record<string, boolean> = {};
    if (!reqs.length) return out;
    for (const [id, st] of Object.entries(analyses)) {
      // old analyses have no overlay data — treat as "not evaluated", not flagged
      if (st.status === 'done' && st.overlays) out[id] = isFlagged(evaluateFlags(st.overlays, reqs));
    }
    return out;
  }, [analyses, reqs]);

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

  useEffect(() => {
    linkedCreatorFilters().then(setCreators);
    // live: creator/account changes update the creator filter + cross-post owners
    const ch = supabase
      .channel(`videos-creators:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_links' }, () => linkedCreatorFilters().then(setCreators))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => linkedCreatorFilters().then(setCreators))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // cross-posts: same video posted to several platforms — matched per creator
  // by posting order (k-th tiktok ↔ k-th instagram within 72h)
  const crossMap = useMemo(() => {
    const owner: Record<string, string> = {};
    for (const c of creators) for (const k of c.keys) owner[k] = c.id;
    // unknown accounts fall back to grouping by handle (same name across platforms)
    return detectCrossPosts(videos, (v) => owner[acctKey(v)] ?? `acct:${(v.accountUsername ?? '').toLowerCase()}`);
  }, [videos, creators]);

  const sorted = useMemo(() => {
    let arr = [...videos];
    if (platformFilter !== 'all') arr = arr.filter((v) => v.platform === platformFilter);
    if (creatorFilter !== 'all') {
      const keys = new Set(creators.find((c) => c.id === creatorFilter)?.keys ?? []);
      arr = arr.filter((v) => keys.has(`${v.platform}:${(v.accountUsername ?? '').toLowerCase().replace(/^@/, '')}`));
    }
    if (flagFilter === 'flagged') arr = arr.filter((v) => flaggedById[v.id] === true);
    else if (flagFilter === 'passing') arr = arr.filter((v) => flaggedById[v.id] === false);
    for (const kind of ['hook', 'body', 'cta', 'outro'] as SectionKind[]) {
      const cid = sectionFilter[kind];
      if (cid) arr = arr.filter((v) => byVideo[v.id]?.[kind] === cid);
    }
    if (sort === 'recent') arr.sort((a, b) => new Date(b.uploadDate ?? 0).getTime() - new Date(a.uploadDate ?? 0).getTime());
    else if (sort === 'likes') arr.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    else arr.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    return arr;
  }, [videos, sort, flagFilter, flaggedById, sectionFilter, byVideo, platformFilter, creatorFilter, creators]);

  // grouped view: one tile per cross-post (the top-performing copy represents
  // the group; its tile shows combined views + every platform's icon)
  const display = useMemo(() => {
    if (!groupCross) return sorted;
    const seen = new Set<string>();
    const out: VtVideo[] = [];
    for (const v of sorted) {
      const g = crossMap[v.id];
      if (!g) {
        out.push(v);
        continue;
      }
      const key = g[0].id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }, [sorted, crossMap, groupCross]);

  // stat boxes reflect the FILTERED set — pick a hook and these become that hook's numbers
  const stats = useMemo(() => {
    const viewsTotal = sorted.reduce((s, v) => s + (v.views ?? 0), 0);
    const analyzed = sorted.filter((v) => analyses[v.id]?.status === 'done').length;
    const flaggedCount = sorted.filter((v) => flaggedById[v.id] === true).length;
    return { count: sorted.length, viewsTotal, avg: sorted.length ? Math.round(viewsTotal / sorted.length) : 0, analyzed, flaggedCount };
  }, [sorted, analyses, flaggedById]);

  const sectionOptions = useMemo(() => {
    const make = (kind: SectionKind, allLabel: string): DropdownOption<string>[] => [
      { value: 'all', label: allLabel, icon: 'albums-outline' },
      ...clusters
        .filter((c) => c.kind === kind && c.video_count > 1)
        .map((c) => ({ value: c.id, label: `${c.label.slice(0, 34)}${c.label.length > 34 ? '…' : ''} (${c.video_count})`, icon: 'document-text-outline' as const })),
    ];
    return { hook: make('hook', 'All hooks'), body: make('body', 'All bodies'), cta: make('cta', 'All app CTAs'), outro: make('outro', 'All outros') };
  }, [clusters]);

  async function analyzeAll() {
    const targets = sorted.filter((v) => !analyses[v.id]);
    if (!targets.length || batch) return;
    setBatch({ done: 0, total: targets.length });
    const queue = [...targets];
    // fire-and-forget per video: vt-analyze returns immediately and the Gemini
    // run continues server-side, so this just paces the queue-up.
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (queue.length) {
          const v = queue.shift()!;
          await vtAnalyzeVideo(v.id, false);
          await new Promise((r) => setTimeout(r, 800));
          setBatch((b) => (b ? { ...b, done: b.done + 1 } : b));
        }
      }),
    );
    setBatch(null);
  }

  async function matchScripts() {
    if (matching) return;
    setMatching(true);
    await runSectionMatch();
    await reloadSections();
    setMatching(false);
  }

  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /** Batch download the selected videos as mp4s, per-video WAVs, or one merged WAV (for voice cloning). */
  async function batchDownload(kind: 'videos' | 'audios' | 'merged') {
    const vids = sorted.filter((v) => sel.has(v.id));
    if (!vids.length || dlMsg) return;
    const merged: AudioBuffer[] = [];
    const failures: string[] = [];
    for (const [i, v] of vids.entries()) {
      setDlMsg(`${kind === 'videos' ? 'downloading' : 'extracting audio'} ${i + 1}/${vids.length}…`);
      try {
        const r = await vtDownloadMedia(v, 'video');
        if (!r.ok || !r.url) throw new Error(r.error ?? 'no media');
        const base = `${safeName(v.accountUsername)}-${v.id.slice(-8)}`;
        if (kind === 'videos') {
          try {
            saveBlob(await fetchMediaBlob(r.url), `${base}.mp4`);
          } catch {
            // Meta's CDN blocks our proxy IPs — the browser can still grab it directly
            window.open(r.url, '_blank');
          }
        } else {
          const buf = await decodeAudio(await fetchMediaBlob(r.url));
          if (kind === 'audios') saveBlob(encodeWav([buf]), `${base}.wav`);
          else merged.push(buf);
        }
      } catch (e) {
        const msg = v.platform === 'instagram' && kind !== 'videos'
          ? 'Instagram audio extraction is blocked by their CDN for now'
          : (e as Error).message;
        failures.push(`@${v.accountUsername}: ${msg}`);
      }
    }
    if (kind === 'merged' && merged.length) {
      setDlMsg('merging…');
      saveBlob(encodeWav(merged), `combined-${merged.length}-audios.wav`);
    }
    setDlMsg(null);
    if (failures.length && Platform.OS === 'web') window.alert(`Some downloads failed:\n${[...new Set(failures)].join('\n')}`);
  }

  /** Download the platform thumbnails of every selected video. */
  async function downloadThumbs() {
    const vids = sorted.filter((v) => sel.has(v.id) && v.thumbnail);
    if (!vids.length || dlMsg) return;
    for (const [i, v] of vids.entries()) {
      setDlMsg(`thumbnail ${i + 1}/${vids.length}…`);
      try {
        saveBlob(await fetchMediaBlob(v.thumbnail!), `${safeName(v.accountUsername)}-${v.id.slice(-8)}-thumb.jpg`);
      } catch {
        window.open(v.thumbnail!, '_blank');
      }
    }
    setDlMsg(null);
  }

  /** Queue Gemini analysis for every selected video (server-side, badges update live). */
  async function analyzeSelected() {
    const vids = sorted.filter((v) => sel.has(v.id) && analyses[v.id]?.status !== 'processing');
    if (!vids.length || dlMsg) return;
    for (const [i, v] of vids.entries()) {
      setDlMsg(`queuing analysis ${i + 1}/${vids.length}…`);
      await vtAnalyzeVideo(v.id, false);
      await new Promise((r) => setTimeout(r, 600));
    }
    setDlMsg(null);
  }

  /** Convert already-downloaded video files to WAV locally — works for the
   *  Instagram mp4s whose CDN blocks server-side extraction. */
  async function localExtract() {
    if (dlMsg || Platform.OS !== 'web') return;
    const files = await pickLocalMedia();
    if (!files.length) return;
    const mergeAll = files.length > 1 && window.confirm(`Merge all ${files.length} files into ONE wav?\n(Cancel = one wav per file)`);
    const bufs: AudioBuffer[] = [];
    const failures: string[] = [];
    for (const [i, f] of files.entries()) {
      setDlMsg(`extracting ${i + 1}/${files.length}…`);
      try {
        const buf = await decodeAudio(f);
        if (mergeAll) bufs.push(buf);
        else saveBlob(encodeWav([buf]), `${f.name.replace(/\.[^.]+$/, '')}.wav`);
      } catch (e) {
        failures.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (mergeAll && bufs.length) {
      setDlMsg('merging…');
      saveBlob(encodeWav(bufs), `combined-${bufs.length}-audios.wav`);
    }
    setDlMsg(null);
    if (failures.length) window.alert(`Some files failed:\n${failures.join('\n')}`);
  }

  const tfLabel = (TFS.find((t) => t.value === timeframe)?.label ?? '').toLowerCase();

  return (
    <View style={styles.flex}>
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>Videos</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        every tracked video across all creators · tap one to open and run an AI breakdown
      </ThemedText>

      {/* filters + actions — one tidy row; script filters live in a panel */}
      <View style={styles.controls}>
        <Dropdown value={timeframe} options={TF_OPTS} onChange={setTimeframe} minWidth={170} />
        <Dropdown value={sort} options={SORTS} onChange={setSort} minWidth={170} />
        <ScriptFilterButton
          flagFilter={flagFilter}
          setFlagFilter={setFlagFilter}
          hasChecklist={reqs.length > 0}
          groupCross={groupCross}
          setGroupCross={setGroupCross}
          platformFilter={platformFilter}
          setPlatformFilter={setPlatformFilter}
          creatorFilter={creatorFilter}
          setCreatorFilter={setCreatorFilter}
          creators={creators}
          sectionFilter={sectionFilter}
          setSectionFilter={setSectionFilter}
          sectionOptions={sectionOptions}
        />
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              setSelectMode((m) => !m);
              setSel(new Set());
            }}
            style={[styles.checklistBtn, { borderColor: theme.border }, selectMode && { backgroundColor: theme.text }]}>
            <Ionicons name="checkbox-outline" size={15} color={selectMode ? theme.background : theme.text} />
            <ThemedText style={[styles.checklistBtnText, selectMode && { color: theme.background }]}>select</ThemedText>
          </Pressable>
          <Pressable onPress={() => setEditChecklist(true)} style={[styles.checklistBtn, { borderColor: theme.border }]}>
            <Ionicons name="flag-outline" size={15} color={theme.text} />
            <ThemedText style={styles.checklistBtnText}>checklist</ThemedText>
          </Pressable>
          <Pressable onPress={matchScripts} disabled={matching} style={[styles.checklistBtn, { borderColor: theme.border }, matching && { opacity: 0.5 }]}>
            <Ionicons name="git-compare-outline" size={15} color={theme.text} />
            <ThemedText style={styles.checklistBtnText}>{matching ? 'matching…' : 'match scripts'}</ThemedText>
          </Pressable>
          <Pressable onPress={analyzeAll} disabled={!!batch} style={[styles.checklistBtn, { borderColor: theme.border, backgroundColor: theme.primary }, !!batch && { opacity: 0.6 }]}>
            <Ionicons name="sparkles" size={15} color={theme.primaryText} />
            <ThemedText style={[styles.checklistBtnText, { color: theme.primaryText }]}>
              {batch ? `queuing ${batch.done}/${batch.total}…` : 'analyze all'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* stat boxes — reflect whatever filters are active */}
      {!loading && (
        <View style={styles.statRow}>
          <StatBox label={timeframe === 'all' ? `videos (of ${total})` : `videos · ${tfLabel}`} value={`${stats.count}${truncated ? '+' : ''}`} icon="film-outline" />
          <StatBox label="total views" value={compact(stats.viewsTotal)} icon="eye" />
          <StatBox label="avg views" value={compact(stats.avg)} icon="pulse" />
          <StatBox label="analyzed" value={`${stats.analyzed}/${stats.count}`} icon="sparkles" />
          <StatBox label="flagged" value={`${stats.flaggedCount}`} icon="flag" danger={stats.flaggedCount > 0} />
        </View>
      )}

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
          {display.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              state={analyses[v.id]}
              flagged={flaggedById[v.id] === true}
              siblings={groupCross ? crossMap[v.id] : undefined}
              crossCount={crossMap[v.id]?.length}
              selected={selectMode ? sel.has(v.id) : undefined}
              onPress={() => (selectMode ? toggleSel(v.id) : setOpen(v))}
            />
          ))}
        </View>
      )}

      {open && <AnalyzeModal video={open} siblings={crossMap[open.id]} onClose={() => setOpen(null)} />}
      {editChecklist && <ChecklistEditor onClose={() => setEditChecklist(false)} />}
    </ScrollView>

    {/* floating neo-brutalist selection bar */}
    {selectMode && (
      <View style={[styles.floatBar, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5)]}>
        <View style={[styles.selCount, { backgroundColor: theme.primary, borderColor: theme.border }]}>
          <ThemedText style={[styles.selCountText, { color: theme.primaryText }]}>{sel.size}</ThemedText>
        </View>
        <ThemedText style={styles.selBarText}>selected</ThemedText>
        {dlMsg ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={theme.primary} />
            <ThemedText style={styles.selBarText}>{dlMsg}</ThemedText>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selScroll} contentContainerStyle={styles.selScrollInner}>
            <Pressable onPress={analyzeSelected} disabled={!sel.size} style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.text, borderColor: theme.border }, brutalShadow(theme.shadow, 2), !sel.size && { opacity: 0.5 }, pressed && styles.pressIn]}>
              <Ionicons name="sparkles" size={13} color={theme.background} />
              <ThemedText style={[styles.selBtnText, { color: theme.background }]}>analyze</ThemedText>
            </Pressable>
            <Pressable onPress={() => batchDownload('videos')} disabled={!sel.size} style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.primary, borderColor: theme.border }, brutalShadow(theme.shadow, 2), !sel.size && { opacity: 0.5 }, pressed && styles.pressIn]}>
              <Ionicons name="videocam" size={13} color={theme.primaryText} />
              <ThemedText style={[styles.selBtnText, { color: theme.primaryText }]}>videos</ThemedText>
            </Pressable>
            <Pressable onPress={() => batchDownload('audios')} disabled={!sel.size} style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.primary, borderColor: theme.border }, brutalShadow(theme.shadow, 2), !sel.size && { opacity: 0.5 }, pressed && styles.pressIn]}>
              <Ionicons name="musical-notes" size={13} color={theme.primaryText} />
              <ThemedText style={[styles.selBtnText, { color: theme.primaryText }]}>audios (wav)</ThemedText>
            </Pressable>
            <Pressable onPress={() => batchDownload('merged')} disabled={sel.size < 2} style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.success, borderColor: theme.border }, brutalShadow(theme.shadow, 2), sel.size < 2 && { opacity: 0.5 }, pressed && styles.pressIn]}>
              <Ionicons name="git-merge" size={13} color="#fff" />
              <ThemedText style={[styles.selBtnText, { color: '#fff' }]}>one merged wav</ThemedText>
            </Pressable>
            <Pressable onPress={downloadThumbs} disabled={!sel.size} style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 2), !sel.size && { opacity: 0.5 }, pressed && styles.pressIn]}>
              <Ionicons name="image-outline" size={13} color={theme.text} />
              <ThemedText style={[styles.selBtnText, { color: theme.text }]}>thumbnails</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setFrameVid(sorted.find((v) => sel.has(v.id)) ?? null)}
              disabled={sel.size !== 1}
              style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 2), sel.size !== 1 && { opacity: 0.5 }, pressed && styles.pressIn]}>
              <Ionicons name="camera-outline" size={13} color={theme.text} />
              <ThemedText style={[styles.selBtnText, { color: theme.text }]}>grab frame…</ThemedText>
            </Pressable>
            <Pressable onPress={localExtract} style={({ pressed }) => [styles.selBtn, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 2), pressed && styles.pressIn]}>
              <Ionicons name="folder-open-outline" size={13} color={theme.text} />
              <ThemedText style={[styles.selBtnText, { color: theme.text }]}>wav from files…</ThemedText>
            </Pressable>
          </ScrollView>
        )}
        <Pressable
          onPress={() => {
            setSelectMode(false);
            setSel(new Set());
          }}
          style={({ pressed }) => [styles.selClose, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}
          hitSlop={8}>
          <Ionicons name="close" size={16} color={theme.text} />
        </Pressable>
      </View>
    )}

    {frameVid && <FramePicker video={frameVid} onClose={() => setFrameVid(null)} />}
    </View>
  );
}

/** Load the selected video into a real player; pause anywhere and save that
 *  exact frame as a full-resolution PNG. */
function FramePicker({ video, onClose }: { video: VtVideo; onClose: () => void }) {
  const theme = useTheme();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const vidRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let active = true;
    (async () => {
      try {
        const r = await vtDownloadMedia(video, 'video');
        if (!r.ok || !r.url) throw new Error(r.error ?? 'no media for this video');
        const blob = await fetchMediaBlob(r.url);
        if (!active) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch (e) {
        if (active) setErr((e as Error).message);
      }
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [video]);

  async function grab() {
    if (!vidRef.current) return;
    try {
      const t = Math.floor(vidRef.current.currentTime * 10) / 10;
      saveBlob(await captureFrame(vidRef.current), `${safeName(video.accountUsername)}-frame-${t}s.png`);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.panelBackdrop} onPress={onClose}>
        <Pressable style={[styles.framePanel, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5)]} onPress={() => {}}>
          <View style={styles.panelHead}>
            <ThemedText style={styles.panelTitle}>grab a frame · @{video.accountUsername}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          {err ? (
            <ThemedText type="small" themeColor="danger">
              {err}
            </ThemedText>
          ) : !src ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
              <ActivityIndicator color={theme.primary} />
              <ThemedText type="small" themeColor="textSecondary">
                loading video…
              </ThemedText>
            </View>
          ) : (
            createElement('video', {
              ref: vidRef,
              src,
              controls: true,
              playsInline: true,
              style: { width: '100%', maxHeight: 460, borderRadius: 10, background: '#000' },
            })
          )}
          <Pressable
            onPress={grab}
            disabled={!src}
            style={({ pressed }) => [styles.frameBtn, { backgroundColor: src ? theme.primary : theme.backgroundElement, borderColor: theme.border }, src ? brutalShadow(theme.shadow, 3) : null, pressed && styles.pressIn]}>
            <Ionicons name="camera" size={16} color={src ? theme.primaryText : theme.textSecondary} />
            <ThemedText style={{ color: src ? theme.primaryText : theme.textSecondary, fontWeight: '900', fontSize: 15 }}>
              {'  '}download this frame (png)
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            scrub / pause exactly where you want, then hit download — saved at full video resolution.
          </ThemedText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type SectionOptions = Record<SectionKind, DropdownOption<string>[]>;

/** One compact "filter by script" button — opens a panel of sub-dropdowns
 *  (flags + hook/body/app-CTA/outro) instead of crowding the toolbar. */
function ScriptFilterButton({
  flagFilter,
  setFlagFilter,
  hasChecklist,
  groupCross,
  setGroupCross,
  platformFilter,
  setPlatformFilter,
  creatorFilter,
  setCreatorFilter,
  creators,
  sectionFilter,
  setSectionFilter,
  sectionOptions,
}: {
  flagFilter: FlagFilter;
  setFlagFilter: (v: FlagFilter) => void;
  hasChecklist: boolean;
  groupCross: boolean;
  setGroupCross: (v: boolean) => void;
  platformFilter: PlatformFilter;
  setPlatformFilter: (v: PlatformFilter) => void;
  creatorFilter: string;
  setCreatorFilter: (v: string) => void;
  creators: CreatorFilterEntry[];
  sectionFilter: Partial<Record<SectionKind, string>>;
  setSectionFilter: Dispatch<SetStateAction<Partial<Record<SectionKind, string>>>>;
  sectionOptions: SectionOptions;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const KINDS: { kind: SectionKind; label: string }[] = [
    { kind: 'hook', label: 'hook' },
    { kind: 'body', label: 'body' },
    { kind: 'cta', label: 'app CTA' },
    { kind: 'outro', label: 'outro' },
  ];
  const creatorOptions: DropdownOption<string>[] = [
    { value: 'all', label: 'All creators', icon: 'people-outline' },
    ...creators.map((c) => ({ value: c.id, label: c.name, icon: 'person-outline' as const })),
  ];
  const activeCount =
    (flagFilter !== 'all' ? 1 : 0) +
    (platformFilter !== 'all' ? 1 : 0) +
    (creatorFilter !== 'all' ? 1 : 0) +
    KINDS.filter(({ kind }) => !!sectionFilter[kind]).length;
  const clearAll = () => {
    setFlagFilter('all');
    setPlatformFilter('all');
    setCreatorFilter('all');
    setSectionFilter({});
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.filterBtn,
          { backgroundColor: theme.card, borderColor: activeCount ? theme.primary : theme.border },
          brutalShadow(theme.shadow, 3),
          pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
        ]}>
        <Ionicons name="funnel-outline" size={15} color={activeCount ? theme.primary : theme.text} />
        <ThemedText style={[styles.checklistBtnText, activeCount ? { color: theme.primary } : null]}>filters</ThemedText>
        {activeCount > 0 && (
          <View style={[styles.filterCount, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.filterCountText}>{activeCount}</ThemedText>
          </View>
        )}
        <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
      </Pressable>

      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.panelBackdrop} onPress={() => setOpen(false)}>
            <Pressable style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5)]} onPress={() => {}}>
              <View style={styles.panelHead}>
                <ThemedText style={styles.panelTitle}>filters</ThemedText>
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
              <View style={styles.filterRow}>
                <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>cross-post</ThemedText>
                <Dropdown
                  value={groupCross ? 'grouped' : 'separate'}
                  options={[
                    { value: 'grouped', label: 'One tile per video (combined views)', icon: 'swap-horizontal' },
                    { value: 'separate', label: 'Separate tile per platform', icon: 'copy-outline' },
                  ]}
                  onChange={(v) => setGroupCross(v === 'grouped')}
                  minWidth={240}
                />
              </View>
              <View style={styles.filterRow}>
                <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>platform</ThemedText>
                <Dropdown value={platformFilter} options={PLATFORM_FILTERS} onChange={setPlatformFilter} minWidth={240} />
              </View>
              {creatorOptions.length > 1 && (
                <View style={styles.filterRow}>
                  <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>creator</ThemedText>
                  <Dropdown value={creatorFilter} options={creatorOptions} onChange={setCreatorFilter} minWidth={240} />
                </View>
              )}
              {hasChecklist && (
                <View style={styles.filterRow}>
                  <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>flags</ThemedText>
                  <Dropdown value={flagFilter} options={FLAG_FILTERS} onChange={setFlagFilter} minWidth={240} />
                </View>
              )}
              {KINDS.map(({ kind, label }) =>
                sectionOptions[kind].length > 1 ? (
                  <View key={kind} style={styles.filterRow}>
                    <ThemedText style={[styles.filterLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
                    <Dropdown
                      value={sectionFilter[kind] ?? 'all'}
                      options={sectionOptions[kind]}
                      onChange={(v) => setSectionFilter((f) => ({ ...f, [kind]: v === 'all' ? undefined : v }))}
                      minWidth={240}
                    />
                  </View>
                ) : null,
              )}
              {KINDS.every(({ kind }) => sectionOptions[kind].length <= 1) && (
                <ThemedText type="small" themeColor="textSecondary">
                  No script clusters yet — analyze some videos, then hit “match scripts”.
                </ThemedText>
              )}
              <View style={styles.panelFoot}>
                <Pressable onPress={clearAll} hitSlop={6}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    clear all
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => setOpen(false)} style={[styles.doneBtn, { backgroundColor: theme.primary }]}>
                  <ThemedText style={{ color: theme.primaryText, fontWeight: '900', fontSize: 14 }}>done</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

function StatBox({ label, value, icon, danger }: { label: string; value: string; icon: string; danger?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.statBox, { borderColor: theme.border, backgroundColor: theme.card }, brutalShadow(theme.shadow, 3)]}>
      <View style={styles.statTop}>
        <Ionicons name={icon as never} size={15} color={danger ? theme.danger : theme.primary} />
        <ThemedText style={[styles.statValue, danger && { color: theme.danger }]}>{value}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function VideoCard({ video: v, state, flagged, siblings, crossCount, selected, onPress }: { video: VtVideo; state?: AnalysisState; flagged?: boolean; siblings?: VtVideo[]; crossCount?: number; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  // grouped cross-post tile: combined views + an icon per platform
  const combinedViews = siblings?.length ? siblings.reduce((s, x) => s + (x.views ?? 0), 0) : v.views;
  const platforms = siblings?.length ? [...new Set(siblings.map((x) => x.platform))] : [v.platform];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { borderColor: selected ? theme.primary : flagged ? theme.danger : theme.border, backgroundColor: theme.card },
        selected && { borderWidth: Border.widthThick },
        brutalShadow(theme.shadow, 3),
        pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
      ]}>
      <View style={styles.thumbWrap}>
        {selected !== undefined && (
          <View style={[styles.selCheck, { backgroundColor: selected ? theme.primary : 'rgba(0,0,0,0.45)', borderColor: '#fff' }]}>
            {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        )}
        {v.thumbnail ? (
          <Image source={{ uri: v.thumbnail }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
          </View>
        )}
        <View style={[styles.platBadge, { backgroundColor: '#fff', borderColor: theme.border, width: platforms.length > 1 ? 24 + (platforms.length - 1) * 17 : 24 }]}>
          {platforms.map((p) => (
            <Ionicons key={p} name={PLATFORM_ICON[p] as never} size={13} color={PLATFORM_COLOR[p] ?? theme.text} />
          ))}
        </View>
        <AnalyzedBadge state={state} />
        {!!crossCount && crossCount > 1 && (
          <View style={[styles.crossBadge, { borderColor: theme.card }]}>
            <Ionicons name="swap-horizontal" size={11} color="#fff" />
            <ThemedText style={styles.crossText}>{crossCount}</ThemedText>
          </View>
        )}
        {flagged && (
          <View style={[styles.flagBadge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
            <Ionicons name="flag" size={11} color="#fff" />
            <ThemedText style={styles.flagText}>FLAGGED</ThemedText>
          </View>
        )}
        <View style={styles.viewsOverlay}>
          <Ionicons name="eye" size={12} color="#fff" />
          <ThemedText style={styles.viewsText}>{compact(combinedViews ?? 0)}</ThemedText>
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
  platBadge: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  aiBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  viewsOverlay: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  flagBadge: { position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1.5 },
  crossBadge: { position: 'absolute', top: 34, right: 6, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1.5, backgroundColor: '#A855F7' },
  crossText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  flagText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  checklistBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: Spacing.two + 2, borderRadius: Radius.sm, borderWidth: Border.width },
  checklistBtnText: { fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginLeft: 'auto', flexWrap: 'wrap' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: Border.width },
  filterCount: { minWidth: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterCountText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  panelBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 140, padding: Spacing.three },
  panel: { width: '100%', maxWidth: 420, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontSize: 18, lineHeight: 24, fontWeight: '900' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  filterLabel: { width: 70, fontSize: 12, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  panelFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  doneBtn: { paddingHorizontal: Spacing.four, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  floatBar: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: Spacing.two, maxWidth: '94%', borderRadius: Radius.lg, borderWidth: Border.widthThick, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, zIndex: 40 },
  selCount: { minWidth: 28, height: 28, borderRadius: 14, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  selCountText: { fontSize: 13, fontWeight: '900' },
  selBarText: { fontSize: 14, fontWeight: '800' },
  selBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.two + 2, height: 34, borderRadius: Radius.sm, borderWidth: Border.width },
  selBtnText: { fontSize: 13, fontWeight: '800' },
  selClose: { width: 30, height: 30, borderRadius: 15, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  selScroll: { flexShrink: 1, flexGrow: 0, maxWidth: 760 },
  selScrollInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 3, paddingHorizontal: 2 },
  framePanel: { width: '100%', maxWidth: 560, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  frameBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: Radius.md, borderWidth: Border.width },
  pressIn: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  selCheck: { position: 'absolute', top: 6, left: '50%', marginLeft: -12, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  statBox: { minWidth: 130, flexGrow: 1, maxWidth: 200, gap: 2, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.two + 4, borderRadius: Radius.md, borderWidth: Border.width },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statValue: { fontSize: 21, lineHeight: 26, fontWeight: '900' },
  viewsText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  acct: { fontSize: 13, fontWeight: '800', padding: 7 },
});
