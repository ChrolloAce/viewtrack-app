import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BrutalAvatar, BrutalCard } from '@/components/brutal';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clearDeal, getPayouts, recordPayout, setDeal, STANDARD_DEAL, useAllPaid, useDeals, type Deal, type Payout } from '@/lib/payouts';
import { supabase } from '@/lib/supabase';
import { vtCreator, vtCreatorActivity, type CreatorActivity, type VtVideo } from '@/lib/viewtrack';

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Row = { c: Profile; earned: number; paid: number; owed: number; deal: Deal | null };

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`);

export function PayoutsAdmin() {
  const theme = useTheme();
  const [creators, setCreators] = useState<Profile[]>([]);
  const [activity, setActivity] = useState<Record<string, CreatorActivity>>({});
  const { paid } = useAllPaid();
  const { deals } = useDeals();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payReq, setPayReq] = useState<{ rows: Row[]; single: boolean } | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, avatar_url').eq('role', 'creator').order('full_name').then(({ data }) => setCreators((data as Profile[]) ?? []));
    vtCreatorActivity().then((a) => {
      setActivity(a);
      setLoading(false);
    });
  }, []);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creators
      .map((c) => {
        const earned = activity[c.id]?.earnings ?? 0;
        const p = paid[c.id] ?? 0;
        return { c, earned, paid: p, owed: Math.max(0, earned - p), deal: deals[c.id] ?? null };
      })
      .filter((r) => !q || (r.c.full_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.owed - a.owed);
  }, [creators, activity, paid, deals, query]);

  const totalOwed = rows.reduce((s, r) => s + r.owed, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const payable = rows.filter((r) => r.owed > 0);
  const selectedRows = rows.filter((r) => selected.has(r.c.id) && r.owed > 0);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = payable.length > 0 && payable.every((r) => selected.has(r.c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(payable.map((r) => r.c.id)));

  async function doPay(targets: { id: string; amount: number }[], note: string) {
    if (targets.length === 0 || busy) return;
    setBusy(true);
    for (const t of targets) if (t.amount > 0) await recordPayout(t.id, t.amount, note || 'Payout');
    setBusy(false);
    setSelected(new Set());
    setPayReq(null);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <ThemedText style={styles.title}>Payouts</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          what every creator has earned, been paid, and is owed
        </ThemedText>
      </View>

      {/* totals */}
      <View style={styles.totals}>
        <BrutalCard style={[styles.totalCard, { backgroundColor: theme.primary, borderColor: theme.border }]} shadow={4}>
          <ThemedText style={styles.totalLabel}>OUTSTANDING · OWED</ThemedText>
          <ThemedText style={styles.totalValue}>{money(totalOwed)}</ThemedText>
          <ThemedText style={styles.totalSub}>{payable.length} creators awaiting payment</ThemedText>
        </BrutalCard>
        <BrutalCard style={[styles.totalCard, { backgroundColor: theme.success, borderColor: theme.border }]} shadow={4}>
          <ThemedText style={styles.totalLabel}>PAID OUT · ALL TIME</ThemedText>
          <ThemedText style={styles.totalValue}>{money(totalPaid)}</ThemedText>
          <ThemedText style={styles.totalSub}>across all creators</ThemedText>
        </BrutalCard>
      </View>

      {/* search + batch bar */}
      <View style={styles.bar}>
        <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search creators"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
        <Pressable onPress={toggleAll} style={styles.selectAll}>
          <View style={[styles.box, allSelected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            {allSelected && <Ionicons name="checkmark" size={13} color={theme.primaryText} />}
          </View>
          <ThemedText type="smallBold">All owed</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setPayReq({ rows: selectedRows, single: false })}
          disabled={selectedRows.length === 0 || busy}
          style={({ pressed }) => [
            styles.payBtn,
            { backgroundColor: selectedRows.length > 0 ? theme.primary : theme.backgroundElement, borderColor: theme.border },
            selectedRows.length > 0 && brutalShadow(theme.shadow, 4),
            pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
          ]}>
          <Ionicons name="cash" size={17} color={selectedRows.length > 0 ? theme.primaryText : theme.textSecondary} />
          <ThemedText style={[styles.payBtnText, { color: selectedRows.length > 0 ? theme.primaryText : theme.textSecondary }]}>
            Pay {selectedRows.length || ''} · {money(selectedRows.reduce((s, r) => s + r.owed, 0))}
          </ThemedText>
        </Pressable>
      </View>

      {/* rows */}
      {loading ? (
        <View style={{ gap: Spacing.two }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={66} radius={Radius.lg} />
          ))}
        </View>
      ) : rows.length === 0 ? (
        <BrutalCard style={styles.empty}>
          <Ionicons name="people-outline" size={28} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {query ? 'No creators match that search.' : 'No creators yet.'}
          </ThemedText>
        </BrutalCard>
      ) : (
        <View style={{ gap: Spacing.two }}>
          {rows.map((r) => (
            <CreatorRow
              key={r.c.id}
              row={r}
              selected={selected.has(r.c.id)}
              expanded={expanded === r.c.id}
              onToggleSelect={() => r.owed > 0 && toggle(r.c.id)}
              onToggleExpand={() => setExpanded(expanded === r.c.id ? null : r.c.id)}
              onPay={() => setPayReq({ rows: [r], single: true })}
            />
          ))}
        </View>
      )}

      {payReq && <PayModal payReq={payReq} busy={busy} onCancel={() => setPayReq(null)} onConfirm={doPay} />}
    </ScrollView>
  );
}

// ---- one creator row (expandable) --------------------------------------
function CreatorRow({
  row,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onPay,
}: {
  row: Row;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onPay: () => void;
}) {
  const theme = useTheme();
  const { c, earned, paid, owed, deal } = row;
  const canPay = owed > 0;
  const effDeal = deal ?? STANDARD_DEAL;

  return (
    <View style={[styles.rowCard, { backgroundColor: theme.card, borderColor: selected ? theme.primary : theme.border }, selected && brutalShadow(theme.shadow, 3)]}>
      <View style={styles.rowMain}>
        <Pressable onPress={onToggleSelect} disabled={!canPay} style={styles.checkHit}>
          <View style={[styles.box, !canPay && { opacity: 0.3 }, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            {selected && <Ionicons name="checkmark" size={13} color={theme.primaryText} />}
          </View>
        </Pressable>
        <BrutalAvatar name={c.full_name} uri={c.avatar_url} size={40} />
        <Pressable onPress={onToggleExpand} style={styles.nameCol}>
          <View style={styles.nameRow}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {c.full_name || 'Creator'}
            </ThemedText>
            {deal && (
              <View style={[styles.dealChip, { backgroundColor: theme.accent }]}>
                <ThemedText style={styles.dealChipText}>CUSTOM</ThemedText>
              </View>
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {money(earned)} earned · {money(paid)} paid
          </ThemedText>
        </Pressable>
        <Pressable onPress={onToggleExpand} style={styles.owedCol}>
          <ThemedText style={[styles.owedVal, { color: canPay ? theme.primary : theme.textSecondary }]}>{money(owed)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            owed
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onPay}
          disabled={!canPay}
          style={({ pressed }) => [
            styles.rowPay,
            { borderColor: canPay ? theme.border : 'transparent', backgroundColor: canPay ? theme.card : 'transparent' },
            canPay && brutalShadow(theme.shadow, 2),
            pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
          ]}>
          <ThemedText style={[styles.rowPayText, { color: canPay ? theme.text : theme.textSecondary }]}>{canPay ? 'Pay' : 'Settled'}</ThemedText>
        </Pressable>
        <Pressable onPress={onToggleExpand} style={styles.expandBtn}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {expanded && <ExpandedDetail profileId={c.id} name={c.full_name} earned={earned} paid={paid} owed={owed} deal={effDeal} hasCustom={!!deal} />}
    </View>
  );
}

// ---- expanded breakdown: history + earnings + deal editor --------------
function ExpandedDetail({
  profileId,
  name,
  earned,
  paid,
  owed,
  deal,
  hasCustom,
}: {
  profileId: string;
  name: string | null;
  earned: number;
  paid: number;
  owed: number;
  deal: Deal;
  hasCustom: boolean;
}) {
  const theme = useTheme();
  const [videos, setVideos] = useState<VtVideo[] | null>(null);
  const [history, setHistory] = useState<Payout[] | null>(null);
  const [editDeal, setEditDeal] = useState(false);
  const [pv, setPv] = useState(String(deal.per_video));
  const [bp, setBp] = useState(String(deal.bonus_per));
  const [bu, setBu] = useState(String(deal.bonus_unit));
  const [savingDeal, setSavingDeal] = useState(false);
  const [selVid, setSelVid] = useState<string | null>(null);
  const [tf, setTf] = useState<'all' | '7d' | '30d'>('all');
  const [openPay, setOpenPay] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    vtCreator(profileId).then((d) => active && setVideos(d?.videos ?? []));
    getPayouts(profileId).then((h) => active && setHistory(h));
    return () => {
      active = false;
    };
  }, [profileId]);

  const bonusesOf = (v: VtVideo) => Math.floor((v.views ?? 0) / deal.bonus_unit);
  const videoPay = (v: VtVideo) => deal.per_video + bonusesOf(v) * deal.bonus_per;
  const since = tf === 'all' ? 0 : Date.now() - (tf === '7d' ? 7 : 30) * 86400000;
  const periodVids = (videos ?? []).filter((v) => tf === 'all' || (v.uploadDate && new Date(v.uploadDate).getTime() >= since));
  const tfLabel = tf === 'all' ? 'all time' : tf === '7d' ? 'last 7 days' : 'last 30 days';
  const sortedVids = [...periodVids].sort((a, b) => videoPay(b) - videoPay(a));
  const base = periodVids.length * deal.per_video;
  const bonusCount = periodVids.reduce((s, v) => s + bonusesOf(v), 0);
  const bonusTotal = bonusCount * deal.bonus_per;
  const periodEarned = base + bonusTotal;
  const selObj = sortedVids.find((v) => v.id === selVid) ?? null;

  async function saveDeal() {
    setSavingDeal(true);
    await setDeal(profileId, Number(pv) || 0, Number(bp) || 0, Number(bu) || 1);
    setSavingDeal(false);
    setEditDeal(false);
  }
  async function resetDeal() {
    setSavingDeal(true);
    await clearDeal(profileId);
    setSavingDeal(false);
    setEditDeal(false);
    setPv(String(STANDARD_DEAL.per_video));
    setBp(String(STANDARD_DEAL.bonus_per));
    setBu(String(STANDARD_DEAL.bonus_unit));
  }

  return (
    <View style={[styles.detail, { borderTopColor: theme.border }]}>
      {/* deal */}
      <View style={styles.detailSection}>
        <View style={styles.detailHead}>
          <ThemedText style={styles.detailTitle}>Deal {hasCustom ? '· custom' : '· standard'}</ThemedText>
          <Pressable onPress={() => setEditDeal((e) => !e)}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              {editDeal ? 'Close' : 'Edit deal'}
            </ThemedText>
          </Pressable>
        </View>
        {editDeal ? (
          <View style={styles.dealForm}>
            <View style={styles.dealField}>
              <ThemedText type="small" themeColor="textSecondary">
                $ / video
              </ThemedText>
              <TextInput value={pv} onChangeText={setPv} keyboardType="numeric" style={[styles.dealInput, { color: theme.text, borderColor: theme.border }]} />
            </View>
            <View style={styles.dealField}>
              <ThemedText type="small" themeColor="textSecondary">
                $ / bonus
              </ThemedText>
              <TextInput value={bp} onChangeText={setBp} keyboardType="numeric" style={[styles.dealInput, { color: theme.text, borderColor: theme.border }]} />
            </View>
            <View style={styles.dealField}>
              <ThemedText type="small" themeColor="textSecondary">
                per views
              </ThemedText>
              <TextInput value={bu} onChangeText={setBu} keyboardType="numeric" style={[styles.dealInput, { color: theme.text, borderColor: theme.border }]} />
            </View>
            <Pressable onPress={saveDeal} disabled={savingDeal} style={[styles.dealSave, { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.dealSaveText, { color: theme.primaryText }]}>{savingDeal ? '…' : 'Save'}</ThemedText>
            </Pressable>
            {hasCustom && (
              <Pressable onPress={resetDeal} disabled={savingDeal} style={[styles.dealReset, { borderColor: theme.border }]}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Reset
                </ThemedText>
              </Pressable>
            )}
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            ${deal.per_video}/video + ${deal.bonus_per} per {compact(deal.bonus_unit)} views
          </ThemedText>
        )}
      </View>

      {/* breakdown — timeframe, base + bonuses, then a video slider */}
      <View style={styles.detailSection}>
        <ThemedText style={styles.detailTitle}>Breakdown</ThemedText>
        {!videos ? (
          <Skeleton height={88} radius={Radius.md} />
        ) : (
          <>
            <View style={styles.tfRow}>
              {(['all', '7d', '30d'] as const).map((t) => {
                const on = tf === t;
                return (
                  <Pressable key={t} onPress={() => setTf(t)} style={[styles.tfPill, { borderColor: theme.border }, on && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                    <ThemedText style={[styles.tfText, { color: on ? theme.primaryText : theme.textSecondary }]}>{t === 'all' ? 'All time' : t === '7d' ? '7 days' : '30 days'}</ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.breakRow}>
              <View style={[styles.breakTile, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <ThemedText style={[styles.breakLabel, { color: theme.textSecondary }]}>BASE</ThemedText>
                <ThemedText style={styles.breakValue}>{money(base)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {periodVids.length} videos × ${deal.per_video}
                </ThemedText>
              </View>
              <View style={[styles.breakTile, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <ThemedText style={[styles.breakLabel, { color: theme.textSecondary }]}>BONUSES</ThemedText>
                <ThemedText style={[styles.breakValue, { color: theme.primary }]}>{money(bonusTotal)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {bonusCount} hit × ${deal.bonus_per}
                </ThemedText>
              </View>
            </View>

            <View style={[styles.eqStrip, { borderColor: theme.border, backgroundColor: theme.background }]}>
              {tf === 'all' ? (
                <>
                  <ThemedText type="smallBold">{money(earned)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary"> earned − </ThemedText>
                  <ThemedText type="smallBold" themeColor="success">{money(paid)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary"> paid = </ThemedText>
                  <ThemedText style={[styles.eqOwed, { color: theme.primary }]}>{money(owed)} owed</ThemedText>
                </>
              ) : (
                <>
                  <ThemedText style={[styles.eqOwed, { color: theme.primary }]}>{money(periodEarned)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary"> earned · {tfLabel}</ThemedText>
                </>
              )}
            </View>

            {periodVids.length > 0 && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {periodVids.length} videos · tap one to expand
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slider}>
                  {sortedVids.map((v) => {
                    const sel = selVid === v.id;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => setSelVid(sel ? null : v.id)}
                        style={[styles.vCard, { backgroundColor: theme.card, borderColor: sel ? theme.primary : theme.border }, brutalShadow(theme.shadow, sel ? 4 : 2)]}>
                        {v.thumbnail ? (
                          <Image source={{ uri: v.thumbnail }} style={styles.vThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.vThumb, { backgroundColor: theme.backgroundElement, alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="film-outline" size={20} color={theme.textSecondary} />
                          </View>
                        )}
                        <ThemedText style={[styles.vPay, { color: theme.primary }]}>+${videoPay(v)}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {compact(v.views)} views
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {selObj && (
                  <View style={[styles.vDetail, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      @{selObj.accountUsername || 'video'} · {compact(selObj.views)} views
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      ${deal.per_video} base + {bonusesOf(selObj)} bonus{bonusesOf(selObj) === 1 ? '' : 'es'} × ${deal.bonus_per} = <ThemedText type="smallBold" style={{ color: theme.primary }}>+${videoPay(selObj)}</ThemedText>
                    </ThemedText>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>

      {/* payment history */}
      <View style={styles.detailSection}>
        <ThemedText style={styles.detailTitle}>Payment history</ThemedText>
        {!history ? (
          <Skeleton height={40} radius={Radius.sm} />
        ) : history.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No payments yet to {name || 'this creator'}.
          </ThemedText>
        ) : (
          history.map((p) => {
            const open = openPay === p.id;
            const d = new Date(p.created_at);
            return (
              <Pressable key={p.id} onPress={() => setOpenPay(open ? null : p.id)} style={[styles.histCard, { borderColor: open ? theme.success : theme.border }]}>
                <View style={styles.histRow}>
                  <Ionicons name="checkmark-circle" size={15} color={theme.success} />
                  <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>
                    {d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    {!open && p.note ? ` · ${p.note}` : ''}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor="success">
                    {money(Number(p.amount))}
                  </ThemedText>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textSecondary} />
                </View>
                {open && (
                  <View style={[styles.histDetail, { borderTopColor: theme.border }]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </ThemedText>
                    <ThemedText type="small">Note: {p.note || '—'}</ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

// ---- pay modal ----------------------------------------------------------
function PayModal({
  payReq,
  busy,
  onCancel,
  onConfirm,
}: {
  payReq: { rows: Row[]; single: boolean };
  busy: boolean;
  onCancel: () => void;
  onConfirm: (targets: { id: string; amount: number }[], note: string) => void;
}) {
  const theme = useTheme();
  const { rows, single } = payReq;
  const [amount, setAmount] = useState(String(Math.round(rows[0]?.owed ?? 0)));
  const [note, setNote] = useState('');
  const total = single ? Number(amount) || 0 : rows.reduce((s, r) => s + r.owed, 0);

  const confirm = () => {
    if (single) onConfirm([{ id: rows[0].c.id, amount: Number(amount) || 0 }], note);
    else onConfirm(rows.map((r) => ({ id: r.c.id, amount: r.owed })), note);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <BrutalCard style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]} shadow={6}>
          <View style={[styles.modalIcon, { backgroundColor: theme.success }]}>
            <Ionicons name="cash" size={26} color="#fff" />
          </View>
          <ThemedText style={styles.modalTitle}>
            {single ? `Pay ${rows[0].c.full_name || 'creator'}` : `Pay ${rows.length} creators`}
          </ThemedText>

          {single ? (
            <View style={styles.amountWrap}>
              <ThemedText style={styles.dollar}>$</ThemedText>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={[styles.amountInput, { color: theme.text }]} autoFocus />
            </View>
          ) : (
            <ScrollView style={styles.batchList}>
              {rows.map((r) => (
                <View key={r.c.id} style={styles.batchRow}>
                  <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>
                    {r.c.full_name || 'Creator'}
                  </ThemedText>
                  <ThemedText type="smallBold">{money(r.owed)}</ThemedText>
                </View>
              ))}
              <View style={[styles.batchRow, styles.batchTotal, { borderTopColor: theme.border }]}>
                <ThemedText style={styles.batchTotalLabel}>Total</ThemedText>
                <ThemedText style={styles.batchTotalAmt}>{money(total)}</ThemedText>
              </View>
            </ScrollView>
          )}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional) — e.g. June week 2"
            placeholderTextColor={theme.textSecondary}
            style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]}
          />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            This records the payment and notifies {single ? 'them' : 'each creator'}.
          </ThemedText>

          <View style={styles.modalBtns}>
            <Pressable onPress={onCancel} style={[styles.modalBtn, styles.modalCancel, { borderColor: theme.border }]}>
              <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={busy || total <= 0}
              style={({ pressed }) => [styles.modalBtn, { backgroundColor: total > 0 ? theme.success : theme.backgroundElement }, brutalShadow(theme.shadow, 3), pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] }]}>
              <ThemedText style={[styles.modalBtnText, { color: total > 0 ? '#fff' : theme.textSecondary }]}>{busy ? 'Paying…' : `Pay ${money(total)}`}</ThemedText>
            </Pressable>
          </View>
        </BrutalCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.five, paddingBottom: Spacing.six, gap: Spacing.three },
  head: { marginBottom: Spacing.one },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '900' },
  totals: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap' },
  totalCard: { flex: 1, minWidth: 240, gap: 2, borderWidth: Border.widthThick },
  totalLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8, color: '#fff', opacity: 0.95 },
  totalValue: { fontSize: 36, lineHeight: 42, fontWeight: '900', color: '#fff' },
  totalSub: { fontSize: 12, fontWeight: '700', color: '#fff', opacity: 0.9 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, height: 44, borderRadius: Radius.sm, borderWidth: Border.width },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', outlineStyle: 'none' } as object,
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  box: { width: 22, height: 22, borderRadius: Radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, height: 44, borderRadius: Radius.sm, borderWidth: Border.width },
  payBtnText: { fontSize: 14, fontWeight: '900' },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },

  rowCard: { borderRadius: Radius.lg, borderWidth: Border.width, overflow: 'hidden' },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two + 2 },
  checkHit: { padding: 4 },
  nameCol: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  name: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  dealChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full },
  dealChipText: { fontSize: 9, fontWeight: '900', color: '#1A1A1A', letterSpacing: 0.5 },
  owedCol: { alignItems: 'flex-end' },
  owedVal: { fontSize: 19, lineHeight: 23, fontWeight: '900' },
  rowPay: { paddingHorizontal: Spacing.three, height: 36, borderRadius: Radius.full, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  rowPayText: { fontSize: 14, fontWeight: '900' },
  expandBtn: { padding: 4 },

  detail: { borderTopWidth: Border.width, padding: Spacing.three, gap: Spacing.three },
  detailSection: { gap: Spacing.one + 2 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailTitle: { fontSize: 14, fontWeight: '900' },
  dealForm: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, flexWrap: 'wrap' },
  dealField: { gap: 3 },
  dealInput: { width: 84, height: 38, borderRadius: Radius.sm, borderWidth: Border.width, paddingHorizontal: Spacing.two, fontSize: 15, fontWeight: '700', outlineStyle: 'none' } as object,
  dealSave: { height: 38, paddingHorizontal: Spacing.three, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  dealSaveText: { fontSize: 14, fontWeight: '900' },
  dealReset: { height: 38, paddingHorizontal: Spacing.three, borderRadius: Radius.sm, borderWidth: Border.width, alignItems: 'center', justifyContent: 'center' },
  tfRow: { flexDirection: 'row', gap: Spacing.two },
  tfPill: { paddingHorizontal: Spacing.two + 2, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: Border.width },
  tfText: { fontSize: 12, fontWeight: '800' },
  breakRow: { flexDirection: 'row', gap: Spacing.two },
  breakTile: { flex: 1, gap: 1, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  breakLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  breakValue: { fontSize: 24, lineHeight: 28, fontWeight: '900' },
  eqStrip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md, borderWidth: Border.width },
  eqOwed: { fontSize: 16, fontWeight: '900' },
  slider: { gap: Spacing.two, paddingVertical: 2, paddingRight: Spacing.two },
  vCard: { width: 100, gap: 2, padding: 6, borderRadius: Radius.md, borderWidth: Border.width },
  vThumb: { width: '100%', height: 96, borderRadius: Radius.sm },
  vPay: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  vDetail: { gap: 2, padding: Spacing.two + 2, borderRadius: Radius.md, borderWidth: Border.width },
  histCard: { borderRadius: Radius.sm, borderWidth: Border.width, paddingHorizontal: Spacing.two, paddingVertical: 2, marginBottom: 4 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6 },
  histDetail: { gap: 2, paddingBottom: 6, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  modalCard: { width: '100%', maxWidth: 420, alignItems: 'center', gap: Spacing.two, borderWidth: Border.widthThick, padding: Spacing.four },
  modalIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginVertical: Spacing.one },
  dollar: { fontSize: 34, fontWeight: '900' },
  amountInput: { fontSize: 44, fontWeight: '900', minWidth: 120, textAlign: 'center', outlineStyle: 'none' } as object,
  batchList: { alignSelf: 'stretch', maxHeight: 200 },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6 },
  batchTotal: { borderTopWidth: Border.width, marginTop: 4, paddingTop: 8 },
  batchTotalLabel: { flex: 1, fontSize: 15, fontWeight: '900' },
  batchTotalAmt: { fontSize: 17, fontWeight: '900' },
  noteInput: { alignSelf: 'stretch', height: 44, borderRadius: Radius.md, borderWidth: Border.width, paddingHorizontal: Spacing.three, fontSize: 14, fontWeight: '600', outlineStyle: 'none' } as object,
  modalBtns: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch', marginTop: Spacing.one },
  modalBtn: { flex: 1, height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: Border.width },
  modalCancel: { backgroundColor: 'transparent' },
  modalBtnText: { fontSize: 15, fontWeight: '900' },
});
