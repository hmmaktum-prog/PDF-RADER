/**
 * paddle_ocr_bridge.cpp — সম্পূর্ণ PP-OCRv5 pipeline
 *
 *  ১. PP-OCRv5 Detection  — DBNet আর্কিটেকচার (text region bounding boxes)
 *  ২. PP-OCRv5 Recognition — SVTR/CRNN + CTC decode (text string)
 *  ৩. PP-Structure v2     — Layout analysis (heuristic + optional model)
 *  ৪. Key Information Extraction — regex-based post-processing
 *
 * JNI naming: Java_com_pdfpowertools_native_PaddleOCRBridge_<method>
 * Image data: Kotlin/Java decodes Bitmap → ByteArray (ARGB_8888) → pass here
 */

#include <jni.h>
#include <string>
#include <vector>
#include <memory>
#include <cmath>
#include <algorithm>
#include <sstream>
#include <regex>
#include <android/log.h>

#define LOG_TAG "PaddleOCR"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#ifdef HAS_PADDLE
#include "paddle_api.h"
using namespace paddle::lite_api;
#endif

/* ═══════════════════════ Utility ═══════════════════════════════ */

static std::string jstr(JNIEnv* env, jstring s) {
    if (!s) return "";
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string r(c ? c : "");
    env->ReleaseStringUTFChars(s, c);
    return r;
}

static std::string jsonEsc(const std::string& s) {
    std::string o;
    o.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\r': o += "\\r";  break;
            case '\t': o += "\\t";  break;
            default:
                if (c < 0x20) { char b[8]; snprintf(b,sizeof(b),"\\u%04x",c); o+=b; }
                else o += (char)c;
        }
    }
    return o;
}

/* ═══════════════════════ Image structs ═════════════════════════ */

struct RGBAImg {
    std::vector<uint8_t> data; // Android ARGB_8888: per pixel = A R G B (4 bytes)
    int w = 0, h = 0;
};

struct FloatImg {
    std::vector<float> data; // CHW, BGR order
    int w = 0, h = 0, c = 3;
};

/* ═══════════════════════ Resize (nearest-neighbour) ═══════════ */

static RGBAImg resize(const RGBAImg& src, int nw, int nh) {
    RGBAImg dst; dst.w = nw; dst.h = nh; dst.data.resize(nw * nh * 4);
    float sx = (float)src.w / nw, sy = (float)src.h / nh;
    for (int y = 0; y < nh; ++y) {
        int sy_ = std::min((int)(y * sy), src.h - 1);
        for (int x = 0; x < nw; ++x) {
            int sx_ = std::min((int)(x * sx), src.w - 1);
            int di  = (y * nw + x) * 4;
            int si  = (sy_ * src.w + sx_) * 4;
            dst.data[di]   = src.data[si];
            dst.data[di+1] = src.data[si+1];
            dst.data[di+2] = src.data[si+2];
            dst.data[di+3] = src.data[si+3];
        }
    }
    return dst;
}

/* ═══════════════════════ Preprocessing ════════════════════════ */

// Detection: longest side → maxLen, divisible by 32, CHW BGR
// mean=[0.485,0.456,0.406] std=[0.229,0.224,0.225]
static FloatImg prepDet(const RGBAImg& src, int maxLen = 736) {
    float ratio = (float)maxLen / std::max(src.w, src.h);
    int nw = std::max(32, (int)std::round(src.w * ratio / 32) * 32);
    int nh = std::max(32, (int)std::round(src.h * ratio / 32) * 32);
    RGBAImg r = resize(src, nw, nh);
    FloatImg o; o.w = nw; o.h = nh; o.c = 3; o.data.resize(3 * nw * nh);
    const float mB=0.406f,mG=0.456f,mR=0.485f,sB=0.225f,sG=0.224f,sR=0.229f;
    for (int y = 0; y < nh; ++y)
        for (int x = 0; x < nw; ++x) {
            int i = (y*nw+x)*4;
            float fR = r.data[i+1]/255.f, fG = r.data[i+2]/255.f, fB = r.data[i+3]/255.f;
            o.data[0*nh*nw + y*nw+x] = (fB-mB)/sB;
            o.data[1*nh*nw + y*nw+x] = (fG-mG)/sG;
            o.data[2*nh*nw + y*nw+x] = (fR-mR)/sR;
        }
    return o;
}

