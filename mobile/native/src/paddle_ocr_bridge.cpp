#include <jni.h>
#include <string>
#include <vector>
#include <memory>
#include <android/log.h>

#define LOG_TAG "PaddleOCR_Native"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#ifdef HAS_PADDLE
#include "paddle_api.h"
using namespace paddle::lite_api;
static std::shared_ptr<PaddlePredictor> g_predictor = nullptr;
#endif

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pdfpowertools_app_PaddleOCRBridgeModule_nativeInit(
        JNIEnv* env,
        jobject /* this */,
        jstring modelPath,
        jstring labelPath) {
#ifdef HAS_PADDLE
    try {
        const char* model_path = env->GetStringUTFChars(modelPath, nullptr);
        MobileConfig config;
        config.set_model_from_file(std::string(model_path));
        config.set_power_mode(PowerMode::LITE_POWER_HIGH);
        config.set_threads(4);
        
        g_predictor = CreatePaddlePredictor<MobileConfig>(config);
        
        env->ReleaseStringUTFChars(modelPath, model_path);
        LOGI("Paddle-Lite engine initialized successfully.");
        return JNI_TRUE;
    } catch (const std::exception& e) {
        LOGE("Paddle-Lite Init Error: %s", e.what());
        return JNI_FALSE;
    }
#else
    LOGE("Paddle-Lite engine NOT LINKED.");
    return JNI_FALSE;
#endif
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_app_PaddleOCRBridgeModule_nativeRecognizeImage(
        JNIEnv* env,
        jobject /* this */,
        jstring imagePath,
        jstring language) {
#ifdef HAS_PADDLE
    if (!g_predictor) {
        return env->NewStringUTF("Error: Engine not initialized");
    }
    // High-level: In a real implementation, we would decode the image,
    // prepare tensor inputs, run predictor, and decode results.
    // For now, we return a success indicator.
    return env->NewStringUTF("Success: Paddle-Lite inference mock [Link-Ready]");
#else
    const char* lang = env->GetStringUTFChars(language, nullptr);
    std::string msg = "[Offline engine not link-ready] Language: ";
    msg += lang;
    env->ReleaseStringUTFChars(language, lang);
    return env->NewStringUTF(msg.c_str());
#endif
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pdfpowertools_app_PaddleOCRBridgeModule_nativeIsModelLoaded(
        JNIEnv* env,
        jobject /* this */,
        jstring /* language */) {
#ifdef HAS_PADDLE
    return g_predictor != nullptr ? JNI_TRUE : JNI_FALSE;
#else
    return JNI_FALSE;
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_pdfpowertools_app_PaddleOCRBridgeModule_nativeRelease(
        JNIEnv* env,
        jobject /* this */) {
#ifdef HAS_PADDLE
    g_predictor = nullptr;
    LOGI("Paddle-Lite engine released.");
#endif
}
