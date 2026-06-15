import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DropdownOption<T extends string> = { value: T; label: string; icon?: string; image?: string };

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
        {current?.image ? (
          <Image source={{ uri: current.image }} style={styles.optImage} contentFit="cover" />
        ) : (
          current?.icon && <Ionicons name={current.icon as never} size={15} color={theme.primary} />
        )}
        <ThemedText style={[styles.triggerText, { color: theme.text }]} numberOfLines={1}>
          {current?.label}
        </ThemedText>
        <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {(() => {
            // keep the menu on-screen: cap its height to the space below the
            // trigger and never let it run off the bottom edge.
            const screenH = Dimensions.get('window').height;
            const below = screenH - (anchor.y + anchor.h) - 16;
            const maxH = Math.max(180, Math.min(360, below));
            return (
              <View
                style={[
                  styles.menu,
                  { backgroundColor: theme.card, borderColor: theme.border, top: anchor.y + anchor.h + 6, left: anchor.x, minWidth: Math.max(minWidth, anchor.w), maxHeight: maxH },
                  brutalShadow(theme.shadow, 4),
                ]}>
                <ScrollView showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
                        {o.image ? (
                          <Image source={{ uri: o.image }} style={styles.optImage} contentFit="cover" />
                        ) : (
                          o.icon && <Ionicons name={o.icon as never} size={15} color={on ? theme.primary : theme.textSecondary} />
                        )}
                        <ThemedText style={[styles.itemText, { color: on ? theme.primary : theme.text }]} numberOfLines={1}>
                          {o.label}
                        </ThemedText>
                        {on && <Ionicons name="checkmark" size={16} color={theme.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}
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
  optImage: { width: 20, height: 20, borderRadius: 5 },
});
