/**
 * 视觉管线编排：分色 → 版面 → 切字 → 识别 → 承前消解 → 音高。
 * 纯函数式入口，Worker 与主线程（评测）共用。
 */
import type {
  FontStyle,
  PipelineResult,
  RawRecognizedChar,
  StageTiming,
} from '../domain/types';
import { separateColors } from './colorSep';
import { analyzeLayout } from './layout';
import { CharRecognizer } from './recognizer';
import { resolveAll } from '../domain/resolver';
import { charsToNotes } from '../domain/tuning';

const FONTS: FontStyle[] = ['fangti', 'yuanti', 'shouti'];

export function runPipeline(
  bitmap: ImageBitmap | ImageData,
  tuningId: string,
  recognizer: CharRecognizer = new CharRecognizer(FONTS),
): PipelineResult {
  const timing: StageTiming = {
    segment: 0, layout: 0, cutChars: 0, recognize: 0, resolve: 0, pitch: 0, total: 0,
  };
  const t0 = performance.now();

  let t = performance.now();
  const sep = separateColors(bitmap);
  timing.segment = performance.now() - t;

  t = performance.now();
  const layout = analyzeLayout(sep.inkMask, sep.width, sep.height);
  timing.layout = performance.now() - t;
  timing.cutChars = timing.layout; // 切字在版面分析内完成

  t = performance.now();
  // 按列分组（charBoxes 已按列右→左、列内上→下排序），列内序号即行号
  const byColumn = new Map<number, RawRecognizedChar[]>();
  for (const box of layout.charBoxes) {
    const col = estimateColumn(box, layout.columns);
    const list = byColumn.get(col) ?? [];
    list.push(recognizer.recognize(sep.inkMask, sep.width, box, col, list.length));
    byColumn.set(col, list);
  }
  const raws: RawRecognizedChar[] = [...byColumn.values()].flat();
  timing.recognize = performance.now() - t;

  t = performance.now();
  const recognized = resolveAll(raws);
  timing.resolve = performance.now() - t;

  t = performance.now();
  const notes = charsToNotes(
    recognized.map((r) => r.resolved),
    tuningId,
  );
  timing.pitch = performance.now() - t;

  timing.total = performance.now() - t0;
  return {
    width: sep.width,
    height: sep.height,
    ink: sep.inkImage,
    red: sep.redImage,
    frame: layout.frame,
    columns: layout.columns,
    rowLines: layout.rowLines,
    charBoxes: layout.charBoxes,
    recognized,
    notes,
    timing,
  };
}

function estimateColumn(box: { x: number }, columns: { x: number; w: number }[]): number {
  let best = 0;
  let bestDist = Infinity;
  columns.forEach((c, i) => {
    const center = c.x + c.w / 2;
    const d = Math.abs(box.x - center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
