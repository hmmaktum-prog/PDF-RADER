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

    // Batch render all pages
    external fun batchRenderPages(
        inputPath: String,
        outputDirectory: String,
        format: String,
        quality: Int
    ): Boolean

    // Get page dimensions
    external fun getPageDimensions(
        inputPath: String,
        pageNumber: Int
    ): FloatArray

    // Convert to grayscale
    external fun grayscalePdf(
        inputPath: String,
        outputPath: String
    ): Boolean

    // Remove backgrounds (whitening)
    external fun whiteningPdf(
        inputPath: String,
        outputPath: String,
        strength: Int
    ): Boolean

    // Enhance contrast
    external fun enhanceContrastPdf(
        inputPath: String,
        outputPath: String,
        level: Int
    ): Boolean

    // Invert colors
    external fun invertColorsPdf(
        inputPath: String,
        outputPath: String
    ): Boolean

    // AI-assisted whitening
    external fun geminiAiWhitening(
        inputPath: String,
        outputPath: String
    ): Boolean
}
