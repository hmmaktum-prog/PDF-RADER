/**
 * withPdfNdk.js — Expo Config Plugin
 *
 * Configures the Android Gradle project to build our custom native library
 * (libappmodules.so + libpdfpowertools_native.so) via CMake.
 *
 * React Native 0.76+ (New Architecture) requires libappmodules.so to be built
 * by a CMakeLists.txt whose project() name is "appmodules".  Expo's prebuild
 * template already emits an externalNativeBuild block pointing to the
 * generated `src/main/jni/CMakeLists.txt`.  This plugin REPLACES that path
 * with our own CMakeLists.txt (native/CMakeLists.txt) which:
 *   1. includes ReactNative-application.cmake → builds libappmodules.so
 *   2. adds our pdfpowertools_native shared library
 *
 * Key cmake arguments injected:
 *   REACT_ANDROID_DIR    — absolute path to ReactAndroid/ inside node_modules
 *                          (avoids pnpm symlink fragility inside CMake)
 *   PROJECT_BUILD_DIR    — where Gradle writes generated autolinking/codegen
 *                          files that ReactNative-application.cmake reads
 *   ANDROID_STL          — must be c++_shared for React Native
 */

const { withAppBuildGradle, withMainApplication, createRunOncePlugin } = require('@expo/config-plugins');
const pkg = require('../package.json');

const CMAKE_PATH = '../../native/CMakeLists.txt';
const CMAKE_VERSION = '3.18.1+';
const PDF_POWER_TOOLS_NATIVE_PACKAGE = 'PdfPowerToolsPackage';
const PDF_POWER_TOOLS_NATIVE_PACKAGE_IMPORT_JAVA = 'import com.pdfpowertools.native.PdfPowerToolsPackage;';
const PDF_POWER_TOOLS_NATIVE_PACKAGE_IMPORT_KOTLIN = 'import com.pdfpowertools.native.PdfPowerToolsPackage';

/** Resolves react-native like the react { } block — required when node_modules is hoisted to repo root. */
const REACT_NATIVE_DIR_RESOLVER_GROOVY = `
def reactNativeRootDir = new File(
    ["node", "--print", "require.resolve('react-native/package.json')"].execute(null, rootDir).text.trim()
).getParentFile().getAbsoluteFile()
def reactNativeAndroidDir = new File(reactNativeRootDir, "ReactAndroid").absolutePath
def reactNativeAndroidBuildDir = new File(reactNativeRootDir, "ReactAndroid/build").absolutePath
`;

