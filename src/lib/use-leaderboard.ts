import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { vtLeaderboard, type LeaderboardEntry } from '@/lib/viewtrack';

// Module cache so re-entering the tab is instant.
let cache: LeaderboardEntry[] | null = null;
let cachedAt = 0;
const TTL = 120_000; // 2 min

/** Ranked top video per creator (up to 10). */
export function useLeaderboard() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [entries, setEntries] = useState<LeaderboardEntry[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (!uid) return;
    if (cache && Date.now() - cachedAt < TTL) {
      setEntries(cache);
      setLoading(false);
      return;
    }
    let active = true;
    if (!cache) setLoading(true);
    vtLeaderboard().then((e) => {
      if (!active) return;
      cache = e;
      cachedAt = Date.now();
      setEntries(e);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  return { entries, loading };
}
