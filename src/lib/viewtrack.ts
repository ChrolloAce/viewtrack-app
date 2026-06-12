import { supabase } from '@/lib/supabase';

export type VtProject = { id: string; name: string; accountCount: number; videoCount: number };
export type VtAccount = {
  id: string;
  username: string;
  platform: string;
  displayName: string;
  profilePicUrl: string | null;
  followerCount: number;
  isVerified: boolean;
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
};
export type VtVideo = {
  id: string;
  url: string;
  platform: string;
  title: string;
  thumbnail: string | null;
  views: number;
  likes: number;
  comments?: number;
  shares?: number;
  saves?: number;
  accountUsername: string;
  uploadDate: string | null;
  /** Direct CDN media file when ViewTrack has one (Instagram); TikTok resolves via vt-download. */
  downloadUrl?: string | null;
};
export type VtMe = { accounts: VtAccount[]; videos: VtVideo[] };

async function call<T>(body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body });
  if (error) return null;
  return data as T;
}

/** Detect platform from a pasted profile URL (mirrors the server parser). */
export function detectPlatform(url: string): 'tiktok' | 'instagram' | 'youtube' | null {
  const s = url.toLowerCase();
  if (s.includes('tiktok')) return 'tiktok';
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('youtube') || s.includes('youtu.be')) return 'youtube';
  return null;
}

export async function vtProjects(): Promise<VtProject[]> {
  const d = await call<{ projects: VtProject[] }>({ action: 'projects' });
  return d?.projects ?? [];
}

export async function vtAccounts(projectId: string): Promise<VtAccount[]> {
  const d = await call<{ accounts: VtAccount[] }>({ action: 'accounts', projectId });
  return d?.accounts ?? [];
}

export async function vtMe(): Promise<VtMe> {
  const d = await call<VtMe>({ action: 'me' });
  return { accounts: d?.accounts ?? [], videos: d?.videos ?? [] };
}

export type CreatorView = {
  profile: { id: string; full_name: string | null; avatar_url: string | null; role: string | null };
  progress: { level: number; xp: number; posts_total: number; views_total: number } | null;
  briefsDone: number;
  accounts: VtAccount[];
  videos: VtVideo[];
};

/** Public creator profile (stats + videos) for any profile id. */
export async function vtCreator(profileId: string): Promise<CreatorView | null> {
  return await call<CreatorView>({ action: 'creator', profileId });
}

export type CreatorActivity = {
  posted: boolean[];
  postedCount: number;
  trend: number[];
  avg: number;
  earnings: number;
  videos: number;
  views: number;
  likes: number;
  comments: number;
};

/** Posting activity (last 5 days) + 7-day views trend for every creator. One sweep. */
export async function vtCreatorActivity(): Promise<Record<string, CreatorActivity>> {
  const d = await call<{ entries: Record<string, CreatorActivity> }>({ action: 'creator-activity' });
  return d?.entries ?? {};
}

export type LeaderboardEntry = {
  profile: { id: string; full_name: string | null; avatar_url: string | null };
  video: VtVideo;
};

export type CreatorRank = {
  profile: { id: string; full_name: string | null; avatar_url: string | null };
  views: number;
  posts: number;
  avg: number;
  lastPostTs: number;
};

/** Per-creator performance over a window (days=null → all time). */
export async function vtCreatorLeaderboard(days: number | null): Promise<CreatorRank[]> {
  const d = await call<{ entries: CreatorRank[] }>({ action: 'creator-leaderboard', days });
  return d?.entries ?? [];
}

/** Top-performing video per linked creator, ranked (up to 10). */
export async function vtLeaderboard(): Promise<LeaderboardEntry[]> {
  const d = await call<{ entries: LeaderboardEntry[] }>({ action: 'leaderboard' });
  return d?.entries ?? [];
}

/** Admin: trigger a ViewTrack re-sync of every account in the project. */
export async function vtRefreshProject(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vt-refresh', { body: { action: 'project' } });
  if (error) return { ok: false, error: error.message };
  return { ok: !!(data as { ok?: boolean })?.ok };
}

/** Admin: re-sync one creator's linked accounts. */
export async function vtRefreshCreator(profileId: string): Promise<{ refreshed: number; total: number }> {
  const { data } = await supabase.functions.invoke('vt-refresh', { body: { action: 'creator', profileId } });
  const d = data as { refreshed?: number; total?: number } | null;
  return { refreshed: d?.refreshed ?? 0, total: d?.total ?? 0 };
}

export type VtCreator = { id: string; name: string; avatarUrl: string | null; accountCount: number; totalViews: number; totalVideos: number };

export type TranscriptSeg = { start?: number; end?: number; timestamp?: string; text?: string };
export type VideoAnalysis = {
  /** ViewTrack returns this as the full transcript STRING; older rows may hold segment arrays. */
  transcript?: string | TranscriptSeg[];
  transcriptSegments?: TranscriptSeg[];
  summary?: string;
  hook?: string;
  topics?: string[];
  tone?: string;
  pacing?: string;
  whatWorked?: string | string[];
  suggestions?: string | string[];
  /** On-screen text overlays detected by ViewTrack's analyze prompt. */
  textOverlays?: OverlayItem[];
  overlays?: (string | OverlayItem)[];
};

