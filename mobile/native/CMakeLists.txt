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

# ── Custom PDF native bridge ─────────────────────────────────────────────────
add_library(
    pdfpowertools_native
    SHARED
    "${CMAKE_CURRENT_SOURCE_DIR}/src/qpdf_bridge.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/mupdf_bridge.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/paddle_ocr_bridge.cpp"
)

find_library(log-lib  log)
find_library(android-lib android)

target_include_directories(pdfpowertools_native PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
)

# ── Prebuilt third-party library locations ───────────────────────────────────
set(PDF_NATIVE_THIRD_PARTY_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party")
set(MUPDF_INCLUDE_DIR "${PDF_NATIVE_THIRD_PARTY_DIR}/mupdf/include")
set(QPDF_INCLUDE_DIR  "${PDF_NATIVE_THIRD_PARTY_DIR}/qpdf/include")
set(MUPDF_LIB_DIR     "${PDF_NATIVE_THIRD_PARTY_DIR}/mupdf/libs/${_PDF_NATIVE_ABI}")
set(QPDF_LIB_DIR      "${PDF_NATIVE_THIRD_PARTY_DIR}/qpdf/libs/${_PDF_NATIVE_ABI}")

# ── MuPDF: declare as IMPORTED SHARED so Gradle packages it into the APK ────
if(EXISTS "${MUPDF_INCLUDE_DIR}" AND EXISTS "${MUPDF_LIB_DIR}/libmupdf.so")
  add_library(mupdf SHARED IMPORTED)
  set_target_properties(mupdf PROPERTIES
      IMPORTED_LOCATION "${MUPDF_LIB_DIR}/libmupdf.so"
  )

  target_include_directories(pdfpowertools_native PRIVATE "${MUPDF_INCLUDE_DIR}")
  target_compile_definitions(pdfpowertools_native PRIVATE HAS_MUPDF=1)
  target_link_libraries(pdfpowertools_native mupdf)
  message(STATUS "MuPDF ENABLED  → ${MUPDF_LIB_DIR}/libmupdf.so")
else()
  message(STATUS "MuPDF NOT FOUND for ABI=${_PDF_NATIVE_ABI} — building stub only")
endif()

# ── QPDF + libjpeg: declare as IMPORTED SHARED so Gradle packages them ───────
if(EXISTS "${QPDF_INCLUDE_DIR}" AND EXISTS "${QPDF_LIB_DIR}/libqpdf.so")
  add_library(qpdf SHARED IMPORTED)
  set_target_properties(qpdf PROPERTIES
      IMPORTED_LOCATION "${QPDF_LIB_DIR}/libqpdf.so"
  )

  # libjpeg.so is a runtime dependency of libqpdf.so — must be in the APK too
  if(EXISTS "${QPDF_LIB_DIR}/libjpeg.so")
    add_library(jpeg SHARED IMPORTED)
    set_target_properties(jpeg PROPERTIES
        IMPORTED_LOCATION "${QPDF_LIB_DIR}/libjpeg.so"
    )
    target_link_libraries(pdfpowertools_native jpeg)
    message(STATUS "libjpeg ENABLED → ${QPDF_LIB_DIR}/libjpeg.so")
  endif()

  target_include_directories(pdfpowertools_native PRIVATE "${QPDF_INCLUDE_DIR}")
  target_compile_definitions(pdfpowertools_native PRIVATE HAS_QPDF=1 POINTERHOLDER_TRANSITION=0)
  target_link_libraries(pdfpowertools_native qpdf)
  message(STATUS "QPDF    ENABLED → ${QPDF_LIB_DIR}/libqpdf.so")
else()
  message(STATUS "QPDF NOT FOUND for ABI=${_PDF_NATIVE_ABI} — building stub only")
endif()

# ── Paddle-Lite: declare as IMPORTED SHARED ───────────────────────────────────
set(PADDLE_INCLUDE_DIR "${PDF_NATIVE_THIRD_PARTY_DIR}/paddle-lite/include")
set(PADDLE_LIB_DIR     "${PDF_NATIVE_THIRD_PARTY_DIR}/paddle-lite/libs/${_PDF_NATIVE_ABI}")

if(EXISTS "${PADDLE_INCLUDE_DIR}" AND EXISTS "${PADDLE_LIB_DIR}/libpaddle_light_api_shared.so")
  add_library(paddle_lite SHARED IMPORTED)
  set_target_properties(paddle_lite PROPERTIES
      IMPORTED_LOCATION "${PADDLE_LIB_DIR}/libpaddle_light_api_shared.so"
  )

  target_include_directories(pdfpowertools_native PRIVATE "${PADDLE_INCLUDE_DIR}")
  target_compile_definitions(pdfpowertools_native PRIVATE HAS_PADDLE=1)
  target_link_libraries(pdfpowertools_native paddle_lite)
  message(STATUS "Paddle-Lite ENABLED → ${PADDLE_LIB_DIR}/libpaddle_light_api_shared.so")
else()
  message(STATUS "Paddle-Lite NOT FOUND for ABI=${_PDF_NATIVE_ABI} — building stub only")
endif()

target_link_libraries(
    pdfpowertools_native
    ${log-lib}
    ${android-lib}
)
