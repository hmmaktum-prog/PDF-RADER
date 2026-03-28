/**
 * paddleOcrService.ts
 *
 * High-level OCR orchestration service — PP-OCRv5 pipeline:
 *
 *  ১. PP-OCRv5 Detection    — text region bounding boxes (DBNet)
 *  ২. PP-OCRv5 Recognition  — text string per region (SVTR/CRNN + CTC)
 *  ৩. PP-Structure v2       — layout classification (title/heading/table…)
 *  ৪. Key Information Ext.  — dates, amounts, refs, emails, phones, URLs
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
  isPaddleModelDownloaded,
  downloadOcrModel,
  isPaddleLinked,
  OcrResult,
  OcrBox,
  KIEResult,
} from './nativeModules';

export type { OcrResult, OcrBox, KIEResult };

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

/** Returns true if Paddle-Lite was compiled in (HAS_PADDLE defined) */
export async function isPaddleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return isPaddleLinked();
}

/** Check if OCR model files for a language are downloaded */
export async function isOcrModelDownloaded(language: OcrLanguage): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return isPaddleModelDownloaded(language);
}

/**
 * Download PP-OCRv4 mobile model files for a language.
 * Detection model is shared; recognition model is per-language.
 * Reports progress (0–100) via onProgress callback.
 */
export async function downloadOcrModelForLanguage(
  language: OcrLanguage,
  onProgress?: (pct: number) => void
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return downloadOcrModel(language, onProgress);
}

/* ─── Engine lifecycle ────────────────────────────────────────── */

let _activeLanguage: OcrLanguage | null = null;

/**
 * Initialize engine for a given language.
 * Re-initializes if the language changed since last call.
 */
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

/**
 * Run full PP-OCRv5 pipeline on one rendered image.
 * Requires engine to be initialized via ensureEngine() first.
 */
export async function ocrImage(
  imagePath: string,
  language: OcrLanguage,
  runKIE = true
): Promise<OcrResult> {
  if (Platform.OS !== 'android') {
    return {
      success:  false,
      language,
      fullText: '',
      boxes:    [],
      keyInfo:  { dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] },
      error:    'Android only',
    };
  }
  return recognizeImageOcr(imagePath, language, runKIE);
}

/* ─── Full PDF OCR pipeline ───────────────────────────────────── */

/**
 * Full offline OCR pipeline for a PDF:
 *   1. Render all pages to PNG images (MuPDF, high-res)
 *   2. For each page, run PP-OCRv5 (Detection + Recognition + Layout)
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

  // ── Phase 3: OCR each page ────────────────────────────────────
  const pages: OcrPageResult[] = [];
  let combinedText = '';

  for (let i = 0; i < imagePaths.length; i++) {
    onProgress?.(i + 1, imagePaths.length, 'recognizing');
    const result = await recognizeImageOcr(imagePaths[i], language, false);
    pages.push({ pageNumber: i + 1, imagePath: imagePaths[i], result });
    if (result.fullText) {
      if (combinedText && i > 0) combinedText += `\n\n--- Page ${i + 1} ---\n`;
      combinedText += result.fullText;
    }
  }

  onProgress?.(imagePaths.length, imagePaths.length, 'done');

  // ── Phase 4: KIE on combined text ─────────────────────────────
  const keyInfo: KIEResult = runKIE
    ? await extractKeyInfo(combinedText)
    : { dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] };

  const allBoxes: OcrBox[] = pages.flatMap(p => p.result.boxes);

  return {
    pages,
    combined: {
      success:  true,
      language,
      fullText: combinedText,
      boxes:    allBoxes,
      keyInfo,
    },
  };
}

/* ─── Formatting helpers ──────────────────────────────────────── */

/** Combine per-page results into a plain text string */
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

/** Group boxes by layout type (title, heading, text, table_cell…) */
export function groupBoxesByType(boxes: OcrBox[]): Record<string, OcrBox[]> {
  const groups: Record<string, OcrBox[]> = {};
  for (const box of boxes) {
    if (!groups[box.type]) groups[box.type] = [];
    groups[box.type].push(box);
  }
  return groups;
}

/** Format KIE result as a human-readable summary */
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
