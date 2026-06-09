import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import * as Haptics from '@/lib/haptics';
import { onEarnings, type EarningsPayload } from '@/lib/earnings-bus';

const GREEN = '#22C55E';

/** Mounted once at the app root; shows the money celebration for new bonuses. */
export function EarningsHost() {
  const [payload, setPayload] = useState<EarningsPayload | null>(null);
  useEffect(() => onEarnings(setPayload), []);
  if (!payload) return null;
  return <EarningsOverlay key={`${payload.total}-${payload.earned}`} payload={payload} onClose={() => setPayload(null)} />;
}

// coins that rain/burst outward
const COINS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return { x: Math.cos(a) * (150 + (i % 4) * 30), y: Math.sin(a) * (150 + (i % 4) * 30), d: 10 + (i % 3) * 6, delay: (i % 5) * 0.04 };
});

export function EarningsOverlay({ payload, onClose }: { payload: EarningsPayload; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { earned, newBonuses } = payload;

  const bg = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const slotScale = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const textO = useRef(new Animated.Value(0)).current;
  const btnO = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const edgeIn = useRef(new Animated.Value(0)).current;

  const [shown, setShown] = useState(0);
  const [ready, setReady] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = count.addListener(({ value }) => setShown(Math.round(value)));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    Animated.timing(bg, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    Animated.timing(edgeIn, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();

    // punch the slot in, then roll the number up like a slot machine
    Animated.spring(slotScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    Animated.timing(textO, { toValue: 1, duration: 400, delay: 120, useNativeDriver: true }).start();

    at(260, () => {
      Animated.timing(burst, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      Animated.timing(count, { toValue: earned, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
        Haptics.success();
        setReady(true);
        Animated.timing(btnO, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
      // rapid ticks while the number rolls — slot-machine rattle
      Haptics.impact('light');
      [120, 260, 420, 600, 800, 1020, 1260, 1500].forEach((d, i) => at(d, () => Haptics.impact(i > 5 ? 'medium' : 'light')));
    });

    return () => {
      count.removeListener(id);
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    Haptics.selection();
    onCloseRef.current();
  };

  const edgeGlowO = Animated.multiply(edgeIn, breathe.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: bg }]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.frame, { borderColor: GREEN, opacity: edgeGlowO, boxShadow: `inset 0 0 12px 0px ${GREEN}, inset 0 0 42px 6px ${GREEN}` }]}
      />

      <View style={styles.center} pointerEvents="box-none">
        {/* bursting coins */}
        {COINS.map((c, i) => (
          <Animated.View
            key={i}
            style={[
              styles.coin,
              {
                width: c.d,
                height: c.d,
                borderRadius: c.d / 2,
                opacity: burst.interpolate({ inputRange: [c.delay, c.delay + 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.x] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.y] }) },
                  { scale: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.7] }) },
                ],
              },
            ]}>
            <ThemedText style={{ fontSize: c.d * 0.8 }}>💰</ThemedText>
          </Animated.View>
        ))}

        <ThemedText style={styles.kicker}>✦ BONUS UNLOCKED ✦</ThemedText>

        {/* the slot-style amount */}
        <Animated.View style={[styles.slot, { borderColor: GREEN }, brutalShadow(GREEN, 6), { transform: [{ scale: slotScale }] }]}>
          <ThemedText style={styles.amount}>${shown.toLocaleString()}</ThemedText>
        </Animated.View>

        <Animated.View style={[styles.textBlock, { opacity: textO }]}>
          <ThemedText style={styles.congrats}>You just earned</ThemedText>
          <View style={[styles.bonusPill, { borderColor: GREEN }]}>
            <Ionicons name="trophy" size={15} color={GREEN} />
            <ThemedText style={[styles.bonusText, { color: GREEN }]}>
              {newBonuses} new bonus{newBonuses === 1 ? '' : 'es'} hit · $100 each
            </ThemedText>
          </View>
        </Animated.View>
      </View>

      <Animated.View
        style={[styles.btnWrap, { opacity: btnO, paddingBottom: insets.bottom + Spacing.three }]}
        pointerEvents={ready ? 'auto' : 'none'}>
        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [
            styles.continue,
            { backgroundColor: GREEN, borderColor: '#0B3D1E' },
            brutalShadow('#0B3D1E', 5),
            pressed && { transform: [{ translateX: 5 }, { translateY: 5 }], boxShadow: '0px 0px 0px #0B3D1E' },
          ]}>
          <ThemedText style={styles.continueText}>COLLECT</ThemedText>
          <Ionicons name="cash" size={22} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#04140A', zIndex: 50 },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 56, borderWidth: 1.5, zIndex: 51 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 52, paddingHorizontal: Spacing.four },
  coin: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 17, fontWeight: '900', letterSpacing: 4, color: GREEN, marginBottom: Spacing.three },
  slot: {
    backgroundColor: '#0A1F12',
    borderWidth: Border.widthThick,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    minWidth: 220,
    alignItems: 'center',
  },
  amount: { fontSize: 56, lineHeight: 64, fontWeight: '900', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  textBlock: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four },
  congrats: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  bonusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2, borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  bonusText: { fontSize: 14, fontWeight: '900' },
  btnWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.four, zIndex: 53 },
  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 60,
    borderRadius: Radius.md,
    borderWidth: Border.widthThick,
  },
  continueText: { fontSize: 17, fontWeight: '900', letterSpacing: 2, color: '#FFFFFF' },
});
