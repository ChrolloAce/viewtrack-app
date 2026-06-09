import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const sb = supabase as unknown as { from: (t: string) => any };

type Mini = { id: string; full_name: string | null; avatar_url: string | null } | null;
type Report = {
  id: string;
  reason: string | null;
  excerpt: string | null;
  status: string;
  created_at: string;
  reporter: Mini;
  reported: Mini;
};

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ReportsAdmin() {
  const theme = useTheme();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = useCallback(async () => {
    const { data } = await sb
      .from('reports')
      .select(
        'id, reason, excerpt, status, created_at, reporter:profiles!reports_reporter_id_fkey(id, full_name, avatar_url), reported:profiles!reports_reported_id_fkey(id, full_name, avatar_url)',
      )
      .order('created_at', { ascending: false });
    setReports((data as Report[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('reports-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function setStatus(id: string, status: string) {
    await sb.from('reports').update({ status }).eq('id', id);
    load();
  }
  async function removeAccess(r: Report) {
    if (!r.reported) return;
    if (Platform.OS === 'web' && !window.confirm(`Remove ${r.reported.full_name || 'this user'}'s access? They'll be signed out.`)) return;
    await sb.from('profiles').update({ disabled: true }).eq('id', r.reported.id);
    await setStatus(r.id, 'actioned');
  }

  const shown = reports.filter((r) => (filter === 'open' ? r.status === 'open' : true));
  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <ThemedText style={styles.title}>Reports</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {openCount} open · review what creators have flagged
        </ThemedText>
      </View>

      <View style={styles.tabs}>
        {(['open', 'all'] as const).map((f) => {
          const on = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={[styles.tab, { borderColor: theme.border }, on && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
              <ThemedText style={[styles.tabText, { color: on ? theme.primaryText : theme.textSecondary }]}>{f === 'open' ? `Open (${openCount})` : 'All'}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ gap: Spacing.two }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={120} radius={Radius.lg} />
          ))}
        </View>
      ) : shown.length === 0 ? (
        <BrutalCard style={styles.empty}>
          <Ionicons name="shield-checkmark-outline" size={30} color={theme.success} />
          <ThemedText type="small" themeColor="textSecondary">
            {filter === 'open' ? 'No open reports — all clear.' : 'No reports yet.'}
          </ThemedText>
        </BrutalCard>
      ) : (
        <View style={{ gap: Spacing.three }}>
          {shown.map((r) => (
            <BrutalCard key={r.id} style={[styles.card, { borderColor: r.status === 'open' ? theme.danger : theme.border }]}>
              <View style={styles.cardTop}>
                <View style={styles.who}>
                  <BrutalAvatar name={r.reported?.full_name} uri={r.reported?.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.reportedName} numberOfLines={1}>
                      {r.reported?.full_name || 'Unknown user'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      reported by {r.reporter?.full_name || 'someone'} · {ago(r.created_at)}
                    </ThemedText>
                  </View>
                </View>
                <View style={[styles.statusPill, { backgroundColor: r.status === 'open' ? theme.danger : r.status === 'actioned' ? theme.text : theme.backgroundElement }]}>
                  <ThemedText style={[styles.statusText, { color: r.status === 'open' || r.status === 'actioned' ? '#fff' : theme.textSecondary }]}>{r.status.toUpperCase()}</ThemedText>
                </View>
              </View>

              {!!r.excerpt && (
                <View style={[styles.quote, { backgroundColor: theme.backgroundElement, borderLeftColor: theme.danger }]}>
                  <ThemedText type="small" style={styles.quoteText}>
                    “{r.excerpt}”
                  </ThemedText>
                </View>
              )}
              {!!r.reason && (
                <ThemedText type="small" themeColor="textSecondary">
                  Reason: {r.reason}
                </ThemedText>
              )}

              {r.status === 'open' && (
                <View style={styles.actions}>
                  <Pressable onPress={() => setStatus(r.id, 'dismissed')} style={({ pressed }) => [styles.actBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
                    <ThemedText style={styles.actText}>Dismiss</ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setStatus(r.id, 'reviewed')} style={({ pressed }) => [styles.actBtn, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
                    <ThemedText style={styles.actText}>Mark reviewed</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => removeAccess(r)}
                    style={({ pressed }) => [styles.actBtn, styles.danger, { backgroundColor: theme.danger, borderColor: theme.border }, brutalShadow(theme.shadow, 2), pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] }]}>
                    <Ionicons name="remove-circle" size={15} color="#fff" />
                    <ThemedText style={[styles.actText, { color: '#fff' }]}>Remove access</ThemedText>
                  </Pressable>
                </View>
              )}
            </BrutalCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.three },
  head: { marginBottom: Spacing.one },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.sm, borderWidth: Border.width },
  tabText: { fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  card: { gap: Spacing.two, borderWidth: Border.width },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 },
  reportedName: { fontSize: 16, fontWeight: '800' },
  statusPill: { paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  quote: { borderLeftWidth: 3, borderRadius: Radius.sm, padding: Spacing.two },
  quoteText: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.one },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.three, height: 38, borderRadius: Radius.full, borderWidth: Border.width },
  danger: {},
  actText: { fontSize: 13, fontWeight: '800' },
});
