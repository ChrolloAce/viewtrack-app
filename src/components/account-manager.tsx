import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { Creator, ExistingLink } from '@/app/(tabs)/creators';
import { BrutalAvatar, BrutalButton } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { addAccountsBulk, detectPlatform, vtAccounts, type VtAccount, type VtProject } from '@/lib/viewtrack';

const sb = supabase as unknown as { from: (t: string) => any };
const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function AccountManager({
  creator,
  existing,
  linked,
  projects,
  loadingLinked,
  onChanged,
}: {
  creator: Creator;
  existing: ExistingLink[];
  linked: VtAccount[]; // rich ViewTrack data for the currently-linked accounts
  projects: VtProject[];
  loadingLinked: boolean;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const { session } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | { mode: 'add' | 'replace'; link?: ExistingLink }>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null);

  const acctFor = (link: ExistingLink) =>
    linked.find((a) => a.id === link.vt_account_id) ?? null;

  async function remove(link: ExistingLink) {
    setBusyId(link.id);
    await sb.from('account_links').delete().eq('id', link.id);
    setBusyId(null);
    onChanged();
  }

  async function pick(account: VtAccount) {
    const ctx = picker;
    setPicker(null);
    const row = {
      profile_id: creator.id,
      platform: account.platform,
      username: account.username,
      vt_account_id: account.id,
      vt_project_id: ctx?.link?.vt_project_id ?? projects[0]?.id ?? null,
      status: 'linked',
      decided_by: session?.user?.id ?? null,
      decided_at: new Date().toISOString(),
    };
    if (ctx?.mode === 'replace' && ctx.link) {
      await sb.from('account_links').delete().eq('id', ctx.link.id);
    }
    await sb.from('account_links').upsert(row, { onConflict: 'profile_id,vt_account_id' });
    onChanged();
  }

  return (
    <View style={{ gap: Spacing.two }}>
      {loadingLinked ? (
        [0, 1].map((i) => <Skeleton key={i} height={64} radius={Radius.md} />)
      ) : existing.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Ionicons name="link-outline" size={22} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            No accounts linked yet.
          </ThemedText>
        </View>
      ) : (
        existing.map((link) => {
          const a = acctFor(link);
          return (
            <View key={link.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {a?.profilePicUrl ? (
                <Image source={{ uri: a.profilePicUrl }} style={styles.pic} contentFit="cover" />
              ) : (
                <View style={[styles.pic, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name={(PLATFORM_ICON[link.platform ?? a?.platform ?? ''] ?? 'person') as never} size={18} color={theme.textSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.handleRow}>
                  <Ionicons name={(PLATFORM_ICON[link.platform ?? a?.platform ?? ''] ?? 'link') as never} size={14} color={PLATFORM_COLOR[link.platform ?? a?.platform ?? ''] ?? theme.text} />
                  <ThemedText style={styles.handle} numberOfLines={1}>
                    @{(link.username ?? a?.username ?? '').replace('@', '') || 'account'}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {a ? `${compact(a.followerCount)} followers · ${a.totalVideos} videos` : 'linked'}
                </ThemedText>
              </View>
              {busyId === link.id ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <>
                  <Pressable onPress={() => setPicker({ mode: 'replace', link })} hitSlop={8} style={({ pressed }) => [styles.iconBtn, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}>
                    <Ionicons name="swap-horizontal" size={18} color={theme.text} />
                  </Pressable>
                  <Pressable onPress={() => remove(link)} hitSlop={8} style={({ pressed }) => [styles.iconBtn, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}>
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  </Pressable>
                </>
              )}
            </View>
          );
        })
      )}

      <BrutalButton label="+ Add accounts" onPress={() => setAddOpen(true)} />
      {!!queuedMsg && (
        <ThemedText type="small" style={{ color: theme.success }}>
          {queuedMsg}
        </ThemedText>
      )}

      {addOpen && (
        <AddAccountsModal
          creator={creator}
          projects={projects}
          excludeIds={new Set(existing.map((l) => l.vt_account_id))}
          onClose={() => setAddOpen(false)}
          onQueued={(n) => {
            setAddOpen(false);
            setQueuedMsg(`✓ ${n} account${n === 1 ? '' : 's'} queued — syncing in the background, safe to leave this page.`);
            setTimeout(() => setQueuedMsg(null), 10000);
            onChanged();
          }}
        />
      )}

      <AccountPicker
        visible={!!picker}
        mode={picker?.mode ?? 'add'}
        projects={projects}
        defaultProject={picker?.link?.vt_project_id ?? projects[0]?.id ?? null}
        excludeIds={new Set(existing.map((l) => l.vt_account_id))}
        onClose={() => setPicker(null)}
        onPick={pick}
      />
    </View>
  );
}

/** The add-accounts popup: multi-select from the ViewTrack project's
 *  accounts AND/OR paste profile URLs (one per line) — fired as ONE
 *  background job, so closing the page is safe. */
function AddAccountsModal({
  creator,
  projects,
  excludeIds,
  onClose,
  onQueued,
}: {
  creator: Creator;
  projects: VtProject[];
  excludeIds: Set<string>;
  onClose: () => void;
  onQueued: (n: number) => void;
}) {
  const theme = useTheme();
  const [accounts, setAccounts] = useState<VtAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [urls, setUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const pid = projects[0]?.id;
    if (!pid) {
      setLoading(false);
      return;
    }
    vtAccounts(pid).then((a) => {
      setAccounts(a.filter((x) => !excludeIds.has(x.id)));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urlList = urls
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => s && detectPlatform(s));
  const total = sel.size + urlList.length;

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function queue() {
    if (!total || busy) return;
    setBusy(true);
    setErr(null);
    const r = await addAccountsBulk(creator.id, { accountIds: [...sel], urls: urlList });
    setBusy(false);
    if (r.ok) onQueued(r.queued ?? total);
    else setErr(r.error ?? 'failed');
  }

  const filtered = accounts.filter((a) => !search.trim() || a.username.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.addBackdrop} onPress={onClose}>
        <Pressable style={[styles.addPanel, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5)]} onPress={() => {}}>
          <View style={styles.addHead}>
            <ThemedText style={styles.addTitle} numberOfLines={1}>
              add accounts · {creator.full_name}
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.manualRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement, height: 40 }]}>
            <Ionicons name="search" size={15} color={theme.textSecondary} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search ViewTrack accounts" placeholderTextColor={theme.textSecondary} style={[styles.manualInput, { color: theme.text }]} />
          </View>

          <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 5 }}>
            {loading ? (
              <ActivityIndicator color={theme.primary} style={{ paddingVertical: 20 }} />
            ) : filtered.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: 12 }}>
                {accounts.length === 0 ? 'No unlinked ViewTrack accounts — paste URLs below.' : 'No matches.'}
              </ThemedText>
            ) : (
              filtered.map((a) => {
                const on = sel.has(a.id);
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => toggle(a.id)}
                    style={({ pressed }) => [styles.selRow, { borderColor: on ? theme.primary : theme.border, borderWidth: on ? 2 : Border.width, backgroundColor: on ? theme.primaryMuted : undefined }, pressed && { opacity: 0.7 }]}>
                    {a.profilePicUrl ? <Image source={{ uri: a.profilePicUrl }} style={styles.selPic} contentFit="cover" /> : <View style={[styles.selPic, { backgroundColor: theme.backgroundElement }]} />}
                    <Ionicons name={(PLATFORM_ICON[a.platform] ?? 'link') as never} size={14} color={PLATFORM_COLOR[a.platform] ?? theme.text} />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontWeight: '800' }} numberOfLines={1}>
                        @{a.username}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {compact(a.followerCount)} followers · {a.totalVideos} videos
                      </ThemedText>
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? theme.primary : theme.textSecondary} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <ThemedText type="smallBold" themeColor="textSecondary">
            or paste profile URLs — one per line (added to ViewTrack automatically)
          </ThemedText>
          <TextInput
            value={urls}
            onChangeText={setUrls}
            placeholder={'tiktok.com/@handle\ninstagram.com/handle'}
            placeholderTextColor={theme.textSecondary}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.urlBox, { color: theme.text, borderColor: theme.border }]}
          />

          {!!err && (
            <ThemedText type="small" themeColor="danger">
              {err}
            </ThemedText>
          )}
          <Pressable
            onPress={queue}
            disabled={!total || busy}
            style={({ pressed }) => [styles.queueBtn, { backgroundColor: total ? theme.primary : theme.backgroundElement, borderColor: theme.border }, total ? brutalShadow(theme.shadow, 3) : null, pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
            {busy ? (
              <ActivityIndicator size="small" color={theme.primaryText} />
            ) : (
              <ThemedText style={{ color: total ? theme.primaryText : theme.textSecondary, fontWeight: '900', fontSize: 15 }}>
                {total ? `Add ${total} account${total === 1 ? '' : 's'} (runs in background)` : 'Select accounts or paste URLs'}
              </ThemedText>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AccountPicker({
  visible,
  mode,
  projects,
  defaultProject,
  excludeIds,
  onClose,
  onPick,
}: {
  visible: boolean;
  mode: 'add' | 'replace';
  projects: VtProject[];
  defaultProject: string | null;
  excludeIds: Set<string>;
  onClose: () => void;
  onPick: (a: VtAccount) => void;
}) {
  const theme = useTheme();
  const [projectId, setProjectId] = useState<string | null>(defaultProject);
  const [projOpen, setProjOpen] = useState(false);
  const [accounts, setAccounts] = useState<VtAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setProjectId(defaultProject);
  }, [visible, defaultProject]);

  useEffect(() => {
    if (!visible || !projectId) return;
    let active = true;
    setLoading(true);
    vtAccounts(projectId).then((list) => {
      if (active) {
        setAccounts(list);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [visible, projectId]);

  const q = query.trim().toLowerCase();
  const rows = accounts.filter((a) => (mode === 'add' ? !excludeIds.has(a.id) : true) && (!q || (a.username ?? '').toLowerCase().includes(q)));
  const projectName = projects.find((p) => p.id === projectId)?.name ?? 'Select project';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 6)]} onPress={() => {}}>
          <View style={styles.sheetHead}>
            <ThemedText style={styles.sheetTitle}>{mode === 'replace' ? 'Replace account' : 'Add account'}</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>

          {projects.length > 1 && (
            <View>
              <Pressable onPress={() => setProjOpen((o) => !o)} style={[styles.projectBtn, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <ThemedText style={styles.projectText} numberOfLines={1}>
                  {projectName}
                </ThemedText>
                <Ionicons name={projOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textSecondary} />
              </Pressable>
              {projOpen && (
                <View style={[styles.projectList, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  {projects.map((p) => (
                    <Pressable key={p.id} onPress={() => { setProjectId(p.id); setProjOpen(false); }} style={({ pressed }) => [styles.projectOpt, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText numberOfLines={1}>{p.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {p.accountCount} accts
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={[styles.searchWrap, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="search" size={16} color={theme.textSecondary} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search ViewTrack accounts…" placeholderTextColor={theme.textSecondary} style={[styles.search, { color: theme.text }]} autoFocus />
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} radius={Radius.md} style={{ marginBottom: Spacing.two }} />)
            ) : rows.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: Spacing.four }}>
                No accounts found.
              </ThemedText>
            ) : (
              rows.map((a) => (
                <Pressable key={a.id} onPress={() => onPick(a)} style={({ pressed }) => [styles.pickRow, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                  {a.profilePicUrl ? (
                    <Image source={{ uri: a.profilePicUrl }} style={styles.pic} contentFit="cover" />
                  ) : (
                    <View style={[styles.pic, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name={(PLATFORM_ICON[a.platform] ?? 'person') as never} size={18} color={theme.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.handleRow}>
                      <Ionicons name={(PLATFORM_ICON[a.platform] ?? 'link') as never} size={14} color={PLATFORM_COLOR[a.platform] ?? theme.text} />
                      <ThemedText style={styles.handle} numberOfLines={1}>
                        @{a.username}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {compact(a.followerCount)} followers · {a.totalVideos} videos
                    </ThemedText>
                  </View>
                  <Ionicons name="add-circle" size={24} color={theme.primary} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four, borderRadius: Radius.md, borderWidth: Border.width, borderStyle: 'dashed' },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.two + 2, paddingRight: 5, height: 46, borderRadius: Radius.md, borderWidth: Border.width },
  manualInput: { flex: 1, fontSize: 14, fontWeight: '600', height: '100%' },
  addBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  addPanel: { width: '100%', maxWidth: 480, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  addHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  addTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  selRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  selPic: { width: 32, height: 32, borderRadius: 16 },
  urlBox: { minHeight: 70, maxHeight: 120, borderRadius: Radius.md, borderWidth: Border.width, padding: Spacing.two + 2, fontSize: 14, fontWeight: '600', textAlignVertical: 'top' },
  queueBtn: { alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: Radius.md, borderWidth: Border.width },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  pic: { width: 44, height: 44, borderRadius: 22 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  handle: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: Radius.sm, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '82%', borderRadius: Radius.lg, borderWidth: Border.widthThick, padding: Spacing.three, gap: Spacing.two },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '900' },
  projectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.md, borderWidth: Border.width },
  projectText: { fontSize: 15, fontWeight: '700', flex: 1 },
  projectList: { marginTop: 4, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  projectOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: Border.width },
  search: { flex: 1, fontSize: 15, outlineStyle: 'none' } as object,
  list: { maxHeight: 420 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width, marginBottom: Spacing.two },
});
