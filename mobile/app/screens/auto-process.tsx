import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { pickSinglePdf } from '../utils/filePicker';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { whiteningPdf, enhanceContrastPdf, grayscalePdf, compressPdf } from '../utils/nativeModules';

const DEFAULT_STEPS = [
  { id: 'whiten', icon: '🧹', label: 'Whiten Background', desc: 'Remove yellow tint (MuPDF)' },
  { id: 'contrast', icon: '🔲', label: 'Enhance Contrast', desc: 'Darken faded text (MuPDF)' },
  { id: 'grayscale', icon: '🖤', label: 'Convert to Grayscale', desc: 'Remove color, reduce size' },
  { id: 'compress', icon: '📦', label: 'Compress PDF', desc: 'Optimize streams (QPDF)' },
];

export default function AutoProcessScreen() {
  const { isDark } = useAppTheme();
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  
  const [steps, setSteps] = useState(DEFAULT_STEPS);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ whiten: true, contrast: true, grayscale: false, compress: true });

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#5856D6';
  const muted = isDark ? '#888' : '#999';

  useEffect(() => {
    loadPreset();
  }, []);

  const loadPreset = async () => {
    try {
      const savedSteps = await AsyncStorage.getItem('auto_process_steps');
      const savedEnabled = await AsyncStorage.getItem('auto_process_enabled');
      if (savedSteps) setSteps(JSON.parse(savedSteps));
      if (savedEnabled) setEnabled(JSON.parse(savedEnabled));
    } catch (e) {
      console.warn('Failed to load preset', e);
    }
  };

  const savePreset = async () => {
    try {
      await AsyncStorage.setItem('auto_process_steps', JSON.stringify(steps));
      await AsyncStorage.setItem('auto_process_enabled', JSON.stringify(enabled));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Pipeline preset saved to local storage.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save preset.');
    }
  };

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

  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnabled(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAction = async (onProgress: (pct: number, label?: string) => void) => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    await ensureOutputDir();
    const outputPath = getOutputPath('auto_processed.pdf');
    const activeSteps = steps.filter(s => enabled[s.id]);
    if (activeSteps.length === 0) throw new Error('অন্তত ১টি ধাপ সক্রিয় রাখুন');
    
    let tempInput = selectedFile;
    let tempOutput = '';
    const tempFiles: string[] = [];

    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i];
      const pct = Math.round(((i + 0.5) / activeSteps.length) * 85);
      onProgress(pct, step.label + '...');
      
      tempOutput = getOutputPath(`auto_${step.id}_${Date.now()}.pdf`);
      
      if (step.id === 'whiten') {
         await whiteningPdf(tempInput, tempOutput, 2);
      } else if (step.id === 'contrast') {
         await enhanceContrastPdf(tempInput, tempOutput, 3);
      } else if (step.id === 'grayscale') {
         await grayscalePdf(tempInput, tempOutput);
      } else if (step.id === 'compress') {
         await compressPdf(tempInput, tempOutput, 'Balanced', 70, 100, false);
      }
      if (tempInput !== selectedFile) {
        tempFiles.push(tempInput);
      }
      tempInput = tempOutput;
    }
    
    onProgress(95, 'Finalizing output...');
    await FileSystem.copyAsync({ from: tempInput, to: outputPath });
    
    // Cleanup intermediate temp files
    for (const tmp of tempFiles) {
      try { await FileSystem.deleteAsync(tmp, { idempotent: true }); } catch (_) {}
    }
    // Also clean the last intermediate (which was copied to outputPath)
    if (tempInput !== selectedFile) {
      try { await FileSystem.deleteAsync(tempInput, { idempotent: true }); } catch (_) {}
    }
    
    onProgress(100, 'Pipeline complete!');
    return outputPath;
  };

  const activeCount = Object.values(enabled).filter(Boolean).length;

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<typeof DEFAULT_STEPS[0]>) => {
    const index = getIndex() || 0;
    return (
      <ScaleDecorator>
        <View style={[styles.stepCard, { backgroundColor: isActive ? (isDark ? '#333' : '#dcdcdc') : cardBg, borderColor: enabled[item.id] ? accent : 'transparent', elevation: isActive ? 5 : 0 }]}>
          <TouchableOpacity onLongPress={drag} style={styles.dragHandle}><Text style={{ color: muted, fontSize: 18 }}>☰</Text></TouchableOpacity>
          <View style={[styles.stepIndex, { backgroundColor: enabled[item.id] ? accent : isDark ? '#444' : '#ccc' }]}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{index + 1}</Text>
          </View>
          <Text style={{ fontSize: 22, marginHorizontal: 8 }}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: enabled[item.id] ? textColor : muted, fontWeight: '600', fontSize: 14 }}>{item.label}</Text>
            <Text style={{ color: muted, fontSize: 11 }}>{item.desc}</Text>
          </View>
          <Switch value={enabled[item.id]} onValueChange={() => toggle(item.id)} trackColor={{ false: '#555', true: accent }} />
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToolShell title="Auto Process" subtitle="Run multiple tools in sequence" onExecute={handleAction} executeLabel="⚡ Run Pipeline" disableScroll={true}>
        <View style={{ paddingHorizontal: 16 }}>
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

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
            <View>
              <Text style={[styles.sectionLabel, { color: textColor }]}>⚡ Pipeline Chain</Text>
              <Text style={{ color: muted, fontSize: 11, marginTop: 4 }}>Drag ☰ to reorder steps.</Text>
            </View>
            <TouchableOpacity onPress={savePreset} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: isDark ? '#333' : '#ddd', borderRadius: 8 }}>
              <Text style={{ color: textColor, fontWeight: '600', fontSize: 12 }}>💾 Save Preset</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flex: 1, marginTop: 4 }}>
          <DraggableFlatList
            data={steps}
            onDragEnd={({ data }) => { setSteps(data); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          />
        </View>
      </ToolShell>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 20, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16, marginTop: 12 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  stepCard: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  stepIndex: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  dragHandle: { padding: 4, paddingLeft: 0 },
});
