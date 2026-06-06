import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrutalCard } from '@/components/brutal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Border, brutalShadow, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { downloadToDevice } from '@/lib/download';
import { supabase } from '@/lib/supabase';
import { setScriptDone, useCompletions } from '@/lib/use-completions';

type Step = { text: string; image: string | null };
type Asset = { url: string; label: string; kind: string; mime: string | null };
type Details = { tagline?: string | null; structure?: Step[]; tips?: Step[]; bestFor?: string[]; assets?: Asset[] };
type Script = { title: string; body: string; thumbnail: string | null; details: Details | null };

function assetIcon(mime: string | null) {
  if (mime?.startsWith('video')) return 'videocam';
  if (mime?.startsWith('image')) return 'image';
  return 'document-text';
}

// Public-domain Bible translations available from bible-api.com (the verse-card
// renders whatever text we pass it; we fetch the right text per version).
const VERSIONS: { id: string; api: string }[] = [
  { id: 'WEB', api: 'web' },
  { id: 'KJV', api: 'kjv' },
  { id: 'ASV', api: 'asv' },
  { id: 'BBE', api: 'bbe' },
];

function getParam(url: string, key: string): string {
  const m = url.match(new RegExp('[?&]' + key + '=([^&]*)'));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

function verseCardUrl(ref: string, text: string, version: string, style: string) {
  return (
    'https://www.superbriefed.com/api/verse-card' +
    `?ref=${encodeURIComponent(ref)}&text=${encodeURIComponent(text)}` +
    `&version=${encodeURIComponent(version)}&style=${encodeURIComponent(style || 'light')}`
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

export default function BriefScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const { doneIds } = useCompletions();
  const [script, setScript] = useState<Script | null>(null);
  const [override, setOverride] = useState<boolean | null>(null);
  const done = override ?? doneIds.has(id ?? '');

  useEffect(() => {
    if (!id) return;
    supabase
      .from('scripts')
      .select('title, body, thumbnail, details')
      .eq('id', id)
      .single()
      .then(({ data }) => setScript(data as unknown as Script));
  }, [id]);

  const toggleDone = () => {
    if (!uid || !id) return;
    const next = !done;
    setOverride(next);
    setScriptDone(id, next, uid);
  };

  const d = (script?.details ?? {}) as Details;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/record'))}
            style={[styles.back, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            brief
          </ThemedText>
          <Pressable
            onPress={toggleDone}
            style={({ pressed }) => [
              styles.markDone,
              { backgroundColor: done ? theme.success : theme.card, borderColor: theme.border },
              pressed && { opacity: 0.85 },
            ]}>
            <Ionicons name={done ? 'checkmark-circle' : 'checkmark'} size={16} color={done ? '#fff' : theme.text} />
            <ThemedText style={[styles.markDoneText, { color: done ? '#fff' : theme.text }]}>
              {done ? 'done' : 'mark as done'}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
          {script?.thumbnail && (
            <Image source={{ uri: script.thumbnail }} style={[styles.hero, { borderColor: theme.border }]} contentFit="cover" />
          )}
          <ThemedText style={styles.title}>{script?.title ?? ''}</ThemedText>
          {!!d.tagline && (
            <ThemedText type="small" themeColor="textSecondary">
              {d.tagline}
            </ThemedText>
          )}

          {!!script?.body && (
            <Section title="the script">
              <BrutalCard>
                <ThemedText style={styles.scriptText}>{script.body}</ThemedText>
              </BrutalCard>
            </Section>
          )}

          {!!d.structure?.length && (
            <Section title="step-by-step">
              {d.structure.map((s, i) => (
                <BrutalCard key={i} style={styles.stepCard}>
                  <View style={styles.stepHead}>
                    <View style={[styles.stepNum, { backgroundColor: theme.primary }]}>
                      <ThemedText style={styles.stepNumText}>{i + 1}</ThemedText>
                    </View>
                    <ThemedText style={styles.stepText}>{s.text}</ThemedText>
                  </View>
                  {!!s.image && (
                    <Image source={{ uri: s.image }} style={[styles.stepImg, { borderColor: theme.border }]} contentFit="cover" />
                  )}
                </BrutalCard>
              ))}
            </Section>
          )}

          {!!d.tips?.length && (
            <Section title="tips">
              <BrutalCard style={{ gap: Spacing.two }}>
                {d.tips.map((t, i) => (
                  <View key={i} style={styles.tipRow}>
                    <Ionicons name="bulb" size={18} color={theme.primary} />
                    <ThemedText style={styles.tipText}>{t.text}</ThemedText>
                  </View>
                ))}
              </BrutalCard>
            </Section>
          )}

          {!!d.assets?.length && (
            <Section title="assets">
              {d.assets.map((a, i) => (
                <AssetCard key={i} asset={a} />
              ))}
            </Section>
          )}
        </ScrollView>

        {/* floating record button */}
        <View style={[styles.floating, { paddingBottom: insets.bottom + Spacing.two }]} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push({ pathname: '/teleprompter/[id]', params: { id, title: script?.title ?? '' } })}
            style={({ pressed }) => [
              styles.recordBtn,
              { backgroundColor: theme.primary, borderColor: theme.border },
              brutalShadow(theme.shadow, 5),
              pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
            ]}>
            <Ionicons name="videocam" size={22} color={theme.primaryText} />
            <ThemedText style={[styles.recordText, { color: theme.primaryText }]}>start recording</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Saves the photo/video to the camera roll (with progress + result). */
function AssetBar({ label, url, mime }: { label: string; url: string; mime: string | null }) {
  const theme = useTheme();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function onDownload() {
    if (state === 'busy') return;
    setState('busy');
    const r = await downloadToDevice(url, mime);
    if (r === 'saved') {
      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } else if (r === 'error') {
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    } else {
      setState('idle'); // opened in browser/viewer
    }
  }

  const dlLabel = state === 'busy' ? 'saving…' : state === 'done' ? 'saved ✓' : state === 'error' ? 'failed' : 'download';

  return (
    <View style={styles.assetBar}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.assetBarLabel} numberOfLines={1}>
        {label}
      </ThemedText>
      <Pressable
        onPress={onDownload}
        style={({ pressed }) => [styles.dl, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.7 }]}>
        {state === 'busy' ? (
          <ActivityIndicator size="small" color={theme.text} />
        ) : (
          <Ionicons name={state === 'done' ? 'checkmark' : 'download-outline'} size={15} color={theme.text} />
        )}
        <ThemedText style={styles.dlText}>{dlLabel}</ThemedText>
      </Pressable>
    </View>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const theme = useTheme();
  if (!asset.url) return null;
  if (asset.kind === 'verse') return <VerseCard asset={asset} />;

  const isImage = asset.mime?.startsWith('image') || asset.kind === 'image';
  const isVideo = asset.mime?.startsWith('video') || asset.kind === 'video';

  if (isImage) {
    return (
      <View style={styles.assetMedia}>
        <Image source={{ uri: asset.url }} style={[styles.assetImg, { borderColor: theme.border }]} contentFit="cover" />
        <AssetBar label={asset.label} url={asset.url} mime={asset.mime} />
      </View>
    );
  }

  if (isVideo) {
    return (
      <View style={styles.assetMedia}>
        <Pressable
          onPress={() => Linking.openURL(asset.url)}
          style={({ pressed }) => [styles.videoBox, { borderColor: theme.border }, pressed && { opacity: 0.85 }]}>
          <View style={styles.playCircle}>
            <Ionicons name="play" size={28} color="#fff" />
          </View>
          <ThemedText style={styles.videoTag}>tap to play overlay</ThemedText>
        </Pressable>
        <AssetBar label={asset.label} url={asset.url} mime={asset.mime} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => Linking.openURL(asset.url)}
      style={({ pressed }) => [
        styles.assetRow,
        { backgroundColor: theme.card, borderColor: theme.border },
        brutalShadow(theme.shadow, 2),
        pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
      ]}>
      <View style={[styles.assetIcon, { backgroundColor: theme.primaryMuted }]}>
        <Ionicons name={assetIcon(asset.mime) as never} size={18} color={theme.primary} />
      </View>
      <ThemedText style={styles.assetLabel} numberOfLines={1}>
        {asset.label}
      </ThemedText>
      <Ionicons name="download-outline" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

/** Verse card with a Bible-version switcher (re-renders the card per version). */
function VerseCard({ asset }: { asset: Asset }) {
  const theme = useTheme();
  const ref = getParam(asset.url, 'ref');
  const style = getParam(asset.url, 'style') || 'light';
  const initialText = getParam(asset.url, 'text');
  const initialVersion = (getParam(asset.url, 'version') || 'WEB').toUpperCase();
  const [version, setVersion] = useState(initialVersion);
  const [url, setUrl] = useState(asset.url);
  const [busy, setBusy] = useState(false);

  const chips = VERSIONS.some((v) => v.id === initialVersion)
    ? VERSIONS
    : [{ id: initialVersion, api: initialVersion.toLowerCase() }, ...VERSIONS];

  async function pick(v: { id: string; api: string }) {
    if (v.id === version || busy) return;
    setBusy(true);
    setVersion(v.id);
    try {
      let text = initialText;
      if (v.id !== initialVersion) {
        const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=${v.api}`);
        const json = await res.json();
        text = String(json?.text ?? '').trim() || initialText;
      }
      setUrl(verseCardUrl(ref, text, v.id, style));
    } catch {
      /* keep current card */
    }
    setBusy(false);
  }

  return (
    <View style={styles.assetMedia}>
      <Image source={{ uri: url }} style={[styles.verseImg, { borderColor: theme.border }]} contentFit="contain" transition={150} />
      <View style={styles.verseVersions}>
        {chips.map((v) => {
          const on = v.id === version;
          return (
            <Pressable
              key={v.id}
              onPress={() => pick(v)}
              style={[styles.vChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
              <ThemedText style={[styles.vChipText, { color: on ? theme.primaryText : theme.text }]}>{v.id}</ThemedText>
            </Pressable>
          );
        })}
        {busy && <ActivityIndicator size="small" color={theme.primary} />}
      </View>
      <AssetBar label={asset.label} url={url} mime={asset.mime} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: Border.width,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: Border.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '800' },
  markDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: Border.width,
  },
  markDoneText: { fontSize: 13, fontWeight: '900' },
  content: { padding: Spacing.three, gap: Spacing.two },
  hero: {
    width: '100%',
    height: 200,
    borderRadius: Radius.lg,
    borderWidth: Border.widthThick,
    marginBottom: Spacing.one,
  },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  section: { gap: Spacing.two, marginTop: Spacing.three },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  scriptText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  stepCard: { gap: Spacing.two },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  stepImg: { width: '100%', height: 170, borderRadius: Radius.sm, borderWidth: Border.width },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  tipText: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '500' },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: Border.width,
  },
  assetIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  assetLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  assetMedia: { gap: Spacing.two, marginBottom: Spacing.one },
  assetImg: { width: '100%', height: 200, borderRadius: Radius.md, borderWidth: Border.width },
  verseImg: { width: '100%', height: 230, borderRadius: Radius.md, borderWidth: Border.width },
  verseVersions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  vChip: { paddingHorizontal: Spacing.two + 2, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1.5 },
  vChipText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  videoBox: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
    borderWidth: Border.width,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTag: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  assetBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  assetBarLabel: { flex: 1 },
  dl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  dlText: { fontSize: 12, fontWeight: '900' },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three },
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 56,
    borderRadius: Radius.md,
    borderWidth: Border.widthThick,
  },
  recordText: { fontSize: 17, fontWeight: '900' },
});
