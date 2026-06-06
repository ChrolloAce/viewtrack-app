import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VIEWS_BONUS, VIEWS_BONUS_PER } from '@/lib/use-stats';
import type { VtVideo } from '@/lib/viewtrack';

const PLATFORM_ICON: Record<string, string> = { tiktok: 'logo-tiktok', instagram: 'logo-instagram', youtube: 'logo-youtube' };
const PLATFORM_COLOR: Record<string, string> = { tiktok: '#000000', instagram: '#E1306C', youtube: '#FF0000' };

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}
function dateStr(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function VideoDetail() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { v } = useLocalSearchParams<{ v?: string }>();
  let video: VtVideo | null = null;
  try {
    video = v ? (JSON.parse(v) as VtVideo) : null;
  } catch {
    video = null;
  }

  if (!video) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.center} edges={['top']}>
          <ThemedText type="small" themeColor="textSecondary">
            Video not found.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const views = video.views ?? 0;
  const likes = video.likes ?? 0;
  const comments = video.comments ?? 0;
  const shares = video.shares ?? 0;
  const saves = video.saves ?? 0;
  const engagement = views > 0 ? ((likes + comments + shares + saves) / views) * 100 : 0;
  const bonuses = Math.floor(views / VIEWS_BONUS_PER);
  const bonusAmount = bonuses * VIEWS_BONUS;
  const accent = PLATFORM_COLOR[video.platform] ?? theme.text;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/stats'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>video stats</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* hero */}
          <View style={styles.heroRow}>
            <View>
              {video.thumbnail ? (
                <Image source={{ uri: video.thumbnail }} style={[styles.thumb, { borderColor: theme.border }]} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Ionicons name="film-outline" size={28} color={theme.textSecondary} />
                </View>
              )}
              <View style={[styles.platformBadge, { backgroundColor: '#fff', borderColor: theme.border }]}>
                <Ionicons name={PLATFORM_ICON[video.platform] as never} size={16} color={accent} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <ThemedText style={styles.account} numberOfLines={1}>
                @{video.accountUsername || 'video'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                {video.title || 'Untitled'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                posted {dateStr(video.uploadDate)}
              </ThemedText>
            </View>
          </View>

          {/* big views */}
          <BrutalCard style={[styles.viewsCard, { backgroundColor: theme.primary, borderColor: theme.border }]}>
            <ThemedText style={[styles.viewsLabel, { color: theme.primaryText }]}>total views</ThemedText>
            <ThemedText style={[styles.viewsValue, { color: theme.primaryText }]}>{views.toLocaleString()}</ThemedText>
          </BrutalCard>

          {/* metric grid */}
          <View style={styles.grid}>
            <Metric icon="heart" label="likes" value={compact(likes)} />
            <Metric icon="chatbubble" label="comments" value={compact(comments)} />
            <Metric icon="pulse" label="engagement" value={`${engagement.toFixed(1)}%`} />
            <Metric icon="trophy" label="bonuses hit" value={`${bonuses}`} />
          </View>

          {/* bonus earned */}
          <BrutalCard style={styles.bonusCard}>
            <View style={styles.bonusLeft}>
              <Ionicons name="cash-outline" size={20} color={theme.primary} />
              <ThemedText style={styles.bonusText}>
                {bonuses > 0 ? `${bonuses}× 100k bonus` : 'no bonuses yet'}
              </ThemedText>
            </View>
            <ThemedText style={[styles.bonusAmt, { color: theme.primary }]}>+${bonusAmount}</ThemedText>
          </BrutalCard>
        </ScrollView>

        {/* fixed brutalist open button */}
        {!!video.url && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two, borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <Pressable
              onPress={() => Linking.openURL(video.url)}
              style={({ pressed }) => [
                styles.openBtn,
                { backgroundColor: theme.primary, borderColor: theme.border },
                brutalShadow(theme.shadow, 4),
                pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
              ]}>
              <Ionicons name="open-outline" size={20} color={theme.primaryText} />
              <ThemedText style={[styles.openText, { color: theme.primaryText }]}>open video</ThemedText>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <BrutalCard style={styles.metric} shadow={3}>
      <Ionicons name={icon as never} size={17} color={theme.primary} />
      <ThemedText style={styles.metricValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </BrutalCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: Border.width,
  },
  back: { width: 38, height: 38, borderRadius: 19, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  heroRow: { flexDirection: 'row', gap: Spacing.three },
  thumb: { width: 92, height: 120, borderRadius: Radius.md, borderWidth: Border.width },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  platformBadge: { position: 'absolute', top: -6, right: -6, width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  account: { fontSize: 18, fontWeight: '900' },
  viewsCard: { alignItems: 'flex-start', gap: 2, paddingVertical: Spacing.four },
  viewsLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', opacity: 0.9 },
  viewsValue: { fontSize: 44, lineHeight: 50, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  metric: { width: '47%', flexGrow: 1, alignItems: 'flex-start', gap: 2, paddingHorizontal: Spacing.two + 2, minHeight: 80, justifyContent: 'center' },
  metricValue: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  bonusCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bonusLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bonusText: { fontSize: 15, fontWeight: '800' },
  bonusAmt: { fontSize: 20, fontWeight: '900' },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, borderTopWidth: Border.width },
  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: 56, borderRadius: Radius.md, borderWidth: Border.widthThick },
  openText: { fontSize: 17, fontWeight: '900' },
});
