#!/usr/bin/env bash
set -euo pipefail

# build_mupdf_only.sh
# MuPDF 1.27.2 শুধুমাত্র Android এর জন্য GNU Make দিয়ে build করে।
# Output: mobile/native/third_party/mupdf/libs/{arm64-v8a,x86_64}/libmupdf.so

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
NDK_VERSION="25.2.9519653"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-$HOME/Android/Sdk/ndk/$NDK_VERSION}"
ANDROID_API=24
ABIS=(arm64-v8a x86_64)
SRC_ROOT="$WORKSPACE/.native_src"
THIRD_PARTY="$WORKSPACE/mobile/native/third_party"
MUPDF_VERSION="1.27.2"
MUPDF_SRC="$SRC_ROOT/mupdf-${MUPDF_VERSION}-source"

echo "=== MuPDF Android Builder ==="
echo "NDK: $ANDROID_NDK_ROOT"
echo "Workspace: $WORKSPACE"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: Linux required." >&2; exit 1
fi

# ── NDK Download ─────────────────────────────────────────────────────────────
if [[ ! -d "$ANDROID_NDK_ROOT" ]]; then
  echo ""
  echo "── Android NDK r25b Downloading (~730 MB) ──"
  mkdir -p "$HOME/Android/Sdk/ndk"
  curl -L --progress-bar -o /tmp/ndk.zip \
    "https://dl.google.com/android/repository/android-ndk-r25b-linux.zip"
  echo "Extracting NDK..."
  unzip -q /tmp/ndk.zip -d "$HOME/Android/Sdk/ndk"
  mv "$HOME/Android/Sdk/ndk/android-ndk-r25b" "$ANDROID_NDK_ROOT"
  rm -f /tmp/ndk.zip
  echo "NDK ready: $ANDROID_NDK_ROOT"
fi

# ── MuPDF Source ──────────────────────────────────────────────────────────────
mkdir -p "$SRC_ROOT" "$THIRD_PARTY/mupdf/libs"

if [[ ! -d "$MUPDF_SRC/.git" ]]; then
  [[ -d "$MUPDF_SRC" ]] && rm -rf "$MUPDF_SRC"
  echo ""
  echo "── MuPDF $MUPDF_VERSION Cloning (with submodules) ──"
  git clone --depth 1 --branch "$MUPDF_VERSION" \
    --recurse-submodules --shallow-submodules \
    https://github.com/ArtifexSoftware/mupdf.git \
    "$MUPDF_SRC"
  echo "MuPDF source ready."
else
  echo "MuPDF source already present."
fi

# ── Per-ABI Build ─────────────────────────────────────────────────────────────
CLANG_DIR="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin"

for ABI in "${ABIS[@]}"; do
  echo ""
  echo "══ ABI: $ABI ══════════════════════════════════════"

  OUT_SO="$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
  if [[ -f "$OUT_SO" ]]; then
    echo "Already built — skip."
    continue
  fi

  case "$ABI" in
    arm64-v8a) TRIPLE="aarch64-linux-android" ;;
    x86_64)    TRIPLE="x86_64-linux-android" ;;
  esac

  CC_ANDROID="${CLANG_DIR}/${TRIPLE}${ANDROID_API}-clang"
  CXX_ANDROID="${CLANG_DIR}/${TRIPLE}${ANDROID_API}-clang++"
  AR_ANDROID="${CLANG_DIR}/llvm-ar"
  RANLIB_ANDROID="${CLANG_DIR}/llvm-ranlib"
  STRIP_ANDROID="${CLANG_DIR}/llvm-strip"

  BUILD_TAG="release-${ABI}"
  MUPDF_SO=""

  # ── পদ্ধতি A: GNU Make দিয়ে shared library ──────────────────────────────
  echo "→ GNU Make (shared) build চেষ্টা করছে..."
  set +e
  make -C "$MUPDF_SRC" \
    OS=android \
    HAVE_X11=no HAVE_GLFW=no HAVE_OBJCOPY=no \
    HAVE_TESSERACT=no HAVE_LEPTONICA=no \
    HAVE_CURL=no HAVE_GUMBO=no \
    HAVE_LIBCRYPTO=no \
    CC="$CC_ANDROID" CXX="$CXX_ANDROID" AR="$AR_ANDROID" \
    RANLIB="$RANLIB_ANDROID" \
    build="$BUILD_TAG" shared=yes \
    -j"$(nproc)" 2>&1 | tail -20
  set -e

  MUPDF_SO=$(find "$MUPDF_SRC/build/${BUILD_TAG}" -name 'libmupdf.so' 2>/dev/null | head -1 || true)

  # ── পদ্ধতি B: static .a → shared .so ─────────────────────────────────────
  if [[ -z "$MUPDF_SO" ]]; then
    echo "→ static build → shared .so রূপান্তর চেষ্টা করছে..."
    set +e
    make -C "$MUPDF_SRC" \
      OS=android \
      HAVE_X11=no HAVE_GLFW=no HAVE_OBJCOPY=no \
      HAVE_TESSERACT=no HAVE_LEPTONICA=no \
      HAVE_CURL=no HAVE_GUMBO=no \
      HAVE_LIBCRYPTO=no \
      CC="$CC_ANDROID" CXX="$CXX_ANDROID" AR="$AR_ANDROID" \
      RANLIB="$RANLIB_ANDROID" \
      build="$BUILD_TAG" \
      -j"$(nproc)" 2>&1 | tail -20
    set -e

    MUPDF_A=$(find "$MUPDF_SRC/build/${BUILD_TAG}" -name 'libmupdf.a' 2>/dev/null | head -1 || true)
    MUPDF_THIRD_A=$(find "$MUPDF_SRC/build/${BUILD_TAG}" -name 'libmupdf-third.a' 2>/dev/null | head -1 || true)

    if [[ -n "$MUPDF_A" ]]; then
      mkdir -p "$THIRD_PARTY/mupdf/libs/$ABI"
      EXTRA_ARCHIVES=""
      [[ -n "$MUPDF_THIRD_A" ]] && EXTRA_ARCHIVES="$MUPDF_THIRD_A"
      "$CC_ANDROID" -shared \
        -Wl,--whole-archive "$MUPDF_A" $EXTRA_ARCHIVES -Wl,--no-whole-archive \
        -Wl,-soname,libmupdf.so \
        -lz -lm -llog -landroid \
        -o "$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
      MUPDF_SO="$THIRD_PARTY/mupdf/libs/$ABI/libmupdf.so"
      echo "MuPDF ✓ (static → shared)"
    fi
  fi

  if [[ -n "$MUPDF_SO" ]]; then
    mkdir -p "$THIRD_PARTY/mupdf/libs/$ABI"
    [[ "$MUPDF_SO" != "$OUT_SO" ]] && cp -v "$MUPDF_SO" "$OUT_SO"
    "$STRIP_ANDROID" --strip-unneeded "$OUT_SO" 2>/dev/null || true
    SIZE=$(du -sh "$OUT_SO" | cut -f1)
    echo "✓ MuPDF ready: $OUT_SO ($SIZE)"
  else
    echo "✗ ERROR: MuPDF build ব্যর্থ হয়েছে ABI=$ABI এর জন্য!" >&2
    exit 1
  fi
done

echo ""
echo "══════════════════════════════════════════════════"
echo "DONE! Generated .so files:"
find "$THIRD_PARTY/mupdf/libs" -name '*.so' | sort
echo "══════════════════════════════════════════════════"
