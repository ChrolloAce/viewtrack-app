import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { assignLabel, createLabel, deleteLabel, LABEL_COLORS, unassignLabel, useLabels, useProfileLabels } from '@/lib/labels';

/** Label/group pill for a creator — click to assign/unassign labels, create
 *  new ones, or delete a label everywhere. Same labels as the chat. */
export function CreatorLabelPill({ profileId }: { profileId: string }) {
  const theme = useTheme();
  const { labels } = useLabels();
  const { map: profileLabels } = useProfileLabels();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const ref = useRef<View>(null);
  const ids = profileLabels[profileId] ?? [];
  const mine = labels.filter((l) => ids.includes(l.id));
  const first = mine[0];

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  async function newLabel() {
    if (Platform.OS !== 'web') return;
    const name = window.prompt('New group / label name:');
    if (!name?.trim()) return;
    const color = LABEL_COLORS[labels.length % LABEL_COLORS.length];
    const lbl = await createLabel(name.trim(), color);
    if (lbl) await assignLabel(profileId, lbl.id);
  }

  return (
    <>
      <Pressable
        ref={ref}
        onPress={openMenu}
        style={({ pressed }) => [styles.pill, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
        {first ? <View style={[styles.dot, { backgroundColor: first.color }]} /> : <Ionicons name="pricetag-outline" size={13} color={theme.textSecondary} />}
        <ThemedText type="smallBold" style={{ color: first ? theme.text : theme.textSecondary, maxWidth: 140 }} numberOfLines={1}>
          {first ? (mine.length > 1 ? `${first.name} +${mine.length - 1}` : first.name) : 'group'}
        </ThemedText>
        <Ionicons name="chevron-down" size={13} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { backgroundColor: theme.card, borderColor: theme.border, top: anchor.y + anchor.h + 6, left: Math.max(8, anchor.x + anchor.w - 230) }]}>
            {labels.map((l) => {
              const on = ids.includes(l.id);
              return (
                <Pressable
                  key={l.id}
                  onPress={async () => (on ? unassignLabel(profileId, l.id) : assignLabel(profileId, l.id))}
                  style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
                  <View style={[styles.dot, { backgroundColor: l.color }]} />
                  <ThemedText style={styles.itemText} numberOfLines={1}>
                    {l.name}
                  </ThemedText>
                  {on && <Ionicons name="checkmark" size={16} color={theme.primary} />}
                  <Pressable
                    onPress={(e) => {
                      (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
                      if (Platform.OS !== 'web' || window.confirm(`Delete the group “${l.name}” everywhere?`)) deleteLabel(l.id);
                    }}
                    hitSlop={6}>
                    <Ionicons name="trash-outline" size={15} color={theme.textSecondary} />
                  </Pressable>
                </Pressable>
              );
            })}
            {labels.length > 0 && <View style={[styles.divider, { backgroundColor: 'rgba(0,0,0,0.08)' }]} />}
            <Pressable onPress={newLabel} style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="add" size={15} color={theme.textSecondary} />
              <ThemedText style={[styles.itemText, { color: theme.textSecondary }]}>new group…</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1.5 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  menu: { position: 'absolute', width: 230, borderRadius: Radius.md, borderWidth: Border.width, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  item: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 9 },
  itemText: { flex: 1, fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 4 },
});
