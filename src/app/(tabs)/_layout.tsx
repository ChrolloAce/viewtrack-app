import { StyleSheet, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { DesktopShell } from '@/components/desktop-shell';
import { useIsDesktop } from '@/hooks/use-is-desktop';

export default function TabLayout() {
  // Wide web → WhatsApp-style two-pane desktop layout. The mobile navigator
  // stays mounted underneath (keeps expo-router happy) but its screens render
  // nothing when desktop is active; the shell covers everything.
  const wide = useIsDesktop();

  return (
    <>
      <AnimatedSplashOverlay />
      <AppTabs />
      {wide && (
        <View style={StyleSheet.absoluteFill}>
          <DesktopShell />
        </View>
      )}
    </>
  );
}
