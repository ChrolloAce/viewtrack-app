import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalButton, BrutalCard, BrutalInput } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  deleteLink,
  detectPlatform,
  myLinks,
  reconcileLinks,
  submitLink,
  vtMe,
  type AccountLink,
  type VtAccount,
} from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function MyAccounts() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [accounts, setAccounts] = useState<VtAccount[]>([]);
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // flips this creator's 'processing' links to linked once ViewTrack syncs
    await reconcileLinks().catch(() => 0);
    const [me, ls] = await Promise.all([vtMe(), uid ? myLinks(uid) : Promise.resolve([])]);
    setAccounts(me.accounts);
    setLinks(ls);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = links.filter((l) => l.status === 'pending' || l.status === 'processing');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/stats'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>my accounts</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Link a new account */}
          <LinkForm onDone={load} />

          {/* Connected */}
          <ThemedText style={styles.sectionTitle}>connected</ThemedText>
          {loading ? (
            <View style={{ gap: Spacing.two }}>
              <Skeleton height={66} radius={Radius.lg} />
              <Skeleton height={66} radius={Radius.lg} />
            </View>
          ) : accounts.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No accounts connected yet.
            </ThemedText>
          ) : (
            <View style={{ gap: Spacing.two }}>
              {accounts.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </View>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <>
              <ThemedText style={styles.sectionTitle}>pending review</ThemedText>
              <View style={{ gap: Spacing.two }}>
                {pending.map((l) => (
                  <BrutalCard key={l.id} style={styles.pendingRow} shadow={3}>
                    <Ionicons name={PLATFORM_ICON[l.platform] as never} size={20} color={theme.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.accName} numberOfLines={1}>
                        @{l.username}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {l.platform} · {l.status === 'processing' ? 'approved — syncing your account ⏳' : 'awaiting admin approval'}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={async () => {
                        await deleteLink(l.id);
                        load();
                      }}
                      hitSlop={10}
                      style={({ pressed }) => [styles.cancelBtn, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}>
                      <Ionicons name="close" size={16} color={theme.text} />
                      <ThemedText style={styles.cancelText}>cancel</ThemedText>
                    </Pressable>
                  </BrutalCard>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function LinkForm({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const platform = detectPlatform(url);

  async function go() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await submitLink(url.trim());
    setBusy(false);
    if (r.status === 'linked') setMsg('✓ linked! it’ll show in your stats.');
    else if (r.status === 'pending') setMsg('sent for admin review ⏳');
    else setMsg(r.error ?? 'could not link that link');
    if (r.status === 'linked' || r.status === 'pending') setUrl('');
    onDone();
  }

  return (
    <BrutalCard style={styles.linkForm}>
      <View style={styles.linkFormHead}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          link a new account
        </ThemedText>
        {platform && (
          <View style={[styles.detected, { borderColor: theme.border }]}>
            <Ionicons name={PLATFORM_ICON[platform] as never} size={13} color={theme.text} />
            <ThemedText style={styles.detectedText}>{platform}</ThemedText>
          </View>
        )}
      </View>
      <BrutalInput
        placeholder="tiktok.com/@you · instagram.com/you · youtube.com/@you"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <BrutalButton label="link account" onPress={go} loading={busy} disabled={!url.trim()} />
      {!!msg && (
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          {msg}
        </ThemedText>
      )}
    </BrutalCard>
  );
}

function AccountRow({ account }: { account: VtAccount }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.accountRow} shadow={3}>
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
    </BrutalCard>
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
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: Spacing.one },
  linkForm: { gap: Spacing.two },
  linkFormHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detected: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1.5 },
  detectedText: { fontSize: 11, fontWeight: '800' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  accPic: { width: 46, height: 46, borderRadius: 23 },
  accTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  accName: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  accFollowers: { alignItems: 'flex-end' },
  accFollowersNum: { fontSize: 17, fontWeight: '900' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.two, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5 },
  cancelText: { fontSize: 12, fontWeight: '800' },
});
