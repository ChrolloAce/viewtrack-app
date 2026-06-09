import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// payouts + its RPCs aren't in the generated types yet — cast around them.
const sb = supabase as unknown as { from: (t: string) => any };
// NOTE: must .bind — a bare `supabase.rpc` loses its `this` and throws inside supabase-js.
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

export type Payout = {
  id: string;
  profile_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

/** Admin: record a payment to a creator (fires a "you got paid" push). */
export async function recordPayout(profileId: string, amount: number, note?: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await rpc('record_payout', { p_profile: profileId, p_amount: amount, p_note: note ?? null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** One-shot fetch of a creator's payout history (for lazy/expanded views). */
export async function getPayouts(profileId: string): Promise<Payout[]> {
  const { data } = await sb.from('payouts').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
  return (data as Payout[]) ?? [];
}

let seq = 0;

/** A creator's own payout history + total paid, live. */
export function usePayouts(profileId: string | null) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profileId) return;
    const { data } = await sb.from('payouts').select('*').eq('profile_id', profileId).order('created_at', { ascending: false });
    setPayouts((data as Payout[]) ?? []);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    load();
    seq += 1;
    const ch = supabase
      .channel(`payouts:${profileId}:${seq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts', filter: `profile_id=eq.${profileId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profileId, load]);

  const totalPaid = payouts.reduce((s, p) => s + Number(p.amount), 0);
  return { payouts, totalPaid, loading, reload: load };
}

// ---- custom deals -------------------------------------------------------
export type Deal = { per_video: number; bonus_per: number; bonus_unit: number };
export const STANDARD_DEAL: Deal = { per_video: 15, bonus_per: 100, bonus_unit: 100000 };

export async function setDeal(profileId: string, perVideo: number, bonusPer: number, bonusUnit: number) {
  const { error } = await rpc('set_deal', { p_profile: profileId, p_per_video: perVideo, p_bonus_per: bonusPer, p_bonus_unit: Math.round(bonusUnit) });
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function clearDeal(profileId: string) {
  const { error } = await rpc('clear_deal', { p_profile: profileId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Fetch one creator's deal (null = standard). */
export async function fetchDeal(profileId: string): Promise<Deal | null> {
  const { data } = await sb.from('creator_deals').select('per_video, bonus_per, bonus_unit').eq('profile_id', profileId).maybeSingle();
  return data ? { per_video: Number(data.per_video), bonus_per: Number(data.bonus_per), bonus_unit: Number(data.bonus_unit) } : null;
}

/** Admin: custom deals keyed by profile id (only creators with a custom deal), live. */
export function useDeals() {
  const [deals, setDeals] = useState<Record<string, Deal>>({});
  const load = useCallback(async () => {
    const { data } = await sb.from('creator_deals').select('profile_id, per_video, bonus_per, bonus_unit');
    const m: Record<string, Deal> = {};
    for (const d of (data as any[]) ?? []) m[d.profile_id] = { per_video: Number(d.per_video), bonus_per: Number(d.bonus_per), bonus_unit: Number(d.bonus_unit) };
    setDeals(m);
  }, []);
  useEffect(() => {
    load();
    seq += 1;
    const ch = supabase
      .channel(`deals-all:${seq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creator_deals' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  return { deals, reload: load };
}

/** Admin: total paid to every creator, keyed by profile id, live. */
export function useAllPaid() {
  const [paid, setPaid] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const { data } = await sb.from('payouts').select('profile_id, amount');
    const m: Record<string, number> = {};
    for (const p of (data as { profile_id: string; amount: number }[]) ?? []) {
      m[p.profile_id] = (m[p.profile_id] ?? 0) + Number(p.amount);
    }
    setPaid(m);
  }, []);

  useEffect(() => {
    load();
    seq += 1;
    const ch = supabase
      .channel(`payouts-all:${seq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { paid, reload: load };
}
