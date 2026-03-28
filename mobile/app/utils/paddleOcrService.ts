/**
 * paddleOcrService.ts
 *
 * High-level OCR orchestration service — সম্পূর্ণ PP-OCRv5 pipeline:
 *
 *  ১. PP-OCRv5 Detection    — text region bounding boxes (DBNet)
 *  ২. PP-OCRv5 Recognition  — text string per region (SVTR/CRNN + CTC)
 *  ৩. PP-Structure v2       — multi-column layout, reading order, section types
 *  ৪. PP-Table              — table structure reconstruction (rows×cols → markdown)
 *  ৫. PP-Layout             — document region classification (figure/list/caption/para)
 *  ৬. PP-Formula            — math formula detection + LaTeX conversion
 *  ৭. Key Information Ext.  — dates, amounts, refs, emails, phones, URLs
 *
 * Flow:
 *   PDF → MuPDF renders page images → PaddleOCR processes each image → results
 */

import { Platform } from 'react-native';
import {
  batchRenderPages,
  initOcrEngine,
  isOcrEngineReady,
  releaseOcrEngine,
  recognizeImageOcr,
  extractKeyInfo,
  analyzeTableStructure,
  detectFormulaRegions,
  getLayoutInfo,
  isPaddleModelDownloaded,
  downloadOcrModel,
  isPaddleLinked,
  OcrResult,
  OcrBox,
  KIEResult,
  TableResult,
  FormulaRegion,
  LayoutInfo,
} from './nativeModules';

export type {
  OcrResult,
  OcrBox,
  KIEResult,
  TableResult,
  FormulaRegion,
  LayoutInfo,
};

/* ─── Language codes ──────────────────────────────────────────── */

export type OcrLanguage = 'en' | 'ben' | 'ara' | 'mixed';

export const LANGUAGE_LABELS: Record<OcrLanguage, string> = {
  en:    'English',
  ben:   'বাংলা (Bengali)',
  ara:   'العربية (Arabic)',
  mixed: 'Mixed / Multi-language',
};

/* ─── OCR page result ─────────────────────────────────────────── */

export interface OcrPageResult {
  pageNumber: number;
  imagePath:  string;
  result:     OcrResult;
  blocks:      DocumentBlock[]; // Semantic blocks for this page
}

/** 
 * DocumentBlock matches the format used by Gemini and DOCX services 
 * to ensure consistent formatting across AI and OCR features.
 */
export interface DocumentBlock {
  type: 'paragraph' | 'heading' | 'list' | 'table' | 'formula' | 'separator';
  content: string | string[] | string[][];
  level?: number;
  is_bold?: boolean;
  is_italic?: boolean;
  is_underline?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

/* ─── Options ─────────────────────────────────────────────────── */

export interface OfflineOcrOptions {
  inputPath:   string;
  outputDir:   string;
  language:    OcrLanguage;
  runKIE:      boolean;
  onProgress?: (
    page: number,
    total: number,
    phase: 'rendering' | 'recognizing' | 'done'
  ) => void;
}

/* ─── Model management ────────────────────────────────────────── */

export async function isPaddleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return isPaddleLinked();
}

export async function isOcrModelDownloaded(language: OcrLanguage): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return isPaddleModelDownloaded(language);
}

export async function downloadOcrModelForLanguage(
  language: OcrLanguage,
  onProgress?: (pct: number) => void
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return downloadOcrModel(language, onProgress);
}

/* ─── Engine lifecycle ────────────────────────────────────────── */

let _activeLanguage: OcrLanguage | null = null;

export async function ensureEngine(language: OcrLanguage): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  if (_activeLanguage === language && await isOcrEngineReady()) return true;

  if (_activeLanguage && _activeLanguage !== language) {
    await releaseOcrEngine();
    _activeLanguage = null;
  }

  const ok = await initOcrEngine(language);
  if (ok) _activeLanguage = language;
  return ok;
}

export async function freeEngine(): Promise<void> {
  await releaseOcrEngine();
  _activeLanguage = null;
}

/* ─── Single-image OCR ────────────────────────────────────────── */

export async function ocrImage(
  imagePath: string,
  language: OcrLanguage,
  runKIE = true
): Promise<OcrResult> {
  if (Platform.OS !== 'android') {
    return {
      success:    false,
      language,
      fullText:   '',
      boxes:      [],
      keyInfo:    { dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] },
      tables:     [],
      formulas:   [],
      layoutInfo: { columns: 1, titles: 0, headings: 0, paragraphs: 0, tableCells: 0, formulas: 0, listItems: 0 },
      error:      'Android only',
    };
  }
  return recognizeImageOcr(imagePath, language, runKIE);
}

/* ─── Standalone PP-Table analysis ───────────────────────────── */

/**
 * Run PP-Table reconstruction on a set of already-recognized OCR boxes.
 * Useful when you want to post-process results from a previous OCR call.
 */