export type OverlayItem = {
  timestamp?: string;
  endTimestamp?: string;
  type?: string;
  description?: string;
  text?: string;
  frameUrl?: string;
};

/** Analysis fields drift between string and list-of-points — render either. */
export function textOf(v?: string | string[]): string | undefined {
  if (Array.isArray(v)) return v.length ? v.map((s) => `• ${s}`).join('\n') : undefined;
  return v || undefined;
}

/** Normalize overlays (either field name; string or {timestamp,text} items). */
export function overlayItems(a: VideoAnalysis | null | undefined): OverlayItem[] {
  const raw = a?.textOverlays ?? a?.overlays ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => (typeof o === 'string' ? { text: o } : o)).filter((o) => !!o?.text);
}

/** Normalize the transcript (string or either segment shape) into renderable segments. */
export function transcriptSegs(a: VideoAnalysis | null | undefined): TranscriptSeg[] {
  if (!a) return [];
  if (Array.isArray(a.transcriptSegments) && a.transcriptSegments.length) return a.transcriptSegments;
  if (Array.isArray(a.transcript)) return a.transcript;
  if (typeof a.transcript === 'string' && a.transcript.trim()) return [{ text: a.transcript.trim() }];
  return [];
}

/** Label for a segment's time marker: "00:06" or "[6s]" depending on what the API sent. */
export function segTime(seg: TranscriptSeg): string | null {
  if (seg.timestamp) return seg.timestamp;
  if (typeof seg.start === 'number') return `${Math.floor(seg.start)}s`;
  return null;
}

export type AnalysisStatus = 'processing' | 'done' | 'error';

/**
 * Admin: kick off (or fetch cached) Gemini analysis of a tracked video.
 * The breakdown runs on the server in the background, so this returns almost
 * immediately with status 'processing' — the result lands in `video_analyses`
 * (watch it live via useVideoAnalyses). 'done' means it was already cached.
 */
export async function vtAnalyzeVideo(videoId: string, force = false): Promise<{ ok: boolean; status?: AnalysisStatus; analysis?: VideoAnalysis; cached?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vt-analyze', { body: { videoId, force } });
  if (error) return { ok: false, error: error.message };
  const d = data as { ok?: boolean; status?: AnalysisStatus; analysis?: VideoAnalysis; cached?: boolean; error?: string } | null;
  return d?.ok ? { ok: true, status: d.status, analysis: d.analysis, cached: d.cached } : { ok: false, error: d?.error ?? 'failed' };
}

/** The stored analysis for a video (null if never analyzed). */
export async function getVideoAnalysis(videoId: string): Promise<{ analysis: VideoAnalysis | null; flagged: boolean; status: AnalysisStatus; error: string | null } | null> {
  const { data } = await sb.from('video_analyses').select('analysis, flagged, status, error').eq('video_id', videoId).maybeSingle();
  return data
    ? { analysis: (data.analysis as VideoAnalysis) ?? null, flagged: !!data.flagged, status: (data.status as AnalysisStatus) ?? 'done', error: data.error ?? null }
    : null;
}

/** Pull the real error message out of a FunctionsHttpError (the response body). */
export async function fnErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = (await ctx.json()) as { error?: string };
      if (j?.error) return j.error;
    } catch {
      /* fall through */
    }
  }
  return (error as Error)?.message ?? 'failed';
}

/**
 * Admin: resolve a fresh direct media URL for downloading a video.
 * TikTok resolves via extractor; Instagram gets a FRESH ViewTrack downloadUrl
 * server-side (the ones cached in the grid expire).
 */
export async function vtDownloadMedia(video: VtVideo, mode: 'video' | 'audio'): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('vt-download', { body: { url: video.url, videoId: video.id, mode } });
  if (error) return { ok: false, error: await fnErrorMessage(error) };
  const d = data as { ok?: boolean; url?: string; error?: string } | null;
  return d?.ok && d.url ? { ok: true, url: d.url } : { ok: false, error: d?.error ?? 'failed' };
}

/** Admin: list the creators that exist in ViewTrack (to import into the app). */
export async function vtListCreators(): Promise<VtCreator[]> {
  const { data } = await supabase.functions.invoke('vt-refresh', { body: { action: 'list-creators' } });
  return (data as { creators?: VtCreator[] } | null)?.creators ?? [];
}

/**
 * Admin: tracked videos in the project (for the Videos grid), newest first.
 * Pass `days` to fetch every video uploaded in that window across all creators
 * (null = all-time, bounded by `limit`). Returns the project's total count too.
 */
export async function vtListVideos(days: number | null = null, limit?: number): Promise<{ videos: VtVideo[]; total: number; truncated: boolean }> {
  const { data } = await supabase.functions.invoke('vt-refresh', { body: { action: 'list-videos', days, limit } });
  const d = data as { videos?: VtVideo[]; total?: number; truncated?: boolean } | null;
  return { videos: d?.videos ?? [], total: d?.total ?? 0, truncated: !!d?.truncated };
}

