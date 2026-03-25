import React, { useLayoutEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { imagesToPdf } from '../utils/nativeModules';
import * as ImagePicker from 'expo-image-picker';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { useContinueTool } from '../context/ContinueContext';

interface AppImage {
  id: string;
  uri: string;
  name: string;
  rotation: number;
}

const PAGE_SIZES = [
  { id: 'A4', label: 'A4', sub: 'Standard' },
  { id: 'Letter', label: 'Letter', sub: '8.5×11"' },
  { id: 'Fit', label: 'Fit', sub: 'Native size' },
];

const MARGINS = [
  { id: 'none', label: 'Full Bleed', emoji: '🔳', points: 0 },
  { id: 'small', label: 'Small', emoji: '🔲', points: 18 },
  { id: 'standard', label: 'Standard', emoji: '🖼️', points: 36 },
];

function isImagePickedFile(f: { mimeType?: string; name: string }): boolean {
  const m = (f.mimeType ?? '').toLowerCase();
  if (m.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(f.name);
}

export default function ImageToPdfScreen() {
  const { isDark } = useAppTheme();
  const { queuedPickedFiles, setQueuedPickedFiles } = useContinueTool();
  const [images, setImages] = useState<AppImage[]>([]);
  const [pageSize, setPageSize] = useState('A4');
  const [margin, setMargin] = useState('none');
  const [orientation, setOrientation] = useState<'portrait'|'landscape'>('portrait');

  useLayoutEffect(() => {
    if (!queuedPickedFiles?.length) return;
    const imgs = queuedPickedFiles.filter(isImagePickedFile);
    const imgPaths = new Set(imgs.map((i) => i.path));
    const remaining = queuedPickedFiles.filter((f) => !imgPaths.has(f.path));
    if (imgs.length) {
      setImages((prev) => {
        const existing = new Set(prev.map((p) => p.uri));
        const next = imgs
          .filter((f) => !existing.has(f.path))
          .map((f, i) => ({
            id: `home-${Date.now()}-${i}`,
            uri: f.path,
            name: f.name,
            rotation: 0,
          }));
        return [...prev, ...next];
      });
    }
    setQueuedPickedFiles(remaining.length ? remaining : null);
  }, [queuedPickedFiles, setQueuedPickedFiles]);

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#999';

  const handlePickImages = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (!result.canceled && result.assets) {
        const newImgs = result.assets.map((a, i) => ({
          id: Date.now() + '-' + i,
          uri: a.uri,
          name: a.fileName || `Image ${i+1}`,
          rotation: 0,
        }));
        setImages(prev => [...prev, ...newImgs]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const removeImage = (id: string) => setImages(prev => prev.filter(i => i.id !== id));
  
  const rotateImage = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages(prev => prev.map(i => i.id === id ? { ...i, rotation: (i.rotation + 90) % 360 } : i));
  };

  const sortAZ = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages(prev => [...prev].sort((a,b) => a.name.localeCompare(b.name)));
  };

  const handleAction = async (onProgress: (pct: number, label?: string) => void) => {
    if (images.length === 0) throw new Error('Please select at least 1 image');
    await ensureOutputDir();
    const outputPath = getOutputPath('images_output.pdf');
    const mPx = MARGINS.find(m => m.id === margin)?.points || 0;
    onProgress(30, `Writing ${images.length} images to PDF (Orient: ${orientation})...`);
    await imagesToPdf(images.map(i => ({ uri: i.uri, rotation: i.rotation })), outputPath, pageSize, orientation, mPx);
    onProgress(100, 'Done!');
    return outputPath;
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<AppImage>) => (
    <ScaleDecorator>
      <View style={[styles.imgRow, { backgroundColor: isActive ? (isDark ? '#333' : '#dcdcdc') : cardBg }]}>
        <TouchableOpacity onLongPress={drag} style={styles.dragHandle}><Text style={{ color: muted, fontSize: 18 }}>☰</Text></TouchableOpacity>
        <Text style={{ fontSize: 24, paddingHorizontal: 8, transform: [{ rotate: `${item.rotation}deg` }] }}>📸</Text>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: textColor, fontWeight: '500', fontSize: 13 }} numberOfLines={1}>{item.name}</Text>
          <Text style={{ color: muted, fontSize: 11 }}>Rot: {item.rotation}°</Text>
        </View>
        <TouchableOpacity onPress={() => rotateImage(item.id)} style={{ padding: 8, marginRight: 4 }}><Text style={{ color: accent, fontSize: 18 }}>↻</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => removeImage(item.id)} style={{ padding: 8 }}><Text style={{ color: '#FF3B30', fontSize: 18 }}>✕</Text></TouchableOpacity>
      </View>
    </ScaleDecorator>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToolShell title="Image to PDF" subtitle="Convert photos to PDF" onExecute={handleAction} executeLabel="🖼️ Create PDF" disableScroll={true}>
        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]} onPress={handlePickImages} activeOpacity={0.7}>
            <Text style={{ fontSize: 30, marginBottom: 6 }}>🖼️</Text>
            <Text style={[styles.pickText, { color: textColor }]}>Select Images</Text>
            <Text style={{ color: muted, fontSize: 12 }}>JPG, PNG, WEBP</Text>
          </TouchableOpacity>

          {images.length > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.sectionLabel, { color: textColor }]}>{images.length} Image{images.length > 1 ? 's' : ''}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={sortAZ}><Text style={{ color: accent, fontWeight: '600' }}>A-Z Sort</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setImages([])}><Text style={{ color: '#FF3B30', fontWeight: '600' }}>Clear</Text></TouchableOpacity>
              </View>
            </View>
          )}
          {images.length === 0 && <Text style={{ color: muted, textAlign: 'center', marginVertical: 10 }}>No images added.</Text>}
        </View>

        <View style={{ flex: 1 }}>
          <DraggableFlatList
            data={images}
            onDragEnd={({ data }) => { setImages(data); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}
          />
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📄 Page Dimensions</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: muted, fontSize: 11, marginBottom: 4 }}>Size</Text>
              <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#444' : '#ccc', overflow: 'hidden' }}>
                {PAGE_SIZES.map((s, i) => (
                  <TouchableOpacity key={s.id} style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: pageSize === s.id ? accent : cardBg, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: isDark ? '#444' : '#ccc' }} onPress={() => setPageSize(s.id)}>
                    <Text style={{ color: pageSize === s.id ? '#fff' : textColor, fontSize: 12, fontWeight: '600' }}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: muted, fontSize: 11, marginBottom: 4 }}>Orientation</Text>
              <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#444' : '#ccc', overflow: 'hidden' }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: orientation === 'portrait' ? accent : cardBg }} onPress={() => setOrientation('portrait')}>
                  <Text style={{ color: orientation === 'portrait' ? '#fff' : textColor, fontSize: 12, fontWeight: '600' }}>Port</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: orientation === 'landscape' ? accent : cardBg, borderLeftWidth: 1, borderLeftColor: isDark ? '#444' : '#ccc' }} onPress={() => setOrientation('landscape')}>
                  <Text style={{ color: orientation === 'landscape' ? '#fff' : textColor, fontSize: 12, fontWeight: '600' }}>Land</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 6 }]}>🖼️ Margins</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {MARGINS.map(m => (
              <TouchableOpacity key={m.id} style={[styles.marginCard, { backgroundColor: cardBg, borderColor: margin === m.id ? accent : isDark ? '#333' : '#ddd' }]} onPress={() => setMargin(m.id)}>
                <Text style={{ color: margin === m.id ? accent : textColor, fontSize: 13, fontWeight: '600' }}>{m.emoji} {m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ToolShell>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 20, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 12, marginTop: 10 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 14, fontWeight: '700' },
  imgRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', marginBottom: 6 },
  dragHandle: { padding: 6, paddingLeft: 0 },
  marginCard: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
});
