package com.pdfpowertools.native

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * PaddleOCRBridgeRNModule.kt
 *
 * React Native module — bridges JavaScript ↔ PaddleOCRBridge (C++ + Kotlin).
 *
 * Exposed as NativeModules.PaddleOCRBridge in JavaScript.
 *
 * Methods exposed:
 *  1.  initEngine           — initialize det + rec OCR engine
 *  2.  isEngineReady        — health check
 *  3.  releaseEngine        — free memory
 *  4.  recognizeImage       — full OCR pipeline (det→rec→layout→table→formula→KIE)
 *  5.  detectOnly           — detection bounding boxes only
 *  6.  extractKIE           — key information extraction from text
 *  7.  isModelDownloaded    — check if model files exist
 *  8.  downloadModel        — download OCR model files with progress events
 *  9.  isPaddleLinked       — compile-time Paddle-Lite check
 *  10. analyzeTableStructure — PP-Table: reconstruct table from OCR boxes JSON
 *  11. detectFormulaRegions  — PP-Formula: detect math formulas from OCR boxes JSON
 *  12. getLayoutInfo         — PP-Layout: full document layout analysis
 */
class PaddleOCRBridgeRNModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PaddleOCRBridge"

    // ─── Engine lifecycle ──────────────────────────────────────────────────────

    @ReactMethod
    fun initEngine(language: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val ctx = reactContext.applicationContext
                val detPath = PaddleOCRBridge.detModelPath(ctx)
                val recPath = PaddleOCRBridge.recModelPath(ctx, language)
                val dict    = PaddleOCRBridge.readDict(ctx, language)
                val ok = PaddleOCRBridge.initEngine(detPath, recPath, dict, language)
                promise.resolve(ok)
            } catch (t: Throwable) {
                promise.reject("PADDLE_INIT_FAILED", t.message, t)
            }
        }
    }

    @ReactMethod
    fun isEngineReady(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try { promise.resolve(PaddleOCRBridge.isEngineReady()) }
            catch (t: Throwable) { promise.reject("PADDLE_READY_CHECK", t.message, t) }
        }
    }

    @ReactMethod
    fun releaseEngine(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try { PaddleOCRBridge.releaseEngine(); promise.resolve(true) }
            catch (t: Throwable) { promise.reject("PADDLE_RELEASE", t.message, t) }
        }
    }

    // ─── OCR pipeline ─────────────────────────────────────────────────────────

    /**
     * Full OCR on an image file.
     * Returns JSON: { success, fullText, boxes[], tables[], formulas[], layoutInfo, keyInfo }
     */
    @ReactMethod
    fun recognizeImage(imagePath: String, language: String, runKIE: Boolean, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = PaddleOCRBridge.recognizeImageFile(imagePath, language, runKIE)
                promise.resolve(result)
            } catch (t: Throwable) {
                promise.reject("PADDLE_RECOGNIZE_FAILED", t.message, t)
            }
        }
    }

    /**
     * Detection only — returns bounding boxes without recognition.
     * Returns JSON: { boxes: [{x1,y1,x2,y2,score}] }
     */
    @ReactMethod
    fun detectOnly(imagePath: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val bytes = PaddleOCRBridge.decodeImageToRGBA(imagePath)
                if (bytes == null) {
                    promise.resolve("{\"error\":\"Cannot decode image\",\"boxes\":[]}")
                    return@launch
                }
                val result = PaddleOCRBridge.detectOnly(bytes.first, bytes.second, bytes.third)
                promise.resolve(result)
            } catch (t: Throwable) {
                promise.reject("PADDLE_DETECT_FAILED", t.message, t)
            }
        }
    }

    /**
     * Key Information Extraction from plain text.
     * Returns JSON: { dates[], amounts[], referenceNumbers[], emails[], phones[], urls[] }
     */
    @ReactMethod
    fun extractKIE(text: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                promise.resolve(PaddleOCRBridge.extractKIE(text))
            } catch (t: Throwable) {
                promise.reject("PADDLE_KIE_FAILED", t.message, t)
            }
        }
    }

    // ─── PP-Table ─────────────────────────────────────────────────────────────

    /**
     * PP-Table: Reconstruct table structure from OCR boxes JSON.
     * @param ocrBoxesJson  JSON array: [{x1,y1,x2,y2,text,type}]
     * @param imgWidth      Original image width (pixels)
     * @param imgHeight     Original image height (pixels)
     * Returns JSON: { tables: [{rows, cols, cells[], markdownTable, x1,y1,x2,y2}] }
     */
    @ReactMethod
    fun analyzeTableStructure(ocrBoxesJson: String, imgWidth: Int, imgHeight: Int, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = PaddleOCRBridge.analyzeTableStructure(ocrBoxesJson, imgWidth, imgHeight)
                promise.resolve(result)
            } catch (t: Throwable) {
                promise.reject("PADDLE_TABLE_FAILED", t.message, t)
            }
        }
    }

    // ─── PP-Formula ───────────────────────────────────────────────────────────

    /**
     * PP-Formula: Detect math formula regions from OCR boxes JSON.
     * @param ocrBoxesJson  JSON array: [{x1,y1,x2,y2,text}]
     * @param threshold     Formula score threshold (0.0–1.0, default 0.35)
     * Returns JSON: { formulas: [{x1,y1,x2,y2,text,score,latex}] }
     */
    @ReactMethod
    fun detectFormulaRegions(ocrBoxesJson: String, threshold: Double, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = PaddleOCRBridge.detectFormulaRegions(ocrBoxesJson, threshold.toFloat())
                promise.resolve(result)
            } catch (t: Throwable) {
                promise.reject("PADDLE_FORMULA_FAILED", t.message, t)
            }
        }
    }

    // ─── PP-Layout ────────────────────────────────────────────────────────────

    /**
     * PP-Layout: Full document layout analysis on OCR boxes JSON.
     * @param ocrBoxesJson  JSON array: [{x1,y1,x2,y2,text}]
     * @param imgWidth      Original image width (pixels)
     * @param imgHeight     Original image height (pixels)
     * Returns JSON: { boxes[], layoutInfo: {columns, titles, headings, paragraphs, ...} }
     */
    @ReactMethod
    fun getLayoutInfo(ocrBoxesJson: String, imgWidth: Int, imgHeight: Int, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = PaddleOCRBridge.getLayoutInfo(ocrBoxesJson, imgWidth, imgHeight)
                promise.resolve(result)
            } catch (t: Throwable) {
                promise.reject("PADDLE_LAYOUT_FAILED", t.message, t)
            }
        }
    }

    // ─── Model management ─────────────────────────────────────────────────────

    @ReactMethod
    fun isModelDownloaded(language: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val ctx = reactContext.applicationContext
                promise.resolve(PaddleOCRBridge.isModelDownloaded(ctx, language))
            } catch (t: Throwable) {
                promise.reject("PADDLE_MODEL_CHECK", t.message, t)
            }
        }
    }

    /**
     * Download model files. Sends progress events: PaddleModelDownloadProgress { progress, language }
     */
    @ReactMethod
    fun downloadModel(language: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val ctx = reactContext.applicationContext
                val ok = PaddleOCRBridge.downloadModel(ctx, language) { progress ->
                    val params: WritableMap = Arguments.createMap()
                    params.putInt("progress", progress)
                    params.putString("language", language)
                    try {
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("PaddleModelDownloadProgress", params)
                    } catch (_: Exception) {}
                }
                promise.resolve(ok)
            } catch (t: Throwable) {
                promise.reject("PADDLE_DOWNLOAD_FAILED", t.message, t)
            }
        }
    }

    @ReactMethod
    fun isPaddleLinked(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try { promise.resolve(PaddleOCRBridge.isPaddleLinked()) }
            catch (t: Throwable) { promise.reject("PADDLE_LINK_CHECK", t.message, t) }
        }
    }
}