// Recognition: h=48, max-w=960, CHW BGR, mean=0.5 std=0.5
static FloatImg prepRec(const RGBAImg& src) {
    const int tH = 48;
    int nw = std::min((int)(src.w * (float)tH / src.h), 960);
    int nh = tH;
    RGBAImg r = resize(src, nw, nh);
    FloatImg o; o.w = nw; o.h = nh; o.c = 3; o.data.resize(3 * nw * nh);
    for (int y = 0; y < nh; ++y)
        for (int x = 0; x < nw; ++x) {
            int i = (y*nw+x)*4;
            float fR = r.data[i+1]/255.f, fG = r.data[i+2]/255.f, fB = r.data[i+3]/255.f;
            o.data[0*nh*nw + y*nw+x] = (fB-0.5f)/0.5f;
            o.data[1*nh*nw + y*nw+x] = (fG-0.5f)/0.5f;
            o.data[2*nh*nw + y*nw+x] = (fR-0.5f)/0.5f;
        }
    return o;
}

/* ═══════════════════════ DBNet post-process ════════════════════ */

struct Box { int x1,y1,x2,y2; float score; };

static std::vector<Box> postprocessDBNet(
        const float* map, int mH, int mW,
        int origW, int origH,
        float thr=0.3f, float boxThr=0.5f, float unclip=1.6f) {

    std::vector<bool> bin(mH*mW);
    for (int i = 0; i < mH*mW; ++i) bin[i] = map[i] > thr;

    std::vector<int> label(mH*mW, 0);
    int nextL = 1;
    std::vector<Box> boxes;

    for (int y = 0; y < mH; ++y)
        for (int x = 0; x < mW; ++x) {
            if (!bin[y*mW+x] || label[y*mW+x]) continue;
            int lbl = nextL++;
            int mnX=x,mxX=x,mnY=y,mxY=y;
            float sc=0; int cnt=0;
            std::vector<std::pair<int,int>> stk = {{y,x}};
            label[y*mW+x] = lbl;
            while (!stk.empty()) {
                auto [cy,cx] = stk.back(); stk.pop_back();
                sc += map[cy*mW+cx]; cnt++;
                mnX=std::min(mnX,cx); mxX=std::max(mxX,cx);
                mnY=std::min(mnY,cy); mxY=std::max(mxY,cy);
                const int dx[]={-1,1,0,0}, dy[]={0,0,-1,1};
                for (int d=0;d<4;d++) {
                    int nx=cx+dx[d], ny=cy+dy[d];
                    if (nx<0||nx>=mW||ny<0||ny>=mH) continue;
                    if (!bin[ny*mW+nx]||label[ny*mW+nx]) continue;
                    label[ny*mW+nx]=lbl; stk.push_back({ny,nx});
                }
            }
            if (cnt < 10 || sc/cnt < boxThr) continue;
            float bw=(mxX-mnX+1)*unclip, bh=(mxY-mnY+1)*unclip;
            float cx2=(mnX+mxX)/2.f, cy2=(mnY+mxY)/2.f;
            float sx=(float)origW/mW, sy=(float)origH/mH;
            Box b;
            b.x1=std::max(0,(int)((cx2-bw/2)*sx));
            b.y1=std::max(0,(int)((cy2-bh/2)*sy));
            b.x2=std::min(origW-1,(int)((cx2+bw/2)*sx));
            b.y2=std::min(origH-1,(int)((cy2+bh/2)*sy));
            b.score=sc/cnt;
            boxes.push_back(b);
        }

    std::sort(boxes.begin(),boxes.end(),[](const Box& a,const Box& b){
        return abs(a.y1-b.y1)>10 ? a.y1<b.y1 : a.x1<b.x1;
    });
    return boxes;
}

