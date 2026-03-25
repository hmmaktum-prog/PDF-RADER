import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { nupLayout } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';

const STANDARD_LAYOUTS = [
  { id: '2x1', label: '2-Up', cols: 2, rows: 1 },
  { id: '3x1', label: '3-Up', cols: 3, rows: 1 },
  { id: '2x2', label: '4-Up', cols: 2, rows: 2 },
  { id: '3x2', label: '6-Up', cols: 3, rows: 2 },
];

const SEQUENCES = [
  { id: 'Z', label: 'Z-Order', desc: 'Left to right, top to bottom' },
  { id: 'N', label: 'N-Order', desc: 'Top to bottom, left to right' },
  { id: 'SnakeZ', label: 'Snake-Z', desc: 'Serpentine horizontally' },
  { id: 'SnakeN', label: 'Snake-N', desc: 'Serpentine vertically' },
];

export default function NupScreen() {
  const { isDark } = useAppTheme();
  const [isCustom, setIsCustom] = useState(false);
  const [layout, setLayout] = useState(STANDARD_LAYOUTS[0]);
  const [customCols, setCustomCols] = useState('2');
  const [customRows, setCustomRows] = useState('2');
  const [sequence, setSequence] = useState('Z');
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#999';

  const cols = isCustom ? (parseInt(customCols) || 1) : layout.cols;
  const rows = isCustom ? (parseInt(customRows) || 1) : layout.rows;

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
    const outputPath = getOutputPath('nup_output.pdf');
    onProgress(35, `N-up layout ${cols}×${rows} (${sequence}) via QPDF...`);
    await nupLayout(selectedFile, outputPath, cols, rows, sequence);
    onProgress(100, 'Done!');
    return outputPath;
  };

  return (
    <ToolShell title="N-Up Layout" subtitle="Multiple pages per sheet" onExecute={handleAction} executeLabel={`🪟 Apply ${cols * rows}-Up Layout`}>
      <TouchableOpacity
        style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
        onPress={handlePickFile}
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

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={[styles.sectionLabel, { color: textColor }]}>🪟 Grid Layout</Text>
        <TouchableOpacity onPress={() => setIsCustom(!isCustom)}>
          <Text style={{ color: accent, fontWeight: '600', fontSize: 13 }}>
            {isCustom ? 'Use Standard' : 'Custom Grid'}
          </Text>
        </TouchableOpacity>
      </View>

      {!isCustom ? (
        <View style={styles.gridRow}>
          {STANDARD_LAYOUTS.map(l => (
            <TouchableOpacity
              key={l.id}
              style={[styles.presetCard, { backgroundColor: cardBg, borderColor: layout.id === l.id ? accent : isDark ? '#444' : '#ccc' }, layout.id === l.id && { backgroundColor: accent + '22' }]}
              onPress={() => setLayout(l)}
            >
              <Text style={{ color: layout.id === l.id ? accent : textColor, fontWeight: '700' }}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Columns</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: isDark ? '#444' : '#ccc' }]}
              value={customCols}
              onChangeText={setCustomCols}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Rows</Text>
            <TextInput
              style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: isDark ? '#444' : '#ccc' }]}
              value={customRows}
              onChangeText={setCustomRows}
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🔄 Sequence Order</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
        {SEQUENCES.map(seq => (
          <TouchableOpacity
            key={seq.id}
            style={[styles.seqCard, { backgroundColor: cardBg, borderColor: sequence === seq.id ? accent : isDark ? '#333' : '#ddd' }, sequence === seq.id && { backgroundColor: accent + '15' }]}
            onPress={() => setSequence(seq.id)}
          >
            <Text style={{ color: sequence === seq.id ? accent : textColor, fontWeight: '600' }}>{seq.label}</Text>
            <Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>{seq.desc}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.previewBox, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>👁 Preview ({cols}×{rows})</Text>
        <View style={[styles.previewGrid, { width: Math.min(200, cols * 40) }]}>
          {Array.from({ length: Math.min(cols * rows, 30) }).map((_, i) => (
            <View
              key={i}
              style={[styles.miniPage, { borderColor: isDark ? '#555' : '#ccc', width: `${100 / cols}%` as any, aspectRatio: 0.7 }]}
            >
              <Text style={{ color: muted, fontSize: 8 }}>{i + 1}</Text>
            </View>
          ))}
        </View>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  presetCard: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 2, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, textAlign: 'center' },
  seqCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginRight: 10, width: 140 },
  previewBox: { padding: 16, borderRadius: 14, alignItems: 'center' },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  miniPage: { borderWidth: 1, borderRadius: 2, justifyContent: 'center', alignItems: 'center', margin: 1 },
});
