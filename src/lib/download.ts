import { Platform } from 'react-native';

export type DownloadResult = 'saved' | 'opened' | 'error';

function guessExt(url: string, mime?: string | null) {
  if (mime?.includes('quicktime')) return 'mov';
  if (mime?.startsWith('video')) return 'mp4';
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpg';
  const m = url.split('?')[0].match(/\.([a-z0-9]{3,4})$/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

/**
 * Save a remote photo/video into the device camera roll. Native modules are
 * required lazily so this file is safe to import in the (static) web bundle.
 * Falls back to opening the URL if the file-system module isn't in the build
 * yet (i.e. before the next native rebuild) or the asset isn't media.
 */
export async function downloadToDevice(url: string, mime?: string | null): Promise<DownloadResult> {
  if (!url) return 'error';

  // Web: let the browser handle the download.
  if (Platform.OS === 'web') {
    try {
      (globalThis as { open?: (u: string, t?: string) => void }).open?.(url, '_blank');
    } catch {
      /* ignore */
    }
    return 'opened';
  }

  const isMedia = !!mime && (mime.startsWith('image') || mime.startsWith('video'));
  const openUrl = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native').Linking.openURL(url);
    } catch {
      /* ignore */
    }
    return 'opened' as const;
  };

  // Non-media (docs, etc.) — just open it.
  if (!isMedia) return openUrl();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MediaLibrary = require('expo-media-library/legacy');
    if (!FileSystem?.downloadAsync) return openUrl();

    const dest = `${FileSystem.cacheDirectory}mtp_${Date.now()}.${guessExt(url, mime)}`;
    const { uri } = await FileSystem.downloadAsync(url, dest);

    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return 'error';
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    // file-system not in the current build yet → fall back to opening
    return openUrl();
  }
}
