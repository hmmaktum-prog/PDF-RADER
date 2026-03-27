import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Switch } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { compressPdf } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

export default function CompressScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [level, setLevel] = useState('Balanced');
  const [expertMode, setExpertMode] = useState(false);
  const [imgQuality, setImgQuality] = useState('70');
  const [resScale, setResScale] = useState('100');
  const [grayscale, setGrayscale] = useState(false);

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const accent = '#007AFF';
  const borderColor = isDark ? '#444' : '#ccc';

  const muted = isDark ? '#888' : '#999';

  const PRESETS = [
    { id: 'Extreme', icon: '🗜️', desc: 'Minimal quality, tiny size', saving: '~80-95%' },
    { id: 'Strong', icon: '📦', desc: 'Lower quality photos', saving: '~60-80%' },
    { id: 'Balanced', icon: '⚖️', desc: 'Best compromise', saving: '~40-60%' },
    { id: 'Good', icon: '👍', desc: 'Slightly compressed', saving: '~20-40%' },
    { id: 'High', icon: '📸', desc: 'Original look retained', saving: '~10-20%' },
  ];

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

  const handleCompress = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputPath = getOutputPath('compressed_output.pdf');
    const q = parseInt(imgQuality) || 70;
    const s = parseInt(resScale) || 100;
    onProgress(25, `Compressing (Grayscale: ${grayscale})...`);
    await compressPdf(selectedFile, outputPath, expertMode ? 'custom' : level, q, s, grayscale);
    onProgress(100, 'Compression complete!');
    return outputPath;
  };

  return (
    <ToolShell title="Compress PDF" subtitle="Reduce file size with QPDF" onExecute={handleCompress} executeLabel="📦 Compress PDF">
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

      <View style={[styles.sectionHeader, { marginBottom: 10 }]}>
        <Text style={[styles.label, { color: textColor }]}>🗜️ Compression Level</Text>
        <TouchableOpacity onPress={() => setExpertMode(!expertMode)}>
          <Text style={{ color: accent, fontSize: 12, fontWeight: '600' }}>
            {expertMode ? 'Use Presets' : 'Expert Settings'}
          </Text>
        </TouchableOpacity>
      </View>

      {!expertMode ? (
        PRESETS.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.optionCard, {
              backgroundColor: level === p.id ? accent + '15' : cardBg,
              borderColor: level === p.id ? accent : isDark ? '#333' : '#ddd',
            }]}
            onPress={() => setLevel(p.id)}
          >
            <Text style={{ fontSize: 28 }}>{p.icon}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.optionTitle, { color: level === p.id ? accent : textColor }]}>{p.id}</Text>
              <Text style={{ color: muted, fontSize: 12 }}>{p.desc}</Text>
              <Text style={{ color: level === p.id ? accent : muted, fontSize: 11, marginTop: 2, fontWeight: '600' }}>{p.saving} smaller</Text>
            </View>
            {level === p.id && <Text style={{ color: accent, fontSize: 20 }}>✓</Text>}
          </TouchableOpacity>
        ))
      ) : (
        <View style={[styles.expertBox, { backgroundColor: cardBg, borderColor }]}>
          <Text style={{ color: textColor, fontWeight: 'bold', marginBottom: 12 }}>🛠 Expert Image Resampling</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Image Quality (1-100)</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]} value={imgQuality} onChangeText={setImgQuality} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Res Scale (10-200%)</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]} value={resScale} onChangeText={setResScale} keyboardType="number-pad" />
            </View>
          </View>
          <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>
            Directly sets JPEG compression parameters. Lower values reduce filesize dramatically but induce artifacts.
          </Text>
        </View>
      )}

      <TouchableOpacity style={[styles.toggleRow, { backgroundColor: cardBg }]} onPress={() => setGrayscale(!grayscale)}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: textColor, fontSize: 14, fontWeight: '600' }}>Grayscale (B&W)</Text>
          <Text style={{ color: muted, fontSize: 12, marginTop: 2 }}>
            Convert all colors to shades of gray to save extreme file size.
          </Text>
        </View>
        <Switch value={grayscale} onValueChange={setGrayscale} trackColor={{ false: '#555', true: accent }} />
      </TouchableOpacity>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 20, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#007AFF', borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 16, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
  optionCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  optionTitle: { fontSize: 15, fontWeight: '600' },
  expertBox: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 15, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginTop: 8 },
});