export async function extractTableStructure(
  boxes: OcrBox[],
  imgWidth: number,
  imgHeight: number
): Promise<TableResult[]> {
  if (Platform.OS !== 'android') return [];
  const result = await analyzeTableStructure(boxes, imgWidth, imgHeight);
  return result.tables;
}

/* ─── Standalone PP-Formula detection ────────────────────────── */

/**
 * Run PP-Formula detection on a set of OCR boxes.
 * @param threshold  Formula confidence threshold (0.0–1.0). Default 0.35.
 */
export async function detectMathFormulas(
  boxes: OcrBox[],
  threshold = 0.35
): Promise<FormulaRegion[]> {
  if (Platform.OS !== 'android') return [];
  const result = await detectFormulaRegions(boxes, threshold);
  return result.formulas;
}

/* ─── Standalone PP-Layout analysis ──────────────────────────── */

export async function analyzeDocumentLayout(
  boxes: OcrBox[],
  imgWidth: number,
  imgHeight: number
): Promise<{ boxes: OcrBox[]; layoutInfo: LayoutInfo }> {
  if (Platform.OS !== 'android') {
    return { boxes, layoutInfo: { columns: 1, titles: 0, headings: 0, paragraphs: 0, tableCells: 0, formulas: 0, listItems: 0 } };
  }
  return getLayoutInfo(boxes, imgWidth, imgHeight);
}

/**
 * Heuristic: Merge raw OCR boxes into semantic paragraphs/headings.
 * This is crucial for high-quality DOCX and Markdown export.
 */
export function mergeBoxesIntoBlocks(boxes: OcrBox[]): DocumentBlock[] {
  if (!boxes || boxes.length === 0) return [];

  // 1. Sort by vertical position (Y1), then horizontal (X1) 
  const sorted = [...boxes].sort((a, b) => {
    const yDiff = a.y1 - b.y1;
    if (Math.abs(yDiff) > 8) return yDiff; // Different lines
    return a.x1 - b.x1; // Same line
  });

  const blocks: DocumentBlock[] = [];
  let currentGroup: OcrBox[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const box = sorted[i];
    if (currentGroup.length === 0) {
      currentGroup.push(box);
      continue;
    }

    const last = currentGroup[currentGroup.length - 1];
    const avgHeight = (last.y2 - last.y1 + box.y2 - box.y1) / 2;
    const verticalDist = box.y1 - last.y1;

    // HEURISTIC: Merge if vertical distance is within 1.6x line height
    const isSamePara = verticalDist < avgHeight * 1.6;

    if (isSamePara) {
      currentGroup.push(box);
    } else {
      blocks.push(paraToBlock(currentGroup));
      currentGroup = [box];
    }
  }

  if (currentGroup.length > 0) {
    blocks.push(paraToBlock(currentGroup));
  }

  return blocks;
}

function paraToBlock(boxes: OcrBox[]): DocumentBlock {
  const text = boxes.map(b => b.text).join(' ').replace(/\s+/g, ' ').trim();
  
  // Basic heading detection
  const isShort = text.length < 70;
  const isAllCaps = text.length > 6 && text === text.toUpperCase();
  
  if (isShort && (isAllCaps || boxes.length === 1)) {
    return { type: 'heading', content: text, level: 2 };
  }

  return { type: 'paragraph', content: text };
}

/* ─── Full PDF OCR pipeline ───────────────────────────────────── */

/**
 * Full offline OCR pipeline for a PDF:
 *   1. Render all pages to PNG images (MuPDF, high-res)
 *   2. For each page, run full PP-OCRv5 pipeline:
 *      Detection → Recognition → PP-Structure v2 → PP-Table → PP-Formula → PP-Layout
 *   3. Optionally run KIE on combined text
 *
 * Returns per-page results and a combined OcrResult.
 */
