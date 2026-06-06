export type LevelBadge = { level: number; icon: string; title: string; color: string };
// `from` is the previous badge we morph OUT of; omit it for a first-ever level.
// `jump` = how many levels were gained at once (>1 → multi-level celebration).
export type LevelUpPayload = LevelBadge & { from?: LevelBadge; jump?: number };

// Tiny module-level pub/sub so a level-up detected anywhere is shown by the
// root overlay host — immune to screen unmounts / re-render churn.
let listener: ((p: LevelUpPayload) => void) | null = null;

export function onLevelUp(cb: (p: LevelUpPayload) => void) {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

export function emitLevelUp(payload: LevelUpPayload) {
  listener?.(payload);
}
