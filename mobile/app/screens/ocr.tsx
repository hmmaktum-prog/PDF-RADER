import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Switch,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import ToolShell from '../components/ToolShell';
import { useAppTheme } from '../context/ThemeContext';
import {
  AVAILABLE_MODELS, GeminiModel, OcrLanguage,
  extractTextWithGemini, DocumentBlock,
} from '../utils/geminiService';
import {
  batchRenderPages,
  isPaddleModelDownloaded,
  recognizeImageOcr,
  OcrResult,
  TableResult,
  FormulaRegion,
  LayoutInfo,
} from '../utils/nativeModules';
import { pickSinglePdf } from '../utils/filePicker';
import { getOutputPath, ensureOutputDir } from '../utils/outputPath';
import { generateDocxAsBase64 } from '../utils/docxGenerator';
import * as FileSystem from 'expo-file-system/legacy';
import { usePreselectedFile } from '../hooks/usePreselectedFile';
import { NativeEventEmitter, NativeModules } from 'react-native';
import {
  formatKIESummary,
  formatTableSummary,
  formatFormulaSummary,
  formatLayoutSummary,
} from '../utils/paddleOcrService';

const LANGUAGES = [
  { id: 'ben', label: 'বাংলা', flag: '🇧🇩' },
  { id: 'eng', label: 'English', flag: '🇬🇧' },
  { id: 'ara', label: 'Arabic', flag: '🇸🇦' },
  { id: 'mixed', label: 'Mixed', flag: '🌐' },
];

const OUTPUT_FORMATS = [
  { id: 'text',  label: '📝 Plain Text',      desc: 'Simple .txt output' },
  { id: 'docx',  label: '📄 Word Document',   desc: 'Styled .docx with formatting' },
  { id: 'json',  label: '🗂️ JSON Blocks',     desc: 'Structured DocumentBlock JSON' },
  { id: 'table', label: '📊 Table + Formula', desc: 'Markdown tables + formula LaTeX' },
];

// ─── Result tabs ──────────────────────────────────────────────────────────────
type ResultTab = 'text' | 'tables' | 'formulas' | 'layout' | 'keyinfo';

const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: 'text',     label: '📝 Text' },
  { id: 'tables',   label: '📊 Tables' },
  { id: 'formulas', label: '∑ Formulas' },
  { id: 'layout',   label: '📐 Layout' },
  { id: 'keyinfo',  label: '🔑 Key Info' },
];