export async function performOfflineOcr(options: OfflineOcrOptions): Promise<{
  pages:    OcrPageResult[];
  combined: OcrResult;
}> {
  if (Platform.OS !== 'android') {
    throw new Error('Offline OCR is only supported on Android');
  }

  const { inputPath, outputDir, language, runKIE, onProgress } = options;

  // ── Phase 1: Render PDF pages to PNG ──────────────────────────
  const imagePaths = await batchRenderPages(
    inputPath, outputDir, 'png', 95,
    (page, total) => onProgress?.(page, total, 'rendering')
  );

  if (imagePaths.length === 0) {
    throw new Error('PDF rendering produced no images. The file may be corrupt or password-protected.');
  }

  // ── Phase 2: Initialize OCR engine ────────────────────────────
  const ready = await ensureEngine(language);
  if (!ready) {
    throw new Error(
      `OCR engine could not be initialized for language "${LANGUAGE_LABELS[language]}". ` +
      'Please download the model first, or check that Paddle-Lite is linked.'
    );
  }

  // ── Phase 3: OCR each page (full pipeline) ────────────────────
  const pages: OcrPageResult[] = [];
  let combinedText = '';
  const allTables: TableResult[] = [];
  const allFormulas: FormulaRegion[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    onProgress?.(i + 1, imagePaths.length, 'recognizing');
    const result = await recognizeImageOcr(imagePaths[i], language, true);
    
    // Merge raw results into semantic blocks
    const blocks = mergeBoxesIntoBlocks(result.boxes);
    
    pages.push({ 
      pageNumber: i + 1, 
      imagePath: imagePaths[i], 
      result,
      blocks
    });

    if (result.fullText) {
      if (combinedText && i > 0) combinedText += `\n\n--- Page ${i + 1} ---\n`;
      combinedText += result.fullText;
    }
    if (result.tables)   allTables.push(...result.tables);
    if (result.formulas) allFormulas.push(...result.formulas);
  }

  onProgress?.(imagePaths.length, imagePaths.length, 'done');

  // ── Phase 4: KIE on combined text ─────────────────────────────
  const keyInfo: KIEResult = runKIE
    ? await extractKeyInfo(combinedText)
    : { dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] };

  const allBoxes: OcrBox[] = pages.reduce((acc, p) => acc.concat(p.result.boxes), [] as OcrBox[]);

  // Combined layout info (sum across pages)
  const combinedLayout: LayoutInfo = pages.reduce((acc, p) => {
    const li = p.result.layoutInfo || { columns: 1, titles: 0, headings: 0, paragraphs: 0, tableCells: 0, formulas: 0, listItems: 0 };
    return {
      columns:    Math.max(acc.columns, li.columns || 1),
      titles:     acc.titles     + (li.titles     || 0),
      headings:   acc.headings   + (li.headings   || 0),
      paragraphs: acc.paragraphs + (li.paragraphs || 0),
      tableCells: acc.tableCells + (li.tableCells || 0),
      formulas:   acc.formulas   + (li.formulas   || 0),
      listItems:  acc.listItems  + (li.listItems  || 0),
    };
  }, { columns: 1, titles: 0, headings: 0, paragraphs: 0, tableCells: 0, formulas: 0, listItems: 0 });

  return {
    pages,
    combined: {
      success:    true,
      language,
      fullText:   combinedText,
      boxes:      allBoxes,
      keyInfo,
      tables:     allTables,
      formulas:   allFormulas,
      layoutInfo: combinedLayout,
    },
  };
}

/* ─── Formatting helpers ──────────────────────────────────────── */

export function combineToPlainText(pages: OcrPageResult[]): string {
  return pages
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(p => {
      const header = pages.length > 1 ? `--- Page ${p.pageNumber} ---\n` : '';
      return header + p.result.fullText;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function groupBoxesByType(boxes: OcrBox[]): Record<string, OcrBox[]> {
  const groups: Record<string, OcrBox[]> = {};
  for (const box of boxes) {
    if (!groups[box.type]) groups[box.type] = [];
    groups[box.type].push(box);
  }
  return groups;
}

export function formatKIESummary(kie: KIEResult): string {
  const lines: string[] = [];
  if (kie.dates.length)            lines.push(`Dates: ${kie.dates.join(', ')}`);
  if (kie.amounts.length)          lines.push(`Amounts: ${kie.amounts.join(', ')}`);
  if (kie.referenceNumbers.length) lines.push(`References: ${kie.referenceNumbers.join(', ')}`);
  if (kie.emails.length)           lines.push(`Emails: ${kie.emails.join(', ')}`);
  if (kie.phones.length)           lines.push(`Phones: ${kie.phones.join(', ')}`);
  if (kie.urls.length)             lines.push(`URLs: ${kie.urls.join(', ')}`);
  return lines.join('\n') || '(No key information found)';
}

/** Format table results as a human-readable summary */
export function formatTableSummary(tables: TableResult[]): string {
  if (tables.length === 0) return '(No tables detected)';
  return tables
    .map((t, i) =>
      `Table ${i + 1} (${t.rows} rows × ${t.cols} cols):\n${t.markdownTable}`
    )
    .join('\n\n');
}

/** Format formula results as a human-readable summary */
export function formatFormulaSummary(formulas: FormulaRegion[]): string {
  if (formulas.length === 0) return '(No formulas detected)';
  return formulas
    .map((f, i) => `Formula ${i + 1}: ${f.text}${f.latex !== f.text ? `\n  LaTeX: ${f.latex}` : ''}`)
    .join('\n');
}

/** Format layout info as a human-readable summary */
export function formatLayoutSummary(info: LayoutInfo): string {
  const lines: string[] = [];
  lines.push(`Columns: ${info.columns}`);
  if (info.titles)     lines.push(`Titles: ${info.titles}`);
  if (info.headings)   lines.push(`Headings: ${info.headings}`);
  if (info.paragraphs) lines.push(`Paragraphs: ${info.paragraphs}`);
  if (info.tableCells) lines.push(`Table cells: ${info.tableCells}`);
  if (info.formulas)   lines.push(`Formulas: ${info.formulas}`);
  if (info.listItems)  lines.push(`List items: ${info.listItems}`);
  return lines.join(' | ');
}
