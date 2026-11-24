/**
 * 页面三：减字拆解。
 * 左侧 Canvas：点选减字，高亮七个部件分区与识别标签；
 * 右侧：槽位识别结果、置信度、真值对照、人工修正（修正后重跑消解与音高）；
 * 底部：与合成真值的准确率评测。
 */
import type { JianziChar, SlotName } from '../../domain/types';
import type { AppState } from '../store';
import { getState, setState } from '../store';
import { drawImageBitmap, eventToCanvasPos, fillRect, pointInRect, strokeRect, drawLabel } from '../canvasUtil';
import { ZONES, ALL_SLOTS, candidatesFor } from '../../vision/vocab';
import { resolveAll } from '../../domain/resolver';
import { charsToNotes } from '../../domain/tuning';
import { evaluatePage } from '../../domain/evaluator';
import { slotLabel } from '../../synth/sequence';

const SLOT_CN: Record<SlotName, string> = {
  kindMark: '发声(散/泛)',
  leftFinger: '左手指法',
  hui: '徽位',
  orn1: '绰/注',
  right: '右手指法',
  string: '弦序',
  orn2: '吟猱等',
};

const ZONE_COLORS: Record<SlotName, string> = {
  kindMark: 'rgba(169,132,45,.28)',
  leftFinger: 'rgba(61,90,128,.25)',
  hui: 'rgba(140,74,47,.25)',
  orn1: 'rgba(120,90,160,.25)',
  right: 'rgba(77,122,77,.25)',
  string: 'rgba(176,58,46,.22)',
  orn2: 'rgba(60,140,150,.25)',
};

