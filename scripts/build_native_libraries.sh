#!/usr/bin/env bash
set -euo pipefail

# build_native_libraries.sh
# GitHub Actions-এ চলে। libjpeg-turbo → QPDF → MuPDF 1.28.0 build করে।
# Output: mobile/native/third_party/{qpdf,mupdf}/libs/{arm64-v8a,x86_64}/

WORKSPACE="$(pwd)"
NDK_VERSION="25.2.9519653"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$HOME/Android/Sdk/ndk/$NDK_VERSION}"
ANDROID_API=24
ABIS=(arm64-v8a x86_64)
TOOLCHAIN="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake"
SRC_ROOT="$WORKSPACE/.native_src"
THIRD_PARTY="$WORKSPACE/mobile/native/third_party"

MUPDF_VERSION="1.28.0"
MUPDF_SRC="$SRC_ROOT/mupdf-${MUPDF_VERSION}-source"

echo "=== PDF Power Tools Native Library Builder ==="
echo "NDK:          $ANDROID_NDK_ROOT"
echo "Workspace:    $WORKSPACE"
echo "MuPDF:        $MUPDF_VERSION"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: Linux required." >&2; exit 1
fi

if [[ ! -d "$ANDROID_NDK_ROOT" ]]; then
  echo "Downloading NDK r25b (~1.5 GB)..."
  mkdir -p "$HOME/Android/Sdk/ndk"
  curl -L -o /tmp/ndk.zip "https://dl.google.com/android/repository/android-ndk-r25b-linux.zip"
  unzip -q /tmp/ndk.zip -d "$HOME/Android/Sdk/ndk"
  mv "$HOME/Android/Sdk/ndk/android-ndk-r25b" "$ANDROID_NDK_ROOT"
  rm -f /tmp/ndk.zip
  echo "NDK ready."
fi

mkdir -p "$SRC_ROOT" "$THIRD_PARTY/qpdf/libs" "$THIRD_PARTY/mupdf/libs"

# ── Clone QPDF + libjpeg (if not present) ────────────────────────────────────
echo ""
echo "── Sources ──"
if [[ ! -d "$SRC_ROOT/libjpeg-turbo/.git" ]]; then
  echo "Cloning libjpeg-turbo..."
  git clone --depth 1 https://github.com/libjpeg-turbo/libjpeg-turbo.git \
    "$SRC_ROOT/libjpeg-turbo"
fi

if [[ ! -d "$SRC_ROOT/qpdf/.git" ]]; then
  echo "Cloning QPDF v11.9.1..."
  git clone --depth 1 --branch v11.9.1 https://github.com/qpdf/qpdf.git \
    "$SRC_ROOT/qpdf"
fi

# ── MuPDF: git clone (mkdir আগে করলে git clone fail করে, তাই করবো না) ──────
if [[ ! -d "$MUPDF_SRC/.git" ]]; then
  # পুরনো ভুল/অসম্পূর্ণ directory থাকলে মুছে দাও
  [[ -d "$MUPDF_SRC" ]] && rm -rf "$MUPDF_SRC"

  echo "Cloning MuPDF $MUPDF_VERSION with submodules (~300 MB)..."
  git clone --depth 1 --branch "$MUPDF_VERSION" \
    --recurse-submodules --shallow-submodules \
    https://github.com/ArtifexSoftware/mupdf.git \
    "$MUPDF_SRC"

  # Clone সফল হয়েছে কিনা যাচাই (Makefile থাকলেই যথেষ্ট, CMakeLists না থাকলেও চলবে)
  if [[ ! -f "$MUPDF_SRC/Makefile" && ! -f "$MUPDF_SRC/CMakeLists.txt" ]]; then
    echo "ERROR: MuPDF clone সফল হয়নি — Makefile বা CMakeLists.txt নেই!" >&2
    ls -la "$MUPDF_SRC/" || true
    exit 1
  fi
  echo "MuPDF source ready: $MUPDF_SRC"
  ls "$MUPDF_SRC/" | head -10
else
  echo "MuPDF source already present: $MUPDF_SRC"
fi

