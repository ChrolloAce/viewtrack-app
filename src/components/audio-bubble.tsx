import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { barsFromSeed, Waveform } from '@/components/waveform';
import { Spacing } from '@/constants/theme';

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Voice-note bubble: play/pause + tappable waveform that fills as it plays. */
export function AudioBubble({ uri, tint, track }: { uri: string; tint: string; track: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status?.playing ?? false;
  const duration = status?.duration ?? 0;
  const position = status?.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const heights = useMemo(() => barsFromSeed(uri, 30), [uri]);
  const [width, setWidth] = useState(0);

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (duration > 0 && position >= duration - 0.15) player.seekTo(0);
    player.play();
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={toggle} hitSlop={8}>
        <Ionicons name={playing ? 'pause' : 'play'} size={26} color={tint} />
      </Pressable>
      <Pressable
        style={styles.wave}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (width > 0 && duration > 0) player.seekTo((e.nativeEvent.locationX / width) * duration);
        }}>
        <Waveform heights={heights} progress={progress} activeColor={tint} inactiveColor={track} />
      </Pressable>
      <ThemedText style={[styles.time, { color: tint }]}>
        {fmt(playing || position > 0 ? position : duration)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 200 },
  wave: { flex: 1, justifyContent: 'center', paddingVertical: 4 },
  time: { fontSize: 12, fontWeight: '600', minWidth: 34, textAlign: 'right' },
});
