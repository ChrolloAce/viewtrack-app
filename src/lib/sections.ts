import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// section tables aren't in the generated types — cast around them.
const sb = supabase as unknown as { from: (t: string) => any };

/** cta = the app-download pitch; outro = the closing engagement ask (comment/share). */
export type SectionKind = 'hook' | 'body' | 'cta' | 'outro';
export type SectionCluster = { id: string; kind: SectionKind; label: string; canonical: string; video_count: number };
/** video_id → cluster id per section kind */
export type VideoSectionMap = Record<string, Partial<Record<SectionKind, string>>>;

/**
 * Cluster data for the script-component filters (admin-only via RLS).
 * Rebuilt server-side by runSectionMatch().
 */
export function useSections() {
  const [clusters, setClusters] = useState<SectionCluster[]>([]);
  const [byVideo, setByVideo] = useState<VideoSectionMap>({});

  const load = useCallback(async () => {
    const [{ data: cl }, { data: vs }] = await Promise.all([
      sb.from('section_clusters').select('*').order('video_count', { ascending: false }),
      sb.from('video_sections').select('video_id, kind, cluster_id'),
    ]);
    setClusters((cl as SectionCluster[]) ?? []);
    const map: VideoSectionMap = {};
    ((vs as { video_id: string; kind: SectionKind; cluster_id: string }[] | null) ?? []).forEach((r) => {
      (map[r.video_id] ??= {})[r.kind] = r.cluster_id;
    });
    setByVideo(map);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { clusters, byVideo, reload: load };
}

/** Re-split every analyzed transcript into hook/body/cta and re-cluster. */
export async function runSectionMatch(): Promise<{ ok: boolean; videos?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vt-sections', { body: {} });
  if (error) return { ok: false, error: error.message };
  const d = data as { ok?: boolean; videos?: number; error?: string } | null;
  return d?.ok ? { ok: true, videos: d.videos } : { ok: false, error: d?.error ?? 'failed' };
}
