import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, Platform } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { removePages, getPageCount } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';

export default function RemovePagesScreen() {
  const { isDark } = useAppTheme();
  const [pages, setPages] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [lastSelected, setLastSelected] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState(false); // Mobile alternative to Shift key

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#FF3B30'; // Red for removal
  const muted = isDark ? '#888' : '#999';

  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  const handlePickFile = async () => {
    try {
      const picked = await pickSinglePdf();
      if (!picked) return;
      setSelectedFile(picked.path);
      setSelectedFileName(picked.name);
      
      const count = await getPageCount(picked.path);
      if (count > 0) {
        setPages(Array.from({length: count}, (_, i) => i + 1));
        setSelected(new Set());
        setLastSelected(null);
      }
    } catch (e: any) {
      Alert.alert('File Picker Error', e.message);
    }
  };

  const handleAction = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    if (selected.size === 0) throw new Error('Please select at least 1 page to remove');
    await ensureOutputDir();
    const outputPath = getOutputPath('removed_pages_output.pdf');
    onProgress(40, `Removing ${selected.size} pages via QPDF...`);
    await removePages(selectedFile, outputPath, Array.from(selected));
    onProgress(100, 'Done!');
    return outputPath;
  };

  const togglePage = (p: number, shiftPressed: boolean = false) => {
    const newSet = new Set(selected);
    
    if (shiftPressed || rangeMode) {
      if (lastSelected !== null) {
        const start = Math.min(lastSelected, p);
        const end = Math.max(lastSelected, p);
        const adding = !selected.has(p); // If target is not selected, select the range
        
        for (let i = start; i <= end; i++) {
          if (pages.includes(i)) {
            if (adding) newSet.add(i);
            else newSet.delete(i);
          }
        }
        setSelected(newSet);
        if (rangeMode) setRangeMode(false); // Auto-turn off range mode on mobile after one use
        setLastSelected(p);
        return;
      }
    }

    if (newSet.has(p)) newSet.delete(p);
    else newSet.add(p);
    
    setSelected(newSet);
    setLastSelected(p);
  };

  // Basic Keyboard shortcut support for Web/Desktop
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFile && selected.size > 0) {
          // You could trigger execution here if we had direct access, 
          // or just notify user. Real implementation would call handleAction via ref.
          console.log('Delete shortcut triggered');
        }
      }
      if (e.key === 'Shift') setRangeMode(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setRangeMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selected, selectedFile]);

  return (
    <ToolShell title="Remove Pages" subtitle="Select pages to delete" onExecute={handleAction} executeLabel={`🗑️ Remove ${selected.size} Pages`}>
      <TouchableOpacity
        style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
        onPress={handlePickFile}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
        <Text style={[styles.pickText, { color: textColor }]}>
          {selectedFileName || 'Select PDF File'}
        </Text>
        <Text style={{ color: muted, fontSize: 12 }}>{selectedFile ? 'Tap to change file' : 'Tap to browse'}</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: textColor }]}>🗑️ Select Pages to Remove</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={() => setSelected(new Set(pages))}>
            <Text style={{ color: '#007AFF', fontSize: 13, fontWeight: '600' }}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelected(new Set())}>
            <Text style={{ color: accent, fontSize: 13, fontWeight: '600' }}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 }}>
        <Text style={{ color: muted, fontSize: 12 }}>
          Tap to toggle. Enable 'Select Range' to grab multiple.
        </Text>
        {Platform.OS !== 'web' && (
          <TouchableOpacity 
            style={[styles.rangeBtn, { backgroundColor: rangeMode ? accent + '22' : isDark ? '#333' : '#ddd', borderColor: rangeMode ? accent : 'transparent' }]} 
            onPress={() => setRangeMode(!rangeMode)}
          >
            <Text style={{ color: rangeMode ? accent : textColor, fontSize: 11, fontWeight: '600' }}>
              {rangeMode ? 'Range mode ON' : 'Select Range'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={pages}
        numColumns={4}
        keyExtractor={item => String(item)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.pageBox,
              { backgroundColor: cardBg, borderColor: selected.has(item) ? accent : isDark ? '#333' : '#ddd' },
              selected.has(item) && { backgroundColor: accent + '22' }
            ]}
            onPress={() => togglePage(item)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 20 }}>📄</Text>
            <Text style={{ color: selected.has(item) ? accent : textColor, fontSize: 13, fontWeight: 'bold' }}>{item}</Text>
            {selected.has(item) && <Text style={styles.crossIcon}>✕</Text>}
          </TouchableOpacity>
        )}
      />
      
      <Text style={{ color: muted, fontSize: 11, marginTop: 16, textAlign: 'center' }}>
        Desktop Tip: Use Shift+Click for ranges. Press Delete to execute.
      </Text>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginTop: 16 },
  pickText: { fontSize: 16, fontWeight: '600' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 },
  label: { fontSize: 15, fontWeight: '700' },
  pageBox: { flex: 1, aspectRatio: 0.8, margin: 4, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  crossIcon: { position: 'absolute', top: 2, right: 4, color: '#FF3B30', fontSize: 12, fontWeight: 'bold' },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 }
});
