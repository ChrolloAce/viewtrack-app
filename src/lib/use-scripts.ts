import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Script = Tables<'scripts'>;

let scriptsSeq = 0;

export function useScripts() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('scripts').select('*').order('scheduled_date');
    setScripts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) return;
    load();
    scriptsSeq += 1;
    const channel = supabase
      .channel(`scripts:${scriptsSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scripts' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return { scripts, loading, reload: load };
}