# ── Per-ABI builds ────────────────────────────────────────────────────────────
for ABI in "${ABIS[@]}"; do
  echo ""
  echo "══ ABI: $ABI ══════════════════════════════════════"

  case "$ABI" in
    arm64-v8a)   TRIPLE="aarch64-linux-android" ;;
    x86_64)      TRIPLE="x86_64-linux-android" ;;
    armeabi-v7a) TRIPLE="arm-linux-androideabi" ;;
  esac

  CLANG_DIR="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin"
  NDK_SYSROOT="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/sysroot"

  CC_ANDROID="${CLANG_DIR}/${TRIPLE}${ANDROID_API}-clang"
  CXX_ANDROID="${CLANG_DIR}/${TRIPLE}${ANDROID_API}-clang++"
  AR_ANDROID="${CLANG_DIR}/llvm-ar"
  RANLIB_ANDROID="${CLANG_DIR}/llvm-ranlib"
  STRIP_ANDROID="${CLANG_DIR}/llvm-strip"

  COMMON_CMAKE=(
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN"
    -DANDROID_ABI="$ABI"
    -DANDROID_PLATFORM="android-$ANDROID_API"
    -DANDROID_STL=c++_shared
    -DCMAKE_BUILD_TYPE=Release
  )

  # ── 1. libjpeg-turbo ────────────────────────────────────────────────────────
  LIBJPEG_INSTALL="$SRC_ROOT/libjpeg-install-$ABI"

  if [[ ! -f "$LIBJPEG_INSTALL/lib/libjpeg.so" ]]; then
    echo "Building libjpeg-turbo for $ABI..."
    mkdir -p "$SRC_ROOT/libjpeg-build-$ABI" "$LIBJPEG_INSTALL"
    cmake "${COMMON_CMAKE[@]}" \
          -S "$SRC_ROOT/libjpeg-turbo" \
          -B "$SRC_ROOT/libjpeg-build-$ABI" \
          -DENABLE_SHARED=ON -DENABLE_STATIC=OFF \
          -DWITH_JPEG8=ON \
          -DCMAKE_INSTALL_PREFIX="$LIBJPEG_INSTALL"
    cmake --build "$SRC_ROOT/libjpeg-build-$ABI" -j"$(nproc)"
    cmake --install "$SRC_ROOT/libjpeg-build-$ABI"
    echo "libjpeg-turbo ✓"
  else
    echo "libjpeg-turbo already built (skip)"
  fi

  PKGCONFIG_DIR="$LIBJPEG_INSTALL/lib/pkgconfig"
  mkdir -p "$PKGCONFIG_DIR"
  cat > "$PKGCONFIG_DIR/libjpeg.pc" << PC
prefix=$LIBJPEG_INSTALL
exec_prefix=\${prefix}
libdir=\${exec_prefix}/lib
includedir=\${prefix}/include

