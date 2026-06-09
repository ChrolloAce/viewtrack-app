import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth';
import { emitEarnings } from '@/lib/earnings-bus';
import { useStats } from '@/lib/use-stats';

const key = (uid: string) => `earnings.lastSeen.${uid}`;

/**
 * Watches the creator's view-bonus milestones. When they return and new
 * $100/100k-view bonuses have landed since they last opened the app, fires the
 * money celebration. Mounted once at the app root.
 */
export function useEarningsWatch() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { loading, connected, bonusCount, payout, bonusPer } = useStats();
  const checkedRef = useRef(false);

  useEffect(() => {
    checkedRef.current = false;
  }, [uid]);

  useEffect(() => {
    if (!uid || loading || !connected || checkedRef.current) return;
    checkedRef.current = true;
    AsyncStorage.getItem(key(uid)).then((raw) => {
      const save = () => AsyncStorage.setItem(key(uid), JSON.stringify({ bonusCount, payout }));
      if (!raw) {
        save(); // first run — establish a baseline, don't celebrate retroactively
        return;
      }
      let prev = 0;
      try {
        prev = (JSON.parse(raw) as { bonusCount: number }).bonusCount ?? 0;
      } catch {
        save();
        return;
      }
      const newBonuses = bonusCount - prev;
      if (newBonuses > 0) {
        emitEarnings({ earned: newBonuses * bonusPer, newBonuses, total: payout });
      }
      save();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, loading, connected, bonusCount]);
}
