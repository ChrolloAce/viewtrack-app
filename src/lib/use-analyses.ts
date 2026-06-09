import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { AnalysisStatus, OverlayItem } from '@/lib/viewtrack';

const sb = supabase as unknown as { from: (t: string) => any };

/** overlays is null when the analysis predates overlay detection (needs re-analyze). */
export type AnalysisState = { status: AnalysisStatus; flagged: boolean; overlays: OverlayItem[] | null };

let analysesSeq = 0;

/**
 * Live map of video_id → analysis state ('processing' | 'done' | 'error')
 * plus the detected overlays (for checklist/flag evaluation in the grid).
 * Drives the "Analyzed ✓" / "Analyzing…" / "Flagged" badges and updates the
 * instant a background analysis finishes (video_analyses is in the realtime
 * publication).
 */
export function useVideoAnalyses() {
  const [map, setMap] = useState<Record<string, AnalysisState>>({});

  const load = useCallback(async () => {
    const { data } = await sb.from('video_analyses').select('video_id, status, flagged, overlays:analysis->textOverlays');
    const next: Record<string, AnalysisState> = {};
    ((data as { video_id: string; status: AnalysisStatus | null; flagged: boolean; overlays: OverlayItem[] | null }[] | null) ?? []).forEach((r) => {
      next[r.video_id] = { status: r.status ?? 'done', flagged: !!r.flagged, overlays: Array.isArray(r.overlays) ? r.overlays : null };
    });
    setMap(next);
  }, []);

  useEffect(() => {
    load();
    analysesSeq += 1;
    const ch = supabase
      .channel(`video-analyses:${analysesSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'video_analyses' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { map, reload: load };
}
