import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeaderboardView } from '@/components/leaderboard-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useTheme } from '@/hooks/use-theme';

export default function LeaderboardScreen() {
  const theme = useTheme();
  const isDesktop = useIsDesktop();

  if (isDesktop) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.trophyChip, { backgroundColor: theme.primary, borderColor: theme.border }]}>
              <Ionicons name="trophy" size={20} color={theme.primaryText} />
            </View>
            <View>
              <ThemedText style={styles.headerTitle}>leaderboard</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                who's performing across the campaign
              </ThemedText>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LeaderboardView />
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  trophyChip: { width: 42, height: 42, borderRadius: 21, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  content: { padding: Spacing.three, paddingBottom: BottomTabInset + Spacing.six },
});
