import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Image, PanResponder, Animated, Dimensions } from 'react-native';
import ToolShell from '../components/ToolShell';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { useAppTheme } from '../context/ThemeContext';
import { splitPdf, renderPageToImage } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PREVIEW_WIDTH = SCREEN_WIDTH - 40;
const PREVIEW_HEIGHT = PREVIEW_WIDTH * 1.414; // A4 format ~ 1:1.414

export default function SplitByLineScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [axis, setAxis] = useState<'vertical' | 'horizontal'>('vertical');
  const [scope, setScope] = useState<'all' | 'individual'>('all');
  const [ratio, setRatio] = useState('50');

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const inputBg = isDark ? '#2a2a2a' : '#fff';
  const borderColor = isDark ? '#444' : '#ccc';
  const accent = '#FF9500';
  const muted = isDark ? '#888' : '#999';

  const panY = useRef(new Animated.Value(PREVIEW_HEIGHT * 0.5)).current;
  const panX = useRef(new Animated.Value(PREVIEW_WIDTH * 0.5)).current;
  const lastPos = useRef({ x: PREVIEW_WIDTH * 0.5, y: PREVIEW_HEIGHT * 0.5 }).current;

  // Track animated values silently
  useEffect(() => {
    panX.addListener((v) => { lastPos.x = v.value; });
    panY.addListener((v) => { lastPos.y = v.value; });
    return () => { panX.removeAllListeners(); panY.removeAllListeners(); };
  }, [panX, panY, lastPos]);

  // Load preview image when a file is selected
  useEffect(() => {
    if (!selectedFile) {
      setPreviewImage(null);
      return;
    }
    const loadPreview = async () => {
      try {
        await ensureOutputDir();
        const outputPath = getOutputPath(`preview_${Date.now()}.png`);
        const success = await renderPageToImage(selectedFile, 0, outputPath, true);
        if (success) setPreviewImage(`file://${outputPath}`);
      } catch (e) {
        console.warn('Preview render failed:', e);
      }
    };
    loadPreview();
  }, [selectedFile]);

  // Sync state ratio -> animated visual line value (if user types manually)
  useEffect(() => {
    const val = parseInt(ratio, 10);
    if (!isNaN(val) && val >= 1 && val <= 99) {
      if (axis === 'vertical' && Math.abs((val / 100) * PREVIEW_WIDTH - lastPos.x) > 2) {
        Animated.spring(panX, { toValue: (val / 100) * PREVIEW_WIDTH, useNativeDriver: false }).start();
      } else if (axis === 'horizontal' && Math.abs((val / 100) * PREVIEW_HEIGHT - lastPos.y) > 2) {
        Animated.spring(panY, { toValue: (val / 100) * PREVIEW_HEIGHT, useNativeDriver: false }).start();
      }
    }
  }, [ratio, axis, panX, panY, lastPos]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panX.setOffset(lastPos.x);
        panY.setOffset(lastPos.y);
        panX.setValue(0);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        if (axis === 'vertical') {
          panX.setValue(gestureState.dx);
        } else {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        panX.flattenOffset();
        panY.flattenOffset();
        // Constrain to container boundaries
        let safeX = Math.max(0, Math.min(PREVIEW_WIDTH, lastPos.x));
        let safeY = Math.max(0, Math.min(PREVIEW_HEIGHT, lastPos.y));
        panX.setValue(safeX);
        panY.setValue(safeY);
        
        const pct = axis === 'vertical'
          ? Math.round((safeX / PREVIEW_WIDTH) * 100)
          : Math.round((safeY / PREVIEW_HEIGHT) * 100);
        setRatio(String(Math.max(1, Math.min(99, pct))));
      }
    })
  ).current;

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

    const ratioNum = parseInt(ratio, 10);
    if (isNaN(ratioNum) || ratioNum < 1 || ratioNum > 99) {
      throw new Error('Split ratio must be a number between 1 and 99.');
    }

    await ensureOutputDir();
    const outputDir = getOutputPath('visual_split');
    const rangeStr = `visual_split:${axis}:${scope}:${ratioNum}`;
    onProgress(40, `Visual splitting at ${ratioNum}% via QPDF...`);
    await splitPdf(selectedFile, outputDir, rangeStr);

    const resultPdf = `${outputDir}/visual_split_output.pdf`;
    onProgress(100, 'Done!');
    return resultPdf;
  };

  return (
    <ToolShell title="Visual Split" subtitle="Cut pages in half perfectly" onExecute={handleAction} executeLabel="✂️ Visual Split">
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

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📏 Cut Axis</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: cardBg, borderColor: axis === 'vertical' ? accent : isDark ? '#333' : '#ddd' }, axis === 'vertical' && { backgroundColor: accent + '15' }]}
          onPress={() => setAxis('vertical')}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>| |</Text>
          <Text style={{ color: axis === 'vertical' ? accent : textColor, fontWeight: '600' }}>Vertical</Text>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center' }}>Book spreads</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: cardBg, borderColor: axis === 'horizontal' ? accent : isDark ? '#333' : '#ddd' }, axis === 'horizontal' && { backgroundColor: accent + '15' }]}
          onPress={() => setAxis('horizontal')}
        >
          <Text style={{ fontSize: 24, marginBottom: 4 }}>=</Text>
          <Text style={{ color: axis === 'horizontal' ? accent : textColor, fontWeight: '600' }}>Horizontal</Text>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center' }}>Tall receipts</Text>
        </TouchableOpacity>
      </View>

      {previewImage && (
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <Text style={[styles.sectionLabel, { color: textColor, alignSelf: 'flex-start', marginBottom: 10 }]}>👀 Live Preview</Text>
          <View style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, backgroundColor: cardBg, overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor }}>
            <Image source={{ uri: previewImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            
            {axis === 'horizontal' && (
              <Animated.View 
                {...panResponder.panHandlers}
                style={{ position: 'absolute', left: 0, right: 0, height: 40, top: panY, marginTop: -20, justifyContent: 'center', zIndex: 10 }}
              >
                <View style={{ height: 3, backgroundColor: accent, width: '100%', elevation: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3 }} />
              </Animated.View>
            )}

            {axis === 'vertical' && (
              <Animated.View 
                {...panResponder.panHandlers}
                style={{ position: 'absolute', top: 0, bottom: 0, width: 40, left: panX, marginLeft: -20, justifyContent: 'center', alignItems: 'center', zIndex: 10 }}
              >
                <View style={{ width: 3, backgroundColor: accent, height: '100%', elevation: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3 }} />
              </Animated.View>
            )}
            
            <View style={styles.previewHint}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Drag the orange line</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🎯 Split Position Ratio (%)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TextInput
          style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor, flex: 1, marginRight: 12 }]}
          value={ratio}
          onChangeText={setRatio}
          keyboardType="number-pad"
          placeholder="50"
          placeholderTextColor={muted}
        />
        <Text style={{ color: muted, fontSize: 14, flex: 1 }}>
          Current split ratio: {ratio}%. {axis === 'vertical' ? 'Adjust left/right.' : 'Adjust top/bottom.'}
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🌐 Scope of Split</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.scopeCard, { backgroundColor: cardBg, borderColor: scope === 'all' ? accent : isDark ? '#333' : '#ddd' }, scope === 'all' && { backgroundColor: accent + '15' }]}
          onPress={() => setScope('all')}
        >
          <Text style={{ color: scope === 'all' ? accent : textColor, fontWeight: '600' }}>Apply to All</Text>
          <Text style={{ color: muted, fontSize: 11 }}>Same ratio for all pages</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scopeCard, { backgroundColor: cardBg, borderColor: scope === 'individual' ? accent : isDark ? '#333' : '#ddd' }, scope === 'individual' && { backgroundColor: accent + '15' }]}
          onPress={() => setScope('individual')}
        >
          <Text style={{ color: scope === 'individual' ? accent : textColor, fontWeight: '600' }}>Individual</Text>
          <Text style={{ color: muted, fontSize: 11 }}>Same ratio, per page</Text>
        </TouchableOpacity>
      </View>
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16, marginTop: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  modeCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  scopeCard: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, textAlign: 'center' },
  previewHint: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
});
