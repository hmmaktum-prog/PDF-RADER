import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { useContinueTool } from '../context/ContinueContext';
import * as Haptics from 'expo-haptics';
import { cleanupTemporaryFiles } from '../utils/cleanup';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import LottieView from 'lottie-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

async function inferShareOptions(path: string): Promise<{ mimeType?: string; dialogTitle: string }> {
  const p = path.toLowerCase();
  if (p.endsWith('.pdf')) return { mimeType: 'application/pdf', dialogTitle: 'Share PDF output' };
  if (p.endsWith('.zip')) return { mimeType: 'application/zip', dialogTitle: 'Share ZIP archive' };
  if (p.endsWith('.png')) return { mimeType: 'image/png', dialogTitle: 'Share image' };
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return { mimeType: 'image/jpeg', dialogTitle: 'Share image' };

  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && 'isDirectory' in info && info.isDirectory) {
      return { dialogTitle: 'Share output folder' };
    }
  } catch {
    /* ignore */
  }

  return { mimeType: 'application/octet-stream', dialogTitle: 'Share file' };
}

export type ToolStatus = 'idle' | 'processing' | 'result' | 'error';

interface ToolShellProps {
  title: string;
  subtitle?: string;
  onExecute: (onProgress: (pct: number, label?: string) => void) => Promise<string | void>;
  executeLabel?: string;
  children?: React.ReactNode;
  resultLabel?: string;
  disableScroll?: boolean;
  accentColor?: string;
  /** When set, overrides MIME inferred from the result path (expo-sharing). */
  shareMimeType?: string;
  /** When set, overrides the system share sheet title. */
  shareDialogTitle?: string;
}