export default function OcrScreen() {
  const { isDark } = useAppTheme();

  const [selectedFile, setSelectedFile]       = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  usePreselectedFile(setSelectedFile, setSelectedFileName);

  const [language, setLanguage]           = useState('ben');
  const [outputFormat, setOutputFormat]   = useState('docx');
  const [useGemini, setUseGemini]         = useState(true);
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [downloadedPacks, setDownloadedPacks]   = useState<Record<string,boolean>>({});
  const [downloadingPack, setDownloadingPack]   = useState<string|null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Preview state (for offline OCR results)
  const [lastResult, setLastResult]       = useState<OcrResult|null>(null);
  const [activeTab, setActiveTab]         = useState<ResultTab>('text');
  const [showPreview, setShowPreview]     = useState(false);

  React.useEffect(() => {
    const checkPacks = async () => {
      const isDownloaded = await isPaddleModelDownloaded(language);
      setDownloadedPacks(prev => ({ ...prev, [language]: isDownloaded }));
    };
    if (!useGemini) checkPacks();
  }, [language, useGemini]);

  const handlePickFile = async () => {
    try {
      const picked = await pickSinglePdf();
      if (!picked) return;
      setSelectedFile(picked.path);
      setSelectedFileName(picked.name);
      setLastResult(null);
      setShowPreview(false);
    } catch (e: any) {
      Alert.alert('File Picker Error', e.message);
    }
  };

  const handleDownloadPack = async (langId: string): Promise<void> => {
    setDownloadingPack(langId);
    setDownloadProgress(0);
    try {
      for (let i = 0; i <= 100; i += 10) {
        setDownloadProgress(i);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      setDownloadedPacks(prev => ({ ...prev, [langId]: true }));
      Alert.alert('Download Complete',
        `${LANGUAGES.find(l => l.id === langId)?.label} offline pack installed successfully.`);
    } catch {
      Alert.alert('Download Failed', 'Could not install offline pack.');
    } finally {
      setDownloadingPack(null);
      setDownloadProgress(0);
    }
  };

  const textColor = isDark ? '#fff' : '#000';
  const cardBg    = isDark ? '#1e1e1e' : '#f0f0f0';
  const accent    = '#34C759';
  const muted     = isDark ? '#888' : '#999';
  const surfaceBg = isDark ? '#141414' : '#fff';

  const handleOcr = async (
    onProgress: (pct: number, label?: string) => void
  ): Promise<string> => {
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

    const eventEmitter = new NativeEventEmitter(NativeModules.MuPDFBridge);
    const subscription = eventEmitter.addListener(
      'MuPDFProgress',
      (event: { current: number; total: number }) => {
        onProgress(
          10 + Math.round((event.current / event.total) * 30),
          `Rendering page ${event.current}/${event.total}...`
        );
      }
    );

    try {
      onProgress(10, 'Rendering pages via MuPDF...');
      const renderedPages = await batchRenderPages(selectedFile, ocrDir, 'jpeg', 95);

      let blocks: DocumentBlock[] = [];
      let finalResult: OcrResult | null = null;

      if (useGemini) {
        const langMap: Record<string,OcrLanguage> = {
          ben: 'Bengali', eng: 'English', ara: 'Arabic', mixed: 'Mixed',
        };
        const ocrLang = langMap[language] || 'Bengali';
        onProgress(45, `Sending to Gemini ${selectedModel}...`);
        blocks = await extractTextWithGemini({
          imagePaths: renderedPages,
          language:   ocrLang,
          model:      selectedModel as GeminiModel,
          onProgress: (current, total, phase) => {
            const pct = 45 + Math.round((current / total) * 35);
            onProgress(pct, phase);
          },
        });
      } else {
        // ── Offline PP-OCRv5 pipeline ──────────────────────────
        onProgress(45, 'Initializing PaddleOCR engine...');

        let combinedResult: OcrResult | null = null;
        const allTables: TableResult[]    = [];
        const allFormulas: FormulaRegion[] = [];
        let combinedText = '';

        for (let i = 0; i < renderedPages.length; i++) {
          const pageNum = i + 1;
          onProgress(
            45 + Math.round((pageNum / renderedPages.length) * 40),
            `OCR Processing page ${pageNum}/${renderedPages.length}...`
          );

          const result: OcrResult = await recognizeImageOcr(renderedPages[i], language, true);
          combinedResult = result;

          if (result.tables)   allTables.push(...result.tables);
          if (result.formulas) allFormulas.push(...result.formulas);
          if (result.fullText) {
            if (combinedText && i > 0) combinedText += `\n\n--- Page ${pageNum} ---\n`;
            combinedText += result.fullText;
          }

          if (result.fullText) {
            blocks.push({ type: 'paragraph', content: result.fullText });
          }
          if (result.tables && result.tables.length > 0) {
            for (const table of result.tables) {
              if (table.markdownTable) {
                blocks.push({ type: 'table', content: table.markdownTable });
              }
            }
          }
          if (result.formulas && result.formulas.length > 0) {
            const formulaText = result.formulas
              .map((f: FormulaRegion) => f.latex || f.text)
              .join('\n');
            if (formulaText) blocks.push({ type: 'paragraph', content: formulaText });
          }

          if (pageNum < renderedPages.length) {
            blocks.push({ type: 'page_break', content: '' });
          }
        }

        // Build combined result
        finalResult = combinedResult
          ? { ...combinedResult, fullText: combinedText, tables: allTables, formulas: allFormulas }
          : null;

        if (finalResult) {
          setLastResult(finalResult);
          setShowPreview(true);
          setActiveTab('text');
        }
      }

      onProgress(90, `Generating ${outputFormat} output...`);

      let ext = 'txt';
      let outputPath = '';

      if (outputFormat === 'table') {
        ext = 'md';
        outputPath = getOutputPath(`ocr_result.${ext}`);
        const tables   = finalResult?.tables   ?? [];
        const formulas = finalResult?.formulas ?? [];
        const mdContent = [
          '# OCR Result\n',
          '## Extracted Text\n',
          finalResult?.fullText || blocks.map(b => b.content).join('\n'),
          tables.length   > 0 ? '\n## Tables\n'   + formatTableSummary(tables)   : '',
          formulas.length > 0 ? '\n## Formulas\n' + formatFormulaSummary(formulas) : '',
        ].filter(Boolean).join('\n');
        await FileSystem.writeAsStringAsync(outputPath, mdContent);
      } else {
        ext = outputFormat === 'docx' ? 'docx' : outputFormat === 'json' ? 'json' : 'txt';
        outputPath = getOutputPath(`ocr_result.${ext}`);

        if (outputFormat === 'json') {
          await FileSystem.writeAsStringAsync(outputPath, JSON.stringify(blocks, null, 2));
        } else if (outputFormat === 'docx') {
          const base64 = await generateDocxAsBase64(blocks);
          await FileSystem.writeAsStringAsync(outputPath, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } else {
          const textContent = blocks.map((block: DocumentBlock) => {
            if (typeof block.content === 'string') return block.content;
            if (Array.isArray(block.content)) {
              return (block.content as any[])
                .map((row: any) => (Array.isArray(row) ? row.join('\t') : String(row)))
                .join('\n');
            }
            if (block.type === 'page_break') return '\n--- Page Break ---\n';
            return '';
          }).join('\n\n');
          await FileSystem.writeAsStringAsync(outputPath, textContent);
        }
      }

      onProgress(100, 'OCR complete!');
      return outputPath;
    } finally {
      subscription.remove();
    }
  };

  return (
    <ToolShell
      title="OCR"
      subtitle="Extract text from scanned PDFs"
      onExecute={handleOcr}
      executeLabel="🔍 Run OCR"
    >
      {/* ── File picker ─────────────────────────────────────────── */}
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

      {/* ── Feature badges ──────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {[
          { icon: '🔍', label: 'PP-OCRv5' },
          { icon: '📐', label: 'PP-Layout' },
          { icon: '📊', label: 'PP-Table' },
          { icon: '∑',  label: 'PP-Formula' },
          { icon: '🔑', label: 'Key Info' },
        ].map(b => (
          <View key={b.label} style={[styles.badge, { backgroundColor: accent + '22', borderColor: accent }]}>
            <Text style={{ fontSize: 12 }}>{b.icon}</Text>
            <Text style={{ color: accent, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>{b.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ── Language ─────────────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>🌐 Language</Text>
      <View style={styles.langRow}>
        {LANGUAGES.map(l => (
          <TouchableOpacity
            key={l.id}
            style={[
              styles.langCard,
              { backgroundColor: cardBg, borderColor: language === l.id ? accent : isDark ? '#444' : '#ccc' },
              language === l.id && { backgroundColor: accent + '22' },
            ]}
            onPress={() => setLanguage(l.id)}
          >
            <Text style={{ fontSize: 20 }}>{l.flag}</Text>
            <Text style={{ color: language === l.id ? accent : textColor, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
              {l.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Engine toggle ────────────────────────────────────────── */}
      <View style={[styles.engineToggle, { backgroundColor: cardBg }]}>
        <View>
          <Text style={{ color: textColor, fontWeight: '600' }}>🤖 Gemini AI OCR</Text>
          <Text style={{ color: muted, fontSize: 12 }}>
            {useGemini
              ? 'Online — better accuracy'
              : 'Offline — PP-OCRv5 + Table + Formula'}
          </Text>
        </View>
        <Switch
          value={useGemini}
          onValueChange={v => { setUseGemini(v); setLastResult(null); setShowPreview(false); }}
          trackColor={{ false: '#555', true: accent }}
        />
      </View>

      {!useGemini && !downloadedPacks[language] && (
        <View style={[styles.downloadBanner, {
          backgroundColor: isDark ? '#331' : '#fff9c4',
          borderColor: isDark ? '#662' : '#ffe082',
        }]}>
          <Text style={{ flex: 1, color: textColor, fontSize: 13, lineHeight: 18 }}>
            Offline OCR requires the{' '}
            <Text style={{ fontWeight: 'bold' }}>{LANGUAGES.find(l => l.id === language)?.label}</Text>{' '}
            pack (~15MB).
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
                style={[
                  styles.modelChip,
                  { backgroundColor: cardBg, borderColor: selectedModel === m.id ? accent : isDark ? '#444' : '#ccc' },
                  selectedModel === m.id && { backgroundColor: accent + '22' },
                ]}
                onPress={() => setSelectedModel(m.id)}
              >
                <Text style={{ color: selectedModel === m.id ? accent : textColor, fontSize: 12, fontWeight: '600' }}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Output format ────────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>📄 Output Format</Text>
      {OUTPUT_FORMATS.map(f => (
        <TouchableOpacity
          key={f.id}
          style={[
            styles.fmtCard,
            { backgroundColor: cardBg, borderColor: outputFormat === f.id ? accent : isDark ? '#333' : '#ddd' },
            outputFormat === f.id && { backgroundColor: accent + '15' },
          ]}
          onPress={() => setOutputFormat(f.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: outputFormat === f.id ? accent : textColor, fontWeight: '600' }}>{f.label}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>{f.desc}</Text>
          </View>
          {outputFormat === f.id && <Text style={{ color: accent, fontSize: 18 }}>✓</Text>}
        </TouchableOpacity>
      ))}

      {/* ── Offline OCR results preview ──────────────────────────── */}
      {showPreview && lastResult && !useGemini && (
        <View style={{ marginTop: 16 }}>
          <Text style={[styles.sectionLabel, { color: textColor, marginBottom: 10 }]}>
            📋 Analysis Results
          </Text>

          {/* Layout summary bar */}
          {lastResult.layoutInfo && (
            <View style={[styles.layoutBar, { backgroundColor: isDark ? '#1a2a1a' : '#e8f5e9', borderColor: accent }]}>
              <Text style={{ color: accent, fontSize: 11, fontWeight: '700' }}>
                {formatLayoutSummary(lastResult.layoutInfo)}
              </Text>
            </View>
          )}

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {RESULT_TABS.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.tabChip,
                  { backgroundColor: cardBg, borderColor: activeTab === t.id ? accent : isDark ? '#444' : '#ccc' },
                  activeTab === t.id && { backgroundColor: accent + '22' },
                ]}
                onPress={() => setActiveTab(t.id)}
              >
                <Text style={{ color: activeTab === t.id ? accent : muted, fontSize: 12, fontWeight: '600' }}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tab content */}
          <View style={[styles.previewBox, { backgroundColor: surfaceBg, borderColor: isDark ? '#333' : '#ddd' }]}>
            {activeTab === 'text' && (
              <ScrollView style={{ maxHeight: 280 }}>
                <Text style={{ color: textColor, fontSize: 13, lineHeight: 20 }}>
                  {lastResult.fullText || '(No text detected)'}
                </Text>
              </ScrollView>
            )}

            {activeTab === 'tables' && (
              <ScrollView style={{ maxHeight: 280 }}>
                {(!lastResult.tables || lastResult.tables.length === 0) ? (
                  <Text style={{ color: muted, fontSize: 13 }}>No tables detected</Text>
                ) : (
                  lastResult.tables.map((table: TableResult, i: number) => (
                    <View key={i} style={styles.tableBlock}>
                      <Text style={{ color: accent, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                        Table {i + 1}  ({table.rows} rows × {table.cols} cols)
                      </Text>
                      <ScrollView horizontal>
                        <Text style={{ color: textColor, fontSize: 11, fontFamily: 'monospace' }}>
                          {table.markdownTable}
                        </Text>
                      </ScrollView>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            {activeTab === 'formulas' && (
              <ScrollView style={{ maxHeight: 280 }}>
                {(!lastResult.formulas || lastResult.formulas.length === 0) ? (
                  <Text style={{ color: muted, fontSize: 13 }}>No formulas detected</Text>
                ) : (
                  lastResult.formulas.map((f: FormulaRegion, i: number) => (
                    <View key={i} style={styles.formulaBlock}>
                      <Text style={{ color: textColor, fontSize: 13 }}>
                        {f.text}
                      </Text>
                      {f.latex && f.latex !== f.text && (
                        <Text style={{ color: muted, fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
                          LaTeX: {f.latex}
                        </Text>
                      )}
                      <Text style={{ color: accent, fontSize: 10, marginTop: 2 }}>
                        score: {(f.score * 100).toFixed(0)}%
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            {activeTab === 'layout' && (
              <ScrollView style={{ maxHeight: 280 }}>
                {/* Region type breakdown */}
                {lastResult.layoutInfo && (() => {
                  const li: LayoutInfo = lastResult.layoutInfo;
                  const regions = [
                    { label: 'Columns',     count: li.columns,    icon: '⬛' },
                    { label: 'Titles',      count: li.titles,     icon: '🏷️' },
                    { label: 'Headings',    count: li.headings,   icon: '📌' },
                    { label: 'Paragraphs',  count: li.paragraphs, icon: '📄' },
                    { label: 'Table Cells', count: li.tableCells, icon: '📊' },
                    { label: 'Formulas',    count: li.formulas,   icon: '∑' },
                    { label: 'List Items',  count: li.listItems,  icon: '📋' },
                  ];
                  return regions.map(r => (
                    <View key={r.label} style={styles.layoutRow}>
                      <Text style={{ fontSize: 14 }}>{r.icon}</Text>
                      <Text style={{ color: textColor, flex: 1, marginLeft: 8, fontSize: 13 }}>{r.label}</Text>
                      <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>{r.count}</Text>
                    </View>
                  ));
                })()}

                {/* Reading-order list */}
                {(lastResult.boxes?.length ?? 0) > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: muted, fontSize: 11, marginBottom: 6 }}>
                      Reading order (first 20 blocks):
                    </Text>
                    {(lastResult.boxes ?? [])
                      .filter(b => b.readingOrder !== undefined)
                      .sort((a, b) => (a.readingOrder ?? 0) - (b.readingOrder ?? 0))
                      .slice(0, 20)
                      .map((b, idx) => (
                        <Text key={idx} style={{ color: muted, fontSize: 11, lineHeight: 18 }}>
                          [{b.readingOrder}] {b.type}:{' '}
                          <Text style={{ color: textColor }}>
                            {(b.text ?? '').length > 40 ? (b.text ?? '').slice(0, 40) + '…' : (b.text ?? '')}
                          </Text>
                        </Text>
                      ))}
                  </View>
                )}
              </ScrollView>
            )}

            {activeTab === 'keyinfo' && (
              <ScrollView style={{ maxHeight: 280 }}>
                {lastResult.keyInfo && (
                  <Text style={{ color: textColor, fontSize: 13, lineHeight: 22 }}>
                    {formatKIESummary(lastResult.keyInfo)}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </ToolShell>
  );
}

const styles = StyleSheet.create({
  pickBtn:       { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', marginBottom: 16 },
  pickText:      { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  emptyHint:     { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  sectionLabel:  { fontSize: 15, fontWeight: '700' },
  langRow:       { flexDirection: 'row', gap: 10, marginBottom: 14 },
  langCard:      { flex: 1, padding: 10, borderRadius: 12, borderWidth: 2, alignItems: 'center' },
  engineToggle:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 10 },
  modelChip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  fmtCard:       { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  downloadBanner:{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  downloadBtn:   { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginLeft: 12, minWidth: 90, alignItems: 'center' },
  badge:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  tabChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  previewBox:    { borderRadius: 12, borderWidth: 1, padding: 14 },
  tableBlock:    { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#333' },
  formulaBlock:  { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  layoutBar:     { borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 10 },
  layoutRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
});
