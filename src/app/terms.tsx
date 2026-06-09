import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalButton, BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const GUIDELINES = [
  'Be respectful — treat creators and the team with respect.',
  'Keep it authentic — post your own real content.',
  'Zero tolerance for harassment, hate, or bullying.',
  'No spam, scams, or misleading links.',
  "Follow each platform's rules (TikTok, Instagram, YouTube).",
  'Keep it legal — nothing illegal, stolen, or infringing.',
];

const TERMS = [
  'Your content stays yours — you let us track and show its stats.',
  'You are responsible for your account and the accounts you link.',
  'We may suspend or remove access for guideline violations.',
  'Payouts follow the terms of your agreement with the team.',
  'The service is provided "as is", without warranties.',
];

export default function TermsScreen() {
  const theme = useTheme();
  const { session, refreshProfile } = useAuth();
  const uid = session?.user?.id ?? null;
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!uid || !agreed) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('profiles').update({ accepted_terms_at: new Date().toISOString() } as never).eq('id', uid);
    if (e) {
      setBusy(false);
      setError(e.message);
      return;
    }
    await refreshProfile();
    setBusy(false);
    // Route guard takes over once acceptance lands on the profile.
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.iconWrap, { backgroundColor: theme.primary, borderColor: theme.border }, brutalShadow(theme.shadow, 5)]}>
            <Ionicons name="shield-checkmark" size={34} color={theme.primaryText} />
          </View>
          <ThemedText style={styles.title}>before you join</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            A quick read on how we keep ViewTrack a good place. Agree to continue.
          </ThemedText>

          <BrutalCard style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: theme.accent, borderColor: theme.border }]}>
                <Ionicons name="people" size={16} color="#1A1A1A" />
              </View>
              <ThemedText style={styles.cardTitle}>Community Guidelines</ThemedText>
            </View>
            {GUIDELINES.map((g) => (
              <View key={g} style={styles.bullet}>
                <Ionicons name="checkmark-circle" size={18} color={theme.success} style={styles.bulletIcon} />
                <ThemedText type="small" style={styles.bulletText}>
                  {g}
                </ThemedText>
              </View>
            ))}
          </BrutalCard>

          <BrutalCard style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="document-text" size={16} color={theme.text} />
              </View>
              <ThemedText style={styles.cardTitle}>Terms of Service</ThemedText>
            </View>
            {TERMS.map((t) => (
              <View key={t} style={styles.bullet}>
                <Ionicons name="ellipse" size={7} color={theme.textSecondary} style={styles.dot} />
                <ThemedText type="small" style={styles.bulletText}>
                  {t}
                </ThemedText>
              </View>
            ))}
          </BrutalCard>

          <Pressable onPress={() => setAgreed((v) => !v)} style={styles.checkRow} hitSlop={6}>
            <View style={[styles.box, { borderColor: agreed ? theme.primary : theme.border, backgroundColor: agreed ? theme.primary : 'transparent' }]}>
              {agreed && <Ionicons name="checkmark" size={16} color={theme.primaryText} />}
            </View>
            <ThemedText type="small" style={styles.agreeText}>
              I've read and agree to the Community Guidelines and Terms of Service.
            </ThemedText>
          </Pressable>

          {error && (
            <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
              {error}
            </ThemedText>
          )}

          <BrutalButton label="AGREE & CONTINUE" variant="accent" onPress={accept} loading={busy} disabled={!agreed} />

          <Pressable onPress={() => supabase.auth.signOut()} style={styles.link} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Don't agree?{' '}
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Sign out →
              </ThemedText>
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  iconWrap: { width: 64, height: 64, borderRadius: Radius.lg, borderWidth: Border.widthThick, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: Spacing.two },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -Spacing.one },
  card: { gap: Spacing.two, borderWidth: Border.widthThick },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: 2 },
  cardIcon: { width: 28, height: 28, borderRadius: Radius.sm, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  bulletIcon: { marginTop: 1 },
  dot: { marginTop: 6, marginLeft: 5, marginRight: 4 },
  bulletText: { flex: 1, lineHeight: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  box: { width: 26, height: 26, borderRadius: Radius.sm, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  agreeText: { flex: 1, lineHeight: 19, fontWeight: '600' },
  link: { alignSelf: 'center', marginTop: Spacing.one },
});
