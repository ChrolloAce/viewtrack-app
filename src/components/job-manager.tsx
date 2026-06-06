import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useJobs, type Job } from '@/lib/jobs';

/** Persistent floating job tracker, bottom-right. Mount once at the shell root. */
export function JobManager() {
  const theme = useTheme();
  const { jobs, dismiss, clearFinished } = useJobs();
  const [minimized, setMinimized] = useState(false);

  const running = jobs.filter((j) => j.status === 'running').length;
  const finished = jobs.filter((j) => j.status !== 'running').length;

  if (jobs.length === 0) return null;

  // Minimized → a small pill showing how many jobs are active.
  if (minimized) {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <Pressable
          onPress={() => setMinimized(false)}
          style={({ pressed }) => [styles.pill, { backgroundColor: theme.primary, borderColor: theme.border }, brutalShadow(theme.shadow, 4), pressed && { opacity: 0.85 }]}>
          {running > 0 ? <Spinner color={theme.primaryText} /> : <Ionicons name="checkmark-circle" size={18} color={theme.primaryText} />}
          <ThemedText style={[styles.pillText, { color: theme.primaryText }]}>
            {running > 0 ? `${running} running` : `${finished} done`}
          </ThemedText>
          <Ionicons name="chevron-up" size={16} color={theme.primaryText} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 6)]}>
        <View style={[styles.head, { borderBottomColor: theme.border }]}>
          <View style={styles.headLeft}>
            {running > 0 ? <Spinner color={theme.primary} /> : <Ionicons name="checkmark-done-circle" size={18} color={theme.success} />}
            <ThemedText style={styles.headTitle}>
              {running > 0 ? `Jobs · ${running} running` : 'Jobs'}
            </ThemedText>
          </View>
          <View style={styles.headBtns}>
            {finished > 0 && (
              <Pressable onPress={clearFinished} hitSlop={8} style={styles.headBtn}>
                <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
              </Pressable>
            )}
            <Pressable onPress={() => setMinimized(true)} hitSlop={8} style={styles.headBtn}>
              <Ionicons name="remove" size={20} color={theme.text} />
            </Pressable>
          </View>
        </View>
        <ScrollView style={styles.list} contentContainerStyle={{ gap: Spacing.two }}>
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} onClose={() => dismiss(j.id)} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function JobRow({ job, onClose }: { job: Job; onClose: () => void }) {
  const theme = useTheme();
  const pct = job.total > 0 ? Math.min(1, job.done / job.total) : job.status === 'done' ? 1 : 0;
  const color = job.status === 'error' ? theme.danger : job.status === 'done' ? theme.success : theme.primary;
  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.rowTop}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>
          {job.title}
        </ThemedText>
        {job.status !== 'running' && (
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </Pressable>
        )}
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
      </View>
      <ThemedText type="small" themeColor={job.status === 'error' ? 'danger' : 'textSecondary'} numberOfLines={1}>
        {job.status === 'error'
          ? `Failed — ${job.error ?? 'error'}`
          : job.status === 'done'
            ? `Done · ${job.done}${job.total ? `/${job.total}` : ''}${job.note ? ` · ${job.note}` : ''}`
            : `${job.done}${job.total ? `/${job.total}` : ''}${job.note ? ` · ${job.note}` : ''}`}
      </ThemedText>
    </View>
  );
}

function Spinner({ color }: { color: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="sync" size={16} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: Spacing.four, bottom: Spacing.four, zIndex: 9999 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, height: 44, borderRadius: Radius.full, borderWidth: Border.width },
  pillText: { fontSize: 14, fontWeight: '800' },
  card: { width: 340, maxHeight: 380, borderRadius: Radius.lg, borderWidth: Border.widthThick, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: Border.width },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headTitle: { fontSize: 15, fontWeight: '900' },
  headBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  row: { borderRadius: Radius.md, borderWidth: Border.width, padding: Spacing.two + 2, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  track: { height: 8, borderRadius: Radius.full, borderWidth: 1.5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
});
