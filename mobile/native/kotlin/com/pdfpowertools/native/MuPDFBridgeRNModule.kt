package com.pdfpowertools.native

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MuPDFBridgeRNModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "MuPDFBridge"

  @ReactMethod
  fun isMupdfLinked(promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.isMupdfLinked())
      } catch (t: Throwable) {
        promise.reject("MUPDF_LINK_CHECK_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun getPageCount(inputPath: String, password: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.getPageCount(inputPath, password))
      } catch (t: Throwable) {
        promise.reject("MUPDF_PAGECOUNT_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun getPageDimensions(inputPath: String, pageNumber: Int, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val dims = MuPDFBridge.getPageDimensions(inputPath, pageNumber)
        val result = com.facebook.react.bridge.Arguments.createArray()
        result.pushDouble(dims[0].toDouble())
        result.pushDouble(dims[1].toDouble())
        promise.resolve(result)
      } catch (t: Throwable) {
        promise.reject("MUPDF_PAGEDIMENSIONS_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun renderPdfToImage(inputPath: String, pageNumber: Int, outputPath: String, highRes: Boolean, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.renderPdfToImage(inputPath, pageNumber, outputPath, highRes))
      } catch (t: Throwable) {
        promise.reject("MUPDF_RENDER_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun batchRenderPages(inputPath: String, outputDirectory: String, format: String, quality: Int, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val result = MuPDFBridge.batchRenderPages(inputPath, outputDirectory, format, quality) { current, total ->
          emitProgress(current, total)
        }
        promise.resolve(result)
      } catch (t: Throwable) {
        promise.reject("MUPDF_BATCH_RENDER_FAILED", t)
      }
    }
  }

  private fun emitProgress(current: Int, total: Int) {
    val params = com.facebook.react.bridge.Arguments.createMap()
    params.putInt("current", current)
    params.putInt("total", total)
    reactApplicationContext
      .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("MuPDFProgress", params)
  }

  @ReactMethod
  fun grayscalePdf(inputPath: String, outputPath: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.grayscalePdf(inputPath, outputPath) { current, total ->
          emitProgress(current, total)
        })
      } catch (t: Throwable) {
        promise.reject("MUPDF_GRAYSCALE_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun whiteningPdf(inputPath: String, outputPath: String, strength: Int, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.whiteningPdf(inputPath, outputPath, strength) { current, total ->
          emitProgress(current, total)
        })
      } catch (t: Throwable) {
        promise.reject("MUPDF_WHITENING_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun enhanceContrastPdf(inputPath: String, outputPath: String, level: Int, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.enhanceContrastPdf(inputPath, outputPath, level) { current, total ->
          emitProgress(current, total)
        })
      } catch (t: Throwable) {
        promise.reject("MUPDF_CONTRAST_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun invertColorsPdf(inputPath: String, outputPath: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.invertColorsPdf(inputPath, outputPath) { current, total ->
          emitProgress(current, total)
        })
      } catch (t: Throwable) {
        promise.reject("MUPDF_INVERT_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun geminiAiWhitening(inputPath: String, outputPath: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.geminiAiWhitening(inputPath, outputPath) { current, total ->
          emitProgress(current, total)
        })
      } catch (t: Throwable) {
        promise.reject("MUPDF_GEMINI_WHITENING_FAILED", t)
      }
    }
  }
  @ReactMethod
  fun searchPdfText(inputPath: String, query: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.searchPdfText(inputPath, query))
      } catch (t: Throwable) {
        promise.reject("MUPDF_SEARCH_FAILED", t)
      }
    }
  }

  @ReactMethod
  fun getPdfOutline(inputPath: String, promise: Promise) {
    CoroutineScope(Dispatchers.IO).launch {
      try {
        promise.resolve(MuPDFBridge.getPdfOutline(inputPath))
      } catch (t: Throwable) {
        promise.reject("MUPDF_OUTLINE_FAILED", t)
      }
    }
  }
}
