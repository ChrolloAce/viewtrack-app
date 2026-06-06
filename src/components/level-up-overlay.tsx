import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { badgeFor } from '@/lib/badges';
import * as Haptics from '@/lib/haptics';
import { onLevelUp, type LevelBadge, type LevelUpPayload } from '@/lib/level-up-bus';

/** Mounted once at the app root; shows the celebration for any level-up. */
export function LevelUpHost() {
  const [payload, setPayload] = useState<LevelUpPayload | null>(null);
  useEffect(() => onLevelUp(setPayload), []);
  if (!payload) return null;
  return <LevelUpOverlay key={`${payload.level}-${payload.title}`} payload={payload} onClose={() => setPayload(null)} />;
}

const BADGE = 240;
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  return { x: Math.cos(a) * 190, y: Math.sin(a) * 190, d: 5 + (i % 3) * 3 };
});
export function LevelUpOverlay({ payload, onClose }: { payload: LevelUpPayload; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { from } = payload;
  const next: LevelBadge = payload;
  const nextColor = badgeFor(next.level).color;
  const prevColor = from ? badgeFor(from.level).color : nextColor;

  // --- animated values ---------------------------------------------------
  const bg = useRef(new Animated.Value(0)).current;
  const oldS = useRef(new Animated.Value(from ? 0 : 1)).current;
  const oldO = useRef(new Animated.Value(from ? 0 : 1)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const newS = useRef(new Animated.Value(0)).current;
  const newO = useRef(new Animated.Value(0)).current;
  const newRot = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const textO = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(20)).current;
  const btnO = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current; // shockwave + particles
  // Apple-style edge glow: a soft light framing all four screen edges.
  const edgeIn = useRef(new Animated.Value(0)).current; // edges light up on mount
  const breathe = useRef(new Animated.Value(0)).current; // gentle pulsing
  const flash = useRef(new Animated.Value(0)).current; // bright flare on the explosion

  const [ready, setReady] = useState(false);
  // glow opens in the previous level's color, then switches to the new level's
  // color at the reveal (the explosion flash masks the swap).
  const glow = ready ? nextColor : prevColor;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = () => {
    Haptics.selection();
    onCloseRef.current();
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    Animated.timing(bg, { toValue: 1, duration: 260, useNativeDriver: true }).start();

    // edges light up as the black screen appears, then breathe gently
    Animated.timing(edgeIn, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();

    const shake = Animated.sequence(
      [-1, 1, -0.9, 0.9, -0.7, 0.7, -0.5, 0.5, -0.3, 0.3, 0].map((v) =>
        Animated.timing(shakeX, { toValue: v, duration: 46, useNativeDriver: true }),
      ),
    );

    const reveal = Animated.parallel([
      Animated.spring(newS, { toValue: 1, friction: 4.5, tension: 90, useNativeDriver: true }),
      Animated.timing(newO, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(newRot, { toValue: 1, duration: 560, easing: Easing.out(Easing.back(2.4)), useNativeDriver: true }),
    ]);

    // a heavy, rapid-fire haptic rumble to sell the explosion
    const rumble = () => {
      Haptics.impact('heavy');
      at(35, () => Haptics.impact('heavy'));
      at(75, () => Haptics.impact('rigid'));
      at(120, () => Haptics.impact('medium'));
      at(165, () => Haptics.impact('rigid'));
      at(215, () => Haptics.impact('medium'));
      at(270, () => Haptics.impact('light'));
      at(330, () => Haptics.impact('light'));
      at(400, () => Haptics.success());
      at(480, () => Haptics.impact('light'));
    };

    const fireBurst = () => {
      burst.setValue(0);
      Animated.timing(burst, { toValue: 1, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      // edges flare bright with the explosion, then settle back
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      rumble();
    };

    // Fire the badge punch-in and the explosion together, so the burst is
    // synced to the reveal instead of waiting for the spring to settle.
    const doReveal = () => {
      reveal.start();
      fireBurst();
      Animated.parallel([
        Animated.timing(textO, { toValue: 1, duration: 420, delay: 140, useNativeDriver: true }),
        Animated.spring(textY, { toValue: 0, friction: 6, tension: 80, delay: 140, useNativeDriver: true }),
      ]).start();
      Animated.timing(btnO, { toValue: 1, duration: 400, delay: 420, useNativeDriver: true }).start();
      setReady(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    };

    if (from) {
      Animated.spring(oldS, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
      Animated.timing(oldO, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      at(160, () => Haptics.impact('light'));

      at(540, () => {
        shake.start();
        // rapid ticks tracking each wiggle of the shake
        [0, 60, 120, 180, 240, 300, 360, 420].forEach((d, i) =>
          at(d, () => Haptics.impact(i >= 6 ? 'medium' : 'light')),
        );
      });

      at(1120, () => {
        Animated.parallel([
          Animated.timing(oldS, { toValue: 0, duration: 240, easing: Easing.in(Easing.back(2)), useNativeDriver: true }),
          Animated.timing(oldO, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
        Haptics.impact('heavy');
        at(60, () => Haptics.impact('rigid'));
      });

      at(1380, doReveal);
    } else {
      at(180, doReveal);
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const oldShift = shakeX.interpolate({ inputRange: [-1, 1], outputRange: [-20, 20] });
  const newRotate = newRot.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '0deg'] });
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  // base edge glow: fades in (edgeIn) then breathes between 0.7 and 1
  const edgeGlowO = Animated.multiply(edgeIn, breathe.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }));

  const ringStyle = (delay: number) => ({
    opacity: burst.interpolate({ inputRange: [delay, delay + 0.08, 1], outputRange: [0, 0.55, 0], extrapolate: 'clamp' }),
    transform: [{ scale: burst.interpolate({ inputRange: [delay, 1], outputRange: [0.4, 3.2], extrapolate: 'clamp' }) }],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: bg }]} />

      {/* Apple-style edge glow framing the screen (soft inset light + crisp rim) */}
      <Animated.View
        pointerEvents="none"
        style={[styles.frame, { borderColor: glow, opacity: edgeGlowO, boxShadow: `inset 0 0 12px 0px ${glow}, inset 0 0 42px 6px ${glow}` }]}
      />
      {/* brighter flare that pops with the explosion */}
      <Animated.View
        pointerEvents="none"
        style={[styles.frame, styles.frameFlash, { opacity: flash, boxShadow: `inset 0 0 26px 2px ${glow}, inset 0 0 80px 16px ${glow}` }]}
      />

      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.stage}>
          {/* shockwave rings on reveal */}
          <Animated.View style={[styles.ring, { borderColor: glow }, ringStyle(0)]} />
          <Animated.View style={[styles.ring, { borderColor: glow }, ringStyle(0.12)]} />

          {/* radiating particles */}
          {PARTICLES.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  width: p.d,
                  height: p.d,
                  borderRadius: p.d / 2,
                  backgroundColor: glow,
                  opacity: burst.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) },
                  ],
                },
              ]}
            />
          ))}

          {/* old badge (morphs out) */}
          {from && (
            <Animated.View
              style={[styles.badge, styles.abs, { opacity: oldO, transform: [{ scale: oldS }, { translateX: oldShift }] }]}>
              <Image source={badgeFor(from.level).source} style={styles.img} contentFit="contain" />
            </Animated.View>
          )}

          {/* new badge (punches in) */}
          <Animated.View
            style={[styles.badge, styles.abs, { opacity: newO, transform: [{ scale: newS }, { rotate: newRotate }, { translateY: bobY }] }]}>
            <Image source={badgeFor(next.level).source} style={styles.img} contentFit="contain" />
          </Animated.View>
        </View>

        <Animated.View style={[styles.textBlock, { opacity: textO, transform: [{ translateY: textY }] }]}>
          <ThemedText style={[styles.kicker, { color: glow }]}>
            {payload.jump && payload.jump > 1 ? `✦ LEVELED UP ×${payload.jump} ✦` : '✦ LEVEL UP ✦'}
          </ThemedText>
          <ThemedText style={styles.title}>{next.title}</ThemedText>
          <View style={[styles.levelPill, { borderColor: glow }]}>
            <ThemedText style={[styles.level, { color: glow }]}>
              {from && payload.jump && payload.jump > 1 ? `LEVEL ${from.level} → ${next.level}` : `LEVEL ${next.level}`}
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
            { backgroundColor: '#FFFFFF', borderColor: glow },
            brutalShadow(glow, 5),
            pressed && { transform: [{ translateX: 5 }, { translateY: 5 }], boxShadow: `0px 0px 0px ${glow}` },
          ]}>
          <ThemedText style={styles.continueText}>CONTINUE</ThemedText>
          <Ionicons name="arrow-forward" size={22} color="#111111" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#050505', zIndex: 50 },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 56, borderWidth: 1.5, zIndex: 51 },
  frameFlash: { borderWidth: 0 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 52 },
  stage: { width: BADGE, height: BADGE, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 3 },
  particle: { position: 'absolute' },
  badge: { width: BADGE, height: BADGE, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  img: { width: BADGE, height: BADGE },
  textBlock: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.five },
  kicker: { fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  title: { fontSize: 42, lineHeight: 50, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  levelPill: { marginTop: Spacing.one, borderWidth: 2, borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: 4 },
  level: { fontSize: 14, lineHeight: 19, fontWeight: '900', letterSpacing: 2 },
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
  continueText: { fontSize: 17, fontWeight: '900', letterSpacing: 2, color: '#111111' },
});
