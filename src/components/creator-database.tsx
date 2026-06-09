import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { createElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useCreatorsData, type Creator, type ExistingLink, type RequestedLink } from '@/app/(tabs)/creators';
import { AccountManager } from '@/components/account-manager';
import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ViewsBreakdown } from '@/components/views-breakdown';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { addPendingCreator, deletePendingCreator, usePendingCreators, type PendingCreator } from '@/lib/creators';
import { recordPayout, usePayouts } from '@/lib/payouts';
import { badgeFor } from '@/lib/badges';
import { useJobs } from '@/lib/jobs';
import { listRecordings, type Recording } from '@/lib/recordings';
import { useVideoAnalyses, type AnalysisState } from '@/lib/use-analyses';
import { supabase } from '@/lib/supabase';
import { detectPlatform, getVideoAnalysis, overlayItems, segTime, textOf, transcriptSegs, vtAccounts, vtAnalyzeVideo, vtCreator, vtCreatorActivity, vtListCreators, vtRefreshCreator, vtRefreshProject, type CreatorActivity, type CreatorView, type VideoAnalysis, type VtCreator, type VtProject, type VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
// account_links isn't in the generated types — cast around it.
const sb = supabase as unknown as { from: (t: string) => any };

function socialUrl(l: ExistingLink): string {
  if (l.url) return l.url;
  const u = (l.username ?? '').replace('@', '');
  if (l.platform === 'tiktok') return `https://www.tiktok.com/@${u}`;
  if (l.platform === 'instagram') return `https://www.instagram.com/${u}`;
  if (l.platform === 'youtube') return `https://www.youtube.com/@${u}`;
  return `https://${u}`;
}
function openUrl(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank');
  else Linking.openURL(url);
}

/** Raw <video> on web (RN has no video tag). `poster` mode = muted first frame. */
function WebVideo({ src, controls, style }: { src: string; controls?: boolean; style?: Record<string, unknown> }) {
  if (Platform.OS !== 'web') return null;
  // append #t=0.1 in poster mode so the browser paints the first frame
  return createElement('video', {
    src: controls ? src : `${src}#t=0.1`,
    controls,
    autoPlay: controls,
    muted: !controls,
    playsInline: true,
    preload: 'metadata',
    style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style },
  });
}

