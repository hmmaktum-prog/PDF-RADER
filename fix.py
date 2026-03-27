import re

with open('mobile/app/utils/nativeModules.ts', 'r', encoding='utf-8') as f:
    text = f.read()

ensure_linked_str = """
async function ensureEngineLinked(engine: 'QPDF' | 'MuPDF', operation: string) {
  const isLinked = engine === 'QPDF' ? await isQpdfLinked() : await isMupdfLinked();
  if (!isLinked) {
    throw new Error(`${operation} failed: ${engine} engine is not linked in this build. Please provide the required .so libraries.`);
  }
}
"""

if 'ensureEngineLinked' not in text:
    text = re.sub(r'(export async function isMupdfLinked[^}]+?\})', r'\1\n' + ensure_linked_str, text, count=1)

qpdf_funcs = [
    'mergePdfs', 'splitPdf', 'compressPdf', 'rotatePdf', 'repairPdf', 'decryptPdf',
    'reorderPages', 'removePages', 'resizePdf', 'nupLayout', 'createBooklet',
    'fourUpBooklet', 'imagesToPdf'
]

mupdf_funcs = [
    'grayscalePdf', 'whiteningPdf', 'enhanceContrastPdf', 'invertColorsPdf',
    'geminiAiWhitening', 'getPageCount', 'renderPageToImage', 'batchRenderPages'
]

for f in qpdf_funcs:
    pattern = r'(export async function ' + f + r'\(.*?\): Promise<.*?> \{\n\s*ensureAndroid\([^)]+\);\n)'
    replacement = r'\1  await ensureEngineLinked(\'QPDF\', \'' + f + r'\');\n'
    text = re.sub(pattern, replacement, text, count=1, flags=re.DOTALL)

for f in mupdf_funcs:
    pattern = r'(export async function ' + f + r'\(.*?\): Promise<.*?> \{\n\s*ensureAndroid\([^)]+\);\n)'
    replacement = r'\1  await ensureEngineLinked(\'MuPDF\', \'' + f + r'\');\n'
    text = re.sub(pattern, replacement, text, count=1, flags=re.DOTALL)

merge_err_pat = r"if \(!result \|\| result === '__ENGINE_NOT_LINKED__'\) \{[\s\S]*?throw new Error\('Merge Failed: QPDF engine is not linked[^\}]*\}\n\s*\}"
merge_err_repl = r"""if (!result || result === '__ENGINE_NOT_LINKED__') {
    throw new Error('Merge Failed: QPDF engine encountered a fatal error during processing.');
  }"""
text = re.sub(merge_err_pat, merge_err_repl, text, flags=re.MULTILINE)

with open('mobile/app/utils/nativeModules.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print('Rewrite complete.')
