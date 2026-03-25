import React, { useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { mergePdfs } from '../utils/nativeModules';
import { useContinueTool } from '../context/ContinueContext';
import { pickMultiplePdfs } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

interface PdfFile {
  name: string;
  path: string;
  size?: string;
  id: string;
}

export default function MergeScreen() {
  const { isDark } = useAppTheme();
  const { sharedFilePath, queuedPickedFiles, setQueuedPickedFiles } = useContinueTool();
  const [files, setFiles] = useState<PdfFile[]>(
    sharedFilePath
      ? [{ name: sharedFilePath.split('/').pop() || 'shared.pdf', path: sharedFilePath, id: Date.now().toString() }]
      : []
  );
  const [invertColors, setInvertColors] = useState(false);

  useLayoutEffect(() => {
    if (!queuedPickedFiles?.length) return;
    const pdfs = queuedPickedFiles.filter((f) => {
      const m = (f.mimeType ?? '').toLowerCase();
      return m.includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
    });
    const pdfPaths = new Set(pdfs.map((p) => p.path));
    const remaining = queuedPickedFiles.filter((f) => !pdfPaths.has(f.path));
    if (pdfs.length) {
      setFiles((prev) => {
        const existingPaths = new Set(prev.map((f) => f.path));
        const newFiles = pdfs
          .filter((f) => !existingPaths.has(f.path))
          .map((f, i) => ({
            name: f.name,
            path: f.path,
            size: f.size,
            id: `home-${Date.now()}-${i}`,
          }));
        return [...prev, ...newFiles];
      });
    }
    setQueuedPickedFiles(remaining.length ? remaining : null);
  }, [queuedPickedFiles, setQueuedPickedFiles]);

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const borderColor = isDark ? '#444' : '#ccc';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#999';

  const handlePickFiles = async () => {
    try {
      const picked = await pickMultiplePdfs();
      if (picked.length === 0) return;
      setFiles(prev => {
        const existingPaths = new Set(prev.map(f => f.path));
        const newFiles = picked
          .filter(f => !existingPaths.has(f.path))
          .map((f, i) => ({ ...f, id: Date.now().toString() + i }));
        return [...prev, ...newFiles];
      });
    } catch (e: any) {
      Alert.alert('File Picker Error', e.message);
    }
  };

  const handleRemoveFile = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? index - 1 : index + 1;
    if (toIndex < 0 || toIndex >= files.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFiles(prev => {
      const arr = [...prev];
      [arr[index], arr[toIndex]] = [arr[toIndex], arr[index]];
      return arr;
    });
  };

  const sortFiles = (type: 'az' | 'za' | 'reverse') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFiles(prev => {
      const arr = [...prev];
      if (type === 'az') arr.sort((a, b) => a.name.localeCompare(b.name));
      else if (type === 'za') arr.sort((a, b) => b.name.localeCompare(a.name));
      else if (type === 'reverse') arr.reverse();
      return arr;
    });
  };

  const handleMerge = async (onProgress: (pct: number, label?: string) => void): Promise<string> => {
    if (files.length < 2) throw new Error('Please select at least 2 PDF files to merge');
    await ensureOutputDir();
    const outputPath = getOutputPath('merged_output.pdf');
    onProgress(20, 'Validating input files...');
    onProgress(45, `Merging ${files.length} PDFs via QPDF...${invertColors ? ' (Inverting Colors)' : ''}`);
    await mergePdfs(files.map(f => f.path), outputPath, invertColors);
    onProgress(100, 'Merge complete!');
    return outputPath;
  };

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<PdfFile>) => {
    const index = getIndex() || 0;
    return (
      <ScaleDecorator>
        <View style={[styles.fileItem, {
          backgroundColor: isActive ? (isDark ? '#2a3050' : '#e8f0ff') : cardBg,
          borderColor: isActive ? accent : borderColor,
          elevation: isActive ? 16 : 0,
          shadowColor: isActive ? accent : '#000',
          shadowOpacity: isActive ? 0.3 : 0,
          shadowOffset: { width: 0, height: isActive ? 8 : 0 },
          shadowRadius: isActive ? 16 : 0,
        }]}>
          <TouchableOpacity onLongPress={drag} delayLongPress={150} style={styles.dragHandle} activeOpacity={0.7}>
            <Text style={{ fontSize: 20, color: muted }}>☰</Text>
          </TouchableOpacity>
          <View style={styles.fileLeft}>
            <Text style={{ fontSize: 24, marginRight: 10 }}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileName, { color: textColor }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.size && (
                <Text style={[styles.fileSize, { color: muted }]}>{item.size}</Text>
              )}
            </View>
          </View>
          <View style={styles.arrowsCont}>
            <TouchableOpacity onPress={() => moveFile(index, 'up')} style={styles.arrowBtn}>
              <Text style={{ color: index === 0 ? (isDark ? '#444' : '#ccc') : accent, fontSize: 16 }}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveFile(index, 'down')} style={styles.arrowBtn}>
              <Text style={{ color: index === files.length - 1 ? (isDark ? '#444' : '#ccc') : accent, fontSize: 16 }}>↓</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemoveFile(item.id)}
          >
            <Text style={{ color: '#FF3B30', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToolShell
        title="Merge PDFs"
        subtitle={`Combine ${files.length} file${files.length !== 1 ? 's' : ''} into one PDF`}
        onExecute={handleMerge}
        executeLabel="🔗 Merge PDFs"
        disableScroll={true}
      >
        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
            onPress={handlePickFiles}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
            <Text style={[styles.pickText, { color: textColor }]}>Add PDF Files</Text>
            <Text style={[styles.pickHint, { color: muted }]}>Tap to browse and select PDFs</Text>
          </TouchableOpacity>

          {files.length > 0 && (
            <View>
              <View style={styles.listHeader}>
                <Text style={[styles.label, { color: textColor }]}>
                  📋 Selected Files ({files.length})
                </Text>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFiles([]); }}>
                  <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: '600' }}>Clear All</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.sortRow}>
                <TouchableOpacity onPress={() => sortFiles('az')} style={[styles.sortBtn, { backgroundColor: isDark ? '#333' : '#ddd' }]}>
                  <Text style={{ color: textColor, fontSize: 12, fontWeight: '600' }}>A-Z</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => sortFiles('za')} style={[styles.sortBtn, { backgroundColor: isDark ? '#333' : '#ddd' }]}>
                  <Text style={{ color: textColor, fontSize: 12, fontWeight: '600' }}>Z-A</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => sortFiles('reverse')} style={[styles.sortBtn, { backgroundColor: isDark ? '#333' : '#ddd' }]}>
                  <Text style={{ color: textColor, fontSize: 12, fontWeight: '600' }}>Reverse</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.toggleRow} onPress={() => setInvertColors(!invertColors)}>
                <View>
                  <Text style={{ color: textColor, fontSize: 14, fontWeight: '600' }}>Invert Colors</Text>
                  <Text style={{ color: muted, fontSize: 12 }}>Create dark mode PDF</Text>
                </View>
                <Switch value={invertColors} onValueChange={setInvertColors} trackColor={{ false: '#555', true: accent }} />
              </TouchableOpacity>
            </View>
          )}

          {files.length === 0 && (
             <View style={[styles.emptyState, { borderColor }]}>
               <Text style={[styles.emptyText, { color: muted }]}>
                 No files selected yet.{'\n'}Add at least 2 PDF files to merge.
               </Text>
             </View>
          )}
        </View>

        {files.length > 0 && (
          <DraggableFlatList
            data={files}
            onDragEnd={({ data }) => {
              setFiles(data);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            containerStyle={{ flex: 1, marginTop: 10 }}
          />
        )}
      </ToolShell>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  pickBtn: {
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 8,
    marginTop: 16,
  },
  pickText: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  pickHint: { fontSize: 12 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '700' },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sortBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  dragHandle: { padding: 8, marginRight: 2 },
  fileLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  fileName: { fontSize: 14, fontWeight: '500' },
  fileSize: { fontSize: 11, marginTop: 2 },
  removeBtn: { padding: 10 },
  arrowsCont: { flexDirection: 'row', marginRight: 4 },
  arrowBtn: { padding: 6 },
  emptyState: {
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 8,
  },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
