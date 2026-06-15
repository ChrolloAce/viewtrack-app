import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// blocks/reports + their RPCs aren't in the generated types yet — cast around them.
const sb = supabase as unknown as { from: (t: string) => any };
// NOTE: must .bind — a bare `supabase.rpc` loses its `this` and throws inside supabase-js.
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

/** Block a user. Passing the offending message context files a report too, so
 *  the developer is notified of the content (App Store 1.2 requirement). */
export async function blockUser(
  targetId: string,
  ctx?: { messageId?: string | null; conversationId?: string | null; excerpt?: string | null },
) {
  return rpc('block_user', {
    p_target: targetId,
    p_message: ctx?.messageId ?? null,
    p_conversation: ctx?.conversationId ?? null,
    p_excerpt: ctx?.excerpt ?? null,
  });
}
export async function unblockUser(targetId: string) {
  return rpc('unblock_user', { p_target: targetId });
}
export async function reportUser(targetId: string, messageId: string | null, conversationId: string | null, reason: string | null, excerpt: string | null) {
  return rpc('report_user', { p_target: targetId, p_message: messageId, p_conversation: conversationId, p_reason: reason, p_excerpt: excerpt });
}

let seq = 0;

/** The set of profile ids the current user has blocked, live. */
export function useBlocks() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await sb.from('blocks').select('blocked_id').eq('blocker_id', uid);
    setBlocked(new Set((data as { blocked_id: string }[] | null ?? []).map((b) => b.blocked_id)));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    load();
    seq += 1;
    const ch = supabase
      .channel(`blocks:${uid}:${seq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks', filter: `blocker_id=eq.${uid}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, load]);

  return { blocked, reload: load };
}
