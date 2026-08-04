/**
 * PPT 生成器（纯 Node，无 electron 依赖）
 *
 * 使用 pptxgenjs 在离线环境下生成 .pptx 文件。
 * executeTool 的 create_slide 分支调用本模块，便于单元测试。
 */
import pptxgen from 'pptxgenjs';
import { join, relative, isAbsolute } from 'path';
import { mkdirSync } from 'fs';

export interface SlideSpec {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  content?: string;
  layout?: 'cover' | 'bullets' | 'chart';
  chart?: { type?: string; labels?: string[]; values?: number[] };
}

export interface PptSpec {
  path?: string;
  title?: string;
  theme?: { background?: string; accent?: string };
  slides?: SlideSpec[];
}

/**
 * 生成 .pptx 文件到指定 workspace
 * @param workspace 工作区根目录
 * @param spec PPT 规格（path 相对 workspace）
 * @returns 输出文件绝对路径
 */
export async function buildPptx(workspace: string, spec: PptSpec): Promise<string> {
  // 拒绝绝对路径参数（明确防止绕过意图）
  const rawPath = spec.path || 'presentation.pptx';
  if (isAbsolute(rawPath)) {
    throw new Error('路径越界: 仅允许 workspace 内');
  }
  const filePath = join(workspace, rawPath);
  // 用 relative 判断越界：sibling-prefix（如 workspace-evil）和 ../ 逃逸都会被拒绝
  const rel = relative(workspace, filePath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('路径越界: 仅允许 workspace 内');
  }

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'MDH 智能体';
  pptx.title = spec.title || '演示文稿';

  const slides: SlideSpec[] = Array.isArray(spec.slides) ? spec.slides : [];
  if (slides.length === 0) {
    slides.push({ title: spec.title || '演示文稿', bullets: ['内容待补充'], layout: 'bullets' });
  }

  const bgColor = spec.theme?.background || 'FFFFFF';
  const accentColor = spec.theme?.accent || '4B0082';

  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: bgColor };
    const layout = s.layout || 'bullets';

    if (layout === 'cover') {
      slide.addText(s.title || '', {
        x: 0.8, y: 2.2, w: 11.7, h: 1.5,
        fontSize: 40, bold: true, color: accentColor, align: 'center',
      });
      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.8, y: 3.8, w: 11.7, h: 0.8,
          fontSize: 20, color: '666666', align: 'center',
        });
      }
    } else if (layout === 'chart') {
      slide.addText(s.title || '', {
        x: 0.8, y: 0.4, w: 11.7, h: 0.8,
        fontSize: 28, bold: true, color: accentColor,
      });
      const chartData = s.chart || { type: 'bar', labels: [], values: [] };
      const chartType = chartData.type === 'pie' ? 'pie' : 'bar';
      try {
        slide.addChart(
          (pptx.ShapeType as Record<string, unknown>)[chartType] as any,
          (chartData.labels || []).map((label: string, i: number) => ({
            name: label,
            labels: [label],
            values: [Number(chartData.values?.[i]) || 0],
          })),
          { x: 1.0, y: 1.6, w: 11.3, h: 5.2, showLegend: true, showTitle: false },
        );
      } catch {
        // 图表失败时回退为文字列表
        slide.addText(
          (chartData.labels || []).map((l: string, i: number) => `${l}: ${chartData.values?.[i] ?? ''}`).join('\n'),
          { x: 1.0, y: 1.6, w: 11.3, h: 5.2, fontSize: 18, color: '333333' },
        );
      }
    } else {
      // bullets 布局（默认）
      slide.addText(s.title || '', {
        x: 0.8, y: 0.4, w: 11.7, h: 0.8,
        fontSize: 28, bold: true, color: accentColor,
      });
      const bullets: string[] = Array.isArray(s.bullets) ? s.bullets : (s.content ? [s.content] : []);
      slide.addText(
        bullets.map(b => ({ text: b, options: { bullet: true, fontSize: 18, color: '333333', breakLine: true } })),
        { x: 0.8, y: 1.6, w: 11.7, h: 5.0, valign: 'top' },
      );
    }
  }

  mkdirSync(join(filePath, '..'), { recursive: true });
  await pptx.writeFile({ fileName: filePath });
  return filePath;
}
