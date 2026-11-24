import { describe, expect, it } from 'vitest';
import { resolveAll, huiLabel, parseHuiLabel } from '../src/domain/resolver';
import type { RawRecognizedChar, SlotObservation } from '../src/domain/types';

function obs(slot: SlotObservation['slot'], label: string | null, score = 0.9): SlotObservation {
  return {
    slot,
    label,
    score,
    box: { x: 0, y: 0, w: 10, h: 10 },
  };
}

function rawChar(
  column: number,
  row: number,
  labels: Partial<Record<SlotObservation['slot'], string | null>>,
): RawRecognizedChar {
  const slots: SlotObservation['slot'][] = [
    'kindMark', 'leftFinger', 'hui', 'orn1', 'right', 'string', 'orn2',
  ];
  return {
    box: { x: column * 100, y: row * 100, w: 80, h: 80 },
    column,
    row,
    observations: slots.map((slot) => obs(slot, labels[slot] ?? null)),
  };
}

describe('承前消解', () => {
  it('列首缺槽位时回退到默认值而非中断管线', () => {
    const raws = [rawChar(0, 0, { right: 'gou', string: '3' })];
    expect(() => resolveAll(raws)).not.toThrow(); // kind 缺省回退 an
    const noRight = resolveAll([rawChar(0, 0, { string: '3' })]);
    // 右手指法缺失时回退到默认 gou，保证管线不中断（评测会计错）
    expect(noRight[0].resolved.right).toBe('gou');
    expect(noRight[0].resolved.string).toBe(3);
  });

  it('同列省略的右指与弦序承上一字', () => {
    const raws = [
      rawChar(0, 0, { right: 'tiao', string: '2', leftFinger: 'da', hui: '9' }),
      rawChar(0, 1, { leftFinger: 'da', hui: '9' }),
    ];
    const out = resolveAll(raws);
    expect(out[1].resolved.right).toBe('tiao');
    expect(out[1].resolved.string).toBe(2);
  });

  it('换列后不跨列承前', () => {
    const raws = [
      rawChar(0, 0, { right: 'tiao', string: '2', leftFinger: 'da', hui: '9' }),
      rawChar(1, 0, { right: 'gou', string: '5', leftFinger: 'ming', hui: '7' }),
      rawChar(1, 1, { leftFinger: 'ming', hui: '7' }),
    ];
    const out = resolveAll(raws);
    expect(out[2].resolved.right).toBe('gou');
    expect(out[2].resolved.string).toBe(5);
  });

  it('散音无左手徽位，泛音保留徽位', () => {
    const raws = [
      rawChar(0, 0, { kindMark: 'san', right: 'gou', string: '1' }),
      rawChar(0, 1, { kindMark: 'fan', right: 'mo', string: '4', hui: '7' }),
    ];
    const out = resolveAll(raws);
    expect(out[0].resolved.kind).toBe('san');
    expect(out[0].resolved.hui).toBeUndefined();
    expect(out[1].resolved.kind).toBe('fan');
    expect(out[1].resolved.hui).toEqual({ hui: 7, fen: 0 });
  });

  it('装饰记号不承前', () => {
    const raws = [
      rawChar(0, 0, { right: 'gou', string: '1', leftFinger: 'da', hui: '9', orn1: 'chuo' }),
      rawChar(0, 1, { right: 'gou', string: '1', leftFinger: 'da', hui: '9' }),
    ];
    const out = resolveAll(raws);
    expect(out[0].resolved.ornaments).toEqual(['chuo']);
    expect(out[1].resolved.ornaments).toEqual([]);
  });

  it('徽位标签往返', () => {
    expect(huiLabel(7, 6)).toBe('7-6');
    expect(parseHuiLabel('7-6')).toEqual({ hui: 7, fen: 6 });
    expect(parseHuiLabel('9')).toEqual({ hui: 9, fen: 0 });
  });
});
