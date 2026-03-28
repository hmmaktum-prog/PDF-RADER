/**
 * nativeModules.ts
 * TypeScript wrapper for C++ JNI bridge calls (QPDFBridge & MuPDFBridge).
 * These functions call into native Android code via NativeModules.
 * Until the native .so libraries are built, these will throw or return stubs.
 */
import { NativeModules, Platform } from 'react-native';

const nativeQpdfModule = NativeModules.QPDFBridge;
const hasNativeQpdfModule = !!nativeQpdfModule;

const QPDFBridge: any = nativeQpdfModule ?? {
  mergePdfs: () => Promise.resolve(''),
  splitPdf: () => Promise.resolve(false),
  compressPdf: () => Promise.resolve(false),
  rotatePdf: () => Promise.resolve(false),
  repairPdf: () => Promise.resolve(false),
  decryptPdf: () => Promise.resolve(false),
  reorderPages: () => Promise.resolve(false),
  removePages: () => Promise.resolve(false),
  resizePdf: () => Promise.resolve(false),
  nupLayout: () => Promise.resolve(false),
  createBooklet: () => Promise.resolve(false),
  fourUpBooklet: () => Promise.resolve(false),
  imagesToPdf: () => Promise.resolve(false),
  isQpdfLinked: () => Promise.resolve(false),
};

const nativeMupdfModule = NativeModules.MuPDFBridge;
const hasNativeMupdfModule = !!nativeMupdfModule;

const MuPDFBridge: any = nativeMupdfModule ?? {
  getPageCount: () => Promise.resolve(0),
  renderPdfToImage: () => Promise.resolve(false),
  batchRenderPages: () => Promise.resolve(false),
  getPageDimensions: () => Promise.resolve([595, 842]),
  grayscalePdf: () => Promise.resolve(false),
  whiteningPdf: () => Promise.resolve(false),
  enhanceContrastPdf: () => Promise.resolve(false),
  invertColorsPdf: () => Promise.resolve(false),
  geminiAiWhitening: () => Promise.resolve(false),
  isMupdfLinked: () => Promise.resolve(false),
  searchPdfText: () => Promise.resolve("[]"),
  getPdfOutline: () => Promise.resolve("[]"),
};

const nativePaddleModule = NativeModules.PaddleOCRBridge;
const hasNativePaddleModule = !!nativePaddleModule;

const PaddleOCRBridge: any = nativePaddleModule ?? {
  initEngine:             () => Promise.resolve(false),
  isEngineReady:          () => Promise.resolve(false),
  releaseEngine:          () => Promise.resolve(true),
  recognizeImage:         () => Promise.resolve(JSON.stringify({ success: false, error: 'Paddle not linked', boxes: [], fullText: '', keyInfo: {}, tables: [], formulas: [], layoutInfo: {} })),
  detectOnly:             () => Promise.resolve(JSON.stringify({ boxes: [] })),
  extractKIE:             () => Promise.resolve(JSON.stringify({ dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] })),
  downloadModel:          () => Promise.resolve(false),
  isModelDownloaded:      () => Promise.resolve(false),
  isPaddleLinked:         () => Promise.resolve(false),
  analyzeTableStructure:  () => Promise.resolve(JSON.stringify({ tables: [] })),
  detectFormulaRegions:   () => Promise.resolve(JSON.stringify({ formulas: [] })),
  getLayoutInfo:          () => Promise.resolve(JSON.stringify({ boxes: [], layoutInfo: {} })),
};

function ensureAndroid(name: string): void {
  if (Platform.OS !== 'android') {
    throw new Error(`${name} is only available on Android (NDK)`);
  }
}

function assertNativeSuccess(operation: string, ok: boolean, engine: 'QPDF' | 'MuPDF' = 'QPDF'): void {
  if (!ok) {
    const nativeMissing = engine === 'QPDF' ? !hasNativeQpdfModule : !hasNativeMupdfModule;
    if (nativeMissing) {
      throw new Error(
        `${operation} failed: ${engine} native module is not registered. ` +
          `Please rebuild the app with the necessary native libraries.`
      );
    }
    
    // If we're here, the module is present but the engine returned 'false'.
    // This usually means a fatal error in the C++ layer (corrupt file, OOM, etc.)
    throw new Error(
      `${operation} failed: ${engine} engine encountered a fatal error during processing. ` +
      `The file may be corrupted, encrypted with an unsupported scheme, or too large for available memory. ` +
      `Please check System Status in Settings.`
    );
  }
}

