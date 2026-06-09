import { supabase } from '@/lib/supabase';

export type PlLink = {
  linkId: string;
  creatorId?: string;
  creatorName?: string;
  platform?: string; // ios | android
  shortCode?: string;
  shortUrl?: string;
  originalUrl?: string;
  totalClicks?: number;
  uniqueClicks?: number;
  last7DaysClicks?: number;
  updatedAt?: string;
};

export type Snapshot = { linkId: string; ts: string; totalClicks?: number; uniqueClicks?: number; [k: string]: unknown };

export type AbVariant = { exposure: number; conversion: number; platforms: Record<string, { exposure: number; conversion: number }> };
export type AbResult = { experimentId: string; variants: Record<string, AbVariant>; totalEvents: number };

export type PlCreator = {
  creatorId?: string;
  creatorName?: string;
  slug: string;
  totalClicks: number;
  uniqueClicks: number;
  platforms: Record<string, number>;
  periodClicks: number;
  periodPlatforms: Record<string, number>;
  linkIds: string[];
};
export type LinkSeries = { platform?: string; totalClicks: number; uniqueClicks: number; snaps: { ts: string; v: number; u?: number }[] };
export type CountryStat = { code: string; name: string; count: number };
/** Landing-page traffic for one day: page views (visits), CTA taps (conversions),
 *  referrer-source split, and country split. Distinct from redirect clicks. */
export type EventDay = { visits: number; conversions: number; refs: Record<string, number>; ctys: Record<string, number> };
export type CreatorDetail = {
  slug: string;
  linkSeries: LinkSeries[];
  eventDays: Record<string, EventDay>;
  countryNames: Record<string, string>;
  referrers: Record<string, number>;
  variants: Record<string, { exposure: number; conversion: number }>;
  countries: CountryStat[];
};

/** Creators grouped from their links; days>0 adds period clicks (from snapshots). */
export async function plCreators(days = 0): Promise<PlCreator[]> {
  const { data } = await supabase.functions.invoke('prayerlock', { body: { action: 'creators', days } });
  return (data as { creators?: PlCreator[] } | null)?.creators ?? [];
}

/** Full per-creator click analytics: time-series, referrers, countries, A/B. */
export async function plCreatorDetail(creatorId: string): Promise<CreatorDetail | null> {
  const { data } = await supabase.functions.invoke('prayerlock', { body: { action: 'creator-detail', creatorId } });
  return (data as CreatorDetail | null) ?? null;
}

/** All tracked bio links with their click totals. */
export async function plLinks(): Promise<PlLink[]> {
  const { data } = await supabase.functions.invoke('prayerlock', { body: { action: 'links' } });
  return (data as { links?: PlLink[] } | null)?.links ?? [];
}

/** Hourly click snapshots for one link (time-series). */
export async function plSnapshots(linkId: string): Promise<Snapshot[]> {
  const { data } = await supabase.functions.invoke('prayerlock', { body: { action: 'snapshots', linkId } });
  return (data as { snapshots?: Snapshot[] } | null)?.snapshots ?? [];
}

/** Aggregated A/B results for an experiment (default cta_banner_v1). */
export async function plAb(experimentId?: string): Promise<AbResult | null> {
  const { data } = await supabase.functions.invoke('prayerlock', { body: { action: 'ab', experimentId } });
  return (data as AbResult | null) ?? null;
}