/* ═══════════════════════ CTC decode ════════════════════════════ */

static std::vector<std::string> makeDictFromContent(const std::string& s) {
    std::vector<std::string> d;
    std::istringstream ss(s); std::string ln;
    while (std::getline(ss, ln)) {
        if (!ln.empty() && ln.back()=='\r') ln.pop_back();
        if (!ln.empty()) d.push_back(ln);
    }
    return d;
}

static std::vector<std::string> defaultEnDict() {
    const char* chars =
        " !\"#$%&'()*+,-./0123456789:;<=>?@"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
        "abcdefghijklmnopqrstuvwxyz{|}~";
    std::vector<std::string> d;
    for (const char* p=chars; *p; p++) d.push_back(std::string(1,*p));
    return d;
}

static std::pair<std::string,float> ctcDecode(
        const float* logits, int T, int C,
        const std::vector<std::string>& dict) {
    std::string txt; int prev=-1; float conf=0; int cnt=0;
    for (int t=0;t<T;t++) {
        const float* row=logits+t*C;
        int best=0; float bv=row[0];
        for (int c=1;c<C;c++) if (row[c]>bv){bv=row[c];best=c;}
        conf+=bv; cnt++;
        if (best!=prev) {
            prev=best;
            if (best>0 && best-1<(int)dict.size()) txt+=dict[best-1];
        }
    }
    return {txt, cnt>0?conf/cnt:0.f};
}

/* ═══════════════════════ Crop region ══════════════════════════ */

static RGBAImg crop(const RGBAImg& src, const Box& b) {
    int x1=std::max(0,b.x1),y1=std::max(0,b.y1);
    int x2=std::min(src.w-1,b.x2),y2=std::min(src.h-1,b.y2);
    int cw=x2-x1+1,ch=y2-y1+1;
    if (cw<=0||ch<=0) return {};
    RGBAImg out; out.w=cw; out.h=ch; out.data.resize(cw*ch*4);
    for (int y=0;y<ch;y++)
        for (int x=0;x<cw;x++) {
            int si=((y1+y)*src.w+(x1+x))*4;
            int di=(y*cw+x)*4;
            out.data[di]=src.data[si]; out.data[di+1]=src.data[si+1];
            out.data[di+2]=src.data[si+2]; out.data[di+3]=src.data[si+3];
        }
    return out;
}

/* ═══════════════════════ PP-Structure layout heuristics ════════ */

struct LayoutBlock {
    int x1,y1,x2,y2;
    std::string type, text;
    float confidence;
};

static std::vector<LayoutBlock> analyzeLayout(
        const std::vector<std::pair<Box,std::string>>& ocr,
        int imgW, int imgH) {
    std::vector<LayoutBlock> blocks;
    for (auto& [b,t] : ocr) {
        LayoutBlock lb;
        lb.x1=b.x1; lb.y1=b.y1; lb.x2=b.x2; lb.y2=b.y2;
        lb.text=t; lb.confidence=b.score;
        float ry=(float)b.y1/imgH, rw=(float)(b.x2-b.x1)/imgW;
        float bh=(float)(b.y2-b.y1);
        // Heuristic layout classification
        if      (ry < 0.08f)                              lb.type="header";
        else if (ry > 0.92f)                              lb.type="footer";
        else if (bh > imgH*0.05f && rw > 0.3f)           lb.type="title";
        else if (bh > imgH*0.035f)                        lb.type="heading";
        else if (rw > 0.10f && rw < 0.35f && bh < 30)    lb.type="table_cell";
        else                                              lb.type="text";
        blocks.push_back(lb);
    }
    return blocks;
}

/* ═══════════════════════ Key Information Extraction ════════════ */

