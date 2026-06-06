import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalButton, BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { decideLink, pendingLinks, type AccountLink } from '@/lib/viewtrack';

export default function RequestsTab() {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  return <RequestsAdmin bottomInset={BottomTabInset} />;
}

export function RequestsAdmin({ bottomInset = 0 }: { bottomInset?: number }) {
  const theme = useTheme();
  const { isAdmin } = useAuth();
  const [reqs, setReqs] = useState<AccountLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReqs(await pendingLinks());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, approve: boolean) {
    setBusyId(id);
    setNote(null);
    const r = await decideLink(id, approve);
    setBusyId(null);
    if (r.status === 'not_found') setNote(r.error ?? 'Account not in ViewTrack yet.');
    await load();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>requests</ThemedText>
          {reqs.length > 0 && (
            <View style={[styles.countPill, { backgroundColor: theme.danger }]}>
              <ThemedText style={styles.countText}>{reqs.length}</ThemedText>
            </View>
          )}
        </View>

        {!isAdmin ? (
          <View style={styles.center}>
            <ThemedText type="small" themeColor="textSecondary">
              Admins only.
            </ThemedText>
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing.three }]}>
            {note && (
              <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
                {note}
              </ThemedText>
            )}
            {reqs.length === 0 ? (
              <View style={styles.center}>
                <Ionicons name="checkmark-done-outline" size={36} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  No pending requests.
                </ThemedText>
              </View>
            ) : (
              reqs.map((r) => (
                <BrutalCard key={r.id} style={styles.card}>
                  <View style={styles.idRow}>
                    <BrutalAvatar name={r.profile?.full_name} uri={r.profile?.avatar_url ?? null} size={40} />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.name} numberOfLines={1}>
                        {r.profile?.full_name || 'Creator'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        wants to link {r.platform} · @{r.username}
                      </ThemedText>
                    </View>
                  </View>
                  {!!r.url && (
                    <Pressable onPress={() => r.url && Linking.openURL(r.url)}>
                      <ThemedText type="small" style={{ color: theme.primary }} numberOfLines={1}>
                        {r.url}
                      </ThemedText>
                    </Pressable>
                  )}
                  <View style={styles.actions}>
                    <BrutalButton label="approve" onPress={() => decide(r.id, true)} loading={busyId === r.id} style={{ flex: 1 }} />
                    <BrutalButton label="reject" variant="danger" onPress={() => decide(r.id, false)} disabled={busyId === r.id} style={{ flex: 1 }} />
                  </View>
                </BrutalCard>
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  headerTitle: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  countPill: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { gap: Spacing.two },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontSize: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
