import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DropdownOption<T extends string> = { value: T; label: string; icon?: string };

/** A compact, anchored dropdown — trigger shows the current choice; the menu
 *  opens directly beneath it. Works on web + native via measureInWindow. */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  minWidth = 150,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  minWidth?: number;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const ref = useRef<View>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  return (
    <>
      <Pressable
        ref={ref}
        onPress={openMenu}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: theme.card, borderColor: theme.border },
          brutalShadow(theme.shadow, 3),
          pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
        ]}>
        {current?.icon && <Ionicons name={current.icon as never} size={15} color={theme.primary} />}
        <ThemedText style={[styles.triggerText, { color: theme.text }]} numberOfLines={1}>
          {current?.label}
        </ThemedText>
        <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              { backgroundColor: theme.card, borderColor: theme.border, top: anchor.y + anchor.h + 6, left: anchor.x, minWidth: Math.max(minWidth, anchor.w) },
              brutalShadow(theme.shadow, 4),
            ]}>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.item, on && { backgroundColor: theme.primaryMuted }, pressed && { backgroundColor: theme.backgroundElement }]}>
                  {o.icon && <Ionicons name={o.icon as never} size={15} color={on ? theme.primary : theme.textSecondary} />}
                  <ThemedText style={[styles.itemText, { color: on ? theme.primary : theme.text }]} numberOfLines={1}>
                    {o.label}
                  </ThemedText>
                  {on && <Ionicons name="checkmark" size={16} color={theme.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: Border.width,
  },
  triggerText: { flex: 1, fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1 },
  menu: { position: 'absolute', borderRadius: Radius.md, borderWidth: Border.width, paddingVertical: 5, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  itemText: { flex: 1, fontSize: 14, fontWeight: '700' },
});
