import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { LevelUpHost } from '@/components/level-up-overlay';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForPush, usePushTapNavigation } from '@/lib/push';
import { supabase } from '@/lib/supabase';

function RootNavigator() {
  const { session, loading, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const kicked = useRef(false);

  // Tapping a push notification opens the conversation.
  usePushTapNavigation();

  // Register this device for push once signed in.
  useEffect(() => {
    if (session?.user?.id) registerForPush(session.user.id);
  }, [session?.user?.id]);

  // Access revoked by an admin → sign out with a notice.
  useEffect(() => {
    if (session && (profile as { disabled?: boolean } | null)?.disabled && !kicked.current) {
      kicked.current = true;
      Alert.alert('Access removed', 'Your access to the platform has been removed by an admin.');
      supabase.auth.signOut();
    }
  }, [session, profile]);

  // A creator must set a name + photo before using the app.
  const needsOnboarding =
    !!session &&
    !!profile &&
    (profile as { role?: string }).role === 'creator' &&
    (!(profile.full_name ?? '').trim() || !profile.avatar_url);

  // Route guard: signed-out users go to auth; signed-in users never sit on an
  // auth screen; creators with an incomplete profile are held at onboarding.
  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = segments[0] === 'onboarding';
    const onReset = segments[0] === 'reset-password';
    if (!session && !inAuthGroup && !onReset) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/');
    } else if (session && needsOnboarding && !onOnboarding) {
      router.replace('/onboarding');
    } else if (session && !needsOnboarding && onOnboarding) {
      router.replace('/');
    }
  }, [session, loading, segments, router, needsOnboarding]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.light.background,
        }}>
        <ActivityIndicator color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={DefaultTheme}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="reset-password" />
          <Stack.Screen name="thread/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="new-channel" options={{ presentation: 'modal' }} />
          <Stack.Screen name="channel-members" options={{ presentation: 'card' }} />
          <Stack.Screen name="settings" options={{ presentation: 'card' }} />
          <Stack.Screen name="my-accounts" options={{ presentation: 'card' }} />
          <Stack.Screen name="payout-breakdown" options={{ presentation: 'card' }} />
          <Stack.Screen name="levels" options={{ presentation: 'card' }} />
          <Stack.Screen name="video/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="day/[date]" options={{ presentation: 'card' }} />
          <Stack.Screen name="manage-creators" options={{ presentation: 'card' }} />
          <Stack.Screen name="creator/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="link-requests" options={{ presentation: 'card' }} />
          <Stack.Screen name="brief/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="teleprompter/[id]" options={{ presentation: 'fullScreenModal' }} />
        </Stack>
        <LevelUpHost />
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
