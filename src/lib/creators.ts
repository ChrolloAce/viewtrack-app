import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

const sb = supabase as unknown as { from: (t: string) => any };

export type PendingCreator = {
  id: string;
  full_name: string;
  invite_code: string;
  claimed_by: string | null;
  /** the real profile created at invite time — accounts/stats attach to it; merged on claim */
  shadow_profile_id: string | null;
  created_at: string;
};

/**
 * Admin: add a creator manually → creates a real (shadow) profile right away
 * so accounts, videos and activity work before they claim, and returns the
 * invite code to share. Claiming merges the shadow into their account.
 */
export async function addPendingCreator(name: string): Promise<{ code?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'add-creator', name } });
  if (error) return { error: error.message };
  const d = data as { ok?: boolean; code?: string; error?: string } | null;
  return d?.ok ? { code: d.code } : { error: d?.error ?? 'failed' };
}

export async function deletePendingCreator(id: string) {
  await sb.from('pending_creators').delete().eq('id', id);
}

/** Admin: unclaimed manual creators, live. */
export function usePendingCreators() {
  const [pending, setPending] = useState<PendingCreator[]>([]);
  const load = useCallback(async () => {
    const { data } = await sb.from('pending_creators').select('*').is('claimed_by', null).order('created_at', { ascending: false });
    setPending((data as PendingCreator[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase
      .channel('pending-creators')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_creators' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  return { pending, reload: load };
}
