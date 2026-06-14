import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalAvatar, BrutalButton, BrutalInput } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, session, refreshProfile } = useAuth();
  const uid = session?.user?.id ?? null;

  const [name, setName] = useState(profile?.full_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 1 && !!avatarUrl;

  async function pickPhoto() {
    if (!uid) return;
    setError(null);
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar(uid);
      if (url) {
        setAvatarUrl(url);
        await refreshProfile();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function finish() {
    if (!uid || !ready) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim() !== (profile?.full_name ?? '')) {
        await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', uid);
      }
      await refreshProfile();
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.inner}>
            <ThemedText style={styles.title}>set up your profile</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Add your name and a photo so the team knows who you are.
            </ThemedText>

            {/* Avatar (required) */}
            <Pressable onPress={pickPhoto} disabled={uploading} style={styles.avatarWrap}>
              <View style={[styles.avatarRing, { borderColor: avatarUrl ? theme.primary : theme.border }]}>
                <BrutalAvatar name={name || profile?.full_name} uri={avatarUrl} size={104} />
              </View>
              {uploading && (
                <View style={styles.avatarSpin}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={[styles.camChip, { backgroundColor: theme.primary, borderColor: theme.background }]}>
                <Ionicons name="camera" size={16} color={theme.primaryText} />
              </View>
            </Pressable>
            <ThemedText type="small" themeColor={avatarUrl ? 'success' : 'textSecondary'} style={styles.photoHint}>
              {avatarUrl ? 'looking good ✓' : 'tap to add a profile photo'}
            </ThemedText>

            {/* Name (required) */}
            <View style={styles.field}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                YOUR NAME
              </ThemedText>
              <BrutalInput placeholder="e.g. Ernesto Lopez" value={name} onChangeText={setName} autoCapitalize="words" />
            </View>

            {error && (
              <ThemedText type="small" themeColor="danger" style={{ textAlign: 'center' }}>
                {error}
              </ThemedText>
            )}

            <BrutalButton label="CONTINUE  →" onPress={finish} loading={busy} disabled={!ready} style={styles.continueBtn} />
            {!ready && (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Add a name and photo to continue.
              </ThemedText>
            )}
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
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -Spacing.two },
  avatarWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.two },
  avatarRing: { padding: 4, borderRadius: 70, borderWidth: 3 },
  avatarSpin: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 60, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  camChip: { position: 'absolute', bottom: 2, right: 6, width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  photoHint: { marginTop: -Spacing.one },
  field: { alignSelf: 'stretch', gap: Spacing.one + 2 },
  label: { letterSpacing: 1 },
  optHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  optPill: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: Radius.full, borderWidth: 1.5 },
  optPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  addText: { fontSize: 14, fontWeight: '800' },
  continueBtn: { alignSelf: 'stretch', minHeight: 60, marginTop: Spacing.three },
});
