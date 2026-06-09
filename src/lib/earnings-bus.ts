// Fired when a creator returns and new view-bonus milestones ($100 / 100k views)
// have landed since they last opened the app.
export type EarningsPayload = {
  earned: number; // dollars earned from the new bonuses
  newBonuses: number; // how many 100k-view milestones were newly hit
  total: number; // their new lifetime total payout
};

let listener: ((p: EarningsPayload) => void) | null = null;

export function onEarnings(cb: (p: EarningsPayload) => void) {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

export function emitEarnings(payload: EarningsPayload) {
  listener?.(payload);
}
