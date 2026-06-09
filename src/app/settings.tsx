import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalButton, BrutalCard, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { badgeFor } from '@/lib/badges';
import { supabase } from '@/lib/supabase';
import { useProgress } from '@/lib/use-progress';
import { useStats } from '@/lib/use-stats';
import { deleteLink, detectPlatform, myLinks, submitLink, type AccountLink, type VtAccount } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };
function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

type Role = 'creator' | 'admin';


function randomCode(prefix: string, len: number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return prefix + out;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <BrutalCard style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </BrutalCard>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, session, isAdmin, refreshProfile } = useAuth();
  const uid = session?.user?.id ?? null;
  const { levelNum, current } = useProgress();
  const { accounts } = useStats();
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const loadLinks = useCallback(async () => {
    if (uid) setLinks(await myLinks(uid));
  }, [uid]);
  useEffect(() => {
    loadLinks();
  }, [loadLinks]);
  const pending = links.filter((l) => l.status === 'pending');
  const [name, setName] = useState(profile?.full_name ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    if (name.trim() !== (profile.full_name ?? '')) {
      await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id);
      await refreshProfile();
    }
    setSaving(false);
    setEditing(false);
  }

  async function changePhoto() {
    if (!profile) return;
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar(profile.id);
      if (url) await refreshProfile();
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  }

  async function syncBriefs() {
    setSyncing(true);
    setSyncMsg(null);
    const { data, error } = await supabase.functions.invoke('sync-superbrief');
    setSyncing(false);
    setSyncMsg(error ? 'Sync failed' : `Synced ${data?.synced ?? 0} scripts ✓`);
    setTimeout(() => setSyncMsg(null), 5000);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>settings</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* profile card with inline edit */}
          <BrutalCard style={styles.profileCard}>
            <View style={styles.profileRow}>
              <Pressable onPress={editing ? changePhoto : undefined} disabled={!editing || uploading} style={styles.avatarWrap}>
                <View style={[styles.avatarRing, { borderColor: current?.color ?? theme.primary }]}>
                  <BrutalAvatar name={profile?.full_name} uri={profile?.avatar_url} size={62} />
                </View>
                <Image source={badgeFor(levelNum).source} style={styles.badgeOverlay} contentFit="contain" />
                {editing && (
                  <View style={[styles.camChip, { backgroundColor: theme.primary, borderColor: theme.card }]}>
                    {uploading ? <ActivityIndicator size="small" color={theme.primaryText} /> : <Ionicons name="camera" size={12} color={theme.primaryText} />}
                  </View>
                )}
              </Pressable>

              <View style={styles.profileText}>
                {editing ? (
                  <BrutalInput placeholder="Your name" value={name} onChangeText={setName} />
                ) : (
                  <ThemedText style={styles.profileName} numberOfLines={1}>
                    {profile?.full_name || 'Your name'}
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {session?.user?.email ?? '—'}
                </ThemedText>
              </View>

              <Pressable
                onPress={() => (editing ? saveProfile() : setEditing(true))}
                disabled={saving}
                hitSlop={10}
                style={({ pressed }) => [styles.pencil, { borderColor: theme.border, backgroundColor: editing ? theme.primary : 'transparent' }, pressed && { opacity: 0.6 }]}>
                {saving ? (
                  <ActivityIndicator size="small" color={theme.primaryText} />
                ) : (
                  <Ionicons name={editing ? 'checkmark' : 'pencil'} size={16} color={editing ? theme.primaryText : theme.text} />
                )}
              </Pressable>
            </View>
          </BrutalCard>

          {/* connected accounts */}
          <BrutalCard style={styles.section}>
            <View style={styles.connectedHead}>
              <ThemedText style={styles.sectionTitle}>connected accounts</ThemedText>
              <Pressable
                onPress={() => setLinkOpen(true)}
                style={({ pressed }) => [styles.linkBtn, { backgroundColor: theme.primary, borderColor: theme.border }, pressed && { opacity: 0.85 }]}>
                <Ionicons name="add" size={15} color={theme.primaryText} />
                <ThemedText style={[styles.linkBtnText, { color: theme.primaryText }]}>Link New Account</ThemedText>
              </Pressable>
            </View>
            <View style={styles.connectedList}>
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
              {pending.map((l) => (
                <View key={l.id} style={[styles.pendingRow, { borderColor: theme.border }]}>
                  <Ionicons name={PLATFORM_ICON[l.platform] as never} size={18} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.accName} numberOfLines={1}>
                      @{l.username}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {l.platform} · pending review
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={async () => {
                      await deleteLink(l.id);
                      loadLinks();
                    }}
                    hitSlop={10}>
                    <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ))}
              {accounts.length === 0 && pending.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No accounts linked yet.
                </ThemedText>
              )}
            </View>
          </BrutalCard>

          {isAdmin && (
            <Section title="admin">
              <BrutalButton
                label={syncing ? 'syncing briefs…' : 'sync briefs (SuperBrief)'}
                variant="accent"
                loading={syncing}
                onPress={syncBriefs}
              />
              {syncMsg && (
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  {syncMsg}
                </ThemedText>
              )}
              <AdminCodes />
            </Section>
          )}

          <ChangePassword />

          <BrutalButton label="sign out" variant="danger" onPress={() => supabase.auth.signOut()} />
        </ScrollView>

        <LinkAccountsModal visible={linkOpen} onClose={() => setLinkOpen(false)} onDone={loadLinks} />
      </SafeAreaView>
    </ThemedView>
  );
}