const withCustomNativeBuild = (config) => {
  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    const isKts = cfg.modResults.language === 'kotlin';

    // Ensure Gradle resolves react-native path (fixes EAS + pnpm hoisted deps)
    if (!contents.includes('reactNativeAndroidDir')) {
      if (contents.includes('def projectRoot =')) {
        contents = contents.replace(
          /(def projectRoot = [^\n]+\n)/,
          `$1${REACT_NATIVE_DIR_RESOLVER_GROOVY}\n`
        );
      } else {
        contents = contents.replace(
          /(apply plugin:[^\n]+\n)+/,
          (m) => `${m}${REACT_NATIVE_DIR_RESOLVER_GROOVY}\n`
        );
      }
    }
    // Replace longer path first so .../ReactAndroid/build does not become ...Dir/build
    contents = contents.replace(
      /\$\{rootProject\.projectDir\}\/\.\.\/node_modules\/react-native\/ReactAndroid\/build/g,
      '${reactNativeAndroidBuildDir}'
    );
    contents = contents.replace(
      /\$\{rootProject\.projectDir\}\/\.\.\/node_modules\/react-native\/ReactAndroid/g,
      '${reactNativeAndroidDir}'
    );

    // -----------------------------------------------------------------
    // Guard: skip rest if our path is already present (idempotent)
    // -----------------------------------------------------------------
    if (contents.includes(CMAKE_PATH)) {
      cfg.modResults.contents = contents;
      // Continue to run our Kotlin source-set + MainApplication registration below.
      // (We still want it to be idempotent.)
    } else {
      // cmake argument block — injected into defaultConfig { externalNativeBuild { cmake { ... } } }
      const cmakeArgs = isKts
        ? `cppFlags += "-std=c++20"
                abiFilters += listOf("arm64-v8a", "x86_64")
                arguments += listOf(
                    "-DANDROID_STL=c++_shared",
                    "-DPROJECT_BUILD_DIR=\${projectDir}/build",
                    "-DREACT_ANDROID_DIR=\${reactNativeAndroidDir}",
                    "-DREACT_ANDROID_BUILD_DIR=\${reactNativeAndroidBuildDir}"
                )`
        : `cppFlags "-std=c++20"
                abiFilters "arm64-v8a", "x86_64"
                arguments "-DANDROID_STL=c++_shared",
                          "-DPROJECT_BUILD_DIR=\${projectDir}/build",
                          "-DREACT_ANDROID_DIR=\${reactNativeAndroidDir}",
                          "-DREACT_ANDROID_BUILD_DIR=\${reactNativeAndroidBuildDir}"`;

      // -----------------------------------------------------------------
      // Case A: externalNativeBuild already present (RN 0.76 template)
      //   → replace only the cmake path; inject cmake args into defaultConfig
      // -----------------------------------------------------------------
      if (contents.includes('externalNativeBuild')) {
        // Replace the cmake path inside the top-level externalNativeBuild block
        // Matches both groovy and kotlin syntax variants
        contents = contents.replace(
          /(externalNativeBuild\s*\{[^}]*cmake\s*\{[^}]*)path\s*[=]?\s*["']?([^"'\s}]+)["']?/,
          `$1path ${isKts ? '= ' : ''}"${CMAKE_PATH}"\n            version ${isKts ? '= ' : ''}"${CMAKE_VERSION}"`
        );

        // Inject cmake args into defaultConfig.externalNativeBuild.cmake if not present
        if (!contents.includes('REACT_ANDROID_DIR')) {
          if (isKts) {
            contents = contents.replace(
              /defaultConfig\s*\{/,
              `defaultConfig {
        externalNativeBuild {
            cmake {
                ${cmakeArgs}
            }
        }`
            );
          } else {
            contents = contents.replace(
              /defaultConfig\s*\{/,
              `defaultConfig {
        externalNativeBuild {
            cmake {
                ${cmakeArgs}
            }
        }`
            );
          }
        }

        cfg.modResults.contents = contents;
      } else {
        // -----------------------------------------------------------------
        // Case B: no externalNativeBuild yet — insert full block
        // -----------------------------------------------------------------
        if (isKts) {
          contents = contents.replace(
            /android\s*\{/,
            `android {
    externalNativeBuild {
        cmake {
            path = "${CMAKE_PATH}"
            version = "${CMAKE_VERSION}"
        }
    }
    defaultConfig {
        externalNativeBuild {
            cmake {
                ${cmakeArgs}
            }
        }
    }`
          );
        } else {
          contents = contents.replace(
            /android\s*\{/,
            `android {
    externalNativeBuild {
        cmake {
            path "${CMAKE_PATH}"
            version "${CMAKE_VERSION}"
        }
    }
    defaultConfig {
        externalNativeBuild {
            cmake {
                ${cmakeArgs}
            }
        }
    }`
          );
        }
        cfg.modResults.contents = contents;
      }
    }

    // Ensure Gradle compiles our Kotlin JNI module sources from mobile/native/kotlin
    const kotlinSrcPathToken = '../../native/kotlin';
    if (!contents.includes(kotlinSrcPathToken)) {
      if (isKts) {
        contents = contents.replace(
          /android\s*\{/,
          `android {\n    sourceSets[\"main\"].java.srcDirs += listOf(\"\${projectDir}/../../native/kotlin\")`
        );
      } else {
        contents = contents.replace(
          /android\s*\{/,
          `android {\n    sourceSets { main { java.srcDirs += [\"\${projectDir}/../../native/kotlin\"] } }`
        );
      }
    }

    // Package prebuilt .so files into the APK via jniLibs.srcDirs.
    // This is the most reliable way — Gradle directly copies every *.so it finds
    // under these directories (organised by ABI sub-folder) into the APK's lib/.
    const jniLibsToken = '../../native/third_party/qpdf/libs';
    if (!contents.includes('pdfpowertools_native/libs')) {
      if (isKts) {
        contents = contents.replace(
          /android\s*\{/,
          `android {\n    sourceSets["main"].jniLibs.srcDirs += listOf(\n        "\${projectDir}/../../native/third_party/qpdf/libs",\n        "\${projectDir}/../../native/third_party/mupdf/libs",\n        "\${projectDir}/../../native/third_party/paddle-lite/libs",\n        "\${projectDir}/../../native/third_party/pdfpowertools_native/libs"\n    )`
        );
      } else {
        contents = contents.replace(
          /android\s*\{/,
          `android {\n    sourceSets { main { jniLibs.srcDirs += ["\${projectDir}/../../native/third_party/qpdf/libs", "\${projectDir}/../../native/third_party/mupdf/libs", "\${projectDir}/../../native/third_party/paddle-lite/libs", "\${projectDir}/../../native/third_party/pdfpowertools_native/libs"] } }`
        );
      }
    }

    // Prevent duplicate .so packaging errors when CMake IMPORTED targets and
    // jniLibs.srcDirs both try to include the same library file.
    const packagingToken = 'pickFirst';
    if (!contents.includes('libpdfpowertools_native.so')) {
      if (isKts) {
        contents = contents.replace(
          /android\s*\{/,
          `android {\n    packaging {\n        jniLibs {\n            pickFirsts += listOf(\n                "lib/arm64-v8a/libqpdf.so",\n                "lib/x86_64/libqpdf.so",\n                "lib/arm64-v8a/libmupdf.so",\n                "lib/x86_64/libmupdf.so",\n                "lib/arm64-v8a/libjpeg.so",\n                "lib/x86_64/libjpeg.so",\n                "lib/arm64-v8a/libpaddle_light_api_shared.so",\n                "lib/x86_64/libpaddle_light_api_shared.so",\n                "lib/arm64-v8a/libpdfpowertools_native.so",\n                "lib/x86_64/libpdfpowertools_native.so"\n            )\n        }\n    }`
        );
      } else {
        contents = contents.replace(
          /android\s*\{/,
          `android {\n    packagingOptions {\n        pickFirst 'lib/arm64-v8a/libqpdf.so'\n        pickFirst 'lib/x86_64/libqpdf.so'\n        pickFirst 'lib/arm64-v8a/libmupdf.so'\n        pickFirst 'lib/x86_64/libmupdf.so'\n        pickFirst 'lib/arm64-v8a/libjpeg.so'\n        pickFirst 'lib/x86_64/libjpeg.so'\n        pickFirst 'lib/arm64-v8a/libpaddle_light_api_shared.so'\n        pickFirst 'lib/x86_64/libpaddle_light_api_shared.so'\n        pickFirst 'lib/arm64-v8a/libpdfpowertools_native.so'\n        pickFirst 'lib/x86_64/libpdfpowertools_native.so'\n    }`
        );
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });

  // Register our React Native package in MainApplication.
  // This makes `NativeModules.QPDFBridge` and `NativeModules.MuPDFBridge` available.
  config = withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(PDF_POWER_TOOLS_NATIVE_PACKAGE)) return cfg;

    // Detect language from template markers.
    const isKotlin = contents.includes('override fun getPackages') ||
                     contents.includes('fun getPackages') ||
                     contents.includes('ReactNativeHost =') ||
                     contents.includes('class MainApplication');

    // Add import — insert after the first import line.
    const desiredImport = isKotlin
      ? PDF_POWER_TOOLS_NATIVE_PACKAGE_IMPORT_KOTLIN
      : PDF_POWER_TOOLS_NATIVE_PACKAGE_IMPORT_JAVA;
    if (!contents.includes(desiredImport)) {
      if (contents.includes('import ')) {
        contents = contents.replace(
          /(import\s+[^\n;]+;?\s*\n)/,
          `$1${desiredImport}\n`
        );
      }
    }

    if (isKotlin) {
      const alreadyAdded =
        contents.includes('add(PdfPowerToolsPackage())') ||
        contents.includes('packages.add(PdfPowerToolsPackage())');

      if (!alreadyAdded) {
        // Pattern 1 — Modern Expo 54 / RN 0.76+ template:
        //   PackageList(this).packages.apply { ... }
        if (contents.includes('PackageList(this).packages.apply')) {
          contents = contents.replace(
            /(PackageList\(this\)\.packages\.apply\s*\{)/,
            `$1\n            add(PdfPowerToolsPackage())`
          );
        }
        // Pattern 2 — PackageList without apply block (single-expression)
        else if (contents.includes('PackageList(this).packages')) {
          contents = contents.replace(
            /PackageList\(this\)\.packages/,
            'PackageList(this).packages.apply { add(PdfPowerToolsPackage()) }'
          );
        }
        // Pattern 3 — Old Kotlin template: mutable packages list with return
        else if (/(return packages\s*)[\n\r]/.test(contents)) {
          contents = contents.replace(
            /(return packages\s*)[\n\r]/,
            `packages.add(PdfPowerToolsPackage())\n        $1\n`
          );
        }
      }
    } else {
      // Java template: add before return packages;
      if (!contents.includes('new PdfPowerToolsPackage()')) {
        contents = contents.replace(
          /(return packages\s*;)/,
          `packages.add(new ${PDF_POWER_TOOLS_NATIVE_PACKAGE}());\n    $1`
        );
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
};

module.exports = createRunOncePlugin(withCustomNativeBuild, pkg.name, pkg.version);
