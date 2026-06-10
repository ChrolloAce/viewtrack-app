import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BrutalAvatar } from '@/components/brutal';
import { CreatorDatabase } from '@/components/creator-database';
import { RequestsAdmin } from '@/app/(tabs)/requests';
import { BrutalCard } from '@/components/brutal';
import { DesktopRail, type Section } from '@/components/desktop-rail';
import { ChatThread } from '@/components/chat-thread';
import { JobManager } from '@/components/job-manager';
import { LeaderboardView } from '@/components/leaderboard-view';
import { PayoutsAdmin } from '@/components/payouts-admin';
import { ReportsAdmin } from '@/components/reports-admin';
import { VideosGrid } from '@/components/videos-grid';
import { LinkClicks } from '@/components/link-clicks';
import { ProfileBody } from '@/components/profile-body';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ViewsBreakdown } from '@/components/views-breakdown';
import { XpBar } from '@/components/xp-bar';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { badgeFor } from '@/lib/badges';
import { JobsProvider } from '@/lib/jobs';
import { usePayouts } from '@/lib/payouts';
import { pickImages, uploadLocalImage } from '@/lib/chat-media';
import {
  assignLabel,
  createLabel,
  deleteLabel,
  LABEL_COLORS,
  unassignLabel,
  useLabels,
  useProfileLabels,
  type Label,
} from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import { useCompletions } from '@/lib/use-completions';
import { useInbox, type InboxItem } from '@/lib/use-inbox';
import { useProgress } from '@/lib/use-progress';
import { useScripts, type Script } from '@/lib/use-scripts';
import { useStats } from '@/lib/use-stats';
import { useUnread } from '@/lib/use-unread';
import { takePendingSection } from '@/lib/nav';
import type { VtVideo } from '@/lib/viewtrack';

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

const DIVIDER = 'rgba(0,0,0,0.08)';
// a few admin tables aren't in the generated types yet — cast around them.
const sb = supabase as unknown as { from: (t: string) => any };
type Sel = { id: string; name: string; avatar?: string | null; type: string; personId?: string | null };
type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type ChatFilter = 'all' | 'group' | 'direct' | 'unread';

function clock(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function describe(item: InboxItem, userId: string | null, agent?: { full_name: string | null; avatar_url: string | null } | null) {
  if (item.type === 'group') {
    return { name: item.title ?? 'Channel', sub: 'Channel', kind: 'group' as const, avatar: item.cover_url };
  }
  if (item.customer?.id === userId) {
    return { name: agent?.full_name || 'Support', sub: 'Admin', kind: 'support' as const, avatar: agent?.avatar_url ?? null };
  }
  return {
    name: item.customer?.full_name ?? 'Unknown creator',
    sub: item.subject ?? 'Conversation',
    kind: 'person' as const,
    avatar: item.customer?.avatar_url ?? null,
  };
}

/** WhatsApp-style last-message preview (matches the mobile chat list). */
function previewOf(item: InboxItem, userId: string | null): string {
  let text = item.last_body?.trim() ?? '';
  if (!text && item.last_attachment) {
    text = item.last_attachment.startsWith('audio') ? '🎤 Voice message' : '📷 Photo';
  }
  if (!text) return item.subject ?? 'No messages yet';
  if (item.type === 'group' && item.last_sender_id) {
    const who = item.last_sender_id === userId ? 'You' : item.last_sender_name?.split(' ')[0] ?? '';
    if (who) return `${who}: ${text}`;
  }
  return text;
}

export function DesktopShell() {
  const { loading, profile } = useAuth();
  // Don't render the shell until the role is known — otherwise it flashes the
  // creator layout, then snaps to admin once the profile resolves.
  if (loading || !profile) return <ShellSkeleton />;
  return <ShellBody />;
}

function ShellSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.rail, { backgroundColor: theme.card, borderRightColor: DIVIDER }]}>
        <View style={styles.railBrand}>
          <Skeleton width={38} height={38} radius={Radius.md} />
          <Skeleton width={110} height={20} radius={Radius.sm} />
        </View>
        <View style={{ height: Spacing.four }} />
        <View style={{ gap: Spacing.two }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} radius={Radius.md} />
          ))}
        </View>
      </View>
      <View style={[styles.flex, { padding: Spacing.five, gap: Spacing.three }]}>
        <Skeleton width={240} height={34} radius={Radius.sm} />
        <View style={{ flexDirection: 'row', gap: Spacing.three }}>
          <Skeleton width={220} height={110} radius={Radius.lg} />
          <Skeleton width={220} height={110} radius={Radius.lg} />
        </View>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={64} radius={Radius.lg} />
        ))}
      </View>
    </View>
  );
}

function ShellBody() {
  const theme = useTheme();
  const { isAdmin } = useAuth();
  // A rail tap from a detail screen routes here with a requested section.
  const [section, setSection] = useState<Section>(takePendingSection() ?? (isAdmin ? 'chat' : 'home'));
  return (
    <JobsProvider>
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <Rail section={section} setSection={setSection} isAdmin={isAdmin} />
        {section === 'home' && !isAdmin && <HomePane />}
        {section === 'record' && !isAdmin && <RecordPane />}
        {section === 'chat' && <ChatConsole />}
        {section === 'creators' && isAdmin && <CreatorDatabase />}
        {section === 'videos' && isAdmin && (
          <View style={styles.flex}>
            <VideosGrid />
          </View>
        )}
        {section === 'clicks' && isAdmin && (
          <View style={styles.flex}>
            <LinkClicks />
          </View>
        )}
        {section === 'requests' && isAdmin && (
          <View style={styles.flex}>
            <RequestsAdmin bottomInset={24} />
          </View>
        )}
        {section === 'leaderboard' && <LeaderboardPane />}
        {section === 'payouts' && isAdmin && (
          <View style={styles.flex}>
            <PayoutsAdmin />
          </View>
        )}
        {section === 'reports' && isAdmin && (
          <View style={styles.flex}>
            <ReportsAdmin />
          </View>
        )}
        {section === 'profile' && <ProfilePane />}
        {/* persistent floating job tracker — survives section switches */}
        <JobManager />
      </View>
    </JobsProvider>
  );
}

