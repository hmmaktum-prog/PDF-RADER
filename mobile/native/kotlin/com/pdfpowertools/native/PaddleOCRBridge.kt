package com.pdfpowertools.native

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.FileOutputStream
import java.net.URL

/**
 * PaddleOCRBridge.kt
 *
 * Kotlin-side bridge:
 *  • Image decoding (Android BitmapFactory → ARGB_8888 ByteArray → C++)
 *  • Model management (download, path resolution, caching)
 *  • JNI external function declarations (implemented in paddle_ocr_bridge.cpp)
 */
object PaddleOCRBridge {

    init {
        try { System.loadLibrary("paddle_light_api_shared") } catch (_: UnsatisfiedLinkError) {}
        System.loadLibrary("pdfpowertools_native")
    }

    // ─── JNI declarations (implemented in paddle_ocr_bridge.cpp) ────────────

    /** Load detection + recognition models and prepare engine */
    external fun initEngine(
        detModelPath: String,
        recModelPath: String,
        dictContent: String,
        language: String
    ): Boolean

    external fun isEngineReady(): Boolean
    external fun releaseEngine()

    /**
     * Full OCR pipeline on ARGB_8888 pixel bytes.
     * Returns JSON: { success, fullText, boxes[], tables[], formulas[], layoutInfo, keyInfo }
     */
    external fun recognizeFromRGBA(
        rgbaBytes: ByteArray,
        width: Int,
        height: Int,
        runKIE: Boolean
    ): String

    /** Detection only — returns JSON: { boxes[] } */
    external fun detectOnly(rgbaBytes: ByteArray, width: Int, height: Int): String

    /** KIE on plain text — no image needed */
    external fun extractKIE(text: String): String

    /** Returns true if Paddle-Lite was linked at compile time */
    external fun isPaddleLinked(): Boolean

    /**
     * PP-Table: reconstruct table structure from OCR boxes JSON.
     * Input: JSON array of boxes with type="table_cell"
     * Returns: { tables: [{rows, cols, cells[], markdownTable}] }
     */
    external fun analyzeTableStructure(ocrBoxesJson: String, imgWidth: Int, imgHeight: Int): String

    /**
     * PP-Formula: detect formula regions from OCR boxes JSON.
     * Input: JSON array of boxes with text fields
     * Returns: { formulas: [{x1,y1,x2,y2,text,score,latex}] }
     */
    external fun detectFormulaRegions(ocrBoxesJson: String, threshold: Float): String

    /**
     * PP-Layout: full layout analysis on OCR boxes JSON.
     * Input: JSON array of raw boxes
     * Returns: { boxes[], layoutInfo: {columns, titles, headings, paragraphs, ...} }
     */
    external fun getLayoutInfo(ocrBoxesJson: String, imgWidth: Int, imgHeight: Int): String

    // ─── High-level helpers (called from PaddleOCRBridgeRNModule) ────────────

    /**
     * Decode an image file to ARGB_8888 ByteArray and run full OCR.
     * Handles: JPEG / PNG / WebP. Downscales if > 2048px to avoid OOM.
     */
    fun recognizeImageFile(
        imagePath: String,
        language: String,
        runKIE: Boolean = true
    ): String {
        val bytes = decodeImageToRGBA(imagePath)
            ?: return """{"success":false,"error":"Cannot decode image: $imagePath","boxes":[],"fullText":"","keyInfo":{},"tables":[],"formulas":[],"layoutInfo":{}}"""
        return recognizeFromRGBA(bytes.first, bytes.second, bytes.third, runKIE)
    }

    /**
     * Decode image → ARGB_8888 ByteArray (A R G B per pixel, matches Android Bitmap internals).
     * Returns Triple(byteArray, width, height) or null on error.
     */
    fun decodeImageToRGBA(imagePath: String): Triple<ByteArray, Int, Int>? {
        return try {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(imagePath, opts)
            val maxSide = 2048
            var sampleSize = 1
            while (maxOf(opts.outWidth, opts.outHeight) / sampleSize > maxSide) sampleSize *= 2
            val opts2 = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            val bmp = BitmapFactory.decodeFile(imagePath, opts2) ?: return null
            val w = bmp.width; val h = bmp.height
            val buf = IntArray(w * h)
            bmp.getPixels(buf, 0, w, 0, 0, w, h)
            bmp.recycle()
            val bytes = ByteArray(w * h * 4)
            for (i in buf.indices) {
                val px = buf[i]
                bytes[i * 4 + 0] = ((px shr 24) and 0xFF).toByte() // A
                bytes[i * 4 + 1] = ((px shr 16) and 0xFF).toByte() // R
                bytes[i * 4 + 2] = ((px shr  8) and 0xFF).toByte() // G
                bytes[i * 4 + 3] = ((px shr  0) and 0xFF).toByte() // B
            }
            Triple(bytes, w, h)
        } catch (e: Exception) {
            null
        }
    }

