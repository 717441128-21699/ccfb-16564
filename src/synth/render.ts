/**
 * 合成刻本渲染：把 PageGroundTruth 画成带退化的扫描位图。
 * 墨色与朱色使用可分色的固定色值，退化后仍落在各自颜色域内。
 */
import type { DegradationLevel, PageGroundTruth, Rect, RedMark } from '../domain/types';
import { Rng } from '../domain/rng';
import { ZONES } from '../vision/vocab';
import { drawGlyph, getGlyph, type DrawCanvas, type DrawCtx } from '../vision/glyphs';
import { slotLabel } from './sequence';
import type { SlotName } from '../domain/types';

const INK = '#241f1a';
const INK_RGB = { r: 36, g: 31, b: 26 };
const RED = '#b03a2e';
const PAPER_LIGHT = { r: 236, g: 226, b: 201 };
const PAPER_DARK = { r: 214, g: 199, b: 168 };

interface DegradeParams {
  blur: number;
  noise: number;
  speckle: number;
  breakRate: number;
  jitter: number;
}

const DEGRADE: Record<DegradationLevel, DegradeParams> = {
  clean: { blur: 0, noise: 4, speckle: 40, breakRate: 0, jitter: 0.3 },
  normal: { blur: 0.9, noise: 10, speckle: 160, breakRate: 0.06, jitter: 0.9 },
  heavy: { blur: 1.8, noise: 18, speckle: 380, breakRate: 0.14, jitter: 1.6 },
};

/** 渲染整页，返回 canvas（浏览器/Worker 均可调用） */
export function renderPage(
  gt: PageGroundTruth,
  canvas: DrawCanvas,
): DrawCanvas {
  canvas.width = gt.width;
  canvas.height = gt.height;
  const ctx = canvas.getContext('2d')!;
  const rng = new Rng(gt.seed ^ 0x9e3779b9);
  const dp = DEGRADE[gt.degradation];

  // 纸张：纵向渐变 + 颗粒
  const grad = ctx.createLinearGradient(0, 0, gt.width, gt.height);
  grad.addColorStop(0, rgb(PAPER_LIGHT));
  grad.addColorStop(1, rgb(PAPER_DARK));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, gt.width, gt.height);
  addPaperGrain(ctx, gt.width, gt.height, rng, dp.noise);

  // 版框（双线）与行格
  drawFrame(ctx, gt.frame);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (const y of gt.rowLines) {
    ctx.beginPath();
    ctx.moveTo(gt.frame.x + 8, y);
    ctx.lineTo(gt.frame.x + gt.frame.w - 8, y);
    ctx.stroke();
  }

  // 减字
  for (const ch of gt.chars) {
    const slots = Object.keys(ZONES) as SlotName[];
    for (const slot of slots) {
      const label = slotLabel(slot, ch);
      if (label === null) continue;
      const z = ZONES[slot];
      const px = ch.box.x + z.x * ch.box.w + rng.gaussian() * dp.jitter;
      const py = ch.box.y + z.y * ch.box.h + rng.gaussian() * dp.jitter;
      const pw = z.w * ch.box.w;
      const ph = z.h * ch.box.h;
      const glyph = getGlyph(slot, label);
      const broken = breakStrokes(glyph, rng, dp.breakRate);
      drawGlyph(ctx, broken, px, py, pw, ph, gt.fontStyle, INK);
    }
  }

  // 朱笔
  drawRedMarks(ctx, gt.redMarks, rng);

  // 扫描退化：模糊 + 墨点 + 整页光照不均
  if (dp.blur > 0) applyBlur(ctx, canvas, dp.blur);
  addSpeckles(ctx, gt.width, gt.height, rng, dp.speckle);
  addVignette(ctx, gt.width, gt.height, rng);
  return canvas;
}

function rgb(c: { r: number; g: number; b: number }): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function drawFrame(ctx: DrawCtx, f: Rect): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(f.x, f.y, f.w, f.h);
  ctx.lineWidth = 1;
  ctx.strokeRect(f.x + 5, f.y + 5, f.w - 10, f.h - 10);
}

