import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { DesktopFrame } from '@/components/desktop-frame';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { badgeFor } from '@/lib/badges';
import { supabase } from '@/lib/supabase';
import { vtCreator, type CreatorView, type VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export default function CreatorProfile() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<CreatorView | null>(null);
  const [level, setLevel] = useState<{ title: string; color: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    vtCreator(id).then((d) => {
      if (!active) return;
      setData(d);
      setLoading(false);
      const lvl = d?.progress?.level ?? 1;
      supabase
        .from('levels')
        .select('title, color')
        .eq('level', lvl)
        .single()
        .then(({ data: l }) => active && setLevel(l ?? null));
    });
    return () => {
      active = false;
    };
  }, [id]);

  const p = data?.profile;
  const levelNum = data?.progress?.level ?? 1;
  const totalFollowing = (data?.accounts ?? []).reduce((s, a) => s + (a.followerCount ?? 0), 0);
  const totalViews = (data?.accounts ?? []).reduce((s, a) => s + (a.totalViews ?? 0), 0);
  const totalVideos = (data?.accounts ?? []).reduce((s, a) => s + (a.totalVideos ?? 0), 0);
  const topVideos = [...(data?.videos ?? [])].sort((a, b) => b.views - a.views).slice(0, 12);
  const accentColor = level?.color ?? theme.primary;

  return (
    <DesktopFrame active="creators">
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {p?.full_name ?? 'Creator'}
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Identity */}
          <BrutalCard style={styles.hero}>
            <View style={styles.avatarWrap}>
              <View style={[styles.avatarRing, { borderColor: accentColor }]}>
                <BrutalAvatar name={p?.full_name} uri={p?.avatar_url} size={72} />
              </View>
              <Image source={badgeFor(levelNum).source} style={styles.heroBadge} contentFit="contain" />
            </View>
            <ThemedText style={styles.heroName} numberOfLines={1}>
              {p?.full_name ?? 'Creator'}
            </ThemedText>
            <ThemedText style={[styles.heroLevel, { color: accentColor }]}>
              LEVEL {levelNum}
              {level?.title ? ` · ${level.title}` : ''}
            </ThemedText>
          </BrutalCard>

          {/* Stats */}
          <View style={styles.statRow}>
            <Stat icon="people" label="following" value={loading ? '—' : compact(totalFollowing)} loading={loading} />
            <Stat icon="eye" label="views" value={loading ? '—' : compact(totalViews)} loading={loading} />
            <Stat icon="videocam" label="videos" value={loading ? '—' : `${totalVideos}`} loading={loading} />
          </View>

          {/* What they've done */}
          <BrutalCard style={styles.doneCard}>
            <ThemedText style={styles.cardTitle}>activity</ThemedText>
            <View style={styles.doneRow}>
              <Ionicons name="checkmark-done-circle" size={20} color={theme.success} />
              <ThemedText style={styles.doneText}>
                {data?.briefsDone ?? 0} {data?.briefsDone === 1 ? 'brief' : 'briefs'} completed
              </ThemedText>
            </View>
            <View style={styles.doneRow}>
              <Ionicons name="film" size={20} color={theme.primary} />
              <ThemedText style={styles.doneText}>{totalVideos} videos posted on linked accounts</ThemedText>
            </View>
          </BrutalCard>

          {/* Top videos */}
          <ThemedText style={styles.sectionTitle}>Top videos</ThemedText>
          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width={150} height={210} radius={Radius.md} />
              ))}
            </ScrollView>
          ) : topVideos.length === 0 ? (
            <BrutalCard style={styles.empty}>
              <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                No videos yet.
              </ThemedText>
            </BrutalCard>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
              {topVideos.map((v) => (
                <VideoCard key={v.id} video={v} onPress={() => router.push({ pathname: '/video/[id]', params: { id: v.id, v: JSON.stringify(v) } })} />
              ))}
            </ScrollView>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
    </DesktopFrame>
  );
}

function Stat({ icon, label, value, loading }: { icon: string; label: string; value: string; loading: boolean }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.statCard} shadow={3}>
      <Ionicons name={icon as never} size={18} color={theme.primary} />
      {loading ? <Skeleton width={40} height={22} /> : <ThemedText style={styles.statValue}>{value}</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </BrutalCard>
  );
}

function VideoCard({ video, onPress }: { video: VtVideo; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress ?? (() => video.url && Linking.openURL(video.url))}
      style={({ pressed }) => [styles.videoCard, { borderColor: theme.border }, brutalShadow(theme.shadow, 3), pressed && { opacity: 0.85 }]}>
      <View>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={styles.videoThumb} contentFit="cover" />
        ) : (
          <View style={[styles.videoThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="film-outline" size={26} color={theme.textSecondary} />
          </View>
        )}
        <Ionicons name={PLATFORM_ICON[video.platform] as never} size={20} color="#fff" style={styles.platBadge} />
      </View>
      <View style={styles.videoMeta}>
        <Ionicons name="eye" size={15} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {compact(video.views)}
        </ThemedText>
      </View>
    </Pressable>
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
  hero: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.four },
  avatarWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { padding: 3, borderRadius: 50, borderWidth: 3 },
  heroBadge: { position: 'absolute', bottom: -6, right: -8, width: 38, height: 38 },
  heroName: { fontSize: 22, lineHeight: 28, fontWeight: '900', marginTop: Spacing.two },
  heroLevel: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  statCard: { flex: 1, alignItems: 'flex-start', gap: 2, paddingHorizontal: Spacing.two, minHeight: 78, justifyContent: 'center' },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  doneCard: { gap: Spacing.two },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  doneText: { fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: Spacing.one },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  slider: { gap: Spacing.three, paddingVertical: Spacing.one, paddingRight: Spacing.three },
  videoCard: { width: 150, borderRadius: Radius.md, borderWidth: Border.width, overflow: 'hidden' },
  platBadge: { position: 'absolute', top: 7, right: 7, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  videoThumb: { width: '100%', height: 200 },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: Spacing.two },
});
