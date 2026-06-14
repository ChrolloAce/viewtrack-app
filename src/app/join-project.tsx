import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalButton, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** After an account exists (and the profile is set up), the user lands here to
 *  join a project with a code. Redeeming the code grants their role, and the
 *  route guard then drops them into the app. */
export default function JoinProjectScreen() {
  const theme = useTheme();
  const { refreshProfile, profile } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const first = (profile?.full_name ?? '').trim().split(' ')[0];

  async function join() {
    setError(null);
    setBusy(true);
    const { error: redeemError } = await supabase.rpc('redeem_code', { p_code: code.trim() });
    if (redeemError) {
      setBusy(false);
      setError(
        redeemError.message === 'invalid_code'
          ? 'That code is invalid or no longer active.'
          : redeemError.message,
      );
      return;
    }
    await refreshProfile();
    setBusy(false);
    // Route guard takes over once the role updates.
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.inner}>
            <Image source={require('../../assets/images/app-logo.png')} style={styles.logo} contentFit="contain" />

            <ThemedText style={styles.title}>join a project</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {first ? `Almost there, ${first}. ` : ''}Enter the code your team gave you to get in.
            </ThemedText>

            <View style={styles.form}>
              <BrutalInput
                placeholder="Project code"
                autoCapitalize="characters"
                autoCorrect={false}
                value={code}
                onChangeText={setCode}
              />

              {error && (
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              )}

              <BrutalButton label="JOIN PROJECT" variant="accent" onPress={join} loading={busy} disabled={!code.trim()} />
            </View>

            <Pressable onPress={() => supabase.auth.signOut()} style={styles.linkWrap} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Wrong account?{' '}
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Sign out →
                </ThemedText>
              </ThemedText>
            </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
    alignItems: 'center',
  },
  logo: { width: 96, height: 96, marginBottom: Spacing.two },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { textAlign: 'center' },
  form: { alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.two },
  linkWrap: { marginTop: Spacing.two },
});
