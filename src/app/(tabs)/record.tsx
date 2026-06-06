import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, BottomTabInset, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';
import { useCompletions } from '@/lib/use-completions';
import { useScripts, type Script } from '@/lib/use-scripts';

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RecordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { scripts, loading } = useScripts();
  const { doneIds } = useCompletions();

  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const [selected, setSelected] = useState(ymd(today));
  // done-state is owned by the brief screen now; here we only reflect it.
  const isDone = (s: Script) => doneIds.has(s.id);

  const countByDay: Record<string, number> = {};
  const doneByDay: Record<string, number> = {};
  scripts.forEach((s) => {
    countByDay[s.scheduled_date] = (countByDay[s.scheduled_date] ?? 0) + 1;
    if (isDone(s)) doneByDay[s.scheduled_date] = (doneByDay[s.scheduled_date] ?? 0) + 1;
  });
  const dayComplete = (key: string) => (countByDay[key] ?? 0) > 0 && doneByDay[key] === countByDay[key];

  const dayScripts = scripts.filter((s) => s.scheduled_date === selected);
  const dayDone = dayScripts.filter(isDone).length;
  const allDone = dayScripts.length > 0 && dayDone === dayScripts.length;

  const renderScript = ({ item }: { item: Script }) => {
    const done = isDone(item);
    return (
      <BrutalCard style={done ? [styles.card, { borderColor: theme.success }] : styles.card}>
        <Pressable
          onPress={() => router.push({ pathname: '/brief/[id]', params: { id: item.id } })}
          style={({ pressed }) => [styles.cardRow, pressed && { opacity: 0.7 }]}>
          <View style={styles.thumbWrap}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={[styles.thumb, { borderColor: theme.border }]} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty, { borderColor: theme.border }]}>
                <Ionicons name="film-outline" size={24} color={theme.textSecondary} />
              </View>
            )}
          </View>
          <View style={styles.cardText}>
            <ThemedText style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </ThemedText>
          </View>
          {done ? (
            <Ionicons name="checkmark-circle" size={22} color={theme.success} />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          )}
        </Pressable>
      </BrutalCard>
    );
  };

  if (isDesktop) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>record</ThemedText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.strip}
          contentContainerStyle={styles.stripContent}>
          {days.map((d) => {
            const key = ymd(d);
            const on = key === selected;
            const has = (countByDay[key] ?? 0) > 0;
            const complete = dayComplete(key);
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                style={[
                  styles.day,
                  { borderColor: theme.border, backgroundColor: on ? theme.primary : theme.card },
                  on && brutalShadow(theme.shadow, 3),
                ]}>
                <ThemedText style={[styles.dayWeek, { color: on ? theme.primaryText : theme.textSecondary }]}>
                  {d.toLocaleDateString([], { weekday: 'short' }).toUpperCase()}
                </ThemedText>
                <ThemedText style={[styles.dayNum, { color: on ? theme.primaryText : theme.text }]}>
                  {d.getDate()}
                </ThemedText>
                {/* check = all done for the day, dot = has scripts, nothing = empty */}
                {has && complete ? (
                  <Ionicons name="checkmark-circle" size={15} color={on ? theme.primaryText : theme.success} />
                ) : (
                  <View
                    style={[
                      styles.dayDot,
                      { backgroundColor: !has ? 'transparent' : on ? theme.primaryText : theme.primary },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={dayScripts}
            keyExtractor={(s) => s.id}
            renderItem={renderScript}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              dayScripts.length > 0 ? (
                <View style={styles.listHead}>
                  <ThemedText style={[styles.dayCount, allDone && { color: theme.success }]}>
                    {allDone
                      ? 'all done ✓'
                      : `${dayScripts.length - dayDone} of ${dayScripts.length} to film`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                    tap a card to open its brief
                  </ThemedText>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="film-outline" size={40} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  No scripts for this day.
                </ThemedText>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  headerTitle: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  strip: { flexGrow: 0 },
  stripContent: { paddingHorizontal: Spacing.three, gap: Spacing.two + 2, paddingTop: Spacing.two + 4, paddingBottom: Spacing.three },
  day: {
    width: 54,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: Border.width,
    alignItems: 'center',
    gap: 2,
  },
  dayWeek: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  dayNum: { fontSize: 22, lineHeight: 26, fontWeight: '900' },
  dayDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  listHead: { marginBottom: Spacing.two, paddingHorizontal: 2, gap: 1 },
  dayCount: { fontSize: 15, fontWeight: '800' },
  hint: { fontStyle: 'italic' },
  list: { padding: Spacing.three, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.three },
  card: { gap: Spacing.two },
  cardRow: { flexDirection: 'row', gap: Spacing.three },
  thumbWrap: { width: 80, height: 80 },
  thumb: { width: 80, height: 80, borderRadius: Radius.sm, borderWidth: Border.width },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: Spacing.one, justifyContent: 'center' },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800' },
});