function AccountRow({ account }: { account: VtAccount }) {
  const theme = useTheme();
  return (
    <View style={[styles.accountRow, { borderColor: theme.border }]}>
      {account.profilePicUrl ? (
        <Image source={{ uri: account.profilePicUrl }} style={styles.accPic} contentFit="cover" />
      ) : (
        <View style={[styles.accPic, { backgroundColor: theme.backgroundElement }]} />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.accTop}>
          <Ionicons name={PLATFORM_ICON[account.platform] as never} size={14} color={theme.text} />
          <ThemedText style={styles.accName} numberOfLines={1}>
            @{account.username}
          </ThemedText>
          {account.isVerified && <Ionicons name="checkmark-circle" size={14} color={theme.primary} />}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {compact(account.totalViews)} views · {account.totalVideos} videos
        </ThemedText>
      </View>
      <View style={styles.accFollowers}>
        <ThemedText style={styles.accFollowersNum}>{compact(account.followerCount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          followers
        </ThemedText>
      </View>
    </View>
  );
}

function LinkAccountsModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const theme = useTheme();
  const [urls, setUrls] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function linkAll() {
    const list = urls.map((u) => u.trim()).filter(Boolean);
    if (!list.length || busy) return;
    setBusy(true);
    setMsg(null);
    let linked = 0;
    let pendingC = 0;
    let failed = 0;
    for (const u of list) {
      const r = await submitLink(u);
      if (r.status === 'linked') linked++;
      else if (r.status === 'pending') pendingC++;
      else failed++;
    }
    setBusy(false);
    setMsg(`${linked} linked · ${pendingC} pending${failed ? ` · ${failed} failed` : ''}`);
    onDone();
    setTimeout(() => {
      setUrls(['']);
      setMsg(null);
      onClose();
    }, 1500);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Pressable style={[styles.linkSheet, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
          <View style={styles.linkSheetHead}>
            <ThemedText style={styles.linkSheetTitle}>Link accounts</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Paste your TikTok / Instagram / YouTube profile link(s). Add as many as you want.
          </ThemedText>
          {urls.map((u, i) => {
            const p = detectPlatform(u);
            return (
              <View key={i} style={styles.linkRow}>
                <Ionicons name={(p ? PLATFORM_ICON[p] : 'link') as never} size={18} color={p ? PLATFORM_COLOR[p] : theme.textSecondary} />
                <View style={{ flex: 1 }}>
                  <BrutalInput
                    placeholder="paste link"
                    value={u}
                    onChangeText={(t) => setUrls((arr) => arr.map((x, idx) => (idx === i ? t : x)))}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {urls.length > 1 && (
                  <Pressable onPress={() => setUrls((arr) => arr.filter((_, idx) => idx !== i))} hitSlop={8}>
                    <Ionicons name="remove-circle" size={24} color={theme.danger} />
                  </Pressable>
                )}
              </View>
            );
          })}
          <Pressable onPress={() => setUrls((u) => [...u, ''])} style={styles.addRowBtn}>
            <Ionicons name="add" size={16} color={theme.primary} />
            <ThemedText style={[styles.addRowText, { color: theme.primary }]}>add another</ThemedText>
          </Pressable>
          <BrutalButton label={busy ? 'linking…' : 'Link accounts'} onPress={linkAll} loading={busy} disabled={!urls.some((u) => u.trim())} />
          {!!msg && (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {msg}
            </ThemedText>
          )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setMsg(null);
    if (pw.length < 8) {
      setMsg({ ok: false, text: 'Use at least 8 characters.' });
      return;
    }
    if (pw !== pw2) {
      setMsg({ ok: false, text: 'Passwords don’t match.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      setMsg({ ok: true, text: 'Password updated ✓' });
      setPw('');
      setPw2('');
      setOpen(false);
    }
  }

  return (
    <Section title="password">
      {!open ? (
        <>
          <BrutalButton label="change password" variant="neutral" onPress={() => setOpen(true)} />
          {msg?.ok && (
            <ThemedText type="small" themeColor="success" style={{ textAlign: 'center' }}>
              {msg.text}
            </ThemedText>
          )}
        </>
      ) : (
        <>
          <BrutalInput placeholder="New password" secureTextEntry value={pw} onChangeText={setPw} autoComplete="new-password" />
          <BrutalInput placeholder="Confirm new password" secureTextEntry value={pw2} onChangeText={setPw2} autoComplete="new-password" />
          {msg && !msg.ok && (
            <ThemedText type="small" themeColor="danger">
              {msg.text}
            </ThemedText>
          )}
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <BrutalButton
              label="cancel"
              variant="neutral"
              style={{ flex: 1 }}
              onPress={() => {
                setOpen(false);
                setMsg(null);
                setPw('');
                setPw2('');
              }}
            />
            <BrutalButton label="save" style={{ flex: 1 }} loading={busy} disabled={!pw || !pw2} onPress={save} />
          </View>
        </>
      )}
    </Section>
  );
}

function AdminCodes() {
  const theme = useTheme();
  const [codes, setCodes] = useState<{ code: string; role_granted: string }[]>([]);
  const [rotating, setRotating] = useState<Role | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('access_codes').select('code, role_granted').eq('is_active', true);
    setCodes(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rotate(role: Role) {
    setRotating(role);
    const next = role === 'admin' ? randomCode('MTP-ADMIN-', 6) : randomCode('JOIN', 5);
    await supabase.rpc('rotate_access_code', { p_role: role, p_new_code: next });
    await load();
    setRotating(null);
  }

  return (
    <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        invite codes
      </ThemedText>
      {(['creator', 'admin'] as Role[]).map((role) => {
        const code = codes.find((c) => c.role_granted === role)?.code ?? '—';
        return (
          <View key={role} style={styles.codeRow}>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {role}
              </ThemedText>
              <ThemedText style={[styles.codeValue, { color: theme.primary }]}>{code}</ThemedText>
            </View>
            <BrutalButton
              label={rotating === role ? '…' : 'rotate'}
              variant="neutral"
              loading={rotating === role}
              onPress={() => rotate(role)}
              style={styles.rotateBtn}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: Border.width,
  },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  profileCard: {},
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatarWrap: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { padding: 2, borderRadius: 46, borderWidth: 2.5 },
  badgeOverlay: { position: 'absolute', bottom: -4, right: -4, width: 34, height: 34 },
  camChip: { position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, gap: 3 },
  profileName: { fontSize: 20, fontWeight: '900' },
  pencil: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  section: { gap: Spacing.two },
  connectedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.three, height: 36, borderRadius: Radius.sm, borderWidth: Border.width },
  linkBtnText: { fontSize: 13, fontWeight: '800' },
  connectedList: { gap: Spacing.two, marginTop: Spacing.one },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  accPic: { width: 42, height: 42, borderRadius: 21 },
  accTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  accName: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  accFollowers: { alignItems: 'flex-end' },
  accFollowersNum: { fontSize: 16, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  linkSheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderWidth: Border.widthThick, borderBottomWidth: 0, padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  linkSheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkSheetTitle: { fontSize: 20, fontWeight: '900' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: Spacing.one },
  addRowText: { fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800' },
  value: { fontSize: 16, fontWeight: '500' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  codeValue: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  rotateBtn: { minHeight: 42, paddingHorizontal: Spacing.three },
});
