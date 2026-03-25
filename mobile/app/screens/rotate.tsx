import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { rotatePdf, renderPageToImage } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image, ActivityIndicator } from 'react-native';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';

const ANGLES = [
  { deg: 90 as const, label: '↻ 90°', hint: 'Clockwise' },
  { deg: 180 as const, label: '↔ 180°', hint: 'Upside Down' },
  { deg: 270 as const, label: '↺ 270°', hint: 'Counter-CW' },
];

export default function RotateScreen() {
  const { isDark } = useAppTheme();
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [rotateAll, setRotateAll] = useState(true);
  const [pageRange, setPageRange] = useState('1, 3, 5');
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handlePickFile = async () => {
    try {
      const picked = await pickSinglePdf();
      if (!picked) return;
      setSelectedFile(picked.path);
      setSelectedFileName(picked.name);
      setPreviewUri(null);
    } catch (e: any) {
      Alert.alert('File Picker Error', e.message);
    }
  };

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const borderColor = isDark ? '#444' : '#ccc';
  const accent = '#5AC8FA';
  const muted = isDark ? '#888' : '#999';

  const loadPreview = async () => {
    if (!selectedFile) return;
    try {
      setIsLoadingPreview(true);
      const outPath = `${FileSystem.cacheDirectory}preview_${Date.now()}.jpg`;
      await renderPageToImage(selectedFile, 0, outPath, false);
      setPreviewUri(outPath);
    } catch (e: any) {
      Alert.alert('Preview Error', e.message);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleRotate = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputPath = getOutputPath('rotated_output.pdf');
    onProgress(35, `Rotating pages ${angle}° via QPDF...`);
    await rotatePdf(selectedFile, outputPath, angle, rotateAll ? 'all' : pageRange);
    onProgress(100, 'Done!');
    return outputPath;
  };

  return (
    <ToolShell
      title="Rotate PDF"
      subtitle="Rotate all or specific pages"
      onExecute={handleRotate}
      executeLabel="🔄 Rotate Pages"
    >
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
        <Text style={[styles.hint, { color: muted }]}>{selectedFile ? 'Tap to change file' : 'Tap to browse'}</Text>
      </TouchableOpacity>

      <View style={[styles.previewBox, { backgroundColor: cardBg }]}>
        <Text style={[styles.sectionLabel, { color: textColor }]}>👁 Preview</Text>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          {selectedFile ? (
            previewUri ? (
              <Image 
                source={{ uri: previewUri }} 
                style={{ width: 140, height: 200, resizeMode: 'contain', transform: [{ rotate: `${angle}deg` }], borderWidth: 1, borderColor }} 
              />
            ) : isLoadingPreview ? (
              <ActivityIndicator size="large" color={accent} />
            ) : (
              <TouchableOpacity style={{ padding: 12, borderWidth: 1, borderColor: accent, borderRadius: 8 }} onPress={loadPreview}>
                <Text style={{ color: accent, fontWeight: '600' }}>Load Live Preview</Text>
              </TouchableOpacity>
            )
          ) : (
            <View style={[styles.pageMock, { borderColor, transform: [{ rotate: `${angle}deg` }] }]}>
              <Text style={{ color: muted, fontSize: 11 }}>Page</Text>
              <Text style={{ fontSize: 22 }}>📄</Text>
            </View>
          )}
          <Text style={[styles.hint, { color: muted, marginTop: 12 }]}>
            Page shown rotated {angle}° clockwise
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🔄 Rotation Angle</Text>
      <View style={styles.angleRow}>
        {ANGLES.map(a => (
          <TouchableOpacity
            key={a.deg}
            style={[
              styles.angleCard,
              { backgroundColor: cardBg, borderColor: angle === a.deg ? accent : borderColor },
              angle === a.deg && { backgroundColor: accent + '22' },
            ]}
            onPress={() => setAngle(a.deg)}
            testID={`button-angle-${a.deg}`}
          >
            <Text style={[styles.angleLabel, { color: angle === a.deg ? accent : textColor }]}>{a.label}</Text>
            <Text style={[styles.hint, { color: muted }]}>{a.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📋 Which Pages</Text>
      <TouchableOpacity
        style={[styles.toggleRow, { backgroundColor: cardBg }]}
        onPress={() => setRotateAll(!rotateAll)}
        testID="button-toggle-all-pages"
      >
        <View>
          <Text style={[styles.toggleLabel, { color: textColor }]}>Rotate All Pages</Text>
          <Text style={[styles.hint, { color: muted }]}>Apply rotation to every page</Text>
        </View>
        <View style={[styles.toggleOuter, { backgroundColor: rotateAll ? accent : isDark ? '#555' : '#ccc' }]}>
          <View style={[styles.toggleThumb, { marginLeft: rotateAll ? 22 : 2 }]} />
        </View>
      </TouchableOpacity>

      {!rotateAll && (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.inputLabel, { color: textColor }]}>Specific Pages</Text>
          <Text style={[styles.hint, { color: muted }]}>e.g. "1, 3-5, 8"</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
            value={pageRange}
            onChangeText={setPageRange}
            placeholder="1, 3-5, 8"
            placeholderTextColor={muted}
            testID="input-page-range"
          />
        </View>
      )}
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  previewBox: { borderRadius: 14, padding: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  pageMock: { width: 80, height: 100, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  angleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  angleCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  angleLabel: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleOuter: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
});
