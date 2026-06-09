import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CreatorLeaderboard } from '@/components/creator-leaderboard';
import { LeaderboardList } from '@/components/leaderboard-list';
import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Segmented leaderboard: Top Creators (ranked, timeframe + sort) | Top Videos. */
export function LeaderboardView() {
  const theme = useTheme();
  const [tab, setTab] = useState<'creators' | 'videos'>('creators');
  return (
    <View style={{ gap: Spacing.three }}>
      <View style={[styles.seg, { borderColor: theme.border, backgroundColor: theme.card }]}>
        {(['creators', 'videos'] as const).map((t) => {
          const on = tab === t;
          return (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.segBtn, on && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.segText, { color: on ? theme.primaryText : theme.text }]}>
                {t === 'creators' ? 'Top Creators' : 'Top Videos'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {tab === 'creators' ? <CreatorLeaderboard /> : <LeaderboardList />}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: Radius.sm, borderWidth: Border.width, padding: 3, alignSelf: 'stretch' },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: Radius.sm },
  segText: { fontSize: 14, fontWeight: '800' },
});
