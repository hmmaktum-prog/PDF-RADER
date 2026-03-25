/**
 * paddleOcrService.ts
 * Offline OCR using PaddleOCR via MuPDF NDK rendering.
 * 
 * Flow: PDF → MuPDF renders pages to images → PaddleOCR processes images → text output
 * 
 * NOTE: Full PaddleOCR integration requires the PaddleOCR Android SDK or
 * a custom C++ bridge. This file provides the TypeScript interface and
 * orchestration layer.
 */
import { NativeModules, Platform } from 'react-native';
import { batchRenderPages } from './nativeModules';

const PaddleOCRBridge = NativeModules.PaddleOCRBridge;

export interface OcrResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OfflineOcrOptions {
  inputPath: string;
  outputDir: string;
  language: 'en' | 'bn' | 'ar' | 'mixed';
  useAllSubtypes: boolean;
  onProgress?: (page: number, total: number, phase: 'rendering' | 'recognizing') => void;
}

/**
 * Perform offline OCR on a PDF using PaddleOCR.
 * Steps:
 * 1. Render all PDF pages to high-quality images using MuPDF NDK
 * 2. Run PaddleOCR recognition on each image
 * 3. Combine results
 */
export async function performOfflineOcr(options: OfflineOcrOptions): Promise<OcrResult[]> {
  if (Platform.OS !== 'android') {
    throw new Error('Offline OCR is only available on Android');
  }

  const { inputPath, outputDir, language, onProgress } = options;

  // Phase 1: Render PDF pages to images via MuPDF
  const imagePaths = await batchRenderPages(
    inputPath,
    outputDir,
    'png',
    95,
    (page, total) => onProgress?.(page, total, 'rendering')
  );

  // Phase 2: Run PaddleOCR on each rendered image
  const results: OcrResult[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    onProgress?.(i + 1, imagePaths.length, 'recognizing');

    try {
      // Call native PaddleOCR bridge
      // When PaddleOCR SDK is integrated, this will invoke the real recognition
      const ocrResult = await PaddleOCRBridge.recognizeImage(imagePath, language);

      results.push({
        pageNumber: i + 1,
        text: ocrResult?.text || '',
        confidence: ocrResult?.confidence || 0,
      });
    } catch (error) {
      // If PaddleOCR bridge is not available, push empty result
      results.push({
        pageNumber: i + 1,
        text: `[PaddleOCR not yet integrated - Page ${i + 1}]`,
        confidence: 0,
      });
    }
  }

  return results;
}

/**
 * Combine OCR results into a single text string.
 */
export function combineOcrResults(results: OcrResult[]): string {
  return results
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(r => `--- Page ${r.pageNumber} ---\n${r.text}`)
    .join('\n\n');
}
