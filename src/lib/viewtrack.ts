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

export type CreatorActivity = { posted: boolean[]; postedCount: number; trend: number[]; avg: number; earnings: number; videos: number };

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

export type AccountLink = {
  id: string;
  profile_id: string;
  platform: string;
  username: string;
  url: string | null;
  vt_account_id: string | null;
  vt_project_id: string | null;
  status: 'pending' | 'linked' | 'rejected';
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
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as AccountLink[]) ?? [];
}

export async function deleteLink(id: string) {
  await sb.from('account_links').delete().eq('id', id);
}
