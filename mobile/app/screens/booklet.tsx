import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { createBooklet } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';

const BINDING_TYPES = [
  { id: 'saddle', label: 'Saddle-Stitch', emoji: '📚', desc: 'Pages folded & stapled (multiple of 4)' },
  { id: 'perfect', label: 'Perfect Bind', emoji: '📖', desc: 'Flat spine, glue-bound (multiple of 2)' },
];

export default function BookletScreen() {
  const { isDark } = useAppTheme();
  const [binding, setBinding] = useState('saddle');
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [autoPadding, setAutoPadding] = useState(true);

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
    const outputPath = getOutputPath('booklet_output.pdf');
    onProgress(35, `Creating booklet via QPDF (Auto Pad: ${autoPadding})...`);
    await createBooklet(selectedFile, outputPath, binding, autoPadding);
    onProgress(100, 'Done!');
    return outputPath;
  };

  return (
    <ToolShell title="Booklet Print" subtitle="Rearrange pages for booklet printing" onExecute={handleAction} executeLabel="📚 Create Booklet">
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

      {!selectedFile && (
        <View style={[styles.emptyHint, { backgroundColor: cardBg }]}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>📚</Text>
          <Text style={{ color: textColor, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>No file selected</Text>
          <Text style={{ color: muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            Select a PDF to rearrange its pages for booklet printing
          </Text>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📎 Binding Style</Text>
      {BINDING_TYPES.map(b => (
        <TouchableOpacity
          key={b.id}
          style={[styles.bindCard, { backgroundColor: cardBg, borderColor: binding === b.id ? accent : isDark ? '#333' : '#ddd' }, binding === b.id && { backgroundColor: accent + '15' }]}
          onPress={() => setBinding(b.id)}
        >
          <Text style={{ fontSize: 28, marginRight: 14 }}>{b.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: binding === b.id ? accent : textColor, fontWeight: '600' }}>{b.label}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>{b.desc}</Text>
          </View>
          {binding === b.id && <Text style={{ color: accent, fontSize: 18 }}>✓</Text>}
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={[styles.toggleRow, { backgroundColor: cardBg }]} onPress={() => setAutoPadding(!autoPadding)}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: textColor, fontSize: 14, fontWeight: '600' }}>Auto Padding</Text>
          <Text style={{ color: muted, fontSize: 12, marginTop: 2, paddingRight: 10 }}>
            Automatically append blank pages to make the total page count a multiple of 4 (for saddle-stitch).
          </Text>
        </View>
        <Switch value={autoPadding} onValueChange={setAutoPadding} trackColor={{ false: '#555', true: accent }} />
      </TouchableOpacity>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  emptyHint: { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  bindCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginTop: 8 },
});