static std::string extractKIE(const std::string& txt) {
    auto regexFind = [&](const std::string& pat,
                         std::regex::flag_type flags = std::regex::ECMAScript)
            -> std::vector<std::string> {
        std::vector<std::string> res;
        try {
            std::regex re(pat, flags);
            for (auto it = std::sregex_iterator(txt.begin(),txt.end(),re);
                 it != std::sregex_iterator(); ++it)
                res.push_back((*it)[it->size()>1 ? 1 : 0].str());
        } catch(...) {}
        return res;
    };

    auto capture1 = [&](const std::string& pat,
                        std::regex::flag_type flags = std::regex::icase)
            -> std::vector<std::string> {
        std::vector<std::string> res;
        try {
            std::regex re(pat, flags);
            for (auto it = std::sregex_iterator(txt.begin(),txt.end(),re);
                 it != std::sregex_iterator(); ++it)
                if (it->size() > 1) res.push_back((*it)[1].str());
        } catch(...) {}
        return res;
    };

    // Build JSON
    std::ostringstream j;
    j << "{";

    // Dates
    auto dates = regexFind(R"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})");
    auto dates2 = regexFind(R"(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})");
    dates.insert(dates.end(), dates2.begin(), dates2.end());
    j << "\"dates\":[";
    for (size_t i=0;i<dates.size();i++){if(i)j<<","; j<<"\""<<jsonEsc(dates[i])<<"\"";}
    j << "]";

    // Amounts / Prices
    auto amounts = regexFind(R"([$€£৳¥₹]?\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?)");
    std::vector<std::string> validAmounts;
    for (auto& a : amounts) {
        bool hasDigit = false;
        for (char c : a) if (isdigit((unsigned char)c)){hasDigit=true;break;}
        if (hasDigit) validAmounts.push_back(a);
    }
    j << ",\"amounts\":[";
    for (size_t i=0;i<validAmounts.size();i++){if(i)j<<","; j<<"\""<<jsonEsc(validAmounts[i])<<"\"";}
    j << "]";

    // Invoice / Reference numbers
    auto refs = capture1(
        R"((?:invoice|inv|ref|order|no|number|id|receipt|bill)[:\s#\.]*([A-Z0-9\-]{4,20}))");
    j << ",\"referenceNumbers\":[";
    for (size_t i=0;i<refs.size();i++){if(i)j<<","; j<<"\""<<jsonEsc(refs[i])<<"\"";}
    j << "]";

    // Emails
    auto emails = regexFind(R"([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})");
    j << ",\"emails\":[";
    for (size_t i=0;i<emails.size();i++){if(i)j<<","; j<<"\""<<jsonEsc(emails[i])<<"\"";}
    j << "]";

    // Phone numbers (min 7 digits)
    auto phones = regexFind(
        R"((?:\+?\d{1,3}[\s\-]?)?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4})");
    std::vector<std::string> validPhones;
    for (auto& p : phones) {
        int d=0; for (char c:p) if(isdigit((unsigned char)c)) d++;
        if (d>=7) validPhones.push_back(p);
    }
    j << ",\"phones\":[";
    for (size_t i=0;i<validPhones.size();i++){if(i)j<<","; j<<"\""<<jsonEsc(validPhones[i])<<"\"";}
    j << "]";

    // Website / URL
    auto urls = regexFind(
        R"((?:https?://|www\.)[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(?:/[^\s]*)?)");
    j << ",\"urls\":[";
    for (size_t i=0;i<urls.size();i++){if(i)j<<","; j<<"\""<<jsonEsc(urls[i])<<"\"";}
    j << "]";

    j << "}";
    return j.str();
}

/* ═══════════════════════ Engine state ═════════════════════════ */

#ifdef HAS_PADDLE
struct OCREngine {
    std::shared_ptr<PaddlePredictor> det, rec;
    std::vector<std::string> dict;
    std::string lang;
    bool ready = false;
};
static OCREngine g_eng;

static std::shared_ptr<PaddlePredictor> loadPredictor(const std::string& path) {
    try {
        MobileConfig cfg;
        cfg.set_model_from_file(path);
        cfg.set_power_mode(PowerMode::LITE_POWER_HIGH);
        cfg.set_threads(4);
        return CreatePaddlePredictor<MobileConfig>(cfg);
    } catch(const std::exception& e) {
        LOGE("loadPredictor: %s — %s", path.c_str(), e.what());
        return nullptr;
    }
}