/** 按概率打断笔画：在折线中随机丢弃中段点对（模拟刻本断笔/漫漶） */
function breakStrokes(
  glyph: ReturnType<typeof getGlyph>,
  rng: Rng,
  rate: number,
): ReturnType<typeof getGlyph> {
  if (rate === 0) return glyph;
  return {
    ...glyph,
    strokes: glyph.strokes
      .map((st) => {
        if (st.pts.length < 3 || !rng.chance(rate)) return st;
        const cut = 1 + rng.int(0, st.pts.length - 2);
        return { pts: st.pts.filter((_, i) => i !== cut) };
      })
      .filter((st) => st.pts.length >= 2),
  };
}

function drawRedMarks(ctx: DrawCtx, marks: RedMark[], rng: Rng): void {
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  for (const m of marks) {
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    if (m.kind === 'judou') {
      // 句读：朱圈，略带缺口
      ctx.beginPath();
      const cx = m.box.x + m.box.w / 2;
      const cy = m.box.y + m.box.h / 2;
      const r = m.box.w / 2;
      const start = rng.next() * Math.PI;
      ctx.arc(cx, cy, r, start, start + Math.PI * 1.75);
      ctx.stroke();
    } else {
      // 旁注：竖排弯曲朱线模拟小字行
      const x = m.box.x + m.box.w / 2;
      ctx.beginPath();
      ctx.moveTo(x, m.box.y);
      const segs = 4;
      for (let i = 1; i <= segs; i++) {
        const y = m.box.y + (m.box.h * i) / segs;
        ctx.quadraticCurveTo(
          x + (rng.next() - 0.5) * 10,
          y - m.box.h / segs / 2,
          x + (rng.next() - 0.5) * 6,
          y,
        );
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 3, m.box.y + m.box.h + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function addPaperGrain(
  ctx: DrawCtx,
  w: number,
  h: number,
  rng: Rng,
  amp: number,
): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amp;
    d[i] = clamp(d[i] + n);
    d[i + 1] = clamp(d[i + 1] + n);
    d[i + 2] = clamp(d[i + 2] + n * 0.8);
  }
  ctx.putImageData(img, 0, 0);
}

function addSpeckles(
  ctx: DrawCtx,
  w: number,
  h: number,
  rng: Rng,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = rng.int(0, w);
    const y = rng.int(0, h);
    const r = rng.next() < 0.85 ? 1 : 1.5 + rng.next();
    ctx.fillStyle = `rgba(${INK_RGB.r},${INK_RGB.g},${INK_RGB.b},${0.25 + rng.next() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function addVignette(
  ctx: DrawCtx,
  w: number,
  h: number,
  rng: Rng,
): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(60,45,20,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  void rng;
}

/** 轻量盒式模糊（避免依赖 ctx.filter 在 Worker 中的兼容问题） */
function applyBlur(
  ctx: DrawCtx,
  canvas: DrawCanvas,
  radius: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  boxBlur(src.data, dst.data, w, h, radius);
  ctx.putImageData(dst, 0, 0);
}

function boxBlur(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        const i = (y * w + xx) * 4;
        rs += src[i]; gs += src[i + 1]; bs += src[i + 2]; as += src[i + 3]; n++;
      }
      const o = (y * w + x) * 4;
      tmp[o] = rs / n; tmp[o + 1] = gs / n; tmp[o + 2] = bs / n; tmp[o + 3] = as / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, as = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        const i = (yy * w + x) * 4;
        rs += tmp[i]; gs += tmp[i + 1]; bs += tmp[i + 2]; as += tmp[i + 3]; n++;
      }
      const o = (y * w + x) * 4;
      dst[o] = rs / n; dst[o + 1] = gs / n; dst[o + 2] = bs / n; dst[o + 3] = as / n;
    }
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
