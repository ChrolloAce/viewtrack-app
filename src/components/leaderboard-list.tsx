import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLeaderboard } from '@/lib/use-leaderboard';
import type { LeaderboardEntry } from '@/lib/viewtrack';

const MEDAL: Record<number, string> = { 1: '#FFD43B', 2: '#CBD5E1', 3: '#E0995E' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

/** The ranked rows — caller supplies the surrounding scroll container/header. */
export function LeaderboardList() {
  const theme = useTheme();
  const { entries, loading } = useLeaderboard();

  if (loading) {
    return (
      <View style={{ gap: Spacing.two }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={96} radius={Radius.lg} />
        ))}
      </View>
    );
  }
  if (entries.length === 0) {
    return (
      <BrutalCard style={styles.empty}>
        <Ionicons name="trophy-outline" size={30} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          No ranked videos yet — once creators link accounts and post, the board fills up.
        </ThemedText>
      </BrutalCard>
    );
  }
  return (
    <View style={{ gap: Spacing.two }}>
      {entries.map((entry, i) => (
        <Row key={entry.video.id} entry={entry} rank={i + 1} />
      ))}
    </View>
  );
}

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { profile, video } = entry;
  const medal = MEDAL[rank];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/video/[id]', params: { id: video.id, v: JSON.stringify(video) } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border },
        brutalShadow(theme.shadow, rank <= 3 ? 5 : 3),
        pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
      ]}>
      <View>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={[styles.thumb, { borderColor: theme.border }]} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="film-outline" size={20} color={theme.textSecondary} />
          </View>
        )}
        <View style={[styles.rankBadge, { backgroundColor: medal ?? theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 2)]}>
          <ThemedText style={[styles.rankNum, { color: medal ? '#1A1A1A' : theme.text }]}>{rank}</ThemedText>
        </View>
      </View>

      <View style={styles.mid}>
        <ThemedText style={[styles.name, { color: '#000' }]} numberOfLines={1}>
          {profile.full_name ?? 'Creator'}
        </ThemedText>
        <ThemedText style={[styles.handle, { color: theme.textSecondary }]} numberOfLines={1}>
          @{video.accountUsername || 'video'}
        </ThemedText>
      </View>

      <View style={styles.viewsCol}>
        <ThemedText style={[styles.viewsNum, { color: '#000' }]}>{compact(video.views)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          views
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: Border.width,
  },
  thumb: { width: 72, height: 72, borderRadius: Radius.md, borderWidth: Border.width },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  rankBadge: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: Border.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: { fontSize: 16, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  mid: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  handle: { fontSize: 12, fontWeight: '600' },
  viewsCol: { alignItems: 'flex-end' },
  viewsNum: { fontSize: 20, lineHeight: 24, fontWeight: '900' },
});
