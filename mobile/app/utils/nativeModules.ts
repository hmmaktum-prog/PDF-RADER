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

// #region agent log helpers
const DEBUG_LOG_ENDPOINT = 'http://127.0.0.1:7445/ingest/fbd86430-3391-4ee4-88b7-1ba8d8575017';
const DEBUG_SESSION_ID = 'ec5b5f';
// #endregion

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
        `${operation} failed: Native module is missing (${engine} NativeModules.* undefined). ` +
          `Check Android native module registration.`
      );
    }
    throw new Error(`${operation} failed: ${engine} engine is either not linked or encountered a fatal error. Please check System Status in Settings.`);
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

  // #region agent log: merge pre
  {
    const payload = {
      sessionId: DEBUG_SESSION_ID,
      runId: 'debug_pre',
      hypothesisId: 'H1_native_module_or_qpdf_linking',
      location: 'nativeModules.ts:mergePdfs:pre',
      message: 'before QPDF merge call',
      data: {
        hasNativeQpdfModule,
        typeofNativeModule: typeof nativeQpdfModule,
        qpdfHasIsLinkedFn: typeof QPDFBridge?.isQpdfLinked,
        platformOS: Platform.OS,
        invertColors,
        inputCount: inputPaths?.length,
      },
      timestamp: Date.now(),
    };
    fetch(DEBUG_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': DEBUG_SESSION_ID,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
  // #endregion

  // Pre-check engine linked state (confirms whether HAS_QPDF was compiled in)
  const linked = await (async () => {
    try {
      if (typeof QPDFBridge?.isQpdfLinked === 'function') return await QPDFBridge.isQpdfLinked();
      return false;
    } catch {
      return false;
    }
  })();

  // #region agent log: merge linked pre
  {
    const payload = {
      sessionId: DEBUG_SESSION_ID,
      runId: 'debug_pre',
      hypothesisId: 'H3_qpdf_not_linked_compiled_flag',
      location: 'nativeModules.ts:mergePdfs:pre_check',
      message: 'QPDF engine linked pre-check',
      data: { linked },
      timestamp: Date.now(),
    };
    fetch(DEBUG_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': DEBUG_SESSION_ID,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
  // #endregion

  const result = await QPDFBridge.mergePdfs(inputPaths.join(','), outputPath, invertColors);

  // #region agent log: merge result
  {
    const payload = {
      sessionId: DEBUG_SESSION_ID,
      runId: 'debug_pre',
      hypothesisId: 'H2_merge_returns_engine_not_linked',
      location: 'nativeModules.ts:mergePdfs:post',
      message: 'after QPDF merge call',
      data: {
        result,
        resultIsEngineNotLinked: result === '__ENGINE_NOT_LINKED__',
      },
      timestamp: Date.now(),
    };
    fetch(DEBUG_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': DEBUG_SESSION_ID,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
  // #endregion

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

  if (onProgress) {
    for (let i = 0; i < totalPages; i++) {
      const outPath = `${outputDir}/page_${i + 1}${ext}`;
      await renderPageToImage(inputPath, i, outPath, quality > 70);
      results.push(outPath);
      onProgress(i + 1, totalPages);
    }
    return results;
  }

  const fmt = format === 'png' ? 'png' : 'jpeg';
  const ok = await MuPDFBridge.batchRenderPages(inputPath, outputDir, fmt, quality);
  assertNativeSuccess('batchRenderPages', ok, 'MuPDF');

  for (let i = 0; i < totalPages; i++) {
    results.push(`${outputDir}/page_${i + 1}${ext}`);
  }
  return results;
}
