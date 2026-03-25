import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './context/ThemeContext';
import { useContinueTool } from './context/ContinueContext';
import * as Haptics from 'expo-haptics';
import { pickMultiplePdfs, pickImages, PickedFile } from './utils/filePicker';

const QUICK_TOOLS = [
  { id: 'merge',        name: 'Merge',      icon: '🔗', route: '/screens/merge',        grad: ['#007AFF', '#0055CC'] as const },
  { id: 'split',        name: 'Split',       icon: '✂️', route: '/screens/split',        grad: ['#FF9500', '#CC6600'] as const },
  { id: 'compress',     name: 'Compress',    icon: '📦', route: '/screens/compress',     grad: ['#34C759', '#1E8B3C'] as const },
  { id: 'ocr',          name: 'AI OCR',      icon: '🤖', route: '/screens/ocr',          grad: ['#AF52DE', '#7B2FBE'] as const },
  { id: 'image-to-pdf', name: 'Img→PDF',     icon: '🖼️', route: '/screens/image-to-pdf', grad: ['#FF2D55', '#CC0033'] as const },
  { id: 'rotate',       name: 'Rotate',      icon: '🔄', route: '/screens/rotate',       grad: ['#5AC8FA', '#0099DD'] as const },
  { id: 'invert',       name: 'Dark Mode',   icon: '🌗', route: '/screens/invert',       grad: ['#FF6B35', '#CC3300'] as const },
  { id: 'organize',     name: 'Organize',    icon: '📋', route: '/screens/organize',     grad: ['#32ADE6', '#0077BB'] as const },
];

