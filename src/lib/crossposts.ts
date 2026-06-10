import { type VtVideo } from '@/lib/viewtrack';

const PAIR_WINDOW_MS = 72 * 3600 * 1000;

/**
 * Cross-post detection. Creators post the same video to every platform in the
 * same order (post 1, post 1, post 2, post 2, …), so per owner we sort each
 * platform's videos by upload date and sequence-align them: the k-th TikTok
 * post pairs with the k-th Instagram post, as long as their upload dates are
 * within 72h of each other (absorbs missed days / uneven counts).
 *
 * Returns video_id → all videos in its cross-post group (itself included).
 */
export function detectCrossPosts(videos: VtVideo[], ownerOf: (v: VtVideo) => string | null): Record<string, VtVideo[]> {
  const byOwner = new Map<string, Map<string, VtVideo[]>>();
  for (const v of videos) {
    const o = ownerOf(v);
    if (!o || !v.uploadDate) continue;
    const plats = byOwner.get(o) ?? new Map<string, VtVideo[]>();
    const arr = plats.get(v.platform) ?? [];
    arr.push(v);
    plats.set(v.platform, arr);
    byOwner.set(o, plats);
  }

  const ts = (v: VtVideo) => new Date(v.uploadDate!).getTime();
  const out: Record<string, VtVideo[]> = {};

  for (const plats of byOwner.values()) {
    const lists = [...plats.values()].map((l) => [...l].sort((a, b) => ts(a) - ts(b)));
    if (lists.length < 2) continue;
    // anchor = platform with the most posts; align every other platform onto it
    lists.sort((a, b) => b.length - a.length);
    const [anchor, ...rest] = lists;
    const groups: VtVideo[][] = anchor.map((v) => [v]);
    for (const list of rest) {
      let ai = 0;
      for (const v of list) {
        // slide to the nearest remaining anchor post (keeps the in-order pairing)
        while (ai < anchor.length - 1 && Math.abs(ts(anchor[ai + 1]) - ts(v)) <= Math.abs(ts(anchor[ai]) - ts(v))) ai++;
        if (ai < anchor.length && Math.abs(ts(anchor[ai]) - ts(v)) <= PAIR_WINDOW_MS) {
          groups[ai].push(v);
          ai++;
        }
      }
    }
    for (const g of groups) {
      if (g.length < 2) continue;
      for (const v of g) out[v.id] = g;
    }
  }
  return out;
}

/** Account key used to find a video's owner. */
export const acctKey = (v: VtVideo) => `${v.platform}:${(v.accountUsername ?? '').toLowerCase().replace(/^@/, '')}`;
