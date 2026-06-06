import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// push_tokens isn't in the generated types yet — cast around it.
const sb = supabase as unknown as { from: (t: string) => any };

// expo-notifications is a native module. It isn't in the JS-only/web bundle and
// won't exist until a native rebuild — so we lazy-require it and swallow any
// failure. Everything here is a graceful no-op until the app is rebuilt with
// the module + an EAS projectId + APNs/FCM credentials configured.
type Notif = typeof import('expo-notifications');
let cached: Notif | null | undefined;

function notif(): Notif | null {
  if (Platform.OS === 'web') return null;
  if (cached !== undefined) return cached;
  try {
    const N: Notif = require('expo-notifications');
    N.setNotificationHandler({
      handleNotification: async () =>
        ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }) as never,
    });
    cached = N;
  } catch {
    cached = null;
  }
  return cached;
}

function projectId(): string | null {
  const c = Constants as unknown as { expoConfig?: { extra?: { eas?: { projectId?: string } } }; easConfig?: { projectId?: string } };
  return c?.expoConfig?.extra?.eas?.projectId ?? c?.easConfig?.projectId ?? null;
}

/** Ask permission, get the Expo push token, and save it for this creator. */
export async function registerForPush(profileId: string) {
  const N = notif();
  if (!N) return;
  try {
    const Device = require('expo-device') as typeof import('expo-device');
    if (!Device.isDevice) return; // simulators have no push token

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: N.AndroidImportance.HIGH,
        sound: 'default',
      });
    }

    let status = (await N.getPermissionsAsync()).status;
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const pid = projectId();
    if (!pid) {
      console.warn('[push] no EAS projectId — run `eas init`, then rebuild, to enable push.');
      return;
    }

    const token = (await N.getExpoPushTokenAsync({ projectId: pid })).data;
    await sb.from('push_tokens')
      .upsert({ token, profile_id: profileId, platform: Platform.OS, updated_at: new Date().toISOString() } as never, { onConflict: 'token' });
  } catch (e) {
    console.warn('[push] register failed', e);
  }
}

/** Remove this device's token (call on sign out). */
export async function unregisterPush() {
  const N = notif();
  if (!N) return;
  try {
    const pid = projectId();
    if (!pid) return;
    const token = (await N.getExpoPushTokenAsync({ projectId: pid })).data;
    await sb.from('push_tokens').delete().eq('token', token);
  } catch {
    // ignore
  }
}

/** Mounted at the root: tapping a push opens the right conversation. */
export function usePushTapNavigation() {
  const router = useRouter();
  useEffect(() => {
    const N = notif();
    if (!N) return;
    const sub = N.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as { conversationId?: string; name?: string; type?: string };
      if (data?.conversationId) {
        router.push({ pathname: '/thread/[id]', params: { id: data.conversationId, name: data.name ?? '', type: data.type ?? '' } });
      }
    });
    return () => sub.remove();
  }, [router]);
}
