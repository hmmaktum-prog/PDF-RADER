package com.pdfpowertools.native

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class QPDFBridgeRNModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "QPDFBridge"

  @ReactMethod
  fun isQpdfLinked(promise: Promise) {
    try {
      promise.resolve(QPDFBridge.isQpdfLinked())
    } catch (t: Throwable) {
      promise.reject("QPDF_LINK_CHECK_FAILED", t)
    }
  }

  @ReactMethod
  fun mergePdfs(inputPaths: String, outputPath: String, invertColors: Boolean, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.mergePdfs(inputPaths, outputPath, invertColors))
    } catch (t: Throwable) {
      promise.reject("QPDF_MERGE_FAILED", t)
    }
  }

  @ReactMethod
  fun splitPdf(inputPath: String, outputDirectory: String, ranges: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.splitPdf(inputPath, outputDirectory, ranges))
    } catch (t: Throwable) {
      promise.reject("QPDF_SPLIT_FAILED", t)
    }
  }

  @ReactMethod
  fun compressPdf(
    inputPath: String,
    outputPath: String,
    level: String,
    imgQuality: Int,
    resScale: Int,
    grayscale: Boolean,
    promise: Promise,
  ) {
    try {
      promise.resolve(QPDFBridge.compressPdf(inputPath, outputPath, level, imgQuality, resScale, grayscale))
    } catch (t: Throwable) {
      promise.reject("QPDF_COMPRESS_FAILED", t)
    }
  }

  @ReactMethod
  fun rotatePdf(inputPath: String, outputPath: String, angle: Int, pages: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.rotatePdf(inputPath, outputPath, angle, pages))
    } catch (t: Throwable) {
      promise.reject("QPDF_ROTATE_FAILED", t)
    }
  }

  @ReactMethod
  fun repairPdf(inputPath: String, outputPath: String, password: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.repairPdf(inputPath, outputPath, password))
    } catch (t: Throwable) {
      promise.reject("QPDF_REPAIR_FAILED", t)
    }
  }

  @ReactMethod
  fun decryptPdf(inputPath: String, outputPath: String, password: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.decryptPdf(inputPath, outputPath, password))
    } catch (t: Throwable) {
      promise.reject("QPDF_DECRYPT_FAILED", t)
    }
  }

  @ReactMethod
  fun reorderPages(inputPath: String, outputPath: String, newOrder: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.reorderPages(inputPath, outputPath, newOrder))
    } catch (t: Throwable) {
      promise.reject("QPDF_REORDER_FAILED", t)
    }
  }

  @ReactMethod
  fun removePages(inputPath: String, outputPath: String, pagesToRemove: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.removePages(inputPath, outputPath, pagesToRemove))
    } catch (t: Throwable) {
      promise.reject("QPDF_REMOVE_FAILED", t)
    }
  }

  @ReactMethod
  fun resizePdf(
    inputPath: String,
    outputPath: String,
    widthPts: Int,
    heightPts: Int,
    scale: Int,
    alignH: String,
    alignV: String,
    promise: Promise,
  ) {
    try {
      promise.resolve(QPDFBridge.resizePdf(inputPath, outputPath, widthPts, heightPts, scale, alignH, alignV))
    } catch (t: Throwable) {
      promise.reject("QPDF_RESIZE_FAILED", t)
    }
  }

  @ReactMethod
  fun nupLayout(inputPath: String, outputPath: String, cols: Int, rows: Int, sequence: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.nupLayout(inputPath, outputPath, cols, rows, sequence))
    } catch (t: Throwable) {
      promise.reject("QPDF_NUP_FAILED", t)
    }
  }

  @ReactMethod
  fun createBooklet(
    inputPath: String,
    outputPath: String,
    binding: String,
    autoPadding: Boolean,
    promise: Promise,
  ) {
    try {
      promise.resolve(QPDFBridge.createBooklet(inputPath, outputPath, binding, autoPadding))
    } catch (t: Throwable) {
      promise.reject("QPDF_BOOKLET_FAILED", t)
    }
  }

  @ReactMethod
  fun fourUpBooklet(inputPath: String, outputPath: String, orientation: String, promise: Promise) {
    try {
      promise.resolve(QPDFBridge.fourUpBooklet(inputPath, outputPath, orientation))
    } catch (t: Throwable) {
      promise.reject("QPDF_4UP_FAILED", t)
    }
  }

  @ReactMethod
  fun imagesToPdf(
    imagePaths: String,
    rotations: String,
    outputPath: String,
    pageSize: String,
    orientation: String,
    marginPts: Int,
    promise: Promise,
  ) {
    try {
      promise.resolve(QPDFBridge.imagesToPdf(imagePaths, rotations, outputPath, pageSize, orientation, marginPts))
    } catch (t: Throwable) {
      promise.reject("QPDF_IMAGES_TO_PDF_FAILED", t)
    }
  }
}

