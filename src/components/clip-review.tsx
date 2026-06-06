import { StyleSheet, type ViewStyle } from 'react-native';

/** Plays back a just-recorded clip. `expo-video` is required lazily at render
 *  (not imported at module scope) so the teleprompter still loads on builds
 *  without the native module — the surrounding ErrorBoundary shows a fallback. */
export function ClipReview({ uri, style }: { uri: string; style?: ViewStyle }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useVideoPlayer, VideoView } = require('expo-video');
  const player = useVideoPlayer(uri, (p: { loop: boolean; play: () => void }) => {
    p.loop = true;
    p.play();
  });
  // `cover` fills the screen (no black letterbox bars); the recording is already full-frame.
  return <VideoView player={player} style={style ?? StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}
