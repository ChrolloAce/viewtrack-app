import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalButton, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

// DEV-ONLY quick logins so previews don't need typing. Remove before prod.
const DEV_ACCOUNTS = [
  { label: 'Dev: creator', email: 'demo.customer@mtp.app' },
  { label: 'Dev: admin', email: 'demo.support@mtp.app' },
];
const DEV_PASSWORD = 'mtp-demo-1234';

export default function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  async function sendReset() {
    setError(null);
    setResetMsg(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password".');
      return;
    }
    const redirectTo = Linking.createURL('/reset-password');
    const { error: rErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (rErr) setError(rErr.message);
    else setResetMsg('Check your email for a link to reset your password.');
  }

  async function signIn(withEmail = email, withPassword = password) {
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: withEmail.trim(),
      password: withPassword,
    });
    setBusy(false);
    if (signInError) setError(signInError.message);
    // On success the auth listener + route guard navigate us in.
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Image
              source={require('../../../assets/images/app-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />

            <ThemedText style={styles.title}>welcome back</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Sign in to your MTP account.
            </ThemedText>

            <View style={styles.form}>
              <BrutalInput
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <BrutalInput
                placeholder="Password"
                secureTextEntry
                autoComplete="current-password"
                value={password}
                onChangeText={setPassword}
              />

              {error && (
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              )}
              {resetMsg && (
                <ThemedText type="small" themeColor="success">
                  {resetMsg}
                </ThemedText>
              )}

              <Pressable onPress={sendReset} style={styles.forgot} hitSlop={8}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Forgot password?
                </ThemedText>
              </Pressable>

              <BrutalButton
                label="SIGN IN"
                onPress={() => signIn()}
                loading={busy}
                disabled={!email.trim() || !password}
              />
            </View>

            <Link href="/(auth)/sign-up" style={styles.linkWrap}>
              <ThemedText type="small" themeColor="textSecondary">
                Have a code?{' '}
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Join with a code →
                </ThemedText>
              </ThemedText>
            </Link>

            {__DEV__ && (
              <View style={[styles.devBox, { borderColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.devLabel}>
                  DEV QUICK LOGIN
                </ThemedText>
                <View style={styles.devRow}>
                  {DEV_ACCOUNTS.map((a) => (
                    <BrutalButton
                      key={a.email}
                      label={a.label}
                      variant="neutral"
                      style={styles.devButton}
                      onPress={() => signIn(a.email, DEV_PASSWORD)}
                    />
                  ))}
                </View>
              </View>
            )}
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
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  logo: { width: 96, height: 96, marginBottom: Spacing.two },
  forgot: { alignSelf: 'flex-end', marginTop: -Spacing.one },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { textAlign: 'center' },
  form: { alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.two },
  linkWrap: { marginTop: Spacing.two },
  devBox: {
    alignSelf: 'stretch',
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderWidth: Border.width,
    borderRadius: Radius.md,
    borderStyle: 'dashed',
    gap: Spacing.two,
  },
  devLabel: { letterSpacing: 1 },
  devRow: { flexDirection: 'row', gap: Spacing.two },
  devButton: { flex: 1 },
});
