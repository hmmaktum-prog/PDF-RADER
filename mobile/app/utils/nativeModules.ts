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
  mergePdfs: () => '',
  splitPdf: () => false,
  compressPdf: () => false,
  rotatePdf: () => false,
  repairPdf: () => false,
  decryptPdf: () => false,
  reorderPages: () => false,
  removePages: () => false,
  resizePdf: () => false,
  nupLayout: () => false,
  createBooklet: () => false,
  fourUpBooklet: () => false,
  imagesToPdf: () => false,
  isQpdfLinked: () => Promise.resolve(false),
};

const nativeMupdfModule = NativeModules.MuPDFBridge;
const hasNativeMupdfModule = !!nativeMupdfModule;

const MuPDFBridge: any = nativeMupdfModule ?? {
  getPageCount: () => 0,
  renderPdfToImage: () => false,
  batchRenderPages: () => false,
  getPageDimensions: () => [595, 842],
  grayscalePdf: () => false,
  whiteningPdf: () => false,
  enhanceContrastPdf: () => false,
  invertColorsPdf: () => false,
  geminiAiWhitening: () => false,
  isMupdfLinked: () => Promise.resolve(false),
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

// ──────────────────────────────────────────────
// QPDF Operations
// ──────────────────────────────────────────────

export async function mergePdfs(
  inputPaths: string[],
  outputPath: string,
  invertColors: boolean = false
): Promise<string> {
  ensureAndroid('mergePdfs');

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
  const ok = await QPDFBridge.rotatePdf(inputPath, outputPath, angle, pages || 'all');
  assertNativeSuccess('rotatePdf', ok);
  return ok;
}

export async function repairPdf(inputPath: string, outputPath: string, password: string = ''): Promise<boolean> {
  ensureAndroid('repairPdf');
  const ok = await QPDFBridge.repairPdf(inputPath, outputPath, password);
  assertNativeSuccess('repairPdf', ok);
  return ok;
}

export async function decryptPdf(inputPath: string, outputPath: string, password: string): Promise<boolean> {
  ensureAndroid('decryptPdf');
  const ok = await QPDFBridge.decryptPdf(inputPath, outputPath, password);
  assertNativeSuccess('decryptPdf', ok);
  return ok;
}

export async function reorderPages(inputPath: string, outputPath: string, newOrder: number[]): Promise<boolean> {
  ensureAndroid('reorderPages');
  const ok = await QPDFBridge.reorderPages(inputPath, outputPath, newOrder.join(','));
  assertNativeSuccess('reorderPages', ok);
  return ok;
}

export async function removePages(inputPath: string, outputPath: string, pagesToRemove: number[]): Promise<boolean> {
  ensureAndroid('removePages');
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
  const ok = await MuPDFBridge.enhanceContrastPdf(inputPath, outputPath, level);
  assertNativeSuccess('enhanceContrastPdf', ok, 'MuPDF');
  return ok;
}

export async function invertColorsPdf(inputPath: string, outputPath: string): Promise<boolean> {
  ensureAndroid('invertColorsPdf');
  const ok = await MuPDFBridge.invertColorsPdf(inputPath, outputPath);
  assertNativeSuccess('invertColorsPdf', ok, 'MuPDF');
  return ok;
}

export async function geminiAiWhitening(inputPath: string, outputPath: string): Promise<boolean> {
  ensureAndroid('geminiAiWhitening');
  const ok = await MuPDFBridge.geminiAiWhitening(inputPath, outputPath);
  assertNativeSuccess('geminiAiWhitening', ok, 'MuPDF');
  return ok;
}

// ──────────────────────────────────────────────
// MuPDF Operations (Rendering)
// ──────────────────────────────────────────────

export async function getPageCount(inputPath: string, password?: string): Promise<number> {
  ensureAndroid('getPageCount');
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
