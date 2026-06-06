import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Message = Tables<'messages'> & { reply_to?: string | null };
export type Sender = { full_name: string | null; avatar_url: string | null; level: number; role: string | null };
export type Reaction = { profile_id: string; emoji: string };

// `message_reactions` isn't in the generated types yet — cast around it.
const sb = supabase as unknown as { from: (t: string) => any };

// Ensures every realtime subscription gets a unique channel topic, so we never
// re-bind `.on()` onto an already-subscribed channel (supabase reuses channels
// by topic — a duplicate topic throws "cannot add callbacks after subscribe()").
let channelSeq = 0;

/** Resolve (or create) the signed-in creator's own support thread. */
export function useMyConversationId() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    supabase.rpc('get_or_create_conversation', {}).then(({ data }) => {
      if (!active) return;
      setConversationId(data?.id ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return { conversationId, loading };
}

/** Messages + realtime + send for a specific conversation. */
export function useThread(conversationId: string | null) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [senders, setSenders] = useState<Record<string, Sender>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Look up the name/avatar of anyone who has sent a message in this thread.
  useEffect(() => {
    const missing = [...new Set(messages.map((m) => m.sender_id))].filter((id) => !senders[id]);
    if (!missing.length) return;
    let active = true;
    sb
      .from('profiles')
      .select('id, full_name, avatar_url, role, creator_progress(level)')
      .in('id', missing)
      .then(({ data }: { data: any[] | null }) => {
        if (!active || !data) return;
        setSenders((prev) => ({
          ...prev,
          ...Object.fromEntries(
            data.map((p) => {
              const cp = Array.isArray(p.creator_progress) ? p.creator_progress[0] : p.creator_progress;
              return [p.id, { full_name: p.full_name, avatar_url: p.avatar_url, role: p.role, level: cp?.level ?? 1 }];
            }),
          ),
        }));
      });
    return () => {
      active = false;
    };
  }, [messages, senders]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    setLoading(true);

    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        setMessages(data ?? []);
        setLoading(false);
      });

    const loadReactions = () => {
      sb.from('message_reactions')
        .select('message_id, profile_id, emoji')
        .eq('conversation_id', conversationId)
        .then(({ data }: { data: { message_id: string; profile_id: string; emoji: string }[] | null }) => {
          if (!active) return;
          const map: Record<string, Reaction[]> = {};
          (data ?? []).forEach((r) => {
            (map[r.message_id] ??= []).push({ profile_id: r.profile_id, emoji: r.emoji });
          });
          setReactions(map);
        });
    };
    loadReactions();

    channelSeq += 1;
    const channel = supabase
      .channel(`messages:${conversationId}:${channelSeq}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${conversationId}` },
        () => loadReactions(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!conversationId || !userId) return;
      const mine = (reactions[messageId] ?? []).find((r) => r.profile_id === userId);
      const removing = mine?.emoji === emoji;

      // Optimistic: update local state immediately so the emoji pops in / out
      // right away — the DB write + realtime just confirm it.
      setReactions((prev) => {
        const list = (prev[messageId] ?? []).filter((r) => r.profile_id !== userId);
        if (!removing) list.push({ profile_id: userId, emoji });
        return { ...prev, [messageId]: list };
      });

      if (removing) {
        await sb.from('message_reactions').delete().eq('message_id', messageId).eq('profile_id', userId);
      } else {
        await sb
          .from('message_reactions')
          .upsert(
            { message_id: messageId, conversation_id: conversationId, profile_id: userId, emoji },
            { onConflict: 'message_id,profile_id' },
          );
      }
    },
    [conversationId, userId, reactions],
  );

  const send = useCallback(
    async (body: string, attachment?: { url: string; type: string }, replyTo?: string | null) => {
      const text = body.trim();
      if ((!text && !attachment) || !conversationId || !userId) return;
      setSending(true);
      const { data, error: sendError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          body: text,
          attachment_url: attachment?.url ?? null,
          attachment_type: attachment?.type ?? null,
          reply_to: replyTo ?? null,
        } as never)
        .select()
        .single();
      setSending(false);
      if (sendError) {
        setError(sendError.message);
        return;
      }
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      }
    },
    [conversationId, userId],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      // Optimistic: drop it locally, then delete (RLS allows deleting your own).
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      await supabase.from('messages').delete().eq('id', messageId);
    },
    [],
  );

  return { messages, senders, reactions, loading, sending, error, userId, send, toggleReaction, deleteMessage };
}
