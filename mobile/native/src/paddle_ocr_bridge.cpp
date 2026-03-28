/**
 * paddle_ocr_bridge.cpp — সম্পূর্ণ PP-OCRv5 pipeline
 *
 *  ১. PP-OCRv5 Detection  — DBNet আর্কিটেকচার (text region bounding boxes)
 *  ২. PP-OCRv5 Recognition — SVTR/CRNN + CTC decode (text string)
 *  ৩. PP-Structure v2     — Layout analysis (multi-column, reading order, sections)
 *  ৪. PP-Table            — Table structure reconstruction (rows × cols → markdown)
 *  ৫. PP-Layout           — Document region classification (figure/list/caption/para)
 *  ৬. PP-Formula          — Math formula detection (symbols, operators, LaTeX-like)
 *  ৭. Key Information Extraction — regex-based post-processing
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
#include <map>
#include <set>
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
    std::vector<uint8_t> data;
    int w = 0, h = 0;
};

struct FloatImg {
    std::vector<float> data;
    int w = 0, h = 0, c = 3;
};

/* ═══════════════════════ Resize ════════════════════════════════ */

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

static FloatImg prepDet(const RGBAImg& src, int maxLen = 736) {
    float ratio = (float)maxLen / std::max(src.w, src.h);
    int nw = std::max(32, (int)std::round(src.w * ratio / 32) * 32);
    int nh = std::max(32, (int)std::round(src.h * ratio / 32) * 32);
    RGBAImg r = resize(src, nw, nh);
    FloatImg o; o.w = nw; o.h = nh; o.c = 3; o.data.resize(3 * nw * nh);
    // ImageNet mean/std in RGB order (PaddleOCR det model expects RGB CHW)
    const float mR=0.485f,mG=0.456f,mB=0.406f,sR=0.229f,sG=0.224f,sB=0.225f;
    for (int y = 0; y < nh; ++y)
        for (int x = 0; x < nw; ++x) {
            int i = (y*nw+x)*4;
            // Kotlin stores pixels as A(0) R(1) G(2) B(3)
            float fR = r.data[i+1]/255.f, fG = r.data[i+2]/255.f, fB = r.data[i+3]/255.f;
            // CHW layout — channel 0=R, 1=G, 2=B (RGB, matching PaddleOCR training)
            o.data[0*nh*nw + y*nw+x] = (fR-mR)/sR;
            o.data[1*nh*nw + y*nw+x] = (fG-mG)/sG;
            o.data[2*nh*nw + y*nw+x] = (fB-mB)/sB;
        }
    return o;
}

