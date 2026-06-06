// Thin wrapper around expo-haptics that NEVER throws — if the native module
// isn't in the current dev build yet, calls are silently no-ops (the on-screen
// animation still plays; haptics light up after the next native rebuild).
//
// Every access is guarded: a missing native module can throw *synchronously*
// (not just reject), so we wrap the whole call, not only the returned promise.
import * as Haptics from 'expo-haptics';

type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

function run(fn: () => unknown) {
  try {
    const p = fn();
    if (p && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(() => {});
    }
  } catch {
    // native module absent / unavailable — ignore
  }
}

export function impact(style: Impact = 'medium') {
  run(() => {
    const S = Haptics.ImpactFeedbackStyle;
    const map: Record<Impact, Haptics.ImpactFeedbackStyle> = {
      light: S.Light,
      medium: S.Medium,
      heavy: S.Heavy,
      rigid: S.Rigid,
      soft: S.Soft,
    };
    return Haptics.impactAsync(map[style]);
  });
}

export function success() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function selection() {
  run(() => Haptics.selectionAsync());
}
