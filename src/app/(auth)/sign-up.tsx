import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalButton, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PENDING_CODE_KEY } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setError(null);
    setBusy(true);

    // Stash the code first so it's redeemed whenever the session appears
    // (immediately, or after email confirmation + first sign-in).
    await AsyncStorage.setItem(PENDING_CODE_KEY, code.trim());

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (signUpError) {
      setBusy(false);
      await AsyncStorage.removeItem(PENDING_CODE_KEY);
      setError(signUpError.message);
      return;
    }

    // Emails are auto-confirmed at the DB level, so if signUp didn't hand back a
    // session, just sign in with the same credentials.
    let session = data.session;
    if (!session) {
      const { data: si, error: siErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (siErr) {
        setBusy(false);
        await AsyncStorage.removeItem(PENDING_CODE_KEY);
        setError(siErr.message);
        return;
      }
      session = si.session;
    }

    // Redeem the invite code now so an invalid one surfaces here.
    const { error: redeemError } = await supabase.rpc('redeem_code', { p_code: code.trim() });
    setBusy(false);
    if (redeemError) {
      await AsyncStorage.removeItem(PENDING_CODE_KEY);
      setError(
        redeemError.message === 'invalid_code'
          ? 'That code is invalid or no longer active.'
          : redeemError.message,
      );
      return;
    }
    await AsyncStorage.removeItem(PENDING_CODE_KEY);
    // Route guard takes over once the profile role updates.
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

            <ThemedText style={styles.title}>join mtp</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Enter your invite code to get in.
            </ThemedText>

            <View style={styles.form}>
              <BrutalInput placeholder="Your name" value={name} onChangeText={setName} />
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
                autoComplete="new-password"
                value={password}
                onChangeText={setPassword}
              />
              <BrutalInput
                placeholder="Invite code"
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

              <BrutalButton
                label="JOIN"
                variant="accent"
                onPress={join}
                loading={busy}
                disabled={!name.trim() || !email.trim() || !password || !code.trim()}
              />
            </View>

            <Link href="/(auth)/sign-in" style={styles.linkWrap}>
              <ThemedText type="small" themeColor="textSecondary">
                Already have an account?{' '}
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Sign in →
                </ThemedText>
              </ThemedText>
            </Link>
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
  title: { fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { textAlign: 'center' },
  form: { alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.two },
  linkWrap: { marginTop: Spacing.two },
});
