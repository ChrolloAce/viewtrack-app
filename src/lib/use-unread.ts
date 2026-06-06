import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

let unreadSeq = 0;

/** Live map of conversation_id → unread message count for the current user. */
export function useUnread() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [map, setMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('unread_counts');
    const next: Record<string, number> = {};
    (data ?? []).forEach((r) => {
      next[r.conversation_id] = Number(r.unread);
    });
    setMap(next);
  }, []);

  useEffect(() => {
    if (!userId) return;
    load();
    unreadSeq += 1;
    const channel = supabase
      .channel(`unread:${unreadSeq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_reads', filter: `profile_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return { map, total, reload: load };
}