export default function ToolShell({
  title,
  subtitle,
  onExecute,
  executeLabel = '▶  Run Tool',
  children,
  resultLabel,
  disableScroll = false,
  accentColor = '#007AFF',
  shareMimeType,
  shareDialogTitle,
}: ToolShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const { setSharedFilePath } = useContinueTool();
  const [status, setStatus] = useState<ToolStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [lottieError, setLottieError] = useState(false);

  const bg      = isDark ? '#000000' : '#f2f2f7';
  const cardBg  = isDark ? '#1c1c1e' : '#ffffff';
  const text    = isDark ? '#ffffff' : '#000000';
  const muted   = isDark ? '#8e8e93' : '#6c6c70';
  const barBg   = isDark ? '#2c2c2e' : '#e5e5ea';
  const border  = isDark ? '#2c2c2e' : '#e5e5ea';

  const progressWidth = useSharedValue(0);

  const handleProgress = useCallback((pct: number, label?: string) => {
    const safePct = Math.min(Math.max(pct, 0), 100);
    setProgress(safePct);
    progressWidth.value = withTiming(safePct, { duration: 300, easing: Easing.out(Easing.ease) });
    if (label) setProgressLabel(label);
  }, []);

  const progressStyle = useAnimatedStyle(() => {
    return { width: `${progressWidth.value}%` };
  });

  const handleExecute = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStatus('processing');
      setProgress(0);
      setProgressLabel('Initializing engine...');
      const output = await onExecute(handleProgress);
      if (output) setResultPath(output);
      setProgress(100);
      setProgressLabel('Done!');
      setStatus('result');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setErrorMsg(e.message || 'An unexpected error occurred');
      setStatus('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      cleanupTemporaryFiles().catch(() => {});
    }
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (resultPath) setSharedFilePath(resultPath);
    setStatus('idle');
    setProgress(0);
    setProgressLabel('');
    router.replace('/tools'); // Navigate directly to tools catalog to continue workflow
  };

  const handleShare = async () => {
    if (!resultPath) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        const inferred = await inferShareOptions(resultPath);
        const options: Sharing.SharingOptions = {
          dialogTitle: shareDialogTitle ?? inferred.dialogTitle,
        };
        const mime = shareMimeType ?? inferred.mimeType;
        if (mime !== undefined) {
          options.mimeType = mime;
        }
        await Sharing.shareAsync(resultPath, options);
      }
    } catch (_) {}
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus('idle');
    setProgress(0);
    progressWidth.value = 0;
    setProgressLabel('');
    setErrorMsg('');
    setResultPath(null);
  };

  const headerPaddingTop = insets.top + 8;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: border, paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="button-back">
          <Text style={[styles.backText, { color: accentColor }]}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: text }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.headerSub, { color: muted }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Idle */}
      {status === 'idle' && (
        <View style={styles.flex}>
          {disableScroll ? (
            <View style={styles.flex}>{children}</View>
          ) : (
            <ScrollView style={styles.flex} contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          )}
          <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: border, paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[styles.execBtn, { backgroundColor: accentColor }]}
              onPress={handleExecute}
              activeOpacity={0.85}
              testID="button-execute"
            >
              <Text style={styles.execBtnText}>{executeLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Processing */}
      {status === 'processing' && (
        <View style={styles.centerFlex}>
          <View style={[styles.stateCard, { backgroundColor: cardBg }]}>
            {lottieError ? (
              <ActivityIndicator size="large" color={accentColor} style={{ marginBottom: 20 }} />
            ) : (
              <LottieView
                source={require('../../assets/lottie/loader.json')}
                autoPlay
                loop
                style={{ width: 140, height: 140, marginBottom: 12 }}
                colorFilters={[{ keypath: '**', color: accentColor }]}
              />
            )}
            <Text style={[styles.stateTitle, { color: text }]}>Processing...</Text>
            <Text style={[styles.stateLabel, { color: muted }]}>{progressLabel}</Text>
            <View style={[styles.barBg, { backgroundColor: barBg }]}>
              <Animated.View style={[styles.barFill, progressStyle, { backgroundColor: accentColor }]} />
            </View>
            <Text style={[styles.pct, { color: accentColor }]}>{Math.round(progress)}%</Text>
            <Text style={[styles.engineNote, { color: muted }]}>Powered by QPDF / MuPDF NDK</Text>
          </View>
        </View>
      )}

      {/* Result */}
      {status === 'result' && (
        <View style={styles.centerFlex}>
          <View style={[styles.stateCard, { backgroundColor: cardBg }]}>
            <Text style={styles.bigIcon}>✅</Text>
            <Text style={[styles.stateTitle, { color: text }]}>Complete!</Text>
            {resultPath && (
              <View style={[styles.pathBox, { backgroundColor: isDark ? '#2c2c2e' : '#f2f2f7' }]}>
                <Text style={[styles.pathLabel, { color: muted }]}>📁 Saved to</Text>
                <Text style={[styles.pathText, { color: text }]} numberOfLines={3}>{resultPath}</Text>
              </View>
            )}
            {resultLabel && <Text style={[styles.stateLabel, { color: muted }]}>{resultLabel}</Text>}
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#34C759' }]} onPress={handleShare} activeOpacity={0.85} testID="button-share">
                <Text style={styles.actionBtnText}>📤  Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF9500' }]} onPress={handleContinue} activeOpacity={0.85} testID="button-continue">
                <Text style={styles.actionBtnText}>➡️  Continue</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.resetBtn, { borderColor: border }]} onPress={handleReset} activeOpacity={0.7} testID="button-start-again">
              <Text style={[styles.resetText, { color: muted }]}>🔄  Start Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Error */}
      {status === 'error' && (
        <View style={styles.centerFlex}>
          <View style={[styles.stateCard, { backgroundColor: cardBg }]}>
            <Text style={styles.bigIcon}>❌</Text>
            <Text style={[styles.stateTitle, { color: text }]}>Something went wrong</Text>
            <View style={[styles.pathBox, { backgroundColor: isDark ? '#2a1515' : '#fff0f0', borderColor: '#FF3B3040' }]}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
            <TouchableOpacity style={[styles.execBtn, { backgroundColor: accentColor, marginTop: 20 }]} onPress={handleReset} activeOpacity={0.85} testID="button-try-again">
              <Text style={styles.execBtnText}>🔄  Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1 },
  flex:  { flex: 1 },
  scrollPad: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },

  header: {
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: 'row', alignItems: 'flex-end',
  },
  backBtn:      { width: 60 },
  backText:     { fontSize: 17, fontWeight: '500' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700' },
  headerSub:    { fontSize: 12, marginTop: 2 },

  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1,
  },
  execBtn:     { paddingVertical: 16, borderRadius: 14, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8 },
  execBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  centerFlex: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  stateCard: {
    width: '100%', padding: 28, borderRadius: 22, alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
  },
  stateTitle:  { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  stateLabel:  { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  barBg:       { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  barFill:     { height: '100%', borderRadius: 4 },
  pct:         { fontSize: 22, fontWeight: '800', marginTop: 10 },
  engineNote:  { fontSize: 11, marginTop: 14, fontStyle: 'italic' },

  bigIcon:    { fontSize: 56, marginBottom: 12 },
  pathBox:    { width: '100%', padding: 14, borderRadius: 12, marginTop: 12, borderWidth: 1, borderColor: 'transparent' },
  pathLabel:  { fontSize: 11, marginBottom: 4 },
  pathText:   { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  errorText:  { color: '#FF3B30', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  actionRow:  { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  actionBtn:  { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', elevation: 2 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resetBtn:   { marginTop: 14, paddingVertical: 10, paddingHorizontal: 28, borderRadius: 10, borderWidth: 1 },
  resetText:  { fontSize: 14 },
});
