import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { useContinueTool } from '../context/ContinueContext';
import * as Haptics from 'expo-haptics';
import { pickImages } from '../utils/filePicker';

const SCREEN_WIDTH = Dimensions.get('window').width;

const IMAGE_TOOLS = [
  { id: 'image-to-pdf', name: 'Image → PDF', icon: '🖼️', route: '/screens/image-to-pdf', desc: 'Convert images to PDF document', grad: ['#FF2D55', '#CC0033'] as const },
  { id: 'ocr',          name: 'AI OCR',      icon: '🤖', route: '/screens/ocr',          desc: 'Extract text from image',          grad: ['#AF52DE', '#7B2FBE'] as const },
];

export default function ImageReaderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const { queuedPickedFiles, setQueuedPickedFiles } = useContinueTool();

  const [activeIndex, setActiveIndex] = useState(0);

  const images = useMemo(() => {
    return (queuedPickedFiles || []).filter(f => f.mimeType?.includes('image'));
  }, [queuedPickedFiles]);

  const removeImage = (idxToRemove: number) => {
    if (!queuedPickedFiles) return;
    const next = [...queuedPickedFiles];
    next.splice(idxToRemove, 1);
    setQueuedPickedFiles(next.length ? next : null);
    if (activeIndex >= next.length && next.length > 0) {
      setActiveIndex(next.length - 1);
    }
  };

  const handleAddMore = async () => {
    try {
      const files = await pickImages();
      if (files.length > 0) {
        setQueuedPickedFiles([...(queuedPickedFiles || []), ...files]);
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const executeTool = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // queuedPickedFiles already has the images, so we just navigate
    router.push(route as any);
  };

  const bg     = isDark ? '#0a0e1a' : '#f0f2f8';
  const cardBg = isDark ? '#141824' : '#ffffff';
  const text   = isDark ? '#ffffff' : '#0a0e1a';
  const muted  = isDark ? '#6e7a9a' : '#6c75a0';
  const border = isDark ? '#1e2538' : '#e2e5f0';

  if (!images || images.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>🖼️</Text>
        <Text style={{ fontSize: 18, color: text, fontWeight: '700', marginBottom: 8 }}>No Images Selected</Text>
        <TouchableOpacity style={styles.addBtnWrap} onPress={() => router.back()}>
          <LinearGradient colors={['#007AFF', '#0055CC']} style={styles.addBtn}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Go Back</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.topBar, { paddingTop: insets.top + 6, backgroundColor: cardBg, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: '#007AFF' }]}>Done</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>
          Image Viewer ({activeIndex + 1}/{images.length})
        </Text>
        <TouchableOpacity onPress={handleAddMore} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: '#007AFF' }]}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={styles.viewerContainer}>
           <ScrollView 
             horizontal 
             pagingEnabled 
             showsHorizontalScrollIndicator={false}
             onMomentumScrollEnd={(e) => setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
           >
             {images.map((img, idx) => (
               <View key={img.path + idx} style={{ width: SCREEN_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
                 <View style={[styles.imageWrapper, { backgroundColor: isDark ? '#000' : '#e2e5f0' }]}>
                   <Image source={{ uri: img.path }} style={styles.previewImage} resizeMode="contain" />
                   <TouchableOpacity style={styles.deleteBadge} onPress={() => removeImage(idx)}>
                     <Text style={styles.deleteBadgeText}>✕</Text>
                   </TouchableOpacity>
                 </View>
               </View>
             ))}
           </ScrollView>
        </View>

        <View style={styles.toolsSection}>
          <Text style={[styles.sectionLabel, { color: muted }]}>IMAGE TOOLS</Text>
          <View style={styles.grid}>
            {IMAGE_TOOLS.map(tool => (
              <TouchableOpacity
                key={tool.id}
                onPress={() => executeTool(tool.route)}
                activeOpacity={0.75}
              >
                <View style={[styles.gridCard, { backgroundColor: cardBg, borderColor: border }]}>
                  <LinearGradient colors={tool.grad} style={styles.gridIconBg}>
                    <Text style={styles.gridIcon}>{tool.icon}</Text>
                  </LinearGradient>
                  <Text style={[styles.gridLabel, { color: text }]}>{tool.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerBtn: { padding: 4 },
  headerBtnText: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700' },
  
  viewerContainer: {
    height: 400,
    marginVertical: 16,
  },
  imageWrapper: {
    width: SCREEN_WIDTH - 32,
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%', height: '100%',
  },
  deleteBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center'
  },
  deleteBadgeText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  toolsSection: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  gridCard: {
    width: (SCREEN_WIDTH - 32 - 12) / 2, // 2 items per row
    paddingVertical: 20, paddingHorizontal: 12,
    borderRadius: 20, alignItems: 'center',
    borderWidth: 1,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
  },
  gridIconBg: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  gridIcon: { fontSize: 24 },
  gridLabel: { fontSize: 14, fontWeight: '700', textAlign: 'center' },

  addBtnWrap: { overflow: 'hidden', borderRadius: 14 },
  addBtn: { paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center' },
});
