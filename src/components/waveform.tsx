import { View } from 'react-native';

/** Deterministic bar heights (0..1) seeded from a string, so each voice note
 *  always shows the same waveform without decoding the audio. */
export function barsFromSeed(seed: string, n = 30): number[] {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (1103515245 * x + 12345) & 0x7fffffff;
    out.push(0.22 + ((x % 1000) / 1000) * 0.78);
  }
  return out;
}

export function Waveform({
  heights,
  progress = 1,
  activeColor,
  inactiveColor,
  height = 26,
  barWidth = 3,
  gap = 2,
}: {
  heights: number[];
  progress?: number;
  activeColor: string;
  inactiveColor: string;
  height?: number;
  barWidth?: number;
  gap?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap, height }}>
      {heights.map((h, i) => {
        const active = heights.length > 0 && i / heights.length < progress;
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: Math.max(3, Math.round(h * height)),
              borderRadius: barWidth / 2,
              backgroundColor: active ? activeColor : inactiveColor,
            }}
          />
        );
      })}
    </View>
  );
}