export type AccountLink = {
  id: string;
  profile_id: string;
  platform: string;
  username: string;
  url: string | null;
  vt_account_id: string | null;
  vt_project_id: string | null;
  /** processing = approved, submitted to ViewTrack, waiting for its first sync */
  status: 'pending' | 'processing' | 'linked' | 'rejected';
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
};

const sb = supabase as unknown as { from: (t: string) => any };

/** Creator submits an account URL — auto-links if found, else creates a request. */
export async function submitLink(url: string): Promise<{ status: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'link-submit', url } });
  if (error) return { status: 'error', error: error.message };
  return data as { status: string; error?: string };
}

/** Admin approves / rejects a pending request. */
export async function decideLink(linkId: string, approve: boolean): Promise<{ status: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'decide', linkId, approve } });
  if (error) return { status: 'error', error: error.message };
  return data as { status: string; error?: string };
}

export async function myLinks(profileId: string): Promise<AccountLink[]> {
  const { data } = await sb
    .from('account_links')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  return (data as AccountLink[]) ?? [];
}

export async function pendingLinks(): Promise<AccountLink[]> {
  const { data } = await sb
    .from('account_links')
    .select('*, profile:profiles!account_links_profile_id_fkey(full_name, avatar_url)')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false });
  return (data as AccountLink[]) ?? [];
}

/**
 * Heal account links: submits 'requested' handles to ViewTrack (admin) and
 * flips 'processing' links to 'linked' once their first sync finishes.
 */
export async function reconcileLinks(): Promise<number> {
  const { data } = await supabase.functions.invoke('viewtrack', { body: { action: 'reconcile' } });
  const d = data as { linked?: number; submitted?: number } | null;
  return (d?.linked ?? 0) + (d?.submitted ?? 0);
}

/**
 * Admin: manually attach ANY profile URL to a creator. The account gets
 * tracked in ViewTrack (added if new), assigned to the creator's mirrored
 * ViewTrack creator (created by name if missing), and linked here as
 * 'processing' until the first sync lands.
 */
export async function addAccountByUrl(profileId: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'add-account', profileId, url } });
  if (error) return { ok: false, error: await fnErrorMessage(error) };
  const d = data as { ok?: boolean; error?: string } | null;
  return d?.ok ? { ok: true } : { ok: false, error: d?.error ?? 'failed' };
}

/**
 * Admin: attach MANY accounts to a creator in one shot — existing ViewTrack
 * account ids and/or pasted profile URLs. The server queues a background job
 * and returns immediately, so it's safe to navigate away; rows appear via
 * realtime as each account links.
 */
export async function addAccountsBulk(profileId: string, input: { urls?: string[]; accountIds?: string[] }): Promise<{ ok: boolean; queued?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'add-accounts', profileId, ...input } });
  if (error) return { ok: false, error: await fnErrorMessage(error) };
  const d = data as { ok?: boolean; queued?: number; error?: string } | null;
  return d?.ok ? { ok: true, queued: d.queued } : { ok: false, error: d?.error ?? 'failed' };
}

/** Permanently delete the signed-in user's OWN account and all their data (App Store 5.1.1(v)). */
export async function deleteOwnAccount(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'delete-account' } });
  if (error) return { ok: false, error: await fnErrorMessage(error) };
  const d = data as { ok?: boolean; error?: string } | null;
  return d?.ok ? { ok: true } : { ok: false, error: d?.error ?? 'failed' };
}

/** Admin: hard-delete a creator — wipes their data and removes the login. */
export async function deleteCreatorAccount(profileId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('viewtrack', { body: { action: 'delete-creator', profileId } });
  if (error) return { ok: false, error: await fnErrorMessage(error) };
  const d = data as { ok?: boolean; error?: string } | null;
  return d?.ok ? { ok: true } : { ok: false, error: d?.error ?? 'failed' };
}

export async function deleteLink(id: string) {
  await sb.from('account_links').delete().eq('id', id);
}

export type CreatorFilterEntry = { id: string; name: string; keys: string[] };

/** Creators with linked accounts, each with their platform:username keys — for the Videos creator filter. */
export async function linkedCreatorFilters(): Promise<CreatorFilterEntry[]> {
  const { data } = await sb
    .from('account_links')
    .select('profile_id, platform, username, profile:profiles!account_links_profile_id_fkey(full_name)')
    .eq('status', 'linked');
  const map = new Map<string, CreatorFilterEntry>();
  for (const r of ((data ?? []) as { profile_id: string; platform: string; username: string; profile?: { full_name: string | null } | null }[])) {
    const e = map.get(r.profile_id) ?? { id: r.profile_id, name: r.profile?.full_name ?? 'Creator', keys: [] };
    e.keys.push(`${r.platform}:${(r.username ?? '').toLowerCase().replace(/^@/, '')}`);
    map.set(r.profile_id, e);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
