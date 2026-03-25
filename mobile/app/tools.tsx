import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Animated,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from './context/ThemeContext';
import * as Haptics from 'expo-haptics';

export type ToolItem = {
  id: string;
  name: string;
  icon: string;
  route: string;
  desc: string;
  grad: readonly [string, string];
};

export type ToolSection = {
  title: string;
  emoji: string;
  grad: readonly [string, string];
  data: ToolItem[];
};

export const TOOL_SECTIONS: ToolSection[] = [
  {
    title: 'Edit & Organize',
    emoji: '✏️',
    grad: ['#007AFF', '#0055CC'] as const,
    data: [
      { id: 'merge',        name: 'Merge PDF',      icon: '🔗', route: '/screens/merge',        desc: 'Combine multiple PDFs into one',        grad: ['#007AFF', '#0055CC'] as const },
      { id: 'split',        name: 'Split PDF',       icon: '✂️', route: '/screens/split',        desc: 'Split PDF into separate files',         grad: ['#FF9500', '#CC6600'] as const },
      { id: 'split-by-line',name: 'Split by Line',  icon: '📐', route: '/screens/split-by-line', desc: 'Draw a line to split pages',            grad: ['#FF6B35', '#CC3300'] as const },
      { id: 'rotate',       name: 'Rotate Pages',   icon: '🔄', route: '/screens/rotate',        desc: 'Rotate pages to any angle',            grad: ['#5AC8FA', '#0099DD'] as const },
      { id: 'compress',     name: 'Compress',        icon: '📦', route: '/screens/compress',      desc: 'Reduce file size without quality loss', grad: ['#34C759', '#1E8B3C'] as const },
      { id: 'organize',     name: 'Organize',        icon: '📋', route: '/screens/organize',      desc: 'Reorder pages via drag & drop',        grad: ['#32ADE6', '#0077BB'] as const },
      { id: 'remove-pages', name: 'Remove Pages',   icon: '🗑️', route: '/screens/remove-pages',  desc: 'Delete unwanted pages',                grad: ['#FF3B30', '#AA1100'] as const },
    ],
  },
  {
    title: 'Convert',
    emoji: '🔄',
    grad: ['#AF52DE', '#7B2FBE'] as const,
    data: [
      { id: 'image-to-pdf', name: 'Image → PDF',    icon: '🖼️', route: '/screens/image-to-pdf',  desc: 'Convert images to PDF document',       grad: ['#FF2D55', '#CC0033'] as const },
      { id: 'pdf-to-image', name: 'PDF → Image',    icon: '📸', route: '/screens/pdf-to-image',  desc: 'Export pages as PNG/JPG images',       grad: ['#AF52DE', '#7B2FBE'] as const },
    ],
  },
  {
    title: 'Visual Effects',
    emoji: '🎨',
    grad: ['#FF9500', '#CC6600'] as const,
    data: [
      { id: 'invert',          name: 'Invert Colors',    icon: '🌗', route: '/screens/invert',          desc: 'Dark mode for any PDF',              grad: ['#FF6B35', '#CC3300'] as const },
      { id: 'whitener',        name: 'Whitener',          icon: '🧹', route: '/screens/whitener',        desc: 'Remove dark backgrounds',            grad: ['#34C759', '#1E8B3C'] as const },
      { id: 'enhance-contrast',name: 'Enhance Contrast', icon: '🔲', route: '/screens/enhance-contrast', desc: 'Sharpen faded or scanned PDFs',     grad: ['#007AFF', '#0055CC'] as const },
      { id: 'grayscale',       name: 'Grayscale',         icon: '🖤', route: '/screens/grayscale',       desc: 'Convert to black and white',         grad: ['#636366', '#3a3a3c'] as const },
    ],
  },
  {
    title: 'AI & Text',
    emoji: '🤖',
    grad: ['#AF52DE', '#7B2FBE'] as const,
    data: [
      { id: 'ocr', name: 'AI OCR', icon: '🤖', route: '/screens/ocr', desc: 'Extract text with Gemini AI or PaddleOCR', grad: ['#AF52DE', '#7B2FBE'] as const },
    ],
  },
  {
    title: 'Advanced Layout',
    emoji: '📐',
    grad: ['#FF2D55', '#CC0033'] as const,
    data: [
      { id: 'nup',             name: 'N-Up Layout',      icon: '🔢', route: '/screens/nup',             desc: 'Multiple pages per sheet',          grad: ['#007AFF', '#0055CC'] as const },
      { id: 'booklet',         name: 'Booklet',           icon: '📖', route: '/screens/booklet',         desc: 'Create printable booklets',         grad: ['#FF9500', '#CC6600'] as const },
      { id: 'four-up-booklet', name: '4-Up Booklet',     icon: '📓', route: '/screens/four-up-booklet', desc: 'Pocket-size 4-page booklet',        grad: ['#FF2D55', '#CC0033'] as const },
      { id: 'resize',          name: 'Resize Pages',     icon: '📏', route: '/screens/resize',          desc: 'Change page dimensions',            grad: ['#5AC8FA', '#0099DD'] as const },
      { id: 'repair',          name: 'Repair PDF',       icon: '🔧', route: '/screens/repair',          desc: 'Fix corrupted PDF files',           grad: ['#34C759', '#1E8B3C'] as const },
      { id: 'auto-process',    name: 'Auto Process',     icon: '⚡', route: '/screens/auto-process',    desc: 'Pipeline automation for batch tasks', grad: ['#FF6B35', '#CC3300'] as const },
    ],
  },
];

