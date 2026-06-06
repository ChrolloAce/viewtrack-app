import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// `script_completions` isn't in the generated DB types yet — cast around it.
const sb = supabase as unknown as {
  from: (t: string) => any;
  channel: (n: string) => any;
  removeChannel: (c: unknown) => void;
};

let seq = 0;

/** Mark a script done (per creator) or clear it. */
export async function setScriptDone(scriptId: string, done: boolean, profileId: string) {
  if (done) {
    await sb.from('script_completions').upsert({ script_id: scriptId, profile_id: profileId });
  } else {
    await sb.from('script_completions').delete().eq('script_id', scriptId).eq('profile_id', profileId);
  }
}

/** Live set of script ids the current creator has marked done. */
export function useCompletions() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await sb.from('script_completions').select('script_id').eq('profile_id', uid);
    setDoneIds(new Set(((data ?? []) as { script_id: string }[]).map((r) => r.script_id)));
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    load();
    seq += 1;
    const channel = sb
      .channel(`completions:${seq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'script_completions', filter: `profile_id=eq.${uid}` },
        () => load(),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [uid, load]);

  return { doneIds, loading, reload: load };
}
