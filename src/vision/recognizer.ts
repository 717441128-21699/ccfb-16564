/**
 * 减字部件识别器。
 *
 * 思路（无外部模型，全部在 Worker 内完成）：
 *  1. 用与合成器相同的笔画库，把每种字体风格下每个候选标签渲染成二值模板，
 *     并生成 ±1px 亚像素平移的多模板，覆盖合成端的位置抖动；
 *  2. 字框按固定归一化分区取局部墨掩膜，双线性缩放到模板尺寸；
 *  3. 覆盖率先判空（省略槽位）；非空则取多模板中的最高双向覆盖率。
 */
import type {
  FontStyle,
  RawRecognizedChar,
  Rect,
  SlotObservation,
  SlotName,
} from '../domain/types';
import { ALL_SLOTS, ZONES, candidatesFor } from './vocab';
import { drawGlyph, getGlyph } from './glyphs';

const TPL_SIZE = 32;
/** 判空覆盖率阈值 */
const EMPTY_RATIO = 0.03;

type Mask = Uint8Array;
/** 预计算两级膨胀的掩膜（模板与提取块共用） */
interface Prepared {
  raw: Mask;
  d1: Mask;
  d2: Mask;
  ink: number;
}
type PreparedTemplate = Prepared;
type PreparedPatch = Prepared;

/** 各槽位接受匹配的最低相似度（小尺寸数字/标记适当放宽） */
const MIN_SIM: Partial<Record<SlotName, number>> = {
  string: 0.5,
  kindMark: 0.5,
  orn1: 0.5,
  orn2: 0.5,
  hui: 0.55,
  leftFinger: 0.6,
  right: 0.6,
};

/** 亚像素平移量（覆盖合成端 jitter 与光栅化差异），只保留轴向以控制模板数量 */
const SHIFTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1.0, 0],
  [-1.0, 0],
  [0, 1.0],
  [0, -1.0],
];

/**
 * 形态学变体：
 *  - 原样：对应清晰刻本
 *  - 腐蚀一次：模拟模糊/洇墨导致笔画变粗时，模板收缩后仍能匹配
 *  - 膨胀一次：模拟断笔/漫漶导致笔画变细时，模板扩张后覆盖缺口
 */
type Morph = 'raw' | 'erode' | 'dilate';

/** 全识别器共享的模板库（按字体缓存，进程内只渲染一次） */
const LIBRARY_CACHE = new Map<string, TemplateLibrary>();

class TemplateLibrary {
  private cache = new Map<string, PreparedTemplate[]>();

  constructor(private font: FontStyle) {}

  static forFont(font: FontStyle): TemplateLibrary {
    let lib = LIBRARY_CACHE.get(font);
    if (!lib) {
      lib = new TemplateLibrary(font);
      LIBRARY_CACHE.set(font, lib);
    }
    return lib;
  }

