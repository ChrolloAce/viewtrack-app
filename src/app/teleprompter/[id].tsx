import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipReview } from '@/components/clip-review';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemedText } from '@/components/themed-text';
import { Border, brutalShadow, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { uploadRecording } from '@/lib/recordings';
import { supabase } from '@/lib/supabase';
import { setScriptDone } from '@/lib/use-completions';

// In-app video playback only works if the expo-video native module is in the
// build — otherwise we show a fallback (no crash) until the next rebuild.
const VIDEO_OK = !!requireOptionalNativeModule('ExpoVideo');

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// Split a script into sentences (each an array of words) for nicer reading +
// word-by-word highlighting.
function toSentences(body: string): string[][] {
  const clean = (body || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(' ').filter(Boolean));
}

type Mode = 'assisted' | 'non-assisted';

export default function Teleprompter() {
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/record'));
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [libPerm, requestLib] = MediaLibrary.usePermissions();

  const cameraRef = useRef<CameraView>(null);
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const contentH = useRef(0);
  const viewH = useRef(0);

  const [body, setBody] = useState('');
  const [mode, setMode] = useState<Mode>('assisted');
  const [target, setTarget] = useState(60);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedDone, setSavedDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('scripts')
      .select('body, target_seconds')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setBody(data?.body ?? '');
        if (data?.target_seconds) setTarget(data.target_seconds);
      });
  }, [id]);

  useEffect(() => {
    if (camPerm && !camPerm.granted) requestCam();
    if (micPerm && !micPerm.granted) requestMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camPerm?.granted, micPerm?.granted]);

  // Split the script into sentences for easy reading.
  const sentences = useMemo(() => toSentences(body).map((s) => s.join(' ')), [body]);

  // Assisted mode: steadily scroll the script so it finishes in `target` seconds.
  useEffect(() => {
    if (!scrolling || mode !== 'assisted') return;
    const start = Date.now();
    const t = setInterval(() => {
      const frac = Math.min(1, (Date.now() - start) / (target * 1000));
      const max = Math.max(1, contentH.current - viewH.current);
      scrollRef.current?.scrollTo({ y: frac * max, animated: false });
      if (frac >= 1) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, [scrolling, mode, target]);

  useEffect(() => {
    if (!recording) return;
    setRecSecs(0);
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function startRecording() {
    if (!cameraRef.current || recording) return;
    setRecordedUri(null);
    setSavedDone(false);
    setRecording(true);
    if (mode === 'assisted') {
      offset.current = 0;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setScrolling(true);
    }
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 180 });
      if (video?.uri) setRecordedUri(video.uri);
    } catch {
      /* ignore */
    }
    setRecording(false);
    setScrolling(false);
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
  }

  async function saveVideo() {
    if (!recordedUri || !session?.user?.id) return;
    setSaving(true);

    // Fire the backend upload in the background — the creator never waits on it.
    uploadRecording({
      userId: session.user.id,
      uri: recordedUri,
      scriptId: id ?? null,
      title: title ?? null,
      durationSeconds: recSecs,
    }).catch(() => {
      /* silent — it retries on the next save, and we don't surface it */
    });

    try {
      // Save to the camera roll — this is what we confirm to the creator.
      if (Platform.OS !== 'web') {
        let lib = libPerm;
        if (!lib?.granted) lib = await requestLib();
        if (!lib?.granted) {
          setSaving(false);
          Alert.alert('Allow photo access', 'Turn on photo library access in Settings so we can save your video to the camera roll.');
          return;
        }
        await MediaLibrary.saveToLibraryAsync(recordedUri);
      }
      if (id) await setScriptDone(id, true, session.user.id);
      setSavedDone(true);
    } catch (e) {
      Alert.alert('Could not save video', e instanceof Error ? e.message : 'Please try again.');
    }
    setSaving(false);
  }

  // ---- permission gate ----
  if (!camPerm) return <View style={styles.root} />;
  if (!camPerm.granted || (micPerm && !micPerm.granted)) {
    return (
      <View style={[styles.root, styles.perm]}>
        <Ionicons name="videocam-outline" size={56} color="#fff" />
        <ThemedText style={styles.permTitle}>Camera & mic needed</ThemedText>
        <ThemedText style={styles.permSub}>Allow access so you can film your scripts.</ThemedText>
        <Pressable
          onPress={async () => {
            await requestCam();
            await requestMic();
          }}
          style={styles.permBtn}>
          <ThemedText style={styles.permBtnText}>grant access</ThemedText>
        </Pressable>
        <Pressable onPress={close} style={styles.permClose}>
          <ThemedText style={{ color: 'rgba(255,255,255,0.7)' }}>cancel</ThemedText>
        </Pressable>
      </View>
    );
  }

  // ---- review: play back the clip (no overlay) + save ----
  if (recordedUri) {
    const fallback = (
      <View style={[StyleSheet.absoluteFill, styles.previewFallback]}>
        <Ionicons name="checkmark-circle" size={44} color="#fff" />
        <ThemedText style={styles.previewFallbackText}>Recorded ✓</ThemedText>
        <ThemedText style={styles.previewFallbackSub}>Update the app to preview here — you can still save below.</ThemedText>
      </View>
    );
    return (
      <View style={styles.root}>
        {VIDEO_OK ? (
          <ErrorBoundary fallback={fallback}>
            <ClipReview uri={recordedUri} />
          </ErrorBoundary>
        ) : (
          fallback
        )}
        <SafeAreaView style={styles.flex} edges={['bottom']} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingTop: insets.top + Spacing.four }]} pointerEvents="box-none">
            <Pressable onPress={() => setRecordedUri(null)} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.flex} pointerEvents="none" />
          <View style={styles.bottom}>
            {savedDone ? (
              <>
                <View style={[styles.statusPill, { backgroundColor: 'rgba(21,163,74,0.95)' }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <ThemedText style={styles.statusText}>saved to your camera roll</ThemedText>
                </View>
                <Pressable onPress={close} style={styles.doneBtn}>
                  <ThemedText style={styles.doneText}>done</ThemedText>
                </Pressable>
              </>
            ) : (
              <View style={styles.reviewRow}>
                <Pressable onPress={() => setRecordedUri(null)} style={styles.retakeBtn}>
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <ThemedText style={styles.retakeText}>retake</ThemedText>
                </Pressable>
                <Pressable onPress={saveVideo} disabled={saving} style={styles.saveBtn}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="download" size={20} color="#fff" />
                      <ThemedText style={styles.saveText}>save video</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video" />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

      <SafeAreaView style={styles.flex} edges={['bottom']}>
        {/* top bar — X left, flip camera right (below the notch) */}
        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.four }]}>
          <Pressable onPress={close} style={styles.iconBtn} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
            style={styles.iconBtn}
            hitSlop={12}>
            <Ionicons name="camera-reverse" size={26} color="#fff" />
          </Pressable>
        </View>

        {/* teleprompter (assisted only) */}
        {mode === 'assisted' ? (
          <View style={styles.prompterWrap} onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}>
            <ScrollView
              ref={scrollRef}
              onContentSizeChange={(_w, h) => (contentH.current = h)}
              onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
              contentContainerStyle={styles.prompterContent}>
              {sentences.map((sentence, si) => (
                <ThemedText key={si} style={styles.sentence}>
                  {sentence}
                </ThemedText>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.flex} pointerEvents="none" />
        )}

        {/* bottom */}
        <View style={styles.bottom}>
            {/* toolbar */}
            <View style={styles.toolbar}>
              <View style={styles.modeToggle}>
                {(['assisted', 'non-assisted'] as Mode[]).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.modeBtn, mode === m && styles.modeBtnOn]}>
                    <ThemedText style={mode === m ? styles.modeOnText : styles.modeText}>{m}</ThemedText>
                  </Pressable>
                ))}
              </View>
              {mode === 'assisted' && (
                <View style={styles.durations}>
                  {[30, 45, 60, 90].map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setTarget(d)}
                      style={[styles.durChip, target === d && styles.durChipOn]}>
                      <ThemedText style={target === d ? styles.durOnText : styles.durText}>{d}s</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
              <ThemedText style={styles.modeHint}>
                {mode === 'assisted'
                  ? `Script scrolls over ${fmt(target)} — read along as you film`
                  : 'Just film it in the app — no script on screen'}
              </ThemedText>
            </View>

            {recording && (
              <View style={styles.statusPill}>
                <View style={styles.recDot} />
                <ThemedText style={styles.statusText}>{fmt(recSecs)}</ThemedText>
              </View>
            )}

            <Pressable onPressIn={startRecording} onPressOut={stopRecording} style={styles.recordOuter}>
              <View style={[styles.recordInner, recording && styles.recordInnerActive]} />
            </Pressable>
            <ThemedText style={styles.holdHint}>{recording ? 'release to stop' : 'hold to record'}</ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.18)' },

  perm: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  permTitle: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '800', marginTop: Spacing.two },
  permSub: { color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  permBtn: {
    marginTop: Spacing.three,
    backgroundColor: '#F4731E',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
  },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  permClose: { marginTop: Spacing.two, padding: Spacing.two },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  previewFallback: { backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
  previewFallbackText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  previewFallbackSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  prompterWrap: { flex: 1, marginVertical: Spacing.two },
  prompterContent: { padding: Spacing.four, paddingVertical: Spacing.six, gap: Spacing.four },
  sentence: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 42,
    fontWeight: '700',
    textAlign: 'left',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 8,
  },

  bottom: { alignItems: 'center', paddingBottom: Spacing.two, gap: Spacing.two },
  toolbar: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    padding: 3,
  },
  modeBtn: { paddingHorizontal: Spacing.four, paddingVertical: 6, borderRadius: Radius.full },
  modeBtnOn: { backgroundColor: '#F4731E' },
  modeText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 14 },
  modeOnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  durations: { flexDirection: 'row', gap: Spacing.one },
  durChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  durChipOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  durText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 13 },
  durOnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  modeHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', textAlign: 'center' },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  statusText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  recordOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#EF4444' },
  recordInnerActive: { width: 30, height: 30, borderRadius: 8 },
  holdHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },

  reviewTitle: { color: '#fff', fontSize: 20, lineHeight: 26, fontWeight: '800' },
  reviewRow: { flexDirection: 'row', gap: Spacing.three },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: Border.widthThick,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    ...brutalShadow('rgba(0,0,0,0.55)', 4),
  },
  retakeText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: Border.widthThick,
    borderColor: '#fff',
    backgroundColor: '#F4731E',
    minWidth: 150,
    justifyContent: 'center',
    ...brutalShadow('rgba(0,0,0,0.55)', 4),
  },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  doneBtn: {
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: Border.widthThick,
    borderColor: '#000',
    backgroundColor: '#fff',
    ...brutalShadow('rgba(0,0,0,0.5)', 4),
  },
  doneText: { color: '#000', fontWeight: '900', fontSize: 16 },
});
