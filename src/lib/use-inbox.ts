import { useCallback, useEffect, useMemo, useState } from 'react';

import { useBlocks } from '@/lib/blocks';
import { supabase } from '@/lib/supabase';

let inboxSeq = 0;

export type InboxItem = {
  id: string;
  type: string; // 'direct' | 'group'
  title: string | null;
  cover_url: string | null;
  subject: string | null;
  last_message_at: string;
  customer: { id: string; full_name: string | null; avatar_url: string | null } | null;
  // latest message preview
  last_body: string | null;
  last_attachment: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
};

type InboxRow = {
  id: string;
  type: string;
  title: string | null;
  cover_url: string | null;
  subject: string | null;
  last_message_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_avatar: string | null;
  last_body: string | null;
  last_attachment: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
};

/** Inbox (admin + creator): conversations with their latest message, newest first, live. */
export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // `inbox` RPC isn't in the generated types yet — cast around it.
    const { data } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: InboxRow[] | null }>)('inbox');
    const rows = data ?? [];
    setItems(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        cover_url: r.cover_url,
        subject: r.subject,
        last_message_at: r.last_message_at,
        customer: r.customer_id
          ? { id: r.customer_id, full_name: r.customer_name, avatar_url: r.customer_avatar }
          : null,
        last_body: r.last_body,
        last_attachment: r.last_attachment,
        last_sender_id: r.last_sender_id,
        last_sender_name: r.last_sender_name,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    inboxSeq += 1;
    const channel = supabase
      .channel(`inbox:${inboxSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Hide direct conversations with anyone the viewer has blocked.
  const { blocked } = useBlocks();
  const visible = useMemo(
    () => items.filter((it) => !(it.type === 'direct' && it.customer && blocked.has(it.customer.id))),
    [items, blocked],
  );

  return { items: visible, loading, reload: load };
}
