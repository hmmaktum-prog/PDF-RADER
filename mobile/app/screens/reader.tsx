import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { PinchGestureHandler } from 'react-native-gesture-handler';
import {
  batchRenderPages,
  compressPdf,
  getPageCount,
  imagesToPdf,
  invertColorsPdf,
  rotatePdf,
} from '../utils/nativeModules';
import { ensureOutputDir, getOutputPath } from '../utils/outputPath';
import { pickImages, pickSinglePdf } from '../utils/filePicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { TOOL_SECTIONS } from '../tools';
import { useContinueTool } from '../context/ContinueContext';

type ReaderMode = 'book' | 'vertical' | 'horizontal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const LAST_PAGE_PREFIX = 'reader:lastPage:';
const BOOKMARK_PREFIX = 'reader:bookmarks:';

export default function ReaderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri?: string }>();
  const { setQueuedPickedFiles } = useContinueTool();

  const [pdfPath, setPdfPath] = useState<string>('');
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<ReaderMode>('vertical');
  const [search, setSearch] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [brightness, setBrightness] = useState(0);
  const [night, setNight] = useState(false);
  const [scale, setScale] = useState(1);
  const [showTools, setShowTools] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>([]);

  const scrollRef = useRef<ScrollView>(null);
  const horizontalScrollRef = useRef<ScrollView>(null);

  const docKey = useMemo(() => (pdfPath ? pdfPath.replace(/[^\w]/g, '_') : 'none'), [pdfPath]);
  const lastPageKey = `${LAST_PAGE_PREFIX}${docKey}`;
  const bookmarkKey = `${BOOKMARK_PREFIX}${docKey}`;

  const tocEntries = useMemo(() => {
    if (!pageCount) return [];
    const section = Math.max(1, Math.floor(pageCount / 4));
    return [
      { title: 'Cover', page: 1 },
      { title: 'Chapter 1', page: Math.min(pageCount, 1 + section) },
      { title: 'Chapter 2', page: Math.min(pageCount, 1 + section * 2) },
      { title: 'Chapter 3', page: Math.min(pageCount, 1 + section * 3) },
    ];
  }, [pageCount]);

  const persistLastRead = useCallback(async (page: number) => {
    if (!pdfPath) return;
    await AsyncStorage.setItem(lastPageKey, String(page));
  }, [lastPageKey, pdfPath]);

  const loadReaderState = useCallback(async () => {
    if (!pdfPath) return;
    const [savedPage, savedBookmarks] = await Promise.all([
      AsyncStorage.getItem(lastPageKey),
      AsyncStorage.getItem(bookmarkKey),
    ]);
    if (savedPage) setCurrentPage(Math.max(1, Number(savedPage) || 1));
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));
  }, [bookmarkKey, lastPageKey, pdfPath]);

  const saveBookmarks = useCallback(async (next: number[]) => {
    setBookmarks(next);
    await AsyncStorage.setItem(bookmarkKey, JSON.stringify(next));
  }, [bookmarkKey]);

  const openPdf = useCallback(async (inputPath: string) => {
    await ensureOutputDir();
    setPdfPath(inputPath);
    const total = await getPageCount(inputPath);
    setPageCount(total);
    const outputDir = getOutputPath('render_cache');
    await FileSystem.makeDirectoryAsync(outputDir, { intermediates: true }).catch(() => {});
    const rendered = await batchRenderPages(inputPath, outputDir, 'png', 85);
    setPages(rendered);
  }, []);

  const importPdfOrImage = useCallback(async () => {
    Alert.alert('Open File', 'Choose input type', [
      {
        text: 'PDF',
        onPress: async () => {
          const file = await pickSinglePdf();
          if (file?.path) await openPdf(file.path);
        },
      },
      {
        text: 'Image(s)',
        onPress: async () => {
          const images = await pickImages();
          if (!images.length) return;
          const outPdf = getOutputPath(`import_${Date.now()}.pdf`);
            await imagesToPdf(
              images.map((img) => ({ uri: img.path, rotation: 0 })),
              outPdf,
              'A4',
              'portrait',
              8
            );
          await openPdf(outPdf);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [openPdf]);

  useEffect(() => {
    (async () => {
      if (params.uri) {
        await openPdf(String(params.uri));
      } else {
        await importPdfOrImage();
      }
    })().catch((error) => Alert.alert('Reader error', String(error?.message || error)));
  }, [importPdfOrImage, openPdf, params.uri]);

  useEffect(() => {
    loadReaderState().catch(() => {});
  }, [loadReaderState]);

  useEffect(() => {
    persistLastRead(currentPage).catch(() => {});
  }, [currentPage, persistLastRead]);

  const jumpToPage = useCallback((page: number) => {
    const safe = Math.min(Math.max(1, page), Math.max(1, pageCount));
    setCurrentPage(safe);
    if (mode === 'horizontal') {
      horizontalScrollRef.current?.scrollTo({ x: (safe - 1) * SCREEN_WIDTH, animated: true });
    } else if (mode === 'vertical') {
      scrollRef.current?.scrollTo({ y: (safe - 1) * 520, animated: true });
    }
  }, [mode, pageCount]);

  const verticalNavResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      const ratio = Math.min(1, Math.max(0, (gesture.moveY - 100) / 420));
      const page = Math.max(1, Math.round(ratio * pageCount));
      jumpToPage(page);
    },
  }), [jumpToPage, pageCount]);

  const horizontalNavResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      const ratio = Math.min(1, Math.max(0, gesture.moveX / SCREEN_WIDTH));
      const page = Math.max(1, Math.round(ratio * pageCount));
      jumpToPage(page);
    },
  }), [jumpToPage, pageCount]);

  const toggleBookmark = useCallback(async () => {
    const exists = bookmarks.includes(currentPage);
    const next = exists
      ? bookmarks.filter((page) => page !== currentPage)
      : [...bookmarks, currentPage].sort((a, b) => a - b);
    await saveBookmarks(next);
  }, [bookmarks, currentPage, saveBookmarks]);

  const runSearch = useCallback((query: string) => {
    setSearch(query);
    if (!query.trim()) {
      setSearchMatches([]);
      return;
    }
    const q = query.toLowerCase();
    const hits: number[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const simulatedText = `page ${page} chapter ${(page % 4) + 1}`;
      if (simulatedText.includes(q)) hits.push(page);
    }
    setSearchMatches(hits);
    if (hits.length) jumpToPage(hits[0]);
  }, [jumpToPage, pageCount]);

  const applyToolAction = useCallback(async (tool: 'compress' | 'rotate' | 'invert') => {
    if (!pdfPath) return;
    try {
      const outPath = getOutputPath(`${tool}_${Date.now()}.pdf`);
      if (tool === 'compress') await compressPdf(pdfPath, outPath, 'Balanced', 70, 100, false);
      if (tool === 'rotate') await rotatePdf(pdfPath, outPath, 90, 'all');
      if (tool === 'invert') await invertColorsPdf(pdfPath, outPath);
      await openPdf(outPath);
      setShowTools(false);
    } catch (error: any) {
      Alert.alert('Tool failed', String(error?.message || error));
    }
  }, [openPdf, pdfPath]);

  const executeTool = useCallback((route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (pdfPath) {
      setQueuedPickedFiles([{
        path: pdfPath,
        name: pdfPath.split('/').pop() || 'Document.pdf',
        size: 'Unknown',
        mimeType: 'application/pdf',
      }]);
    }
    router.push(route as any);
    setShowTools(false);
  }, [pdfPath, router, setQueuedPickedFiles]);

  const pdfToolSections = useMemo(() => {
    return TOOL_SECTIONS.map(section => ({
      ...section,
      data: section.data.filter(t => t.id !== 'image-to-pdf' && t.id !== 'pdf-to-image')
    })).filter(section => section.data.length > 0);
  }, []);

  const imageStyle = useMemo(() => ({ transform: [{ scale }] }), [scale]);
  const bg = night ? '#000000' : '#f2f4fa';
  const text = night ? '#ffffff' : '#111111';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={night ? 'light-content' : 'dark-content'} />
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()}><Text style={[styles.topBtn, { color: text }]}>Back</Text></TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>Reader {currentPage}/{Math.max(1, pageCount)}</Text>
        <TouchableOpacity onPress={() => setShowTools(true)}><Text style={[styles.topBtn, { color: text }]}>Tools</Text></TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setMode('book')} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>Book</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('vertical')} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>Vertical</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setMode('horizontal')} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>Horizontal</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setNight((v) => !v)} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>{night ? 'Light' : 'Night'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={toggleBookmark} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>{bookmarks.includes(currentPage) ? 'Unmark' : 'Bookmark'}</Text></TouchableOpacity>
      </View>



      <View style={styles.readerWrap}>
        {mode === 'book' && (
          <View style={styles.bookMode}>
            <TouchableOpacity onPress={() => jumpToPage(currentPage - 1)} style={[styles.flipBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>◀</Text></TouchableOpacity>
            <PinchGestureHandler onGestureEvent={(e: any) => setScale(Math.min(3, Math.max(1, e.nativeEvent.scale)))}>
              <View style={styles.bookPage}>
                {pages[currentPage - 1] ? <Image source={{ uri: pages[currentPage - 1] }} style={[styles.pageImage, imageStyle]} resizeMode="contain" /> : <Text>No page render</Text>}
              </View>
            </PinchGestureHandler>
            <TouchableOpacity onPress={() => jumpToPage(currentPage + 1)} style={[styles.flipBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>▶</Text></TouchableOpacity>
          </View>
        )}

        {mode === 'vertical' && (
          <View style={styles.flexRow}>
            <ScrollView ref={scrollRef} style={styles.flex} onMomentumScrollEnd={(e) => setCurrentPage(Math.max(1, Math.round(e.nativeEvent.contentOffset.y / 520) + 1))}>
              {pages.map((uri, idx) => (
                <PinchGestureHandler key={uri + idx} onGestureEvent={(e: any) => setScale(Math.min(3, Math.max(1, e.nativeEvent.scale)))}>
                  <View style={[styles.pageCard, { backgroundColor: night ? '#1a1a1a' : '#fff' }]}>
                    <Image source={{ uri }} style={[styles.pageImage, imageStyle]} resizeMode="contain" />
                    <Text style={[styles.pageNo, { color: text }]}>Page {idx + 1}</Text>
                  </View>
                </PinchGestureHandler>
              ))}
            </ScrollView>
            <View style={styles.rightNav} {...verticalNavResponder.panHandlers}>
              <View style={[styles.dragThumb, { top: `${((currentPage - 1) / Math.max(1, pageCount - 1)) * 94}%` as any }]} />
            </View>
          </View>
        )}

        {mode === 'horizontal' && (
          <View style={styles.flex}>
            <ScrollView
              ref={horizontalScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH) + 1)}
            >
              {pages.map((uri, idx) => (
                <View key={uri + idx} style={styles.horizontalPage}>
                  <PinchGestureHandler onGestureEvent={(e: any) => setScale(Math.min(3, Math.max(1, e.nativeEvent.scale)))}>
                    <Image source={{ uri }} style={[styles.pageImage, imageStyle]} resizeMode="contain" />
                  </PinchGestureHandler>
                </View>
              ))}
            </ScrollView>
            <View style={styles.bottomNav} {...horizontalNavResponder.panHandlers}>
              <View style={[styles.bottomThumb, { left: `${((currentPage - 1) / Math.max(1, pageCount - 1)) * 94}%` as any }]} />
            </View>
          </View>
        )}
      </View>

      <Modal transparent visible={showTools} animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalDocCard, { backgroundColor: night ? '#1a1a1a' : '#fff', paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: text }]}>PDF Tools</Text>
              <TouchableOpacity onPress={() => setShowTools(false)}>
                <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '700' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {pdfToolSections.map((section, idx) => (
                <View key={idx} style={{ marginTop: 20 }}>
                  <Text style={[styles.modalSectionLabel, { color: night ? '#888' : '#777' }]}>{section.title.toUpperCase()}</Text>
                  <View style={styles.toolsGrid}>
                    {section.data.map(tool => (
                      <TouchableOpacity
                        key={tool.id}
                        onPress={() => executeTool(tool.route)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.toolCard, { borderColor: night ? '#333' : '#eee', backgroundColor: night ? '#222' : '#fafafa' }]}>
                          <LinearGradient colors={tool.grad} style={styles.toolIconBg}>
                            <Text style={{ fontSize: 24 }}>{tool.icon}</Text>
                          </LinearGradient>
                          <Text style={[styles.toolCardName, { color: text }]} numberOfLines={1}>{tool.name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  flexRow: { flex: 1, flexDirection: 'row' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8, alignItems: 'center' },
  topBtn: { fontWeight: '600', fontSize: 15 },
  title: { fontSize: 15, fontWeight: '700' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
  controlBtn: { backgroundColor: '#ffffff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  searchBlock: { paddingHorizontal: 10, paddingBottom: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#ffffff', borderRadius: 8, paddingHorizontal: 10, height: 40 },
  searchHint: { fontSize: 11, marginTop: 4, lineHeight: 15 },
  metaText: { fontSize: 12, color: '#444' },
  toc: { marginHorizontal: 10, borderRadius: 10, backgroundColor: '#ffffff', padding: 10, marginBottom: 8 },
  tocItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  readerWrap: { flex: 1 },
  bookMode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flipBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', marginHorizontal: 8 },
  bookPage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageCard: { marginHorizontal: 10, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff', padding: 8 },
  pageImage: { width: SCREEN_WIDTH - 24, height: 500, alignSelf: 'center' },
  pageNo: { textAlign: 'center', fontSize: 12, marginTop: 4 },
  rightNav: { width: 28, marginVertical: 16, marginRight: 6, borderRadius: 14, backgroundColor: '#00000022' },
  dragThumb: { position: 'absolute', left: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#007AFF' },
  horizontalPage: { width: SCREEN_WIDTH, justifyContent: 'center', alignItems: 'center' },
  bottomNav: { height: 24, marginHorizontal: 16, marginBottom: 10, borderRadius: 12, backgroundColor: '#00000022' },
  bottomThumb: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#007AFF' },
  bottomControls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  brightnessBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#00000022', overflow: 'hidden' },
  brightnessFill: { height: 8, backgroundColor: '#ffb703' },
  brightnessOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  modalBackdrop: { flex: 1, backgroundColor: '#000000a0', justifyContent: 'flex-end' },
  modalDocCard: { height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#00000015' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  toolCard: {
    width: (SCREEN_WIDTH - 32 - 12 - 12) / 3, // 3 cols
    alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4,
    borderRadius: 16, borderWidth: 1,
  },
  toolIconBg: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  toolCardName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
