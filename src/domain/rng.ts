/**
 * 可种子化伪随机数（mulberry32）——合成器需要可复现的页面。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0,1) 均匀分布 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min,max) 均匀整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)];
  }

  /** 概率 p 为真 */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 标准正态近似（Irwin–Hall） */
  gaussian(): number {
    return (
      this.next() + this.next() + this.next() + this.next() +
      this.next() + this.next() - 3
    );
  }
}
