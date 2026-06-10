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
import { addAccountByUrl, detectPlatform, vtAccounts, type VtAccount, type VtProject } from '@/lib/viewtrack';

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

      <BrutalButton label="+ Add account" variant="neutral" onPress={() => setPicker({ mode: 'add' })} />

      {/* manual add — any profile URL, tracked in ViewTrack automatically */}
      <ManualAddRow profileId={creator.id} onChanged={onChanged} />

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

/** Paste any TikTok / Instagram / YouTube profile URL — ViewTrack tracks it
 *  automatically, no need for the account to exist there first. */
function ManualAddRow({ profileId, onChanged }: { profileId: string; onChanged: () => void }) {
  const theme = useTheme();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const platform = detectPlatform(url);

  async function add() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await addAccountByUrl(profileId, url.trim());
    setBusy(false);
    if (r.ok) {
      setUrl('');
      setMsg('✓ added — ViewTrack is syncing it now');
      onChanged();
    } else {
      setMsg(r.error ?? 'failed');
    }
    setTimeout(() => setMsg(null), 6000);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.manualRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Ionicons name={(platform ? PLATFORM_ICON[platform] : 'link-outline') as never} size={16} color={platform ? PLATFORM_COLOR[platform] : theme.textSecondary} />
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="or paste any profile URL (tiktok.com/@…, instagram.com/…)"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.manualInput, { color: theme.text }]}
          onSubmitEditing={add}
        />
        <Pressable onPress={add} disabled={!url.trim() || busy} style={[styles.manualBtn, { backgroundColor: url.trim() ? theme.primary : theme.backgroundElement }]}>
          {busy ? (
            <ActivityIndicator size="small" color={theme.primaryText} />
          ) : (
            <ThemedText style={{ color: url.trim() ? theme.primaryText : theme.textSecondary, fontWeight: '900', fontSize: 13 }}>add</ThemedText>
          )}
        </Pressable>
      </View>
      {!!msg && (
        <ThemedText type="small" style={{ color: msg.startsWith('✓') ? theme.success : theme.danger }}>
          {msg}
        </ThemedText>
      )}
    </View>
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
  manualBtn: { paddingHorizontal: Spacing.two + 4, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', minWidth: 52 },
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
