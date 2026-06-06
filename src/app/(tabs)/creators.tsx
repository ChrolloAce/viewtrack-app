import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalButton, BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { vtAccounts, vtProjects, type VtAccount, type VtProject } from '@/lib/viewtrack';

export type Creator = { id: string; full_name: string | null; avatar_url: string | null; disabled: boolean };
export type ExistingLink = {
  id: string;
  vt_account_id: string;
  vt_project_id: string | null;
  username?: string | null;
  platform?: string | null;
  url?: string | null;
};

const sb = supabase as unknown as { from: (t: string) => any };
const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function CreatorsTab() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  return <CreatorsAdmin bottomInset={BottomTabInset} />;
}

/** Shared loader for the creators admin UI (mobile list + desktop console). */
export function useCreatorsData() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [projects, setProjects] = useState<VtProject[]>([]);
  const [linksByCreator, setLinksByCreator] = useState<Record<string, ExistingLink[]>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [{ data: profs }, projs, { data: linkRows }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url, disabled').eq('role', 'creator').order('full_name'),
      vtProjects(),
      sb.from('account_links').select('id, profile_id, vt_account_id, vt_project_id, username, platform, url').eq('status', 'linked'),
    ]);
    const grouped: Record<string, ExistingLink[]> = {};
    ((linkRows as any[]) ?? []).forEach((r) => {
      if (!r.vt_account_id) return;
      (grouped[r.profile_id] ??= []).push({
        id: r.id,
        vt_account_id: r.vt_account_id,
        vt_project_id: r.vt_project_id,
        username: r.username,
        platform: r.platform,
        url: r.url,
      });
    });
    setCreators((profs as unknown as Creator[]) ?? []);
    setProjects(projs);
    setLinksByCreator(grouped);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { creators, projects, linksByCreator, loading, reload };
}

