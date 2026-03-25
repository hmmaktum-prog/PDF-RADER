import * as docx from 'docx';
import { DocumentBlock } from './geminiService';

export interface DocxOptions {
  fontFamily?: string;
  lineSpacing?: number; // Twips: 240 = 1.0, 276 = 1.15, 360 = 1.5
  useEmojiBullets?: boolean;
}

const EMOJI_BULLETS = ['✨', '⭐', '✅', '📌', '💡', '🔹', '▪️', '➡️'];

function getAlignment(align?: string): (typeof docx.AlignmentType)[keyof typeof docx.AlignmentType] {
  switch (align) {
    case 'center': return docx.AlignmentType.CENTER;
    case 'right': return docx.AlignmentType.RIGHT;
    case 'justify': return docx.AlignmentType.JUSTIFIED;
    default: return docx.AlignmentType.LEFT;
  }
}

function getSeparatorBorderStyle(style?: string): (typeof docx.BorderStyle)[keyof typeof docx.BorderStyle] {
  switch (style) {
    case 'double': return docx.BorderStyle.DOUBLE;
    case 'dotted': return docx.BorderStyle.DOTTED;
    case 'dashed': return docx.BorderStyle.DASHED;
    default: return docx.BorderStyle.SINGLE;
  }
}

export async function generateDocxFromBlocks(blocks: DocumentBlock[], options: DocxOptions = {}): Promise<Blob> {
  const docxChildren: any[] = [];
  const defaultFont = options.fontFamily || 'Calibri';
  const spacingRules = options.lineSpacing ? { line: options.lineSpacing } : undefined;
  const useEmojis = options.useEmojiBullets ?? false;

  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
        docxChildren.push(new docx.Paragraph({
          spacing: spacingRules,
          children: [
            new docx.TextRun({
              text: block.content as string,
              bold: block.is_bold,
              italics: block.is_italic,
              underline: block.is_underline ? { type: docx.UnderlineType.SINGLE } : undefined,
              font: defaultFont,
              color: '000000',
            }),
          ],
          alignment: getAlignment(block.alignment),
        }));
        break;

      case 'separator':
        docxChildren.push(new docx.Paragraph({
          spacing: spacingRules,
          border: {
            bottom: {
              color: '000000',
              space: 1,
              style: getSeparatorBorderStyle(block.separator_style),
              size: 6,
            },
          },
        }));
        break;

      case 'list':
        if (Array.isArray(block.content)) {
          (block.content as string[]).forEach((item, idx) => {
            if (useEmojis) {
              // Colorful emoji bullet mode
              const emoji = EMOJI_BULLETS[idx % EMOJI_BULLETS.length];
              docxChildren.push(new docx.Paragraph({
                spacing: spacingRules,
                indent: { left: 720 }, // 0.5 inch
                children: [
                  new docx.TextRun({ text: `${emoji}  ${item}`, font: defaultFont }),
                ],
              }));
            } else {
              // Standard bullet mode
              docxChildren.push(new docx.Paragraph({
                spacing: spacingRules,
                children: [
                  new docx.TextRun({ text: item, font: defaultFont }),
                ],
                bullet: { level: 0 },
              }));
            }
          });
        }
        break;

      case 'table':
        if (Array.isArray(block.content)) {
          const tableData = block.content as string[][];
          const rows = tableData.map((rowData, rowIdx) => {
            return new docx.TableRow({
              children: rowData.map(cellData => new docx.TableCell({
                // First row gets header shading
                shading: rowIdx === 0
                  ? { fill: 'D9E2F3', type: docx.ShadingType.SOLID, color: 'auto' }
                  : { fill: 'FFFFFF', type: docx.ShadingType.SOLID, color: 'auto' },
                borders: {
                  top: { style: docx.BorderStyle.SINGLE, size: 2, color: '000000' },
                  bottom: { style: docx.BorderStyle.SINGLE, size: 2, color: '000000' },
                  left: { style: docx.BorderStyle.SINGLE, size: 2, color: '000000' },
                  right: { style: docx.BorderStyle.SINGLE, size: 2, color: '000000' },
                },
                verticalAlign: docx.VerticalAlign.CENTER,
                children: [
                  new docx.Paragraph({
                    children: [
                      new docx.TextRun({
                        text: cellData,
                        font: defaultFont,
                        bold: rowIdx === 0, // Bold header row
                      }),
                    ],
                  }),
                ],
              })),
            });
          });
          docxChildren.push(new docx.Table({ rows }));
        }
        break;

      case 'header':
        docxChildren.push(new docx.Paragraph({
          spacing: spacingRules,
          alignment: getAlignment(block.alignment || 'center'),
          children: [
            new docx.TextRun({
              text: block.content as string,
              size: 20, // 10pt as per blueprint
              bold: true,
              color: '333333',
              font: defaultFont,
            }),
          ],
        }));
        break;

      case 'footer':
        docxChildren.push(new docx.Paragraph({
          spacing: spacingRules,
          alignment: getAlignment(block.alignment || 'center'),
          children: [
            new docx.TextRun({
              text: block.content as string,
              size: 18, // 9pt as per blueprint
              color: '555555',
              font: defaultFont,
            }),
          ],
        }));
        break;

      case 'page_break':
        docxChildren.push(new docx.Paragraph({
          children: [new docx.PageBreak()],
        }));
        break;
    }
  }

  const doc = new docx.Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
          size: { width: 11906, height: 16838 }, // A4 in twips
        },
      },
      headers: {
        default: new docx.Header({
          children: [new docx.Paragraph({
            text: 'Generated by PDF Power Tools',
            alignment: docx.AlignmentType.CENTER,
          })],
        }),
      },
      footers: {
        default: new docx.Footer({
          children: [
            new docx.Paragraph({
              alignment: docx.AlignmentType.CENTER,
              children: [
                new docx.TextRun('পৃষ্ঠা '),
                new docx.TextRun({
                  children: [docx.PageNumber.CURRENT],
                }),
                new docx.TextRun(' / '),
                new docx.TextRun({
                  children: [docx.PageNumber.TOTAL_PAGES],
                }),
              ],
            }),
          ],
        }),
      },
      children: docxChildren,
    }],
  });

  return await docx.Packer.toBlob(doc);
}

/**
 * Generates a DOCX file and returns it as a base64 string.
 * Use this on React Native where Blob cannot be written to the file system directly.
 */
export async function generateDocxAsBase64(blocks: DocumentBlock[], options: DocxOptions = {}): Promise<string> {
  const blob = await generateDocxFromBlocks(blocks, options);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
