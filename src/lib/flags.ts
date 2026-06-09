import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { type OverlayItem } from '@/lib/viewtrack';

// flag_requirements isn't in the generated types — cast around it.
const sb = supabase as unknown as { from: (t: string) => any };

export type FlagRequirement = { id: string; label: string; keywords: string[]; active: boolean; sort: number };
export type FlagResult = { req: FlagRequirement; passed: boolean; at?: string };

let flagsSeq = 0;

/**
 * Live list of checklist requirements (admin-only via RLS — creators get []
 * and therefore never see flags). Editing a requirement re-evaluates every
 * video on the spot since evaluation happens client-side.
 */
export function useFlagRequirements() {
  const [reqs, setReqs] = useState<FlagRequirement[]>([]);

  const load = useCallback(async () => {
    const { data } = await sb.from('flag_requirements').select('*').order('sort');
    setReqs((data as FlagRequirement[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    flagsSeq += 1;
    const ch = supabase
      .channel(`flag-reqs:${flagsSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flag_requirements' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { reqs, reload: load };
}

/** Check each active requirement against the video's detected overlays. */
export function evaluateFlags(overlays: OverlayItem[], reqs: FlagRequirement[]): FlagResult[] {
  return reqs
    .filter((r) => r.active)
    .map((req) => {
      const hit = overlays.find((o) => {
        const hay = `${o.type ?? ''} ${o.text ?? ''} ${o.description ?? ''}`.toLowerCase();
        return req.keywords.some((k) => k.trim() && hay.includes(k.trim().toLowerCase()));
      });
      return { req, passed: !!hit, at: hit?.timestamp };
    });
}

export const isFlagged = (results: FlagResult[]) => results.length > 0 && results.some((r) => !r.passed);

export async function saveRequirement(req: Partial<FlagRequirement> & { label: string; keywords: string[] }) {
  if (req.id) await sb.from('flag_requirements').update({ label: req.label, keywords: req.keywords, active: req.active ?? true }).eq('id', req.id);
  else await sb.from('flag_requirements').insert({ label: req.label, keywords: req.keywords, active: req.active ?? true, sort: req.sort ?? 99 });
}

export async function deleteRequirement(id: string) {
  await sb.from('flag_requirements').delete().eq('id', id);
}
