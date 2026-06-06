import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

async function uploadData(
  userId: string,
  data: ArrayBuffer | Blob,
  ext: string,
  contentType: string,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, data, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}

function imageContentType(ext: string) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/** Pick one or more images from the library WITHOUT uploading (for staging). */
export async function pickImages(): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission is required.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.85,
  });
  if (result.canceled) return [];
  return result.assets.map((a) => a.uri);
}

/** Upload a local image uri (native or web blob/data uri). Returns public URL. */
export async function uploadLocalImage(userId: string, uri: string): Promise<string> {
  const ext = (uri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
  const buffer = await fetch(uri).then((r) => r.arrayBuffer());
  return uploadData(userId, buffer, ext, imageContentType(ext));
}

/** Upload a File from web drag-and-drop. Returns public URL. */
export async function uploadDroppedImage(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Only images can be dropped here.');
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
  return uploadData(userId, file, ext, file.type);
}

/** Upload a recorded audio file (local uri). Returns public URL. */
export async function uploadLocalAudio(userId: string, uri: string): Promise<string> {
  const ext = (uri.split('.').pop() ?? 'm4a').split('?')[0].toLowerCase();
  const contentType = ext === 'mp3' ? 'audio/mpeg' : ext === 'webm' ? 'audio/webm' : 'audio/mp4';
  const buffer = await fetch(uri).then((r) => r.arrayBuffer());
  return uploadData(userId, buffer, ext, contentType);
}