Name: libjpeg
Description: Android cross-compiled libjpeg-turbo
Version: 2.1.0
Libs: -L\${libdir} -ljpeg
Cflags: -I\${includedir}
PC

  # ── 2. QPDF ─────────────────────────────────────────────────────────────────
  if [[ ! -f "$THIRD_PARTY/qpdf/libs/$ABI/libqpdf.so" ]]; then
    echo "Building QPDF for $ABI..."
    mkdir -p "$SRC_ROOT/qpdf-build-$ABI"

    PKG_CONFIG_SYSROOT_DIR="" \
    PKG_CONFIG_PATH="$PKGCONFIG_DIR" \
    PKG_CONFIG_LIBDIR="$PKGCONFIG_DIR" \
    cmake "${COMMON_CMAKE[@]}" \
          -S "$SRC_ROOT/qpdf" \
          -B "$SRC_ROOT/qpdf-build-$ABI" \
          -Dqpdf_build_tools=OFF \
          -Dqpdf_build_tests=OFF \
          -Dqpdf_build_examples=OFF \
          -DBUILD_SHARED_LIBS=ON \
          -DREQUIRE_CRYPTO_OPENSSL=OFF \
          -DREQUIRE_CRYPTO_GNUTLS=OFF \
          -DUSE_INSECURE_RANDOM=ON \
          -DJPEG_LIBRARY="$LIBJPEG_INSTALL/lib/libjpeg.so" \
          -DJPEG_INCLUDE_DIR="$LIBJPEG_INSTALL/include" \
          -DZLIB_LIBRARY="$NDK_SYSROOT/usr/lib/$TRIPLE/libz.so" \
          -DZLIB_INCLUDE_DIR="$NDK_SYSROOT/usr/include"

    cmake --build "$SRC_ROOT/qpdf-build-$ABI" -j"$(nproc)"

    QPDF_SO=$(find "$SRC_ROOT/qpdf-build-$ABI" -name 'libqpdf.so' 2>/dev/null | head -1 || true)
    if [[ -z "$QPDF_SO" ]]; then
      echo "ERROR: libqpdf.so not found for $ABI" >&2; exit 1
    fi
    mkdir -p "$THIRD_PARTY/qpdf/libs/$ABI"
    cp -v "$QPDF_SO" "$THIRD_PARTY/qpdf/libs/$ABI/"
    cp -v "$LIBJPEG_INSTALL/lib/libjpeg.so" "$THIRD_PARTY/qpdf/libs/$ABI/" 2>/dev/null || true
    echo "QPDF ✓"
  else
    echo "QPDF already built for $ABI (skip)"
  fi

  # ── 3. MuPDF ─────────────────────────────────────────────────────────────────
  if [[ ! -f "$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so" ]]; then
    echo "Building MuPDF $MUPDF_VERSION for $ABI..."
    MUPDF_SO=""

    # প্রতিটি ABI-র জন্য আলাদা build tag (architecture mismatch এড়াতে)
    MUPDF_BUILD_TAG="release-${ABI}"

    XCFLAGS_ANDROID="-fPIC -DNDEBUG -DHAVE_ANDROID -D_GNU_SOURCE"

    # ── পদ্ধতি A: CMake (CMakeLists.txt থাকলে) ────────────────────────────────
    if [[ -f "$MUPDF_SRC/CMakeLists.txt" ]]; then
      echo "→ পদ্ধতি A: CMake দিয়ে MuPDF build করছে..."
      MUPDF_BUILD_DIR="$SRC_ROOT/mupdf-cmake-build-$ABI"
      mkdir -p "$MUPDF_BUILD_DIR"
      set +e
      cmake "${COMMON_CMAKE[@]}" \
            -S "$MUPDF_SRC" -B "$MUPDF_BUILD_DIR" \
            -DBUILD_SHARED_LIBS=OFF \
            -DCMAKE_C_FLAGS="$XCFLAGS_ANDROID" \
            -DCMAKE_CXX_FLAGS="$XCFLAGS_ANDROID" \
            -DFITZ_ENABLE_OCR_TESSERACT=OFF \
            -DFITZ_ENABLE_BARCODE=OFF \
            -DMUPDF_THREADING=OFF \
            -DHAVE_GLFW=OFF -DHAVE_X11=OFF \
            -DWANT_TESSERACT=OFF -DWANT_CURL=OFF \
            -DWANT_GLFW=OFF -DWANT_GUMBO=OFF \
            -DWANT_PKCS7=OFF -DWANT_ZXING=OFF \
            -G Ninja 2>&1 | tail -15
      if cmake --build "$MUPDF_BUILD_DIR" --parallel "$(nproc)" 2>&1 | tail -20; then
        MUPDF_SO=$(find "$MUPDF_BUILD_DIR" -name 'libmupdf.so' 2>/dev/null | head -1 || true)
        MUPDF_A_CMAKE=$(find "$MUPDF_BUILD_DIR" -name 'libmupdf.a' 2>/dev/null | head -1 || true)
      fi
      set -e
    else
      echo "→ CMakeLists.txt নেই — GNU Make পদ্ধতিতে যাচ্ছে।"
    fi

    # ── পদ্ধতি B: CMake static .a → .so রূপান্তর ─────────────────────────────
    if [[ -z "$MUPDF_SO" && -n "${MUPDF_A_CMAKE:-}" ]]; then
      echo "→ পদ্ধতি B: CMake static archive থেকে shared .so তৈরি করছে..."
      MUPDF_THIRD_A=$(find "$SRC_ROOT/mupdf-cmake-build-$ABI" -name 'libmupdf-third*.a' 2>/dev/null | head -1 || true)
      mkdir -p "$THIRD_PARTY/mupdf/libs/$ABI"
      WHOLE_ARGS="$MUPDF_A_CMAKE"
      [[ -n "$MUPDF_THIRD_A" ]] && WHOLE_ARGS="$MUPDF_A_CMAKE $MUPDF_THIRD_A"
      "$CC_ANDROID" -shared \
        -Wl,--whole-archive $WHOLE_ARGS -Wl,--no-whole-archive \
        -Wl,-soname,libmupdf.so \
        -lz -lm -llog -landroid \
        -o "$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
      MUPDF_SO="$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
      echo "MuPDF ✓ (CMake static → shared)"
    fi

    # ── পদ্ধতি C: GNU Make static → .so (fallback) ────────────────────────────
    if [[ -z "$MUPDF_SO" ]]; then
      echo "→ পদ্ধতি C: GNU Make দিয়ে static build করছে..."
      set +e
      make -C "$MUPDF_SRC" \
        HAVE_X11=no HAVE_GLFW=no HAVE_OBJCOPY=no \
        HAVE_TESSERACT=no HAVE_LEPTONICA=no \
        HAVE_CURL=no HAVE_GUMBO=no HAVE_ZXING=no \
        HAVE_LIBCRYPTO=no HAVE_LIBRESSL=no HAVE_ANDROID=yes \
        XCFLAGS="$XCFLAGS_ANDROID" \
        CC="$CC_ANDROID" CXX="$CXX_ANDROID" \
        AR="$AR_ANDROID" RANLIB="$RANLIB_ANDROID" \
        build="$MUPDF_BUILD_TAG" \
        -j"$(nproc)" 2>&1 | tail -40 || true
      set -e

      MUPDF_A=$(find "$MUPDF_SRC/build/${MUPDF_BUILD_TAG}" -name 'libmupdf.a' 2>/dev/null | head -1 || true)
      MUPDF_THIRD_A=$(find "$MUPDF_SRC/build/${MUPDF_BUILD_TAG}" -name 'libmupdf-third.a' 2>/dev/null | head -1 || true)

      if [[ -n "$MUPDF_A" ]]; then
        mkdir -p "$THIRD_PARTY/mupdf/libs/$ABI"
        EXTRA=""
        [[ -n "$MUPDF_THIRD_A" ]] && EXTRA="$MUPDF_THIRD_A"
        "$CC_ANDROID" -shared \
          -Wl,--whole-archive "$MUPDF_A" $EXTRA -Wl,--no-whole-archive \
          -Wl,-soname,libmupdf.so \
          -lz -lm -llog -landroid \
          -o "$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
        MUPDF_SO="$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
        echo "MuPDF ✓ (GNU Make static → shared)"
      fi
    fi

    # ── ফলাফল ─────────────────────────────────────────────────────────────────
    if [[ -n "$MUPDF_SO" ]]; then
      mkdir -p "$THIRD_PARTY/mupdf/libs/$ABI"
      [[ "$MUPDF_SO" != "$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so" ]] && \
        cp -v "$MUPDF_SO" "$THIRD_PARTY/mupdf/libs/$ABI/"
      "$STRIP_ANDROID" --strip-unneeded \
        "$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so" 2>/dev/null || true
      echo "✓ MuPDF ready: $THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
    else
      echo "⚠ WARNING: MuPDF build ব্যর্থ — MuPDF ছাড়াই APK build চলবে।"
    fi
  else
    echo "MuPDF already built for $ABI (skip)"
  fi

done

# ── Headers কপি করো ──────────────────────────────────────────────────────────
echo ""
echo "Copying headers..."
mkdir -p "$THIRD_PARTY/qpdf/include" "$THIRD_PARTY/mupdf/include"
[[ -d "$SRC_ROOT/qpdf/include" ]] && \
  cp -rn "$SRC_ROOT/qpdf/include/." "$THIRD_PARTY/qpdf/include/" 2>/dev/null || true
[[ -d "$MUPDF_SRC/include" ]] && \
  cp -rn "$MUPDF_SRC/include/." "$THIRD_PARTY/mupdf/include/" 2>/dev/null || true

echo ""
echo "══════════════════════════════════════════════════"
echo "DONE. Generated .so files:"
find "$THIRD_PARTY" -name '*.so' -print 2>/dev/null || echo "(none)"
echo "══════════════════════════════════════════════════"
