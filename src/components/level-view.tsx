import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { badgeFor } from '@/lib/badges';
import { useProgress } from '@/lib/use-progress';

export function LevelView({ bottomInset = 0 }: { bottomInset?: number }) {
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + Spacing.six }]}>
      <LevelBody />
    </ScrollView>
  );
}

/** Level progression content with no scroll wrapper — embeddable in Profile. */
export function LevelBody({ showTitle = true }: { showTitle?: boolean }) {
  const theme = useTheme();
  const { loading, levels, xp, levelNum, current, next, pct, xpToNext } = useProgress();

  if (loading && !current) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const color = current?.color ?? theme.primary;
  const ceil = next?.xp_required ?? xp;

  return (
    <>
      {showTitle && <ThemedText style={styles.title}>your level</ThemedText>}

      {/* Hero badge + XP progress */}
      <BrutalCard style={styles.hero}>
        <Image source={badgeFor(levelNum).source} style={styles.badge} contentFit="contain" />
        <ThemedText style={[styles.levelNum, { color }]}>LEVEL {levelNum}</ThemedText>
        <ThemedText style={styles.levelTitle}>{current?.title ?? 'Rookie'}</ThemedText>

        <View style={styles.xpRow}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {xp.toLocaleString()} XP
          </ThemedText>
          {next && (
            <ThemedText type="smallBold" themeColor="textSecondary">
              {ceil.toLocaleString()} XP
            </ThemedText>
          )}
        </View>
        <View style={[styles.track, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={[styles.fill, { backgroundColor: color, width: `${Math.round(pct * 100)}%` }]} />
        </View>
        {next ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.toNext}>
            {xpToNext.toLocaleString()} XP to {next.title}
          </ThemedText>
        ) : (
          <ThemedText type="smallBold" style={[styles.toNext, { color }]}>
            Max level reached 🏆
          </ThemedText>
        )}
      </BrutalCard>

      {/* Perks unlocked at this level */}
      {!!current?.perks?.length && (
        <BrutalCard style={styles.section}>
          <ThemedText style={styles.sectionTitle}>unlocked</ThemedText>
          {current.perks.map((perk) => (
            <View key={perk} style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={20} color={theme.success} />
              <ThemedText style={styles.perkText}>{perk}</ThemedText>
            </View>
          ))}
        </BrutalCard>
      )}

      {/* Full level path */}
      <BrutalCard style={styles.section}>
        <ThemedText style={styles.sectionTitle}>the path</ThemedText>
        {levels.map((l) => {
          const unlocked = l.level <= levelNum;
          const isCurrent = l.level === levelNum;
          return (
            <View
              key={l.level}
              style={[
                styles.pathRow,
                isCurrent && { backgroundColor: theme.primaryMuted, borderRadius: Radius.md },
              ]}>
              <Image
                source={badgeFor(l.level).source}
                style={[styles.pathIcon, { opacity: unlocked ? 1 : 0.35 }]}
                contentFit="contain"
              />
              <View style={styles.pathText}>
                <ThemedText style={[styles.pathTitle, !unlocked && { color: theme.textSecondary }]}>
                  {l.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Lv {l.level} · {l.xp_required.toLocaleString()} XP
                </ThemedText>
              </View>
              {isCurrent ? (
                <View style={[styles.youBadge, { backgroundColor: l.color }]}>
                  <ThemedText style={styles.youText}>YOU</ThemedText>
                </View>
              ) : unlocked ? (
                <Ionicons name="checkmark-circle" size={22} color={theme.success} />
              ) : (
                <Ionicons name="lock-closed" size={18} color={theme.textSecondary} />
              )}
            </View>
          );
        })}
      </BrutalCard>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  title: { fontSize: 32, lineHeight: 42, fontWeight: '800', paddingTop: Spacing.two },
  hero: { alignItems: 'center', gap: Spacing.one },
  badge: { width: 116, height: 116, marginBottom: Spacing.one },
  levelNum: { fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: 1 },
  levelTitle: { fontSize: 28, lineHeight: 36, fontWeight: '900' },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: Spacing.two },
  track: {
    alignSelf: 'stretch',
    height: 14,
    borderRadius: Radius.full,
    borderWidth: Border.width,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
  toNext: { marginTop: Spacing.one },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginBottom: Spacing.one },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  perkText: { fontSize: 16, fontWeight: '500' },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two },
  pathIcon: { width: 46, height: 46 },
  pathText: { flex: 1 },
  pathTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  youBadge: { paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: Radius.full },
  youText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
});
