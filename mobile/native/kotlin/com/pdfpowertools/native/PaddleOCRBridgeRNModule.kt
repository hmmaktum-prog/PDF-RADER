package com.pdfpowertools.native

import android.util.Base64
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
 */
class PaddleOCRBridgeRNModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PaddleOCRBridge"

    // ─── Engine lifecycle ──────────────────────────────────────────────────────

    /**
     * Initialize detection + recognition engines.
     * Must be called before recognizeImage / detectOnly.
     */
    @ReactMethod
    fun initEngine(language: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val ctx = reactContext.applicationContext
                val detPath  = PaddleOCRBridge.detModelPath(ctx)
                val recPath  = PaddleOCRBridge.recModelPath(ctx, language)
                val dict     = PaddleOCRBridge.readDict(ctx, language)
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

    // ─── OCR pipeline ────────────────────────────────────────────────────────

    /**
     * Full OCR on an image file.
     * @param imagePath Absolute file path (rendered PNG from MuPDF)
     * @param language  "en" | "ben" | "ara" | "mixed"
     * @param runKIE    Whether to run Key Information Extraction
     * Returns JSON string: { success, fullText, boxes[], keyInfo }
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
     * Detection only — faster, returns bounding boxes without recognition.
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
     * No image needed — useful after Gemini OCR.
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

    // ─── Model management ────────────────────────────────────────────────────

    /**
     * Check whether model files for a given language are already downloaded.
     */
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
     * Download model files for a language.
     * Sends progress events: { type: "download_progress", value: 0–100 }
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

    /**
     * Health check — is Paddle-Lite compiled and linked?
     */
    @ReactMethod
    fun isPaddleLinked(promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try { promise.resolve(PaddleOCRBridge.isPaddleLinked()) }
            catch (t: Throwable) { promise.reject("PADDLE_LINK_CHECK", t.message, t) }
        }
    }
}
