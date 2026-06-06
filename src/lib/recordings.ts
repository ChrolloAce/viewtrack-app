import { supabase } from '@/lib/supabase';

// recordings isn't in the generated types yet — cast around it.
const sb = supabase as unknown as { from: (t: string) => any };

export type Recording = {
  id: string;
  profile_id: string;
  script_id: string | null;
  title: string | null;
  url: string;
  storage_path: string | null;
  duration_seconds: number | null;
  created_at: string;
};

/** Upload a just-recorded clip to our backend storage + log it. Returns the URL. */
export async function uploadRecording(opts: {
  userId: string;
  uri: string;
  scriptId?: string | null;
  title?: string | null;
  durationSeconds?: number;
}): Promise<string> {
  const { userId, uri, scriptId, title, durationSeconds } = opts;
  const ext = (uri.split('.').pop() ?? 'mp4').split('?')[0].toLowerCase();
  const contentType = ext === 'mov' ? 'video/quicktime' : `video/${ext || 'mp4'}`;

  // Works on native (file://) and web (blob:) without base64 deps.
  const arraybuffer = await fetch(uri).then((r) => r.arrayBuffer());
  const path = `${userId}/${Date.now()}.${ext || 'mp4'}`;

  const { error: upErr } = await supabase.storage.from('recordings').upload(path, arraybuffer, { contentType, upsert: false });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('recordings').getPublicUrl(path);
  const url = data.publicUrl;

  await sb.from('recordings').insert({
    profile_id: userId,
    script_id: scriptId ?? null,
    title: title ?? null,
    url,
    storage_path: path,
    duration_seconds: durationSeconds ?? null,
  });
  return url;
}

/** All recordings a creator has made (admin or self, via RLS). Newest first. */
export async function listRecordings(profileId: string): Promise<Recording[]> {
  const { data } = await sb
    .from('recordings')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data as Recording[]) ?? [];
}
