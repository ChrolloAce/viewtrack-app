import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Radius } from '@/constants/theme';

const MAX_W = 232;

/** A sent image that keeps its aspect ratio and opens full-screen on tap. */
export function ChatImage({ uri, onPress }: { uri: string; onPress: () => void }) {
  const [height, setHeight] = useState(MAX_W);

  return (
    <Pressable onPress={onPress}>
      <Image
        source={{ uri }}
        style={{
          width: MAX_W,
          height,
          borderRadius: Radius.md,
          backgroundColor: 'rgba(0,0,0,0.06)',
        }}
        contentFit="cover"
        transition={150}
        onLoad={(e) => {
          const w = e.source?.width ?? 1;
          const h = e.source?.height ?? 1;
          setHeight(Math.min(320, Math.max(140, Math.round((MAX_W * h) / w))));
        }}
      />
    </Pressable>
  );
}
