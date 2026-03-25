import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { whiteningPdf, geminiAiWhitening } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';

const LEVELS = [
  { val: 1, label: 'Light', desc: 'Subtle, preserves original tone' },
  { val: 2, label: 'Medium', desc: 'Best balance (recommended)' },
  { val: 3, label: 'Strong', desc: 'Pure white background' },
];

export default function WhitenerScreen() {
  const { isDark } = useAppTheme();
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [strength, setStrength] = useState(2);
  const [useAI, setUseAI] = useState(false);

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#007AFF';
  const muted = isDark ? '#888' : '#888';

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
    const outputPath = getOutputPath('whitened_output.pdf');

    if (useAI) {
      onProgress(30, 'AI whitening via native bridge...');
      await geminiAiWhitening(selectedFile, outputPath);
    } else {
      onProgress(35, 'Whitening background via MuPDF...');
      await whiteningPdf(selectedFile, outputPath, strength);
    }
    onProgress(100, 'Done!');
    return outputPath;
  };

  return (
    <ToolShell title="Whitener" subtitle="Remove yellow tint from scanned books" onExecute={handleAction} executeLabel="🧹 Whiten Background">
      <TouchableOpacity
        style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
        onPress={handlePickFile}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
        <Text style={[styles.pickText, { color: textColor }]}>
          {selectedFileName || 'Select Scanned PDF'}
        </Text>
        <Text style={{ color: muted, fontSize: 12 }}>Tap to browse</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🧠 Processing Mode</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: cardBg, borderColor: !useAI ? accent : isDark ? '#333' : '#ddd' }, !useAI && { backgroundColor: accent + '15' }]}
          onPress={() => setUseAI(false)}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>⚙️</Text>
          <Text style={{ color: !useAI ? accent : textColor, fontWeight: '600' }}>Standard</Text>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center', marginTop: 2 }}>Fast algorithmic fix for normal scans</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: cardBg, borderColor: useAI ? '#8E44AD' : isDark ? '#333' : '#ddd' }, useAI && { backgroundColor: '#8E44AD22' }]}
          onPress={() => setUseAI(true)}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>✨</Text>
          <Text style={{ color: useAI ? '#8E44AD' : textColor, fontWeight: '600' }}>Gemini AI</Text>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center', marginTop: 2 }}>Removes shadows & stains accurately</Text>
        </TouchableOpacity>
      </View>

      {!useAI && (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>⚡ Whitening Strength</Text>
          {LEVELS.map(l => (
            <TouchableOpacity
              key={l.val}
              style={[
                styles.levelCard,
                { backgroundColor: cardBg, borderColor: strength === l.val ? accent : isDark ? '#333' : '#ddd' },
                strength === l.val && { backgroundColor: accent + '15' },
              ]}
              onPress={() => setStrength(l.val)}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: strength === l.val ? accent : textColor, fontWeight: '600' }}>{l.label}</Text>
                <Text style={{ color: muted, fontSize: 12 }}>{l.desc}</Text>
              </View>
              {strength === l.val && <Text style={{ color: accent, fontSize: 18 }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={[styles.previewRow, { backgroundColor: cardBg }]}>
        <View style={[styles.previewBox, { backgroundColor: '#f5e8c0' }]}>
          <Text style={{ color: '#5a4200', fontSize: 13, fontWeight: '600' }}>📜 Before</Text>
        </View>
        <Text style={{ fontSize: 20, color: accent }}>→</Text>
        <View style={[styles.previewBox, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ddd' }]}>
          <Text style={{ color: '#000', fontSize: 13, fontWeight: '600' }}>✨ After</Text>
        </View>
      </View>

    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  modeCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  levelCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: 16, borderRadius: 14, marginTop: 12 },
  previewBox: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 8, height: 60, justifyContent: 'center' },
});
