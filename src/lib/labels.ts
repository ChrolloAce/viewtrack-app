import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

// labels/profile_labels aren't in the generated types yet — cast around them.
const sb = supabase as unknown as { from: (t: string) => any };

// unique channel suffixes — the same hook can mount in more than one panel at
// once, and supabase-js rejects two subscriptions to an identical topic name.
let labelSeq = 0;

export type Label = { id: string; name: string; color: string };

/** Brand-leaning palette offered when creating a new label. */
export const LABEL_COLORS = [
  '#FF6A00', // orange (brand)
  '#E11D48', // rose
  '#F59E0B', // amber
  '#16A34A', // green
  '#0EA5E9', // sky
  '#6366F1', // indigo
  '#A855F7', // purple
  '#64748B', // slate
];

export async function createLabel(name: string, color: string): Promise<Label | null> {
  const { data } = await sb.from('labels').insert({ name: name.trim(), color }).select('id, name, color').single();
  return (data as Label) ?? null;
}

export async function deleteLabel(id: string) {
  await sb.from('labels').delete().eq('id', id);
}

export async function assignLabel(profileId: string, labelId: string) {
  await sb.from('profile_labels').upsert({ profile_id: profileId, label_id: labelId }, { onConflict: 'profile_id,label_id' });
}

export async function unassignLabel(profileId: string, labelId: string) {
  await sb.from('profile_labels').delete().eq('profile_id', profileId).eq('label_id', labelId);
}

/** All labels in the workspace, live. Admin-only (RLS). */
export function useLabels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await sb.from('labels').select('id, name, color').order('name');
    setLabels((data as Label[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    labelSeq += 1;
    const ch = supabase
      .channel(`labels:${labelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labels' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { labels, loading, reload: load };
}

/** Map of profile id → the label ids applied to that person, live. */
export function useProfileLabels() {
  const [map, setMap] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const { data } = await sb.from('profile_labels').select('profile_id, label_id');
    const next: Record<string, string[]> = {};
    ((data as { profile_id: string; label_id: string }[] | null) ?? []).forEach((r) => {
      (next[r.profile_id] ??= []).push(r.label_id);
    });
    setMap(next);
  }, []);

  useEffect(() => {
    load();
    labelSeq += 1;
    const ch = supabase
      .channel(`profile-labels:${labelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_labels' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { map, reload: load };
}

/** Resolve a list of label ids to full Label objects, preserving label order. */
export function useResolvedLabels(labels: Label[], ids: string[] | undefined): Label[] {
  return useMemo(() => {
    if (!ids || ids.length === 0) return [];
    const set = new Set(ids);
    return labels.filter((l) => set.has(l.id));
  }, [labels, ids]);
}
