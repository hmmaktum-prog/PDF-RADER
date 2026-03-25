package com.pdfpowertools.native

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MuPDFBridgeRNModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "MuPDFBridge"

  @ReactMethod
  fun isMupdfLinked(promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.isMupdfLinked())
    } catch (t: Throwable) {
      promise.reject("MUPDF_LINK_CHECK_FAILED", t)
    }
  }

  @ReactMethod
  fun getPageCount(inputPath: String, password: String, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.getPageCount(inputPath, password))
    } catch (t: Throwable) {
      promise.reject("MUPDF_PAGECOUNT_FAILED", t)
    }
  }

  @ReactMethod
  fun renderPdfToImage(inputPath: String, pageNumber: Int, outputPath: String, highRes: Boolean, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.renderPdfToImage(inputPath, pageNumber, outputPath, highRes))
    } catch (t: Throwable) {
      promise.reject("MUPDF_RENDER_FAILED", t)
    }
  }

  @ReactMethod
  fun batchRenderPages(inputPath: String, outputDirectory: String, format: String, quality: Int, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.batchRenderPages(inputPath, outputDirectory, format, quality))
    } catch (t: Throwable) {
      promise.reject("MUPDF_BATCH_RENDER_FAILED", t)
    }
  }

  @ReactMethod
  fun grayscalePdf(inputPath: String, outputPath: String, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.grayscalePdf(inputPath, outputPath))
    } catch (t: Throwable) {
      promise.reject("MUPDF_GRAYSCALE_FAILED", t)
    }
  }

  @ReactMethod
  fun whiteningPdf(inputPath: String, outputPath: String, strength: Int, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.whiteningPdf(inputPath, outputPath, strength))
    } catch (t: Throwable) {
      promise.reject("MUPDF_WHITENING_FAILED", t)
    }
  }

  @ReactMethod
  fun enhanceContrastPdf(inputPath: String, outputPath: String, level: Int, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.enhanceContrastPdf(inputPath, outputPath, level))
    } catch (t: Throwable) {
      promise.reject("MUPDF_CONTRAST_FAILED", t)
    }
  }

  @ReactMethod
  fun invertColorsPdf(inputPath: String, outputPath: String, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.invertColorsPdf(inputPath, outputPath))
    } catch (t: Throwable) {
      promise.reject("MUPDF_INVERT_FAILED", t)
    }
  }

  @ReactMethod
  fun geminiAiWhitening(inputPath: String, outputPath: String, promise: Promise) {
    try {
      promise.resolve(MuPDFBridge.geminiAiWhitening(inputPath, outputPath))
    } catch (t: Throwable) {
      promise.reject("MUPDF_GEMINI_WHITENING_FAILED", t)
    }
  }
}

