import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudioBubble } from '@/components/audio-bubble';
import { BrutalAvatar } from '@/components/brutal';
import { ChatImage } from '@/components/chat-image';
import { ChatSkeleton } from '@/components/chat-skeleton';
import { blockUser, reportUser, useBlocks } from '@/lib/blocks';
import { ThemedText } from '@/components/themed-text';
import { Waveform } from '@/components/waveform';
import { Border, BottomTabInset, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { badgeFor } from '@/lib/badges';
import { impact, selection } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import {
  pickImages,
  uploadDroppedImage,
  uploadLocalAudio,
  uploadLocalImage,
} from '@/lib/chat-media';
import { useThread, type Message, type Reaction, type Sender } from '@/lib/use-thread';

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const ALL_EMOJIS = [
  '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '💯',
  '👏', '🎉', '😍', '🤩', '😎', '😭', '🥹', '🫡',
  '💪', '🙌', '👀', '💀', '🤝', '✅', '⭐', '🚀',
  '💖', '😤', '🤯', '🥶', '🫶', '😅', '🤔', '🙃',
];

function msgPreview(m: Message | null | undefined): string {
  if (!m) return '';
  if (m.attachment_type === 'image') return '📷 Photo';
  if (m.attachment_type === 'audio') return '🎤 Voice message';
  return m.body || '';
}

function aggregateReactions(list: Reaction[] | undefined, me: string | null) {
  const map: Record<string, { count: number; mine: boolean }> = {};
  (list ?? []).forEach((r) => {
    const e = (map[r.emoji] ??= { count: 0, mine: false });
    e.count++;
    if (r.profile_id === me) e.mine = true;
  });
  return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }));
}

type Pending = { id: string; previewUri: string; uri?: string; file?: File };
function newId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** The inner content of a message bubble — shared by the list and the focus
 * overlay so the focused message is the EXACT same thing, not a copy. */
function BubbleContent({
  item,
  mine,
  theme,
  senders,
  userId,
  messages,
  onImagePress,
}: {
  item: Message;
  mine: boolean;
  theme: ReturnType<typeof useTheme>;
  senders: Record<string, Sender>;
  userId: string | null;
  messages: Message[];
  onImagePress?: (uri: string, caption?: string) => void;
}) {
  const isImage = item.attachment_type === 'image' && !!item.attachment_url;
  const isAudio = item.attachment_type === 'audio' && !!item.attachment_url;
  const tint = mine ? theme.primaryText : theme.text;
  const replied = item.reply_to ? messages.find((m) => m.id === item.reply_to) : null;
  return (
    <>
      {replied && (
        <View style={[styles.quote, { borderLeftColor: mine ? theme.primaryText : theme.primary, backgroundColor: mine ? 'rgba(255,255,255,0.18)' : theme.backgroundElement }]}>
          <ThemedText style={[styles.quoteName, { color: mine ? theme.primaryText : theme.primary }]} numberOfLines={1}>
            {senders[replied.sender_id]?.full_name ?? (replied.sender_id === userId ? 'You' : 'Them')}
          </ThemedText>
          <ThemedText style={[styles.quoteText, { color: mine ? 'rgba(255,255,255,0.85)' : theme.textSecondary }]} numberOfLines={1}>
            {msgPreview(replied)}
          </ThemedText>
        </View>
      )}
      {isImage && <ChatImage uri={item.attachment_url!} onPress={() => onImagePress?.(item.attachment_url!, item.body || undefined)} />}
      {isAudio && <AudioBubble uri={item.attachment_url!} tint={tint} track={mine ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.12)'} />}
      {!!item.body && <ThemedText style={[styles.bubbleText, isImage && styles.caption, { color: tint }]}>{item.body}</ThemedText>}
      <ThemedText style={[styles.time, isImage && styles.timeOnImage, { color: mine ? 'rgba(255,255,255,0.85)' : theme.textSecondary }]}>
        {clock(item.created_at)}
      </ThemedText>
    </>
  );
}

/** A reaction pill that pops/jumps in when added or its count changes — but
 * NOT on initial chat load (`animate` is false until the thread has settled). */
function ReactionChip({ emoji, count, mine, onPress, animate }: { emoji: string; count: number; mine: boolean; onPress: () => void; animate: boolean }) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current; // default: no pop (existing reactions just appear)
  const animateRef = useRef(animate);
  animateRef.current = animate;
  useEffect(() => {
    if (!animateRef.current) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.5);
    // quick scale-up with a tiny pop, then settle — smooth, not springy.
    Animated.timing(scale, { toValue: 1, duration: 150, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start();
  }, [emoji, count, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.reactionChip,
          { backgroundColor: mine ? theme.primaryMuted : theme.card, borderColor: mine ? theme.primary : theme.border },
          brutalShadow(theme.shadow, 2),
          pressed && { opacity: 0.7 },
        ]}>
        <ThemedText style={styles.reactionEmoji}>{emoji}</ThemedText>
        <ThemedText style={[styles.reactionCount, { color: mine ? theme.primary : theme.textSecondary }]}>{count}</ThemedText>
      </Pressable>
    </Animated.View>
  );
}

