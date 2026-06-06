import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useProgress } from '@/lib/use-progress';

/**
 * XP progress bar that animates up to the current value — and when XP has grown
 * since the creator last looked, fills from where it was and flashes a "+N XP"
 * so the gain is felt, not just shown.
 */
export function XpBar({ height = 14, color }: { height?: number; color?: string }) {
  const theme = useTheme();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { xp, levelNum, current, next, pct, xpToNext, loading } = useProgress();
  const fill = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [delta, setDelta] = useState(0);
  const barColor = color ?? current?.color ?? theme.primary;

  useEffect(() => {
    if (!uid || loading) return;
    const key = `xp.lastSeen.${uid}`;
    let active = true;
    (async () => {
      const raw = await AsyncStorage.getItem(key);
      let startPct = pct;
      let gained = 0;
      if (raw) {
        try {
          const prev = JSON.parse(raw) as { xp: number; pct: number; level: number };
          gained = Math.max(0, xp - (prev.xp ?? xp));
          // same level → grow from old fill; leveled up → sweep from empty.
          startPct = prev.level === levelNum ? prev.pct ?? pct : 0;
        } catch {
          // ignore malformed cache
        }
      }
      if (!active) return;
      fill.setValue(startPct);
      Animated.timing(fill, { toValue: pct, duration: gained > 0 ? 1100 : 400, useNativeDriver: false }).start();
      if (gained > 0) {
        setDelta(gained);
        Animated.sequence([
          Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }),
          Animated.delay(2600),
          Animated.timing(pop, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start(() => active && setDelta(0));
      }
      AsyncStorage.setItem(key, JSON.stringify({ xp, pct, level: levelNum }));
    })();
    return () => {
      active = false;
    };
    // re-run whenever the live XP value changes
  }, [uid, xp, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {xp.toLocaleString()} XP
        </ThemedText>
        {delta > 0 && (
          <Animated.View
            style={[
              styles.pop,
              { backgroundColor: barColor, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
            ]}>
            <ThemedText style={styles.popText}>+{delta.toLocaleString()} XP</ThemedText>
          </Animated.View>
        )}
        <ThemedText type="smallBold" themeColor="textSecondary">
          {next ? `${xpToNext.toLocaleString()} to Lv ${levelNum + 1}` : 'MAX'}
        </ThemedText>
      </View>
      <View style={[styles.track, { height, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Animated.View style={[styles.fill, { width, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { borderRadius: Radius.full, borderWidth: Border.width, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
  pop: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  popText: { color: '#fff', fontSize: 12, fontWeight: '900' },
});