/** Shared page chrome: centered, max-width column with a title header. */
function Pane({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.paneScroll}>
      <View style={styles.paneInner}>
        <View style={styles.paneHead}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.paneTitle}>{title}</ThemedText>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {action}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

function Rail({ section, setSection, isAdmin }: { section: Section; setSection: (s: Section) => void; isAdmin: boolean }) {
  const { profile } = useAuth();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const sb = supabase as unknown as { from: (t: string) => any };
    const load = async () => {
      const { count } = await sb.from('account_links').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      if (active) setPending(count ?? 0);
    };
    load();
    const ch = supabase
      .channel('rail-pending')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_links' }, () => load())
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [isAdmin]);

  return <DesktopRail active={section} onSelect={setSection} isAdmin={isAdmin} profile={profile} pending={pending} />;
}

function ChatConsole() {
  const theme = useTheme();
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState<Sel | null>(null);
  const [creating, setCreating] = useState(false);
  const [panel, setPanel] = useState(false);
  const select = (s: Sel | null) => {
    setSelected(s);
    setPanel(false);
  };

  // Mark the open conversation read — on select, on each new message, and on
  // switching away — so the unread badge clears.
  useEffect(() => {
    const cid = selected?.id;
    if (!cid) return;
    const mark = () => supabase.rpc('mark_read', { p_conversation: cid });
    mark();
    const channel = supabase
      .channel(`desk-read:${cid}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` },
        () => mark(),
      )
      .subscribe();
    return () => {
      mark();
      supabase.removeChannel(channel);
    };
  }, [selected?.id]);

  return (
    <View style={styles.console}>
      <View style={[styles.listPanel, { borderRightColor: DIVIDER, backgroundColor: theme.card }]}>
        {creating ? (
          <NewChannelPanel
            onClose={() => setCreating(false)}
            onCreated={(s) => {
              setSelected(s);
              setCreating(false);
            }}
          />
        ) : (
          <ConversationList
            selectedId={selected?.id ?? null}
            onSelect={select}
            canCreate={isAdmin}
            onNew={() => setCreating(true)}
          />
        )}
      </View>

      <View style={[styles.chatPane, { backgroundColor: theme.backgroundElement }]}>
        {selected ? (
          panel && selected.type === 'group' ? (
            <MembersPanel
              conversationId={selected.id}
              name={selected.name}
              onClose={() => setPanel(false)}
              onDeleted={() => {
                setPanel(false);
                setSelected(null);
              }}
            />
          ) : panel && selected.type === 'direct' && isAdmin ? (
            <PersonPanel
              conversationId={selected.id}
              personId={selected.personId ?? null}
              name={selected.name}
              avatar={selected.avatar ?? null}
              onClose={() => setPanel(false)}
              onDeleted={() => {
                setPanel(false);
                setSelected(null);
              }}
            />
          ) : (
            <>
              <View style={[styles.chatHeader, { backgroundColor: theme.card, borderBottomColor: DIVIDER }]}>
                {selected.type === 'group' && !selected.avatar ? (
                  <View style={[styles.headerIcon, { backgroundColor: theme.accent }]}>
                    <Ionicons name="people" size={20} color="#1A1A1A" />
                  </View>
                ) : (
                  <BrutalAvatar name={selected.name} uri={selected.avatar} size={40} />
                )}
                <ThemedText style={styles.chatHeaderName} numberOfLines={1}>
                  {selected.name}
                </ThemedText>
                {selected.type === 'group' ? (
                  <Pressable onPress={() => setPanel(true)} style={styles.headerAction}>
                    <Ionicons name="people-outline" size={22} color={theme.text} />
                  </Pressable>
                ) : isAdmin ? (
                  <>
                    {!!selected.personId && <HeaderLabelPill personId={selected.personId} onManage={() => setPanel(true)} />}
                    <Pressable onPress={() => setPanel(true)} style={styles.headerAction}>
                      <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
                    </Pressable>
                  </>
                ) : null}
              </View>
              <ChatThread
                conversationId={selected.id}
                bottomInset={Spacing.two}
                showSenders={selected.type === 'group'}
              />
            </>
          )
        ) : (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              select a conversation
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

/** WhatsApp-style label pill in the chat header: shows the person's label dot +
 *  name; click → assign/unassign labels right there, no person panel needed. */
function HeaderLabelPill({ personId, onManage }: { personId: string; onManage: () => void }) {
  const theme = useTheme();
  const { labels } = useLabels();
  const { map: profileLabels } = useProfileLabels();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const ref = useRef<View>(null);
  const ids = profileLabels[personId] ?? [];
  const mine = labels.filter((l) => ids.includes(l.id));
  const first = mine[0];

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  return (
    <>
      <Pressable
        ref={ref}
        onPress={openMenu}
        style={({ pressed }) => [styles.labelPill, { backgroundColor: theme.backgroundElement, borderColor: DIVIDER }, pressed && { opacity: 0.7 }]}>
        {first ? <View style={[styles.fDot, { backgroundColor: first.color }]} /> : <Ionicons name="pricetag-outline" size={13} color={theme.textSecondary} />}
        <ThemedText type="smallBold" style={{ color: first ? theme.text : theme.textSecondary, maxWidth: 140 }} numberOfLines={1}>
          {first ? (mine.length > 1 ? `${first.name} +${mine.length - 1}` : first.name) : 'label'}
        </ThemedText>
        <Ionicons name="chevron-down" size={13} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.labelMenu,
              { backgroundColor: theme.card, borderColor: theme.border, top: anchor.y + anchor.h + 6, left: Math.max(8, anchor.x + anchor.w - 230) },
            ]}>
            {labels.map((l) => {
              const on = ids.includes(l.id);
              return (
                <Pressable
                  key={l.id}
                  onPress={async () => (on ? unassignLabel(personId, l.id) : assignLabel(personId, l.id))}
                  style={({ pressed }) => [styles.labelMenuItem, pressed && { backgroundColor: theme.backgroundElement }]}>
                  <View style={[styles.fDot, { backgroundColor: l.color }]} />
                  <ThemedText style={styles.labelMenuText} numberOfLines={1}>
                    {l.name}
                  </ThemedText>
                  {on && <Ionicons name="checkmark" size={16} color={theme.primary} />}
                  <Pressable
                    onPress={(e) => {
                      (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
                      if (Platform.OS !== 'web' || window.confirm(`Delete the label “${l.name}” everywhere? It comes off every chat.`)) deleteLabel(l.id);
                    }}
                    hitSlop={6}>
                    <Ionicons name="trash-outline" size={15} color={theme.textSecondary} />
                  </Pressable>
                </Pressable>
              );
            })}
            {labels.length > 0 && <View style={[styles.labelMenuDivider, { backgroundColor: DIVIDER }]} />}
            <Pressable
              onPress={() => {
                setOpen(false);
                onManage();
              }}
              style={({ pressed }) => [styles.labelMenuItem, pressed && { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="add" size={15} color={theme.textSecondary} />
              <ThemedText style={[styles.labelMenuText, { color: theme.textSecondary }]}>new label…</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function ConversationList({
  selectedId,
  onSelect,
  canCreate,
  onNew,
}: {
  selectedId: string | null;
  onSelect: (s: Sel) => void;
  canCreate: boolean;
  onNew: () => void;
}) {
  const theme = useTheme();
  const { session, isAdmin } = useAuth();
  const userId = session?.user?.id ?? null;
  const { items, reload } = useInbox();
  const { map: unread } = useUnread();
  const { labels } = useLabels();
  const { map: profileLabels } = useProfileLabels();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [agent, setAgent] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!isAdmin && userId) supabase.rpc('get_or_create_conversation', {}).then(() => reload());
  }, [isAdmin, userId, reload]);

  useEffect(() => {
    if (isAdmin) return;
    (supabase.rpc as unknown as (fn: string) => Promise<{ data: { full_name: string | null; avatar_url: string | null }[] | null }>)(
      'support_agent',
    ).then(({ data }) => setAgent(data?.[0] ?? null));
  }, [isAdmin]);

  const labelById = useMemo(() => Object.fromEntries(labels.map((l) => [l.id, l])), [labels]);
  // labels only apply to a person, so a label filter implies direct chats only.
  const labelsFor = (item: InboxItem): Label[] =>
    item.type === 'direct' && item.customer
      ? (profileLabels[item.customer.id] ?? []).map((id) => labelById[id]).filter(Boolean)
      : [];

  const rows = items
    .map((item) => ({ item, d: describe(item, userId, agent) }))
    .filter(({ item, d }) => {
      if (!d.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (filter === 'group' && item.type !== 'group') return false;
      if (filter === 'direct' && item.type !== 'direct') return false;
      if (filter === 'unread' && (unread[item.id] ?? 0) === 0) return false;
      if (labelFilter && !labelsFor(item).some((l) => l.id === labelFilter)) return false;
      return true;
    });

  return (
    <View style={styles.flex}>
      <View style={styles.listHeader}>
        <ThemedText style={styles.panelTitle}>{isAdmin ? 'community' : 'chats'}</ThemedText>
        {canCreate && (
          <Pressable
            onPress={onNew}
            style={({ pressed }) => [
              styles.compose,
              { backgroundColor: theme.primary },
              pressed && { opacity: 0.85 },
            ]}>
            <Ionicons name="create-outline" size={20} color={theme.primaryText} />
          </Pressable>
        )}
      </View>
      <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="search" size={16} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.textSecondary}
          style={[styles.search, { color: theme.text }]}
        />
      </View>

      {/* filter bar: view chips + per-label chips (horizontally scrollable) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarInner}>
        {([
          ['all', 'All'],
          ['group', 'Groups'],
          ['direct', 'Direct'],
          ['unread', 'Unread'],
        ] as [ChatFilter, string][]).map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[styles.fChip, { borderColor: theme.border, backgroundColor: on ? theme.primary : theme.card }]}>
              <ThemedText style={[styles.fChipText, { color: on ? theme.primaryText : theme.text }]}>{label}</ThemedText>
            </Pressable>
          );
        })}
        {labels.length > 0 && <View style={[styles.fDivider, { backgroundColor: theme.border }]} />}
        {labels.map((l) => {
          const on = labelFilter === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => setLabelFilter(on ? null : l.id)}
              style={[styles.fChip, { borderColor: on ? l.color : theme.border, backgroundColor: on ? l.color : theme.card }]}>
              <View style={[styles.fDot, { backgroundColor: on ? theme.card : l.color }]} />
              <ThemedText style={[styles.fChipText, { color: on ? '#fff' : theme.text }]}>{l.name}</ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView>
        {rows.map(({ item, d }) => {
          const count = unread[item.id] ?? 0;
          const active = selectedId === item.id;
          const rowLabels = labelsFor(item);
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect({ id: item.id, name: d.name, avatar: d.avatar, type: item.type, personId: item.type === 'direct' ? item.customer?.id ?? null : null })}
              style={(s) => [
                styles.row,
                { borderBottomColor: DIVIDER },
                (s as { hovered?: boolean }).hovered && { backgroundColor: theme.backgroundElement },
                active && { backgroundColor: theme.primaryMuted },
              ]}>
              {d.kind === 'group' && !d.avatar ? (
                <View style={[styles.rowIcon, { backgroundColor: theme.accent }]}>
                  <Ionicons name="people" size={20} color="#1A1A1A" />
                </View>
              ) : (
                <BrutalAvatar name={d.name} uri={d.avatar} size={46} />
              )}
              <View style={styles.rowText}>
                {/* WhatsApp-style: name with small colored label dots after it */}
                <View style={styles.rowTitleRow}>
                  <ThemedText style={[styles.rowName, { flexShrink: 1 }]} numberOfLines={1}>
                    {d.name}
                  </ThemedText>
                  {rowLabels.slice(0, 3).map((l) => (
                    <View key={l.id} style={[styles.rowDot, { backgroundColor: l.color }]} />
                  ))}
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {previewOf(item, userId)}
                </ThemedText>
              </View>
              <View style={styles.rowMeta}>
                <ThemedText type="small" themeColor="textSecondary">
                  {clock(item.last_message_at)}
                </ThemedText>
                {count > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                    <ThemedText style={styles.badgeText}>{count > 99 ? '99+' : count}</ThemedText>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function NewChannelPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Sel) => void }) {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [title, setTitle] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [creators, setCreators] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('role', 'creator')
      .order('full_name')
      .then(({ data }) => setCreators((data as Profile[]) ?? []));
  }, []);

  async function pickCover() {
    try {
      const uris = await pickImages();
      if (uris.length) setCoverUri(uris[0]);
    } catch {
      /* ignore */
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    const { data } = await supabase.rpc('create_group', { p_title: title.trim(), p_members: [...selected] });
    let cover: string | null = null;
    if (data && coverUri && userId) {
      try {
        cover = await uploadLocalImage(userId, coverUri);
        await supabase.from('conversations').update({ cover_url: cover }).eq('id', data.id);
      } catch {
        /* ignore */
      }
    }
    setCreating(false);
    if (data) onCreated({ id: data.id, name: title.trim(), type: 'group', avatar: cover });
  }

  return (
    <View style={styles.flex}>
      <View style={styles.listHeader}>
        <Pressable onPress={onClose} style={styles.panelBack}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.panelTitleSm}>new channel</ThemedText>
      </View>

      <View style={styles.newForm}>
        <Pressable onPress={pickCover} style={styles.coverPick}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={[styles.cover, { borderColor: theme.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: theme.accent, borderColor: theme.border }]}>
              <Ionicons name="image" size={26} color="#1A1A1A" />
            </View>
          )}
          <View style={[styles.coverBadge, { backgroundColor: theme.primary, borderColor: theme.card }]}>
            <Ionicons name={coverUri ? 'pencil' : 'add'} size={13} color={theme.primaryText} />
          </View>
        </Pressable>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Channel name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.formLabel}>
          ADD CREATORS ({selected.size})
        </ThemedText>
      </View>

      <ScrollView style={styles.flex}>
        {creators.map((c) => {
          const on = selected.has(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => toggle(c.id)}
              style={(s) => [
                styles.row,
                { borderBottomColor: DIVIDER },
                (s as { hovered?: boolean }).hovered && { backgroundColor: theme.backgroundElement },
                on && { backgroundColor: theme.primaryMuted },
              ]}>
              <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={42} />
              <ThemedText style={[styles.rowName, styles.rowText]} numberOfLines={1}>
                {c.full_name ?? 'Unknown'}
              </ThemedText>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={on ? theme.primary : theme.textSecondary}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.newFooter}>
        <Pressable
          onPress={create}
          disabled={!title.trim() || creating}
          style={[styles.createBtn, { backgroundColor: title.trim() ? theme.primary : theme.backgroundElement }]}>
          {creating ? (
            <ActivityIndicator size="small" color={theme.primaryText} />
          ) : (
            <ThemedText style={[styles.createText, { color: title.trim() ? theme.primaryText : theme.textSecondary }]}>
              create channel
            </ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

type Member = { profile_id: string; role: string; profile: Profile | null };

function MembersPanel({
  conversationId,
  name,
  onClose,
  onDeleted,
}: {
  conversationId: string;
  name: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const { session, isAdmin } = useAuth();
  const userId = session?.user?.id ?? null;

  async function deleteGroup() {
    if (Platform.OS === 'web' && !window.confirm(`Delete "${name}"? This permanently removes the channel and all its messages for everyone.`)) return;
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)('delete_group', { p_conversation: conversationId });
    onDeleted();
  }
  const [members, setMembers] = useState<Member[]>([]);
  const [creators, setCreators] = useState<Profile[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: m } = await supabase
      .from('conversation_participants')
      .select('profile_id, role, profile:profiles!conversation_participants_profile_id_fkey(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId);
    setMembers((m as unknown as Member[]) ?? []);
    const { data: c } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('role', 'creator');
    setCreators((c as Profile[]) ?? []);
    const { data: conv } = await supabase.from('conversations').select('cover_url').eq('id', conversationId).single();
    setCover(conv?.cover_url ?? null);
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const memberIds = new Set(members.map((m) => m.profile_id));
  const addable = creators.filter((c) => !memberIds.has(c.id));

  async function changeCover() {
    if (!userId) return;
    try {
      const uris = await pickImages();
      if (!uris.length) return;
      setBusy('cover');
      const url = await uploadLocalImage(userId, uris[0]);
      await supabase.from('conversations').update({ cover_url: url }).eq('id', conversationId);
      setCover(url);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }
  async function add(pid: string) {
    setBusy(pid);
    await supabase.rpc('add_member', { p_conversation: conversationId, p_profile: pid });
    await load();
    setBusy(null);
  }
  async function remove(pid: string) {
    setBusy(pid);
    await supabase.rpc('remove_member', { p_conversation: conversationId, p_profile: pid });
    await load();
    setBusy(null);
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.chatHeader, { backgroundColor: theme.card, borderBottomColor: DIVIDER }]}>
        <Pressable onPress={onClose} style={styles.headerAction}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.chatHeaderName} numberOfLines={1}>
          {name} · settings
        </ThemedText>
      </View>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={changeCover} disabled={busy === 'cover'} style={styles.coverPick}>
          {cover ? (
            <Image source={{ uri: cover }} style={[styles.cover, { borderColor: theme.border }]} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: theme.accent, borderColor: theme.border }]}>
              <Ionicons name="people" size={28} color="#1A1A1A" />
            </View>
          )}
          <View style={[styles.coverBadge, { backgroundColor: theme.primary, borderColor: theme.card }]}>
            {busy === 'cover' ? (
              <ActivityIndicator size="small" color={theme.primaryText} />
            ) : (
              <Ionicons name="camera" size={14} color={theme.primaryText} />
            )}
          </View>
        </Pressable>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.formLabel}>
          MEMBERS ({members.length})
        </ThemedText>
        {members.map((m) => (
          <View key={m.profile_id} style={[styles.settingsRow, { borderColor: theme.border }]}>
            <BrutalAvatar name={m.profile?.full_name} uri={m.profile?.avatar_url} size={40} />
            <View style={styles.rowText}>
              <ThemedText style={styles.rowName} numberOfLines={1}>
                {m.profile?.full_name ?? 'Unknown'}
              </ThemedText>
              {m.role === 'owner' && (
                <ThemedText type="small" themeColor="textSecondary">
                  owner
                </ThemedText>
              )}
            </View>
            {m.role !== 'owner' &&
              (busy === m.profile_id ? (
                <ActivityIndicator size="small" color={theme.danger} />
              ) : (
                <Pressable onPress={() => remove(m.profile_id)}>
                  <Ionicons name="remove-circle" size={26} color={theme.danger} />
                </Pressable>
              ))}
          </View>
        ))}

        {addable.length > 0 && (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.formLabel}>
              ADD CREATORS
            </ThemedText>
            {addable.map((c) => (
              <View key={c.id} style={[styles.settingsRow, { borderColor: theme.border }]}>
                <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={40} />
                <ThemedText style={[styles.rowName, styles.rowText]} numberOfLines={1}>
                  {c.full_name ?? 'Unknown'}
                </ThemedText>
                {busy === c.id ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Pressable onPress={() => add(c.id)}>
                    <Ionicons name="add-circle" size={26} color={theme.primary} />
                  </Pressable>
                )}
              </View>
            ))}
          </>
        )}

        {isAdmin && (
          <Pressable
            onPress={deleteGroup}
            style={({ pressed }) => [styles.deleteGroup, { borderColor: theme.danger }, pressed && { backgroundColor: theme.danger + '18' }]}>
            <Ionicons name="trash" size={18} color={theme.danger} />
            <ThemedText style={[styles.deleteGroupText, { color: theme.danger }]}>Delete channel</ThemedText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

/** Admin settings for a 1-on-1 chat: labels, access control, and deletion. */
function PersonPanel({
  conversationId,
  personId,
  name,
  avatar,
  onClose,
  onDeleted,
}: {
  conversationId: string;
  personId: string | null;
  name: string;
  avatar: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const { labels, reload: reloadLabels } = useLabels();
  const [labelIds, setLabelIds] = useState<Set<string>>(new Set());
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);

  const load = useCallback(async () => {
    if (!personId) return;
    const { data: pl } = await sb.from('profile_labels').select('label_id').eq('profile_id', personId);
    setLabelIds(new Set(((pl as { label_id: string }[] | null) ?? []).map((r) => r.label_id)));
    const { data: p } = await supabase.from('profiles').select('disabled').eq('id', personId).single();
    setDisabled(!!(p as { disabled?: boolean } | null)?.disabled);
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleLabel(id: string) {
    if (!personId) return;
    setBusy(id);
    if (labelIds.has(id)) await unassignLabel(personId, id);
    else await assignLabel(personId, id);
    await load();
    setBusy(null);
  }

  async function createAndAssign() {
    if (!newName.trim() || !personId) return;
    setBusy('new');
    const lbl = await createLabel(newName.trim(), newColor);
    if (lbl) await assignLabel(personId, lbl.id);
    setNewName('');
    setNewColor(LABEL_COLORS[0]);
    setAdding(false);
    await reloadLabels();
    await load();
    setBusy(null);
  }

  async function toggleAccess() {
    if (!personId) return;
    const next = !disabled;
    if (Platform.OS === 'web' && !window.confirm(next ? `Remove ${name}'s access? They'll be signed out and can't use the app until restored.` : `Restore ${name}'s access?`)) return;
    setBusy('access');
    await sb.from('profiles').update({ disabled: next }).eq('id', personId);
    setDisabled(next);
    setBusy(null);
  }

  async function deleteChat() {
    if (Platform.OS === 'web' && !window.confirm(`Delete this conversation with ${name}? This permanently removes the chat and all its messages for everyone. Their account is not affected.`)) return;
    setBusy('delete');
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)('delete_conversation', { p_conversation: conversationId });
    onDeleted();
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.chatHeader, { backgroundColor: theme.card, borderBottomColor: DIVIDER }]}>
        <Pressable onPress={onClose} style={styles.headerAction}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.chatHeaderName} numberOfLines={1}>
          {name} · settings
        </ThemedText>
      </View>
      <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', marginVertical: Spacing.two }}>
          <BrutalAvatar name={name} uri={avatar} size={72} />
        </View>

        {!personId ? (
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Labels and access controls are unavailable for this conversation.
          </ThemedText>
        ) : (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.formLabel}>
              LABELS
            </ThemedText>
            <View style={styles.labelWrap}>
              {labels.map((l) => {
                const on = labelIds.has(l.id);
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => toggleLabel(l.id)}
                    disabled={busy === l.id}
                    style={[styles.labelChip, { borderColor: l.color, backgroundColor: on ? l.color : 'transparent' }]}>
                    {busy === l.id ? (
                      <ActivityIndicator size="small" color={on ? '#fff' : l.color} />
                    ) : (
                      <Ionicons name={on ? 'checkmark' : 'add'} size={14} color={on ? '#fff' : l.color} />
                    )}
                    <ThemedText style={[styles.labelChipText, { color: on ? '#fff' : theme.text }]}>{l.name}</ThemedText>
                  </Pressable>
                );
              })}
              {!adding && (
                <Pressable onPress={() => setAdding(true)} style={[styles.labelChip, { borderColor: theme.border, borderStyle: 'dashed' }]}>
                  <Ionicons name="add" size={14} color={theme.textSecondary} />
                  <ThemedText style={[styles.labelChipText, { color: theme.textSecondary }]}>New label</ThemedText>
                </Pressable>
              )}
            </View>

            {adding && (
              <View style={[styles.newLabelBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Label name"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                  style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
                />
                <View style={styles.swatchRow}>
                  {LABEL_COLORS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setNewColor(c)}
                      style={[styles.swatch, { backgroundColor: c }, newColor === c && { borderColor: theme.text, borderWidth: 3 }]}
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                  <Pressable
                    onPress={createAndAssign}
                    disabled={!newName.trim() || busy === 'new'}
                    style={[styles.createBtn, { flex: 1, backgroundColor: newName.trim() ? theme.primary : theme.backgroundElement }]}>
                    {busy === 'new' ? (
                      <ActivityIndicator size="small" color={theme.primaryText} />
                    ) : (
                      <ThemedText style={[styles.createText, { color: newName.trim() ? theme.primaryText : theme.textSecondary }]}>Create & apply</ThemedText>
                    )}
                  </Pressable>
                  <Pressable onPress={() => { setAdding(false); setNewName(''); }} style={[styles.createBtn, { paddingHorizontal: Spacing.three, backgroundColor: theme.backgroundElement }]}>
                    <ThemedText style={[styles.createText, { color: theme.text }]}>Cancel</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}

            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.formLabel}>
              ACCESS
            </ThemedText>
            <Pressable
              onPress={toggleAccess}
              disabled={busy === 'access'}
              style={({ pressed }) => [styles.settingsRow, { borderColor: disabled ? theme.success : theme.danger }, pressed && { opacity: 0.7 }]}>
              <Ionicons name={disabled ? 'lock-open-outline' : 'remove-circle-outline'} size={20} color={disabled ? theme.success : theme.danger} />
              <View style={styles.rowText}>
                <ThemedText style={[styles.rowName, { color: disabled ? theme.success : theme.danger }]}>
                  {disabled ? 'Restore access' : 'Remove access'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {disabled ? 'Currently blocked from the app' : 'Signs them out and blocks the app'}
                </ThemedText>
              </View>
              {busy === 'access' && <ActivityIndicator size="small" color={theme.danger} />}
            </Pressable>
          </>
        )}

        <Pressable
          onPress={deleteChat}
          disabled={busy === 'delete'}
          style={({ pressed }) => [styles.deleteGroup, { borderColor: theme.danger }, pressed && { backgroundColor: theme.danger + '18' }]}>
          {busy === 'delete' ? (
            <ActivityIndicator size="small" color={theme.danger} />
          ) : (
            <>
              <Ionicons name="trash" size={18} color={theme.danger} />
              <ThemedText style={[styles.deleteGroupText, { color: theme.danger }]}>Delete conversation</ThemedText>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function LeaderboardPane() {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.fullPane}>
      <ThemedText style={styles.paneTitle}>Leaderboard</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.two }}>
        who's performing — by views, posts & activity
      </ThemedText>
      <LeaderboardView />
    </ScrollView>
  );
}

