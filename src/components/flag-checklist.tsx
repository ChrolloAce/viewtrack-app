import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteRequirement, evaluateFlags, isFlagged, saveRequirement, useFlagRequirements, type FlagRequirement } from '@/lib/flags';
import { type OverlayItem } from '@/lib/viewtrack';

/**
 * Per-video compliance checklist: every required overlay element with a
 * pass/fail mark, plus a FLAGGED banner when anything is missing.
 * Renders nothing for non-admins (RLS returns no requirements).
 */
export function FlagChecklist({ overlays, onEdit }: { overlays: OverlayItem[] | null; onEdit?: () => void }) {
  const theme = useTheme();
  const { reqs } = useFlagRequirements();
  // null = analysis predates overlay detection — nothing to judge until re-analyzed
  const results = overlays ? evaluateFlags(overlays, reqs) : [];
  if (!results.length) return null;
  const flagged = isFlagged(results);

  return (
    <View style={[styles.card, { borderColor: flagged ? theme.danger : theme.border, backgroundColor: theme.background }]}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <ThemedText style={[styles.label, { color: flagged ? theme.danger : theme.success }]}>
            {flagged ? '🚩 FLAGGED' : 'CHECKLIST ✓'}
          </ThemedText>
          {flagged && (
            <ThemedText type="small" themeColor="textSecondary">
              missing {results.filter((r) => !r.passed).length} of {results.length}
            </ThemedText>
          )}
        </View>
        {onEdit && (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Ionicons name="settings-outline" size={16} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>
      {results.map((r) => (
        <View key={r.req.id} style={styles.row}>
          <Ionicons
            name={r.passed ? 'checkmark-circle' : 'close-circle'}
            size={17}
            color={r.passed ? theme.success : theme.danger}
          />
          <ThemedText style={[styles.rowText, !r.passed && { color: theme.danger, fontWeight: '800' }]}>
            {r.req.label}
          </ThemedText>
          {r.passed && !!r.at && (
            <ThemedText type="small" themeColor="textSecondary">
              {r.at}
            </ThemedText>
          )}
        </View>
      ))}
    </View>
  );
}

type Draft = { id?: string; label: string; keywords: string; active: boolean };
const toDraft = (r: FlagRequirement): Draft => ({ id: r.id, label: r.label, keywords: r.keywords.join(', '), active: r.active });

/** Admin editor for the checklist requirements (label + match keywords + on/off). */
export function ChecklistEditor({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const { reqs, reload } = useFlagRequirements();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDrafts(reqs.map(toDraft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqs.length]);

  const patch = (i: number, p: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function save() {
    setSaving(true);
    for (const [i, d] of drafts.entries()) {
      if (!d.label.trim()) continue;
      await saveRequirement({
        id: d.id,
        label: d.label.trim(),
        keywords: d.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
        active: d.active,
        sort: i + 1,
      });
    }
    await reload();
    setSaving(false);
    onClose();
  }

  async function remove(i: number) {
    const d = drafts[i];
    if (d.id) await deleteRequirement(d.id);
    setDrafts((arr) => arr.filter((_, j) => j !== i));
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.editor, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
          <View style={styles.head}>
            <ThemedText style={styles.editorTitle}>video checklist</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Every analyzed video must contain each of these. A video missing any gets flagged. Keywords are matched against the AI-detected overlays (type, text, description) — comma-separated, any one match passes.
          </ThemedText>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.two }}>
            {drafts.map((d, i) => (
              <View key={d.id ?? `new-${i}`} style={[styles.reqCard, { borderColor: theme.border, backgroundColor: theme.background }, !d.active && { opacity: 0.5 }]}>
                <View style={styles.reqTop}>
                  <TextInput
                    value={d.label}
                    onChangeText={(t) => patch(i, { label: t })}
                    placeholder="Requirement name"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, styles.labelInput, { color: theme.text, borderColor: theme.border }]}
                  />
                  <Pressable onPress={() => patch(i, { active: !d.active })} hitSlop={6}>
                    <Ionicons name={d.active ? 'eye' : 'eye-off'} size={19} color={d.active ? theme.text : theme.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => remove(i)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  </Pressable>
                </View>
                <TextInput
                  value={d.keywords}
                  onChangeText={(t) => patch(i, { keywords: t })}
                  placeholder="keywords, comma, separated"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                />
              </View>
            ))}
            <Pressable
              onPress={() => setDrafts((d) => [...d, { label: '', keywords: '', active: true }])}
              style={[styles.addRow, { borderColor: theme.border }]}>
              <Ionicons name="add" size={17} color={theme.text} />
              <ThemedText style={{ fontWeight: '800', fontSize: 14 }}>add requirement</ThemedText>
            </Pressable>
          </ScrollView>

          <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
            <ThemedText style={{ color: theme.primaryText, fontWeight: '900', fontSize: 15 }}>
              {saving ? 'Saving…' : 'Save checklist'}
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowText: { fontSize: 14, fontWeight: '600', flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  editor: { width: '100%', maxWidth: 520, gap: Spacing.two, borderWidth: Border.widthThick, borderRadius: Radius.lg, padding: Spacing.four },
  editorTitle: { fontSize: 20, lineHeight: 26, fontWeight: '900' },
  reqCard: { gap: 6, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { borderWidth: Border.width, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, fontWeight: '600' },
  labelInput: { flex: 1, fontWeight: '800' },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width, borderStyle: 'dashed' },
  saveBtn: { alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: Radius.md },
});
