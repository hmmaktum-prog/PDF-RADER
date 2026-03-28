import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import MuPdfViewer from '../components/MuPdfViewer';
import {
  compressPdf,
  imagesToPdf,
  invertColorsPdf,
  rotatePdf,
  searchPdfText,
  getPdfOutline,
} from '../utils/nativeModules';
import { getOutputPath } from '../utils/outputPath';
import { pickImages, pickSinglePdf } from '../utils/filePicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { TOOL_SECTIONS } from '../tools';
import { useContinueTool } from '../context/ContinueContext';

type ReaderMode = 'book' | 'vertical' | 'horizontal';

const LAST_PAGE_PREFIX = 'reader:lastPage:';
const BOOKMARK_PREFIX = 'reader:bookmarks:';

export default function ReaderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri?: string }>();
  const { setQueuedPickedFiles } = useContinueTool();

  const [pdfPath, setPdfPath] = useState<string>('');
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [mode, setMode] = useState<ReaderMode>('vertical');
  const [night, setNight] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [recentFiles, setRecentFiles] = useState<{ path: string; name: string; date: number }[]>([]);
  
  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ page: number; hits: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResultIndex, setSearchResultIndex] = useState(0);

  // Bookmark list modal
  const [showBookmarkList, setShowBookmarkList] = useState(false);

  // Page jump modal
  const [showPageJump, setShowPageJump] = useState(false);
  const [pageJumpText, setPageJumpText] = useState('');

  // TOC state
  const [showTOC, setShowTOC] = useState(false);
  const [toc, setToc] = useState<any[]>([]);
  const [isLoadingTOC, setIsLoadingTOC] = useState(false);
  
  const viewerRef = useRef<any>(null);

  const { width: windowWidth } = useWindowDimensions();
  const dynamicStyles = useMemo(() => {
    return {
      pdf: { flex: 1, width: windowWidth },
      toolCard: {
        width: (windowWidth - 32 - 12 - 12) / 3,
        alignItems: 'center' as const, 
        paddingVertical: 14, 
        paddingHorizontal: 4,
        borderRadius: 16, 
        borderWidth: 1,
      },
    };
  }, [windowWidth]);

  const docKey = useMemo(() => (pdfPath ? pdfPath.replace(/[^\w]/g, '_') : 'none'), [pdfPath]);
  const lastPageKey = `${LAST_PAGE_PREFIX}${docKey}`;
  const bookmarkKey = `${BOOKMARK_PREFIX}${docKey}`;

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
    setPdfPath(inputPath);
    // Add to recent files
    const name = inputPath.split('/').pop() || 'Document.pdf';
    const newItem = { path: inputPath, name, date: Date.now() };
    
    try {
      const saved = await AsyncStorage.getItem('reader:recentFiles');
      let list = saved ? JSON.parse(saved) : [];
      // Remove dupe and limit to 10
      list = [newItem, ...list.filter((f: any) => f.path !== inputPath)].slice(0, 10);
      setRecentFiles(list);
      await AsyncStorage.setItem('reader:recentFiles', JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save recent files', e);
    }
  }, []);

  const loadRecentFiles = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem('reader:recentFiles');
      if (saved) setRecentFiles(JSON.parse(saved));
    } catch {}
  }, []);

  const clearRecentFiles = useCallback(async () => {
    setRecentFiles([]);
    await AsyncStorage.removeItem('reader:recentFiles');
  }, []);

  const performSearch = useCallback(async () => {
    if (!searchQuery.trim() || !pdfPath) return;
    setIsSearching(true);
    try {
      const results = await searchPdfText(pdfPath, searchQuery);
      setSearchResults(results);
    } catch (e) {
      Alert.alert('Search Error', String(e));
    } finally {
      setIsSearching(false);
    }
  }, [pdfPath, searchQuery]);

  const loadTOC = useCallback(async () => {
    if (!pdfPath) return;
    setIsLoadingTOC(true);
    setShowTOC(true);
    try {
      const outline = await getPdfOutline(pdfPath);
      setToc(outline);
    } catch (e) {
      console.warn('Failed to load TOC', e);
      setToc([]);
    } finally {
      setIsLoadingTOC(false);
    }
  }, [pdfPath]);

  const importPdf = useCallback(async () => {
    const file = await pickSinglePdf();
    if (file?.path) await openPdf(file.path);
  }, [openPdf]);

  const importImages = useCallback(async () => {
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
  }, [openPdf]);

  useEffect(() => {
    loadRecentFiles();
    if (params.uri) {
      openPdf(String(params.uri)).catch(e => Alert.alert('Reader error', String(e)));
    }
  }, [params.uri]);

  useEffect(() => {
    loadReaderState().catch(() => {});
  }, [loadReaderState]);

  useEffect(() => {
    if (pdfPath && currentPage) {
      AsyncStorage.setItem(lastPageKey, String(currentPage)).catch(() => {});
    }
  }, [currentPage, lastPageKey, pdfPath]);

  const jumpToPage = useCallback((page: number) => {
    const safe = Math.min(Math.max(1, page), Math.max(1, pageCount));
    setCurrentPage(safe);
    // MuPdfViewer handles page change internally
  }, [pageCount]);

  const [isInverting, setIsInverting] = useState(false);

  const handleSmartInvert = useCallback(async () => {
    if (!pdfPath) return;
    setIsInverting(true);
    try {
      const outPath = getOutputPath(`inverted_${Date.now()}.pdf`);
      // We use the already implemented native invertColorsPdf
      await invertColorsPdf(pdfPath, outPath);
      setPdfPath(outPath);
      setNight(true);
      Alert.alert('Smart Night Mode', 'Colors have been intelligently inverted for better reading.');
    } catch (e) {
      Alert.alert('Inversion Error', 'Could not apply smart inversion.');
    } finally {
      setIsInverting(false);
    }
  }, [pdfPath]);

  const toggleBookmark = useCallback(async () => {
    const exists = bookmarks.includes(currentPage);
    const next = exists
      ? bookmarks.filter((page) => page !== currentPage)
      : [...bookmarks, currentPage].sort((a, b) => a - b);
    await saveBookmarks(next);
  }, [bookmarks, currentPage, saveBookmarks]);

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

  const bg = night ? '#000000' : '#f2f4fa';
  const text = night ? '#ffffff' : '#111111';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={night ? 'light-content' : 'dark-content'} />
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()}><Text style={[styles.topBtn, { color: text }]}>Back</Text></TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.title, { color: text }]}>Reader {currentPage}/{Math.max(1, pageCount)}</Text>
          <Text style={{ fontSize: 10, color: night ? '#666' : '#999' }} numberOfLines={1}>
            {pdfPath.split('/').pop()}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowTools(true)}><Text style={[styles.topBtn, { color: text }]}>Tools</Text></TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setShowSearch(true)} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>🔍 Search</Text></TouchableOpacity>
        <TouchableOpacity onPress={loadTOC} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>📖 TOC</Text></TouchableOpacity>
        <TouchableOpacity 
          onPress={handleSmartInvert} 
          disabled={isInverting}
          style={[styles.controlBtn, { backgroundColor: night ? '#444' : '#ffffff', borderColor: '#007AFF', borderWidth: night ? 0 : 1 }]}
        >
          <Text style={{ color: text }}>{isInverting ? '...' : '✨ Smart Night'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setNight((v) => !v)} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>{night ? '☀️' : '🌙'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={toggleBookmark} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>{bookmarks.includes(currentPage) ? '🔖' : '📑'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowBookmarkList(true)} style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}><Text style={{ color: text }}>📋</Text></TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setMode(m => m === 'vertical' ? 'horizontal' : m === 'horizontal' ? 'book' : 'vertical')} 
          style={[styles.controlBtn, { backgroundColor: night ? '#222' : '#ffffff' }]}
        >
          <Text style={{ color: text }}>{mode === 'vertical' ? '📜' : mode === 'horizontal' ? '📖' : '📄'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.readerWrap}>
        {pdfPath ? (
          <MuPdfViewer
            source={pdfPath}
            mode={mode}
            nightMode={night}
            initialPage={currentPage}
            onPageChanged={(page, total) => {
              setCurrentPage(page);
              setPageCount(total);
            }}
            onDocumentLoaded={(total) => setPageCount(total)}
            onError={(err) => Alert.alert('PDF Error', err)}
          />
        ) : (
          <View style={[styles.emptyState, { backgroundColor: bg }]}>
            <View style={styles.emptyHero}>
              <Text style={{ fontSize: 60, marginBottom: 16 }}>📚</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>PDF Reader</Text>
              <Text style={{ color: night ? '#888' : '#666', marginBottom: 24, textAlign: 'center' }}>
                Open a document to start reading and managing your PDFs.
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={importPdf} style={[styles.heroBtn, { backgroundColor: '#007AFF' }]}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>📂 Open PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={importImages} style={[styles.heroBtn, { backgroundColor: '#34C759' }]}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>📸 From Images</Text>
                </TouchableOpacity>
              </View>
            </View>

            {recentFiles.length > 0 && (
              <View style={styles.recentSection}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={[styles.sectionTitle, { color: text }]}>Recent Files</Text>
                  <TouchableOpacity onPress={clearRecentFiles}><Text style={{ color: '#FF3B30', fontSize: 12 }}>Clear All</Text></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {recentFiles.map((f, i) => (
                    <TouchableOpacity key={i} onPress={() => openPdf(f.path)} style={[styles.recentItem, { backgroundColor: night ? '#1a1a1a' : '#fff' }]}>
                      <Text style={{ fontSize: 24, marginRight: 12 }}>📄</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.recentName, { color: text }]} numberOfLines={1}>{f.name}</Text>
                        <Text style={{ color: '#888', fontSize: 11 }}>{new Date(f.date).toLocaleDateString()}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Bookmark List Modal */}
      <Modal visible={showBookmarkList} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.tocContainer, { backgroundColor: night ? '#1a1a1a' : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: text }]}>Bookmarks</Text>
              <TouchableOpacity onPress={() => setShowBookmarkList(false)}>
                <Text style={{ color: '#007AFF', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
            {bookmarks.length === 0 ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#888' }}>No bookmarks yet.</Text>
              </View>
            ) : (
              <FlatList
                data={bookmarks}
                keyExtractor={(item) => String(item)}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    onPress={() => { jumpToPage(item); setShowBookmarkList(false); }}
                    style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: night ? '#333' : '#eee' }}
                  >
                    <Text style={{ color: text, fontSize: 16 }}>Page {item}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Search Modal */}
      <Modal visible={showSearch} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.searchContainer, { backgroundColor: night ? '#1a1a1a' : '#fff' }]}>
            <View style={styles.searchHeader}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: night ? '#333' : '#f0f0f0', color: text }]}
                placeholder="Search text in document..."
                placeholderTextColor="#888"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={performSearch}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowSearch(false)} style={{ marginLeft: 12 }}><Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Close</Text></TouchableOpacity>
            </View>
            
            {isSearching ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: text }}>Searching...</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item, i) => String(i)}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    onPress={() => { jumpToPage(item.page); setShowSearch(false); }}
                    style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: night ? '#333' : '#eee' }}
                  >
                    <Text style={{ color: text, fontWeight: 'bold' }}>Page {item.page}</Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>{item.hits} matches found</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#888', marginTop: 40 }}>{searchQuery ? 'No results found' : 'Type to search'}</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* TOC Modal */}
      <Modal visible={showTOC} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.tocContainer, { backgroundColor: night ? '#1a1a1a' : '#fff' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: text }]}>Table of Contents</Text>
              <TouchableOpacity onPress={() => setShowTOC(false)}><Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Close</Text></TouchableOpacity>
            </View>
            {isLoadingTOC ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: text }}>Loading TOC...</Text></View>
            ) : (
              <FlatList
                data={toc}
                keyExtractor={(item, i) => String(i)}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    onPress={() => { jumpToPage(item.page); setShowTOC(false); }}
                    style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: night ? '#333' : '#eee' }}
                  >
                    <Text style={{ color: text }}>{item.title}</Text>
                    <Text style={{ color: '#007AFF', fontSize: 11 }}>Page {item.page}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#888', marginTop: 40 }}>No outline available for this PDF.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>

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
                      <TouchableOpacity key={tool.id} onPress={() => executeTool(tool.route)} activeOpacity={0.7}>
                        <View style={[dynamicStyles.toolCard, { borderColor: night ? '#333' : '#eee', backgroundColor: night ? '#222' : '#fafafa' }]}>
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
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8, alignItems: 'center' },
  topBtn: { fontWeight: '600', fontSize: 15 },
  title: { fontSize: 15, fontWeight: '700' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
  controlBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  readerWrap: { flex: 1, backgroundColor: '#ececec' },
  emptyState: { flex: 1, padding: 20 },
  emptyHero: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  emptyTitle: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  heroBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 },
  recentSection: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  recentItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  recentName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  pdf: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: '#000000a0', justifyContent: 'flex-end' },
  modalDocCard: { height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16 },
  searchContainer: { height: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  searchInput: { flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 20, fontSize: 16 },
  tocContainer: { height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#00000015' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  toolIconBg: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  toolCardName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
