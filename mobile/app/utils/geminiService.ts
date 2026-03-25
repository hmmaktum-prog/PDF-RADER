import AsyncStorage from '@react-native-async-storage/async-storage';

export type BlockType = 'paragraph' | 'list' | 'table' | 'header' | 'footer' | 'separator' | 'page_break';

export interface DocumentBlock {
  type: BlockType;
  content?: string | string[] | string[][];
  is_bold?: boolean;
  is_italic?: boolean;
  is_underline?: boolean;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  separator_style?: 'single' | 'double' | 'dotted' | 'dashed';
}

// Available Gemini AI models
export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-3-flash' | 'gemini-3.1-flash-lite';

export const AVAILABLE_MODELS: { id: GeminiModel; name: string }[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
];

export type OcrLanguage = 'Bengali' | 'English' | 'Arabic' | 'Mixed';

const SYSTEM_INSTRUCTION = `
You are a highly skilled and precise document converter AI. Your primary goal is to preserve the exact layout and spelling of the original document.

Strict Guidelines:

1. Completeness (CRITICAL):
   - Do NOT omit any word, sentence, paragraph, or page.
   - Do NOT summarize any section.
   - For multi-page documents, extract ALL content sequentially page by page.

2. Headers & Footers:
   - Preserve original alignment cleanly.
   - Avoid messy OCR repetition. Keep headers concise.

3. Spelling Preservation:
   - Preserve exact spelling even if archaic. Do NOT autocorrect or modernize.
   - Special care for religious terms: 'সাওম', 'হাদঈ', 'হজ্ব', 'নিয়্যত', 'যাকাত', 'সালাত', 'ঈদ', 'কুরবানী'.
   - Preserve all Bengali yuktakshars (conjunct letters) exactly.

4. Arabic Text Integrity:
   - Do NOT add extra words or duas.
   - Preserve ayah numbers, brackets, and punctuation in exact order.

5. Layout, Tables & Grids:
   - Maintain paragraph, list, and column layout.
   - Text in columns or side-by-side grids MUST be output as \`table\`, NOT \`paragraph\`.
   - Use \`separator\` for borders/lines.

6. Mathematical Equations (Strict Rule):
   - ALL math formulas MUST use Unicode. NO LaTeX. NO image codes.
   - Use: × (multiply), ½ (fractions), x² (superscript), α, β, π, θ, ∑, ∫, √, ∞, ≠, ≤, ≥
   - Use * → × for multiplication signs.

7. Smart Error Correction:
   - Fix ink smudges or printing artifacts contextually.
   - NEVER alter specific spelling rules or Arabic text.

Output MUST be a JSON array of DocumentBlock objects:
{
  type: 'paragraph' | 'list' | 'table' | 'header' | 'footer' | 'separator' | 'page_break',
  content: string | string[] | string[][],
  is_bold: boolean,
  is_italic: boolean,
  is_underline: boolean,
  alignment: 'left' | 'center' | 'right' | 'justify',
  separator_style: 'single' | 'double' | 'dotted' | 'dashed'
}
`;

function getLanguageInstruction(lang: OcrLanguage): string {
  switch (lang) {
    case 'Bengali':
      return 'ডকুমেন্টের মূল ভাষা বাংলা। স্পেলিং এবং যুক্তবর্ণ স্ক্যান করা ইমেজের মতো হুবহু সংরক্ষণ করতে হবে।';
    case 'English':
      return 'ডকুমেন্টের মূল ভাষা ইংরেজি। ইংরেজি টেক্সট নির্ভুলভাবে সংরক্ষণ করতে হবে।';
    case 'Arabic':
      return 'ডকুমেন্টের মূল ভাষা আরবি। আরবি টেক্সট হুবহু রাখতে হবে, কোনো অতিরিক্ত শব্দ যোগ করা যাবে না।';
    case 'Mixed':
      return 'ডকুমেন্টে বাংলা, ইংরেজি এবং আরবি থাকতে পারে। কোনো অনুবাদ (Translate) করা যাবে না। প্রতিটি ভাষা হুবহু সংরক্ষণ করতে হবে।';
    default:
      return '';
  }
}

