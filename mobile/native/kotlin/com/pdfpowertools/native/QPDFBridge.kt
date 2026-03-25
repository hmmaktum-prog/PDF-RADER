package com.pdfpowertools.native

/**
 * QPDFBridge.kt
 * Kotlin wrapper for QPDF C++ JNI bridge
 * These native methods are implemented in qpdf_bridge.cpp
 */
object QPDFBridge {
    init {
        // Load dependency chain in correct order before the main bridge library.
        // libjpeg is a dependency of libqpdf, both must be in the APK (via IMPORTED SHARED in CMake).
        try { System.loadLibrary("jpeg") } catch (_: UnsatisfiedLinkError) {}
        try { System.loadLibrary("qpdf") } catch (_: UnsatisfiedLinkError) {}
        System.loadLibrary("pdfpowertools_native")
    }

    // Health check (must match native/JNI symbol in qpdf_bridge.cpp)
    external fun isQpdfLinked(): Boolean

    // PDF Merging
    external fun mergePdfs(
        inputPaths: String,
        outputPath: String,
        invertColors: Boolean = false
    ): String

    // PDF Splitting
    external fun splitPdf(
        inputPath: String,
        outputDirectory: String,
        ranges: String
    ): Boolean

    // PDF Compression
    external fun compressPdf(
        inputPath: String,
        outputPath: String,
        level: String,
        imgQuality: Int,
        resScale: Int,
        grayscale: Boolean
    ): Boolean

    // PDF Rotation
    external fun rotatePdf(
        inputPath: String,
        outputPath: String,
        angle: Int,
        pages: String = "all"
    ): Boolean

    // PDF Repair/Rebuild
    external fun repairPdf(
        inputPath: String,
        outputPath: String,
        password: String
    ): Boolean

    // PDF Decryption
    external fun decryptPdf(
        inputPath: String,
        outputPath: String,
        password: String
    ): Boolean

    // Reorder Pages
    external fun reorderPages(
        inputPath: String,
        outputPath: String,
        newOrder: String
    ): Boolean

    // Remove Pages
    external fun removePages(
        inputPath: String,
        outputPath: String,
        pagesToRemove: String
    ): Boolean

    // Resize Pages
    external fun resizePdf(
        inputPath: String,
        outputPath: String,
        widthPts: Int,
        heightPts: Int,
        scale: Int,
        alignH: String,
        alignV: String
    ): Boolean

    // N-Up Layout
    external fun nupLayout(
        inputPath: String,
        outputPath: String,
        cols: Int,
        rows: Int,
        sequence: String
    ): Boolean

    // Create Booklet
    external fun createBooklet(
        inputPath: String,
        outputPath: String,
        binding: String,
        autoPadding: Boolean
    ): Boolean

    // 4-Up Booklet
    external fun fourUpBooklet(
        inputPath: String,
        outputPath: String,
        orientation: String
    ): Boolean

    // Images to PDF
    external fun imagesToPdf(
        imagePaths: String,
        rotations: String,
        outputPath: String,
        pageSize: String,
        orientation: String,
        marginPts: Int
    ): Boolean
}
