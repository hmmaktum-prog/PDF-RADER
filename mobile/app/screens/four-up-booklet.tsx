import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { fourUpBooklet } from '../utils/nativeModules';
import { getFourUpBookletChunks } from '../utils/fourUpBooklet';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';

const ORIENTATIONS = [
  { id: 'landscape', label: '🌄 Landscape', hint: 'Wider pages, horizontal layout' },
  { id: 'portrait', label: '🖼️ Portrait', hint: 'Taller pages, vertical layout' },
];

export default function FourUpBookletScreen() {
  const { isDark } = useAppTheme();
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [orientation, setOrientation] = useState('landscape');

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#999';

  const handlePickFile = async () => {
    try {
      const picked = await pickSinglePdf();
      if (!picked) return;
      setSelectedFile(picked.path);
      setSelectedFileName(picked.name);
    } catch (e: any) {
      Alert.alert('File Picker Error', e.message);
    }
  };

  const handleAction = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputPath = getOutputPath('4up_booklet_output.pdf');
    onProgress(35, 'Arranging 4-up booklet via QPDF...');
    await fourUpBooklet(selectedFile, outputPath, orientation);
    onProgress(100, 'Done!');
    return outputPath;
  };

  return (
    <ToolShell title="4-Up Booklet" subtitle="4 pages per sheet in booklet order" onExecute={handleAction} executeLabel="📋 Create 4-Up Booklet">
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
        <Text style={{ color: muted, fontSize: 12 }}>
          {selectedFile ? 'Tap to change file' : 'Tap to browse'}
        </Text>
      </TouchableOpacity>

      <View style={[styles.infoBox, { backgroundColor: cardBg }]}>
        <Text style={{ fontSize: 32, marginBottom: 8 }}>📋</Text>
        <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 6 }]}>4-Up Booklet Format</Text>
        <Text style={{ color: muted, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
          4 pages are arranged on each sheet in booklet order. Print double-sided, then fold and cut to create a compact booklet. Ideal for handouts and study guides.
        </Text>
      </View>

      <View style={[styles.infoBox, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 6 }]}>🔢 Example 4-Up Spread (8 pages)</Text>
        {getFourUpBookletChunks(8).map((chunk, idx) => (
          <Text key={idx} style={{ color: muted, fontSize: 12, marginBottom: 2 }}>
            Sheet {idx + 1}: {chunk.join(', ')}
          </Text>
        ))}
      </View>

      <View style={styles.orientRow}>
        {ORIENTATIONS.map((o) => (
          <TouchableOpacity
            key={o.id}
            style={[styles.orientCard, { backgroundColor: cardBg, borderColor: orientation === o.id ? accent : isDark ? '#444' : '#ccc' }, orientation === o.id && { backgroundColor: accent + '22' }]}
            onPress={() => setOrientation(o.id)}
          >
            <Text style={{ fontSize: 24, marginBottom: 4 }}>{o.label.split(' ')[0]}</Text>
            <Text style={{ color: orientation === o.id ? accent : textColor, fontWeight: '600', fontSize: 13 }}>{o.label.split(' ')[1]}</Text>
            <Text style={{ color: muted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{o.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  infoBox: { padding: 20, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  orientRow: { flexDirection: 'row', gap: 12 },
  orientCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
});
