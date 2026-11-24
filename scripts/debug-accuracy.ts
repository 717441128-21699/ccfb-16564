/**
 * 全组合准确率诊断（不走 vitest 断言，只打印）：
 * npx tsx scripts/debug-accuracy.ts
 */
import '../tests/setup/canvasShim';
import { buildPageGroundTruth, PAGE_W, PAGE_H } from '../src/synth/sequence';
import { renderPage } from '../src/synth/render';
import { runPipeline } from '../src/vision/pipeline';
import { evaluatePage } from '../src/domain/evaluator';
import type { DegradationLevel, FontStyle } from '../src/domain/types';

const FONTS: FontStyle[] = ['fangti', 'yuanti', 'shouti'];
const DEGS: DegradationLevel[] = ['clean', 'normal', 'heavy'];

for (const font of FONTS) {
  for (const deg of DEGS) {
    const gt = buildPageGroundTruth(font, deg, 101);
    const canvas = new OffscreenCanvas(PAGE_W, PAGE_H);
    renderPage(gt, canvas);
    const t0 = Date.now();
    const result = runPipeline(canvas.transferToImageBitmap(), 'zheng');
    const ms = Date.now() - t0;
    const ev = evaluatePage(gt, result);
    const r = ev.report;
    console.log(
      `${font}/${deg}: 部件=${(r.componentAccuracy * 100).toFixed(1)}% ` +
      `省略=${(r.omissionAccuracy * 100).toFixed(1)}% 整字=${(r.wholeCharAccuracy * 100).toFixed(1)}% ` +
      `音高=${(r.pitchAccuracy * 100).toFixed(1)}% ${ms}ms`,
    );
    // 错误按槽位聚合
    const bySlot = new Map<string, number>();
    for (const e of ev.errors) bySlot.set(e.slot, (bySlot.get(e.slot) ?? 0) + 1);
    console.log('   错误槽位分布:', [...bySlot.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
  }
}