export function ChatThread({
  conversationId,
  bottomInset = BottomTabInset,
  showSenders = false,
  keyboardOffset = 0,
}: {
  conversationId: string | null;
  bottomInset?: number;
  showSenders?: boolean;
  keyboardOffset?: number;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { messages, senders, reactions, loading, sending, error, userId, send, toggleReaction, deleteMessage } = useThread(conversationId);
  const { blocked } = useBlocks();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<{ uri: string; caption?: string } | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null); // long-pressed (focused) message
  const [pickAll, setPickAll] = useState(false); // expanded emoji grid in the focus menu
  const [reactInfo, setReactInfo] = useState<Message | null>(null); // "who reacted" sheet
  const [reactorNames, setReactorNames] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [focusRect, setFocusRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [animateRx, setAnimateRx] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const focusAnim = useRef(new Animated.Value(0)).current;
  const bubbleRefs = useRef<Map<string, View>>(new Map());
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Reactions already on screen when the chat opens should NOT pop in; only ones
  // added after the thread settles animate. Arm animation a beat after load.
  useEffect(() => {
    setAnimateRx(false);
    if (loading) return;
    const t = setTimeout(() => setAnimateRx(true), 500);
    return () => clearTimeout(t);
  }, [loading, conversationId]);

  // Auto-dismiss the report/block confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Spring the focus menu in (emoji bar bounce) when a message is long-pressed.
  useEffect(() => {
    if (actionMsg) {
      focusAnim.setValue(0);
      Animated.spring(focusAnim, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start();
    } else {
      setPickAll(false);
    }
  }, [actionMsg, focusAnim]);

  // Resolve names of everyone who reacted to the message in the details sheet.
  useEffect(() => {
    if (!reactInfo) return;
    const ids = [...new Set((reactions[reactInfo.id] ?? []).map((r) => r.profile_id))].filter(
      (id) => !senders[id] && !reactorNames[id],
    );
    if (!ids.length) return;
    let active = true;
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
      .then(({ data }: { data: { id: string; full_name: string | null }[] | null }) => {
        if (!active || !data) return;
        setReactorNames((prev) => ({ ...prev, ...Object.fromEntries(data.map((p) => [p.id, p.full_name ?? 'Someone'])) }));
      });
    return () => {
      active = false;
    };
  }, [reactInfo, reactions, senders, reactorNames]);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [recBars, setRecBars] = useState<number[]>([]);
  const meterRef = useRef<number | undefined>(undefined);

  const listRef = useRef<FlatList<Message>>(null);
  const dropRef = useRef<View>(null);

  // Newest-first for an INVERTED list — it opens pinned to the bottom with no
  // scroll/redraw, and reacting never shifts the scroll position.
  // Hide messages from anyone the viewer has blocked.
  const inverted = useMemo(
    () => [...messages].filter((m) => !blocked.has(m.sender_id)).reverse(),
    [messages, blocked],
  );

  // For an inverted list the bottom is offset 0.
  const scrollToEnd = useCallback((animated = false) => {
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated }));
  }, []);

  // ---- send ----------------------------------------------------------------
  const onSend = useCallback(async () => {
    const caption = draft.trim();
    const rid = replyTo?.id ?? null;
    if (pending.length === 0) {
      if (!caption) return;
      impact('light');
      setDraft('');
      setReplyTo(null);
      await send(caption, undefined, rid);
      scrollToEnd(true);
      return;
    }
    // Upload each staged image, then send (caption rides the first image).
    const items = pending;
    setBusy(true);
    setPending([]);
    setDraft('');
    setReplyTo(null);
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const url = it.file
          ? await uploadDroppedImage(userId!, it.file)
          : await uploadLocalImage(userId!, it.uri!);
        await send(i === 0 ? caption : '', { url, type: 'image' }, i === 0 ? rid : null);
      }
      impact('light');
      scrollToEnd(true);
    } finally {
      setBusy(false);
    }
  }, [draft, pending, send, scrollToEnd, userId, replyTo]);

  // ---- staging images ------------------------------------------------------
  const addImages = useCallback(async () => {
    try {
      const uris = await pickImages();
      if (uris.length) {
        setPending((p) => [...p, ...uris.map((uri) => ({ id: newId(), previewUri: uri, uri }))]);
      }
    } catch {
      // permission denied / cancelled
    }
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((p) => p.filter((x) => x.id !== id));
  }, []);

  // ---- web drag-and-drop ---------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'web' || !userId) return;
    const node = dropRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        setPending((p) => [
          ...p,
          ...files.map((file) => ({ id: newId(), previewUri: URL.createObjectURL(file), file })),
        ]);
      }
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [userId]);

  // ---- voice recording -----------------------------------------------------
  useEffect(() => {
    meterRef.current = recorderState?.metering ?? undefined;
  }, [recorderState?.metering]);

  useEffect(() => {
    if (!recording) {
      setRecBars([]);
      return;
    }
    setRecSecs(0);
    const secs = setInterval(() => setRecSecs((s) => s + 1), 1000);
    // Scroll a live waveform — driven by mic level (metering) with a fallback.
    const wave = setInterval(() => {
      const m = meterRef.current;
      const level =
        typeof m === 'number' && isFinite(m)
          ? Math.max(0.08, Math.min(1, (m + 55) / 55))
          : 0.25 + Math.random() * 0.6;
      setRecBars((prev) => [...prev.slice(-29), level]);
    }, 110);
    return () => {
      clearInterval(secs);
      clearInterval(wave);
    };
  }, [recording]);

  const startRecording = useCallback(async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      impact('medium');
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [recorder]);

  const cancelRecording = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      /* noop */
    }
    setRecording(false);
  }, [recorder]);

  const stopAndSend = useCallback(async () => {
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || !userId) return;
      setBusy(true);
      const url = await uploadLocalAudio(userId, uri);
      await send('', { url, type: 'audio' });
      impact('light');
      scrollToEnd(true);
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }, [recorder, userId, send, scrollToEnd]);

  const openProfile = useCallback(
    (id: string) => {
      if (id && id !== userId) {
        selection();
        router.push({ pathname: '/creator/[id]', params: { id } });
      }
    },
    [router, userId],
  );

  // ---- render --------------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const mine = item.sender_id === userId;
      const sender = senders[item.sender_id];
      const isImage = item.attachment_type === 'image' && !!item.attachment_url;
      const rxns = aggregateReactions(reactions[item.id], userId);
      return (
        <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
          {!mine && (
            <Pressable onPress={() => openProfile(item.sender_id)} hitSlop={4}>
              <BrutalAvatar name={sender?.full_name} uri={sender?.avatar_url} size={30} />
            </Pressable>
          )}
          <View style={[styles.bubbleCol, mine && { alignItems: 'flex-end' }]}>
            {!mine && showSenders && !!sender?.full_name && (
              <Pressable onPress={() => openProfile(item.sender_id)} style={styles.senderRow} hitSlop={4}>
                {sender?.role === 'creator' && (
                  <Image source={badgeFor(sender.level).source} style={styles.senderBadge} contentFit="contain" />
                )}
                <ThemedText style={[styles.senderName, { color: theme.textSecondary }]}>{sender.full_name}</ThemedText>
                {sender?.role === 'creator' && (
                  <View style={[styles.lvPill, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                    <ThemedText style={[styles.lvPillText, { color: theme.textSecondary }]}>Lv {sender.level}</ThemedText>
                  </View>
                )}
              </Pressable>
            )}
            <Pressable
              onLongPress={() => {
                impact('medium');
                const node = bubbleRefs.current.get(item.id);
                if (node?.measureInWindow) {
                  node.measureInWindow((x, y, w, h) => {
                    setFocusRect({ x, y, w, h });
                    setActionMsg(item);
                  });
                } else {
                  setFocusRect(null);
                  setActionMsg(item);
                }
              }}
              delayLongPress={220}>
              <View
                ref={(node) => {
                  if (node) bubbleRefs.current.set(item.id, node);
                  else bubbleRefs.current.delete(item.id);
                }}
                style={[
                  styles.bubble,
                  brutalShadow(theme.shadow, 3),
                  { borderColor: theme.border },
                  mine ? { backgroundColor: theme.primary } : { backgroundColor: theme.card },
                  isImage && styles.bubbleImage,
                  actionMsg?.id === item.id && { opacity: 0 }, // hide original while focused
                ]}>
                <BubbleContent item={item} mine={mine} theme={theme} senders={senders} userId={userId} messages={messages} onImagePress={(uri, caption) => setViewer({ uri, caption })} />
              </View>
            </Pressable>
            {rxns.length > 0 && (
              <View style={[styles.reactionRow, mine ? styles.reactionRowMine : styles.reactionRowTheirs]}>
                {rxns.map((r) => (
                  <ReactionChip
                    key={r.emoji}
                    emoji={r.emoji}
                    count={r.count}
                    mine={r.mine}
                    animate={animateRx}
                    onPress={() => {
                      selection();
                      setReactInfo(item);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      );
    },
    [userId, theme, senders, showSenders, messages, reactions, toggleReaction, openProfile, actionMsg, animateRx],
  );

  const canSend = draft.trim().length > 0 || pending.length > 0;

  return (
    <View ref={dropRef} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardOffset : 0}>
        {loading ? (
          <ChatSkeleton />
        ) : (
          <FlatList
            ref={listRef}
            data={inverted}
            inverted
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            ListEmptyComponent={
              <View style={[styles.center, styles.flipBack]}>
                <ThemedText type="small" themeColor="textSecondary">
                  no messages yet — say hello 👋
                </ThemedText>
              </View>
            }
          />
        )}

        {dragging && (
          <View style={[styles.dropOverlay, { borderColor: theme.primary, backgroundColor: theme.primaryMuted }]}>
            <Ionicons name="image" size={32} color={theme.primary} />
            <ThemedText style={{ color: theme.primary, fontWeight: '800' }}>drop image to send</ThemedText>
          </View>
        )}

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.errorText}>
            {error}
          </ThemedText>
        )}

        {/* staged image tray */}
        {pending.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tray, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}
            contentContainerStyle={styles.trayContent}>
            {pending.map((p) => (
              <View key={p.id} style={styles.thumbWrap}>
                <Image source={{ uri: p.previewUri }} style={styles.thumb} contentFit="cover" />
                <Pressable onPress={() => removePending(p.id)} style={[styles.thumbX, { backgroundColor: theme.danger }]}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={addImages} style={[styles.thumbAdd, { borderColor: theme.border }]}>
              <Ionicons name="add" size={26} color={theme.textSecondary} />
            </Pressable>
          </ScrollView>
        )}

        {/* replying-to bar */}
        {replyTo && (
          <View style={[styles.replyBar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
            <View style={[styles.replyAccent, { backgroundColor: theme.primary }]} />
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.replyBarName, { color: theme.primary }]} numberOfLines={1}>
                Replying to {senders[replyTo.sender_id]?.full_name ?? (replyTo.sender_id === userId ? 'yourself' : 'them')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {msgPreview(replyTo)}
              </ThemedText>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* composer */}
        <View
          style={[
            styles.composer,
            { backgroundColor: theme.backgroundElement, paddingBottom: bottomInset + Spacing.two },
          ]}>
          {recording ? (
            <View style={styles.recRow}>
              <Pressable onPress={cancelRecording} hitSlop={8} style={styles.recBtn}>
                <Ionicons name="trash" size={24} color={theme.danger} />
              </Pressable>
              <View style={[styles.recDot, { backgroundColor: theme.danger }]} />
              <ThemedText style={styles.recTime}>{`${Math.floor(recSecs / 60)}:${(recSecs % 60)
                .toString()
                .padStart(2, '0')}`}</ThemedText>
              <View style={styles.recWave}>
                <Waveform
                  heights={recBars}
                  progress={1}
                  activeColor={theme.danger}
                  inactiveColor={theme.backgroundSelected}
                />
              </View>
              <Pressable onPress={stopAndSend} style={[styles.send, { backgroundColor: theme.primary }]}>
                <Ionicons name="arrow-up" size={22} color={theme.primaryText} />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable onPress={addImages} disabled={busy} style={styles.attach}>
                <Ionicons name="add-circle" size={32} color={theme.primary} />
              </Pressable>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                ]}
                placeholder={pending.length ? 'add a caption…' : 'say something'}
                placeholderTextColor={theme.textSecondary}
                value={draft}
                onChangeText={setDraft}
                onFocus={() => scrollToEnd(true)}
                multiline
                onSubmitEditing={onSend}
                returnKeyType="send"
              />
              {busy ? (
                <View style={styles.send}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : canSend ? (
                <Pressable
                  onPress={onSend}
                  style={({ pressed }) => [
                    styles.send,
                    { backgroundColor: theme.primary },
                    pressed && { transform: [{ scale: 0.94 }] },
                  ]}>
                  <Ionicons name="arrow-up" size={22} color={theme.primaryText} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={startRecording}
                  style={({ pressed }) => [
                    styles.send,
                    { backgroundColor: theme.backgroundSelected },
                    pressed && { transform: [{ scale: 0.94 }] },
                  ]}>
                  <Ionicons name="mic" size={22} color={theme.text} />
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* full-screen image viewer — pinch to zoom + caption */}
      <Modal visible={!!viewer} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewer(null)}>
        <View style={styles.lightbox}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.lightboxScroll}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}>
            {viewer && <Image source={{ uri: viewer.uri }} style={[styles.lightboxImg, { width: winW, height: winH * 0.82 }]} contentFit="contain" />}
          </ScrollView>
          {viewer?.caption ? (
            <View style={[styles.lightboxCaption, { paddingBottom: insets.bottom + Spacing.three }]}>
              <ThemedText style={styles.lightboxCaptionText}>{viewer.caption}</ThemedText>
            </View>
          ) : null}
          <Pressable onPress={() => setViewer(null)} style={[styles.lightboxClose, { top: insets.top + Spacing.two }]} hitSlop={12}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </View>
      </Modal>

      {/* long-press: WhatsApp-style focused message */}
      <Modal visible={!!actionMsg} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setActionMsg(null)}>
        <Pressable style={styles.focusBackdrop} onPress={() => setActionMsg(null)}>
          {actionMsg &&
            (() => {
              const fm = actionMsg;
              const isMine = fm.sender_id === userId;
              const myReaction = (reactions[fm.id] ?? []).find((r) => r.profile_id === userId)?.emoji;
              const react = (e: string) => {
                selection();
                toggleReaction(fm.id, e);
                setActionMsg(null);
              };
              // Anchor the focus UI to where the real bubble sits on screen.
              const isImg = fm.attachment_type === 'image' && !!fm.attachment_url;
              const hasRx = (reactions[fm.id]?.length ?? 0) > 0;
              const menuCount = 1 + (hasRx ? 1 : 0) + (isMine ? 1 : 0);
              const GAP = 10;
              const BAR_H = 58;
              const MENU_H = menuCount * 52;
              const topSafe = insets.top + 10;
              const botSafe = winH - insets.bottom - 10;
              const bw = focusRect?.w ?? Math.min(280, winW * 0.72);
              const bh = focusRect?.h ?? 72;
              const minTop = topSafe + BAR_H + GAP;
              const maxTop = Math.max(minTop, botSafe - MENU_H - GAP - bh);
              const top = Math.min(Math.max(focusRect ? focusRect.y : (winH - bh) / 2, minTop), maxTop);
              const side: { left: number } | { right: number } = isMine
                ? { right: Math.min(Math.max(8, winW - ((focusRect?.x ?? winW - bw - 16) + bw)), winW - 64) }
                : { left: Math.min(Math.max(8, focusRect?.x ?? 16), winW - 64) };
              return (
                <>
                  {/* emoji bar — bounces in */}
                  {pickAll ? (
                    <Animated.View style={[styles.emojiBarCard, { position: 'absolute', top: topSafe, left: 16, right: 16, backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5), { opacity: focusAnim }]}>
                      <ScrollView style={styles.emojiGridScroll} contentContainerStyle={styles.emojiGrid} keyboardShouldPersistTaps="handled">
                        {ALL_EMOJIS.map((e) => (
                          <Pressable key={e} onPress={() => react(e)} style={({ pressed }) => [styles.emojiGridBtn, pressed && { backgroundColor: theme.backgroundElement }]}>
                            <ThemedText style={styles.emojiGridText}>{e}</ThemedText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </Animated.View>
                  ) : (
                    <Animated.View
                      style={[
                        styles.emojiBar,
                        { position: 'absolute', top: top - BAR_H - GAP, ...side, backgroundColor: theme.card, borderColor: theme.border },
                        brutalShadow(theme.shadow, 5),
                        {
                          opacity: focusAnim,
                          transform: [
                            { scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                            { translateY: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                          ],
                        },
                      ]}>
                      {QUICK_EMOJIS.map((e) => (
                        <Pressable
                          key={e}
                          onPress={() => react(e)}
                          style={({ pressed }) => [styles.emojiBtn, myReaction === e && { backgroundColor: theme.primaryMuted }, pressed && { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText style={styles.emojiBig}>{e}</ThemedText>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => {
                          selection();
                          setPickAll(true);
                        }}
                        style={({ pressed }) => [styles.emojiBtn, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}>
                        <Ionicons name="add" size={24} color={theme.text} />
                      </Pressable>
                    </Animated.View>
                  )}

                  {/* the SAME message, lifted into focus (identical styling) */}
                  <View
                    style={[
                      styles.bubble,
                      { position: 'absolute', top, ...side, ...(isImg ? {} : { width: bw }) },
                      brutalShadow(theme.shadow, 3),
                      { borderColor: theme.border },
                      isMine ? { backgroundColor: theme.primary } : { backgroundColor: theme.card },
                      isImg && styles.bubbleImage,
                    ]}>
                    <BubbleContent item={fm} mine={isMine} theme={theme} senders={senders} userId={userId} messages={messages} />
                  </View>

                  {/* context menu */}
                  <Animated.View style={[styles.focusMenu, { position: 'absolute', top: top + bh + GAP, ...side }, { backgroundColor: theme.card, borderColor: theme.border }, brutalShadow(theme.shadow, 5), { opacity: focusAnim }]}>
                    <Pressable
                      onPress={() => {
                        impact('light');
                        setReplyTo(fm);
                        setActionMsg(null);
                      }}
                      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText style={styles.menuLabel}>Reply</ThemedText>
                      <Ionicons name="arrow-undo" size={20} color={theme.text} />
                    </Pressable>
                    {(reactions[fm.id]?.length ?? 0) > 0 && (
                      <Pressable
                        onPress={() => {
                          setActionMsg(null);
                          setReactInfo(fm);
                        }}
                        style={({ pressed }) => [styles.menuItem, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText style={styles.menuLabel}>Who reacted</ThemedText>
                        <Ionicons name="happy-outline" size={20} color={theme.text} />
                      </Pressable>
                    )}
                    {isMine && (
                      <Pressable
                        onPress={() => {
                          impact('medium');
                          deleteMessage(fm.id);
                          setActionMsg(null);
                        }}
                        style={({ pressed }) => [styles.menuItem, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText style={[styles.menuLabel, { color: theme.danger }]}>Delete</ThemedText>
                        <Ionicons name="trash" size={20} color={theme.danger} />
                      </Pressable>
                    )}
                    {!isMine && (
                      <>
                        <Pressable
                          onPress={() => {
                            impact('medium');
                            reportUser(fm.sender_id, fm.id, conversationId, null, fm.body ?? fm.attachment_type ?? '');
                            setActionMsg(null);
                            setToast('Reported — our team will review it.');
                          }}
                          style={({ pressed }) => [styles.menuItem, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText style={styles.menuLabel}>Report</ThemedText>
                          <Ionicons name="flag-outline" size={20} color={theme.text} />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            impact('medium');
                            blockUser(fm.sender_id);
                            setActionMsg(null);
                            setToast(`Blocked ${senders[fm.sender_id]?.full_name ?? 'user'} — you won't see their messages.`);
                          }}
                          style={({ pressed }) => [styles.menuItem, { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText style={[styles.menuLabel, { color: theme.danger }]}>Block</ThemedText>
                          <Ionicons name="ban-outline" size={20} color={theme.danger} />
                        </Pressable>
                      </>
                    )}
                  </Animated.View>
                </>
              );
            })()}
        </Pressable>
      </Modal>

      {/* who reacted */}
      <Modal visible={!!reactInfo} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setReactInfo(null)}>
        <Pressable style={[styles.sheetBackdrop, Platform.OS === 'web' && styles.sheetBackdropWeb]} onPress={() => setReactInfo(null)}>
          <Pressable
            style={[styles.sheet, Platform.OS === 'web' && styles.sheetWeb, { backgroundColor: theme.card, borderColor: theme.border }, Platform.OS === 'web' && brutalShadow(theme.shadow, 6)]}
            onPress={() => {}}>
            {Platform.OS !== 'web' && <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />}
            <ThemedText style={styles.sheetTitle}>Reactions</ThemedText>
            {reactInfo && (reactions[reactInfo.id] ?? []).length > 0 ? (
              (reactions[reactInfo.id] ?? []).map((r, i) => {
                const mineR = r.profile_id === userId;
                const name = mineR ? 'You' : senders[r.profile_id]?.full_name ?? reactorNames[r.profile_id] ?? 'Someone';
                return (
                  <View key={r.profile_id + r.emoji + i} style={styles.reactorRow}>
                    <BrutalAvatar name={name} uri={senders[r.profile_id]?.avatar_url} size={36} />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.reactorName}>{name}</ThemedText>
                      {mineR && (
                        <ThemedText type="small" themeColor="textSecondary">
                          hold the message to change or remove
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText style={styles.reactorEmoji}>{r.emoji}</ThemedText>
                  </View>
                );
              })
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: Spacing.three }}>
                No reactions yet.
              </ThemedText>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* report / block confirmation toast */}
      {toast && (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={[styles.toast, { backgroundColor: theme.text }]}>
            <ThemedText style={[styles.toastText, { color: theme.background }]} numberOfLines={2}>
              {toast}
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center', zIndex: 60 },
  toast: { maxWidth: 360, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.full },
  toastText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.six },
  flipBack: { transform: [{ scaleY: -1 }] },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    flexGrow: 1,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubbleCol: { maxWidth: '82%' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: Spacing.two, marginBottom: 3 },
  senderBadge: { width: 16, height: 16 },
  senderName: { fontSize: 12.5, fontWeight: '800' },
  lvPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full, borderWidth: 1 },
  lvPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.lg,
    borderWidth: Border.width,
    gap: 3,
  },
  bubbleImage: { padding: Spacing.one },
  bubbleText: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  quote: { borderLeftWidth: 3, borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 5, marginBottom: 6, gap: 1 },
  quoteName: { fontSize: 12, fontWeight: '800' },
  quoteText: { fontSize: 13, fontWeight: '500' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  reactionRowTheirs: { justifyContent: 'flex-start', marginLeft: Spacing.two },
  reactionRowMine: { justifyContent: 'flex-end', marginRight: Spacing.two },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1.5 },
  reactionEmoji: { fontSize: 15, lineHeight: 20, textAlign: 'center' },
  reactionCount: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderTopWidth: Border.width },
  replyAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  replyBarName: { fontSize: 13, fontWeight: '800' },
  // Focused (long-press) overlay — WhatsApp style
  focusBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  emojiBar: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing.two, paddingVertical: 5, borderRadius: Radius.full, borderWidth: Border.width },
  emojiBarCard: { width: '100%', borderRadius: Radius.lg, borderWidth: Border.width, paddingVertical: Spacing.one },
  emojiBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emojiBig: { fontSize: 27, lineHeight: 34, textAlign: 'center' },
  emojiGridScroll: { maxHeight: 180 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.two, paddingBottom: Spacing.two },
  emojiGridBtn: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  emojiGridText: { fontSize: 26, lineHeight: 34, textAlign: 'center' },
  focusMenu: { minWidth: 200, borderRadius: Radius.lg, borderWidth: Border.width, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three },
  menuLabel: { fontSize: 16, fontWeight: '700' },
  // Who-reacted sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetBackdropWeb: { justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderWidth: Border.widthThick, borderBottomWidth: 0, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.six, gap: Spacing.two },
  sheetWeb: { borderRadius: Radius.lg, borderBottomWidth: Border.widthThick, width: '100%', maxWidth: 360, maxHeight: '80%', paddingTop: Spacing.three, paddingBottom: Spacing.three },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.two, opacity: 0.5 },
  sheetTitle: { fontSize: 18, fontWeight: '900', marginBottom: Spacing.one },
  reactorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  reactorName: { fontSize: 15, fontWeight: '800' },
  reactorEmoji: { fontSize: 22, lineHeight: 28 },
  caption: { paddingHorizontal: Spacing.two, paddingTop: 4 },
  time: { fontSize: 11, fontWeight: '500' },
  timeOnImage: { paddingHorizontal: Spacing.two, paddingBottom: 2 },
  errorText: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
  dropOverlay: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    right: Spacing.three,
    bottom: 90,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    opacity: 0.96,
  },
  tray: {
    borderTopWidth: Border.width,
    maxHeight: 96,
  },
  trayContent: { padding: Spacing.two, gap: Spacing.two, alignItems: 'center' },
  thumbWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: Radius.sm },
  thumbX: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbAdd: {
    width: 64,
    height: 64,
    borderRadius: Radius.sm,
    borderWidth: Border.width,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  attach: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: Radius.md,
    borderWidth: Border.width,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    fontSize: 16,
  },
  send: { width: 46, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  recRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  recBtn: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  recDot: { width: 12, height: 12, borderRadius: 6 },
  recWave: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  recTime: { fontSize: 16, fontWeight: '700', minWidth: 44 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  lightboxScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  lightboxImg: {},
  lightboxCaption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, backgroundColor: 'rgba(0,0,0,0.5)' },
  lightboxCaptionText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  lightboxClose: { position: 'absolute', right: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
