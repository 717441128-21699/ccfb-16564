/**
 * 评测：把管线输出与合成真值逐槽位、逐整字、逐音高对比。
 * 纯逻辑，不依赖 Canvas，可在浏览器与 Node 下运行。
 */
import type {
  CharGroundTruth,
  EvaluationReport,
  FontStyle,
  DegradationLevel,
  Note,
  PageGroundTruth,
  PipelineResult,
  RecognizedChar,
  SlotName,
} from '../domain/types';
import { ALL_SLOTS } from '../vision/vocab';
import { slotLabel } from '../synth/sequence';
import { huiLabel } from '../domain/resolver';

export interface PageEvaluation {
  report: Omit<EvaluationReport, 'fontStyle' | 'degradation' | 'pageCount'>;
  errors: CharError[];
}

export interface CharError {
  charId: string;
  slot: SlotName | 'whole' | 'pitch';
  expected: string | null;
  actual: string | null;
}

function recognizedSlotLabel(rec: RecognizedChar, slot: SlotName): string | null {
  const obs = rec.raw.observations.find((o) => o.slot === slot);
  return obs ? obs.label : null;
}

export function evaluatePage(gt: PageGroundTruth, result: PipelineResult): PageEvaluation {
  let componentTotal = 0, componentCorrect = 0;
  let omissionTotal = 0, omissionCorrect = 0;
  let wholeTotal = 0, wholeCorrect = 0;
  let pitchTotal = 0, pitchCorrect = 0;
  const errors: CharError[] = [];

  const recById = new Map(result.recognized.map((r) => [r.resolved.id, r]));
  const noteById = new Map(result.notes.map((n) => [n.charId, n]));

  for (const truth of gt.chars) {
    const rec = recById.get(truth.id);
    wholeTotal++;
    let wholeOk = true;

    for (const slot of ALL_SLOTS) {
      const expected = slotLabel(slot, truth);
      if (!rec) {
        wholeOk = false;
        errors.push({ charId: truth.id, slot, expected, actual: null });
        if (expected === null) omissionTotal++;
        else componentTotal++;
        continue;
      }
      const actual = recognizedSlotLabel(rec, slot);
      if (expected === null) {
        omissionTotal++;
        if (actual === null) omissionCorrect++;
        else {
          wholeOk = false;
          errors.push({ charId: truth.id, slot, expected, actual });
        }
      } else {
        componentTotal++;
        if (actual === expected) componentCorrect++;
        else {
          wholeOk = false;
          errors.push({ charId: truth.id, slot, expected, actual });
        }
      }
    }

    if (rec && wholeOk) wholeCorrect++;
    else if (!rec) errors.push({ charId: truth.id, slot: 'whole', expected: truth.id, actual: null });

    // 音高：±50 音分容差
    const note = noteById.get(truth.id);
    if (note) {
      pitchTotal++;
      const expectedNote = expectedFrequency(truth);
      if (expectedNote !== null) {
        const centsDiff = 1200 * Math.log2(note.frequency / expectedNote);
        if (Math.abs(centsDiff) <= 50) pitchCorrect++;
        else {
          errors.push({
            charId: truth.id,
            slot: 'pitch',
            expected: `${expectedNote.toFixed(1)}Hz`,
            actual: `${note.frequency.toFixed(1)}Hz`,
          });
        }
      }
    }
  }

  return {
    report: {
      charCount: gt.chars.length,
      componentAccuracy: componentTotal ? componentCorrect / componentTotal : 1,
      omissionAccuracy: omissionTotal ? omissionCorrect / omissionTotal : 1,
      wholeCharAccuracy: wholeTotal ? wholeCorrect / wholeTotal : 1,
      pitchAccuracy: pitchTotal ? pitchCorrect / pitchTotal : 1,
      avgLatencyMs: result.timing.total,
      maxLatencyMs: result.timing.total,
      detail: {
        componentTotal, componentCorrect,
        omissionTotal, omissionCorrect,
        wholeTotal, wholeCorrect,
        pitchTotal, pitchCorrect,
      },
    },
    errors,
  };
}

function expectedFrequency(ch: CharGroundTruth): number | null {
  // 延迟引入避免循环依赖
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return expectedFreqImpl(ch);
}

import { TUNINGS, DEFAULT_TUNING } from '../domain/tuning';
import { huiToHarmonic, huiToRatio } from '../domain/hui';

function expectedFreqImpl(ch: CharGroundTruth): number | null {
  const open = TUNINGS[DEFAULT_TUNING].openStrings[ch.string - 1];
  if (ch.kind === 'san') return open;
  if (!ch.hui) return null;
  if (ch.kind === 'fan') {
    const n = huiToHarmonic(ch.hui);
    return n === null ? null : open * n;
  }
  return open / huiToRatio(ch.hui);
}

export function aggregateReports(
  parts: { fontStyle: FontStyle; degradation: DegradationLevel; page: PageEvaluation; latency: number }[],
): EvaluationReport[] {
  const groups = new Map<string, typeof parts>();
  for (const p of parts) {
    const key = `${p.fontStyle}|${p.degradation}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  const reports: EvaluationReport[] = [];
  for (const [key, list] of groups) {
    const [fontStyle, degradation] = key.split('|') as [FontStyle, DegradationLevel];
    const sum = list.reduce(
      (acc, p) => {
        const d = p.page.report.detail;
        acc.componentTotal += d.componentTotal;
        acc.componentCorrect += d.componentCorrect;
        acc.omissionTotal += d.omissionTotal;
        acc.omissionCorrect += d.omissionCorrect;
        acc.wholeTotal += d.wholeTotal;
        acc.wholeCorrect += d.wholeCorrect;
        acc.pitchTotal += d.pitchTotal;
        acc.pitchCorrect += d.pitchCorrect;
        acc.charCount += p.page.report.charCount;
        acc.latency.push(p.latency);
        return acc;
      },
      {
        componentTotal: 0, componentCorrect: 0,
        omissionTotal: 0, omissionCorrect: 0,
        wholeTotal: 0, wholeCorrect: 0,
        pitchTotal: 0, pitchCorrect: 0,
        charCount: 0, latency: [] as number[],
      },
    );
    reports.push({
      fontStyle,
      degradation,
      pageCount: list.length,
      charCount: sum.charCount,
      componentAccuracy: sum.componentCorrect / sum.componentTotal,
      omissionAccuracy: sum.omissionCorrect / sum.omissionTotal,
      wholeCharAccuracy: sum.wholeCorrect / sum.wholeTotal,
      pitchAccuracy: sum.pitchCorrect / sum.pitchTotal,
      avgLatencyMs: sum.latency.reduce((a, b) => a + b, 0) / sum.latency.length,
      maxLatencyMs: Math.max(...sum.latency),
      detail: {
        componentTotal: sum.componentTotal, componentCorrect: sum.componentCorrect,
        omissionTotal: sum.omissionTotal, omissionCorrect: sum.omissionCorrect,
        wholeTotal: sum.wholeTotal, wholeCorrect: sum.wholeCorrect,
        pitchTotal: sum.pitchTotal, pitchCorrect: sum.pitchCorrect,
      },
    });
  }
  return reports;
}

export function describeNote(n: Note): string {
  const kindChar = n.kind === 'san' ? '散' : n.kind === 'fan' ? '泛' : '按';
  const hui = n.hui ? huiLabel(n.hui.hui, n.hui.fen) : '';
  return `${kindChar} ${n.string}弦 ${hui} ${n.noteName}(${n.frequency.toFixed(1)}Hz)`;
}
