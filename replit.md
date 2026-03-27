# PDF Power Tools — Mobile App

React Native (Expo) Android app for offline PDF manipulation using NDK-backed C++ libraries.

## Architecture

- **Framework**: Expo 54 / React Native 0.81.5 (New Architecture / Bridgeless mode)
- **Routing**: Expo Router (file-based)
- **Workspace**: pnpm monorepo; app lives in `mobile/`
- **Package Manager**: pnpm@10.26.1 (declared in both root and `mobile/package.json`)

## Replit Environment

The app runs as a **web preview** in Replit using `expo start --web --port 5000`. The native Android/NDK features (QPDF, MuPDF) are not available in the web preview — those require an actual Android build via EAS. The web preview shows the UI and web-compatible features.

### Key packages fixed for Replit compatibility
- `expo-build-properties` corrected to `~1.0.10` (correct version for Expo SDK 54, per expo doctor)
- `expo-blur` corrected to `~15.0.8` (correct version for Expo SDK 54, per expo doctor)
- `@lottiefiles/dotlottie-react` added (required by lottie-react-native for web preview)

## Native Build (NDK)

`mobile/native/` contains the C++ layer:

| File | Purpose |
|---|---|
| `CMakeLists.txt` | Single CMake entry point for the Android native build |
| `src/qpdf_bridge.cpp` | JNI bridge for QPDF (merge, split, rotate, …) — compiled with `HAS_QPDF=1` when `libqpdf.so` is present |
| `src/mupdf_bridge.cpp` | JNI bridge for MuPDF (render, grayscale, contrast, …) — compiled with `HAS_MUPDF=1` when `libmupdf.so` is present |

### Prebuilt Native Libraries Status

| Library | arm64-v8a | x86_64 | Notes |
|---|---|---|---|
| `libqpdf.so` | ✅ present | ✅ present | QPDF v11.9.1 |
| `libjpeg.so` | ✅ present | ✅ present | libjpeg-turbo (QPDF dependency) |
| `libmupdf.so` | ✅ present | ✅ present | MuPDF — confirmed in build log |

**Both libraries compile correctly** — EAS build log confirmed `#include <qpdf/QPDF.hh>` resolves and `HAS_QPDF=1` / `HAS_MUPDF=1` are set.

### Known Bugs Fixed (2026-03-27 — EAS Build Fix)

#### 10. `build-native-libs.yml` + `build_native_libraries.sh` — MuPDF version mismatch: headers 1.28.0 vs .so 1.27.2
**Bug**: MuPDF headers in `third_party/mupdf/include/` were `v1.28.0` (set by `FZ_VERSION "1.28.0"` in `version.h`), but the build scripts were cloning and compiling MuPDF `1.27.2`. The `fz_new_context` macro passes `FZ_VERSION` to `fz_new_context_imp`, which performs a runtime version check — a mismatch between "1.28.0" (from headers) and "1.27.2" (from the compiled .so) would cause all MuPDF features to fail at runtime on the Android app. The `cp -rn` (no-overwrite) flag in the "Copy headers" step was silently keeping the mismatched 1.28.0 headers.
**Fix**:
- Updated `MUPDF_VERSION` to `"1.28.0"` in `scripts/build_native_libraries.sh`
- Updated all `mupdf-1.27.2-source` references to `mupdf-1.28.0-source` in `.github/workflows/build-native-libs.yml`
- Bumped cache key from `native-src-all-v3` → `v4` to force fresh source download
- Changed `cp -rn` → `cp -r` for MuPDF header copy so headers always stay in sync with compiled .so version
- **Action required**: Push to GitHub and trigger "Build & Save Native Libraries" workflow with `force=true` to rebuild .so files from MuPDF 1.28.0 source.

#### 9. `qpdf_bridge.cpp` — QPDF API mismatch: `newDict()` / `getDict()` on QPDFPageObjectHelper
**Bug**: The EAS build failed with `EAS_BUILD_UNKNOWN_GRADLE_ERROR` (Gradle/CMake/NDK compilation error). The QPDF headers in `third_party/qpdf/include/` are version `11.9.1+future` which removed the deprecated `newDict()` method (renamed to `newDictionary()`) and removed `getDict()` from `QPDFPageObjectHelper` (must go through `getObjectHandle().getDict()`). The code was still using the old API.
**Errors**: `no member named 'newDict' in 'QPDFObjectHandle'` and `no member named 'getDict' in 'QPDFPageObjectHelper'`  
**Fix**: 
- Replaced all `QPDFObjectHandle::newDict()` → `QPDFObjectHandle::newDictionary()` (15 occurrences across resize and nup/booklet functions)
- Replaced all `newPage.getDict()` / `sourcePage.getDict()` (QPDFPageObjectHelper) → `.getObjectHandle().getDict()`

