/**
 * 端到端管线调试脚本：npx tsx scripts/debug-pipeline.ts
 */
import '../tests/setup/canvasShim';
import { buildPageGroundTruth, PAGE_W, PAGE_H } from '../src/synth/sequence';
import { renderPage } from '../src/synth/render';
import { separateColors } from '../src/vision/colorSep';
import { analyzeLayout } from '../src/vision/layout';
import { ZONES } from '../src/vision/vocab';

for (const font of ['fangti', 'yuanti', 'shouti'] as const) {
  for (const deg of ['clean', 'normal', 'heavy'] as const) {
    const gt = buildPageGroundTruth(font, deg, 101);
    const canvas = new OffscreenCanvas(PAGE_W, PAGE_H);
    renderPage(gt, canvas);
    const sep = separateColors(canvas.transferToImageBitmap());
    const layout = analyzeLayout(sep.inkMask, sep.width, sep.height);

    // 字框与真值框的中心偏差、尺寸比
    let dxSum = 0, dySum = 0, sizeRatioSum = 0;
    const n = Math.min(layout.charBoxes.length, gt.chars.length);
    for (let i = 0; i < n; i++) {
      const d = layout.charBoxes[i];
      const t = gt.chars[i].box;
      dxSum += Math.abs(d.x + d.w / 2 - (t.x + t.w / 2));
      dySum += Math.abs(d.y + d.h / 2 - (t.y + t.h / 2));
      sizeRatioSum += d.w / t.w;
    }

    // 首字各分区覆盖率
    const box = layout.charBoxes[0];
    const cov: Record<string, number> = {};
    if (box) {
      for (const [slot, z] of Object.entries(ZONES)) {
        const zx = Math.round(box.x + z.x * box.w);
        const zy = Math.round(box.y + z.y * box.h);
        const zw = Math.round(z.w * box.w);
        const zh = Math.round(z.h * box.h);
        let ink = 0;
        for (let y = 0; y < zh; y++)
          for (let x = 0; x < zw; x++)
            if (sep.inkMask[(zy + y) * PAGE_W + zx + x]) ink++;
        cov[slot] = Number((ink / (zw * zh)).toFixed(3));
      }
    }
    console.log(
      `${font}/${deg}: cols=${layout.columns.length} boxes=${layout.charBoxes.length} ` +
      `rowLines=${layout.rowLines.length} |dx|=${(dxSum / n).toFixed(1)} |dy|=${(dySum / n).toFixed(1)} ` +
      `sizeRatio=${(sizeRatioSum / n).toFixed(2)}`,
    );
    console.log('  char0 coverage:', cov, 'omitted:', gt.chars[0].omitted);
  }
}