type Prog = { level: number; xp: number; views_total: number; posts_total: number };
type StatusFilter = 'all' | 'active' | 'removed';
type Timeframe = '3d' | '7d' | '14d' | '30d' | 'all';
const TF_OPTS: Timeframe[] = ['3d', '7d', '14d', '30d', 'all'];
const TF_DAYS: Record<Timeframe, number | null> = { '3d': 3, '7d': 7, '14d': 14, '30d': 30, all: null };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function ago(iso: string | null) {
  if (!iso) return 'never';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'active now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Progress (level/views/posts) for every creator, keyed by profile id. */
function useProgressMap() {
  const [map, setMap] = useState<Record<string, Prog>>({});
  useEffect(() => {
    supabase
      .from('creator_progress')
      .select('profile_id, level, xp, views_total, posts_total')
      .then(({ data }: { data: any[] | null }) => {
        const m: Record<string, Prog> = {};
        (data ?? []).forEach((r) => (m[r.profile_id] = { level: r.level, xp: r.xp, views_total: r.views_total, posts_total: r.posts_total }));
        setMap(m);
      });
  }, []);
  return map;
}

export function CreatorDatabase() {
  const theme = useTheme();
  const { creators, projects, linksByCreator, requestedByCreator, loading, reload } = useCreatorsData();
  const progress = useProgressMap();
  const [activity, setActivity] = useState<Record<string, CreatorActivity>>({});
  const [actLoading, setActLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const { pending } = usePendingCreators();

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    const r = await vtRefreshProject();
    setSyncing(false);
    setSyncMsg(r.ok ? 'Sync started — fresh stats land in a minute or two. Hit Refresh after.' : 'Sync failed — try again.');
    setTimeout(() => setSyncMsg(null), 6000);
  }

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  async function bulkAccess(disabled: boolean) {
    const ids = [...picked];
    if (Platform.OS === 'web' && !window.confirm(`${disabled ? 'Remove access for' : 'Restore access for'} ${ids.length} creator${ids.length === 1 ? '' : 's'}?`)) return;
    await (supabase as unknown as { from: (t: string) => any }).from('profiles').update({ disabled }).in('id', ids);
    setPicked(new Set());
    reload();
  }

  useEffect(() => {
    let active = true;
    setActLoading(true);
    vtCreatorActivity().then((a) => {
      if (!active) return;
      setActivity(a);
      setActLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const selected = creators.find((c) => c.id === selectedId) ?? null;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators.filter((c) => {
      if (status === 'active' && c.disabled) return false;
      if (status === 'removed' && !c.disabled) return false;
      if (q && !(c.full_name ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [creators, query, status]);

  const activeCount = creators.filter((c) => !c.disabled).length;
  const noAccounts = creators.filter((c) => (linksByCreator[c.id] ?? []).length === 0).length;
  const totalEarnings = Object.values(activity).reduce((s, a) => s + (a.earnings ?? 0), 0);
  const listLoading = loading && creators.length === 0;

  if (selected) {
    return (
      <CreatorDetail
        creator={selected}
        projects={projects}
        existing={linksByCreator[selected.id] ?? []}
        prog={progress[selected.id]}
        onChanged={reload}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.dbScroll}>
      <View style={styles.dbHead}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.dbTitle}>Creator Database</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Manage and track every creator on the platform
          </ThemedText>
        </View>
        <Pressable onPress={() => setAddOpen(true)} style={({ pressed }) => [styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="person-add" size={16} color={theme.text} />
          <ThemedText style={styles.refreshText}>Add creator</ThemedText>
        </Pressable>
        <Pressable onPress={syncNow} disabled={syncing} style={({ pressed }) => [styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="cloud-download-outline" size={16} color={syncing ? theme.textSecondary : theme.text} />
          <ThemedText style={[styles.refreshText, syncing && { color: theme.textSecondary }]}>{syncing ? 'Syncing…' : 'Sync now'}</ThemedText>
        </Pressable>
        <Pressable onPress={() => setBulkOpen(true)} style={({ pressed }) => [styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add" size={18} color={theme.primaryText} />
          <ThemedText style={[styles.refreshText, { color: theme.primaryText }]}>Add accounts</ThemedText>
        </Pressable>
        <Pressable onPress={reload} style={({ pressed }) => [styles.refreshBtn, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}>
          <Ionicons name="refresh" size={16} color={theme.text} />
          <ThemedText style={styles.refreshText}>Refresh</ThemedText>
        </Pressable>
      </View>

      <BulkAddAccounts visible={bulkOpen} creators={creators} projects={projects} onClose={() => setBulkOpen(false)} onDone={reload} />
      <AddCreatorModal visible={addOpen} onClose={() => setAddOpen(false)} />

      {syncMsg && (
        <View style={[styles.syncBanner, { backgroundColor: theme.primaryMuted, borderColor: theme.primary }]}>
          <Ionicons name="sync" size={15} color={theme.primary} />
          <ThemedText type="small" style={{ color: theme.primary, fontWeight: '700', flex: 1 }}>
            {syncMsg}
          </ThemedText>
        </View>
      )}

      {picked.size > 0 && (
        <View style={[styles.selBar, { backgroundColor: theme.text, borderColor: theme.border }]}>
          <ThemedText style={[styles.selBarText, { color: theme.background }]}>{picked.size} selected</ThemedText>
          <Pressable onPress={() => bulkAccess(true)} style={[styles.selBarBtn, { backgroundColor: theme.danger }]}>
            <ThemedText style={styles.selBarBtnText}>Remove access</ThemedText>
          </Pressable>
          <Pressable onPress={() => bulkAccess(false)} style={[styles.selBarBtn, { backgroundColor: theme.success }]}>
            <ThemedText style={styles.selBarBtnText}>Restore</ThemedText>
          </Pressable>
          <Pressable onPress={() => setPicked(new Set())} style={[styles.selBarBtn, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={[styles.selBarBtnText, { color: theme.text }]}>Clear</ThemedText>
          </Pressable>
        </View>
      )}

      {/* summary stats */}
      <View style={styles.statRow}>
        <Stat icon="people" label="Total Creators" value={`${creators.length}`} loading={listLoading} />
        <Stat icon="checkmark-circle" label="Active" value={`${activeCount}`} tone={theme.success} loading={listLoading} />
        <Stat icon="link-outline" label="No Accounts" value={`${noAccounts}`} tone={theme.accent} loading={listLoading} />
        <Stat icon="cash-outline" label="Total Paid Out" value={`$${totalEarnings.toLocaleString()}`} tone={theme.success} loading={actLoading} />
      </View>

      {/* search + filters */}
      <View style={styles.toolbar}>
        <View style={[styles.searchWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search by name…" placeholderTextColor={theme.textSecondary} style={[styles.search, { color: theme.text }]} />
        </View>
        {(['all', 'active', 'removed'] as StatusFilter[]).map((s) => {
          const on = status === s;
          return (
            <Pressable key={s} onPress={() => setStatus(s)} style={[styles.filterPill, { borderColor: theme.border, backgroundColor: on ? theme.primary : theme.card }]}>
              <ThemedText style={[styles.filterText, { color: on ? theme.primaryText : theme.text }]}>{s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Removed'}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* table */}
      <BrutalCard style={styles.table} shadow={3}>
        <View style={[styles.tr, styles.thead, { borderBottomColor: theme.border }]}>
          <ThemedText style={[styles.th, styles.colName]}>NAME</ThemedText>
          <ThemedText style={[styles.th, styles.colActivity]}>POST ACTIVITY</ThemedText>
          <ThemedText style={[styles.th, styles.colTrend]}>VIEWS TREND</ThemedText>
          <ThemedText style={[styles.th, styles.colAcc]}>ACCOUNTS</ThemedText>
          <ThemedText style={[styles.th, styles.colSm]}>LEVEL</ThemedText>
          <ThemedText style={[styles.th, styles.colSm]}>STATUS</ThemedText>
          <View style={styles.colChevron} />
        </View>
        {/* manually-added, not-yet-claimed creators */}
        {status !== 'removed' &&
          pending
            .filter((pc) => !query.trim() || pc.full_name.toLowerCase().includes(query.trim().toLowerCase()))
            .map((pc) => <PendingRow key={pc.id} pc={pc} />)}
        {listLoading ? (
          [0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[styles.tr, { borderBottomColor: theme.border }]}>
              <View style={[styles.colName, styles.nameCell]}>
                <Skeleton width={38} height={38} radius={19} />
                <View style={{ gap: 5 }}>
                  <Skeleton width={120} height={14} radius={Radius.sm} />
                  <Skeleton width={60} height={10} radius={Radius.sm} />
                </View>
              </View>
              <View style={styles.colActivity}>
                <Skeleton width={80} height={16} radius={Radius.sm} />
              </View>
              <View style={styles.colTrend}>
                <Skeleton width={70} height={26} radius={Radius.sm} />
              </View>
              <View style={styles.colAcc}>
                <Skeleton width={70} height={22} radius={Radius.full} />
              </View>
              <View style={styles.colSm}>
                <Skeleton width={40} height={20} radius={Radius.sm} />
              </View>
              <View style={styles.colSm}>
                <Skeleton width={34} height={18} radius={Radius.full} />
              </View>
              <View style={styles.colChevron} />
            </View>
          ))
        ) : rows.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: Spacing.five }}>
            No creators match.
          </ThemedText>
        ) : (
          rows.map((c) => {
            const links = linksByCreator[c.id] ?? [];
            const requested = requestedByCreator[c.id] ?? [];
            const p = progress[c.id];
            const act = activity[c.id];
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelectedId(c.id)}
                style={(s) => [styles.tr, { borderBottomColor: theme.border }, (s as { hovered?: boolean }).hovered && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.colName, styles.nameCell]}>
                  <Pressable
                    onPress={(e) => {
                      (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
                      togglePick(c.id);
                    }}
                    style={[styles.checkBox, picked.has(c.id) && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                    {picked.has(c.id) && <Ionicons name="checkmark" size={12} color={theme.primaryText} />}
                  </Pressable>
                  <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={38} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.nameText} numberOfLines={1}>
                      {c.full_name || 'Unnamed creator'}
                    </ThemedText>
                    <View style={styles.statusRow}>
                      <View style={[styles.dot, { backgroundColor: c.disabled ? theme.danger : theme.success }]} />
                      <ThemedText type="small" themeColor="textSecondary">
                        {c.disabled ? 'removed' : 'active'}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <View style={styles.colActivity}>
                  <PostActivity act={act} loading={actLoading} />
                </View>
                <View style={styles.colTrend}>
                  <Sparkline values={act?.trend ?? []} avg={act?.avg ?? 0} loading={actLoading} />
                </View>
                <View style={styles.colAcc}>
                  <AccountsCell links={links} requested={requested} />
                </View>
                <View style={styles.colSm}>
                  <View style={styles.lvBox}>
                    <Image source={badgeFor(p?.level ?? 1).source} style={styles.lvBadgeBg} contentFit="contain" />
                    <ThemedText style={[styles.lvNum, { color: badgeFor(p?.level ?? 1).color }]}>{p?.level ?? 1}</ThemedText>
                  </View>
                </View>
                <View style={styles.colSm}>
                  <View style={[styles.statusPill, { backgroundColor: c.disabled ? theme.danger : theme.success }]}>
                    <ThemedText style={styles.statusPillText}>{c.disabled ? 'OFF' : 'ON'}</ThemedText>
                  </View>
                </View>
                <View style={styles.colChevron}>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                </View>
              </Pressable>
            );
          })
        )}
      </BrutalCard>
    </ScrollView>
  );
}

function parseHandle(line: string): { platform: string | null; username: string } | null {
  const s = line.trim();
  if (!s) return null;
  if (/https?:\/\//i.test(s) || s.includes('.com') || s.includes('tiktok') || s.includes('instagram') || s.includes('youtu')) {
    const platform = detectPlatform(s);
    const parts = s.replace(/^https?:\/\//i, '').split('/').filter(Boolean);
    const at = parts.find((p) => p.startsWith('@'));
    const username = (at ? at.slice(1) : parts[1] || parts[0] || '').replace('@', '');
    return { platform, username: username.toLowerCase() };
  }
  return { platform: null, username: s.replace('@', '').toLowerCase() };
}

/** A manually-added creator who hasn't signed up yet — shows the invite code. */
function PendingRow({ pc }: { pc: PendingCreator }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (Platform.OS === 'web') (navigator as unknown as { clipboard?: { writeText: (s: string) => void } }).clipboard?.writeText(pc.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={[styles.tr, { borderBottomColor: theme.border }]}>
      <View style={[styles.colName, styles.nameCell]}>
        <View style={[styles.invitedAvatar, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="hourglass-outline" size={18} color={theme.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.nameText} numberOfLines={1}>
            {pc.full_name}
          </ThemedText>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: theme.accent }]} />
            <ThemedText type="small" themeColor="textSecondary">
              invited · not claimed
            </ThemedText>
          </View>
        </View>
      </View>
      <View style={styles.colActivity} />
      <View style={styles.colTrend} />
      <View style={styles.colAcc}>
        <Pressable onPress={copy} style={[styles.codeChip, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={styles.codeText}>{pc.invite_code}</ThemedText>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.colSm} />
      <View style={styles.colSm}>
        <View style={[styles.statusPill, { backgroundColor: theme.accent }]}>
          <ThemedText style={[styles.statusPillText, { color: '#1A1A1A' }]}>INVITED</ThemedText>
        </View>
      </View>
      <Pressable onPress={() => deletePendingCreator(pc.id)} style={styles.colChevron} hitSlop={8}>
        <Ionicons name="close" size={16} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

/** Admin: add a creator — pick from the ViewTrack creator list or type a name. */
function AddCreatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [vtCreators, setVtCreators] = useState<VtCreator[]>([]);
  const [loadingVt, setLoadingVt] = useState(true);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoadingVt(true);
    vtListCreators().then((c) => {
      setVtCreators(c);
      setLoadingVt(false);
    });
  }, [visible]);

  function reset() {
    setName('');
    setCode(null);
    setCopied(false);
    setBusy(false);
    setManual(false);
    setSearch('');
    onClose();
  }
  async function add(creatorName: string) {
    if (!creatorName.trim() || busy) return;
    setBusy(true);
    const r = await addPendingCreator(creatorName.trim());
    setBusy(false);
    if (r.code) {
      setName(creatorName.trim());
      setCode(r.code);
    }
  }
  function copy() {
    if (Platform.OS === 'web') (navigator as unknown as { clipboard?: { writeText: (s: string) => void } }).clipboard?.writeText(code ?? '');
    setCopied(true);
  }

  const filtered = vtCreators.filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={reset}>
      <Pressable style={styles.modalBackdrop} onPress={reset}>
        <Pressable style={[styles.addModal, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
          {code ? (
            <>
              <View style={[styles.addIcon, { backgroundColor: theme.success }]}>
                <Ionicons name="checkmark" size={26} color="#fff" />
              </View>
              <ThemedText style={styles.addTitle}>{name} added</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Share this invite code — when they sign up with it, they're linked to this creator and marked active.
              </ThemedText>
              <Pressable onPress={copy} style={[styles.bigCode, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.bigCodeText}>{code}</ThemedText>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={theme.text} />
              </Pressable>
              <Pressable onPress={reset} style={[styles.addBtn, { backgroundColor: theme.primary }]}>
                <ThemedText style={[styles.addBtnText, { color: theme.primaryText }]}>Done</ThemedText>
              </Pressable>
            </>
          ) : manual ? (
            <>
              <ThemedText style={styles.addTitle}>Add by name</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                They'll show as “invited” until they sign up with the code.
              </ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Creator name"
                placeholderTextColor={theme.textSecondary}
                style={[styles.addInput, { color: theme.text, borderColor: theme.border }]}
                autoFocus
              />
              <Pressable onPress={() => add(name)} disabled={!name.trim() || busy} style={[styles.addBtn, { backgroundColor: name.trim() ? theme.primary : theme.backgroundElement }]}>
                <ThemedText style={[styles.addBtnText, { color: name.trim() ? theme.primaryText : theme.textSecondary }]}>{busy ? 'Adding…' : 'Add creator'}</ThemedText>
              </Pressable>
              <Pressable onPress={() => setManual(false)}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  ← Pick from ViewTrack
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.addTitle}>Add a creator</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Pick one from your ViewTrack creators.
              </ThemedText>
              <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement, borderColor: theme.border, flexGrow: 0, flexBasis: 'auto', alignSelf: 'stretch' }]}>
                <Ionicons name="search" size={15} color={theme.textSecondary} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search ViewTrack creators" placeholderTextColor={theme.textSecondary} style={[styles.search, { color: theme.text }]} />
              </View>
              {loadingVt ? (
                <View style={{ alignSelf: 'stretch', gap: Spacing.two }}>
                  <Skeleton height={48} radius={Radius.md} />
                  <Skeleton height={48} radius={Radius.md} />
                  <Skeleton height={48} radius={Radius.md} />
                </View>
              ) : (
                <ScrollView style={styles.vtList} keyboardShouldPersistTaps="handled">
                  {filtered.length === 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: Spacing.three }}>
                      {vtCreators.length === 0 ? 'No creators in ViewTrack yet.' : 'No matches.'}
                    </ThemedText>
                  ) : (
                    filtered.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => add(c.name)}
                        disabled={busy}
                        style={({ pressed }) => [styles.vtRow, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                        <BrutalAvatar name={c.name} uri={c.avatarUrl} size={34} />
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontWeight: '800' }} numberOfLines={1}>
                            {c.name}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {c.accountCount} {c.accountCount === 1 ? 'account' : 'accounts'} · {compact(c.totalViews)} views
                          </ThemedText>
                        </View>
                        <Ionicons name="add-circle" size={24} color={theme.primary} />
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              )}
              <Pressable onPress={() => setManual(true)}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  + Add by name instead
                </ThemedText>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Admin: paste a list of handles/URLs → links them to a creator as a background job. */
function BulkAddAccounts({
  visible,
  creators,
  projects,
  onClose,
  onDone,
}: {
  visible: boolean;
  creators: Creator[];
  projects: VtProject[];
  onClose: () => void;
  onDone: () => void;
}) {
  const theme = useTheme();
  const { session } = useAuth();
  const { startJob } = useJobs();
  const [text, setText] = useState('');
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [creatorQuery, setCreatorQuery] = useState('');

  const creator = creators.find((c) => c.id === creatorId) ?? null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const filtered = creators.filter((c) => (c.full_name ?? '').toLowerCase().includes(creatorQuery.trim().toLowerCase()));

  function run() {
    if (!creator || lines.length === 0) return;
    const projectId = projects[0]?.id ?? null;
    const name = creator.full_name || 'creator';
    const targetId = creator.id;
    const adminId = session?.user?.id ?? null;
    onClose();
    setText('');
    setCreatorId(null);

    startJob(`Add ${lines.length} account${lines.length === 1 ? '' : 's'} → ${name}`, lines.length, async (ctx) => {
      ctx.note('loading ViewTrack accounts…');
      const accts = projectId ? await vtAccounts(projectId) : [];
      let added = 0;
      let requested = 0;
      for (let i = 0; i < lines.length; i++) {
        const parsed = parseHandle(lines[i]);
        const match = parsed
          ? accts.find((a) => (a.username ?? '').toLowerCase() === parsed.username && (!parsed.platform || a.platform === parsed.platform))
          : null;
        if (match) {
          await sb.from('account_links').upsert(
            {
              profile_id: targetId,
              platform: match.platform,
              username: match.username,
              vt_account_id: match.id,
              vt_project_id: projectId,
              status: 'linked',
              decided_by: adminId,
              decided_at: new Date().toISOString(),
            },
            { onConflict: 'profile_id,vt_account_id' },
          );
          added++;
        } else {
          // Not in ViewTrack yet — record it as a requested handle so it isn't
          // silently lost; it shows under the creator as "requested".
          await sb.from('account_links').insert({
            profile_id: targetId,
            platform: parsed?.platform ?? 'other',
            username: (parsed?.username ?? lines[i].replace(/^@/, '')).slice(0, 120),
            url: /^https?:\/\//i.test(lines[i]) ? lines[i] : null,
            vt_project_id: projectId,
            status: 'requested',
          });
          requested++;
        }
        ctx.progress(i + 1, lines.length);
        ctx.note(`${added} linked${requested ? ` · ${requested} requested` : ''}`);
      }
      onDone();
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.bulkBackdrop} onPress={onClose}>
        <Pressable style={[styles.bulkSheet, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 6)]} onPress={() => {}}>
          <View style={styles.bulkHead}>
            <ThemedText style={styles.bulkTitle}>Add accounts</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>

          {/* creator picker */}
          <ThemedText type="smallBold" themeColor="textSecondary">
            LINK TO CREATOR
          </ThemedText>
          <Pressable onPress={() => setPickOpen((o) => !o)} style={[styles.bulkSelect, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <ThemedText style={{ fontWeight: '700', color: creator ? theme.text : theme.textSecondary }} numberOfLines={1}>
              {creator?.full_name || 'Select a creator'}
            </ThemedText>
            <Ionicons name={pickOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
          </Pressable>
          {pickOpen && (
            <View style={[styles.bulkList, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement, borderColor: theme.border, marginBottom: Spacing.one + 2, flexGrow: 0, flexBasis: 'auto', alignSelf: 'stretch' }]}>
                <Ionicons name="search" size={15} color={theme.textSecondary} />
                <TextInput value={creatorQuery} onChangeText={setCreatorQuery} placeholder="Search" placeholderTextColor={theme.textSecondary} style={[styles.search, { color: theme.text }]} />
              </View>
              <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                {filtered.map((c) => (
                  <Pressable key={c.id} onPress={() => { setCreatorId(c.id); setPickOpen(false); }} style={({ pressed }) => [styles.bulkOpt, pressed && { backgroundColor: theme.backgroundElement }]}>
                    <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={28} />
                    <ThemedText style={{ fontWeight: '700' }} numberOfLines={1}>
                      {c.full_name || 'Unnamed'}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* paste box */}
          <ThemedText type="smallBold" themeColor="textSecondary">
            PASTE HANDLES OR LINKS · one per line
          </ThemedText>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={'@username\nhttps://tiktok.com/@username\n…'}
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.bulkArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />

          <Pressable
            onPress={run}
            disabled={!creator || lines.length === 0}
            style={({ pressed }) => [styles.bulkRun, { backgroundColor: !creator || lines.length === 0 ? theme.backgroundElement : theme.primary }, pressed && { opacity: 0.85 }]}>
            <ThemedText style={[styles.bulkRunText, { color: !creator || lines.length === 0 ? theme.textSecondary : theme.primaryText }]}>
              {lines.length > 0 ? `Add ${lines.length} account${lines.length === 1 ? '' : 's'}` : 'Add accounts'}
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Linked socials — hover to reveal a dropdown; click to open each. */
function AccountsCell({ links, requested = [] }: { links: ExistingLink[]; requested?: RequestedLink[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const total = links.length + requested.length;
  if (total === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        none
      </ThemedText>
    );
  }
  const iconSrc = [...links, ...requested].slice(0, 3);
  return (
    <View
      // @ts-expect-error web hover handlers
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={[styles.accWrap, open && { zIndex: 1000 }]}>
      <Pressable style={[styles.accChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {iconSrc.map((l, i) => (
          <Ionicons key={i} name={(PLATFORM_ICON[l.platform ?? ''] ?? 'link') as never} size={13} color={PLATFORM_COLOR[l.platform ?? ''] ?? theme.textSecondary} />
        ))}
        <ThemedText type="small" style={{ fontWeight: '800' }}>
          {total}
        </ThemedText>
        {requested.length > 0 && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent }} />}
        <Ionicons name="chevron-down" size={12} color={theme.textSecondary} />
      </Pressable>
      {open && (
        <View style={[styles.accDrop, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 4)]}>
          {links.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => openUrl(socialUrl(l))}
              style={({ pressed }) => [styles.accDropRow, pressed && { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name={(PLATFORM_ICON[l.platform ?? ''] ?? 'link') as never} size={16} color={PLATFORM_COLOR[l.platform ?? ''] ?? theme.text} />
              <ThemedText style={styles.accDropText} numberOfLines={1}>
                @{(l.username ?? '').replace('@', '') || 'account'}
              </ThemedText>
              <Ionicons name="open-outline" size={14} color={theme.textSecondary} />
            </Pressable>
          ))}
          {requested.map((l) => (
            <View key={l.id} style={styles.accDropRow}>
              <Ionicons name={(PLATFORM_ICON[l.platform ?? ''] ?? 'time-outline') as never} size={16} color={theme.textSecondary} />
              <ThemedText style={[styles.accDropText, { color: theme.textSecondary }]} numberOfLines={1}>
                @{(l.username ?? '').replace('@', '') || 'handle'}
              </ThemedText>
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full, backgroundColor: theme.accent }}>
                <ThemedText style={{ fontSize: 9, fontWeight: '900', color: '#1A1A1A', letterSpacing: 0.3 }}>requested</ThemedText>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** 5 dots (green = posted that day) + "X/5 days". */
function PostActivity({ act, loading }: { act?: CreatorActivity; loading: boolean }) {
  const theme = useTheme();
  if (loading && !act) return <Skeleton width={80} height={16} radius={Radius.sm} />;
  const posted = act?.posted ?? [false, false, false, false, false];
  const count = act?.postedCount ?? 0;
  return (
    <View>
      <View style={styles.dots}>
        {posted.map((on, i) => (
          <View key={i} style={[styles.actDot, { backgroundColor: on ? theme.success : theme.backgroundElement, borderColor: theme.border }]} />
        ))}
      </View>
      <ThemedText type="small" themeColor={count >= 4 ? 'success' : 'textSecondary'} style={styles.daysLabel}>
        {count}/5 days
      </ThemedText>
    </View>
  );
}

/** Tiny bar-sparkline of the 7-day views trend + avg label. */
function Sparkline({ values, avg, loading }: { values: number[]; avg: number; loading: boolean }) {
  const theme = useTheme();
  if (loading && values.length === 0) return <Skeleton width={70} height={26} radius={Radius.sm} />;
  const max = Math.max(1, ...values);
  const rising = values.length >= 2 && values[values.length - 1] >= values[0];
  const color = rising ? theme.success : theme.danger;
  return (
    <View>
      <View style={styles.spark}>
        {(values.length ? values : new Array(7).fill(0)).map((v, i) => (
          <View key={i} style={[styles.sparkBar, { height: Math.max(2, (v / max) * 26), backgroundColor: v > 0 ? color : theme.backgroundElement }]} />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.daysLabel}>
        {avg ? `${compact(avg)} avg` : '—'}
      </ThemedText>
    </View>
  );
}

function Stat({ icon, label, value, tone, loading }: { icon: string; label: string; value: string; tone?: string; loading?: boolean }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.statCard} shadow={3}>
      <View style={styles.statTop}>
        <Ionicons name={icon as never} size={16} color={tone ?? theme.primary} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      {loading ? <Skeleton width={70} height={28} radius={Radius.sm} /> : <ThemedText style={styles.statValue}>{value}</ThemedText>}
    </BrutalCard>
  );
}

function CreatorDetail({
  creator,
  projects,
  existing,
  prog,
  onChanged,
  onBack,
}: {
  creator: Creator;
  projects: any[];
  existing: any[];
  prog?: Prog;
  onChanged: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const [view, setView] = useState<CreatorView | null>(null);
  const [loadingV, setLoadingV] = useState(true);
  const [lastActive, setLastActive] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loadingRec, setLoadingRec] = useState(true);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [tf, setTf] = useState<Timeframe>('7d');
  const { totalPaid, payouts } = usePayouts(creator.id);
  const [paying, setPaying] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);
  const [analyzeVid, setAnalyzeVid] = useState<VtVideo | null>(null);
  const { map: analyses } = useVideoAnalyses();

  async function resync() {
    if (resyncing) return;
    setResyncing(true);
    const r = await vtRefreshCreator(creator.id);
    setResyncing(false);
    setResyncMsg(r.total === 0 ? 'No accounts' : `Synced ${r.refreshed}/${r.total} ✓`);
    setTimeout(() => setResyncMsg(null), 5000);
  }
  const level = prog?.level ?? view?.progress?.level ?? 1;

  useEffect(() => {
    let active = true;
    setLoadingV(true);
    setLoadingRec(true);
    vtCreator(creator.id).then((d) => active && (setView(d), setLoadingV(false)));
    listRecordings(creator.id).then((r) => active && (setRecordings(r), setLoadingRec(false)));
    supabase
      .from('messages')
      .select('created_at')
      .eq('sender_id', creator.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { created_at: string } | null }) => active && setLastActive(data?.created_at ?? null));
    return () => {
      active = false;
    };
  }, [creator.id]);

  const accounts = view?.accounts ?? [];
  const totalFollowing = accounts.reduce((s, a) => s + (a.followerCount ?? 0), 0);
  const totalViews = accounts.reduce((s, a) => s + (a.totalViews ?? 0), 0);
  const totalVideos = accounts.reduce((s, a) => s + (a.totalVideos ?? 0), 0);
  const videosArr = view?.videos ?? [];
  const topVideos = [...videosArr].sort((a, b) => b.views - a.views).slice(0, 200);
  // payout: $15/video + $100 per 100k views per video
  const perVideoPay = (v: VtVideo) => 15 + Math.floor((v.views ?? 0) / 100_000) * 100;
  const payout = videosArr.reduce((s, v) => s + perVideoPay(v), 0);
  const owed = Math.max(0, payout - totalPaid);

  async function payNow() {
    if (owed <= 0 || paying) return;
    if (Platform.OS === 'web' && !window.confirm(`Mark $${Math.round(owed).toLocaleString()} as paid to ${creator.full_name || 'this creator'}? This notifies them.`)) return;
    setPaying(true);
    await recordPayout(creator.id, owed, 'Payout');
    setPaying(false);
  }

  async function toggleAccess() {
    const next = !creator.disabled;
    if (Platform.OS === 'web' && !window.confirm(next ? `Remove ${creator.full_name || 'this creator'}'s access? They'll be signed out.` : 'Restore access?')) return;
    await supabase.from('profiles').update({ disabled: next } as never).eq('id', creator.id);
    onChanged();
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.detailScroll}>
      <Pressable onPress={onBack} style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.6 }]}>
        <Ionicons name="chevron-back" size={20} color={theme.primary} />
        <ThemedText style={[styles.backText, { color: theme.primary }]}>All creators</ThemedText>
      </Pressable>

      {/* identity + next payment, side by side */}
      <View style={styles.topRow}>
        <BrutalCard style={[styles.idCard, styles.flexCard]}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarRing, { borderColor: badgeFor(level).color }]}>
              <BrutalAvatar name={creator.full_name} uri={creator.avatar_url} size={56} />
            </View>
            <Image source={badgeFor(level).source} style={styles.idBadge} contentFit="contain" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <ThemedText style={styles.idName} numberOfLines={1}>
              {creator.full_name || 'Unnamed creator'}
            </ThemedText>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: creator.disabled ? theme.danger : theme.success }]} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {creator.disabled ? 'access removed' : 'active'} · Lv {level} · {ago(lastActive)}
              </ThemedText>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
              <Pressable
                onPress={toggleAccess}
                style={({ pressed }) => [styles.accessChip, { borderColor: creator.disabled ? theme.success : theme.danger }, pressed && { opacity: 0.6 }]}>
                <Ionicons name={creator.disabled ? 'lock-open-outline' : 'remove-circle-outline'} size={14} color={creator.disabled ? theme.success : theme.danger} />
                <ThemedText style={[styles.accessChipText, { color: creator.disabled ? theme.success : theme.danger }]}>
                  {creator.disabled ? 'Restore access' : 'Remove access'}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={resync}
                disabled={resyncing}
                style={({ pressed }) => [styles.accessChip, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}>
                <Ionicons name="cloud-download-outline" size={14} color={theme.text} />
                <ThemedText style={[styles.accessChipText, { color: theme.text }]}>{resyncing ? 'Syncing…' : resyncMsg ?? 'Re-sync accounts'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </BrutalCard>

        <BrutalCard style={[styles.payoutCard, styles.flexCard, { backgroundColor: owed > 0 ? theme.primary : theme.success, borderColor: theme.border }]} shadow={4}>
          <View style={styles.payoutTop}>
            <ThemedText style={styles.payoutLabel}>{owed > 0 ? 'OWED — UNPAID' : 'ALL SETTLED'}</ThemedText>
            <Ionicons name="cash" size={26} color="rgba(255,255,255,0.85)" />
          </View>
          {loadingV ? (
            <Skeleton width={120} height={38} radius={Radius.sm} style={{ backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 4 }} />
          ) : (
            <ThemedText style={styles.payoutValue}>${owed.toLocaleString()}</ThemedText>
          )}
          <ThemedText style={styles.payoutSub}>
            ${totalPaid.toLocaleString()} paid ({payouts.length}) · ${payout.toLocaleString()} earned
          </ThemedText>
          {owed > 0 && (
            <Pressable
              onPress={payNow}
              disabled={paying}
              style={({ pressed }) => [styles.payNowBtn, { backgroundColor: '#fff', borderColor: theme.border }, pressed && { opacity: 0.85 }]}>
              <Ionicons name="cash" size={16} color="#111" />
              <ThemedText style={styles.payNowText}>{paying ? 'Paying…' : `Mark $${Math.round(owed).toLocaleString()} paid`}</ThemedText>
            </Pressable>
          )}
        </BrutalCard>
      </View>

      {/* stats */}
      <View style={styles.statRow}>
        <Stat icon="people" label="Following" value={compact(totalFollowing)} loading={loadingV} />
        <Stat icon="eye" label="Views" value={compact(totalViews)} loading={loadingV} />
        <Stat icon="videocam" label="Videos" value={`${totalVideos}`} loading={loadingV} />
        <Stat icon="checkmark-done" label="Briefs done" value={`${view?.briefsDone ?? 0}`} tone={theme.success} loading={loadingV} />
      </View>

      {/* performance + timeframe */}
      <View style={styles.perfHead}>
        <ThemedText style={styles.sectionTitle}>Performance</ThemedText>
        <View style={styles.tfRow}>
          {TF_OPTS.map((t) => {
            const on = tf === t;
            return (
              <Pressable key={t} onPress={() => setTf(t)} style={[styles.tfPill, { borderColor: theme.border }, on && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                <ThemedText style={[styles.tfText, { color: on ? theme.primaryText : theme.textSecondary }]}>{t === 'all' ? 'All' : t}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {loadingV ? (
        <Skeleton height={120} radius={Radius.md} />
      ) : accounts.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No linked accounts to chart yet.
        </ThemedText>
      ) : (
        <ViewsBreakdown accounts={accounts} videos={videosArr} days={TF_DAYS[tf]} profileId={creator.id} />
      )}

      {/* top videos — slider */}
      <ThemedText style={styles.sectionTitle}>Top videos</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
        {loadingV ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} width={130} height={185} radius={Radius.md} />)
        ) : topVideos.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No videos yet.
          </ThemedText>
        ) : (
          topVideos.map((v) => <VideoTile key={v.id} video={v} state={analyses[v.id]} onPress={() => setAnalyzeVid(v)} />)
        )}
      </ScrollView>

      {/* connected accounts */}
      <ThemedText style={styles.sectionTitle}>Connected accounts</ThemedText>
      <AccountManager creator={creator} existing={existing} linked={accounts} projects={projects} loadingLinked={loadingV} onChanged={onChanged} />

      {/* in-app recordings — slider */}
      <ThemedText style={styles.sectionTitle}>In-app recordings</ThemedText>
      {loadingRec ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={140} height={200} radius={Radius.md} />
          ))}
        </ScrollView>
      ) : recordings.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No recordings yet — these appear when the creator films in the app.
        </ThemedText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
          {recordings.map((r) => (
            <Pressable key={r.id} onPress={() => (Platform.OS === 'web' ? setPlaying(r) : openUrl(r.url))} style={({ pressed }) => [styles.recTile, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.85 }]}>
              <View style={[styles.recThumb, { backgroundColor: '#000' }]}>
                <WebVideo src={r.url} />
                <View style={styles.recPlay}>
                  <Ionicons name="play-circle" size={40} color="#fff" />
                </View>
                {!!r.duration_seconds && (
                  <View style={styles.recDur}>
                    <ThemedText style={styles.recDurText}>
                      {Math.floor(r.duration_seconds / 60)}:{String(r.duration_seconds % 60).padStart(2, '0')}
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.recDate} numberOfLines={1}>
                {new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {r.title ? ` · ${r.title}` : ''}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* recording player */}
      <Modal visible={!!playing} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPlaying(null)}>
        <Pressable style={styles.playerBackdrop} onPress={() => setPlaying(null)}>
          <Pressable style={styles.playerBox} onPress={() => {}}>
            {playing && <WebVideo src={playing.url} controls style={{ objectFit: 'contain', borderRadius: 12, background: '#000' }} />}
          </Pressable>
          <Pressable onPress={() => setPlaying(null)} style={styles.playerClose} hitSlop={12}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>

      {analyzeVid && <AnalyzeModal video={analyzeVid} onClose={() => setAnalyzeVid(null)} />}
    </ScrollView>
  );
}

function VideoTile({ video, state, onPress }: { video: VtVideo; state?: AnalysisState; onPress: () => void }) {
  const theme = useTheme();
  // badge only when there's analysis activity: amber = running, green = done, red = error
  const badge =
    state?.status === 'processing'
      ? { bg: theme.accent, icon: 'hourglass' as const, color: '#1A1A1A' }
      : state?.status === 'error'
        ? { bg: theme.danger, icon: 'alert' as const, color: '#fff' }
        : state?.status === 'done'
          ? { bg: theme.success, icon: 'sparkles' as const, color: '#fff' }
          : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.vTile, { borderColor: theme.border }, pressed && { opacity: 0.8 }]}>
      {video.thumbnail ? (
        <Image source={{ uri: video.thumbnail }} style={styles.vThumb} contentFit="cover" />
      ) : (
        <View style={[styles.vThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="film-outline" size={22} color={theme.textSecondary} />
        </View>
      )}
      {badge && (
        <View style={[styles.analyzeBadge, { backgroundColor: badge.bg, borderColor: theme.card }]}>
          <Ionicons name={badge.icon} size={12} color={badge.color} />
        </View>
      )}
      <View style={styles.vMeta}>
        <Ionicons name="eye" size={13} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {compact(video.views)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Inline AI analysis for a creator's video — stays in the shell (sidebar present). */
export function AnalyzeModal({ video, onClose }: { video: VtVideo; onClose: () => void }) {
  const theme = useTheme();
  const { isAdmin } = useAuth();
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  // 'processing' = a background run is in flight (the modal can be closed).
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // transcript is the main thing admins come for — open by default
  const [showTranscript, setShowTranscript] = useState(true);

  useEffect(() => {
    let active = true;
    getVideoAnalysis(video.id).then((r) => {
      if (!active) return;
      setAnalysis(r?.analysis ?? null);
      setAnalyzing(r?.status === 'processing');
      if (r?.status === 'error') setErr(r.error ?? 'Analysis failed — try again.');
      setLoading(false);
    });
    // Live: the breakdown runs server-side and can finish after the admin has
    // closed and reopened this — reflect status changes the moment they land.
    const ch = supabase
      .channel(`analysis:${video.id}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_analyses', filter: `video_id=eq.${video.id}` }, (payload) => {
        const row = payload.new as { status?: string; analysis?: VideoAnalysis | null; error?: string | null };
        setAnalyzing(row.status === 'processing');
        if (row.status === 'done') {
          setAnalysis(row.analysis ?? null);
          setErr(null);
        } else if (row.status === 'error') {
          setErr(row.error ?? 'Analysis failed — try again.');
        }
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [video.id]);

  async function run(force: boolean) {
    if (analyzing) return;
    setAnalyzing(true);
    setErr(null);
    const r = await vtAnalyzeVideo(video.id, force);
    if (!r.ok) {
      setAnalyzing(false);
      setErr(r.error ?? 'Could not start analysis — try again.');
      return;
    }
    // 'done' = it was already cached; otherwise it's running in the background
    // and the realtime subscription will flip us to the result when ready.
    if (r.status === 'done') {
      setAnalysis(r.analysis ?? null);
      setAnalyzing(false);
    }
  }

  const segs = transcriptSegs(analysis);
  const overlays = overlayItems(analysis);
  const desktop = useIsDesktop();
  const embed = Platform.OS === 'web' ? embedUrl(video) : null;
  const sideBySide = desktop && !!embed;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.analyzeModal, sideBySide && styles.analyzeModalWide, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => {}}>
          {sideBySide && (
            <View style={[styles.playerPane, { borderColor: theme.border }]}>
              {createElement('iframe', {
                src: embed!,
                style: { width: '100%', height: '100%', border: 'none', borderRadius: 10, background: '#000' },
                allow: 'autoplay; encrypted-media; picture-in-picture',
                allowFullScreen: true,
              })}
            </View>
          )}
          <View style={{ flex: sideBySide ? 1 : undefined, gap: Spacing.two, minWidth: 0 }}>
          <View style={styles.analyzeTop}>
            {video.thumbnail ? (
              <Image source={{ uri: video.thumbnail }} style={styles.analyzeThumb} contentFit="cover" />
            ) : (
              <View style={[styles.analyzeThumb, { backgroundColor: theme.backgroundElement }]} />
            )}
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: '900', fontSize: 16 }} numberOfLines={1}>
                @{video.accountUsername || 'video'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {compact(video.views)} views · {video.platform}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: sideBySide ? 540 : 420 }} contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.two }}>
            {loading ? (
              <Skeleton height={80} radius={Radius.md} />
            ) : analyzing ? (
              <View style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four }}>
                <ActivityIndicator color={theme.primary} />
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  Analyzing with AI… first run can take a few minutes.{'\n'}You can close this — it keeps running and gets marked when done.
                </ThemedText>
              </View>
            ) : analysis ? (
              <>
                {segs.length > 0 && (
                  <View style={[styles.aiBlk, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <Pressable onPress={() => setShowTranscript((s) => !s)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText style={[styles.aiBlkLabel, { color: theme.primary }]}>TRANSCRIPT</ThemedText>
                      <Ionicons name={showTranscript ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
                    </Pressable>
                    {showTranscript &&
                      segs.map((seg, i) => (
                        <ThemedText key={i} style={styles.aiBlkText}>
                          {segTime(seg) ? <ThemedText type="small" themeColor="textSecondary">{`${segTime(seg)}  `}</ThemedText> : null}
                          {seg.text}
                        </ThemedText>
                      ))}
                  </View>
                )}
                {overlays.length > 0 && (
                  <View style={[styles.aiBlk, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <ThemedText style={[styles.aiBlkLabel, { color: theme.accent }]}>OVERLAYS USED</ThemedText>
                    {overlays.map((o, i) => (
                      <ThemedText key={i} style={styles.aiBlkText}>
                        {o.timestamp ? <ThemedText type="small" themeColor="textSecondary">{`${o.timestamp}  `}</ThemedText> : null}
                        “{o.text}”
                      </ThemedText>
                    ))}
                  </View>
                )}
                {!!textOf(analysis.hook) && (
                  <View style={[styles.aiBlk, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <ThemedText style={[styles.aiBlkLabel, { color: theme.accent }]}>HOOK</ThemedText>
                    <ThemedText style={styles.aiBlkText}>{textOf(analysis.hook)}</ThemedText>
                  </View>
                )}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: Spacing.three }}>
                {isAdmin ? 'Not analyzed yet — run an AI breakdown below.' : 'No AI breakdown yet.'}
              </ThemedText>
            )}
            {!!err && (
              <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
                {err}
              </ThemedText>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            {!!video.url && (
              <Pressable onPress={() => Linking.openURL(video.url)} style={[styles.addBtn, { flex: 1, backgroundColor: theme.card, borderWidth: Border.width, borderColor: theme.border }]}>
                <Ionicons name="open-outline" size={16} color={theme.text} />
                <ThemedText style={[styles.addBtnText, { color: theme.text }]}> Open</ThemedText>
              </Pressable>
            )}
            {isAdmin && (
              <Pressable onPress={() => run(!!analysis)} disabled={analyzing} style={[styles.addBtn, { flex: 1.4, flexDirection: 'row', backgroundColor: theme.primary }]}>
                <Ionicons name="sparkles" size={16} color={theme.primaryText} />
                <ThemedText style={[styles.addBtnText, { color: theme.primaryText }]}> {analyzing ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze with AI'}</ThemedText>
              </Pressable>
            )}
          </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Platform embed URL so the video can play inside the analyze modal (web only). */
function embedUrl(v: VtVideo): string | null {
  const u = v.url ?? '';
  if (v.platform === 'tiktok') {
    const m = u.match(/video\/(\d+)/);
    return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : null;
  }
  if (v.platform === 'instagram') {
    const m = u.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
    return m ? `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/embed` : null;
  }
  if (v.platform === 'youtube') {
    const m = u.match(/(?:shorts\/|watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  }
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dbScroll: { padding: Spacing.four, gap: Spacing.three, width: '100%' },
  analyzeBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  analyzeModal: { width: '100%', maxWidth: 460, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  analyzeModalWide: { maxWidth: 1000, flexDirection: 'row', gap: Spacing.four, alignItems: 'stretch' },
  playerPane: { width: 360, height: 640, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden', alignSelf: 'center' },
  analyzeTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  analyzeThumb: { width: 44, height: 56, borderRadius: Radius.sm },
  aiBlk: { gap: 4, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  aiBlkLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  aiBlkText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  aiChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aiChip: { paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1.5 },
  dbHead: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  dbTitle: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, height: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.sm, borderWidth: Border.width },
  refreshText: { fontSize: 14, fontWeight: '800' },

  statRow: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 150, gap: Spacing.one, paddingVertical: Spacing.three, justifyContent: 'center' },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  statValue: { fontSize: 26, lineHeight: 32, fontWeight: '900' },
  payoutCard: { gap: Spacing.two, borderWidth: Border.widthThick },
  payoutMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payoutLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1, color: '#fff', opacity: 0.9 },
  payoutValue: { fontSize: 40, lineHeight: 46, fontWeight: '900', color: '#fff' },
  payoutBreak: { flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' },
  payoutBreakText: { fontSize: 13, fontWeight: '700', color: '#fff', opacity: 0.95 },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.sm, borderWidth: Border.width },
  search: { flex: 1, fontSize: 15, outlineStyle: 'none' } as object,
  filterPill: { height: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.sm, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 14, fontWeight: '800' },

  table: { padding: 0 },
  accWrap: { alignSelf: 'flex-start', position: 'relative' },
  accDrop: { position: 'absolute', top: '100%', marginTop: -2, left: 0, minWidth: 210, borderRadius: Radius.md, borderWidth: Border.width, paddingVertical: Spacing.one },
  accDropRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  accDropText: { flex: 1, fontSize: 14, fontWeight: '700' },
  // bulk add accounts modal
  bulkBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  bulkSheet: { width: '100%', maxWidth: 440, borderRadius: Radius.lg, borderWidth: Border.widthThick, padding: Spacing.three, gap: Spacing.two },
  bulkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bulkTitle: { fontSize: 20, fontWeight: '900' },
  bulkSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: Border.width },
  bulkList: { borderRadius: Radius.md, borderWidth: Border.width, padding: Spacing.one + 2 },
  bulkOpt: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.two, borderRadius: Radius.sm },
  bulkArea: { minHeight: 120, maxHeight: 200, borderRadius: Radius.md, borderWidth: Border.width, padding: Spacing.three, fontSize: 14, textAlignVertical: 'top', outlineStyle: 'none' } as object,
  bulkRun: { height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
  bulkRunText: { fontSize: 15, fontWeight: '900' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  thead: { paddingVertical: Spacing.two, borderBottomWidth: Border.width },
  th: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5, opacity: 0.5 },
  colName: { flex: 2.2 },
  colActivity: { flex: 1.1 },
  colTrend: { flex: 1.1 },
  colAcc: { flex: 1 },
  colSm: { flex: 0.9, alignItems: 'flex-start' },
  colChevron: { width: 24, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 3 },
  actDot: { width: 11, height: 11, borderRadius: 3, borderWidth: 1 },
  daysLabel: { marginTop: 3 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 26 },
  sparkBar: { width: 5, borderRadius: 1.5, minHeight: 2 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  nameText: { fontSize: 15, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  accChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1.5 },
  lvBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  lvBadgeBg: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, opacity: 0.32 },
  lvNum: { fontSize: 20, fontWeight: '900', textAlign: 'center', lineHeight: 40, includeFontPadding: false } as object,
  cellNum: { fontSize: 15, fontWeight: '800' },
  statusPill: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.full },
  statusPillText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  checkBox: { width: 20, height: 20, borderRadius: Radius.sm, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },
  invitedAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.two, paddingVertical: 5, borderRadius: Radius.full, borderWidth: Border.width, alignSelf: 'flex-start' },
  codeText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  syncBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  resyncChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.two + 2, height: 30, borderRadius: Radius.sm, borderWidth: 1.5, alignSelf: 'flex-start' },
  resyncText: { fontSize: 12, fontWeight: '800' },
  selBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  selBarText: { flex: 1, fontSize: 14, fontWeight: '900', paddingLeft: Spacing.one },
  selBarBtn: { paddingHorizontal: Spacing.three, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  selBarBtnText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  addModal: { width: '100%', maxWidth: 400, alignItems: 'center', gap: Spacing.three, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  addTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  addInput: { alignSelf: 'stretch', height: 50, borderRadius: Radius.md, borderWidth: Border.width, paddingHorizontal: Spacing.three, fontSize: 16, fontWeight: '700', outlineStyle: 'none' } as object,
  addBtn: { alignSelf: 'stretch', height: 50, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addBtnText: { fontSize: 15, fontWeight: '900' },
  addIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  bigCode: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, alignSelf: 'stretch', height: 56, borderRadius: Radius.md, borderWidth: Border.widthThick },
  bigCodeText: { fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  vtList: { alignSelf: 'stretch', maxHeight: 300 },
  vtRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width, marginBottom: Spacing.one + 2 },

  // detail
  detailScroll: { padding: Spacing.four, gap: Spacing.three, maxWidth: 920, width: '100%', alignSelf: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontWeight: '800' },
  idCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatarWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { padding: 3, borderRadius: 50, borderWidth: 3 },
  idBadge: { position: 'absolute', bottom: -4, right: -6, width: 36, height: 36 },
  idName: { fontSize: 20, lineHeight: 26, fontWeight: '900' },
  topRow: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  flexCard: { flex: 1, minWidth: 260 },
  payoutTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payoutSub: { fontSize: 12, fontWeight: '700', color: '#fff', opacity: 0.92 },
  payNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.two, height: 40, borderRadius: Radius.full, borderWidth: Border.width },
  payNowText: { fontSize: 14, fontWeight: '900', color: '#111' },
  accessChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1.5, marginTop: 2 },
  accessChipText: { fontSize: 12, fontWeight: '800' },
  perfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, marginTop: Spacing.two, flexWrap: 'wrap' },
  tfRow: { flexDirection: 'row', gap: 5 },
  tfPill: { paddingHorizontal: Spacing.two + 2, paddingVertical: 5, borderRadius: Radius.sm, borderWidth: 1.5 },
  tfText: { fontSize: 12, fontWeight: '800' },
  slider: { gap: Spacing.three, paddingVertical: Spacing.one, paddingRight: Spacing.three },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: Spacing.two },
  accessBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: 46, borderRadius: Radius.md, borderWidth: Border.width, alignSelf: 'flex-start', paddingHorizontal: Spacing.three },
  accessText: { fontSize: 15, fontWeight: '800' },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  vTile: { width: 120, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  vThumb: { width: '100%', height: 160 },
  vMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: Spacing.one + 2 },
  recTile: { width: 150, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  recThumb: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  recPlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  recDur: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  playerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  playerBox: { width: '100%', maxWidth: 480, aspectRatio: 9 / 16, maxHeight: '88%', borderRadius: 12, overflow: 'hidden' },
  playerClose: { position: 'absolute', top: Spacing.four, right: Spacing.four, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recDurText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  recDate: { padding: Spacing.one + 2 },
});
