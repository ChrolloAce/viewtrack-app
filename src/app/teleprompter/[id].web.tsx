import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Recording uses the device camera — not available on web. This web-only
// override keeps `expo-camera` out of the static (Node) web bundle.
export default function TeleprompterWeb() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <Ionicons name="videocam-off-outline" size={52} color={theme.textSecondary} />
      <ThemedText style={styles.title}>Recording is only available in the mobile app</ThemedText>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/record'))} hitSlop={12}>
        <ThemedText style={[styles.link, { color: theme.primary }]}>← go back</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.five },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '800', textAlign: 'center' },
  link: { fontSize: 16, fontWeight: '800' },
});
