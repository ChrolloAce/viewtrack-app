import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStats } from '@/lib/use-stats';
import { vtCreator, type VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DayDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { date, span, profileId } = useLocalSearchParams<{ date: string; span?: string; profileId?: string }>();
  const dayCount = Math.max(1, parseInt(span ?? '1', 10) || 1);

  // Self view uses the cached stats; an admin opening a creator's day fetches theirs.
  const { videos: myVideos } = useStats();
  const [creatorVideos, setCreatorVideos] = useState<VtVideo[] | null>(null);
  useEffect(() => {
    if (!profileId) return;
    let active = true;
    vtCreator(profileId).then((d) => active && setCreatorVideos(d?.videos ?? []));
    return () => {
      active = false;
    };
  }, [profileId]);
  const videos = profileId ? creatorVideos ?? [] : myVideos;

  // parse "YYYY-MM-DD" as a local date; the window is [start, start + span days)
  const [y, m, d] = (date ?? '').split('-').map((n) => parseInt(n, 10));
  const dayDate = y ? new Date(y, (m ?? 1) - 1, d ?? 1) : new Date();
  const startTs = dayDate.getTime();
  const endTs = startTs + dayCount * 86400000;
  const endDate = new Date(startTs + (dayCount - 1) * 86400000);

  const longDate =
    dayCount > 1
      ? `${dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : dayDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const dayVideos = videos
    .filter((v) => {
      if (!v.uploadDate) return false;
      const ts = new Date(v.uploadDate).getTime();
      return ts >= startTs && ts < endTs;
    })
    .sort((a, b) => b.views - a.views);
  const totalViews = dayVideos.reduce((s, v) => s + (v.views ?? 0), 0);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/stats'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {longDate}
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <BrutalCard style={[styles.summary, { backgroundColor: theme.primary, borderColor: theme.border }]}>
            <ThemedText style={[styles.sumValue, { color: theme.primaryText }]}>{compact(totalViews)}</ThemedText>
            <ThemedText style={[styles.sumLabel, { color: theme.primaryText }]}>
              views · {dayVideos.length} {dayVideos.length === 1 ? 'video' : 'videos'}
            </ThemedText>
          </BrutalCard>

          {dayVideos.length === 0 ? (
            <BrutalCard style={styles.empty}>
              <Ionicons name="film-outline" size={28} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                No videos posted this day.
              </ThemedText>
            </BrutalCard>
          ) : (
            dayVideos.map((v) => (
              <Pressable
                key={v.id}
                onPress={() => router.push({ pathname: '/video/[id]', params: { id: v.id, v: JSON.stringify(v) } })}
                style={({ pressed }) => [styles.vidRow, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
                <View>
                  {v.thumbnail ? (
                    <Image source={{ uri: v.thumbnail }} style={styles.vidThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.vidThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="film-outline" size={18} color={theme.textSecondary} />
                    </View>
                  )}
                  <View style={[styles.vidBadge, { backgroundColor: '#fff', borderColor: theme.border }]}>
                    <Ionicons name={PLATFORM_ICON[v.platform] as never} size={11} color={PLATFORM_COLOR[v.platform] ?? theme.text} />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.vidTitle} numberOfLines={1}>
                    @{v.accountUsername || 'video'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {compact(v.views)} views
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: Border.width,
  },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  summary: { alignItems: 'flex-start', gap: 0, paddingVertical: Spacing.four },
  sumValue: { fontSize: 44, lineHeight: 50, fontWeight: '900' },
  sumLabel: { fontSize: 14, fontWeight: '800', opacity: 0.9 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  vidRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  vidThumb: { width: 48, height: 62, borderRadius: Radius.sm },
  vidBadge: { position: 'absolute', top: -5, right: -5, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vidTitle: { fontSize: 15, fontWeight: '800' },
});
