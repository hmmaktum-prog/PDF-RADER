import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import ToolShell from '../components/ToolShell';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { useAppTheme } from '../context/ThemeContext';
import { splitPdf } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';

type SplitMode = 'range' | 'count' | 'every';

export default function SplitScreen() {
  const { isDark } = useAppTheme();
  const [mode, setMode] = useState<SplitMode>('range');
  const [rangeInput, setRangeInput] = useState('1-3, 4-6, 7-10');
  const [splitCount, setSplitCount] = useState('2');
  const [everyN, setEveryN] = useState('5');
  const [outputZip, setOutputZip] = useState(true);
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

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

  const MODES = [
    { id: 'range', label: '📐 By Range', hint: 'e.g. 1-3, 4-5' },
    { id: 'count', label: '🔢 Into Parts', hint: 'Split into N equal parts' },
    { id: 'every', label: '📄 Every N Pages', hint: 'Create file every N pages' },
  ] as const;

  const handleSplit = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputDir = getOutputPath('split_output');
    let ranges = rangeInput;
    if (mode === 'count') ranges = `split_count:${splitCount}`;
    else if (mode === 'every') ranges = `every_n:${everyN}`;
    onProgress(35, 'Splitting PDF via QPDF...');
    await splitPdf(selectedFile, outputDir, ranges);
    onProgress(100, 'Split complete!');
    return outputDir + (outputZip ? '/split_output.zip' : '');
  };

  return (
    <ToolShell
      title="Split PDF"
      subtitle="Divide a PDF into multiple files"
      onExecute={handleSplit}
      executeLabel="✂️ Split PDF"
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
        <Text style={[styles.pickHint, { color: muted }]}>
          {selectedFile ? 'Tap to change file' : 'Tap to browse'}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.label, { color: textColor }]}>✂️ Split Method</Text>
      {MODES.map(m => (
        <TouchableOpacity
          key={m.id}
          style={[
            styles.modeCard,
            { backgroundColor: cardBg, borderColor: mode === m.id ? accent : borderColor },
            mode === m.id && { borderColor: accent },
          ]}
          onPress={() => setMode(m.id)}
          activeOpacity={0.7}
          testID={`button-mode-${m.id}`}
        >
          <View style={styles.modeLeft}>
            <Text style={[styles.modeLabel, { color: mode === m.id ? accent : textColor }]}>{m.label}</Text>
            <Text style={[styles.modeHint, { color: muted }]}>{m.hint}</Text>
          </View>
          <View style={[styles.radio, { borderColor: mode === m.id ? accent : borderColor }]}>
            {mode === m.id && <View style={[styles.radioDot, { backgroundColor: accent }]} />}
          </View>
        </TouchableOpacity>
      ))}

      {mode === 'range' && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: textColor }]}>📄 Page Ranges</Text>
          <Text style={[styles.hint, { color: muted }]}>
            Comma-separated ranges. e.g. "1-3, 4-6, 7" creates 3 files.
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
            value={rangeInput}
            onChangeText={setRangeInput}
            placeholder="1-3, 4-6, 7"
            placeholderTextColor={muted}
            testID="input-range"
          />
        </View>
      )}
      {mode === 'count' && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: textColor }]}>🔢 Number of Parts</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
            value={splitCount}
            onChangeText={setSplitCount}
            keyboardType="number-pad"
            placeholder="2"
            placeholderTextColor={muted}
            testID="input-split-count"
          />
        </View>
      )}
      {mode === 'every' && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: textColor }]}>📑 Pages per File</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
            value={everyN}
            onChangeText={setEveryN}
            keyboardType="number-pad"
            placeholder="5"
            placeholderTextColor={muted}
            testID="input-every-n"
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.toggleRow, { backgroundColor: cardBg }]}
        onPress={() => setOutputZip(!outputZip)}
        testID="button-toggle-zip"
      >
        <View>
          <Text style={[styles.toggleLabel, { color: textColor }]}>📦 Output as ZIP</Text>
          <Text style={[styles.hint, { color: muted }]}>Bundle all split files into a single ZIP</Text>
        </View>
        <View style={[styles.toggleOuter, { backgroundColor: outputZip ? accent : isDark ? '#555' : '#ccc' }]}>
          <View style={[styles.toggleThumb, { marginLeft: outputZip ? 22 : 2 }]} />
        </View>
      </TouchableOpacity>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: {
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  pickHint: { fontSize: 12 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 8,
  },
  modeLeft: { flex: 1 },
  modeLabel: { fontSize: 15, fontWeight: '600' },
  modeHint: { fontSize: 12, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  inputGroup: { marginTop: 12, marginBottom: 8 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleOuter: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
});
