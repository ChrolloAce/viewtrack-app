import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { createElement, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useCreatorsData, type Creator, type ExistingLink } from '@/app/(tabs)/creators';
import { AccountManager } from '@/components/account-manager';
import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ViewsBreakdown } from '@/components/views-breakdown';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { badgeFor } from '@/lib/badges';
import { useJobs } from '@/lib/jobs';
import { listRecordings, type Recording } from '@/lib/recordings';
import { supabase } from '@/lib/supabase';
import { detectPlatform, vtAccounts, vtCreator, vtCreatorActivity, type CreatorActivity, type CreatorView, type VtProject, type VtVideo } from '@/lib/viewtrack';

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
  const { creators, projects, linksByCreator, loading, reload } = useCreatorsData();
  const progress = useProgressMap();
  const [activity, setActivity] = useState<Record<string, CreatorActivity>>({});
  const [actLoading, setActLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [bulkOpen, setBulkOpen] = useState(false);

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
            const p = progress[c.id];
            const act = activity[c.id];
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelectedId(c.id)}
                style={(s) => [styles.tr, { borderBottomColor: theme.border }, (s as { hovered?: boolean }).hovered && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.colName, styles.nameCell]}>
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
                  <AccountsCell links={links} />
                </View>
                <View style={[styles.colSm, styles.lvCell]}>
                  <Image source={badgeFor(p?.level ?? 1).source} style={styles.lvBadge} contentFit="contain" />
                  <ThemedText style={styles.cellNum}>{p?.level ?? 1}</ThemedText>
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
      let missed = 0;
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
          missed++;
        }
        ctx.progress(i + 1, lines.length);
        ctx.note(`${added} linked${missed ? ` · ${missed} not found` : ''}`);
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
              <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement, borderColor: theme.border, marginBottom: 4 }]}>
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
function AccountsCell({ links }: { links: ExistingLink[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  if (links.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        none
      </ThemedText>
    );
  }
  return (
    <View
      // @ts-expect-error web hover handlers
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={[styles.accWrap, open && { zIndex: 1000 }]}>
      <Pressable style={[styles.accChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {links.slice(0, 3).map((l, i) => (
          <Ionicons key={i} name={(PLATFORM_ICON[l.platform ?? ''] ?? 'link') as never} size={13} color={PLATFORM_COLOR[l.platform ?? ''] ?? theme.textSecondary} />
        ))}
        <ThemedText type="small" style={{ fontWeight: '800' }}>
          {links.length}
        </ThemedText>
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
  const topVideos = [...videosArr].sort((a, b) => b.views - a.views).slice(0, 12);
  // payout: $15/video + $100 per 100k views per video
  const perVideoPay = (v: VtVideo) => 15 + Math.floor((v.views ?? 0) / 100_000) * 100;
  const payout = videosArr.reduce((s, v) => s + perVideoPay(v), 0);
  // weekly settlement — earnings since last Sunday are due this coming Sunday
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(periodStart.getDate() - now.getDay());
  const nextPayoutDate = new Date(periodStart);
  nextPayoutDate.setDate(periodStart.getDate() + 7);
  const periodStartTs = periodStart.getTime();
  const nextPayout = videosArr
    .filter((v) => v.uploadDate && new Date(v.uploadDate).getTime() >= periodStartTs)
    .reduce((s, v) => s + perVideoPay(v), 0);
  const paidOut = Math.max(0, payout - nextPayout);
  const payoutDay = nextPayoutDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

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
            <Pressable
              onPress={toggleAccess}
              style={({ pressed }) => [styles.accessChip, { borderColor: creator.disabled ? theme.success : theme.danger }, pressed && { opacity: 0.6 }]}>
              <Ionicons name={creator.disabled ? 'lock-open-outline' : 'remove-circle-outline'} size={14} color={creator.disabled ? theme.success : theme.danger} />
              <ThemedText style={[styles.accessChipText, { color: creator.disabled ? theme.success : theme.danger }]}>
                {creator.disabled ? 'Restore access' : 'Remove access'}
              </ThemedText>
            </Pressable>
          </View>
        </BrutalCard>

        <BrutalCard style={[styles.payoutCard, styles.flexCard, { backgroundColor: theme.success, borderColor: theme.border }]} shadow={4}>
          <View style={styles.payoutTop}>
            <ThemedText style={styles.payoutLabel}>DUE NEXT PAYMENT · by {payoutDay}</ThemedText>
            <Ionicons name="cash" size={26} color="rgba(255,255,255,0.85)" />
          </View>
          {loadingV ? (
            <Skeleton width={120} height={38} radius={Radius.sm} style={{ backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 4 }} />
          ) : (
            <ThemedText style={styles.payoutValue}>${nextPayout.toLocaleString()}</ThemedText>
          )}
          <ThemedText style={styles.payoutSub}>
            ${paidOut.toLocaleString()} paid out · ${payout.toLocaleString()} lifetime
          </ThemedText>
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
          topVideos.map((v) => <VideoTile key={v.id} video={v} />)
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
    </ScrollView>
  );
}

function VideoTile({ video }: { video: VtVideo }) {
  const theme = useTheme();
  return (
    <View style={[styles.vTile, { borderColor: theme.border }]}>
      {video.thumbnail ? (
        <Image source={{ uri: video.thumbnail }} style={styles.vThumb} contentFit="cover" />
      ) : (
        <View style={[styles.vThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="film-outline" size={22} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.vMeta}>
        <Ionicons name="eye" size={13} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {compact(video.views)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dbScroll: { padding: Spacing.four, gap: Spacing.three, maxWidth: 1320, width: '100%', alignSelf: 'center' },
  dbHead: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  dbTitle: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, height: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: Border.width },
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
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: Border.width },
  search: { flex: 1, fontSize: 15, outlineStyle: 'none' } as object,
  filterPill: { height: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
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
  lvCell: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lvBadge: { width: 22, height: 22 },
  cellNum: { fontSize: 15, fontWeight: '800' },
  statusPill: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.full },
  statusPillText: { fontSize: 10, fontWeight: '900', color: '#fff' },

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
  accessChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1.5, marginTop: 2 },
  accessChipText: { fontSize: 12, fontWeight: '800' },
  perfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, marginTop: Spacing.two, flexWrap: 'wrap' },
  tfRow: { flexDirection: 'row', gap: 5 },
  tfPill: { paddingHorizontal: Spacing.two + 2, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5 },
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
