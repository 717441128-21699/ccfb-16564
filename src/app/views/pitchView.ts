/**
 * 页面四：音高谱。
 * - 定弦切换（正调/慢角/蕤宾/清商），实时重算
 * - 按阅读顺序列出每个音：弦、徽位、指法、频率、音名与音分偏差
 * - WebAudio 古琴音色试听（带拨弦包络的谐波叠加）
 * - 导出 CSV / JSON
 */
import type { Note } from '../../domain/types';
import type { AppState } from '../store';
import { getState, setState } from '../store';
import { TUNINGS } from '../../domain/tuning';
import { charsToNotes } from '../../domain/tuning';
import { formatHui } from '../../domain/hui';

export function renderPitchView(s: AppState): HTMLElement {
  if (!s.result) return missing();
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div class="form-row" style="margin:0;min-width:220px;">
          <label>定弦</label>
          <select id="tuning-select">
            ${Object.values(TUNINGS)
              .map(
                (t) =>
                  `<option value="${t.id}" ${t.id === s.tuningId ? 'selected' : ''}>${t.name}</option>`,
              )
              .join('')}
          </select>
        </div>
        <button class="btn" id="btn-play-all">▶ 顺序试听</button>
        <button class="btn secondary" id="btn-stop">■ 停止</button>
        <button class="btn ghost" id="btn-export-csv">导出 CSV</button>
        <button class="btn ghost" id="btn-export-json">导出 JSON</button>
        <span class="muted" id="play-state"></span>
      </div>
      <p class="muted" style="margin:10px 0 0;">
        按音 f = 空弦频率 / 有效弦长比（十三徽由谐波节点 1/8…7/8 定位，徽分线性插值）；
        泛音 f = n × 空弦频率，n 为该徽谐波序数；散音即空弦。
      </p>
    </div>
    <div class="card">
      <h2 class="section-title">音高谱（共 ${s.result.notes.length} 音，按列从右至左、列内自上而下）</h2>
      <div class="note-list" id="note-list"></div>
    </div>
  `;

  const list = root.querySelector<HTMLElement>('#note-list')!;
  renderNoteTable(list, s.result.notes);

  root.querySelector<HTMLSelectElement>('#tuning-select')!.onchange = (e) => {
    const tuningId = (e.target as HTMLSelectElement).value;
    const cur = getState();
    const notes = charsToNotes(cur.result!.recognized.map((r) => r.resolved), tuningId);
    setState({ tuningId, result: { ...cur.result!, notes } });
  };

  let audio: GuqinAudio | null = null;
  const playState = root.querySelector<HTMLElement>('#play-state')!;
  root.querySelector<HTMLButtonElement>('#btn-play-all')!.onclick = async () => {
    audio ??= new GuqinAudio();
    await audio.resume();
    const notes = getState().result!.notes;
    playState.textContent = '播放中…';
    for (const n of notes) {
      audio.playNote(n);
      await wait(420);
      if (audio.stopped) break;
    }
    playState.textContent = '播放结束';
  };
  root.querySelector<HTMLButtonElement>('#btn-stop')!.onclick = () => {
    if (audio) audio.stop();
    playState.textContent = '已停止';
  };

  root.querySelector<HTMLButtonElement>('#btn-export-csv')!.onclick = () => {
    const notes = getState().result!.notes;
    const header = '序号,列,行,发声,弦,右指,左指,徽位,装饰,频率Hz,音名,音分偏差';
    const rows = notes.map((n, i) =>
      [
        i + 1, n.column + 1, n.row + 1, kindCn(n.kind), n.string, n.right,
        n.left ?? '', n.hui ? formatHui(n.hui) : '', n.ornaments.join('|'),
        n.frequency, n.noteName, n.cents,
      ].join(','),
    );
    download(`${header}\n${rows.join('\n')}`, 'pitch.csv', 'text/csv');
  };
  root.querySelector<HTMLButtonElement>('#btn-export-json')!.onclick = () => {
    download(JSON.stringify(getState().result!.notes, null, 2), 'pitch.json', 'application/json');
  };

  return root;
}

function renderNoteTable(host: HTMLElement, notes: Note[]): void {
  const table = document.createElement('table');
  table.innerHTML = `
    <thead><tr>
      <th>#</th><th>列/行</th><th>发声</th><th>弦</th><th>右指</th><th>左指</th>
      <th>徽位</th><th>装饰</th><th>频率 Hz</th><th>音名</th><th>音分</th><th></th>
    </tr></thead>`;
  const tb = document.createElement('tbody');
  notes.forEach((n, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="mono">${n.column + 1}-${n.row + 1}</td>
      <td><span class="tag ${n.kind}">${kindCn(n.kind)}</span></td>
      <td>${n.string}</td>
      <td>${n.right}</td>
      <td>${n.left ?? '—'}</td>
      <td>${n.hui ? formatHui(n.hui) : '—'}</td>
      <td>${n.ornaments.join('、') || '—'}</td>
      <td class="mono">${n.frequency.toFixed(2)}</td>
      <td><b>${n.noteName}</b></td>
      <td class="mono" style="color:${Math.abs(n.cents) > 15 ? 'var(--gold)' : 'var(--green)'}">${n.cents >= 0 ? '+' : ''}${n.cents}</td>
      <td><button class="btn small ghost">试听</button></td>`;
    tr.querySelector('button')!.onclick = () => {
      const a = new GuqinAudio();
      void a.resume().then(() => a.playNote(n));
    };
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  host.appendChild(table);
}

/** 简化古琴音色：基频 + 谐波，指数衰减包络，加少量拨弦噪声 */
class GuqinAudio {
  private ctx: AudioContext | null = null;
  stopped = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    this.stopped = false;
  }

  stop(): void {
    this.stopped = true;
  }

  playNote(note: Note): void {
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.5, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    master.connect(ctx.destination);

    // 古琴音色：偶次谐波衰减更快，高频谐波整体偏弱
    const harmonics = [
      { mult: 1, gain: 1 },
      { mult: 2, gain: 0.45 },
      { mult: 3, gain: 0.22 },
      { mult: 4, gain: 0.1 },
      { mult: 5, gain: 0.05 },
    ];
    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.frequency * h.mult;
      const g = ctx.createGain();
      g.gain.value = h.gain;
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 1.7);
    }
  }
}

function kindCn(k: string): string {
  return k === 'san' ? '散' : k === 'fan' ? '泛' : '按';
}

function wait(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function download(content: string, name: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function missing(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'card';
  div.textContent = '请先运行识别管线。';
  return div;
}