export function CreatorsAdmin({ bottomInset = 0 }: { bottomInset?: number }) {
  const theme = useTheme();
  const { isAdmin } = useAuth();
  const { creators, projects, linksByCreator, loading, reload: load } = useCreatorsData();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>creators</ThemedText>
        </View>

        {!isAdmin ? (
          <View style={styles.center}>
            <ThemedText type="small" themeColor="textSecondary">
              Admins only.
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing.three }]}
            keyboardShouldPersistTaps="handled">
            {/* summary cards */}
            <View style={styles.summaryRow}>
              <SummaryCard label="Total" value={creators.length} icon="people" />
              <SummaryCard label="Active" value={creators.filter((c) => !c.disabled).length} icon="checkmark-circle" tone={theme.success} />
              <SummaryCard label="Removed" value={creators.filter((c) => c.disabled).length} icon="close-circle" tone={theme.danger} />
            </View>

            {loading ? (
              <ActivityIndicator color={theme.primary} style={{ paddingVertical: Spacing.five }} />
            ) : (
              creators.map((c) => (
                <CreatorRow key={c.id} creator={c} projects={projects} existing={linksByCreator[c.id] ?? []} onChanged={load} />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone?: string }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.summaryCard}>
      <Ionicons name={icon as never} size={18} color={tone ?? theme.primary} />
      <ThemedText style={styles.summaryValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </BrutalCard>
  );
}

export function CreatorRow({
  creator,
  projects,
  existing,
  onChanged,
  defaultOpen = false,
}: {
  creator: Creator;
  projects: VtProject[];
  existing: ExistingLink[];
  onChanged: () => void;
  defaultOpen?: boolean;
}) {
  const theme = useTheme();
  const { session } = useAuth();
  const firstProject = existing[0]?.vt_project_id ?? null;
  const [open, setOpen] = useState(defaultOpen);
  const [projectId, setProjectId] = useState<string | null>(firstProject);
  const [projectOpen, setProjectOpen] = useState(false);
  const [accounts, setAccounts] = useState<VtAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(existing.filter((l) => l.vt_project_id === firstProject).map((l) => l.vt_account_id)),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!projectId || !open) return;
    let active = true;
    setLoadingAccounts(true);
    vtAccounts(projectId).then((list) => {
      if (active) {
        setAccounts(list);
        setLoadingAccounts(false);
      }
    });
    return () => {
      active = false;
    };
  }, [projectId, open]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    const desired = [...selected];
    const existingForProject = existing.filter((l) => l.vt_project_id === projectId);
    const existingIds = existingForProject.map((l) => l.vt_account_id);
    const toAdd = accounts.filter((a) => desired.includes(a.id) && !existingIds.includes(a.id));
    const toDeleteRowIds = existingForProject.filter((l) => !desired.includes(l.vt_account_id)).map((l) => l.id);

    if (toAdd.length) {
      await sb.from('account_links').upsert(
        toAdd.map((a) => ({
          profile_id: creator.id,
          platform: a.platform,
          username: a.username,
          vt_account_id: a.id,
          vt_project_id: projectId,
          status: 'linked',
          decided_by: session?.user?.id ?? null,
          decided_at: new Date().toISOString(),
        })),
        { onConflict: 'profile_id,vt_account_id' },
      );
    }
    if (toDeleteRowIds.length) await sb.from('account_links').delete().in('id', toDeleteRowIds);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onChanged();
  }

  function confirmAccess() {
    const next = !creator.disabled;
    Alert.alert(
      next ? 'Remove access?' : 'Restore access?',
      next ? `${creator.full_name || 'This creator'} will be signed out and blocked from the app.` : `Restore access for ${creator.full_name || 'this creator'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Remove' : 'Restore',
          style: next ? 'destructive' : 'default',
          onPress: async () => {
            await supabase.from('profiles').update({ disabled: next } as never).eq('id', creator.id);
            onChanged();
          },
        },
      ],
    );
  }

  const projectName = projects.find((p) => p.id === projectId)?.name ?? 'select project';

  return (
    <BrutalCard style={creator.disabled ? [styles.card, { opacity: 0.6 }] : styles.card}>
      <Pressable style={styles.idRow} onPress={() => setOpen((o) => !o)}>
        <BrutalAvatar name={creator.full_name} uri={creator.avatar_url} size={40} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {creator.full_name || 'Unnamed creator'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {creator.disabled ? 'access removed' : `${existing.length} account${existing.length === 1 ? '' : 's'} linked`}
          </ThemedText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
      </Pressable>

      {open && (
        <>
          <Pressable
            onPress={() => setProjectOpen((o) => !o)}
            style={[styles.selectBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <ThemedText style={[styles.selectLabel, { color: projectId ? theme.text : theme.textSecondary }]} numberOfLines={1}>
              {projectName}
            </ThemedText>
            <Ionicons name={projectOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
          </Pressable>
          {projectOpen && (
            <View style={[styles.selectList, { borderColor: theme.border, backgroundColor: theme.card }]}>
              {projects.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setProjectId(p.id);
                    setProjectOpen(false);
                    setSelected(new Set(existing.filter((l) => l.vt_project_id === p.id).map((l) => l.vt_account_id)));
                  }}
                  style={({ pressed }) => [styles.selectOpt, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText style={styles.selectOptText} numberOfLines={1}>
                    {p.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {p.accountCount} accts
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}

          {projectId &&
            (loadingAccounts ? (
              <ActivityIndicator color={theme.primary} style={{ paddingVertical: Spacing.three }} />
            ) : (
              <View style={[styles.accountList, { borderColor: theme.border }]}>
                {accounts.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.accEmpty}>
                    No accounts in this project.
                  </ThemedText>
                ) : (
                  accounts.map((a) => {
                    const on = selected.has(a.id);
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => toggle(a.id)}
                        style={({ pressed }) => [styles.accRow, { borderBottomColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                        {a.profilePicUrl ? (
                          <Image source={{ uri: a.profilePicUrl }} style={styles.accPic} contentFit="cover" />
                        ) : (
                          <View style={[styles.accPic, { backgroundColor: theme.backgroundElement }]} />
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={styles.accTop}>
                            <Ionicons name={PLATFORM_ICON[a.platform] as never} size={13} color={theme.textSecondary} />
                            <ThemedText style={styles.accName} numberOfLines={1}>
                              @{a.username}
                            </ThemedText>
                          </View>
                          <ThemedText type="small" themeColor="textSecondary">
                            {compact(a.followerCount)} followers · {a.totalVideos} videos
                          </ThemedText>
                        </View>
                        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? theme.primary : theme.textSecondary} />
                      </Pressable>
                    );
                  })
                )}
              </View>
            ))}

          <BrutalButton label={saved ? 'saved ✓' : 'save links'} onPress={save} loading={saving} disabled={!projectId} />
          <BrutalButton
            label={creator.disabled ? 'restore access' : 'remove access'}
            variant={creator.disabled ? 'neutral' : 'danger'}
            onPress={confirmAccess}
          />
        </>
      )}
    </BrutalCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.six },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.one },
  summaryCard: { flex: 1, alignItems: 'flex-start', gap: 2, paddingHorizontal: Spacing.two, minHeight: 76, justifyContent: 'center' },
  summaryValue: { fontSize: 24, lineHeight: 30, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { gap: Spacing.two },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontSize: 17, fontWeight: '800' },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  selectLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  selectList: { borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  selectOpt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  selectOptText: { flex: 1, fontSize: 15, fontWeight: '700' },
  accountList: { borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  accEmpty: { padding: Spacing.three },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  accPic: { width: 38, height: 38, borderRadius: 19 },
  accTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  accName: { fontSize: 15, fontWeight: '800' },
});
