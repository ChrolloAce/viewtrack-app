import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { XpBar } from '@/components/xp-bar';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { badgeFor } from '@/lib/badges';
import { useProgress } from '@/lib/use-progress';

/** Identity card: avatar + level badge, name, level, and XP bar — all in one. */
export function ProfileBody() {
  const theme = useTheme();
  const { profile, refreshProfile } = useAuth();
  const { levelNum, current } = useProgress();
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const levelColor = current?.color ?? theme.primary;

  async function changePhoto() {
    if (!profile) return;
    setPhotoError(null);
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar(profile.id);
      if (url) await refreshProfile();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <BrutalCard style={styles.card}>
      <View style={styles.idRow}>
        <Pressable onPress={changePhoto} disabled={uploading} style={styles.avatarWrap}>
          <View style={[styles.avatarRing, { borderColor: levelColor }]}>
            <BrutalAvatar name={profile?.full_name} uri={profile?.avatar_url} size={64} />
          </View>
          {uploading && (
            <View style={styles.avatarSpinner}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <Image source={badgeFor(levelNum).source} style={styles.badgeOverlay} contentFit="contain" />
          <View style={[styles.camChip, { backgroundColor: theme.primary, borderColor: theme.card }]}>
            <Ionicons name="camera" size={11} color={theme.primaryText} />
          </View>
        </Pressable>

        <View style={styles.idText}>
          <ThemedText style={styles.name} numberOfLines={1}>
            {profile?.full_name || 'Your name'}
          </ThemedText>
          <ThemedText style={[styles.level, { color: levelColor }]} numberOfLines={1}>
            LEVEL {levelNum} · {current?.title ?? 'Rookie'}
          </ThemedText>
        </View>
      </View>

      {/* XP level bar — animates up, flashes "+N XP" on growth */}
      <XpBar color={levelColor} />

      {photoError && (
        <ThemedText type="small" themeColor="danger">
          {photoError}
        </ThemedText>
      )}
    </BrutalCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatarWrap: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { padding: 3, borderRadius: 50, borderWidth: 3 },
  avatarSpinner: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOverlay: { position: 'absolute', bottom: -4, right: -4, width: 38, height: 38 },
  camChip: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idText: { flex: 1, gap: 3 },
  name: { fontSize: 22, lineHeight: 27, fontWeight: '900' },
  level: { fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: 0.5 },
});
