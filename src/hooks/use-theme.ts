/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';

// MTP is a light-mode app (Prayerlock-style). Force light everywhere so the
// browser/OS dark preference never turns the UI dark.
export function useTheme() {
  return Colors.light;
}