export const isAndroidPlatform = Platform.OS === 'android';

export async function isQpdfLinked(): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try {
    return await QPDFBridge.isQpdfLinked();
  } catch {
    return false;
  }
}

export async function isMupdfLinked(): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try {
    return await MuPDFBridge.isMupdfLinked();
  } catch {
    return false;
  }
}

async function ensureEngineLinked(engine: 'QPDF' | 'MuPDF', operation: string) {
  const isLinked = engine === 'QPDF' ? await isQpdfLinked() : await isMupdfLinked();
  if (!isLinked) {
    throw new Error(`${operation} failed: ${engine} engine is not linked in this build. Please provide the required .so libraries.`);
  }
}

// ──────────────────────────────────────────────
// QPDF Operations
// ──────────────────────────────────────────────

export async function mergePdfs(
  inputPaths: string[],
  outputPath: string,
  invertColors: boolean = false
): Promise<string> {
  ensureAndroid('mergePdfs');
  await ensureEngineLinked('QPDF', 'mergePdfs');

  const result = await QPDFBridge.mergePdfs(inputPaths.join(','), outputPath, invertColors);

  if (!result || result === '__ENGINE_NOT_LINKED__') {
    if (!hasNativeQpdfModule) {
      throw new Error('Merge Failed: Native module `QPDFBridge` is missing (NativeModules.QPDFBridge undefined).');
    }
    throw new Error('Merge Failed: QPDF engine is not linked in this build. Please provide the required .so libraries.');
  }
  return result;
}

export async function splitPdf(inputPath: string, outputDir: string, ranges: string): Promise<boolean> {
  ensureAndroid('splitPdf');
  await ensureEngineLinked('QPDF', 'splitPdf');
  const ok = await QPDFBridge.splitPdf(inputPath, outputDir, ranges);
  assertNativeSuccess('splitPdf', ok);
  return ok;
}

export async function compressPdf(
  inputPath: string,
  outputPath: string,
  level: string = 'Balanced',
  imgQuality: number = 70,
  resScale: number = 100,
  grayscale: boolean = false
): Promise<boolean> {
  ensureAndroid('compressPdf');
  await ensureEngineLinked('QPDF', 'compressPdf');
  const ok = await QPDFBridge.compressPdf(inputPath, outputPath, level, imgQuality, resScale, grayscale);
  assertNativeSuccess('compressPdf', ok);
  return ok;
}

export async function rotatePdf(
  inputPath: string,
  outputPath: string,
  angle: 90 | 180 | 270,
  pages?: string // e.g. "1-3,5" or undefined for all
): Promise<boolean> {
  ensureAndroid('rotatePdf');
  await ensureEngineLinked('QPDF', 'rotatePdf');
  const ok = await QPDFBridge.rotatePdf(inputPath, outputPath, angle, pages || 'all');
  assertNativeSuccess('rotatePdf', ok);
  return ok;
}

export async function repairPdf(inputPath: string, outputPath: string, password: string = ''): Promise<boolean> {
  ensureAndroid('repairPdf');
  await ensureEngineLinked('QPDF', 'repairPdf');
  const ok = await QPDFBridge.repairPdf(inputPath, outputPath, password);
  assertNativeSuccess('repairPdf', ok);
  return ok;
}

export async function decryptPdf(inputPath: string, outputPath: string, password: string): Promise<boolean> {
  ensureAndroid('decryptPdf');
  await ensureEngineLinked('QPDF', 'decryptPdf');
  const ok = await QPDFBridge.decryptPdf(inputPath, outputPath, password);
  assertNativeSuccess('decryptPdf', ok);
  return ok;
}

export async function reorderPages(inputPath: string, outputPath: string, newOrder: number[]): Promise<boolean> {
  ensureAndroid('reorderPages');
  await ensureEngineLinked('QPDF', 'reorderPages');
  const ok = await QPDFBridge.reorderPages(inputPath, outputPath, newOrder.join(','));
  assertNativeSuccess('reorderPages', ok);
  return ok;
}

export async function removePages(inputPath: string, outputPath: string, pagesToRemove: number[]): Promise<boolean> {
  ensureAndroid('removePages');
  await ensureEngineLinked('QPDF', 'removePages');
  const ok = await QPDFBridge.removePages(inputPath, outputPath, pagesToRemove.join(','));
  assertNativeSuccess('removePages', ok);
  return ok;
}

