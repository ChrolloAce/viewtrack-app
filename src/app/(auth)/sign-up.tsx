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
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create the account only — no project code here. The route guard walks them
  // through setting a photo, then joining a project with a code.
  async function create() {
    setError(null);
    setBusy(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (signUpError) {
      setBusy(false);
      setError(signUpError.message);
      return;
    }

    // Emails are auto-confirmed at the DB level, so if signUp didn't hand back a
    // session, just sign in with the same credentials.
    if (!data.session) {
      const { error: siErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (siErr) {
        setBusy(false);
        setError(siErr.message);
        return;
      }
    }
    setBusy(false);
    // Route guard takes over from here (profile setup → join a project).
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.inner}>
            <Image
              source={require('../../../assets/images/app-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />

            <ThemedText style={styles.title}>join viewtrack</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Create your account — you'll add your project code next.
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

              {error && (
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              )}

              <BrutalButton
                label="CREATE ACCOUNT"
                variant="accent"
                onPress={create}
                loading={busy}
                disabled={!name.trim() || !email.trim() || !password}
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
