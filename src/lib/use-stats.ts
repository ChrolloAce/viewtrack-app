import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { vtMe, type VtAccount, type VtVideo } from '@/lib/viewtrack';

// Bonus structure: $15 per video + $100 for every full 100k views (milestone).
export const PAYOUT_PER_VIDEO = 15;
export const VIEWS_BONUS = 100;
export const VIEWS_BONUS_PER = 100_000;

// Module-level cache so navigating between Stats and the breakdown is instant.
// Fresh (<TTL) cache is reused without re-hitting the API at all.
let statsCache: { accounts: VtAccount[]; videos: VtVideo[] } | null = null;
let cachedAt = 0;
const STATS_TTL = 90_000; // 90s

/** Stats for the current creator, driven by their linked ViewTrack accounts. */
export function useStats() {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [accounts, setAccounts] = useState<VtAccount[]>(statsCache?.accounts ?? []);
  const [videos, setVideos] = useState<VtVideo[]>(statsCache?.videos ?? []);
  const [loading, setLoading] = useState(!statsCache);

  useEffect(() => {
    if (!uid) return;
    // Reuse a fresh cache instantly — no network call.
    if (statsCache && Date.now() - cachedAt < STATS_TTL) {
      setAccounts(statsCache.accounts);
      setVideos(statsCache.videos);
      setLoading(false);
      return;
    }
    let active = true;
    if (!statsCache) setLoading(true);
    vtMe().then((me) => {
      if (!active) return;
      statsCache = me;
      cachedAt = Date.now();
      setAccounts(me.accounts);
      setVideos(me.videos);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  const totalFollowing = accounts.reduce((s, a) => s + (a.followerCount ?? 0), 0);
  const totalViews = accounts.reduce((s, a) => s + (a.totalViews ?? 0), 0);
  const totalVideos = accounts.reduce((s, a) => s + (a.totalVideos ?? 0), 0);

  const videosBonus = totalVideos * PAYOUT_PER_VIDEO;
  // $100 for every full 100k views a video gets — calculated per video.
  const viewsBonus = videos.reduce((s, v) => s + Math.floor((v.views ?? 0) / VIEWS_BONUS_PER) * VIEWS_BONUS, 0);
  const payout = videosBonus + viewsBonus;

  // How many bonus milestones were hit, and how many videos earned at least one.
  const bonusCount = videos.reduce((s, v) => s + Math.floor((v.views ?? 0) / VIEWS_BONUS_PER), 0);
  const bonusVideoCount = videos.filter((v) => (v.views ?? 0) >= VIEWS_BONUS_PER).length;

  // Weekly settlement: creators are paid each Sunday for the week prior. Earnings
  // from videos in the current period (since the last Sunday) land this coming
  // Sunday; everything before that is treated as already paid out.
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setHours(0, 0, 0, 0);
  periodStart.setDate(periodStart.getDate() - now.getDay()); // back to Sunday 00:00
  const nextPayoutDate = new Date(periodStart);
  nextPayoutDate.setDate(periodStart.getDate() + 7); // upcoming Sunday
  const periodStartTs = periodStart.getTime();

  const videoPay = (v: VtVideo) => PAYOUT_PER_VIDEO + Math.floor((v.views ?? 0) / VIEWS_BONUS_PER) * VIEWS_BONUS;

  // Videos earning toward the upcoming Sunday payout.
  const currentPeriodVideos = videos
    .filter((v) => v.uploadDate && new Date(v.uploadDate).getTime() >= periodStartTs)
    .sort((a, b) => b.views - a.views);
  const nextPayout = currentPeriodVideos.reduce((s, v) => s + videoPay(v), 0);
  const paidOut = Math.max(0, payout - nextPayout);

  // Settled weekly payments — group prior-period videos by their pay date (the
  // Sunday after the week they were posted). Most recent first.
  const sundayOf = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.getTime();
  };
  const logMap = new Map<number, { amount: number; count: number }>();
  videos.forEach((v) => {
    if (!v.uploadDate) return;
    const ts = new Date(v.uploadDate).getTime();
    if (ts >= periodStartTs) return; // unsettled current period
    const ps = sundayOf(ts);
    const e = logMap.get(ps) ?? { amount: 0, count: 0 };
    e.amount += videoPay(v);
    e.count += 1;
    logMap.set(ps, e);
  });
  const payoutLogs = [...logMap.entries()]
    .map(([ps, e]) => ({
      periodStart: new Date(ps),
      paidDate: new Date(ps + 7 * 86_400_000),
      amount: e.amount,
      videoCount: e.count,
    }))
    .sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime());

  return {
    paidOut,
    nextPayout,
    nextPayoutDate,
    currentPeriodVideos,
    payoutLogs,
    loading,
    accounts,
    videos,
    totalFollowing,
    totalViews,
    totalVideos,
    payout,
    videosBonus,
    viewsBonus,
    bonusCount,
    bonusVideoCount,
    perVideo: PAYOUT_PER_VIDEO,
    bonusPer: VIEWS_BONUS,
    bonusUnit: VIEWS_BONUS_PER,
    connected: accounts.length > 0,
  };
}
