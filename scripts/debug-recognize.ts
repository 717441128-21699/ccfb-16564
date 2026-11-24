/**
 * 识别器诊断：npx tsx scripts/debug-recognize.ts
 */
import '../tests/setup/canvasShim';
import { buildPageGroundTruth, PAGE_W, PAGE_H, slotLabel } from '../src/synth/sequence';
import { renderPage } from '../src/synth/render';
import { runPipeline } from '../src/vision/pipeline';
import { ALL_SLOTS } from '../src/vision/vocab';

const gt = buildPageGroundTruth('fangti', 'clean', 101);
const canvas = new OffscreenCanvas(PAGE_W, PAGE_H);
renderPage(gt, canvas);
const result = runPipeline(canvas.transferToImageBitmap(), 'zheng');

const recById = new Map(result.recognized.map((r) => [r.resolved.id, r]));
let printed = 0;
const scoreBuckets: Record<string, number[]> = {};

for (const ch of gt.chars) {
  const rec = recById.get(ch.id)!;
  for (const slot of ALL_SLOTS) {
    const expected = slotLabel(slot, ch);
    const obs = rec.raw.observations.find((o) => o.slot === slot)!;
    (scoreBuckets[slot] ??= []).push(obs.score);
    if (expected !== null && obs.label !== expected && printed < 25) {
      console.log(
        `${ch.id}.${slot} 期望=${expected} 实得=${obs.label} score=${obs.score.toFixed(3)}`,
      );
      printed++;
    }
  }
}
console.log('\n各槽位识别得分分布（非空样本）:');
for (const [slot, scores] of Object.entries(scoreBuckets)) {
  const sorted = [...scores].sort((a, b) => a - b);
  console.log(
    `${slot.padEnd(11)} min=${sorted[0].toFixed(3)} p25=${sorted[Math.floor(sorted.length * 0.25)].toFixed(3)} ` +
    `median=${sorted[Math.floor(sorted.length / 2)].toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}`,
  );
}
