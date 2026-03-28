cmake_minimum_required(VERSION 3.13)

# Project name MUST be "appmodules" — CMake creates lib<name>.so, and React
# Native New Architecture requires libappmodules.so to register TurboModules
# (including PlatformConstants, DevSettings, etc.).
project(appmodules)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── Locate ReactAndroid cmake utilities ──────────────────────────────────────
if(NOT DEFINED REACT_ANDROID_DIR OR REACT_ANDROID_DIR STREQUAL "")
  set(_RN_LOCAL "${CMAKE_CURRENT_SOURCE_DIR}/../node_modules/react-native/ReactAndroid")
  set(_RN_HOISTED "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/react-native/ReactAndroid")
  if(EXISTS "${_RN_LOCAL}/cmake-utils/ReactNative-application.cmake")
    set(REACT_ANDROID_DIR "${_RN_LOCAL}")
  elseif(EXISTS "${_RN_HOISTED}/cmake-utils/ReactNative-application.cmake")
    set(REACT_ANDROID_DIR "${_RN_HOISTED}")
  else()
    set(REACT_ANDROID_DIR "${_RN_LOCAL}")
  endif()
endif()

message(STATUS "REACT_ANDROID_DIR = ${REACT_ANDROID_DIR}")
message(STATUS "PROJECT_BUILD_DIR  = ${PROJECT_BUILD_DIR}")
message(STATUS "ANDROID_ABI = ${ANDROID_ABI}")
message(STATUS "CMAKE_ANDROID_ARCH_ABI = ${CMAKE_ANDROID_ARCH_ABI}")

# Android Gradle/NDK toolchain কখনও কখনও `ANDROID_ABI` ভ্যারিয়েবল খালি রাখতে পারে,
# কিন্তু CMake সবসময় `CMAKE_ANDROID_ARCH_ABI` সেট করে।
set(_PDF_NATIVE_ABI "")
if(DEFINED CMAKE_ANDROID_ARCH_ABI AND NOT "${CMAKE_ANDROID_ARCH_ABI}" STREQUAL "")
  set(_PDF_NATIVE_ABI "${CMAKE_ANDROID_ARCH_ABI}")
elseif(DEFINED ANDROID_ABI AND NOT "${ANDROID_ABI}" STREQUAL "")
  set(_PDF_NATIVE_ABI "${ANDROID_ABI}")
endif()

# ── Build libappmodules.so (New Architecture requirement) ────────────────────
include("${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake")

# ── Custom PDF native bridge has been moved to GitHub Actions `build-native-libs.yml` ──
# The `libpdfpowertools_native.so`, `libqpdf.so`, `libmupdf.so`, and `libpaddle_light_api_shared.so`
# are now prebuilt and packaged automatically by Gradle via jniLibs.srcDirs (configured in withPdfNdk.js).
# This CMakeLists.txt is kept minimal solely to bootstrap React Native's New Architecture `libappmodules.so`.

