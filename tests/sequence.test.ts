import { describe, expect, it } from 'vitest';
import { buildPageGroundTruth, generateCharSpecs, slotLabel } from '../src/synth/sequence';
import { Rng } from '../src/domain/rng';
import { ALL_SLOTS } from '../src/vision/vocab';
import type { PageGroundTruth } from '../src/domain/types';

describe('合成序列', () => {
  it('固定种子可复现', () => {
    const a = buildPageGroundTruth('fangti', 'normal', 123);
    const b = buildPageGroundTruth('fangti', 'normal', 123);
    expect(JSON.stringify(a.chars.map((c) => c.id))).toBe(
      JSON.stringify(b.chars.map((c) => c.id)),
    );
    expect(a.chars[5].right).toBe(b.chars[5].right);
  });

  it('每页 8 列 × 10 行共 80 字，框互不越出版框', () => {
    const gt = buildPageGroundTruth('yuanti', 'heavy', 7);
    expect(gt.chars).toHaveLength(80);
    expect(gt.columns).toHaveLength(8);
    for (const ch of gt.chars) {
      expect(ch.box.x).toBeGreaterThanOrEqual(gt.frame.x);
      expect(ch.box.x + ch.box.w).toBeLessThanOrEqual(gt.frame.x + gt.frame.w + 2);
    }
  });

  it('省略槽位与真值标签自洽：省略即 null，且列首不省必需槽位', () => {
    for (const font of ['fangti', 'yuanti', 'shouti'] as const) {
      const gt = buildPageGroundTruth(font, 'normal', 99);
      for (const ch of gt.chars) {
        for (const slot of ALL_SLOTS) {
          const label = slotLabel(slot, ch);
          if (ch.omitted.includes(slot)) expect(label).toBeNull();
        }
        if (ch.row === 0) {
          expect(ch.omitted).not.toContain('right');
          expect(ch.omitted).not.toContain('string');
        }
      }
    }
  });

  it('承前省略的部件必然与上一字相同（消解可还原）', () => {
    const rng = new Rng(42);
    const cols = generateCharSpecs(rng, 'normal');
    for (const col of cols) {
      for (let r = 1; r < col.length; r++) {
        const cur = col[r];
        const prev = col[r - 1];
        if (cur.omitted.includes('right')) expect(cur.right).toBe(prev.right);
        if (cur.omitted.includes('string')) expect(cur.string).toBe(prev.string);
        // 散音本无徽位/左手，跳过这两个槽位的承前比较
        if (cur.kind !== 'san') {
          if (cur.omitted.includes('hui')) expect(cur.hui).toEqual(prev.hui);
          if (cur.omitted.includes('leftFinger')) expect(cur.left).toBe(prev.left);
        }
      }
    }
  });

  it('朱笔句读与旁注均落在版框内', () => {
    const gt: PageGroundTruth = buildPageGroundTruth('shouti', 'heavy', 5);
    expect(gt.redMarks.length).toBeGreaterThan(0);
    for (const m of gt.redMarks) {
      expect(m.box.x).toBeGreaterThanOrEqual(gt.frame.x - 5);
      expect(m.box.y).toBeGreaterThanOrEqual(gt.frame.y - 5);
    }
  });
});
