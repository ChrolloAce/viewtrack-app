import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/skeleton';
import { Radius, Spacing } from '@/constants/theme';

// A believable chat history: alternating in/out bubbles, varied widths/heights.
const ROWS: { side: 'in' | 'out'; w: number; h: number }[] = [
  { side: 'in', w: 210, h: 46 },
  { side: 'in', w: 140, h: 34 },
  { side: 'out', w: 180, h: 52 },
  { side: 'out', w: 110, h: 34 },
  { side: 'in', w: 240, h: 66 },
  { side: 'in', w: 160, h: 40 },
  { side: 'out', w: 200, h: 48 },
  { side: 'in', w: 130, h: 34 },
  { side: 'out', w: 170, h: 58 },
];

/** World-class loading state for a conversation — shimmering chat bubbles that
 *  match the real layout, so the thread "fills in" instead of flashing a spinner. */
export function ChatSkeleton() {
  return (
    <View style={styles.wrap}>
      {ROWS.map((r, i) => {
        const out = r.side === 'out';
        return (
          <View key={i} style={[styles.row, out ? styles.rowOut : styles.rowIn]}>
            {!out && <Skeleton width={28} height={28} radius={14} style={styles.avatar} />}
            <Skeleton width={r.w} height={r.h} radius={Radius.lg} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one + 2 },
  rowIn: { justifyContent: 'flex-start' },
  rowOut: { justifyContent: 'flex-end' },
  avatar: { alignSelf: 'flex-end' },
});
