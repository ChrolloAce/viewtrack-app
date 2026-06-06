import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalButton, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Establish the recovery session from the email link.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (active) {
          setReady(true);
          setChecking(false);
        }
        return;
      }
      if (code) {
        const { error: xErr } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (xErr) setError('This reset link is invalid or has expired — request a new one.');
        else setReady(true);
      } else {
        setError('Open this screen from the reset link in your email.');
      }
      if (active) setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [code]);

  async function save() {
    setError(null);
    if (pw.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (pw !== pw2) {
      setError('Passwords don’t match.');
      return;
    }
    setBusy(true);
    const { error: uErr } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (uErr) setError(uErr.message);
    else router.replace('/'); // recovery session is now a normal session
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Image source={require('../../assets/images/app-logo.png')} style={styles.logo} contentFit="contain" />
            <ThemedText style={styles.title}>set a new password</ThemedText>

            {checking ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.three }} />
            ) : ready ? (
              <View style={styles.form}>
                <BrutalInput placeholder="New password" secureTextEntry value={pw} onChangeText={setPw} autoComplete="new-password" />
                <BrutalInput placeholder="Confirm new password" secureTextEntry value={pw2} onChangeText={setPw2} autoComplete="new-password" />
                {error && (
                  <ThemedText type="small" themeColor="danger">
                    {error}
                  </ThemedText>
                )}
                <BrutalButton label="UPDATE PASSWORD" onPress={save} loading={busy} disabled={!pw || !pw2} />
              </View>
            ) : (
              <View style={styles.form}>
                <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
                  {error}
                </ThemedText>
                <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
                  <ThemedText type="smallBold" style={{ color: theme.primary, textAlign: 'center' }}>
                    Back to sign in
                  </ThemedText>
                </Pressable>
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
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  logo: { width: 88, height: 88, marginBottom: Spacing.two },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  form: { alignSelf: 'stretch', gap: Spacing.three, marginTop: Spacing.two },
});
