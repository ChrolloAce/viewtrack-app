import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { DesktopFrame } from '@/components/desktop-frame';
import { FlagChecklist } from '@/components/flag-checklist';
import { OverlaySlider } from '@/components/overlay-slider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { VIEWS_BONUS, VIEWS_BONUS_PER } from '@/lib/use-stats';
import { getVideoAnalysis, overlayItems, segTime, textOf, transcriptSegs, vtAnalyzeVideo, type VideoAnalysis, type VtVideo } from '@/lib/viewtrack';

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
  const { isAdmin } = useAuth();
  const { v } = useLocalSearchParams<{ v?: string }>();
  let video: VtVideo | null = null;
  try {
    video = v ? (JSON.parse(v) as VtVideo) : null;
  } catch {
    video = null;
  }
  const videoId = video?.id ?? null;

  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [loadingA, setLoadingA] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);
  // transcript + overlays are the main things this screen is for — open by default
  const [showTranscript, setShowTranscript] = useState(true);
  const [showOverlays, setShowOverlays] = useState(true);

  useEffect(() => {
    if (!videoId) return;
    let active = true;
    getVideoAnalysis(videoId).then((r) => {
      if (!active) return;
      setAnalysis(r?.analysis ?? null);
      setLoadingA(false);
    });
    return () => {
      active = false;
    };
  }, [videoId]);

  async function analyze(force = false) {
    if (!videoId || analyzing) return;
    setAnalyzing(true);
    setAErr(null);
    const r = await vtAnalyzeVideo(videoId, force);
    setAnalyzing(false);
    if (r.ok) setAnalysis(r.analysis ?? null);
    else setAErr(r.error ?? 'Analysis is still processing — try again in a moment.');
  }

  if (!video) {
    return (
      <DesktopFrame active="videos">
        <ThemedView style={styles.container}>
          <SafeAreaView style={styles.center} edges={['top']}>
            <ThemedText type="small" themeColor="textSecondary">
              Video not found.
            </ThemedText>
          </SafeAreaView>
        </ThemedView>
      </DesktopFrame>
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
    <DesktopFrame active="videos">
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

          {/* AI breakdown */}
          <View style={styles.aiHead}>
            <Ionicons name="sparkles" size={18} color={theme.primary} />
            <ThemedText style={styles.aiTitle}>AI breakdown</ThemedText>
          </View>

          {loadingA ? null : analyzing ? (
            <BrutalCard style={styles.aiBusy}>
              <ActivityIndicator color={theme.primary} />
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Analyzing with Gemini… the first run on a video can take up to ~3 min.
              </ThemedText>
            </BrutalCard>
          ) : analysis ? (
            <>
              <FlagChecklist overlays={Array.isArray(analysis.textOverlays) || Array.isArray(analysis.overlays) ? overlayItems(analysis) : null} />
              {transcriptSegs(analysis).length > 0 && (
                <BrutalCard style={{ gap: 0 }}>
                  <Pressable onPress={() => setShowTranscript((s) => !s)} style={[styles.transcriptHead, showTranscript && styles.sectionHeadOpen]}>
                    <ThemedText style={[styles.aiBlockLabel, { color: theme.primary }]}>Transcript</ThemedText>
                    <Ionicons name={showTranscript ? 'chevron-up' : 'chevron-down'} size={18} color={theme.text} />
                  </Pressable>
                  {showTranscript &&
                    transcriptSegs(analysis).map((seg, i, arr) => (
                      <View key={i} style={[styles.segRow, i < arr.length - 1 && styles.segDivider]}>
                        <ThemedText style={styles.aiBlockText}>
                          {segTime(seg) ? <ThemedText type="small" themeColor="textSecondary">{`${segTime(seg)}  `}</ThemedText> : null}
                          {seg.text}
                        </ThemedText>
                      </View>
                    ))}
                </BrutalCard>
              )}
              {overlayItems(analysis).length > 0 && (
                <BrutalCard style={{ gap: 0 }}>
                  <Pressable onPress={() => setShowOverlays((s) => !s)} style={[styles.transcriptHead, showOverlays && styles.sectionHeadOpen]}>
                    <ThemedText style={[styles.aiBlockLabel, { color: theme.primary }]}>Overlays</ThemedText>
                    <Ionicons name={showOverlays ? 'chevron-up' : 'chevron-down'} size={18} color={theme.text} />
                  </Pressable>
                  {showOverlays && <OverlaySlider overlays={overlayItems(analysis)} videoId={videoId ?? undefined} />}
                </BrutalCard>
              )}
              {!!textOf(analysis.hook) && <AiBlock icon="fish" label="Hook" text={textOf(analysis.hook)!} tint={theme.primary} />}
              {isAdmin && (
                <Pressable onPress={() => analyze(true)} disabled={analyzing} style={({ pressed }) => [styles.reanalyze, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="refresh" size={14} color={theme.textSecondary} />
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Re-analyze
                  </ThemedText>
                </Pressable>
              )}
            </>
          ) : isAdmin ? (
            <Pressable
              onPress={() => analyze(false)}
              style={({ pressed }) => [styles.analyzeBtn, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
              <Ionicons name="sparkles" size={20} color={theme.primary} />
              <ThemedText style={styles.analyzeText}>Analyze this video with AI</ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No AI breakdown yet.
            </ThemedText>
          )}
          {!!aErr && (
            <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
              {aErr}
            </ThemedText>
          )}
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
    </DesktopFrame>
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

function AiBlock({ icon, label, text, tint }: { icon: string; label: string; text: string; tint: string }) {
  return (
    <BrutalCard style={styles.aiBlock}>
      <View style={styles.aiBlockHead}>
        <Ionicons name={icon as never} size={16} color={tint} />
        <ThemedText style={styles.aiBlockLabel}>{label}</ThemedText>
      </View>
      <ThemedText style={styles.aiBlockText}>{text}</ThemedText>
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
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  aiTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900' },
  aiBusy: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  aiBlock: { gap: 5 },
  aiBlockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiBlockLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  aiBlockText: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  transcriptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeadOpen: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)', paddingBottom: 8, marginBottom: 6 },
  segRow: { paddingVertical: 6 },
  segDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.07)' },
  reanalyze: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.two, borderRadius: Radius.full, borderWidth: Border.width, alignSelf: 'center', paddingHorizontal: Spacing.three },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: 56, borderRadius: Radius.md, borderWidth: Border.widthThick },
  analyzeText: { fontSize: 16, fontWeight: '900' },
  footer: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, borderTopWidth: Border.width },
  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: 56, borderRadius: Radius.md, borderWidth: Border.widthThick },
  openText: { fontSize: 17, fontWeight: '900' },
});
