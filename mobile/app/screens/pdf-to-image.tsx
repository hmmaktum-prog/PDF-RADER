import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import ToolShell from '../components/ToolShell';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { useAppTheme } from '../context/ThemeContext';
import { batchRenderPages } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import * as FileSystem from 'expo-file-system/legacy';

export default function PdfToImageScreen() {
  const { isDark } = useAppTheme();
  const [format, setFormat] = useState<'jpeg'|'png'>('jpeg');
  const [quality, setQuality] = useState(100);
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

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
    const outDir = getOutputPath(`images_output_${Date.now()}`);
    onProgress(10, 'Creating output directory...');
    await FileSystem.makeDirectoryAsync(outDir, { intermediates: true });

    onProgress(35, `Rendering pages as ${format.toUpperCase()}...`);
    await batchRenderPages(selectedFile, outDir, format, quality);
    onProgress(100, 'Done!');
    return outDir;
  };

  return (
    <ToolShell title="PDF to Image" subtitle="Extract pages to high-res images" onExecute={handleAction} executeLabel="📸 Extract Images">
      <TouchableOpacity
        style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
        onPress={handlePickFile}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
        <Text style={[styles.pickText, { color: textColor }]}>
          {selectedFileName || 'Select PDF File'}
        </Text>
        <Text style={{ color: muted, fontSize: 12 }}>Tap to browse</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📸 Output Format</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        {(['jpeg', 'png'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.formatCard, { backgroundColor: cardBg, borderColor: format === f ? accent : isDark ? '#444' : '#ccc' }, format === f && { backgroundColor: accent + '15' }]}
            onPress={() => setFormat(f)}
          >
            <Text style={{ fontSize: 24, marginBottom: 4 }}>{f === 'jpeg' ? '📷' : '🖼️'}</Text>
            <Text style={{ color: format === f ? accent : textColor, fontWeight: '700', textTransform: 'uppercase' }}>{f}</Text>
            <Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>{f === 'jpeg' ? 'Smaller size' : 'Lossless'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🔍 Output Quality</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[50, 70, 90, 100].map(q => (
          <TouchableOpacity
            key={q}
            style={[styles.scaleCard, { backgroundColor: quality === q ? accent : cardBg, borderColor: isDark ? '#444' : '#ccc' }]}
            onPress={() => setQuality(q)}
          >
            <Text style={{ color: quality === q ? '#fff' : textColor, fontWeight: '600' }}>{q}%</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 12, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  formatCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  scaleCard: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  outCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
});
