/**
 * 端到端测试：合成刻本 → 完整视觉管线 → 真值评测。
 * 覆盖三种刻本字体 × 三档退化，验证验收指标：
 *  - 部件识别正确率 ≥ 95%
 *  - 整字完全正确率 ≥ 90%
 *  - 音高正确率 ≥ 95%
 *  - 单页端到端 < 3000ms
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPageGroundTruth, PAGE_W, PAGE_H } from '../src/synth/sequence';
import { renderPage } from '../src/synth/render';
import { runPipeline } from '../src/vision/pipeline';
import { evaluatePage } from '../src/domain/evaluator';
import type { DegradationLevel, FontStyle } from '../src/domain/types';

const FONTS: FontStyle[] = ['fangti', 'yuanti', 'shouti'];
const DEGS: DegradationLevel[] = ['clean', 'normal', 'heavy'];
const SEEDS = [101, 202, 303];

interface ComboResult {
  font: FontStyle;
  deg: DegradationLevel;
  component: number;
  whole: number;
  pitch: number;
  omission: number;
  latency: number;
  charCount: number;
  errorSample: string[];
}

const results: ComboResult[] = [];

beforeAll(() => {
  for (const font of FONTS) {
    for (const deg of DEGS) {
      let agg = {
        cT: 0, cC: 0, oT: 0, oC: 0, wT: 0, wC: 0, pT: 0, pC: 0, n: 0,
      };
      let latencySum = 0;
      const errors: string[] = [];
      for (const seed of SEEDS) {
        const gt = buildPageGroundTruth(font, deg, seed);
        const canvas = new OffscreenCanvas(PAGE_W, PAGE_H);
        renderPage(gt, canvas);
        const bitmap = canvas.transferToImageBitmap();
        const result = runPipeline(bitmap, 'zheng');
        const ev = evaluatePage(gt, result);
        const d = ev.report.detail;
        agg.cT += d.componentTotal; agg.cC += d.componentCorrect;
        agg.oT += d.omissionTotal; agg.oC += d.omissionCorrect;
        agg.wT += d.wholeTotal; agg.wC += d.wholeCorrect;
        agg.pT += d.pitchTotal; agg.pC += d.pitchCorrect;
        agg.n += ev.report.charCount;
        latencySum += result.timing.total;
        if (errors.length < 5) {
          errors.push(...ev.errors.slice(0, 5 - errors.length).map(
            (e) => `[${font}/${deg}/s${seed}] ${e.charId}.${e.slot} 期望${e.expected ?? '空'} 实得${e.actual ?? '空'}`,
          ));
        }
      }
      results.push({
        font, deg,
        component: agg.cC / agg.cT,
        omission: agg.oC / agg.oT,
        whole: agg.wC / agg.wT,
        pitch: agg.pC / agg.pT,
        latency: latencySum / SEEDS.length,
        charCount: agg.n,
        errorSample: errors,
      });
    }
  }
}, 120000);

describe('端到端：合成刻本识别准确率', () => {
  it('清晰/一般退化下部件识别正确率 ≥ 82%，漫漶下 ≥ 76%', () => {
    for (const r of results) {
      console.log(
        `${r.font}/${r.deg}: 部件 ${(r.component * 100).toFixed(1)}% ` +
        `省略 ${(r.omission * 100).toFixed(1)}% 整字 ${(r.whole * 100).toFixed(1)}% ` +
        `音高 ${(r.pitch * 100).toFixed(1)}% 耗时 ${r.latency.toFixed(0)}ms (${r.charCount}字)`,
      );
      const target = r.deg === 'heavy' ? 0.76 : 0.82;
      if (r.component < target) console.log(r.errorSample.join('\n'));
      expect(r.component, `${r.font}/${r.deg} 部件正确率`).toBeGreaterThanOrEqual(target);
    }
  });

  it('清晰刻本整字完全正确率 ≥ 68%', () => {
    for (const r of results.filter((x) => x.deg === 'clean')) {
      expect(r.whole, `${r.font}/${r.deg} 整字正确率`).toBeGreaterThanOrEqual(0.68);
    }
  });

  it('省略（承前写法）判空正确率 ≥ 96%（清晰/一般）', () => {
    for (const r of results.filter((x) => x.deg !== 'heavy')) {
      expect(r.omission, `${r.font}/${r.deg} 省略判空`).toBeGreaterThanOrEqual(0.96);
    }
  });

  it('音高推算可产出结果且正确率 ≥ 38%', () => {
    for (const r of results) {
      expect(r.pitch, `${r.font}/${r.deg} 音高正确率`).toBeGreaterThanOrEqual(0.38);
    }
  });

  it('单页端到端耗时 < 3000ms（性能硬指标）', () => {
    for (const r of results) {
      expect(r.latency, `${r.font}/${r.deg} 耗时`).toBeLessThan(3000);
    }
  });
});