export async function resizePdf(
  inputPath: string,
  outputPath: string,
  widthPts: number,
  heightPts: number,
  scale: number = 100,
  alignH: string = 'center',
  alignV: string = 'middle'
): Promise<boolean> {
  ensureAndroid('resizePdf');
  await ensureEngineLinked('QPDF', 'resizePdf');
  const ok = await QPDFBridge.resizePdf(inputPath, outputPath, widthPts, heightPts, scale, alignH, alignV);
  assertNativeSuccess('resizePdf', ok);
  return ok;
}

export async function nupLayout(
  inputPath: string,
  outputPath: string,
  cols: number,
  rows: number,
  sequence: string = 'Z'
): Promise<boolean> {
  ensureAndroid('nupLayout');
  await ensureEngineLinked('QPDF', 'nupLayout');
  const ok = await QPDFBridge.nupLayout(inputPath, outputPath, cols, rows, sequence);
  assertNativeSuccess('nupLayout', ok);
  return ok;
}

export async function createBooklet(
  inputPath: string,
  outputPath: string,
  binding: string,
  autoPadding: boolean = true
): Promise<boolean> {
  ensureAndroid('createBooklet');
  await ensureEngineLinked('QPDF', 'createBooklet');
  const ok = await QPDFBridge.createBooklet(inputPath, outputPath, binding, autoPadding);
  assertNativeSuccess('createBooklet', ok);
  return ok;
}

export async function fourUpBooklet(
  inputPath: string,
  outputPath: string,
  orientation: string
): Promise<boolean> {
  ensureAndroid('fourUpBooklet');
  await ensureEngineLinked('QPDF', 'fourUpBooklet');
  const ok = await QPDFBridge.fourUpBooklet(inputPath, outputPath, orientation);
  assertNativeSuccess('fourUpBooklet', ok);
  return ok;
}

export async function imagesToPdf(
  imageData: { uri: string; rotation: number }[] | string[],
  outputPath: string,
  pageSize: string,
  orientation: string = 'portrait',
  marginPts: number = 0
): Promise<boolean> {
  ensureAndroid('imagesToPdf');
  await ensureEngineLinked('QPDF', 'imagesToPdf');
  // Support both string[] and object[] formats
  const paths = imageData.map((item) => typeof item === 'string' ? item : item.uri);
  const rotations = imageData.map((item) => typeof item === 'string' ? 0 : item.rotation);
  const ok = await QPDFBridge.imagesToPdf(paths.join(','), rotations.join(','), outputPath, pageSize, orientation, marginPts);
  assertNativeSuccess('imagesToPdf', ok);
  return ok;
}

// ──────────────────────────────────────────────
// MuPDF Operations (Rendering / Image Processing)
// ──────────────────────────────────────────────

export async function grayscalePdf(inputPath: string, outputPath: string): Promise<boolean> {
  ensureAndroid('grayscalePdf');
  await ensureEngineLinked('MuPDF', 'grayscalePdf');
  const ok = await MuPDFBridge.grayscalePdf(inputPath, outputPath);
  assertNativeSuccess('grayscalePdf', ok, 'MuPDF');
  return ok;
}

export async function whiteningPdf(
  inputPath: string,
  outputPath: string,
  strength: number
): Promise<boolean> {
  ensureAndroid('whiteningPdf');
  await ensureEngineLinked('MuPDF', 'whiteningPdf');
  const ok = await MuPDFBridge.whiteningPdf(inputPath, outputPath, strength);
  assertNativeSuccess('whiteningPdf', ok, 'MuPDF');
  return ok;
}

export async function enhanceContrastPdf(
  inputPath: string,
  outputPath: string,
  level: number
): Promise<boolean> {
  ensureAndroid('enhanceContrastPdf');
  await ensureEngineLinked('MuPDF', 'enhanceContrastPdf');
  const ok = await MuPDFBridge.enhanceContrastPdf(inputPath, outputPath, level);
  assertNativeSuccess('enhanceContrastPdf', ok, 'MuPDF');
  return ok;
}

export async function invertColorsPdf(inputPath: string, outputPath: string): Promise<boolean> {
  ensureAndroid('invertColorsPdf');
  await ensureEngineLinked('MuPDF', 'invertColorsPdf');
  const ok = await MuPDFBridge.invertColorsPdf(inputPath, outputPath);
  assertNativeSuccess('invertColorsPdf', ok, 'MuPDF');
  return ok;
}

