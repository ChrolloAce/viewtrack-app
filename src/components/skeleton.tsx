import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue, StyleSheet, type ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Shimmering placeholder block shown while data loads. */
export function Skeleton({
  width = '100%',
  height,
  radius = Radius.sm,
  style,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const theme = useTheme();
  const o = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.backgroundElement, opacity: o }, style as ViewStyle]}
    />
  );
}

export const skeletonStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
});
