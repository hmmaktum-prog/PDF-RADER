import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { resizePdf } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

const PAGE_SIZES = [
  { id: 'A4', label: 'A4', w: 595, h: 842, desc: '210×297 mm' },
  { id: 'A3', label: 'A3', w: 842, h: 1191, desc: '297×420 mm' },
  { id: 'Letter', label: 'Letter', w: 612, h: 792, desc: '8.5×11 in' },
  { id: 'Legal', label: 'Legal', w: 612, h: 1008, desc: '8.5×14 in' },
  { id: 'Custom', label: 'Custom', w: 0, h: 0, desc: 'Enter dimensions' },
];

export default function ResizeScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [targetSize, setTargetSize] = useState(PAGE_SIZES[0]);
  const [customW, setCustomW] = useState('595');
  const [customH, setCustomH] = useState('842');
  const [scale, setScale] = useState('100');
  const [alignH, setAlignH] = useState<'left' | 'center' | 'right'>('center');
  const [alignV, setAlignV] = useState<'top' | 'middle' | 'bottom'>('middle');

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const borderColor = isDark ? '#444' : '#ccc';
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
    const outputPath = getOutputPath('resized_output.pdf');
    const w = targetSize.id === 'Custom' ? parseInt(customW) : targetSize.w;
    const h = targetSize.id === 'Custom' ? parseInt(customH) : targetSize.h;
    onProgress(35, `Resizing pages via QPDF (Scale: ${scale}%, Align: ${alignH}/${alignV})...`);
    await resizePdf(selectedFile, outputPath, w, h, parseInt(scale), alignH, alignV);
    onProgress(100, 'Done!');
    return outputPath;
  };

  const ALIGNMENT_H = [
    { id: 'left', icon: '⇤' },
    { id: 'center', icon: '⇹' },
    { id: 'right', icon: '⇥' },
  ] as const;

  const ALIGNMENT_V = [
    { id: 'top', icon: '⇡' },
    { id: 'middle', icon: '↕' },
    { id: 'bottom', icon: '⇣' },
  ] as const;

  return (
    <ToolShell title="Resize Pages" subtitle="Change page dimensions and scale" onExecute={handleAction} executeLabel="📐 Resize Pages">
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

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📐 Target Page Size</Text>
      <View style={styles.sizeGrid}>
        {PAGE_SIZES.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.sizeCard, { backgroundColor: cardBg, borderColor: targetSize.id === s.id ? accent : isDark ? '#444' : '#ccc' }, targetSize.id === s.id && { backgroundColor: accent + '22' }]}
            onPress={() => setTargetSize(s)}
          >
            <Text style={{ color: targetSize.id === s.id ? accent : textColor, fontWeight: '700' }}>{s.label}</Text>
            <Text style={{ color: muted, fontSize: 11, marginTop: 2 }}>{s.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {targetSize.id === 'Custom' && (
        <View style={[styles.customBox, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10, fontSize: 14 }]}>Custom Dimensions (pts)</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Width</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]} value={customW} onChangeText={setCustomW} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: muted, fontSize: 12, marginBottom: 4 }}>Height</Text>
              <TextInput style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]} value={customH} onChangeText={setCustomH} keyboardType="number-pad" />
            </View>
          </View>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10, marginTop: 12 }]}>🔍 Content Scale (%)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor, flex: 1, marginRight: 12 }]}
          value={scale}
          onChangeText={setScale}
          keyboardType="number-pad"
          placeholder="100"
          placeholderTextColor={muted}
        />
        <Text style={{ color: muted, fontSize: 12, flex: 1 }}>
          10–200%. 100% preserves original size on the new canvas.
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📏 Content Alignment</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: muted, fontSize: 12, marginBottom: 6 }}>Horizontal</Text>
          <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor, overflow: 'hidden' }}>
            {ALIGNMENT_H.map(a => (
              <TouchableOpacity
                key={a.id}
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: alignH === a.id ? accent : cardBg }}
                onPress={() => setAlignH(a.id)}
              >
                <Text style={{ color: alignH === a.id ? '#fff' : textColor, fontSize: 16 }}>{a.icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: muted, fontSize: 12, marginBottom: 6 }}>Vertical</Text>
          <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor, overflow: 'hidden' }}>
            {ALIGNMENT_V.map(a => (
              <TouchableOpacity
                key={a.id}
                style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: alignV === a.id ? accent : cardBg }}
                onPress={() => setAlignV(a.id)}
              >
                <Text style={{ color: alignV === a.id ? '#fff' : textColor, fontSize: 16 }}>{a.icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 20, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  sizeCard: { width: '47%', padding: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  customBox: { padding: 16, borderRadius: 14, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, textAlign: 'center' },
});
