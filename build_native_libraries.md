# Build Native Libraries (QPDF + MuPDF) for Android (WSL/Linux)

এই গাইডে `mobile/native/` এর জন্য `libqpdf.so` ও `libmupdf.so` তৈরি করার প্রক্রিয়া বর্ণনা করা হয়েছে।

## Why this is needed

- `mobile/native/CMakeLists.txt` এ prebuilt QPDF/MuPDF libs linked করলে `pdfpowertools_native` JNI ব্রিজ কাজ করে।
- এই লাইব্রেরিগুলো সাধারণত প্রি-বিল্ট পাওয়া যায় না, সেক্ষেত্রে NDK দিয়ে নিজেই কম্পাইল করতে হয়।
- Windows-এ C++ ক্রস-কম্পাইল প্রায়ই জটিল; WSL/Ubuntu/VM ভালো অপশন।

## Prerequisites

1. Linux (WSL Ubuntu 22.04+ বা ভার্চুয়াল মেশিন)
2. Git
3. curl / wget
4. unzip
5. Python 3
6. CMake 3.22+
7. Ninja
8. `pkg-config`, `build-essential`

## Directory layout

- `mobile/native/third_party/qpdf/include`
- `mobile/native/third_party/qpdf/libs/<ABI>/libqpdf.so`
- `mobile/native/third_party/mupdf/include`
- `mobile/native/third_party/mupdf/libs/<ABI>/libmupdf.so`

## Quick install

```bash
cd /workspaces/PDF-Reader
bash ./scripts/build_native_libraries.sh
```

---

## What the script does

1. ডাউনলোড করে `Android NDK` (ডিফল্ট: r25b)
2. ক্লোন করে QPDF এবং MuPDF সর্স কোড
3. ARM64-v8a ও x86_64 অ্যাবি-তে build করে `.so` জেনারেট
4. কী অনুসারে `mobile/native/third_party`-এ কপি করে

## Build steps (manual)

1. NDK ডাউনলোড

```bash
export ANDROID_NDK_ROOT="$HOME/Android/Sdk/ndk/25.2.9519653"
```

2. QPDF:

```bash
mkdir -p /tmp/qpdf-build
cd /tmp/qpdf-build
cmake -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-24 -DANDROID_STL=c++_shared \
  -Dqpdf_build_tools=OFF -Dqpdf_build_tests=OFF -Dqpdf_build_examples=OFF \
  -DBUILD_SHARED_LIBS=ON ../qpdf
cmake --build . -- -j$(nproc)

# copy libqpdf.so
cp libqpdf.so /workspaces/PDF-Reader/mobile/native/third_party/qpdf/libs/arm64-v8a/
cp -r ../qpdf/include /workspaces/PDF-Reader/mobile/native/third_party/qpdf/
```

3. MuPDF:

```bash
mkdir -p /tmp/mupdf-build
cd /tmp/mupdf-build
cmake -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_NATIVE_API_LEVEL=24 -DANDROID_STL=c++_shared \
  -DENABLE_LIBMUPDF=ON -DENABLE_WERROR=OFF -DENABLE_SHARED=ON \
  -DENABLE_LOCALE=OFF -DENABLE_FREETYPE=OFF -DENABLE_JBIG2=ON -DENABLE_OPENJPEG=OFF \
  -DENABLE_PDF=ON -DENABLE_PDF_TO_CAIRO=OFF ../mupdf
cmake --build . -- -j$(nproc)

cp platform/android/libmupdf.so /workspaces/PDF-Reader/mobile/native/third_party/mupdf/libs/arm64-v8a/
cp -r ../mupdf/include /workspaces/PDF-Reader/mobile/native/third_party/mupdf/
```

> অভিজ্ঞতা: একই ধরণের কমান্ড x86_64, armeabi-v7a ইত্যাদির জন্য `ANDROID_ABI` পরিবর্তন করেই চালাতে হবে।

---

## Integration

`mobile/native/CMakeLists.txt` এ `third_party` ফোল্ডারের include/lib পাথ থেকে QPDF & MuPDF লিংক করবে।

- `HAS_QPDF=1`, `HAS_MUPDF=1` define করলে বিল্ডে native ফাংশন এনাবল হয়
- না দিলে ফাঁকা স্টাব ফাংশন ব্যবহার করা হয়

## Troubleshooting

- যদি `libqpdf.so` বা `libmupdf.so` না থাকে, আপনিক `isQpdfLinked()/isMupdfLinked()` false দেখবেন
- CMake কনফিগ সহজেই পাথ টাইপো, API লেভেল, NDK ভার্সন, ABI mismatch-এ ব্যর্থ হতে পারে
- `make VERBOSE=1` বা `cmake --build . --verbose` চালান

---

## আপনি কি বাস্তবায়ন করতে পারবেন?

হ্যাঁ, এই রিপোজিটরিতে সম্পূর্ণ রুট-টু-টিপ্ সাপোর্ট দেয়া হয়েছে।
- আমি এখনই `build_native_libraries.md` আর `scripts/build_native_libraries.sh` ফাইল তৈরি করেছি
- আপনি WSL/Linux-এ স্ক্রিপ্ট চালিয়ে আউটপুট `mobile/native/third_party`-এ পাবেন
- তারপর Windows-এ একই ফোল্ডার কপি করে প্রকল্পে বিল্ড চালাতে পারেন

> যদি আপনার কাছে ব্যতিক্রম (যেমন, NDK লিংক ঠিক আছে কিন্তু `qpdf` / `mupdf` সঠিক সো-ফাইল নামে নেই), আমি কমান্ড-আউটপুট দেখে দ্রুত ফিক্স টেমপ্লেট দিতে পারি।
