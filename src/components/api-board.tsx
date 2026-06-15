import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const sb = supabase as unknown as { from: (t: string) => any };
const API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/public-api`;

type Key = { id: string; name: string; token: string; last_used_at: string | null; created_at: string };

const ENDPOINTS: { method: string; path: string; desc: string }[] = [
  { method: 'GET', path: '/creators', desc: 'your creators with linked accounts, level & xp' },
  { method: 'GET', path: '/competitors', desc: 'competitor apps with latest revenue, downloads & rank' },
  { method: 'GET', path: '/formats', desc: 'viral format library · ?app= ?format= ?platform= ?min_views= ?limit= ?offset=' },
  { method: 'GET', path: '/videos', desc: 'recent tracked creator videos · ?days= ?limit=' },
];

const mask = (t: string) => `${t.slice(0, 11)}…${t.slice(-4)}`;
const randToken = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return 'vt_live_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** Admin: manage public API keys + see the endpoint reference. */
export function ApiBoard() {
  const theme = useTheme();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [justMade, setJustMade] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data } = await sb.from('api_keys').select('*').order('created_at', { ascending: false });
    setKeys((data as Key[]) ?? []);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function createKey() {
    if (!name.trim() || creating) return;
    setCreating(true);
    const token = randToken();
    const { error } = await sb.from('api_keys').insert({ name: name.trim(), token });
    setCreating(false);
    if (!error) {
      setJustMade(token);
      setName('');
      reload();
    }
  }
  async function revoke(id: string) {
    if (Platform.OS === 'web' && !window.confirm('Revoke this key? Apps using it stop working immediately.')) return;
    await sb.from('api_keys').delete().eq('id', id);
    reload();
  }
  function copy(text: string, tag: string) {
    if (Platform.OS === 'web') (navigator as unknown as { clipboard?: { writeText: (s: string) => void } }).clipboard?.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <ThemedText style={styles.title}>API</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        a read-only REST API over your whole platform — creators, competitors, viral formats and videos
      </ThemedText>

      {/* create key */}
      <BrutalCard style={styles.card} shadow={3}>
        <ThemedText style={styles.cardTitle}>API keys</ThemedText>
        <View style={styles.createRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Key name (e.g. Zapier, internal dashboard)"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            onSubmitEditing={createKey}
          />
          <Pressable onPress={createKey} disabled={!name.trim() || creating} style={[styles.createBtn, { backgroundColor: name.trim() ? theme.primary : theme.backgroundElement }]}>
            <ThemedText style={{ color: name.trim() ? theme.primaryText : theme.textSecondary, fontWeight: '900', fontSize: 14 }}>{creating ? '…' : 'Create key'}</ThemedText>
          </Pressable>
        </View>

        {justMade && (
          <View style={[styles.newKey, { borderColor: theme.success, backgroundColor: theme.primaryMuted }]}>
            <Ionicons name="checkmark-circle" size={16} color={theme.success} />
            <ThemedText type="small" style={{ flex: 1, fontWeight: '700' }}>
              Copy it now — full key is shown only once.
            </ThemedText>
            <Pressable onPress={() => copy(justMade, 'new')} style={[styles.copyChip, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <ThemedText style={styles.codeText}>{justMade}</ThemedText>
              <Ionicons name={copied === 'new' ? 'checkmark' : 'copy-outline'} size={13} color={theme.text} />
            </Pressable>
          </View>
        )}

        {keys.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.two }}>
            No keys yet — create one above.
          </ThemedText>
        ) : (
          keys.map((k) => (
            <View key={k.id} style={[styles.keyRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '800' }}>{k.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {mask(k.token)} · {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : 'never used'}
                </ThemedText>
              </View>
              <Pressable onPress={() => copy(k.token, k.id)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name={copied === k.id ? 'checkmark' : 'copy-outline'} size={17} color={theme.text} />
              </Pressable>
              <Pressable onPress={() => revoke(k.id)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={16} color={theme.danger} />
              </Pressable>
            </View>
          ))
        )}
      </BrutalCard>

      {/* reference */}
      <BrutalCard style={styles.card} shadow={3}>
        <ThemedText style={styles.cardTitle}>Endpoints</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Base URL · authenticate with your key in the <ThemedText type="smallBold">x-api-key</ThemedText> header.
        </ThemedText>
        <Pressable onPress={() => copy(API_BASE, 'base')} style={[styles.baseRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <ThemedText style={styles.codeText}>{API_BASE}</ThemedText>
          <Ionicons name={copied === 'base' ? 'checkmark' : 'copy-outline'} size={14} color={theme.textSecondary} />
        </Pressable>
        {ENDPOINTS.map((e) => (
          <View key={e.path} style={[styles.epRow, { borderTopColor: theme.border }]}>
            <View style={[styles.method, { backgroundColor: theme.success }]}>
              <ThemedText style={styles.methodText}>{e.method}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.epPath}>{e.path}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {e.desc}
              </ThemedText>
            </View>
          </View>
        ))}
        <View style={[styles.curlBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 4, fontWeight: '700' }}>
            example
          </ThemedText>
          <ThemedText style={styles.codeText}>{`curl ${API_BASE}/formats?limit=10 \\\n  -H "x-api-key: YOUR_KEY"`}</ThemedText>
        </View>
      </BrutalCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, gap: Spacing.three, paddingBottom: Spacing.six, maxWidth: 820, width: '100%' },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  card: { gap: Spacing.two },
  cardTitle: { fontSize: 18, fontWeight: '900' },
  createRow: { flexDirection: 'row', gap: Spacing.two },
  input: { flex: 1, height: 44, borderRadius: Radius.md, borderWidth: Border.width, paddingHorizontal: Spacing.three, fontSize: 14, fontWeight: '600' },
  createBtn: { paddingHorizontal: Spacing.three, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  newKey: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width, flexWrap: 'wrap' },
  copyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.two, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: Border.width },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, marginTop: Spacing.one },
  iconBtn: { padding: 6 },
  codeText: { fontSize: 12.5, fontWeight: '700', fontFamily: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, monospace', default: undefined }) },
  baseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, padding: Spacing.two + 2, borderRadius: Radius.sm, borderWidth: Border.width },
  epRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  method: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.sm },
  methodText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  epPath: { fontSize: 14, fontWeight: '800', fontFamily: Platform.select({ web: 'ui-monospace, SFMono-Regular, Menlo, monospace', default: undefined }) },
  curlBox: { padding: Spacing.three, borderRadius: Radius.md, borderWidth: Border.width, marginTop: Spacing.one },
});
