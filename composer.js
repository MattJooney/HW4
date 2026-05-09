
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
/**
 * Transpose: shift each pitch class by n semitones (mod 12)
 * @param {number[]} pcs
 * @param {number} n  - semitones to shift (1–11)
 * @returns {number[]}
 */
function transpose(pcs, n) {
  return pcs.map(p => (p + n) % 12);
}

/**
 * Inverse: map each pitch class p → (12 - p) mod 12
 * @param {number[]} pcs
 * @returns {number[]}
 */
function inverse(pcs) {
  return pcs.map(p => (12 - p) % 12);
}

/**
 * @param {number[]} pcs
 * @returns {number[]}
 */
function retrograde(pcs) {
  return [...pcs].reverse();
}

 
function parsePCS(str) {
  const vals = str.split(',').map(s => parseInt(s.trim(), 10));
  if (vals.some(isNaN) || vals.some(v => v < 0 || v > 11)) return null;
  return vals;
}

// ── Random operation selector ─────────────────────────────────────────────────

/**
 * Randomly applies one of T, I, R, RI to the given pitch class array.
 * @param {number[]} pcs
 * @returns {{ label: string, type: string, notes: number[] }}
 */
function applyRandomOp(pcs) {
  const ops = ['T', 'I', 'R', 'RI'];
  const op  = ops[Math.floor(Math.random() * ops.length)];

  if (op === 'T') {
    const n = Math.floor(Math.random() * 11) + 1;
    return { label: `T${n}`, type: 'T', notes: transpose(pcs, n) };
  } else if (op === 'I') {
    return { label: 'I',  type: 'I',  notes: inverse(pcs) };
  } else if (op === 'R') {
    return { label: 'R',  type: 'R',  notes: retrograde(pcs) };
  } else {
    return { label: 'RI', type: 'RI', notes: retrograde(inverse(pcs)) };
  }
}

let composition    = [];
let audioCtx       = null;
let scheduledNodes = [];
let pillTimers     = [];
let playTimeout    = null;


function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function midiNote(pc, octave) { return octave * 12 + 12 + pc; }
function noteFreq(midi)        { return 440 * Math.pow(2, (midi - 69) / 12); }


function setStatus(msg, type = '') {
  const el = document.getElementById('status');
  el.textContent = msg + '_';
  el.className = 'status-bar' + (type ? ' ' + type : '');
}


function generate() {
  const pcsStr = document.getElementById('pcs-input').value;
  const stepsN = parseInt(document.getElementById('steps-input').value, 10);
  const pcs    = parsePCS(pcsStr);

  if (!pcs || pcs.length < 1) {
    setStatus('ERR: invalid input — use integers 0–11', 'err');
    return;
  }
  if (isNaN(stepsN) || stepsN < 1 || stepsN > 32) {
    setStatus('ERR: steps must be 1–32', 'err');
    return;
  }

  stopPlayback();
  composition = [];

  // Prime row (original input)
  composition.push({ label: 'P', type: 'P', notes: [...pcs] });

  // Chain of random transformations
  let cur = [...pcs];
  for (let i = 0; i < stepsN - 1; i++) {
    const step = applyRandomOp(cur);
    composition.push(step);
    cur = step.notes;
  }

  renderSteps();
  drawVis();

  document.getElementById('play-btn').disabled = false;
  document.getElementById('empty-state').style.display    = 'none';
  document.getElementById('seq-container').style.display  = 'block';

  const total = composition.reduce((a, s) => a + s.notes.length, 0);
  setStatus(`${composition.length} ops · ${total} notes`, 'ok');
}

function playComposition() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const bpm     = parseInt(document.getElementById('tempo-slider').value, 10);
  const vol     = parseInt(document.getElementById('vol-slider').value, 10) / 100;
  const oct     = parseInt(document.getElementById('octave-select').value, 10);
  const wave    = document.getElementById('wave-select').value;
  const noteDur = 60 / bpm;

  const allNotes = composition.flatMap(s => s.notes);
  let t = ctx.currentTime + 0.05;

  scheduledNodes = [];
  pillTimers.forEach(clearTimeout);
  pillTimers = [];

  allNotes.forEach((pc, i) => {
    const freq = noteFreq(midiNote(pc, oct));

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol * 0.45, t + 0.015);
    gain.gain.linearRampToValueAtTime(0, t + noteDur * 0.88);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + noteDur);
    scheduledNodes.push(osc);

    const delay = (t - ctx.currentTime) * 1000;
    pillTimers.push(setTimeout(() => {
      clearAllActive();
      const pills = document.querySelectorAll('.pill');
      if (pills[i]) pills[i].classList.add('active');
    }, delay));

    t += noteDur;
  });

  document.getElementById('play-btn').disabled = true;
  document.getElementById('stop-btn').disabled = false;
  setStatus('playing');

  const totalMs = (t - ctx.currentTime) * 1000 + 200;
  playTimeout = setTimeout(() => {
    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    setStatus('done', 'ok');
    clearAllActive();
  }, totalMs);
}

