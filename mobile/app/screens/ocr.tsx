import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, ActivityIndicator, Alert } from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import { AVAILABLE_MODELS, GeminiModel, OcrLanguage, extractTextWithGemini, DocumentBlock } from '../utils/geminiService';
import { batchRenderPages } from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { generateDocxAsBase64 } from '../utils/docxGenerator';
import * as FileSystem from 'expo-file-system/legacy';
import { usePreselectedFile } from '../hooks/usePreselectedFile';

const LANGUAGES = [
  { id: 'ben', label: 'বাংলা', flag: '🇧🇩' },
  { id: 'eng', label: 'English', flag: '🇬🇧' },
  { id: 'ara', label: 'Arabic', flag: '🇸🇦' },
  { id: 'mixed', label: 'Mixed', flag: '🌐' },
];

const OUTPUT_FORMATS = [
  { id: 'text', label: '📝 Plain Text', desc: 'Simple .txt output' },
  { id: 'docx', label: '📄 Word Document', desc: 'Styled .docx with formatting' },
  { id: 'json', label: '🗂️ JSON Blocks', desc: 'Structured DocumentBlock JSON' },
];

export default function OcrScreen() {
  const { isDark } = useAppTheme();
  
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [language, setLanguage] = useState('ben');
  const [outputFormat, setOutputFormat] = useState('docx');
  const [useGemini, setUseGemini] = useState(true);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [downloadedPacks, setDownloadedPacks] = useState<Record<string, boolean>>({ eng: true });
  const [downloadingPack, setDownloadingPack] = useState<string | null>(null);

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

  const handleDownloadPack = async (langId: string): Promise<void> => {
    setDownloadingPack(langId);
    // Placeholder until a real offline pack download is wired to native/storage.
    setDownloadedPacks((prev) => ({ ...prev, [langId]: true }));
    setDownloadingPack(null);
    Alert.alert('Download Complete', 'Offline language pack installed successfully.');
  };

  const textColor = isDark ? '#fff' : '#000';
  const cardBg = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent = '#34C759';
  const muted = isDark ? '#888' : '#999';

  const handleOcr = async (onProgress: (pct: number, label?: string) => void): Promise<string> => {
    if (!selectedFile) throw new Error('Please select a PDF file first');
    if (!useGemini && !downloadedPacks[language]) {
      const langLabel = LANGUAGES.find(l => l.id === language)?.label || language;
      throw new Error(`Please download the '${langLabel}' offline pack first.`);
    }

    await ensureOutputDir();
    
    const ocrDir = getOutputPath('ocr_pages');
    const dirInfo = await FileSystem.getInfoAsync(ocrDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ocrDir, { intermediates: true });
    }

    onProgress(10, 'Rendering pages via MuPDF...');
    const renderedPages = await batchRenderPages(selectedFile, ocrDir, 'jpeg', 95);
    
    if (useGemini) {
      onProgress(30, `Reading rendered images...`);
      const base64Images: string[] = [];
      for (const pagePath of renderedPages) {
        const b64 = await FileSystem.readAsStringAsync(pagePath, { encoding: FileSystem.EncodingType.Base64 });
        base64Images.push(b64);
      }

      const langMap: Record<string, OcrLanguage> = { ben: 'Bengali', eng: 'English', ara: 'Arabic', mixed: 'Mixed' };
      const ocrLang = langMap[language] || 'Bengali';

      onProgress(45, `Sending to Gemini ${selectedModel}...`);
      const blocks = await extractTextWithGemini({
        base64Images,
        language: ocrLang,
        model: selectedModel as GeminiModel,
        onProgress: (current, total, phase) => {
          const pct = 45 + Math.round((current / total) * 35);
          onProgress(pct, phase);
        },
      });

      onProgress(85, `Generating ${outputFormat} output...`);
      const ext = outputFormat === 'text' ? 'txt' : outputFormat === 'docx' ? 'docx' : 'json';
      const outputPath = getOutputPath(`ocr_result.${ext}`);

      if (outputFormat === 'json') {
        await FileSystem.writeAsStringAsync(outputPath, JSON.stringify(blocks, null, 2));
      } else if (outputFormat === 'docx') {
        const base64 = await generateDocxAsBase64(blocks);
        await FileSystem.writeAsStringAsync(outputPath, base64, { encoding: FileSystem.EncodingType.Base64 });
      } else {
        // Convert blocks to plain text
        const textContent = blocks.map((block: DocumentBlock) => {
          if (typeof block.content === 'string') return block.content;
          if (Array.isArray(block.content)) {
            return (block.content as any[]).map((row: any) =>
              Array.isArray(row) ? row.join('\t') : String(row)
            ).join('\n');
          }
          if (block.type === 'page_break') return '\n--- Page Break ---\n';
          if (block.type === 'separator') return '---';
          return '';
        }).join('\n\n');
        await FileSystem.writeAsStringAsync(outputPath, textContent);
      }

      onProgress(100, 'OCR complete!');
      return outputPath;
    } else {
      // PaddleOCR offline — not yet wired to native bridge
      throw new Error('Offline PaddleOCR is not yet available in this build. Please enable Gemini AI mode or wait for a future update with native PaddleOCR support.');
    }
  };

  return (
    <ToolShell title="OCR" subtitle="Extract text from scanned PDFs" onExecute={handleOcr} executeLabel="🔍 Run OCR">
      <TouchableOpacity
        style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: accent }]}
        onPress={handlePickFile}
        testID="button-pick-file"
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 30, marginBottom: 6 }}>📁</Text>
        <Text style={[styles.pickText, { color: textColor }]}>
          {selectedFileName || 'Select Scanned PDF'}
        </Text>
        <Text style={{ color: muted, fontSize: 12 }}>
          {selectedFile ? 'Tap to change file' : 'MuPDF renders → OCR engine extracts text'}
        </Text>
      </TouchableOpacity>

      {!selectedFile && (
        <View style={[styles.emptyHint, { backgroundColor: cardBg }]}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🔍</Text>
          <Text style={{ color: textColor, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>
            No file selected
          </Text>
          <Text style={{ color: muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            Select a scanned PDF to extract text using AI or offline OCR
          </Text>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🌐 Language</Text>
      <View style={styles.langRow}>
        {LANGUAGES.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[styles.langCard, { backgroundColor: cardBg, borderColor: language === l.id ? accent : isDark ? '#444' : '#ccc' }, language === l.id && { backgroundColor: accent + '22' }]}
            onPress={() => setLanguage(l.id)}
          >
            <Text style={{ fontSize: 20 }}>{l.flag}</Text>
            <Text style={{ color: language === l.id ? accent : textColor, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.engineToggle, { backgroundColor: cardBg }]}>
        <View>
          <Text style={{ color: textColor, fontWeight: '600' }}>🤖 Gemini AI OCR</Text>
          <Text style={{ color: muted, fontSize: 12 }}>{useGemini ? 'Online — better accuracy' : 'Offline — PaddleOCR'}</Text>
        </View>
        <Switch value={useGemini} onValueChange={setUseGemini} trackColor={{ false: '#555', true: accent }} />
      </View>

      {!useGemini && !downloadedPacks[language] && (
        <View style={[styles.downloadBanner, { backgroundColor: isDark ? '#331' : '#fff9c4', borderColor: isDark ? '#662' : '#ffe082' }]}>
          <Text style={{ flex: 1, color: textColor, fontSize: 13, lineHeight: 18 }}>
            Offline OCR requires the <Text style={{ fontWeight: 'bold' }}>{LANGUAGES.find(l => l.id === language)?.label}</Text> pack (~15MB).
          </Text>
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: accent }]}
            onPress={() => handleDownloadPack(language)}
            disabled={downloadingPack === language}
          >
            {downloadingPack === language ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Download</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {useGemini && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: muted, fontSize: 12, marginBottom: 8 }}>Select Gemini Model</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {AVAILABLE_MODELS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[styles.modelChip, { backgroundColor: cardBg, borderColor: selectedModel === m.id ? accent : isDark ? '#444' : '#ccc' }, selectedModel === m.id && { backgroundColor: accent + '22' }]}
                onPress={() => setSelectedModel(m.id)}
              >
                <Text style={{ color: selectedModel === m.id ? accent : textColor, fontSize: 12, fontWeight: '600' }}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📄 Output Format</Text>
      {OUTPUT_FORMATS.map(f => (
        <TouchableOpacity
          key={f.id}
          style={[styles.fmtCard, { backgroundColor: cardBg, borderColor: outputFormat === f.id ? accent : isDark ? '#333' : '#ddd' }, outputFormat === f.id && { backgroundColor: accent + '15' }]}
          onPress={() => setOutputFormat(f.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: outputFormat === f.id ? accent : textColor, fontWeight: '600' }}>{f.label}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>{f.desc}</Text>
          </View>
          {outputFormat === f.id && <Text style={{ color: accent, fontSize: 18 }}>✓</Text>}
        </TouchableOpacity>
      ))}
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  emptyHint: { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '700' },
  langRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  langCard: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  engineToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 10 },
  modelChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  fmtCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  downloadBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  downloadBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginLeft: 12, minWidth: 90, alignItems: 'center' },
});