export function renderDecomposeView(s: AppState): HTMLElement {
  if (!s.bitmap || !s.result) return missing();
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="grid-3">
      <div class="card" id="left-panel"></div>
      <div class="card" id="canvas-panel"></div>
      <div class="card" id="right-panel"></div>
    </div>
    <div class="card" style="margin-top:16px;" id="eval-panel"></div>
  `;

  const selectedId = s.selectedCharId ?? s.result.recognized[0]?.resolved.id ?? null;
  if (selectedId && !s.selectedCharId) setState({ selectedCharId: selectedId });

  buildCanvasPanel(root.querySelector<HTMLElement>('#canvas-panel')!, s, selectedId);
  buildLeftPanel(root.querySelector<HTMLElement>('#left-panel')!, s, selectedId);
  buildRightPanel(root.querySelector<HTMLElement>('#right-panel')!, s, selectedId);
  buildEvalPanel(root.querySelector<HTMLElement>('#eval-panel')!, s);

  return root;
}

function buildCanvasPanel(host: HTMLElement, s: AppState, selectedId: string | null): void {
  host.innerHTML = `<h2 class="section-title">刻本 Canvas（点击减字查看部件）</h2>`;
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  host.appendChild(wrap);
  drawImageBitmap(canvas, s.bitmap!);

  const paint = (selId: string | null) => {
    drawImageBitmap(canvas, s.bitmap!);
    const ctx = canvas.getContext('2d')!;
    const r = s.result!;
    for (const rec of r.recognized) {
      const selected = rec.resolved.id === selId;
      strokeRect(ctx, rec.box, selected ? '#b03a2e' : 'rgba(77,122,77,.7)', selected ? 2.5 : 1);
      if (selected) {
        for (const slot of ALL_SLOTS) {
          const z = ZONES[slot];
          const zone = {
            x: rec.box.x + z.x * rec.box.w,
            y: rec.box.y + z.y * rec.box.h,
            w: z.w * rec.box.w,
            h: z.h * rec.box.h,
          };
          fillRect(ctx, zone, ZONE_COLORS[slot]);
          strokeRect(ctx, zone, 'rgba(43,38,32,.55)', 1);
          const obs = rec.raw.observations.find((o) => o.slot === slot);
          if (obs?.label) drawLabel(ctx, obs.label, zone.x, zone.y, '#2b2620');
        }
      }
    }
  };
  paint(selectedId);

  canvas.onclick = (ev) => {
    const pos = eventToCanvasPos(ev, canvas);
    const hit = s.result!.recognized.find((rec) => pointInRect(pos.x, pos.y, rec.box));
    if (hit) {
      setState({ selectedCharId: hit.resolved.id });
    }
  };
}

function buildLeftPanel(host: HTMLElement, s: AppState, selectedId: string | null): void {
  const rec = s.result!.recognized.find((r) => r.resolved.id === selectedId);
  host.innerHTML = `<h2 class="section-title">字列导航</h2>`;
  const list = document.createElement('div');
  list.className = 'note-list';
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>列</th><th>行</th><th>弦</th><th>发声</th><th>右指</th></tr></thead>`;
  const tb = document.createElement('tbody');
  for (const r of s.result!.recognized) {
    const tr = document.createElement('tr');
    if (r.resolved.id === selectedId) tr.className = 'selected';
    tr.innerHTML = `
      <td>${r.resolved.column + 1}</td>
      <td>${r.resolved.row + 1}</td>
      <td>${r.resolved.string}</td>
      <td><span class="tag ${r.resolved.kind}">${kindCn(r.resolved.kind)}</span></td>
      <td>${r.resolved.right}</td>`;
    tr.onclick = () => setState({ selectedCharId: r.resolved.id });
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  list.appendChild(table);
  host.appendChild(list);
  void rec;
}

function buildRightPanel(host: HTMLElement, s: AppState, selectedId: string | null): void {
  const rec = s.result!.recognized.find((r) => r.resolved.id === selectedId);
  if (!rec) {
    host.textContent = '未选中减字';
    return;
  }
  const gt = s.groundTruth?.chars.find((c) => c.id === selectedId) ?? null;
  host.innerHTML = `
    <h2 class="section-title">部件拆解 · 第${rec.resolved.column + 1}列第${rec.resolved.row + 1}字</h2>
    <div class="slot-editor" id="slot-editor"></div>
    <div style="margin-top:14px;display:flex;gap:8px;">
      <button class="btn small" id="btn-apply">应用修正并重算</button>
      <button class="btn ghost small" id="btn-reset">重置本字</button>
    </div>
    <div id="resolved-view" style="margin-top:16px;"></div>
  `;
  const editor = host.querySelector<HTMLElement>('#slot-editor')!;

  for (const slot of ALL_SLOTS) {
    const obs = rec.raw.observations.find((o) => o.slot === slot)!;
    const truth = gt ? slotLabel(slot, gt) : undefined;
    const corrected = s.corrections[selectedId!]?.[slot];
    const shown = corrected !== undefined ? corrected : obs.label;
    const isWrong = truth !== undefined && truth !== shown;

    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `
      <span class="slot-name">${SLOT_CN[slot]}</span>
      <div>
        <select data-slot="${slot}">
          <option value="">（空/省略）</option>
        </select>
        <div class="muted" style="margin-top:2px;">
          识别置信度 ${(obs.score * 100).toFixed(0)}%
          ${truth !== undefined ? `｜真值 <b class="${isWrong ? 'tag err' : ''}">${truth ?? '空'}</b>` : ''}
          ${isWrong ? '｜<span style="color:var(--red)">✗</span>' : truth !== undefined ? '｜<span style="color:var(--green)">✓</span>' : ''}
        </div>
      </div>`;
    const select = row.querySelector<HTMLSelectElement>('select')!;
    const labels = candidateLabels(slot);
    for (const lab of labels) {
      const opt = document.createElement('option');
      opt.value = lab;
      opt.textContent = lab;
      if (lab === (shown ?? '')) opt.selected = true;
    }
    select.onchange = () => {
      const corrections = { ...getState().corrections };
      const perChar = { ...(corrections[selectedId!] ?? {}) };
      perChar[slot] = select.value === '' ? null : select.value;
      corrections[selectedId!] = perChar;
      setState({ corrections });
    };
    editor.appendChild(row);
  }

  host.querySelector<HTMLButtonElement>('#btn-apply')!.onclick = () => applyCorrections(s);
  host.querySelector<HTMLButtonElement>('#btn-reset')!.onclick = () => {
    const corrections = { ...getState().corrections };
    delete corrections[selectedId!];
    setState({ corrections });
    applyCorrections(getState());
  };

  renderResolved(host.querySelector<HTMLElement>('#resolved-view')!, rec.resolved);
}

function candidateLabels(slot: SlotName): string[] {
  return candidatesFor(slot);
}

function applyCorrections(s: AppState): void {
  // 以修正覆盖原始 observation，重跑承前消解与音高
  const raws = s.result!.recognized.map((r) => ({
    ...r.raw,
    observations: r.raw.observations.map((o) => {
      const fix = s.corrections[r.resolved.id]?.[o.slot];
      return fix === undefined ? o : { ...o, label: fix };
    }),
  }));
  const recognized = resolveAll(raws);
  const notes = charsToNotes(recognized.map((r) => r.resolved), s.tuningId);
  setState({
    result: { ...s.result!, recognized, notes },
  });
}

function renderResolved(host: HTMLElement, ch: JianziChar): void {
  const hui = ch.hui ? `${ch.hui.hui}徽${ch.hui.fen ? ch.hui.fen + '分' : ''}` : '—';
  host.innerHTML = `
    <h2 class="section-title">消解后语义</h2>
    <table>
      <tr><th>发声</th><td><span class="tag ${ch.kind}">${kindCn(ch.kind)}</span></td></tr>
      <tr><th>弦序</th><td>${ch.string} 弦</td></tr>
      <tr><th>右手指法</th><td>${ch.right}</td></tr>
      <tr><th>左手指法</th><td>${ch.left ?? '—'}</td></tr>
      <tr><th>徽位</th><td>${hui}</td></tr>
      <tr><th>装饰</th><td>${ch.ornaments.join('、') || '无'}</td></tr>
    </table>
    <p class="muted" style="margin-top:8px;">承前消解：同列内被省略的右指/弦/左手/徽位/散泛标记沿用上一字。</p>
  `;
}

function buildEvalPanel(host: HTMLElement, s: AppState): void {
  if (!s.groundTruth) {
    host.innerHTML = `<h2 class="section-title">准确率评测</h2><p class="muted">外部扫描件无部件真值，无法评测。请在导入页使用合成刻本。</p>`;
    return;
  }
  const ev = evaluatePage(s.groundTruth, s.result!);
  const r = ev.report;
  const cls = (v: number, threshold: number) => (v >= threshold ? 'good' : 'bad');
  host.innerHTML = `
    <h2 class="section-title">准确率评测（与合成真值逐槽位对照）
      <button class="btn small secondary" id="btn-export" style="float:right;">导出评测 JSON</button>
    </h2>
    <div class="metric-grid" style="grid-template-columns:repeat(5,1fr);">
      <div class="metric ${cls(r.componentAccuracy, 0.95)}">
        <div class="v">${(r.componentAccuracy * 100).toFixed(1)}%</div>
        <div class="k">部件识别正确率<br/>${r.detail.componentCorrect}/${r.detail.componentTotal}（目标≥95%）</div>
      </div>
      <div class="metric ${cls(r.omissionAccuracy, 0.95)}">
        <div class="v">${(r.omissionAccuracy * 100).toFixed(1)}%</div>
        <div class="k">省略判空正确率<br/>${r.detail.omissionCorrect}/${r.detail.omissionTotal}</div>
      </div>
      <div class="metric ${cls(r.wholeCharAccuracy, 0.9)}">
        <div class="v">${(r.wholeCharAccuracy * 100).toFixed(1)}%</div>
        <div class="k">整字完全正确率<br/>${r.detail.wholeCorrect}/${r.detail.wholeTotal}（目标≥90%）</div>
      </div>
      <div class="metric ${cls(r.pitchAccuracy, 0.95)}">
        <div class="v">${(r.pitchAccuracy * 100).toFixed(1)}%</div>
        <div class="k">音高正确率(±50音分)<br/>${r.detail.pitchCorrect}/${r.detail.pitchTotal}</div>
      </div>
      <div class="metric">
        <div class="v">${r.avgLatencyMs.toFixed(0)}ms</div>
        <div class="k">端到端管线耗时<br/>（目标 &lt;3000ms）</div>
      </div>
    </div>
    <details style="margin-top:12px;">
      <summary class="muted" style="cursor:pointer;">错误明细（${ev.errors.length} 条）</summary>
      <table class="eval-table" style="margin-top:8px;">
        <thead><tr><th>字</th><th>槽位/项</th><th>真值</th><th>识别</th></tr></thead>
        <tbody>
          ${ev.errors
            .slice(0, 100)
            .map(
              (e) => `<tr><td>${e.charId}</td><td>${e.slot}</td>
                <td class="ok">${e.expected ?? '空'}</td>
                <td class="fail">${e.actual ?? '空'}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </details>
  `;
  host.querySelector<HTMLButtonElement>('#btn-export')!.onclick = () => {
    const blob = new Blob([JSON.stringify({ report: r, errors: ev.errors }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `evaluation-${s.groundTruth!.fontStyle}-${s.groundTruth!.degradation}-${s.groundTruth!.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

function kindCn(k: string): string {
  return k === 'san' ? '散' : k === 'fan' ? '泛' : '按';
}

function missing(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'card';
  div.textContent = '请先运行识别管线。';
  return div;
}
