import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { emitLevelUp, type LevelBadge } from '@/lib/level-up-bus';
import { supabase } from '@/lib/supabase';

const seenKey = (uid: string) => `level.lastSeen.${uid}`;

export type Level = Tables<'levels'>;
export type Progress = Tables<'creator_progress'>;

let progressSeq = 0;

export function useProgress() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [levels, setLevels] = useState<Level[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const levelRef = useRef<number | null>(null);
  const levelsRef = useRef<Level[]>([]);
  const lastEmittedRef = useRef(0);
  const checkedRef = useRef(false);

  useEffect(() => {
    supabase
      .from('levels')
      .select('*')
      .order('level')
      .then(({ data }) => {
        setLevels(data ?? []);
        levelsRef.current = data ?? [];
      });
  }, []);

  // Reset per-user dedupe state when the signed-in user changes.
  useEffect(() => {
    checkedRef.current = false;
    lastEmittedRef.current = 0;
  }, [userId]);

  // Fire the level-up celebration for a fromLevel → toLevel climb (any size).
  const celebrate = useCallback(
    (fromLv: number, toLv: number) => {
      if (toLv <= fromLv || toLv <= lastEmittedRef.current) return;
      const to = levelsRef.current.find((l) => l.level === toLv);
      if (!to) return;
      lastEmittedRef.current = toLv;
      const fromL = levelsRef.current.find((l) => l.level === fromLv);
      const from: LevelBadge | undefined = fromL
        ? { level: fromL.level, icon: fromL.icon, title: fromL.title, color: fromL.color }
        : undefined;
      emitLevelUp({ level: to.level, icon: to.icon, title: to.title, color: to.color, from, jump: toLv - fromLv });
      if (userId) AsyncStorage.setItem(seenKey(userId), String(toLv));
    },
    [userId],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('creator_progress')
      .select('*')
      .eq('profile_id', userId)
      .maybeSingle();
    setProgress(data);
    if (data) levelRef.current = data.level;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      setLoading(true);
      await load();
      if (active) setLoading(false);
    })();

    progressSeq += 1;
    const channel = supabase
      .channel(`progress:${userId}:${progressSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_progress', filter: `profile_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as Progress;
          const prev = levelRef.current;
          setProgress(next);
          levelRef.current = next.level;
          if (prev != null) celebrate(prev, next.level);
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId, load, celebrate]);

  // On open: if XP synced while the app was closed and you leveled up (even
  // many levels), replay the celebration from where you last left off.
  useEffect(() => {
    if (!userId || !progress || levels.length === 0 || checkedRef.current) return;
    checkedRef.current = true;
    const cur = progress.level;
    AsyncStorage.getItem(seenKey(userId)).then((raw) => {
      const seen = raw != null ? parseInt(raw, 10) : null;
      if (seen != null && cur > seen) {
        celebrate(seen, cur);
      } else {
        lastEmittedRef.current = Math.max(lastEmittedRef.current, cur);
        AsyncStorage.setItem(seenKey(userId), String(cur));
      }
    });
  }, [userId, progress, levels, celebrate]);

  const xp = progress?.xp ?? 0;
  const levelNum = progress?.level ?? 1;
  const current = levels.find((l) => l.level === levelNum) ?? levels[0] ?? null;
  const next = levels.find((l) => l.level === levelNum + 1) ?? null;
  const floor = current?.xp_required ?? 0;
  const ceil = next?.xp_required ?? floor;
  // Full (1) only at genuine max level; empty (0) while levels are still loading
  // (no `current` yet) so the bar never flashes falsely full.
  const pct = next ? Math.max(0, Math.min(1, (xp - floor) / Math.max(1, ceil - floor))) : current ? 1 : 0;
  const xpToNext = next ? Math.max(0, ceil - xp) : 0;

  return { loading, levels, progress, xp, levelNum, current, next, pct, xpToNext };
}