static FloatImg prepRec(const RGBAImg& src) {
    const int tH = 48;
    int nw = std::min((int)(src.w * (float)tH / src.h), 960);
    int nh = tH;
    RGBAImg r = resize(src, nw, nh);
    FloatImg o; o.w = nw; o.h = nh; o.c = 3; o.data.resize(3 * nw * nh);
    for (int y = 0; y < nh; ++y)
        for (int x = 0; x < nw; ++x) {
            int i = (y*nw+x)*4;
            // Kotlin: A(0) R(1) G(2) B(3)
            float fR = r.data[i+1]/255.f, fG = r.data[i+2]/255.f, fB = r.data[i+3]/255.f;
            // CHW — channel 0=R, 1=G, 2=B (RGB, mean/std=0.5 symmetric)
            o.data[0*nh*nw + y*nw+x] = (fR-0.5f)/0.5f;
            o.data[1*nh*nw + y*nw+x] = (fG-0.5f)/0.5f;
            o.data[2*nh*nw + y*nw+x] = (fB-0.5f)/0.5f;
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

/* ═══════════════════════════════════════════════════════════════
 * PP-Formula Detection
 * গণিত সূত্র বের করা — symbols, operators, equation patterns
 * ═══════════════════════════════════════════════════════════════ */

struct FormulaRegion {
    int x1,y1,x2,y2;
    std::string text;
    float score;
    std::string latex; // best-effort LaTeX representation
};

// Count UTF-8 codepoints (not bytes) so Bengali/Arabic chars are counted correctly
static int utf8CharCount(const std::string& s) {
    int n = 0;
    for (size_t i = 0; i < s.size(); ) {
        unsigned char c = (unsigned char)s[i];
        if      (c < 0x80) i += 1;
        else if (c < 0xE0) i += 2;
        else if (c < 0xF0) i += 3;
        else               i += 4;
        n++;
    }
    return n;
}

// Score how "formula-like" a text string is (0.0 – 1.0)
static float formulaScore(const std::string& txt) {
    if (txt.empty()) return 0.f;
    float score = 0.f;
    int len = utf8CharCount(txt);  // use codepoints, not bytes

    // Math operators and symbols
    const char* mathSymbols[] = {
        "+","-","*","/","=","<",">","≤","≥","≠","≈","±",
        "∑","∫","∂","∇","∞","√","∏","∆","∈","∉","⊂","⊃",
        "∪","∩","α","β","γ","δ","ε","θ","λ","μ","π","σ","φ","ω",
        "^","_","{","}","\\frac","\\sqrt","\\sum","\\int",
        "÷","×","·","°",nullptr
    };
    for (int i=0; mathSymbols[i]; i++) {
        if (txt.find(mathSymbols[i]) != std::string::npos) score += 0.12f;
    }

    // Check for fraction-like pattern (digit/digit or digit over digit)
    try {
        std::regex fracPat(R"(\d+\s*/\s*\d+)");
        if (std::regex_search(txt, fracPat)) score += 0.25f;
    } catch(...) {}

    // Check for power/exponent
    try {
        std::regex expPat(R"([a-zA-Z0-9]\^[0-9a-zA-Z{])");
        if (std::regex_search(txt, expPat)) score += 0.25f;
    } catch(...) {}

    // Check for variable with subscript
    try {
        std::regex subPat(R"([a-zA-Z]_[0-9a-zA-Z])");
        if (std::regex_search(txt, subPat)) score += 0.2f;
    } catch(...) {}

    // Ratio of digits+operators to total chars
    int mathChars = 0;
    for (char c : txt) {
        if (isdigit((unsigned char)c) || c=='+' || c=='-' || c=='*' ||
            c=='/' || c=='=' || c=='<' || c=='>' || c=='^' || c=='_')
            mathChars++;
    }
    float ratio = (float)mathChars / len;
    if (ratio > 0.4f) score += 0.3f;
    else if (ratio > 0.25f) score += 0.15f;

    // Isolated single letter (likely variable): e.g. "x", "y", "n"
    try {
        std::regex varPat(R"(^\s*[a-zA-Z]\s*$)");
        if (std::regex_match(txt, varPat)) score -= 0.3f; // too short, penalize
    } catch(...) {}

    return std::min(1.f, std::max(0.f, score));
}

// Best-effort convert detected formula text to LaTeX
static std::string toLatex(const std::string& txt) {
    std::string out = txt;
    // Simple substitutions
    auto rep = [&](const std::string& from, const std::string& to) {
        size_t pos = 0;
        while ((pos = out.find(from, pos)) != std::string::npos) {
            out.replace(pos, from.size(), to);
            pos += to.size();
        }
    };
    rep("×", "\\times ");
    rep("÷", "\\div ");
    rep("≤", "\\leq ");
    rep("≥", "\\geq ");
    rep("≠", "\\neq ");
    rep("≈", "\\approx ");
    rep("±", "\\pm ");
    rep("∑", "\\sum ");
    rep("∫", "\\int ");
    rep("∂", "\\partial ");
    rep("∇", "\\nabla ");
    rep("∞", "\\infty ");
    rep("√", "\\sqrt");
    rep("∏", "\\prod ");
    rep("∆", "\\Delta ");
    rep("∈", "\\in ");
    rep("∉", "\\notin ");
    rep("⊂", "\\subset ");
    rep("⊃", "\\supset ");
    rep("∪", "\\cup ");
    rep("∩", "\\cap ");
    rep("α", "\\alpha ");
    rep("β", "\\beta ");
    rep("γ", "\\gamma ");
    rep("δ", "\\delta ");
    rep("ε", "\\epsilon ");
    rep("θ", "\\theta ");
    rep("λ", "\\lambda ");
    rep("μ", "\\mu ");
    rep("π", "\\pi ");
    rep("σ", "\\sigma ");
    rep("φ", "\\phi ");
    rep("ω", "\\omega ");
    rep("°", "^{\\circ}");
    return out;
}

static std::vector<FormulaRegion> detectFormulas(
        const std::vector<std::pair<Box,std::string>>& ocr,
        float threshold = 0.35f) {
    std::vector<FormulaRegion> formulas;
    for (auto& [b,t] : ocr) {
        float fs = formulaScore(t);
        if (fs >= threshold) {
            FormulaRegion fr;
            fr.x1=b.x1; fr.y1=b.y1; fr.x2=b.x2; fr.y2=b.y2;
            fr.text=t; fr.score=fs;
            fr.latex = toLatex(t);
            formulas.push_back(fr);
        }
    }
    return formulas;
}

/* ═══════════════════════════════════════════════════════════════
 * PP-Layout — Document Layout Analysis
 * header/footer/title/heading/paragraph/list/figure/caption/formula
 * ═══════════════════════════════════════════════════════════════ */

struct LayoutBlock {
    int x1,y1,x2,y2;
    std::string type, text;
    float confidence;
    int columnIndex; // which column (0=left, 1=right, -1=full-width)
    int readingOrder; // document reading order index
};

// Detect number of columns in a document
static int detectColumnCount(
        const std::vector<std::pair<Box,std::string>>& ocr, int imgW) {
    if (ocr.empty()) return 1;
    // Check how many boxes are in left vs right half
    int leftCount = 0, rightCount = 0;
    int midX = imgW / 2;
    for (auto& [b,t] : ocr) {
        int cx = (b.x1 + b.x2) / 2;
        if (cx < midX) leftCount++; else rightCount++;
    }
    // If both halves have significant content → 2-column layout
    float total = (float)(leftCount + rightCount);
    if (total < 4) return 1;
    float leftRatio = leftCount / total;
    if (leftRatio > 0.3f && leftRatio < 0.7f) return 2;
    return 1;
}

// Classify a text as list item
static bool isListItem(const std::string& t) {
    if (t.empty()) return false;
    // Starts with bullet, dash, number+dot, or numbered list
    if (t[0] == '-' || t[0] == '*' || t[0] == '•' || t[0] == '·') return true;
    try {
        std::regex listPat(R"(^\s*(\d+[\.\)]\s|\([a-z]\)\s|[a-z][\.\)]\s))");
        if (std::regex_search(t, listPat)) return true;
    } catch(...) {}
    return false;
}

// Classify a text block as figure caption
static bool isFigureCaption(const std::string& t) {
    if (t.empty()) return false;
    try {
        std::regex capPat(R"(^(fig(ure)?|table|chart|graph|image|photo|diagram)[.\s]*\d+)", std::regex::icase);
        if (std::regex_search(t, capPat)) return true;
    } catch(...) {}
    return false;
}

static std::vector<LayoutBlock> analyzeLayout(
        const std::vector<std::pair<Box,std::string>>& ocr,
        int imgW, int imgH) {

    if (ocr.empty()) return {};

    int numCols = detectColumnCount(ocr, imgW);
    int midX = imgW / 2;

    // Sort input by Y then X for reading order
    std::vector<size_t> order(ocr.size());
    for (size_t i=0;i<order.size();i++) order[i]=i;
    std::sort(order.begin(),order.end(),[&](size_t a, size_t b){
        const auto& ba=ocr[a].first; const auto& bb=ocr[b].first;
        // If multi-column, sort by column first, then Y
        if (numCols == 2) {
            int colA = (ba.x1+ba.x2)/2 < midX ? 0 : 1;
            int colB = (bb.x1+bb.x2)/2 < midX ? 0 : 1;
            if (colA != colB) return colA < colB;
        }
        if (abs(ba.y1-bb.y1) > 10) return ba.y1 < bb.y1;
        return ba.x1 < bb.x1;
    });

    std::vector<LayoutBlock> blocks;
    int readIdx = 0;

    for (size_t idx : order) {
        auto& [b,t] = ocr[idx];
        LayoutBlock lb;
        lb.x1=b.x1; lb.y1=b.y1; lb.x2=b.x2; lb.y2=b.y2;
        lb.text=t; lb.confidence=b.score;
        lb.readingOrder = readIdx++;
        lb.columnIndex = (numCols==2) ? ((b.x1+b.x2)/2 < midX ? 0 : 1) : -1;

        float ry  = (float)b.y1 / imgH;
        float rw  = (float)(b.x2-b.x1) / imgW;
        float bh  = (float)(b.y2-b.y1);
        float fsc = formulaScore(t);

        // Classify by position, size and content
        if (ry < 0.06f && rw > 0.3f)           lb.type = "header";
        else if (ry > 0.94f)                    lb.type = "footer";
        else if (fsc >= 0.35f)                  lb.type = "formula";
        else if (isFigureCaption(t))            lb.type = "caption";
        else if (isListItem(t))                 lb.type = "list_item";
        else if (bh > imgH*0.055f && rw > 0.3f) lb.type = "title";
        else if (bh > imgH*0.038f && rw > 0.15f) lb.type = "heading";
        else if (rw > 0.08f && rw < 0.38f && bh < 32 && numCols > 1)
                                                lb.type = "table_cell";
        else if (rw > 0.1f && rw < 0.4f && bh < 28)
                                                lb.type = "table_cell";
        else                                    lb.type = "paragraph";

        blocks.push_back(lb);
    }
    return blocks;
}

/* ═══════════════════════════════════════════════════════════════
 * PP-Table — Table Structure Reconstruction
 * Groups table_cell blocks into a proper rows×cols grid
 * Outputs: rowCount, colCount, cells[], markdownTable
 * ═══════════════════════════════════════════════════════════════ */

struct TableCell {
    int row, col;
    int x1,y1,x2,y2;
    std::string text;
};

struct TableResult {
    int x1,y1,x2,y2;  // bounding box of entire table
    int rows, cols;
    std::vector<TableCell> cells;
    std::string markdownTable;
};

// Cluster Y-coordinates into rows using gap threshold
static std::vector<std::vector<size_t>> clusterByY(
        const std::vector<LayoutBlock>& cells, int gapThresh) {
    if (cells.empty()) return {};
    // Sort indices by y1
    std::vector<size_t> idx(cells.size());
    for (size_t i=0;i<idx.size();i++) idx[i]=i;
    std::sort(idx.begin(),idx.end(),[&](size_t a,size_t b){
        return cells[a].y1 < cells[b].y1;
    });

    std::vector<std::vector<size_t>> rows;
    std::vector<size_t> cur = {idx[0]};
    int curBandY2 = cells[idx[0]].y2;

    for (size_t k=1; k<idx.size(); k++) {
        size_t i = idx[k];
        // If this cell overlaps or is within gapThresh of current row band
        if (cells[i].y1 <= curBandY2 + gapThresh) {
            cur.push_back(i);
            curBandY2 = std::max(curBandY2, cells[i].y2);
        } else {
            rows.push_back(cur);
            cur = {i};
            curBandY2 = cells[i].y2;
        }
    }
    if (!cur.empty()) rows.push_back(cur);
    return rows;
}

// Cluster X-coordinates into columns across all rows
static int detectColCount(
        const std::vector<std::vector<size_t>>& rowGroups,
        const std::vector<LayoutBlock>& cells) {
    int maxCols = 0;
    for (auto& row : rowGroups)
        maxCols = std::max(maxCols, (int)row.size());
    return maxCols;
}

// Build markdown table from rows×cols grid
static std::string buildMarkdownTable(
        const std::vector<std::vector<std::string>>& grid) {
    if (grid.empty()) return "";
    size_t colCount = 0;
    for (auto& row : grid) colCount = std::max(colCount, row.size());
    if (colCount == 0) return "";

    // Compute max width per column for alignment
    std::vector<size_t> colWidths(colCount, 3);
    for (auto& row : grid)
        for (size_t c=0; c<row.size(); c++)
            colWidths[c] = std::max(colWidths[c], row[c].size());

    std::ostringstream out;
    bool firstRow = true;
    for (auto& row : grid) {
        out << "|";
        for (size_t c=0; c<colCount; c++) {
            std::string cell = c < row.size() ? row[c] : "";
            out << " " << cell;
            // Pad to column width
            size_t pad = colWidths[c] > cell.size() ? colWidths[c]-cell.size() : 0;
            for (size_t p=0; p<pad; p++) out << " ";
            out << " |";
        }
        out << "\n";
        if (firstRow) {
            // Separator row
            out << "|";
            for (size_t c=0; c<colCount; c++) {
                out << " ";
                for (size_t p=0; p<colWidths[c]; p++) out << "-";
                out << " |";
            }
            out << "\n";
            firstRow = false;
        }
    }
    return out.str();
}

static std::vector<TableResult> reconstructTables(
        const std::vector<LayoutBlock>& blocks, int imgW, int imgH) {

    // 1. Collect all table_cell blocks
    std::vector<LayoutBlock> cells;
    for (auto& lb : blocks)
        if (lb.type == "table_cell") cells.push_back(lb);

    if (cells.size() < 2) return {};

    // 2. Find connected table regions using spatial proximity
    //    Two cells belong to the same table if they are within 2× cell-height of each other
    int n = (int)cells.size();
    std::vector<int> tableId(n, -1);
    int nextTable = 0;

    for (int i=0; i<n; i++) {
        if (tableId[i] == -1) tableId[i] = nextTable++;
        for (int j=i+1; j<n; j++) {
            int h1 = cells[i].y2-cells[i].y1+1;
            int h2 = cells[j].y2-cells[j].y1+1;
            int avgH = (h1+h2)/2;
            bool verticallyClose = abs(cells[j].y1 - cells[i].y2) < avgH*3 ||
                                   abs(cells[i].y1 - cells[j].y2) < avgH*3 ||
                                   (cells[i].y1 <= cells[j].y2+avgH && cells[j].y1 <= cells[i].y2+avgH);
            if (!verticallyClose) continue;
            if (tableId[j] == -1) {
                // New cell — join i's table
                tableId[j] = tableId[i];
            } else if (tableId[j] != tableId[i]) {
                // Two distinct groups overlap — merge the larger absorbs the smaller
                int keep = tableId[i], drop = tableId[j];
                for (int k = 0; k < n; k++)
                    if (tableId[k] == drop) tableId[k] = keep;
            }
        }
    }

    // 3. Group cells by table
    std::map<int,std::vector<size_t>> tableGroups;
    for (int i=0; i<n; i++) tableGroups[tableId[i]].push_back((size_t)i);

    std::vector<TableResult> results;

    for (auto& [tid, idxs] : tableGroups) {
        if (idxs.size() < 2) continue;

        // Collect cells for this table
        std::vector<LayoutBlock> tCells;
        for (size_t i : idxs) tCells.push_back(cells[i]);

        // Bounding box of table
        TableResult tr;
        tr.x1 = tCells[0].x1; tr.y1 = tCells[0].y1;
        tr.x2 = tCells[0].x2; tr.y2 = tCells[0].y2;
        for (auto& c : tCells) {
            tr.x1 = std::min(tr.x1, c.x1); tr.y1 = std::min(tr.y1, c.y1);
            tr.x2 = std::max(tr.x2, c.x2); tr.y2 = std::max(tr.y2, c.y2);
        }

        // 4. Cluster into rows by Y
        int avgH = 0;
        for (auto& c : tCells) avgH += (c.y2-c.y1);
        avgH /= (int)tCells.size();
        int gapThresh = std::max(4, avgH / 3);

        auto rowGroups = clusterByY(tCells, gapThresh);
        tr.rows = (int)rowGroups.size();
        tr.cols = detectColCount(rowGroups, tCells);

        // 5. Sort each row by X (left → right)
        std::vector<std::vector<std::string>> grid;
        int rowIdx = 0;
        for (auto& rowGroup : rowGroups) {
            // Sort this row by x1
            std::sort(rowGroup.begin(),rowGroup.end(),[&](size_t a,size_t b){
                return tCells[a].x1 < tCells[b].x1;
            });
            std::vector<std::string> rowTexts;
            int colIdx = 0;
            for (size_t ci : rowGroup) {
                TableCell tc;
                tc.row = rowIdx; tc.col = colIdx++;
                tc.x1 = tCells[ci].x1; tc.y1 = tCells[ci].y1;
                tc.x2 = tCells[ci].x2; tc.y2 = tCells[ci].y2;
                tc.text = tCells[ci].text;
                tr.cells.push_back(tc);
                rowTexts.push_back(tc.text);
            }
            grid.push_back(rowTexts);
            rowIdx++;
        }

        // 6. Build markdown table
        tr.markdownTable = buildMarkdownTable(grid);
        results.push_back(tr);
    }

    return results;
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

/* ══════════════════════════════════════════════════════════════
 *  JSON builder helpers
 * ══════════════════════════════════════════════════════════════ */

static std::string layoutBlockToJson(const LayoutBlock& lb) {
    std::ostringstream j;
    j << "{\"x1\":"<<lb.x1<<",\"y1\":"<<lb.y1
      <<",\"x2\":"<<lb.x2<<",\"y2\":"<<lb.y2
      <<",\"text\":\""<<jsonEsc(lb.text)<<"\""
      <<",\"type\":\""<<jsonEsc(lb.type)<<"\""
      <<",\"confidence\":"<<lb.confidence
      <<",\"columnIndex\":"<<lb.columnIndex
      <<",\"readingOrder\":"<<lb.readingOrder
      <<"}";
    return j.str();
}

static std::string tableResultToJson(const TableResult& tr) {
    std::ostringstream j;
    j << "{\"x1\":"<<tr.x1<<",\"y1\":"<<tr.y1
      <<",\"x2\":"<<tr.x2<<",\"y2\":"<<tr.y2
      <<",\"rows\":"<<tr.rows<<",\"cols\":"<<tr.cols
      <<",\"markdownTable\":\""<<jsonEsc(tr.markdownTable)<<"\""
      <<",\"cells\":[";
    for (size_t i=0; i<tr.cells.size(); i++) {
        auto& c = tr.cells[i];
        if(i) j<<",";
        j<<"{\"row\":"<<c.row<<",\"col\":"<<c.col
         <<",\"x1\":"<<c.x1<<",\"y1\":"<<c.y1
         <<",\"x2\":"<<c.x2<<",\"y2\":"<<c.y2
         <<",\"text\":\""<<jsonEsc(c.text)<<"\"}";
    }
    j << "]}";
    return j.str();
}

static std::string formulaRegionToJson(const FormulaRegion& fr) {
    std::ostringstream j;
    j << "{\"x1\":"<<fr.x1<<",\"y1\":"<<fr.y1
      <<",\"x2\":"<<fr.x2<<",\"y2\":"<<fr.y2
      <<",\"text\":\""<<jsonEsc(fr.text)<<"\""
      <<",\"score\":"<<fr.score
      <<",\"latex\":\""<<jsonEsc(fr.latex)<<"\"}";
    return j.str();
}

/* ═══════════════════════════ JNI EXPORTS ═══════════════════════
 *
 *  1.  initEngine          — load det + rec models
 *  2.  isEngineReady       — health check
 *  3.  releaseEngine       — free memory
 *  4.  recognizeFromRGBA   — full pipeline (det→rec→layout→table→formula→KIE)
 *  5.  detectOnly          — detection boxes only
 *  6.  extractKIE          — KIE on plain text
 *  7.  isPaddleLinked      — compile-time library check
 *  8.  analyzeTableStructure — reconstruct table from OCR JSON
 *  9.  detectFormulaRegions  — formula detection from OCR JSON
 *  10. getLayoutInfo         — pure layout analysis on OCR JSON
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
            "\"boxes\":[],\"fullText\":\"\",\"keyInfo\":{},"
            "\"tables\":[],\"formulas\":[],\"layoutInfo\":{}}");

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

    // ── PP-Structure v2 + PP-Layout ─────────────────────────────
    std::vector<LayoutBlock> layout = analyzeLayout(ocr, w, h);

    // ── PP-Table: Table structure reconstruction ─────────────────
    std::vector<TableResult> tables = reconstructTables(layout, w, h);

    // ── PP-Formula: Formula detection ───────────────────────────
    std::vector<FormulaRegion> formulas = detectFormulas(ocr);

    // ── Key Information Extraction ─────────────────────────────
    std::string kieJson = (runKIE==JNI_TRUE) ? extractKIE(fullText) : "{}";

    // ── Layout info summary ────────────────────────────────────
    int numCols = detectColumnCount(ocr, w);
    int titleCount=0, headingCount=0, paraCount=0, tableCount=0, formulaCount=0, listCount=0;
    for (auto& lb : layout) {
        if (lb.type=="title")     titleCount++;
        else if (lb.type=="heading")  headingCount++;
        else if (lb.type=="paragraph") paraCount++;
        else if (lb.type=="table_cell") tableCount++;
        else if (lb.type=="formula")  formulaCount++;
        else if (lb.type=="list_item") listCount++;
    }

    // ── Build JSON ─────────────────────────────────────────────
    std::ostringstream j;
    j << "{\"success\":true";
    j << ",\"language\":\"" << jsonEsc(g_eng.lang) << "\"";
    j << ",\"fullText\":\"" << jsonEsc(fullText) << "\"";

    // boxes (layout blocks with type, readingOrder, columnIndex)
    j << ",\"boxes\":[";
    for (size_t i=0;i<layout.size();i++) {
        if(i)j<<",";
        j << layoutBlockToJson(layout[i]);
    }
    j << "]";

    // tables
    j << ",\"tables\":[";
    for (size_t i=0;i<tables.size();i++) {
        if(i)j<<",";
        j << tableResultToJson(tables[i]);
    }
    j << "]";

    // formulas
    j << ",\"formulas\":[";
    for (size_t i=0;i<formulas.size();i++) {
        if(i)j<<",";
        j << formulaRegionToJson(formulas[i]);
    }
    j << "]";

    // layout info summary
    j << ",\"layoutInfo\":{"
      << "\"columns\":"       << numCols
      << ",\"titles\":"       << titleCount
      << ",\"headings\":"     << headingCount
      << ",\"paragraphs\":"   << paraCount
      << ",\"tableCells\":"   << tableCount
      << ",\"formulas\":"     << formulaCount
      << ",\"listItems\":"    << listCount
      << "}";

    j << ",\"keyInfo\":" << kieJson;
    j << "}";
    return env->NewStringUTF(j.str().c_str());
#else
    return env->NewStringUTF(
        "{\"success\":false,\"error\":\"Paddle-Lite not linked. "
        "Run Build Native Libraries workflow first.\","
        "\"boxes\":[],\"fullText\":\"\",\"keyInfo\":{},"
        "\"tables\":[],\"formulas\":[],\"layoutInfo\":{}}");
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

/**
 * analyzeTableStructure — receives OCR boxes as JSON, reconstructs table structure.
 * Input JSON: [{"x1":..,"y1":..,"x2":..,"y2":..,"text":"..","type":"table_cell"}]
 * Returns JSON: { "tables": [...] }
 */
extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_analyzeTableStructure(
        JNIEnv* env, jobject, jstring jOcrJson, jint imgW, jint imgH) {
    // Parse lightweight JSON (we do manual parsing to avoid dependency)
    std::string input = jstr(env, jOcrJson);

    // Extract table_cell blocks from JSON manually
    std::vector<LayoutBlock> blocks;
    size_t pos = 0;
    while ((pos = input.find("\"x1\":", pos)) != std::string::npos) {
        LayoutBlock lb;
        auto readInt = [&](const std::string& key) -> int {
            size_t kp = input.find("\""+key+"\":", pos);
            if (kp == std::string::npos) return 0;
            size_t vp = input.find(':', kp) + 1;
            while (vp < input.size() && (input[vp]==' '||input[vp]=='\t')) vp++;
            return std::stoi(input.substr(vp));
        };
        auto readStr = [&](const std::string& key) -> std::string {
            size_t kp = input.find("\""+key+"\":", pos);
            if (kp == std::string::npos) return "";
            size_t vp = input.find('"', input.find(':', kp)+1);
            if (vp == std::string::npos) return "";
            size_t ep = input.find('"', vp+1);
            if (ep == std::string::npos) return "";
            return input.substr(vp+1, ep-vp-1);
        };
        lb.x1 = readInt("x1"); lb.y1 = readInt("y1");
        lb.x2 = readInt("x2"); lb.y2 = readInt("y2");
        lb.text = readStr("text");
        lb.type = "table_cell";
        lb.confidence = 1.f;
        lb.columnIndex = -1;
        lb.readingOrder = (int)blocks.size();
        blocks.push_back(lb);

        size_t next = input.find('{', pos+1);
        if (next == std::string::npos) break;
        pos = next;
    }

    std::vector<TableResult> tables = reconstructTables(blocks, imgW, imgH);

    std::ostringstream j;
    j << "{\"tables\":[";
    for (size_t i=0; i<tables.size(); i++) {
        if(i) j<<",";
        j << tableResultToJson(tables[i]);
    }
    j << "]}";
    return env->NewStringUTF(j.str().c_str());
}

/**
 * detectFormulaRegions — receives OCR boxes as JSON, returns formula regions.
 * Input JSON: [{"x1":..,"y1":..,"x2":..,"y2":..,"text":".."}]
 * Returns JSON: { "formulas": [...] }
 */
extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_detectFormulaRegions(
        JNIEnv* env, jobject, jstring jOcrJson, jfloat threshold) {
    std::string input = jstr(env, jOcrJson);
    std::vector<std::pair<Box,std::string>> ocr;
    size_t pos = 0;
    while ((pos = input.find("\"x1\":", pos)) != std::string::npos) {
        auto readInt = [&](const std::string& key) -> int {
            size_t kp = input.find("\""+key+"\":", pos);
            if (kp == std::string::npos) return 0;
            size_t vp = input.find(':', kp) + 1;
            while (vp < input.size() && (input[vp]==' '||input[vp]=='\t')) vp++;
            return std::stoi(input.substr(vp));
        };
        auto readStr = [&](const std::string& key) -> std::string {
            size_t kp = input.find("\""+key+"\":", pos);
            if (kp == std::string::npos) return "";
            size_t vp = input.find('"', input.find(':', kp)+1);
            if (vp == std::string::npos) return "";
            size_t ep = input.find('"', vp+1);
            if (ep == std::string::npos) return "";
            return input.substr(vp+1, ep-vp-1);
        };
        Box b;
        b.x1=readInt("x1"); b.y1=readInt("y1");
        b.x2=readInt("x2"); b.y2=readInt("y2");
        b.score=1.f;
        std::string txt = readStr("text");
        ocr.push_back({b, txt});
        size_t next = input.find('{', pos+1);
        if (next == std::string::npos) break;
        pos = next;
    }

    float thr = (threshold > 0.f) ? threshold : 0.35f;
    std::vector<FormulaRegion> formulas = detectFormulas(ocr, thr);

    std::ostringstream j;
    j << "{\"formulas\":[";
    for (size_t i=0; i<formulas.size(); i++) {
        if(i) j<<",";
        j << formulaRegionToJson(formulas[i]);
    }
    j << "]}";
    return env->NewStringUTF(j.str().c_str());
}

/**
 * getLayoutInfo — full layout analysis on OCR boxes JSON (no image needed).
 * Returns JSON with boxes, layoutInfo summary.
 */
extern "C" JNIEXPORT jstring JNICALL
Java_com_pdfpowertools_native_PaddleOCRBridge_getLayoutInfo(
        JNIEnv* env, jobject, jstring jOcrJson, jint imgW, jint imgH) {
    std::string input = jstr(env, jOcrJson);
    std::vector<std::pair<Box,std::string>> ocr;
    size_t pos = 0;
    while ((pos = input.find("\"x1\":", pos)) != std::string::npos) {
        auto readInt = [&](const std::string& key) -> int {
            size_t kp = input.find("\""+key+"\":", pos);
            if (kp == std::string::npos) return 0;
            size_t vp = input.find(':', kp) + 1;
            while (vp < input.size() && (input[vp]==' '||input[vp]=='\t')) vp++;
            return std::stoi(input.substr(vp));
        };
        auto readStr = [&](const std::string& key) -> std::string {
            size_t kp = input.find("\""+key+"\":", pos);
            if (kp == std::string::npos) return "";
            size_t vp = input.find('"', input.find(':', kp)+1);
            if (vp == std::string::npos) return "";
            size_t ep = input.find('"', vp+1);
            if (ep == std::string::npos) return "";
            return input.substr(vp+1, ep-vp-1);
        };
        Box b;
        b.x1=readInt("x1"); b.y1=readInt("y1");
        b.x2=readInt("x2"); b.y2=readInt("y2");
        b.score=1.f;
        std::string txt = readStr("text");
        ocr.push_back({b, txt});
        size_t next = input.find('{', pos+1);
        if (next == std::string::npos) break;
        pos = next;
    }

    std::vector<LayoutBlock> layout = analyzeLayout(ocr, imgW, imgH);
    int numCols = detectColumnCount(ocr, imgW);
    int titleCount=0,headingCount=0,paraCount=0,tableCount=0,formulaCount=0,listCount=0,captionCount=0;
    for (auto& lb : layout) {
        if (lb.type=="title")       titleCount++;
        else if(lb.type=="heading") headingCount++;
        else if(lb.type=="paragraph") paraCount++;
        else if(lb.type=="table_cell") tableCount++;
        else if(lb.type=="formula") formulaCount++;
        else if(lb.type=="list_item") listCount++;
        else if(lb.type=="caption") captionCount++;
    }

    std::ostringstream j;
    j << "{\"boxes\":[";
    for (size_t i=0; i<layout.size(); i++) {
        if(i) j<<",";
        j << layoutBlockToJson(layout[i]);
    }
    j << "]";
    j << ",\"layoutInfo\":{"
      << "\"columns\":"    << numCols
      << ",\"titles\":"    << titleCount
      << ",\"headings\":"  << headingCount
      << ",\"paragraphs\":"<< paraCount
      << ",\"tableCells\":"<< tableCount
      << ",\"formulas\":"  << formulaCount
      << ",\"listItems\":"  << listCount
      << ",\"captions\":"  << captionCount
      << "}}";
    return env->NewStringUTF(j.str().c_str());
}