const STEP_1_PROMPT = `
Step 1: Initial Extraction
You are performing the FIRST pass. Extract every word, paragraph, and page exactly as it appears.
- Pay special attention to layouts, tables, and correct spelling.
- If the user provided a custom command, follow it precisely.
- Detect bold, italic, underline, and alignment for each block.
- Output columns and grids as \`table\` type (2D array).
- Use \`separator\` for horizontal lines/borders with appropriate style.
- Use \`page_break\` between distinct pages.
`;

const STEP_2_QA = `
Step 2: Quality Assurance
Now act as a Meticulous Quality Assurance AI. Compare your extracted data to the original image pixel-by-pixel.

Checklist:
✅ Completeness: Ensure 100% of content is present. No missing text or pages.
✅ Arabic Check: Verify brackets and ayah markers are in correct order.
✅ Table Check: All grids/columns formatted as \`table\`, not \`paragraph\`.
✅ Math Check: All equations use Unicode (x², α + β = γ), NOT LaTeX.
✅ No Hallucination: Do NOT add content not present in the original.
✅ Bengali Spell Check: Verify special words like 'হাদঈ' and yuktakshars.
✅ Math Signs: Use × instead of *, use superscript numbers.
✅ Headers: Clean and concise, not messy OCR output.

After verification, return ONLY the final corrected JSON array. No explanations.
`;

// In-memory cache for HITL/Caching
const JSON_CACHE = new Map<string, DocumentBlock[]>();

export interface GeminiOcrOptions {
  base64Images: string[];
  language: OcrLanguage;
  model: GeminiModel;
  customCommand?: string;
  chunkSize?: number; // pages per API call
  onProgress?: (current: number, total: number, phase: string) => void;
}

/**
 * Main OCR function with multi-model, chunking, and progress support.
 */
export async function extractTextWithGemini(options: GeminiOcrOptions): Promise<DocumentBlock[]> {
  const { base64Images, language, model, customCommand, chunkSize = 5, onProgress } = options;

  const apiKey = await AsyncStorage.getItem('gemini_api_key');
  if (!apiKey) throw new Error('Gemini API Key missing. Go to Settings to add your key.');

  const allBlocks: DocumentBlock[] = [];
  const totalChunks = Math.ceil(base64Images.length / chunkSize);

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const start = chunkIdx * chunkSize;
    const end = Math.min(start + chunkSize, base64Images.length);
    const chunkImages = base64Images.slice(start, end);

    onProgress?.(chunkIdx + 1, totalChunks, `Processing chunk ${chunkIdx + 1}/${totalChunks}`);

    // Check cache
    const cacheKey = chunkImages.map(img => img.substring(0, 50)).join('_') + `_${language}_${model}`;
    if (JSON_CACHE.has(cacheKey)) {
      allBlocks.push(...JSON_CACHE.get(cacheKey)!);
      continue;
    }

    const langInstruction = getLanguageInstruction(language);
    let step1 = STEP_1_PROMPT;
    if (customCommand) {
      step1 += `\nUser Custom Command: ${customCommand}`;
    }

    const fullPrompt = `${SYSTEM_INSTRUCTION}\n\n${langInstruction}\n\n${step1}\n\n${STEP_2_QA}`;

    // Build parts: text prompt + all images in chunk
    const parts: any[] = [{ text: fullPrompt }];
    for (const img of chunkImages) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });
    }

    const payload = {
      contents: [{ parts }],
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errBody.substring(0, 200)}`);
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('Empty response from Gemini API');

    // Extract JSON from markdown code fence or raw
    const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : rawText;

    try {
      const parsed: DocumentBlock[] = JSON.parse(jsonString);
      JSON_CACHE.set(cacheKey, parsed);
      allBlocks.push(...parsed);
    } catch (parseErr) {
      throw new Error('Failed to parse Gemini response as JSON. The AI may have returned invalid format.');
    }
  }

  return allBlocks;
}

/**
 * Legacy single-image API for backward compatibility
 */
export async function extractSingleImage(
  base64Image: string,
  lang: OcrLanguage,
  model: GeminiModel = 'gemini-2.5-flash',
  customCommand?: string
): Promise<DocumentBlock[]> {
  return extractTextWithGemini({
    base64Images: [base64Image],
    language: lang,
    model,
    customCommand,
  });
}
