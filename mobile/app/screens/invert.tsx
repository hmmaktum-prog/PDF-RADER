import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { invertColorsPdf } from '../utils/nativeModules';
import { usePreselectedFile } from '../hooks/usePreselectedFile';
import { NativeEventEmitter, NativeModules } from 'react-native';

export default function InvertScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

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

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#666';

  const handleAction = async (onProgress: (pct: number, label?: string) => void): Promise<string> => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputPath = getOutputPath('inverted_output.pdf');
    
    const eventEmitter = new NativeEventEmitter(NativeModules.MuPDFBridge);
    const subscription = eventEmitter.addListener('MuPDFProgress', (event: { current: number; total: number }) => {
      const pct = Math.round((event.current / event.total) * 100);
      onProgress(pct, `Inverting page ${event.current}/${event.total}...`);
    });

    try {
      onProgress(0, 'Initializing inversion...');
      await invertColorsPdf(selectedFile, outputPath);
      onProgress(100, 'Done!');
      return outputPath;
    } finally {
      subscription.remove();
    }
  };

  return (
    <ToolShell title="Invert Colors" subtitle="Create dark-mode PDF" onExecute={handleAction} executeLabel="🌗 Invert Colors">
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

      <View style={[styles.previewRow, { backgroundColor: cardBg }]}>
        <View style={[styles.previewBox, { backgroundColor: '#ffffff' }]}>
          <Text style={{ color: '#000', fontSize: 13, fontWeight: '600' }}>☀️ Before</Text>
          <Text style={{ color: '#000', fontSize: 11, marginTop: 4 }}>White bg / Black text</Text>
        </View>
        <Text style={{ fontSize: 20, color: accent }}>→</Text>
        <View style={[styles.previewBox, { backgroundColor: '#000000' }]}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>🌙 After</Text>
          <Text style={{ color: '#fff', fontSize: 11, marginTop: 4 }}>Black bg / White text</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text style={{ color: textColor, fontSize: 14, lineHeight: 22, marginBottom: 14 }}>
          Converts white backgrounds to black, creating a dark-mode PDF.
          Reduces eye strain when reading at night.
        </Text>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 16, borderRadius: 14, marginBottom: 14 },
  previewBox: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 8 },
  card: { padding: 20, borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
