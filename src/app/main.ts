import './styles.css';
import { getState, setState, subscribe, type AppState, type PageView } from './store';
import { renderImportView } from './views/importView';
import { renderLayoutView } from './views/layoutView';
import { renderDecomposeView } from './views/decomposeView';
import { renderPitchView } from './views/pitchView';

const STEPS: { id: PageView; label: string }[] = [
  { id: 'import', label: '刻本导入' },
  { id: 'layout', label: '版面切分' },
  { id: 'decompose', label: '减字拆解' },
  { id: 'pitch', label: '音高谱' },
];

const viewRoot = document.getElementById('view-root')!;
const navRoot = document.getElementById('step-nav')!;
const statusbar = document.getElementById('statusbar')!;

function canEnter(view: PageView, s: AppState): boolean {
  if (view === 'import') return true;
  if (!s.bitmap) return false;
  if ((view === 'decompose' || view === 'pitch') && !s.result) return false;
  return true;
}

function renderNav(s: AppState): void {
  navRoot.innerHTML = '';
  STEPS.forEach((step, i) => {
    const btn = document.createElement('button');
    btn.className = `step-btn ${s.view === step.id ? 'active' : ''}`;
    btn.disabled = !canEnter(step.id, s);
    btn.innerHTML = `<span class="num">${i + 1}</span>${step.label}`;
    btn.onclick = () => setState({ view: step.id });
    navRoot.appendChild(btn);
  });
}

function renderView(s: AppState): void {
  viewRoot.innerHTML = '';
  switch (s.view) {
    case 'import':
      viewRoot.appendChild(renderImportView(s));
      break;
    case 'layout':
      viewRoot.appendChild(renderLayoutView(s));
      break;
    case 'decompose':
      viewRoot.appendChild(renderDecomposeView(s));
      break;
    case 'pitch':
      viewRoot.appendChild(renderPitchView(s));
      break;
  }
  const timing = s.result?.timing;
  statusbar.textContent = timing
    ? `管线耗时 总计 ${timing.total.toFixed(0)}ms（分色 ${timing.segment.toFixed(0)} / 版面 ${timing.layout.toFixed(0)} / 识别 ${timing.recognize.toFixed(0)} / 消解 ${timing.resolve.toFixed(0)} / 音高 ${timing.pitch.toFixed(0)}）`
    : s.running
      ? '识别管线运行中…'
      : s.error
        ? `错误：${s.error}`
        : '就绪';
}

subscribe((s) => {
  renderNav(s);
  renderView(s);
});

renderNav(getState());
renderView(getState());