---

### Known Bugs Fixed (2026-03-25 — Round 3)

#### 6. `_layout.tsx` — Missing `screens/image-reader` Stack.Screen registration
**Bug**: The Stack navigator in `_layout.tsx` was missing a `<Stack.Screen name="screens/image-reader" .../>` entry. The home screen (`index.tsx`) navigates to `/screens/image-reader` when the user taps images, causing a routing error in Expo Router.
**Fix**: Added `<Stack.Screen name="screens/image-reader" options={{ headerShown: false }} />` to the navigator.

#### 7. `split.tsx` — Returns nonexistent `.zip` path after split
**Bug**: `handleSplit` returned `outputDir + '/split_output.zip'` when the "Output as ZIP" toggle was on. The native `splitPdf` (QPDF C++ bridge) never creates a ZIP file — it only creates individual `.pdf` files in `outputDir`. Attempting to share the nonexistent path would fail silently.
**Fix**: Always return `outputDir`. The directory exists and ToolShell correctly detects it as a folder output for sharing.

#### 8. `nativeModules.ts` — Debug logging code left in production `mergePdfs`
**Bug**: Three `fetch()` calls were embedded in `mergePdfs()` to send internal debug telemetry to a local endpoint (`http://127.0.0.1:7445/ingest/...`). On every merge operation, these fired 3 async HTTP requests (failing silently). The `linked` variable computed solely for these logs was also left unused.
**Fix**: Removed all debug log blocks and the unused `linked` variable. Removed `DEBUG_LOG_ENDPOINT` and `DEBUG_SESSION_ID` constants.

---

### Known Bugs Fixed (2026-03-25 — Round 2)

#### 1. `mupdf_bridge.cpp` — use-after-free in fz_try/always/catch pattern
**Bug**: All render functions (`renderPdfToImage`, `batchRenderPages`, `getPageCount`) used:
```cpp
fz_always(ctx) { fz_drop_context(ctx); }  // drops ctx here
fz_catch(ctx)  { fz_caught_message(ctx); } // UB: ctx already freed
```
**Fix**: Moved `fz_drop_context(ctx)` to AFTER `fz_catch`. Used a `bool success` flag instead of `fz_always`.

#### 2. `mupdf_bridge.cpp` / `qpdf_bridge.cpp` — URI path not decoded
**Bug**: `normalizePath()` only stripped the `file://` prefix but did NOT decode percent-encoded characters (e.g., `%20` = space). MuPDF/QPDF could not find files with spaces or special characters in their names.
**Fix**: Added `decodeUriComponent()` function and applied it inside `normalizePath()` in both C++ bridges. Also fixed `file:///` triple-slash handling to correctly produce an absolute path.

#### 3. `qpdf_bridge.cpp` — `fourUpBooklet` and `imagesToPdf` missing `normalizePath()`
**Bug**: Input/output paths were used raw (without `file://` stripping or URI decoding).
**Fix**: Applied `normalizePath()` to all path arguments.

#### 4. `qpdf_bridge.cpp` — `mergePdfs` only added first page of each PDF
**Bug**: The loop called `getAllPages().at(0)` and added only the first page. All other pages were silently discarded.
**Fix**: Iterate all pages and add each with `addPage(page, false)`.

#### 5. `nativeModules.ts` — `batchRenderPages` threw immediately on native failure
**Bug**: When the native `MuPDFBridge.batchRenderPages` returned false, an error was thrown with no fallback. Reader screen showed an error dialog instead of trying per-page rendering.
**Fix**: Added two-stage fallback: (1) try native batch, (2) if batch fails, try per-page `renderPdfToImage` for each page. Only throw if both paths fail. Error message is now more informative.

---

### Known Bug Fixed — withPdfNdk.js MainApplication registration

**Bug**: The `withMainApplication` modifier in `plugins/withPdfNdk.js` was looking for `return packages` in `MainApplication.kt`. The modern Expo 54 / RN 0.76+ template uses `PackageList(this).packages.apply { }` — there is no `return packages` line. The regex never matched, so `PdfPowerToolsPackage` was never added to `getPackages()`, making `NativeModules.QPDFBridge` and `NativeModules.MuPDFBridge` both `undefined` at runtime. Settings showed MISSING for both engines.