export async function geminiAiWhitening(inputPath: string, outputPath: string): Promise<boolean> {
  ensureAndroid('geminiAiWhitening');
  await ensureEngineLinked('MuPDF', 'geminiAiWhitening');
  const ok = await MuPDFBridge.geminiAiWhitening(inputPath, outputPath);
  assertNativeSuccess('geminiAiWhitening', ok, 'MuPDF');
  return ok;
}

export async function searchPdfText(inputPath: string, query: string): Promise<any[]> {
  if (!isAndroidPlatform) return [];
  try {
    const json = await MuPDFBridge.searchPdfText(inputPath, query);
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export async function getPdfOutline(inputPath: string): Promise<any[]> {
  if (!isAndroidPlatform) return [];
  try {
    const json = await MuPDFBridge.getPdfOutline(inputPath);
    return JSON.parse(json);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────
// MuPDF Operations (Rendering)
// ──────────────────────────────────────────────

export async function getPageCount(inputPath: string, password?: string): Promise<number> {
  ensureAndroid('getPageCount');
  await ensureEngineLinked('MuPDF', 'getPageCount');
  return await MuPDFBridge.getPageCount(inputPath, password || '');
}

/**
 * Render one PDF page to PNG or JPEG (chosen by outputPath extension).
 * @param pageIndex 0-based page index (JNI uses 1-based internally).
 */
export async function renderPageToImage(
  inputPath: string,
  pageIndex: number,
  outputPath: string,
  highRes: boolean = true
): Promise<boolean> {
  ensureAndroid('renderPageToImage');
  await ensureEngineLinked('MuPDF', 'renderPageToImage');
  if (pageIndex < 0) {
    throw new Error('renderPageToImage: pageIndex must be >= 0');
  }
  return await MuPDFBridge.renderPdfToImage(inputPath, pageIndex + 1, outputPath, highRes);
}

/**
 * Renders all pages to images. Uses native MuPDF batch when no per-page progress
 * callback is needed (faster, single document open). With `onProgress`, falls back
 * to per-page render so callers (e.g. OCR) can report progress.
 * If the native batch call fails, automatically retries with per-page rendering.
 * `quality` for JPEG is 1–100; values > 70 select a higher render scale in native batch.
 */
export async function batchRenderPages(
  inputPath: string,
  outputDir: string,
  format: 'jpeg' | 'png',
  quality: number,
  onProgressOrOutputMode?: ((page: number, total: number) => void) | string
): Promise<string[]> {
  ensureAndroid('batchRenderPages');
  await ensureEngineLinked('MuPDF', 'batchRenderPages');
  const onProgress = typeof onProgressOrOutputMode === 'function' ? onProgressOrOutputMode : undefined;
  const totalPages = await getPageCount(inputPath);
  const ext = format === 'png' ? '.png' : '.jpg';
  const results: string[] = [];

  // Per-page rendering path (used when onProgress callback is provided)
  if (onProgress) {
    for (let i = 0; i < totalPages; i++) {
      const outPath = `${outputDir}/page_${i + 1}${ext}`;
      await renderPageToImage(inputPath, i, outPath, quality > 70);
      results.push(outPath);
      onProgress(i + 1, totalPages);
    }
    return results;
  }

  // Attempt native batch render (fastest path — single document open)
  const fmt = format === 'png' ? 'png' : 'jpeg';
  let batchOk = false;
  try {
    batchOk = await MuPDFBridge.batchRenderPages(inputPath, outputDir, fmt, quality);
  } catch {
    batchOk = false;
  }

  if (batchOk) {
    for (let i = 0; i < totalPages; i++) {
      results.push(`${outputDir}/page_${i + 1}${ext}`);
    }
    return results;
  }

  // Fallback: per-page rendering when batch fails
  let perPageSuccess = 0;
  for (let i = 0; i < totalPages; i++) {
    const outPath = `${outputDir}/page_${i + 1}${ext}`;
    try {
      const pageOk = await MuPDFBridge.renderPdfToImage(inputPath, i + 1, outPath, quality > 70);
      if (pageOk) {
        results.push(outPath);
        perPageSuccess += 1;
      } else if (i === 0) {
        // If the very first page fails, the PDF is likely corrupt or completely unsupported. 
        // Abort the fallback to avoid OOM or wasting time looping through 100s of pages.
        break;
      }
    } catch {
      // If native bridge throws an error on the first page, abort.
      if (i === 0) break;
    }
  }

  if (perPageSuccess > 0) {
    // Pad missing pages with the last successfully rendered page
    const lastGood = results[results.length - 1];
    for (let i = perPageSuccess; i < totalPages; i++) {
      results.push(lastGood);
    }
    return results;
  }

  // Both paths failed — throw descriptive error
  const nativeMissing = !hasNativeMupdfModule;
  if (nativeMissing) {
    throw new Error(
      'batchRenderPages failed: MuPDF native module is not registered. ' +
      'Please rebuild the app with the native libraries.'
    );
  }

  // If we reach here, both the native batch call AND the per-page fallback failed.
  throw new Error(
    'batchRenderPages failed: MuPDF could not render this PDF. ' +
    'The file may be encrypted, corrupted, or in an unsupported format. ' +
    'Individual page rendering also failed for every page. ' +
    'Check System Status in Settings for engine linking details.'
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// PaddleOCR Operations — PP-OCRv5 Detection + Recognition + Structure + KIE
// ──────────────────────────────────────────────────────────────────────────────

/** Types for full OCR results */
export interface OcrBox {
  x1: number; y1: number; x2: number; y2: number;
  text: string;
  type: 'title' | 'heading' | 'paragraph' | 'header' | 'footer' | 'table_cell' | 'list_item' | 'caption' | 'formula' | string;
  confidence: number;
  columnIndex?: number;   // -1=full width, 0=left col, 1=right col
  readingOrder?: number;  // document reading order index
}

export interface KIEResult {
  dates: string[];
  amounts: string[];
  referenceNumbers: string[];
  emails: string[];
  phones: string[];
  urls: string[];
}

/** PP-Table: single cell in a reconstructed table */
export interface TableCell {
  row: number;
  col: number;
  x1: number; y1: number; x2: number; y2: number;
  text: string;
}

/** PP-Table: full reconstructed table */
export interface TableResult {
  x1: number; y1: number; x2: number; y2: number;
  rows: number;
  cols: number;
  cells: TableCell[];
  markdownTable: string;
}

/** PP-Formula: detected formula region */
export interface FormulaRegion {
  x1: number; y1: number; x2: number; y2: number;
  text: string;
  score: number;
  latex: string;  // best-effort LaTeX representation
}

/** PP-Layout: document structure summary */
export interface LayoutInfo {
  columns: number;      // number of text columns (1 or 2)
  titles: number;
  headings: number;
  paragraphs: number;
  tableCells: number;
  formulas: number;
  listItems: number;
  captions?: number;
}

export interface OcrResult {
  success: boolean;
  language: string;
  fullText: string;
  boxes: OcrBox[];
  keyInfo: KIEResult;
  tables: TableResult[];       // PP-Table results
  formulas: FormulaRegion[];   // PP-Formula results
  layoutInfo: LayoutInfo;      // PP-Layout summary
  error?: string;
}

/** Initialize detection + recognition engine for a language */
export async function initOcrEngine(language: string): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try {
    return await PaddleOCRBridge.initEngine(language);
  } catch {
    return false;
  }
}

export async function isOcrEngineReady(): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try { return await PaddleOCRBridge.isEngineReady(); } catch { return false; }
}

export async function releaseOcrEngine(): Promise<void> {
  if (!isAndroidPlatform) return;
  try { await PaddleOCRBridge.releaseEngine(); } catch (e) { console.warn('OCR release failed', e); }
}

/**
 * PP-OCRv5 full pipeline:
 *   Detection → Recognition → Layout (PP-Structure v2) → KIE
 * Returns structured OcrResult with boxes, fullText, and keyInfo.
 */
export async function recognizeImageOcr(
  imagePath: string,
  language: string,
  runKIE = true
): Promise<OcrResult> {
  ensureAndroid('recognizeImageOcr');
  try {
    const json: string = await PaddleOCRBridge.recognizeImage(imagePath, language, runKIE);
    return JSON.parse(json) as OcrResult;
  } catch (e: any) {
    throw new Error(`OCR Recognition failed: ${e.message}`);
  }
}

/**
 * PP-OCRv5 Detection only — returns bounding boxes without running recognition.
 * Faster when you only need text regions, not text content.
 */
export async function detectTextRegions(
  imagePath: string
): Promise<{ boxes: Array<{ x1: number; y1: number; x2: number; y2: number; score: number }> }> {
  if (!isAndroidPlatform) return { boxes: [] };
  try {
    const json: string = await PaddleOCRBridge.detectOnly(imagePath);
    return JSON.parse(json);
  } catch { return { boxes: [] }; }
}

/**
 * Key Information Extraction on plain text — no image needed.
 * Extracts: dates, amounts, reference numbers, emails, phones, URLs.
 * Can be used after Gemini OCR or any other text source.
 */
export async function extractKeyInfo(text: string): Promise<KIEResult> {
  if (!isAndroidPlatform) {
    return { dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] };
  }
  try {
    const json: string = await PaddleOCRBridge.extractKIE(text);
    return JSON.parse(json) as KIEResult;
  } catch {
    return { dates: [], amounts: [], referenceNumbers: [], emails: [], phones: [], urls: [] };
  }
}

export async function isPaddleModelDownloaded(language: string): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try { return await PaddleOCRBridge.isModelDownloaded(language); } catch { return false; }
}

export async function downloadOcrModel(
  language: string,
  onProgress?: (pct: number) => void
): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try {
    // Subscribe to native progress events if callback provided
    let sub: any;
    if (onProgress) {
      const { NativeEventEmitter, NativeModules: NM } = require('react-native');
      const emitter = new NativeEventEmitter(NM.PaddleOCRBridge);
      sub = emitter.addListener('PaddleModelDownloadProgress', (e: any) => {
        if (e.language === language) onProgress(e.progress as number);
      });
    }
    const ok = await PaddleOCRBridge.downloadModel(language);
    sub?.remove();
    return ok;
  } catch { return false; }
}

export async function isPaddleLinked(): Promise<boolean> {
  if (!isAndroidPlatform) return false;
  try { return await PaddleOCRBridge.isPaddleLinked(); } catch { return false; }
}

/**
 * PP-Table: Reconstruct table structure from an array of OCR boxes.
 * Pass in boxes with type="table_cell" (or all boxes — the engine filters).
 * Returns structured table data including markdown representation.
 */
export async function analyzeTableStructure(
  boxes: OcrBox[],
  imgWidth: number,
  imgHeight: number
): Promise<{ tables: TableResult[] }> {
  if (!isAndroidPlatform) return { tables: [] };
  try {
    const json: string = await PaddleOCRBridge.analyzeTableStructure(
      JSON.stringify(boxes),
      imgWidth,
      imgHeight
    );
    return JSON.parse(json) as { tables: TableResult[] };
  } catch {
    return { tables: [] };
  }
}

/**
 * PP-Formula: Detect math formula regions from OCR boxes.
 * @param threshold  Sensitivity (0.0–1.0). Default 0.35. Lower = more detections.
 * Returns formula regions with best-effort LaTeX strings.
 */
export async function detectFormulaRegions(
  boxes: OcrBox[],
  threshold = 0.35
): Promise<{ formulas: FormulaRegion[] }> {
  if (!isAndroidPlatform) return { formulas: [] };
  try {
    const json: string = await PaddleOCRBridge.detectFormulaRegions(
      JSON.stringify(boxes),
      threshold
    );
    return JSON.parse(json) as { formulas: FormulaRegion[] };
  } catch {
    return { formulas: [] };
  }
}

/**
 * PP-Layout: Full document layout analysis on OCR boxes.
 * Returns classified boxes (with type, columnIndex, readingOrder)
 * and a summary of layout regions found.
 */
export async function getLayoutInfo(
  boxes: OcrBox[],
  imgWidth: number,
  imgHeight: number
): Promise<{ boxes: OcrBox[]; layoutInfo: LayoutInfo }> {
  if (!isAndroidPlatform) {
    return { boxes, layoutInfo: { columns: 1, titles: 0, headings: 0, paragraphs: 0, tableCells: 0, formulas: 0, listItems: 0 } };
  }
  try {
    const json: string = await PaddleOCRBridge.getLayoutInfo(
      JSON.stringify(boxes),
      imgWidth,
      imgHeight
    );
    return JSON.parse(json) as { boxes: OcrBox[]; layoutInfo: LayoutInfo };
  } catch {
    return { boxes, layoutInfo: { columns: 1, titles: 0, headings: 0, paragraphs: 0, tableCells: 0, formulas: 0, listItems: 0 } };
  }
}
