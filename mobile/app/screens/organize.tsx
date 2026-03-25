import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { reorderPages, getPageCount } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

export default function OrganizeScreen() {
  const { isDark } = useAppTheme();
  const [pages, setPages] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [manualPos, setManualPos] = useState('');

  const handlePickFile = async () => {
    try {
      const picked = await pickSinglePdf();
      if (!picked) return;
      setSelectedFile(picked.path);
      setSelectedFileName(picked.name);
      
      const count = await getPageCount(picked.path);
      if (count > 0) {
        setPages(Array.from({ length: count }, (_, i) => i + 1));
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const borderColor = isDark ? '#444' : '#ddd';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#999';
  const inputBg = isDark ? '#2a2a2a' : '#fff';

  const movePageManual = (fromIndex: number, newPosStr: string) => {
    const toIndex = parseInt(newPosStr, 10) - 1;
    if (isNaN(toIndex) || toIndex < 0 || toIndex >= pages.length || toIndex === fromIndex) {
      setManualPos('');
      return;
    }
    const arr = [...pages];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    setPages(arr);
    setManualPos('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleOrganize = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputPath = getOutputPath('organized_output.pdf');
    onProgress(35, 'Reordering pages via QPDF...');
    await reorderPages(selectedFile, outputPath, pages);
    onProgress(100, 'Done!');
    return outputPath;
  };

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<number>) => {
    const index = getIndex() || 0;
    return (
      <ScaleDecorator>
        <View style={[styles.pageRow, {
          backgroundColor: isActive ? (isDark ? '#1a2a50' : '#e8f0ff') : cardBg,
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
          <View style={[styles.indexBadge, { backgroundColor: accent + '22' }]}>
            <Text style={{ color: accent, fontWeight: 'bold', fontSize: 14 }}>{index + 1}</Text>
          </View>
          <Text style={{ fontSize: 20, marginHorizontal: 12 }}>📄</Text>
          <Text style={[styles.pageName, { color: textColor }]}>Page {item}</Text>
          <View style={styles.pageActions}>
            <Text style={{ color: muted, fontSize: 12, marginRight: 4 }}>Pos:</Text>
            <TextInput
              style={[styles.posInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
              placeholder={String(index + 1)}
              placeholderTextColor={muted}
              keyboardType="number-pad"
              maxLength={3}
              onEndEditing={(e) => movePageManual(index, e.nativeEvent.text)}
            />
          </View>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToolShell title="Organize Pages" subtitle="Reorder pages by dragging" onExecute={handleOrganize} executeLabel="📋 Save New Order" disableScroll={true}>
        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity
            style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
            onPress={handlePickFile}
            testID="button-pick-file"
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
            <Text style={[styles.pickText, { color: textColor }]}>
              {selectedFileName || 'Select PDF File'}
            </Text>
            <Text style={{ color: muted, fontSize: 12 }}>{selectedFile ? 'Tap to change file' : 'Tap to browse'}</Text>
          </TouchableOpacity>

          <View style={styles.listHeader}>
            <Text style={[styles.label, { color: textColor }]}>📋 Page Order ({pages.length} pages)</Text>
            <TouchableOpacity onPress={() => setPages([...pages].sort((a,b) => a-b))} testID="button-reset-order">
              <Text style={{ color: accent, fontSize: 13, fontWeight: '600' }}>Reset</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: muted, fontSize: 12, marginBottom: 12 }}>
            Hold ☰ to drag & drop, or type new Pos number.
          </Text>
        </View>

        <DraggableFlatList
          data={pages}
          onDragEnd={({ data }) => {
            setPages(data);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          keyExtractor={(item, index) => `page_${item}_${index}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          containerStyle={{ flex: 1 }}
        />
      </ToolShell>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16, marginTop: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 15, fontWeight: '700' },
  pageRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  dragHandle: { padding: 8, marginRight: 6 },
  indexBadge: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  pageName: { flex: 1, fontSize: 14, fontWeight: '500' },
  pageActions: { flexDirection: 'row', alignItems: 'center' },
  posInput: { borderWidth: 1, borderRadius: 6, width: 44, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'center', fontSize: 13 },
});