static std::vector<Box> runDet(const RGBAImg& img) {
    if (!g_eng.det) return {};
    FloatImg in = prepDet(img);
    auto t = g_eng.det->GetInput(0);
    t->Resize({1,3,in.h,in.w});
    float* d = t->mutable_data<float>();
    std::copy(in.data.begin(), in.data.end(), d);
    g_eng.det->Run();
    auto o = g_eng.det->GetOutput(0);
    auto sh = o->shape();
    int mH=(int)sh[2], mW=(int)sh[3];
    return postprocessDBNet(o->data<float>(), mH, mW, img.w, img.h);
}

static std::pair<std::string,float> runRec(const RGBAImg& reg) {
    if (!g_eng.rec || reg.w==0 || reg.h==0) return {"",0.f};
    FloatImg in = prepRec(reg);
    auto t = g_eng.rec->GetInput(0);
    t->Resize({1,3,in.h,in.w});
    float* d = t->mutable_data<float>();
    std::copy(in.data.begin(), in.data.end(), d);
    g_eng.rec->Run();
    auto o = g_eng.rec->GetOutput(0);
    auto sh = o->shape();
    return ctcDecode(o->data<float>(), (int)sh[1], (int)sh[2], g_eng.dict);
}
#endif

/* ═══════════════════════ JNI helpers ══════════════════════════ */

static RGBAImg imgFromBytes(JNIEnv* env, jbyteArray arr, int w, int h) {
    RGBAImg img; img.w=w; img.h=h;
    jsize len = env->GetArrayLength(arr);
    img.data.resize(len);
    env->GetByteArrayRegion(arr, 0, len, reinterpret_cast<jbyte*>(img.data.data()));
    return img;
}