    // ─── Model file management ────────────────────────────────────────────────

    /** Official Paddle-Lite optimized (.nb) model URLs — PP-OCRv4 mobile */
    object ModelUrls {
        // Detection model (multilingual, shared across all languages)
        const val DET = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_lite_model/PP-OCRv4_mobile_det_opt.nb"

        // Recognition models per language
        val REC = mapOf(
            "en"    to "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_lite_model/en_PP-OCRv4_mobile_rec_opt.nb",
            "ben"   to "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_lite_model/multilingual_mobile_rec_opt.nb",
            "ara"   to "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_lite_model/multilingual_mobile_rec_opt.nb",
            "mixed" to "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_lite_model/multilingual_mobile_rec_opt.nb",
        )

        // Character dictionaries (plain text, one char/token per line)
        val DICT = mapOf(
            "en"    to "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/en_dict.txt",
            "ben"   to "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/dict/ben_dict.txt",
            "ara"   to "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/dict/arabic_dict.txt",
            "mixed" to "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/en_dict.txt",
        )
    }

    fun modelDir(context: Context): File =
        File(context.filesDir, "paddle_ocr_models").also { it.mkdirs() }

    fun detModelPath(context: Context): String =
        File(modelDir(context), "det_opt.nb").absolutePath

    fun recModelPath(context: Context, lang: String): String =
        File(modelDir(context), "rec_${lang}_opt.nb").absolutePath

    fun dictPath(context: Context, lang: String): String =
        File(modelDir(context), "dict_${lang}.txt").absolutePath

    fun isModelDownloaded(context: Context, lang: String): Boolean {
        val det = File(detModelPath(context))
        val rec = File(recModelPath(context, lang))
        return det.exists() && det.length() > 1024L &&
               rec.exists() && rec.length() > 1024L
    }

    /**
     * Download model files. Reports progress via callback (0–100).
     * Returns true on success.
     */
    fun downloadModel(
        context: Context,
        lang: String,
        onProgress: (Int) -> Unit = {}
    ): Boolean {
        return try {
            val dir = modelDir(context)
            val detFile = File(dir, "det_opt.nb")
            val recFile = File(dir, "rec_${lang}_opt.nb")
            val dictFile = File(dir, "dict_${lang}.txt")

            // Download detection model (step 1 of 3)
            if (!detFile.exists() || detFile.length() < 1024L) {
                onProgress(5)
                downloadFile(ModelUrls.DET, detFile)
                onProgress(40)
            } else {
                onProgress(40)
            }

            // Download recognition model (step 2 of 3)
            val recUrl = ModelUrls.REC[lang] ?: ModelUrls.REC["en"]!!
            if (!recFile.exists() || recFile.length() < 1024L) {
                onProgress(45)
                downloadFile(recUrl, recFile)
                onProgress(85)
            } else {
                onProgress(85)
            }

            // Download dictionary (step 3 of 3)
            val dictUrl = ModelUrls.DICT[lang] ?: ModelUrls.DICT["en"]!!
            if (!dictFile.exists() || dictFile.length() < 10L) {
                onProgress(87)
                downloadFile(dictUrl, dictFile)
            }
            onProgress(100)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun downloadFile(urlStr: String, dest: File) {
        URL(urlStr).openStream().use { ins ->
            FileOutputStream(dest).use { out ->
                val buf = ByteArray(8192)
                var n: Int
                while (ins.read(buf).also { n = it } >= 0) out.write(buf, 0, n)
            }
        }
    }

    fun readDict(context: Context, lang: String): String {
        val f = File(dictPath(context, lang))
        return if (f.exists()) f.readText() else ""
    }
}
