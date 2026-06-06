import { Platform, useWindowDimensions } from 'react-native';

/** True on wide web, where the DesktopShell two-pane layout takes over. */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 900;
}