  private render(label: string, slot: SlotName): Prepared[] {
    const key = `${this.font}:${slot}:${label}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const prepared: Prepared[] = [];

    // 原样字形：5 个轴向平移，覆盖 jitter 与光栅化差异
    for (const [dx, dy] of SHIFTS) {
      prepared.push(this.rasterize(slot, label, dx, dy, 'raw'));
    }
    // 形态学变体：只做零平移（位置漂移交给相似度的两级膨胀软匹配）
    prepared.push(this.rasterize(slot, label, 0, 0, 'erode'));
    prepared.push(this.rasterize(slot, label, 0, 0, 'dilate'));

    this.cache.set(key, prepared);
    return prepared;
  }

  private rasterize(
    slot: SlotName,
    label: string,
    dx: number,
    dy: number,
    morph: Morph,
  ): Prepared {
    const canvas = new OffscreenCanvas(TPL_SIZE, TPL_SIZE);
    const ctx = canvas.getContext('2d')! as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TPL_SIZE, TPL_SIZE);
    ctx.save();
    ctx.translate(dx, dy);
    drawGlyph(ctx, getGlyph(slot, label), 0, 0, TPL_SIZE, TPL_SIZE, this.font, '#000');
    ctx.restore();
    const data = ctx.getImageData(0, 0, TPL_SIZE, TPL_SIZE).data;
    const base: Mask = new Uint8Array(TPL_SIZE * TPL_SIZE);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      base[p] = data[i] < 128 ? 1 : 0;
    }
    const mask: Mask =
      morph === 'erode' ? erode(base) : morph === 'dilate' ? dilate(base, 1) : base;
    const d1 = dilate(mask, 1);
    return { raw: mask, d1, d2: dilate(d1, 1), ink: inkCount(mask) };
  }

  match(slot: SlotName, patch: PreparedPatch): { label: string | null; score: number } {
    let bestLabel: string | null = null;
    let bestScore = 0;
    for (const label of candidatesFor(slot)) {
      let labelBest = 0;
      for (const tpl of this.render(label, slot)) {
        const s = similarity(patch, tpl);
        if (s > labelBest) labelBest = s;
      }
      if (labelBest > bestScore) {
        bestScore = labelBest;
        bestLabel = label;
      }
    }
    const threshold = MIN_SIM[slot] ?? 0.55;
    if (bestScore < threshold) return { label: null, score: bestScore };
    return { label: bestLabel, score: bestScore };
  }
}

/** 提取块预计算两级膨胀（d2 在 d1 基础上再膨胀，避免从原图重复计算） */
function prepare(mask: Mask): Prepared {
  const d1 = dilate(mask, 1);
  return { raw: mask, d1, d2: dilate(d1, 1), ink: inkCount(mask) };
}

/**
 * 相似度 = 双向覆盖率的调和均值（F1）。
 * 两级膨胀（1px/2px）软匹配：1px 内记满分，2px 内记半分。
 * 膨胀掩膜已预计算，本函数只做逐像素计数。
 */
function similarity(a: Prepared, b: Prepared): number {
  let aScore = 0;
  let bScore = 0;
  for (let i = 0; i < a.raw.length; i++) {
    if (a.raw[i]) {
      if (b.d1[i]) aScore += 1;
      else if (b.d2[i]) aScore += 0.5;
    }
    if (b.raw[i]) {
      if (a.d1[i]) bScore += 1;
      else if (a.d2[i]) bScore += 0.5;
    }
  }
  const recall = a.ink === 0 ? 0 : aScore / a.ink;
  const precision = b.ink === 0 ? 0 : bScore / b.ink;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function inkCount(m: Mask): number {
  let n = 0;
  for (const v of m) n += v;
  return n;
}

/** 4 邻域腐蚀（笔画收缩，模拟洇墨/模糊后的反向匹配） */
function erode(m: Mask): Mask {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < TPL_SIZE; y++) {
    for (let x = 0; x < TPL_SIZE; x++) {
      const i = y * TPL_SIZE + x;
      if (!m[i]) continue;
      const border =
        x === 0 || x === TPL_SIZE - 1 || y === 0 || y === TPL_SIZE - 1;
      if (border) continue;
      if (m[i - 1] && m[i + 1] && m[i - TPL_SIZE] && m[i + TPL_SIZE]) out[i] = 1;
    }
  }
  return out;
}

/** 4 邻域膨胀（容错 1px 级错位） */
function dilate(m: Mask, radius = 1): Mask {
  let cur = m;
  for (let r = 0; r < radius; r++) {
    const out = new Uint8Array(cur.length);
    for (let y = 0; y < TPL_SIZE; y++) {
      for (let x = 0; x < TPL_SIZE; x++) {
        const i = y * TPL_SIZE + x;
        if (!cur[i]) continue;
        out[i] = 1;
        if (x > 0) out[i - 1] = 1;
        if (x < TPL_SIZE - 1) out[i + 1] = 1;
        if (y > 0) out[i - TPL_SIZE] = 1;
        if (y < TPL_SIZE - 1) out[i + TPL_SIZE] = 1;
      }
    }
    cur = out;
  }
  return cur;
}

/** 双线性缩放二值墨掩膜到模板尺寸（Node/浏览器行为一致） */
function resizeMask(
  src: Uint8Array,
  sw: number,
  sh: number,
  size: number,
): Mask {
  const out = new Uint8Array(size * size);
  for (let ty = 0; ty < size; ty++) {
    const fy = ((ty + 0.5) * sh) / size - 0.5;
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let tx = 0; tx < size; tx++) {
      const fx = ((tx + 0.5) * sw) / size - 0.5;
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const v =
        src[y0 * sw + x0] * (1 - wx) * (1 - wy) +
        src[y0 * sw + x1] * wx * (1 - wy) +
        src[y1 * sw + x0] * (1 - wx) * wy +
        src[y1 * sw + x1] * wx * wy;
      if (v > 0.35) out[ty * size + tx] = 1;
    }
  }
  return out;
}

/** 取字框内某分区的墨掩膜，双线性归一化到模板尺寸 */
function extractZone(
  pageMask: Uint8Array,
  pageW: number,
  charBox: Rect,
  slot: SlotName,
): { mask: Mask; zone: Rect; coverage: number } {
  const z = ZONES[slot];
  const zone: Rect = {
    x: Math.round(charBox.x + z.x * charBox.w),
    y: Math.round(charBox.y + z.y * charBox.h),
    w: Math.round(z.w * charBox.w),
    h: Math.round(z.h * charBox.h),
  };
  let ink = 0;
  const src = new Uint8Array(zone.w * zone.h);
  for (let yy = 0; yy < zone.h; yy++) {
    for (let xx = 0; xx < zone.w; xx++) {
      const on = pageMask[(zone.y + yy) * pageW + zone.x + xx] === 1;
      src[yy * zone.w + xx] = on ? 1 : 0;
      if (on) ink++;
    }
  }
  const mask = resizeMask(src, zone.w, zone.h, TPL_SIZE);
  return { mask, zone, coverage: ink / (zone.w * zone.h) };
}

export class CharRecognizer {
  private fonts: FontStyle[];

  constructor(fonts: FontStyle[]) {
    this.fonts = fonts;
  }

  /** 识别一个字；对三种字体各跑一遍，取最高相似度 */
  recognize(
    pageMask: Uint8Array,
    pageW: number,
    charBox: Rect,
    column: number,
    row: number,
  ): RawRecognizedChar {
    const observations: SlotObservation[] = [];

    for (const slot of ALL_SLOTS) {
      const { mask, zone, coverage } = extractZone(pageMask, pageW, charBox, slot);
      if (coverage < EMPTY_RATIO) {
        observations.push({ slot, label: null, score: 1 - coverage / EMPTY_RATIO, box: zone });
        continue;
      }
      const patch = prepare(mask);
      let best: { label: string | null; score: number } = { label: null, score: 0 };
      for (const font of this.fonts) {
        const r = TemplateLibrary.forFont(font).match(slot, patch);
        if (r.score > best.score) best = r;
      }
      observations.push({ slot, label: best.label, score: best.score, box: zone });
    }

    return { box: charBox, column, row, observations };
  }
}
