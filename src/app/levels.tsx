import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { badgeFor } from '@/lib/badges';
import { useProgress } from '@/lib/use-progress';

const HOW_TO: { icon: string; title: string; sub: string }[] = [
  { icon: 'videocam', title: 'Post a video', sub: '+50 XP each time a new post lands on a linked account.' },
  { icon: 'eye', title: 'Rack up views', sub: '+1 XP for every 50 views your videos pull in — it keeps climbing.' },
  { icon: 'checkmark-done', title: 'Finish briefs on time', sub: '+100 XP per brief done by its date (+50 if late).' },
  { icon: 'chatbubble-ellipses', title: 'Stay active in chat', sub: '+10 XP each day you show up in the community.' },
];

export default function LevelsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { levels, levelNum, current, next, xp, pct, xpToNext } = useProgress();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>levels</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Current level hero */}
          <BrutalCard style={[styles.hero, { borderColor: theme.border }]} shadow={5}>
            <Image source={badgeFor(levelNum).source} style={styles.heroBadge} contentFit="contain" />
            <ThemedText style={[styles.heroLevel, { color: theme.textSecondary }]}>LEVEL {levelNum}</ThemedText>
            <ThemedText style={[styles.heroTitle, { color: current?.color ?? theme.primary }]}>{current?.title ?? 'Rookie'}</ThemedText>
            <View style={[styles.xpTrack, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.xpFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: current?.color ?? theme.primary }]} />
            </View>
            <ThemedText style={[styles.xpLabel, { color: theme.textSecondary }]}>
              {next ? `${xp.toLocaleString()} XP · ${xpToNext.toLocaleString()} to Level ${levelNum + 1}` : `${xp.toLocaleString()} XP · max level reached 🎉`}
            </ThemedText>
          </BrutalCard>

          {/* Unlocks at next level */}
          {next && (
            <BrutalCard style={[styles.card, { borderLeftColor: next.color, borderLeftWidth: 5 }]}>
              <View style={styles.cardHead}>
                <Ionicons name="lock-open" size={18} color={next.color} />
                <ThemedText style={styles.cardTitle}>
                  Unlocks at Level {next.level} · {next.title}
                </ThemedText>
              </View>
              {next.perks.map((perk) => (
                <View key={perk} style={styles.perkRow}>
                  <Ionicons name="add-circle" size={18} color={next.color} />
                  <ThemedText style={styles.perkText}>{perk}</ThemedText>
                </View>
              ))}
            </BrutalCard>
          )}

          {/* How to level up */}
          <BrutalCard style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="trending-up" size={18} color={theme.primary} />
              <ThemedText style={styles.cardTitle}>How to level up</ThemedText>
            </View>
            {HOW_TO.map((h) => (
              <View key={h.title} style={styles.howRow}>
                <View style={[styles.howIcon, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Ionicons name={h.icon as never} size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.howTitle}>{h.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {h.sub}
                  </ThemedText>
                </View>
              </View>
            ))}
          </BrutalCard>

          {/* Full roadmap */}
          <ThemedText style={styles.sectionTitle}>All levels</ThemedText>
          {levels.map((lv) => {
            const isCurrent = lv.level === levelNum;
            const locked = lv.level > levelNum;
            return (
              <View
                key={lv.level}
                style={[
                  styles.lvRow,
                  { backgroundColor: theme.card, borderColor: isCurrent ? lv.color : theme.border },
                  isCurrent && brutalShadow(theme.shadow, 4),
                  isCurrent && { borderWidth: Border.widthThick },
                ]}>
                <Image source={badgeFor(lv.level).source} style={[styles.lvBadge, locked && { opacity: 0.35 }]} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <View style={styles.lvTopRow}>
                    <ThemedText style={styles.lvTitle} numberOfLines={1}>
                      Lv {lv.level} · {lv.title}
                    </ThemedText>
                    {isCurrent ? (
                      <View style={[styles.herePill, { backgroundColor: lv.color }]}>
                        <ThemedText style={styles.herePillText}>YOU'RE HERE</ThemedText>
                      </View>
                    ) : locked ? (
                      <Ionicons name="lock-closed" size={14} color={theme.textSecondary} />
                    ) : (
                      <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                    )}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {lv.xp_required.toLocaleString()} XP · {lv.perks.join(' • ')}
                  </ThemedText>
                </View>
              </View>
            );
          })}
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
  headerTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  hero: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.four },
  heroBadge: { width: 120, height: 120, marginBottom: Spacing.one },
  heroLevel: { fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  heroTitle: { fontSize: 30, lineHeight: 36, fontWeight: '900' },
  xpTrack: { height: 14, width: '100%', borderRadius: Radius.full, borderWidth: 1.5, overflow: 'hidden', marginTop: Spacing.two },
  xpFill: { height: '100%', borderRadius: Radius.full },
  xpLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  card: { gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { fontSize: 16, fontWeight: '900', flex: 1 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  perkText: { fontSize: 15, fontWeight: '700' },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  howIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  howTitle: { fontSize: 15, fontWeight: '800' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: Spacing.one },
  lvRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, borderRadius: Radius.lg, borderWidth: Border.width },
  lvBadge: { width: 48, height: 48 },
  lvTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  lvTitle: { flex: 1, fontSize: 16, fontWeight: '900' },
  herePill: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.full },
  herePillText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
});
