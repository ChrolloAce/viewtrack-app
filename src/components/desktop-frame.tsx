import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { DesktopRail, type Section } from '@/components/desktop-rail';
import { useTheme } from '@/hooks/use-theme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useAuth } from '@/lib/auth';
import { setPendingSection } from '@/lib/nav';

/** Wraps a standalone detail screen (creator profile, video, payout breakdown,
 *  …) so the persistent left rail shows on wide web instead of the content
 *  floating alone. On phones it renders the screen untouched. Tapping a rail
 *  item routes back to the shell and opens that section. */
export function DesktopFrame({ active = null, children }: { active?: Section | null; children: React.ReactNode }) {
  const wide = useIsDesktop();
  const theme = useTheme();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();

  if (!wide) return <>{children}</>;

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.background }}>
      <DesktopRail
        active={active}
        isAdmin={isAdmin}
        profile={profile}
        onSelect={(s) => {
          setPendingSection(s);
          router.replace('/chat');
        }}
      />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
