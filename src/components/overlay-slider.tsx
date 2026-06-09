import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type OverlayItem } from '@/lib/viewtrack';

/** "00:38" → 38 */
function secsOf(ts?: string): number | null {
  const m = ts?.match(/^(\d+):(\d+)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Frames live at overlay-frames/<videoId>/<seconds>.jpg (uploaded by scripts/overlay-frames.sh). */
function frameUri(o: OverlayItem, videoId?: string): string | undefined {
  if (o.frameUrl) return o.frameUrl;
  const s = secsOf(o.timestamp);
  if (videoId && s != null) return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/overlay-frames/${videoId}/${s}.jpg`;
  return undefined;
}

/** Horizontal slider of overlay moments: the exact frame + timestamp + the overlay text. */
export function OverlaySlider({ overlays, videoId }: { overlays: OverlayItem[]; videoId?: string }) {
  if (!overlays.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {overlays.map((o, i) => (
        <OverlayCard key={i} overlay={o} uri={frameUri(o, videoId)} />
      ))}
    </ScrollView>
  );
}

function OverlayCard({ overlay: o, uri }: { overlay: OverlayItem; uri?: string }) {
  const theme = useTheme();
  // derived frame URLs are a guess — fall back to a plain card when missing
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View>
        {showImage ? (
          <Image source={{ uri }} style={styles.frame} contentFit="cover" onError={() => setFailed(true)} />
        ) : (
          <View style={[styles.frame, styles.frameEmpty, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={{ fontSize: 22 }}>🎞️</ThemedText>
          </View>
        )}
        {!!o.timestamp && (
          <View style={styles.stamp}>
            <ThemedText style={styles.stampText}>
              {o.timestamp}
              {o.endTimestamp ? `–${o.endTimestamp}` : ''}
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.caption}>
        {!!o.type && (
          <ThemedText type="small" style={[styles.type, { color: theme.primary }]}>
            {o.type.toUpperCase()}
          </ThemedText>
        )}
        <ThemedText type="small" style={styles.captionText} numberOfLines={4}>
          {o.text || o.description}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two, paddingVertical: 2 },
  card: { width: 168, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  frame: { width: '100%', height: 280 },
  frameEmpty: { alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  stampText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  caption: { padding: Spacing.one + 2, gap: 2 },
  type: { fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },
  captionText: { lineHeight: 16 },
});
