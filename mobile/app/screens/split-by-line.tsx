import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import ToolShell from '../components/ToolShell';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { useAppTheme } from '../context/ThemeContext';
import { splitPdf } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

export default function SplitByLineScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [scope, setScope] = useState<'all' | 'individual'>('all');
  const [ratio, setRatio] = useState('50');

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const borderColor = isDark ? '#444' : '#ccc';
  const accent = '#FF9500';
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
    const outputDir = getOutputPath('visual_split');
    const rangeStr = `visual_split:${axis}:${scope}:${ratio}`;
    onProgress(40, `Splitting (${ratio}% ${axis}) via QPDF...`);
    await splitPdf(selectedFile, outputDir, rangeStr);
    onProgress(100, 'Done!');
    return outputDir;
  };

  return (
    <ToolShell title="Visual Split" subtitle="Cut pages in half perfectly" onExecute={handleAction} executeLabel="✂️ Visual Split">
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

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📏 Cut Axis</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: cardBg, borderColor: axis === 'vertical' ? accent : isDark ? '#333' : '#ddd' }, axis === 'vertical' && { backgroundColor: accent + '15' }]}
          onPress={() => setAxis('vertical')}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>| |</Text>
          <Text style={{ color: axis === 'vertical' ? accent : textColor, fontWeight: '600' }}>Vertical</Text>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center' }}>Book spreads</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: cardBg, borderColor: axis === 'horizontal' ? accent : isDark ? '#333' : '#ddd' }, axis === 'horizontal' && { backgroundColor: accent + '15' }]}
          onPress={() => setAxis('horizontal')}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>=</Text>
          <Text style={{ color: axis === 'horizontal' ? accent : textColor, fontWeight: '600' }}>Horizontal</Text>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center' }}>Tall receipts</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🎯 Split Position Ratio (%)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor, flex: 1, marginRight: 12 }]}
          value={ratio}
          onChangeText={setRatio}
          keyboardType="number-pad"
          placeholder="50"
          placeholderTextColor={muted}
        />
        <Text style={{ color: muted, fontSize: 14, flex: 1 }}>
          50% cuts exactly in the middle. Adjust if the scan is off-center.
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🌐 Scope of Split</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.scopeCard, { backgroundColor: cardBg, borderColor: scope === 'all' ? accent : isDark ? '#333' : '#ddd' }, scope === 'all' && { backgroundColor: accent + '15' }]}
          onPress={() => setScope('all')}
        >
          <Text style={{ color: scope === 'all' ? accent : textColor, fontWeight: '600' }}>Apply to All</Text>
          <Text style={{ color: muted, fontSize: 11 }}>Same ratio for all pages</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scopeCard, { backgroundColor: cardBg, borderColor: scope === 'individual' ? accent : isDark ? '#333' : '#ddd' }, scope === 'individual' && { backgroundColor: accent + '15' }]}
          onPress={() => setScope('individual')}
        >
          <Text style={{ color: scope === 'individual' ? accent : textColor, fontWeight: '600' }}>Individual</Text>
          <Text style={{ color: muted, fontSize: 11 }}>Analyze per page</Text>
        </TouchableOpacity>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16, marginTop: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  modeCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  scopeCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, textAlign: 'center' },
});