export default function ToolsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { isDark } = useAppTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => clearTimeout(handler);
  }, [query]);

  const bg     = isDark ? '#0a0e1a' : '#f0f2f8';
  const cardBg = isDark ? '#141824' : '#ffffff';
  const text   = isDark ? '#ffffff' : '#0a0e1a';
  const muted  = isDark ? '#6e7a9a' : '#6c75a0';
  const border = isDark ? '#1e2538' : '#e2e5f0';
  const inputBg = isDark ? '#1a2035' : '#ffffff';
  const accent = '#007AFF';

  const filteredSections = useMemo(() => {
    if (!debouncedQuery.trim()) return TOOL_SECTIONS;
    const q = debouncedQuery.toLowerCase();
    return TOOL_SECTIONS
      .map(section => ({
        ...section,
        data: section.data.filter(
          item =>
            item.name.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(section => section.data.length > 0);
  }, [debouncedQuery]);

  const flatResults: ToolItem[] = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    return filteredSections.flatMap(s => s.data);
  }, [filteredSections, debouncedQuery]);

  const isSearching = debouncedQuery.trim().length > 0;

  const renderCard = (item: ToolItem) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(item.route as any);
      }}
      activeOpacity={0.72}
    >
      <LinearGradient colors={item.grad} style={styles.iconBg}>
        <Text style={styles.icon}>{item.icon}</Text>
      </LinearGradient>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: text }]}>{item.name}</Text>
        <Text style={[styles.cardDesc, { color: muted }]}>{item.desc}</Text>
      </View>
      <Text style={[styles.arrow, { color: muted }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* Search Bar */}
        <View style={[styles.searchWrap, { paddingTop: 8, paddingHorizontal: 14 }]}>
          <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor: border }]}>
            <Text style={[styles.searchIcon, { color: muted }]}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: text }]}
              placeholder="Search tools..."
              placeholderTextColor={muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: muted, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Results */}
        {isSearching ? (
          flatResults.length > 0 ? (
            <FlatList
              data={flatResults}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
              ListHeaderComponent={
                <Text style={[styles.resultCount, { color: muted }]}>
                  {flatResults.length} result{flatResults.length !== 1 ? 's' : ''} for "{query}"
                </Text>
              }
              renderItem={({ item }) => renderCard(item)}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>No tools found</Text>
              <Text style={[styles.emptyDesc, { color: muted }]}>
                Try searching for "merge", "compress", "ocr" etc.
              </Text>
              <TouchableOpacity
                style={[styles.clearBtn, { backgroundColor: accent + '22', borderColor: accent }]}
                onPress={() => setQuery('')}
              >
                <Text style={{ color: accent, fontWeight: '600' }}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          /* Normal Section List */
          <SectionList
            sections={TOOL_SECTIONS}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8, paddingHorizontal: 14 }}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHead}>
                <LinearGradient colors={section.grad} style={styles.sectionBadge}>
                  <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                </LinearGradient>
                <Text style={[styles.sectionTitle, { color: text }]}>{section.title}</Text>
                <View style={[styles.sectionLine, { backgroundColor: border }]} />
              </View>
            )}
            renderItem={({ item }) => renderCard(item)}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  searchWrap: { paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, height: 46,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  resultCount: { fontSize: 12, marginBottom: 10, marginLeft: 2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  clearBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 24, marginBottom: 12, gap: 10,
  },
  sectionBadge:  { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionEmoji:  { fontSize: 15 },
  sectionTitle:  { fontSize: 15, fontWeight: '800', letterSpacing: 0.2, flex: 1 },
  sectionLine:   { height: 1, flex: 1 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, marginBottom: 8, borderRadius: 18, borderWidth: 1,
    elevation: 3,
    shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8,
  },
  iconBg: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
    elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
  icon:      { fontSize: 24 },
  cardBody:  { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  cardDesc:  { fontSize: 12, lineHeight: 16 },
  arrow:     { fontSize: 28, fontWeight: '300', marginLeft: 4 },
});