function ProfilePane() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pane
      title="Profile"
      action={
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.paneAction, { borderColor: theme.border, backgroundColor: theme.card }, brutalShadow(theme.shadow, 3), pressed && { opacity: 0.7 }]}>
          <Ionicons name="settings-outline" size={18} color={theme.text} />
          <ThemedText style={styles.paneActionText}>Settings</ThemedText>
        </Pressable>
      }>
      <View style={{ maxWidth: 560, width: '100%', gap: Spacing.three }}>
        <ProfileBody />
        <Pressable
          onPress={() => router.push('/levels')}
          style={({ pressed }) => [styles.lvCta, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
          <Ionicons name="ribbon" size={20} color={theme.primary} />
          <ThemedText style={styles.lvCtaText}>View levels & perks</ThemedText>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
    </Pane>
  );
}

/** Creator home — payouts, level, stats, top videos, and the views breakdown. */
function HomePane() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, session } = useAuth();
  const { loading, accounts, videos, totalFollowing, totalViews, totalVideos, payout, connected } = useStats();
  const { totalPaid, payouts } = usePayouts(session?.user?.id ?? null);
  const { levelNum, current } = useProgress();
  const owed = Math.max(0, payout - totalPaid);
  const topVideos = [...videos].sort((a, b) => b.views - a.views).slice(0, 6);
  const first = profile?.full_name?.split(' ')[0] ?? 'creator';

  return (
    <Pane title={`Welcome back, ${first}`} subtitle="your campaign at a glance">
      {/* Payouts */}
      <View style={styles.dashRow}>
        <Pressable
          onPress={() => router.push({ pathname: '/payout-breakdown', params: { mode: 'paid' } })}
          style={({ pressed }) => [styles.payCard, { backgroundColor: theme.success, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
          <View style={styles.payTop}>
            <ThemedText style={styles.payLabel}>paid out</ThemedText>
            <Ionicons name="chevron-forward" size={15} color="#fff" />
          </View>
          <ThemedText style={styles.payValue}>${totalPaid.toLocaleString()}</ThemedText>
          <ThemedText style={styles.paySub}>
            {payouts.length} {payouts.length === 1 ? 'payment' : 'payments'}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/payout-breakdown', params: { mode: 'owed' } })}
          style={({ pressed }) => [styles.payCard, { backgroundColor: theme.primary, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
          <View style={styles.payTop}>
            <ThemedText style={[styles.payLabel, { color: theme.primaryText }]}>owed to you</ThemedText>
            <Ionicons name="chevron-forward" size={15} color={theme.primaryText} />
          </View>
          <ThemedText style={[styles.payValue, { color: theme.primaryText }]}>${owed.toLocaleString()}</ThemedText>
          <ThemedText style={[styles.paySub, { color: theme.primaryText }]}>${payout.toLocaleString()} earned lifetime</ThemedText>
        </Pressable>

        {/* Level */}
        <Pressable
          onPress={() => router.push('/levels')}
          style={({ pressed }) => [styles.levelCard, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
          <Image source={badgeFor(levelNum).source} style={styles.levelBadge} contentFit="contain" />
          <View style={{ flex: 1, gap: 4 }}>
            <ThemedText style={styles.levelTitle} numberOfLines={1}>
              Level {levelNum}
              {current?.title ? ` · ${current.title}` : ''}
            </ThemedText>
            <XpBar height={12} color={current?.color ?? theme.primary} />
          </View>
        </Pressable>
      </View>

      {/* Stat cards */}
      <View style={styles.dashRow}>
        <DashStat icon="people" label="following" value={connected ? compact(totalFollowing) : '—'} loading={loading} />
        <DashStat icon="eye" label="total views" value={connected ? compact(totalViews) : '—'} loading={loading} />
        <DashStat icon="videocam" label="videos" value={connected ? `${totalVideos}` : '—'} loading={loading} />
      </View>

      {!connected && !loading && (
        <BrutalCard style={styles.connectCard}>
          <Ionicons name="link" size={26} color={theme.primary} />
          <ThemedText style={styles.connectTitle}>Link your accounts</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Connect your TikTok / Instagram in Settings to see your views, payouts and stats here.
          </ThemedText>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.connectBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}>
            <ThemedText style={[styles.connectBtnText, { color: theme.primaryText }]}>Open Settings</ThemedText>
          </Pressable>
        </BrutalCard>
      )}

      {/* Top videos */}
      {connected && topVideos.length > 0 && (
        <>
          <ThemedText style={styles.dashSection}>Top videos</ThemedText>
          <View style={styles.videoGrid}>
            {topVideos.map((v) => (
              <DashVideo key={v.id} video={v} onPress={() => router.push({ pathname: '/video/[id]', params: { id: v.id, v: JSON.stringify(v) } })} />
            ))}
          </View>
        </>
      )}

      {/* Views breakdown */}
      {connected && (
        <>
          <ThemedText style={styles.dashSection}>Breakdown</ThemedText>
          <ViewsBreakdown accounts={accounts} videos={videos} days={null} />
        </>
      )}
    </Pane>
  );
}

function DashStat({ icon, label, value, loading }: { icon: string; label: string; value: string; loading: boolean }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.statCard} shadow={3}>
      <Ionicons name={icon as never} size={20} color={theme.primary} />
      <ThemedText style={styles.statValue}>{loading ? '—' : value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </BrutalCard>
  );
}

function DashVideo({ video, onPress }: { video: VtVideo; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.vTile, { borderColor: theme.border }, brutalShadow(theme.shadow, 3), pressed && { opacity: 0.85 }]}>
      {video.thumbnail ? (
        <Image source={{ uri: video.thumbnail }} style={styles.vTileThumb} contentFit="cover" />
      ) : (
        <View style={[styles.vTileThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.vTileMeta}>
        <Ionicons name="eye" size={16} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {compact(video.views)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Creator briefs — grouped by date, each opens the brief screen. */
function RecordPane() {
  const theme = useTheme();
  const router = useRouter();
  const { scripts, loading } = useScripts();
  const { doneIds } = useCompletions();

  const groups = scripts.reduce<Record<string, Script[]>>((acc, s) => {
    (acc[s.scheduled_date] ??= []).push(s);
    return acc;
  }, {});
  const dates = Object.keys(groups).sort();
  const longDate = (key: string) => {
    const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  return (
    <Pane title="Record" subtitle="your filming briefs — tap one to open it">
      <View style={{ maxWidth: 680, width: '100%', gap: Spacing.three }}>
        {loading ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading briefs…
          </ThemedText>
        ) : dates.length === 0 ? (
          <BrutalCard style={styles.connectCard}>
            <Ionicons name="film-outline" size={28} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              No briefs assigned yet — check back soon.
            </ThemedText>
          </BrutalCard>
        ) : (
          dates.map((date) => {
            const items = groups[date];
            const done = items.filter((s) => doneIds.has(s.id)).length;
            return (
              <View key={date} style={{ gap: Spacing.two }}>
                <View style={styles.recDateRow}>
                  <ThemedText style={styles.recDate}>{longDate(date)}</ThemedText>
                  <ThemedText type="small" themeColor={done === items.length ? 'success' : 'textSecondary'}>
                    {done === items.length ? 'all done ✓' : `${done}/${items.length} filmed`}
                  </ThemedText>
                </View>
                {items.map((s) => {
                  const isDone = doneIds.has(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => router.push({ pathname: '/brief/[id]', params: { id: s.id } })}
                      style={({ pressed }) => [
                        styles.recRow,
                        { backgroundColor: theme.card, borderColor: isDone ? theme.success : theme.border },
                        brutalShadow(theme.shadow, 3),
                        pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
                      ]}>
                      {s.thumbnail ? (
                        <Image source={{ uri: s.thumbnail }} style={[styles.recThumb, { borderColor: theme.border }]} contentFit="cover" />
                      ) : (
                        <View style={[styles.recThumb, { backgroundColor: theme.backgroundElement, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="film-outline" size={22} color={theme.textSecondary} />
                        </View>
                      )}
                      <ThemedText style={styles.recTitle} numberOfLines={2}>
                        {s.title}
                      </ThemedText>
                      {isDone ? (
                        <Ionicons name="checkmark-circle" size={24} color={theme.success} />
                      ) : (
                        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </View>
    </Pane>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  rail: {
    width: 232,
    borderRightWidth: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  railBrand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, marginBottom: Spacing.four },
  railLogo: { width: 38, height: 38, borderRadius: Radius.md },
  railBrandText: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  railSection: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, opacity: 0.4, marginLeft: Spacing.two, marginBottom: Spacing.one },
  railItems: { gap: 4 },
  railBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 44, paddingHorizontal: Spacing.two + 2, borderRadius: Radius.md },
  railLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  railBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  railBadgeText: { color: '#fff', fontWeight: '900', fontSize: 11, lineHeight: 14 },
  railUser: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 'auto', padding: Spacing.two, borderRadius: Radius.md, borderTopWidth: 1 },
  railUserName: { fontSize: 14, fontWeight: '800' },

  console: { flex: 1, flexDirection: 'row' },
  listPanel: { width: 380, borderRightWidth: 1 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  panelTitle: { fontSize: 26, lineHeight: 34, fontWeight: '800' },
  panelTitleSm: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  panelBack: { padding: Spacing.one, marginRight: Spacing.two },
  compose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    height: 40,
  },
  search: { flex: 1, fontSize: 15, outlineStyle: 'none' } as object,

  // filter bar
  filterBar: { flexGrow: 0, marginBottom: Spacing.two },
  filterBarInner: { gap: Spacing.one + 2, paddingHorizontal: Spacing.three, alignItems: 'center' },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: Spacing.two + 2, borderRadius: Radius.full, borderWidth: 1 },
  fChipText: { fontSize: 13, fontWeight: '700' },
  fDot: { width: 8, height: 8, borderRadius: 4 },
  fDivider: { width: 1, height: 18, marginHorizontal: 2 },

  // label chips on rows
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  labelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1, marginRight: 2 },
  labelMenu: { position: 'absolute', width: 230, borderRadius: Radius.md, borderWidth: 1, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  labelMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 9 },
  labelMenuText: { flex: 1, fontSize: 14, fontWeight: '600' },
  labelMenuDivider: { height: 1, marginVertical: 4 },

  // person panel: label editor
  labelWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  labelChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: Spacing.two + 2, borderRadius: Radius.full, borderWidth: 1.75 },
  labelChipText: { fontSize: 13, fontWeight: '800' },
  newLabelBox: { padding: Spacing.two, borderRadius: Radius.md, borderWidth: 1.75, gap: Spacing.two, marginTop: Spacing.one },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: { width: 30, height: 30, borderRadius: 15, borderColor: 'transparent' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
  },
  rowIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  rowMeta: { alignItems: 'flex-end', gap: 4 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 10 },

  chatPane: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chatHeaderName: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  headerAction: { padding: Spacing.one },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },

  newForm: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.two },
  coverPick: { alignSelf: 'center', marginVertical: Spacing.two },
  cover: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  coverBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1.75,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    outlineStyle: 'none',
  } as object,
  formLabel: { letterSpacing: 0.5, marginTop: Spacing.two, marginBottom: Spacing.one },
  newFooter: { padding: Spacing.three },
  createBtn: { height: 50, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  createText: { fontWeight: '800', fontSize: 16 },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1.75,
  },
  deleteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: Border.widthThick,
  },
  deleteGroupText: { fontSize: 15, fontWeight: '900' },

  profileContent: { alignItems: 'center', padding: Spacing.five },
  profileInner: { width: '100%', maxWidth: 520, gap: Spacing.three },
  profileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileTitle: { fontSize: 28, lineHeight: 36, fontWeight: '800' },
  profileGear: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Shared pane chrome — content anchored left (after the rail) with consistent padding
  paneScroll: { padding: Spacing.five, paddingBottom: Spacing.six },
  paneInner: { width: '100%', maxWidth: 1040, gap: Spacing.three },
  fullPane: { padding: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.one },
  paneHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.three, marginBottom: Spacing.one },
  paneTitle: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  paneAction: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, height: 42, borderRadius: Radius.full, borderWidth: Border.width },
  paneActionText: { fontSize: 14, fontWeight: '800' },

  // Home dashboard
  dashRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  payCard: { flex: 1, minWidth: 180, gap: 2, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: Border.widthThick, justifyContent: 'center', minHeight: 116 },
  payTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: '#fff', opacity: 0.95 },
  payValue: { fontSize: 34, lineHeight: 40, fontWeight: '900', color: '#fff' },
  paySub: { fontSize: 12, fontWeight: '700', opacity: 0.9, color: '#fff' },
  levelCard: { flex: 1.4, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: Border.widthThick },
  levelBadge: { width: 64, height: 64 },
  levelTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  statCard: { flex: 1, minWidth: 150, alignItems: 'flex-start', gap: 2, paddingHorizontal: Spacing.three, minHeight: 92, justifyContent: 'center' },
  statValue: { fontSize: 26, lineHeight: 32, fontWeight: '900' },
  dashSection: { fontSize: 19, lineHeight: 24, fontWeight: '900', marginTop: Spacing.two },
  videoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  vTile: { width: 150, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  vTileThumb: { width: '100%', height: 200 },
  vTileMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: Spacing.two },
  connectCard: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  connectTitle: { fontSize: 18, fontWeight: '900' },
  connectBtn: { marginTop: Spacing.two, paddingHorizontal: Spacing.four, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  connectBtnText: { fontSize: 15, fontWeight: '800' },
  lvCta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.lg, borderWidth: Border.widthThick },
  lvCtaText: { flex: 1, fontSize: 16, fontWeight: '800' },

  // Record briefs
  recDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  recDate: { fontSize: 17, fontWeight: '900' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.lg, borderWidth: Border.width },
  recThumb: { width: 64, height: 64, borderRadius: Radius.sm, borderWidth: Border.width },
  recTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800' },
});
