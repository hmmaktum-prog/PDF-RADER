package com.pdfpowertools.native

/**
 * MuPDFBridge.kt
 * Kotlin wrapper for MuPDF C++ JNI bridge
 * These native methods are implemented in mupdf_bridge.cpp
 */
object MuPDFBridge {
    init {
        // Load libmupdf.so before the main bridge library so the dynamic linker can resolve it.
        try { System.loadLibrary("mupdf") } catch (_: UnsatisfiedLinkError) {}
        System.loadLibrary("pdfpowertools_native")
    }

    // Health check (must match native/JNI symbol in mupdf_bridge.cpp)
    external fun isMupdfLinked(): Boolean

    // Get page count
    external fun getPageCount(
        inputPath: String,
        password: String = ""
    ): Int

    // Render single page to image
    external fun renderPdfToImage(
        inputPath: String,
        pageNumber: Int,
        outputPath: String,
        highRes: Boolean = true
    ): Boolean

    // Batch render all pages with progress callback
    external fun batchRenderPages(
        inputPath: String,
        outputDirectory: String,
        format: String,
        quality: Int,
        progressCallback: ((Int, Int) -> Unit)? = null
    ): Boolean

    // Get page dimensions
    external fun getPageDimensions(
        inputPath: String,
        pageNumber: Int
    ): FloatArray

    // Convert to grayscale with progress
    external fun grayscalePdf(
        inputPath: String,
        outputPath: String,
        progressCallback: ((Int, Int) -> Unit)? = null
    ): Boolean

    // Remove backgrounds (whitening) with progress
    external fun whiteningPdf(
        inputPath: String,
        outputPath: String,
        strength: Int,
        progressCallback: ((Int, Int) -> Unit)? = null
    ): Boolean

    // Enhance contrast with progress
    external fun enhanceContrastPdf(
        inputPath: String,
        outputPath: String,
        level: Int,
        progressCallback: ((Int, Int) -> Unit)? = null
    ): Boolean

    // Invert colors with progress
    external fun invertColorsPdf(
        inputPath: String,
        outputPath: String,
        progressCallback: ((Int, Int) -> Unit)? = null
    ): Boolean

    // AI-assisted whitening with progress
    external fun geminiAiWhitening(
        inputPath: String,
        outputPath: String,
        progressCallback: ((Int, Int) -> Unit)? = null
    ): Boolean

    // Search text and return JSON
    external fun searchPdfText(
        inputPath: String,
        query: String
    ): String

    // Get table of contents and return JSON
    external fun getPdfOutline(
        inputPath: String
    ): String
}