function stopPlayback() {
  scheduledNodes.forEach(n => { try { n.stop(); } catch (e) {} });
  scheduledNodes = [];
  pillTimers.forEach(clearTimeout);
  pillTimers = [];
  if (playTimeout) clearTimeout(playTimeout);
  clearAllActive();
  document.getElementById('play-btn').disabled = composition.length === 0;
  document.getElementById('stop-btn').disabled = true;
  if (composition.length > 0) setStatus('stopped');
}

function clearAllActive() {
  document.querySelectorAll('.pill.active').forEach(el => el.classList.remove('active'));
}

const NOTE_COLORS = [
  '#e8a020','#d4720a','#c25010','#e05050','#c03060',
  '#903080','#5040c0','#3060d0','#20a0c0','#20b870',
  '#60c030','#a0c010'
];

function drawVis() {
  const canvas = document.getElementById('vis');
  const ctx2   = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const rect   = canvas.getBoundingClientRect();

  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx2.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  ctx2.clearRect(0, 0, W, H);

  ctx2.strokeStyle = '#1a1a1a';
  ctx2.lineWidth = 0.5;
  for (let row = 0; row <= 11; row++) {
    const y = H - ((row / 11) * (H - 12)) - 6;
    ctx2.beginPath();
    ctx2.moveTo(0, y);
    ctx2.lineTo(W, y);
    ctx2.stroke();
  }

  const allNotes = composition.flatMap(s => s.notes);
  if (!allNotes.length) return;

  const nw  = Math.max(2, W / allNotes.length - 1);
  const pad = 6;

  allNotes.forEach((pc, i) => {
    const x     = (i / allNotes.length) * W;
    const y     = H - pad - ((pc / 11) * (H - pad * 2));
    const color = NOTE_COLORS[pc % NOTE_COLORS.length];

    ctx2.fillStyle = color + '18';
    ctx2.fillRect(x, 0, nw, H);

    ctx2.fillStyle = color;
    ctx2.fillRect(x, y - 2, nw, 4);
  });

  ctx2.font = '8px Share Tech Mono, monospace';
  for (let pc = 0; pc <= 11; pc += 3) {
    const y = H - ((pc / 11) * (H - 12)) - 4;
    ctx2.fillStyle = '#333';
    ctx2.fillText(pc, 3, y);
  }
}

function renderSteps() {
  const list = document.getElementById('steps-list');
  list.innerHTML = '';

  composition.forEach((step, stepIdx) => {
    const row = document.createElement('div');
    row.className = 'step-row';

    const offset = composition.slice(0, stepIdx).reduce((a, s) => a + s.notes.length, 0);
    const pills  = step.notes.map((pc, j) =>
      `<span class="pill" data-idx="${offset + j}">${NOTE_NAMES[pc]}</span>`
    ).join('');

    row.innerHTML = `
      <div class="step-num">${String(stepIdx + 1).padStart(2, '0')}</div>
      <div class="op-badge op-${step.type}">${step.label}</div>
      <div class="pills">${pills}</div>
    `;
    list.appendChild(row);
  });
}

document.getElementById('gen-btn').addEventListener('click', generate);
document.getElementById('play-btn').addEventListener('click', playComposition);
document.getElementById('stop-btn').addEventListener('click', stopPlayback);

document.getElementById('tempo-slider').addEventListener('input', e => {
  document.getElementById('tempo-val').textContent  = e.target.value;
  document.getElementById('tempo-disp').textContent = e.target.value;
});

document.getElementById('vol-slider').addEventListener('input', e => {
  document.getElementById('vol-pct').textContent  = e.target.value;
  document.getElementById('vol-disp').textContent = e.target.value;
});

window.addEventListener('resize', () => { if (composition.length) drawVis(); });


generate();