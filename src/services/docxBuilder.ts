/**
 * Word 文档生成器（纯 Node，无 electron 依赖）
 *
 * 使用 docx 库在离线环境下生成真正的 .docx Word 文档。
 * executeTool 的 create_document 分支调用本模块，便于单元测试。
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';
import { join, relative, isAbsolute } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

export interface DocxSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  numbered?: string[];
  table?: { headers?: string[]; rows?: string[][] };
}

export interface DocxSpec {
  path?: string;
  title?: string;
  sections?: DocxSection[];
}

function buildBlocks(section: DocxSection): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];

  if (section.heading) {
    out.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: section.heading, bold: true })],
    }));
  }

  for (const p of section.paragraphs || []) {
    out.push(new Paragraph({ children: [new TextRun(p)] }));
  }

  for (const b of section.bullets || []) {
    out.push(new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun(b)],
    }));
  }

  for (const n of section.numbered || []) {
    out.push(new Paragraph({
      numbering: { reference: 'default', level: 0 },
      children: [new TextRun(n)],
    }));
  }

  if (section.table) {
    const headers = section.table.headers || [];
    const rows = section.table.rows || [];
    const tableRows = [
      ...(headers.length
        ? [headers.map(h => new Paragraph({ children: [new TextRun({ text: h, bold: true })] }))]
        : []),
      ...rows.map(r => r.map(c => new Paragraph({ children: [new TextRun(c)] }))),
    ];
    if (tableRows.length > 0) {
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows.map(cells => new TableRow({
          children: cells.map(cell => new TableCell({ children: [cell] })),
        })),
      }));
    }
  }

  return out;
}

/**
 * 生成 .docx 文件到指定 workspace
 * @param workspace 工作区根目录
 * @param spec 文档规格（path 相对 workspace）
 * @returns 输出文件绝对路径
 */
export async function buildDocx(workspace: string, spec: DocxSpec): Promise<string> {
  const rawPath = spec.path || 'document.docx';
  if (isAbsolute(rawPath)) {
    throw new Error('路径越界: 仅允许 workspace 内');
  }
  const filePath = join(workspace, rawPath);
  const rel = relative(workspace, filePath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('路径越界: 仅允许 workspace 内');
  }

  const sections: DocxSection[] = Array.isArray(spec.sections) ? spec.sections : [];
  const doc = new Document({
    numbering: {
      config: [
        { reference: 'default', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }] },
      ],
    },
    sections: [{
      children: [
        ...(spec.title
          ? [new Paragraph({
              heading: HeadingLevel.TITLE,
              children: [new TextRun({ text: spec.title, bold: true, size: 48 })],
            })]
          : []),
        ...(sections.length === 0
          ? [new Paragraph({ children: [new TextRun('（空文档）')] })]
          : sections.flatMap(s => buildBlocks(s))),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);

  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, buffer);
  return filePath;
}
