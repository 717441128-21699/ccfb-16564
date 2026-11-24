import { describe, expect, it } from 'vitest';
import { HUI_RATIO, huiToHarmonic, huiToRatio } from '../src/domain/hui';
import { frequencyToNoteName, charToNote, TUNINGS } from '../src/domain/tuning';
import type { JianziChar } from '../src/domain/types';

describe('徽位弦长比', () => {
  it('十三徽整徽比值与谐波节点一致', () => {
    expect(huiToRatio({ hui: 1, fen: 0 })).toBeCloseTo(1 / 8, 5);
    expect(huiToRatio({ hui: 7, fen: 0 })).toBeCloseTo(0.5, 5);
    expect(huiToRatio({ hui: 13, fen: 0 })).toBeCloseTo(7 / 8, 5);
    expect(huiToRatio({ hui: 9, fen: 0 })).toBeCloseTo(2 / 3, 5);
  });

  it('徽分在相邻整徽间插值', () => {
    const r7 = HUI_RATIO[6];
    const r8 = HUI_RATIO[7];
    expect(huiToRatio({ hui: 7, fen: 6 })).toBeCloseTo(r7 + ((r8 - r7) * 6) / 10, 5);
  });

  it('徽外取惯例比值', () => {
    expect(huiToRatio({ hui: 14, fen: 0 })).toBe(0.945);
  });

  it('泛音谐波序数', () => {
    expect(huiToHarmonic({ hui: 7, fen: 0 })).toBe(2);
    expect(huiToHarmonic({ hui: 1, fen: 0 })).toBe(8);
    expect(huiToHarmonic({ hui: 7, fen: 6 })).toBeNull();
    expect(huiToHarmonic({ hui: 14, fen: 0 })).toBeNull();
  });
});

describe('定弦与音高', () => {
  it('散音等于空弦频率', () => {
    const ch: JianziChar = baseChar({ kind: 'san', hui: undefined, left: undefined });
    const note = charToNote(ch, 'zheng');
    expect(note.frequency).toBeCloseTo(TUNINGS.zheng.openStrings[2], 1);
    expect(note.noteName).toBe('F2');
  });

  it('七徽按音为空弦八度', () => {
    const ch: JianziChar = baseChar({ string: 3, kind: 'an', hui: { hui: 7, fen: 0 } });
    const note = charToNote(ch, 'zheng');
    expect(note.frequency).toBeCloseTo(TUNINGS.zheng.openStrings[2] * 2, 2);
  });

  it('七徽泛音也是八度', () => {
    const ch: JianziChar = baseChar({ kind: 'fan', hui: { hui: 7, fen: 0 } });
    const note = charToNote(ch, 'zheng');
    expect(note.frequency).toBeCloseTo(TUNINGS.zheng.openStrings[2] * 2, 2);
    expect(note.harmonic).toBe(2);
  });

  it('音名换算', () => {
    expect(frequencyToNoteName(440).noteName).toBe('A4');
    expect(frequencyToNoteName(65.4064).noteName).toBe('C2');
  });

  it('蕤宾调五弦比正调紧半音', () => {
    const ratio = TUNINGS.ruibin.openStrings[4] / TUNINGS.zheng.openStrings[4];
    expect(ratio).toBeCloseTo(Math.pow(2, 1 / 12), 3);
  });
});

function baseChar(over: Partial<JianziChar>): JianziChar {
  return {
    id: 't',
    column: 0,
    row: 0,
    right: 'gou',
    string: 3,
    kind: 'an',
    left: 'da',
    hui: { hui: 7, fen: 0 },
    ornaments: [],
    ...over,
  };
}
