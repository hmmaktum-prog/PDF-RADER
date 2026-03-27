import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Switch } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { repairPdf } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

const REPAIR_FEATURES = [
  { icon: '🔧', label: 'Fix cross-reference table', desc: 'Rebuilt with QPDF linearization' },
  { icon: '📦', label: 'Reconstruct object streams', desc: 'Recovers corrupted object data' },
  { icon: '🔓', label: 'Remove Encryption/Password', desc: 'Unlocks file if password is provided' },
  { icon: '🗜️', label: 'Re-encode content streams', desc: 'Normalize malformed streams' },
];

export default function RepairScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [password, setPassword] = useState('');
  const [isEncrypted, setIsEncrypted] = useState(false);

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const accent = '#FF9500';
  const muted = isDark ? '#888' : '#666';

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
    const outputPath = getOutputPath('repaired_output.pdf');
    
    if (isEncrypted && password) {
      onProgress(15, 'Repairing / unlocking with QPDF...');
    } else {
      onProgress(15, 'Repairing with QPDF recovery...');
    }
    await repairPdf(selectedFile, outputPath, isEncrypted ? password : '');
    onProgress(100, isEncrypted && password ? 'File Unlocked & Repaired!' : 'Repair complete!');
    return outputPath;
  };

  return (
    <ToolShell title="Repair & Unlock" subtitle="Fix corrupted or locked PDF files" onExecute={handleAction} executeLabel="🔧 Repair PDF">
      <TouchableOpacity
        style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
        onPress={handlePickFile}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
        <Text style={[styles.pickText, { color: textColor }]}>
          {selectedFileName || 'Select Corrupted PDF'}
        </Text>
        <Text style={{ color: muted, fontSize: 12 }}>Tap to browse</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.unlockBox, { backgroundColor: isEncrypted ? accent + '22' : cardBg, borderColor: isEncrypted ? accent : 'transparent', borderWidth: 1 }]} onPress={() => setIsEncrypted(!isEncrypted)}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 14 }}>🔒 File is Encrypted / Locked</Text>
          <Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
            Enable this to input the correct password to unlock and permanently remove the password from the repaired file.
          </Text>
        </View>
        <Switch value={isEncrypted} onValueChange={setIsEncrypted} trackColor={{ false: '#555', true: accent }} />
      </TouchableOpacity>

      {isEncrypted && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: textColor, fontWeight: '600', marginBottom: 6 }}>Known Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor: isDark ? '#444' : '#ccc' }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password..."
            placeholderTextColor={muted}
            secureTextEntry
          />
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10, marginTop: 4 }]}>🔧 What gets repaired</Text>
      {REPAIR_FEATURES.map((f, i) => (
        <View key={i} style={[styles.featureRow, { backgroundColor: cardBg }]}>
          <Text style={{ fontSize: 22, marginRight: 12 }}>{f.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: textColor, fontWeight: '600', fontSize: 14 }}>{f.label}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>{f.desc}</Text>
          </View>
          <Text style={{ color: accent, fontWeight: 'bold' }}>✓</Text>
        </View>
      ))}

      <View style={[styles.warningBox, { backgroundColor: isDark ? '#2a1a00' : '#fff3e0' }]}>
        <Text style={{ fontSize: 20, marginRight: 8 }}>⚠️</Text>
        <Text style={{ color: isDark ? '#FFB74D' : '#E65100', fontSize: 12, flex: 1, lineHeight: 18 }}>
          QPDF will attempt to rebuild all damaged structures. Severe corruption missing key byte streams cannot be recovered.
        </Text>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  unlockBox: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  featureRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 8 },
  warningBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 10 },
});