const STATS = [
  { num: '20+', label: 'Tools',   icon: '🛠️',  color: '#007AFF' },
  { num: 'NDK', label: 'Engine',  icon: '⚡',  color: '#FF9500' },
  { num: 'AI',  label: 'OCR',     icon: '🤖',  color: '#AF52DE' },
  { num: '0',   label: 'Upload',  icon: '📴',  color: '#34C759' },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, theme, setTheme } = useAppTheme();
  const { sharedFilePath, clearState, setQueuedPickedFiles } = useContinueTool();

  const queueHomeFilesAndNavigate = (route: string) => {
    if (pickedFiles.length > 0) {
      setQueuedPickedFiles(pickedFiles);
    }
    router.push(route as any);
  };
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const [isToolsExpanded, setIsToolsExpanded] = useState(false);

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(40)).current;
  const scaleAnim  = useRef(new Animated.Value(0.92)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handlePickPdf = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const files = await pickMultiplePdfs();
    if (files.length > 0) {
      router.push({ pathname: '/screens/reader', params: { uri: files[0].path } } as any);
    }
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const files = await pickImages();
      if (files.length > 0) {
        setQueuedPickedFiles(files);
        router.push('/screens/image-reader' as any);
      }
    } catch (e) {
      console.warn('Gallery error', e);
    }
  };

  const bg     = isDark ? '#0a0e1a' : '#f0f2f8';
  const cardBg = isDark ? '#141824' : '#ffffff';
  const text   = isDark ? '#ffffff' : '#0a0e1a';
  const muted  = isDark ? '#6e7a9a' : '#6c75a0';
  const border = isDark ? '#1e2538' : '#e2e5f0';

  const cycleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const themeIcon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌗';

  const isLandscape = SCREEN_WIDTH > 600;
  const COLS = isLandscape ? 6 : 4;
  const GRID_PADDING = 28;
  const GRID_GAP = 10;
  const gridCardWidth = (SCREEN_WIDTH - GRID_PADDING - GRID_GAP * (COLS - 1)) / COLS;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Banner ── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          <LinearGradient
            colors={['#0a1628', '#0d2760', '#1a4fd6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, isLandscape && styles.heroLandscape]}
          >
            <View style={styles.heroGrid} />

            <View style={{ flexDirection: 'row', gap: 8, position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
              <TouchableOpacity style={styles.themeBtn} onPress={cycleTheme} testID="button-theme-toggle">
                <Text style={styles.themeBtnText}>{themeIcon}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.themeBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/screens/settings'); }}
                testID="button-settings"
              >
                <Text style={styles.themeBtnText}>⚙️</Text>
              </TouchableOpacity>
            </View>

            {!isLandscape && (
              <Animated.View style={[styles.heroIconWrap, { transform: [{ scale: pulseAnim }] }]}>
                <LinearGradient
                  colors={['#FFD60A', '#FF9500']}
                  style={styles.heroBolt}
                >
                  <Text style={styles.heroBoltText}>⚡</Text>
                </LinearGradient>
                <Text style={styles.heroDoc}>📑</Text>
              </Animated.View>
            )}

            <View style={isLandscape ? styles.heroTextRowLandscape : undefined}>
              {isLandscape && (
                <Animated.View style={{ transform: [{ scale: pulseAnim }], marginRight: 16 }}>
                  <Text style={{ fontSize: 48 }}>📑</Text>
                </Animated.View>
              )}
              <View>
                <Text style={styles.heroTitle}>PDF Power Tools</Text>
                <Text style={styles.heroSub}>NDK Engine · 100% Offline · Lightning Fast</Text>
                <View style={styles.tagRow}>
                  {['⚡ Ultra Fast', '📴 No Upload', '🔒 Private'].map(t => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── File Selection Area ── */}
        {pickedFiles.length === 0 ? (
          <Animated.View style={[styles.section, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={[styles.sectionTitle, { color: text, textAlign: 'center', marginBottom: 16 }]}>Get Started</Text>
            <View style={styles.uploadContainer}>
              <TouchableOpacity style={styles.uploadBtnWrapper} onPress={handlePickImage} activeOpacity={0.8}>
                <LinearGradient colors={['#FF2D55', '#CC0033']} style={styles.uploadBtnGrad}>
                  <Text style={styles.uploadBtnIconBig}>🖼️</Text>
                  <Text style={styles.uploadBtnLabel}>Upload Images</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.uploadBtnWrapper} onPress={handlePickPdf} activeOpacity={0.8}>
                <LinearGradient colors={['#007AFF', '#0055CC']} style={styles.uploadBtnGrad}>
                  <Text style={styles.uploadBtnIconBig}>📄</Text>
                  <Text style={styles.uploadBtnLabel}>Upload PDFs</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <View style={[styles.selectedFilesContainer, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={[styles.sectionLabel, { color: muted }]}>SELECTED FILES</Text>

              <View style={styles.addMoreRow}>
                <TouchableOpacity
                  style={[styles.addMoreBtn, { borderColor: '#007AFF40', backgroundColor: isDark ? '#007AFF12' : '#007AFF08' }]}
                  onPress={handlePickPdf}
                  activeOpacity={0.85}
                  testID="button-add-more-pdf"
                >
                  <Text style={[styles.addMoreBtnText, { color: '#007AFF' }]}>＋ Add PDFs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addMoreBtn, { borderColor: '#FF2D5540', backgroundColor: isDark ? '#FF2D5512' : '#FF2D5508' }]}
                  onPress={handlePickImage}
                  activeOpacity={0.85}
                  testID="button-add-more-images"
                >
                  <Text style={[styles.addMoreBtnText, { color: '#FF2D55' }]}>＋ Add images</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.fileList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {pickedFiles.map((file, idx) => (
                   <View key={`${file.path}-${idx}`} style={[styles.fileCard, { borderBottomColor: border }]}>
                      <Text style={styles.fileIcon}>{file.mimeType?.includes('image') ? '🖼️' : '📄'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.fileName, { color: text }]} numberOfLines={1}>{file.name}</Text>
                        <Text style={[styles.fileSize, { color: muted }]}>{file.size || 'Unknown Size'}</Text>
                      </View>
                   </View>
                ))}
              </ScrollView>

              <View style={styles.fileActions}>
                <TouchableOpacity style={styles.clearBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setPickedFiles([]); setIsToolsExpanded(false); }}>
                  <Text style={styles.clearBtnText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.showToolsBtn, isToolsExpanded ? { backgroundColor: '#FF3B30' } : { backgroundColor: '#34C759' }]} 
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsToolsExpanded(!isToolsExpanded); }}
                >
                  <Text style={styles.showToolsBtnText}>{isToolsExpanded ? 'Hide Tools' : 'Show Tools'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Render Tools conditionally ── */}
        {isToolsExpanded && (
          <Animated.View style={{ opacity: fadeAnim, marginTop: 10 }}>
            {/* ── Continue Banner ── */}
            {sharedFilePath && (
              <View style={styles.bannerContainer}>
                <LinearGradient
                  colors={['#FF950022', '#FF950008']}
                  style={[styles.banner, { borderColor: '#FF9500' }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerTitle}>➡️ Continue from previous tool</Text>
                    <Text style={[styles.bannerSub, { color: muted }]} numberOfLines={1}>{sharedFilePath}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); clearState(); }}
                    testID="button-clear-continue"
                  >
                    <Text style={styles.bannerClear}>✕</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}

            {/* ── Quick Access ── */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionLabel, { color: muted }]}>QUICK ACCESS</Text>
                  <Text style={[styles.sectionTitle, { color: text }]}>Available Tools</Text>
                </View>
                <TouchableOpacity
                  style={[styles.seeAllBtn, { borderColor: border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    queueHomeFilesAndNavigate('/tools');
                  }}
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.grid}>
                {QUICK_TOOLS.map(tool => (
                  <TouchableOpacity
                    key={tool.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      queueHomeFilesAndNavigate(tool.route);
                    }}
                    activeOpacity={0.75}
                    testID={`button-quick-${tool.id}`}
                  >
                    <View style={[styles.gridCard, { backgroundColor: cardBg, borderColor: border, width: gridCardWidth }]}>
                      <LinearGradient colors={tool.grad} style={styles.gridIconBg}>
                        <Text style={styles.gridIcon}>{tool.icon}</Text>
                      </LinearGradient>
                      <Text style={[styles.gridLabel, { color: text }]}>{tool.name}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Stats Row ── */}
            <View style={styles.statsRow}>
              {STATS.map((s) => (
                <View
                  key={s.label}
                  style={[
                    styles.statCard,
                    { backgroundColor: cardBg, borderColor: border }
                  ]}
                >
                  <Text style={styles.statIcon}>{s.icon}</Text>
                  <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
                  <Text style={[styles.statLabel, { color: muted }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* ── PDF Viewer Card ── */}
            <View style={styles.section}>
              <View style={[styles.viewerCard, { backgroundColor: cardBg, borderColor: border }]}>
                <LinearGradient colors={['#0d2760', '#1a4fd6']} style={styles.viewerHeader}>
                  <Text style={styles.viewerHeaderIcon}>📄</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewerHeaderTitle}>PDF Viewer</Text>
                    <Text style={styles.viewerHeaderSub}>MuPDF · 300 DPI Renderer</Text>
                  </View>
                  <TouchableOpacity style={styles.openBtn} onPress={() => router.push('/screens/reader')} testID="button-upload-pdf">
                    <Text style={styles.openBtnText}>Open</Text>
                  </TouchableOpacity>
                </LinearGradient>
                <View style={[styles.viewerArea, { backgroundColor: isDark ? '#0e1220' : '#f4f6ff' }]}>
                  <Text style={{ fontSize: 52 }}>📑</Text>
                  <Text style={[styles.viewerHint, { color: muted }]}>
                    Tap Open to preview a PDF — fully offline
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Browse All Button ── */}
            <View style={[{ marginHorizontal: 16, marginTop: 8, marginBottom: 20 }]}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  queueHomeFilesAndNavigate('/tools');
                }}
                activeOpacity={0.85}
                testID="button-view-all-tools"
              >
                <LinearGradient
                  colors={['#0d2760', '#1a4fd6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.allBtn}
                >
                  <Text style={styles.allBtnIcon}>🛠️</Text>
                  <Text style={styles.allBtnText}>Browse All 20+ Tools</Text>
                  <Text style={styles.allBtnArrow}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  hero: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 26,
    padding: 24,
    paddingBottom: 26,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#1a4fd6',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
  },
  heroLandscape: {
    paddingVertical: 18,
  },
  heroGrid: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.04,
    backgroundColor: 'transparent',
  },
  themeBtn: {
    backgroundColor: '#ffffff18',
    borderRadius: 22, padding: 8,
    borderWidth: 1, borderColor: '#ffffff22',
  },
  themeBtnText: { fontSize: 16 },

  heroTextRowLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconWrap: {
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 8,
  },
  heroBolt: {
    position: 'absolute',
    top: -6, right: 60,
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    elevation: 6,
    shadowColor: '#FFD60A', shadowOpacity: 0.7, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
  },
  heroBoltText: { fontSize: 16 },
  heroDoc:  { fontSize: 72, textShadowColor: '#1a4fd680', textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 20 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5, textAlign: 'center' },
  heroSub:   { fontSize: 12, color: '#ffffffaa', marginTop: 4, textAlign: 'center', marginBottom: 18 },
  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tag:       { backgroundColor: '#ffffff18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff22' },
  tagText:   { color: '#fff', fontSize: 11, fontWeight: '600' },

  uploadContainer: { flexDirection: 'row', gap: 12, paddingHorizontal: 6 },
  uploadBtnWrapper: { flex: 1 },
  uploadBtnGrad: {
    borderRadius: 20, paddingVertical: 24, alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10,
  },
  uploadBtnIconBig: { fontSize: 36, marginBottom: 8 },
  uploadBtnLabel: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },

  selectedFilesContainer: {
    padding: 16, borderRadius: 22, borderWidth: 1,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
  },
  addMoreRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  addMoreBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  addMoreBtnText: { fontWeight: '700', fontSize: 13 },
  fileList: { maxHeight: 180, marginBottom: 12 },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  fileIcon: { fontSize: 24 },
  fileName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  fileSize: { fontSize: 11, fontWeight: '500' },
  fileActions: { flexDirection: 'row', paddingTop: 8, gap: 10 },
  clearBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: '#ff3b3015', flex: 1, alignItems: 'center',
  },
  clearBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 14 },
  showToolsBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    flex: 2, alignItems: 'center', elevation: 2,
  },
  showToolsBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  bannerContainer: { marginHorizontal: 14, marginTop: 12 },
  banner: {
    padding: 14, borderRadius: 14, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  bannerTitle: { color: '#FF9500', fontWeight: '700', fontSize: 13 },
  bannerSub:   { fontSize: 11, marginTop: 2 },
  bannerClear: { color: '#FF3B30', fontWeight: '700', fontSize: 18, paddingHorizontal: 6 },

  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 14, marginTop: 18, gap: 10,
  },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: 18, borderWidth: 1,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
  },
  statIcon:  { fontSize: 20, marginBottom: 5 },
  statNum:   { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },

  section: { marginTop: 22, paddingHorizontal: 14 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  sectionLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  sectionTitle:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  seeAllBtn:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  seeAllText:    { color: '#1a4fd6', fontWeight: '700', fontSize: 13 },

  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    paddingVertical: 14, paddingHorizontal: 4,
    borderRadius: 20, alignItems: 'center',
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000', shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 8,
  },
  gridIconBg: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 9,
    elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
  gridIcon:  { fontSize: 22 },
  gridLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  viewerCard: {
    borderRadius: 22, borderWidth: 1, overflow: 'hidden',
    elevation: 4, shadowColor: '#1a4fd6', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
  },
  viewerHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  viewerHeaderIcon:  { fontSize: 28 },
  viewerHeaderTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  viewerHeaderSub:   { color: '#ffffffaa', fontSize: 11, marginTop: 2 },
  openBtn:    { backgroundColor: '#FFD60A', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  openBtnText:{ color: '#0a1628', fontWeight: '800', fontSize: 13 },
  viewerArea: { height: 160, justifyContent: 'center', alignItems: 'center', gap: 10 },
  viewerHint: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24 },

  allBtn: {
    paddingVertical: 18, borderRadius: 20, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    elevation: 8, shadowColor: '#1a4fd6', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14,
  },
  allBtnIcon:  { fontSize: 18 },
  allBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  allBtnArrow: { color: '#ffffffcc', fontSize: 18, fontWeight: '700' },
});
