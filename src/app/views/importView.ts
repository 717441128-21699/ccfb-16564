/**
 * 页面一：刻本导入。
 * - 程序化合成带真值的刻本页（三种字体 × 三档退化）
 * - 或上传外部扫描图（无真值，仅跑管线不参与准确率评测）
 */
import type { DegradationLevel, FontStyle } from '../../domain/types';
import type { AppState } from '../store';
import { getState, setState } from '../store';
import { synthesizePage } from '../../synth/synthesize';
import { FONT_PARAMS } from '../../vision/vocab';
import { runPipelineInWorker } from '../workerClient';
import { drawImageBitmap } from '../canvasUtil';

const FONTS: FontStyle[] = ['fangti', 'yuanti', 'shouti'];
const DEGRADATIONS: { id: DegradationLevel; label: string }[] = [
  { id: 'clean', label: '清晰' },
  { id: 'normal', label: '一般' },
  { id: 'heavy', label: '漫漶' },
];

export function renderImportView(s: AppState): HTMLElement {
  const root = document.createElement('div');
  root.className = 'grid-2';

  const panel = document.createElement('div');
  panel.className = 'card';
  panel.innerHTML = `
    <h2 class="section-title">一、合成带真值的刻本页</h2>
    <div class="form-row">
      <label>刻本字体</label>
      <div class="radio-group" id="font-group">
        ${FONTS.map(
          (f) => `
        <label><input type="radio" name="font" value="${f}" ${s.fontStyle === f ? 'checked' : ''}/>
          <span>${FONT_PARAMS[f].label}</span></label>`,
        ).join('')}
      </div>
    </div>
    <div class="form-row">
      <label>退化程度（噪点 / 断笔 / 模糊 / 朱笔）</label>
      <div class="radio-group" id="deg-group">
        ${DEGRADATIONS.map(
          (d) => `
        <label><input type="radio" name="deg" value="${d.id}" ${s.degradation === d.id ? 'checked' : ''}/>
          <span>${d.label}</span></label>`,
        ).join('')}
      </div>
    </div>
    <div class="form-row">
      <label>随机种子（同种子可复现整页）</label>
      <input type="number" id="seed-input" value="${s.seed}" min="1" max="99999999"/>
    </div>
    <div class="form-row" style="display:flex;gap:8px;">
      <button class="btn" id="btn-synth">生成刻本页</button>
      <button class="btn secondary" id="btn-random">换一页（随机种子）</button>
    </div>

    <h2 class="section-title" style="margin-top:22px;">二、或导入外部扫描件</h2>
    <div class="drop-zone" id="drop-zone">
      <div style="font-size:26px;margin-bottom:8px;">▣</div>
      <div>点击选择或拖拽刻本扫描图到此处</div>
      <div class="muted" style="margin-top:6px;">支持 PNG / JPG；外部图无部件真值，不参与准确率统计</div>
      <input type="file" id="file-input" accept="image/*" hidden/>
    </div>
    <div id="external-info" class="muted" style="margin-top:8px;"></div>

    <h2 class="section-title" style="margin-top:22px;">三、运行识别管线（Web Worker）</h2>
    <button class="btn" id="btn-run" disabled>开始识别 →</button>
    <div id="run-hint" class="muted" style="margin-top:8px;"></div>
  `;

  const preview = document.createElement('div');
  preview.className = 'card';
  preview.innerHTML = `<h2 class="section-title">刻本预览</h2>`;
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  preview.appendChild(wrap);

  if (s.bitmap) drawImageBitmap(canvas, s.bitmap);

  root.append(panel, preview);

  // ---- 事件绑定 ----
  panel.querySelectorAll<HTMLInputElement>('input[name="font"]').forEach((el) => {
    el.onchange = () => setState({ fontStyle: el.value as FontStyle });
  });
  panel.querySelectorAll<HTMLInputElement>('input[name="deg"]').forEach((el) => {
    el.onchange = () => setState({ degradation: el.value as DegradationLevel });
  });

  const seedInput = panel.querySelector<HTMLInputElement>('#seed-input')!;
  seedInput.onchange = () => setState({ seed: Number(seedInput.value) || 1 });

  panel.querySelector<HTMLButtonElement>('#btn-synth')!.onclick = () => doSynth(false);
  panel.querySelector<HTMLButtonElement>('#btn-random')!.onclick = () => doSynth(true);

  async function doSynth(randomize: boolean): Promise<void> {
    const cur = getState();
    const seed = randomize ? Math.floor(Math.random() * 90000000) + 10000 : cur.seed;
    setState({ seed, running: true, error: null, result: null });
    seedInput.value = String(seed);
    try {
      const out = await synthesizePage(cur.fontStyle, cur.degradation, seed);
      setState({
        groundTruth: out.groundTruth,
        bitmap: out.bitmap,
        externalBitmap: null,
        externalName: '',
        running: false,
      });
      drawImageBitmap(canvas, out.bitmap);
      refreshRunButton();
    } catch (err) {
      setState({ running: false, error: fmt(err) });
    }
  }

  const dropZone = panel.querySelector<HTMLElement>('#drop-zone')!;
  const fileInput = panel.querySelector<HTMLInputElement>('#file-input')!;
  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('drag');
  };
  dropZone.ondragleave = () => dropZone.classList.remove('drag');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag');
    const file = e.dataTransfer?.files?.[0];
    if (file) loadExternal(file);
  };
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (file) loadExternal(file);
  };

  async function loadExternal(file: File): Promise<void> {
    try {
      const bmp = await createImageBitmap(file);
      setState({
        externalBitmap: bmp,
        bitmap: bmp,
        externalName: file.name,
        groundTruth: null,
        result: null,
      });
      drawImageBitmap(canvas, bmp);
      panel.querySelector<HTMLElement>('#external-info')!.textContent =
        `已载入：${file.name}（${bmp.width}×${bmp.height}）`;
      refreshRunButton();
    } catch (err) {
      setState({ error: `图片读取失败：${fmt(err)}` });
    }
  }

  const runBtn = panel.querySelector<HTMLButtonElement>('#btn-run')!;
  const runHint = panel.querySelector<HTMLElement>('#run-hint')!;
  function refreshRunButton(): void {
    const cur = getState();
    runBtn.disabled = !cur.bitmap || cur.running;
    runHint.textContent = cur.groundTruth
      ? `合成页含 ${cur.groundTruth.chars.length} 个减字真值，可做准确率评测`
      : cur.bitmap
        ? '外部扫描件模式：仅展示识别结果'
        : '请先生成或导入刻本';
  }
  refreshRunButton();

  runBtn.onclick = async () => {
    const cur = getState();
    if (!cur.bitmap) return;
    setState({ running: true, error: null });
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span> 识别中…';
    const t0 = performance.now();
    try {
      // worker 会 transfer 掉 bitmap，先复制一份保留预览
      const clone = await cloneBitmap(cur.bitmap);
      const result = await runPipelineInWorker(clone);
      const wallMs = performance.now() - t0;
      setState({
        result,
        running: false,
        view: 'layout',
        corrections: {},
        selectedCharId: null,
      });
      console.info(`[pipeline] worker wall time = ${wallMs.toFixed(1)}ms`, result.timing);
    } catch (err) {
      setState({ running: false, error: fmt(err) });
      runBtn.disabled = false;
      runBtn.textContent = '开始识别 →';
    }
  };

  return root;
}

async function cloneBitmap(bmp: ImageBitmap): Promise<ImageBitmap> {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return c.transferToImageBitmap();
}

function fmt(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