/* ═══════════════════════════ JNI EXPORTS ═══════════════════════
 *
 *  1. initEngine       — load det + rec models
 *  2. isEngineReady    — health check
 *  3. releaseEngine    — free memory
 *  4. recognizeFromRGBA — full pipeline (det → rec → layout → KIE)
 *  5. detectOnly       — detection boxes only
 *  6. extractKIE       — KIE on plain text (no image needed)
 *  7. isPaddleLinked   — compile-time library check
 *
 * ═══════════════════════════════════════════════════════════════ */

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_initEngine(
        JNIEnv* env, jobject,
        jstring jDet, jstring jRec, jstring jDict, jstring jLang) {
#ifdef HAS_PADDLE
    try {
        std::string det  = jstr(env,jDet);
        std::string rec  = jstr(env,jRec);
        std::string dict = jstr(env,jDict);
        std::string lang = jstr(env,jLang);
        g_eng.det  = loadPredictor(det);
        if (!g_eng.det) { LOGE("Det model load failed: %s", det.c_str()); return JNI_FALSE; }
        g_eng.rec  = loadPredictor(rec);
        if (!g_eng.rec) { LOGE("Rec model load failed: %s", rec.c_str()); return JNI_FALSE; }
        g_eng.dict = dict.empty() ? defaultEnDict() : makeDictFromContent(dict);
        g_eng.lang = lang;
        g_eng.ready = true;
        LOGI("Engine ready: lang=%s dict=%zu", lang.c_str(), g_eng.dict.size());
        return JNI_TRUE;
    } catch(const std::exception& e) {
        LOGE("initEngine: %s", e.what()); return JNI_FALSE;
    }
#else
    LOGI("Paddle-Lite NOT linked"); return JNI_FALSE;
#endif
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_isEngineReady(
        JNIEnv*, jobject) {
#ifdef HAS_PADDLE
    return g_eng.ready ? JNI_TRUE : JNI_FALSE;
#else
    return JNI_FALSE;
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_releaseEngine(
        JNIEnv*, jobject) {
#ifdef HAS_PADDLE
    g_eng.det.reset(); g_eng.rec.reset();
    g_eng.dict.clear(); g_eng.ready = false;
    LOGI("Engine released.");
#endif
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_recognizeFromRGBA(
        JNIEnv* env, jobject,
        jbyteArray jRgba, jint w, jint h,
        jboolean runKIE) {
#ifdef HAS_PADDLE
    if (!g_eng.ready)
        return env->NewStringUTF(
            "{\"success\":false,\"error\":\"Engine not initialized\","
            "\"boxes\":[],\"fullText\":\"\",\"keyInfo\":{}}");

    RGBAImg img = imgFromBytes(env, jRgba, w, h);

    // ── Detection ──────────────────────────────────────────────
    std::vector<Box> boxes = runDet(img);
    LOGI("Detection: %zu regions found", boxes.size());

    // ── Recognition ────────────────────────────────────────────
    std::vector<std::pair<Box,std::string>> ocr;
    std::string fullText;
    for (auto& b : boxes) {
        RGBAImg reg = crop(img, b);
        auto [txt, conf] = runRec(reg);
        ocr.push_back({b, txt});
        if (!txt.empty()) { if (!fullText.empty()) fullText+='\n'; fullText+=txt; }
    }

    // ── PP-Structure v2 layout analysis ───────────────────────
    std::vector<LayoutBlock> layout = analyzeLayout(ocr, w, h);

    // ── Key Information Extraction ─────────────────────────────
    std::string kieJson = (runKIE==JNI_TRUE) ? extractKIE(fullText) : "{}";

    // ── Build JSON ─────────────────────────────────────────────
    std::ostringstream j;
    j << "{\"success\":true";
    j << ",\"language\":\"" << jsonEsc(g_eng.lang) << "\"";
    j << ",\"fullText\":\"" << jsonEsc(fullText) << "\"";
    j << ",\"boxes\":[";
    for (size_t i=0;i<layout.size();i++) {
        auto& lb=layout[i];
        if(i)j<<",";
        j<<"{\"x1\":"<<lb.x1<<",\"y1\":"<<lb.y1
         <<",\"x2\":"<<lb.x2<<",\"y2\":"<<lb.y2
         <<",\"text\":\""<<jsonEsc(lb.text)<<"\""
         <<",\"type\":\""<<jsonEsc(lb.type)<<"\""
         <<",\"confidence\":"<<lb.confidence<<"}";
    }
    j << "]";
    j << ",\"keyInfo\":" << kieJson;
    j << "}";
    return env->NewStringUTF(j.str().c_str());
#else
    return env->NewStringUTF(
        "{\"success\":false,\"error\":\"Paddle-Lite not linked. "
        "Run Build Native Libraries workflow first.\","
        "\"boxes\":[],\"fullText\":\"\",\"keyInfo\":{}}");
#endif
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_detectOnly(
        JNIEnv* env, jobject,
        jbyteArray jRgba, jint w, jint h) {
#ifdef HAS_PADDLE
    if (!g_eng.det)
        return env->NewStringUTF("{\"error\":\"Detection model not loaded\",\"boxes\":[]}");
    RGBAImg img = imgFromBytes(env, jRgba, w, h);
    auto boxes = runDet(img);
    std::ostringstream j;
    j << "{\"boxes\":[";
    for (size_t i=0;i<boxes.size();i++) {
        auto& b=boxes[i]; if(i)j<<",";
        j<<"{\"x1\":"<<b.x1<<",\"y1\":"<<b.y1
         <<",\"x2\":"<<b.x2<<",\"y2\":"<<b.y2
         <<",\"score\":"<<b.score<<"}";
    }
    j << "]}";
    return env->NewStringUTF(j.str().c_str());
#else
    return env->NewStringUTF("{\"error\":\"Paddle-Lite not linked\",\"boxes\":[]}");
#endif
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_extractKIE(
        JNIEnv* env, jobject, jstring jText) {
    return env->NewStringUTF(extractKIE(jstr(env,jText)).c_str());
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_isPaddleLinked(
        JNIEnv*, jobject) {
#ifdef HAS_PADDLE
    return JNI_TRUE;
#else
    return JNI_FALSE;
#endif
}
