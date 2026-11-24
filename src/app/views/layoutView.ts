/**
 * 页面二：版面切分。
 * 图层：原图 / 墨色层 / 朱色层；覆盖：版框、列框、行格、字框。
 */
import type { AppState } from '../store';
import { getState, setState } from '../store';
import { drawImageBitmap, strokeRect } from '../canvasUtil';

type Layer = 'original' | 'ink' | 'red';
type Overlay = 'frame' | 'columns' | 'rows' | 'chars';

export function renderLayoutView(s: AppState): HTMLElement {
  if (!s.bitmap || !s.result) return missing();

  const root = document.createElement('div');
  root.className = 'grid-2';
  let layer: Layer = 'original';
  const overlays = new Set<Overlay>(['frame', 'columns', 'chars']);

  const panel = document.createElement('div');
  panel.className = 'card';
  panel.innerHTML = `
    <h2 class="section-title">分色图层</h2>
    <div class="layer-tabs" id="layer-tabs">
      <button data-layer="original" class="active">原始刻本</button>
      <button data-layer="ink">墨色层</button>
      <button data-layer="red">朱笔层</button>
    </div>
    <p class="muted">朱墨按 RGB 色差与亮度联合判据分离；句读朱圈、旁注朱线进入朱色层。</p>

    <h2 class="section-title" style="margin-top:18px;">版面覆盖层</h2>
    <div class="pill-row" id="overlay-pills">
      <span class="pill on" data-o="frame">版框</span>
      <span class="pill on" data-o="columns">列框</span>
      <span class="pill" data-o="rows">行格线</span>
      <span class="pill on" data-o="chars">切字框</span>
    </div>
    <div class="legend" style="margin-top:10px;">
      <span><i style="background:#b03a2e"></i>版框</span>
      <span><i style="background:#3d5a80"></i>列</span>
      <span><i style="background:#a9842d"></i>行格</span>
      <span><i style="background:#4d7a4d"></i>字框（${s.result.charBoxes.length}）</span>
    </div>

    <h2 class="section-title" style="margin-top:18px;">检测结果</h2>
    <div class="metric-grid">
      <div class="metric"><div class="v">${s.result.columns.length}</div><div class="k">列</div></div>
      <div class="metric"><div class="v">${s.result.rowLines.length}</div><div class="k">行格线</div></div>
      <div class="metric"><div class="v">${s.result.charBoxes.length}</div><div class="k">切出减字</div></div>
      <div class="metric"><div class="v">${s.result.timing.layout.toFixed(0)}ms</div><div class="k">版面分析耗时</div></div>
    </div>

    <h2 class="section-title" style="margin-top:18px;">投影法说明</h2>
    <p class="muted">先以长直线投影锁定双线版框并擦除，再对框内做列向投影分段得到列；
    列内纵向投影分段得到每个减字的包围盒，阅读顺序按列从右至左、列内自上而下。</p>

    <div style="margin-top:18px;display:flex;gap:8px;">
      <button class="btn" id="btn-next">进入减字拆解 →</button>
      <button class="btn ghost" id="btn-back">← 返回导入</button>
    </div>
  `;

  const preview = document.createElement('div');
  preview.className = 'card';
  preview.innerHTML = `<h2 class="section-title">版面切分 Canvas</h2>`;
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  preview.appendChild(wrap);
  root.append(panel, preview);

  function paint(): void {
    const r = getState().result;
    if (!r) return;
    const source =
      layer === 'ink' ? r.ink : layer === 'red' ? r.red : s.bitmap!;
    drawImageBitmap(canvas, source);
    const ctx = canvas.getContext('2d')!;
    if (overlays.has('frame')) strokeRect(ctx, r.frame, '#b03a2e', 3);
    if (overlays.has('columns')) {
      r.columns.forEach((c) => strokeRect(ctx, c, '#3d5a80', 1.5, [6, 4]));
    }
    if (overlays.has('rows')) {
      ctx.save();
      ctx.strokeStyle = '#a9842d';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      for (const y of r.rowLines) {
        ctx.beginPath();
        ctx.moveTo(r.frame.x, y);
        ctx.lineTo(r.frame.x + r.frame.w, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (overlays.has('chars')) {
      r.charBoxes.forEach((b) => strokeRect(ctx, b, '#4d7a4d', 1.2));
    }
  }
  paint();

  panel.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b) => {
    b.onclick = () => {
      layer = b.dataset.layer as Layer;
      panel.querySelectorAll('[data-layer]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      paint();
    };
  });
  panel.querySelectorAll<HTMLElement>('[data-o]').forEach((p) => {
    p.onclick = () => {
      const o = p.dataset.o as Overlay;
      if (overlays.has(o)) {
        overlays.delete(o);
        p.classList.remove('on');
      } else {
        overlays.add(o);
        p.classList.add('on');
      }
      paint();
    };
  });
  panel.querySelector<HTMLButtonElement>('#btn-next')!.onclick = () =>
    setState({ view: 'decompose' });
  panel.querySelector<HTMLButtonElement>('#btn-back')!.onclick = () =>
    setState({ view: 'import' });

  return root;
}

function missing(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'card';
  div.textContent = '请先在导入页生成刻本并运行识别管线。';
  return div;
}