**Fix** (applied 2026-03-25): Updated the modifier to handle three patterns:
1. **Modern** — `PackageList(this).packages.apply { }` → inserts `add(PdfPowerToolsPackage())`
2. **Intermediate** — `PackageList(this).packages` without apply → wraps with `.apply { add(...) }`
3. **Old** — `return packages` → inserts `packages.add(...)` before it

**Rebuild required**: Trigger a new EAS build for the fix to take effect.

### CMake design (important)

The project name in `CMakeLists.txt` is **`appmodules`**, which produces `libappmodules.so`.  
React Native New Architecture **requires** `libappmodules.so` to exist — it contains the TurboModule registry (PlatformConstants and all core modules). Without it the app crashes immediately on startup.

The CMakeLists.txt therefore:
1. Sets `project(appmodules)`
2. Includes `ReactNative-application.cmake` from `node_modules/react-native/ReactAndroid/cmake-utils/` — this builds `libappmodules.so` with autolinking and codegen wired in
3. Separately builds `libpdfpowertools_native.so` from `src/*.cpp` — loaded by the Java Bridge classes via `System.loadLibrary("pdfpowertools_native")`
4. **Conditionally** links QPDF/MuPDF if their prebuilt `.so` and include headers are found in `third_party/`. Sets `HAS_QPDF=1` and `HAS_MUPDF=1` compilation flags.

### Expo config plugin

`mobile/plugins/withPdfNdk.js` injects into `android/app/build.gradle`:
- `externalNativeBuild.cmake.path` → `../../native/CMakeLists.txt`
- `defaultConfig.externalNativeBuild.cmake.arguments` → `PROJECT_BUILD_DIR` and `ANDROID_STL=c++_shared` (required by ReactNative-application.cmake)
- `sourceSets.main.java.srcDirs` → includes `../../native/kotlin` (Kotlin JNI bridge modules)
- Registers `PdfPowerToolsPackage` in `MainApplication` (exposes `NativeModules.QPDFBridge` and `NativeModules.MuPDFBridge`)

## Key Directories

```
mobile/
  app/            Expo Router screens + utils
    utils/
      nativeModules.ts   TypeScript wrappers for JNI bridge calls
      geminiService.ts   Gemini AI OCR service (models: 2.0-flash, 2.5-flash, 2.5-pro)
      docxGenerator.ts   Docx generation (web: Blob, native: base64)
    screens/
      settings.tsx       Shows engine status (ACTIVE/READY/MISSING) for QPDF & MuPDF
                         Web preview shows READY (android-only), Android shows ACTIVE/MISSING
  native/
    CMakeLists.txt
    src/
      qpdf_bridge.cpp    JNI implementations — guarded by #ifdef HAS_QPDF
      mupdf_bridge.cpp   JNI implementations — guarded by #ifdef HAS_MUPDF
    kotlin/              Kotlin wrappers: QPDFBridge, MuPDFBridge, PdfPowerToolsPackage
    third_party/
      qpdf/libs/         Prebuilt libqpdf.so (arm64-v8a, x86_64) ✅
      mupdf/libs/        libmupdf.so must be built via GitHub Actions ❌
  plugins/
    withPdfNdk.js        Expo config plugin — injects NDK cmake config
scripts/
  build_native_libraries.sh   Full build script (libjpeg → QPDF → MuPDF)
  build_mupdf_only.sh         Focused MuPDF-only build script (GNU Make, no cmake needed)
.github/workflows/
  build-native-libs.yml       Manually triggered — builds & commits .so files permanently
  eas-build.yml               Auto-triggered on push to main — EAS cloud APK build
```

## Build

```bash
cd mobile
pnpm expo prebuild          # regenerates android/
pnpm expo run:android       # builds + installs on device/emulator
# or via EAS:
eas build --platform android --profile preview
```

## EAS / GitHub Actions Build

- NDK version: **25.2.9519653** (r25b) — must match between `app.json` and `scripts/build_native_libraries.sh`
- GitHub Actions caches NDK r25b and native `.so` libs between runs
- pnpm lock file (`pnpm-lock.yaml`) at workspace root is used for Node cache
- Required GitHub Secrets:
  - `EXPO_TOKEN` — expo.dev → Account Settings → Access Tokens
  - `GH_PAT` — GitHub Personal Access Token with `repo` write scope (for committing `.so` files)
