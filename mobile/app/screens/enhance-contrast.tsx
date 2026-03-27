import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { enhanceContrastPdf } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

export default function EnhanceContrastScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [level, setLevel] = useState(3);

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#777';

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
    const outputPath = getOutputPath('contrast_enhanced.pdf');
    onProgress(30, 'Enhancing contrast via MuPDF...');
    await enhanceContrastPdf(selectedFile, outputPath, level);
    onProgress(100, 'Done!');
    return outputPath;
  };

  return (
    <ToolShell title="Enhance Contrast" subtitle="Fix faded or unclear scans" onExecute={handleAction} executeLabel="🔲 Enhance Contrast">
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

      <View style={[styles.previewBox, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 8 }]}>👁 Preview</Text>
        <View style={[styles.previewMock, { backgroundColor: isDark ? '#222' : '#fff' }]}>
          <Text style={{ color: 'rgba(' + (isDark ? '255,255,255' : '0,0,0') + ',' + (0.2 + (level * 0.16)) + ')', fontSize: 16, fontWeight: 'bold' }}>
            Sample faded text (Level {level})
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🔲 Contrast Level (1–5)</Text>
      <View style={[styles.levelRow, { backgroundColor: cardBg }]}>
        {[1, 2, 3, 4, 5].map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.levelBtn, { borderColor: level >= v ? accent : isDark ? '#444' : '#ccc' }, level === v && { backgroundColor: accent + '33' }]}
            onPress={() => setLevel(v)}
          >
            <View style={[styles.levelFill, { backgroundColor: level >= v ? accent : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ color: muted, fontSize: 12 }}>Light</Text>
        <Text style={{ color: muted, fontSize: 12 }}>Level {level}</Text>
        <Text style={{ color: muted, fontSize: 12 }}>Dark</Text>
      </View>

      <View style={[styles.tipCard, { backgroundColor: cardBg }]}>
        <Text style={{ fontSize: 20, marginBottom: 6 }}>💡</Text>
        <Text style={{ color: textColor, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>When to use</Text>
        <Text style={{ color: muted, fontSize: 13, lineHeight: 20 }}>
          Best for faded photocopies, old scanned notes, handwritten documents. MuPDF renders each page then applies contrast enhancement.
        </Text>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  previewBox: { padding: 16, borderRadius: 14, marginBottom: 16 },
  previewMock: { padding: 24, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center', height: 90 },
  levelRow: { flexDirection: 'row', gap: 8, padding: 14, borderRadius: 12, marginBottom: 8 },
  levelBtn: { flex: 1, height: 26, borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  levelFill: { flex: 1 },
  tipCard: { padding: 16, borderRadius: 14, alignItems: 'flex-start' },
});
