/* ============================================================
   指尖修行 · 应用逻辑
   ============================================================ */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const K_PROGRESS = 'typing_dojo_progress_v1';
const K_STATS = 'typing_dojo_stats_v1';
const K_HISTORY = 'typing_dojo_history_v1';
const K_PREF = 'typing_dojo_pref_v1';

/* ---------- 小工具 ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`;
const fmtDur = (sec) => {
  if (sec < 60) return Math.round(sec) + ' 秒';
  if (sec < 3600) return Math.round(sec / 60) + ' 分钟';
  return (sec / 3600).toFixed(1) + ' 小时';
};
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayKey = () => dateKey(new Date());

/* ---------- 存储（localStorage 不可用时降级到内存） ---------- */
const memStore = {};
let storageAvailable = false;
try {
  localStorage.setItem('__td_probe__', '1');
  localStorage.removeItem('__td_probe__');
  storageAvailable = true;
} catch (e) { storageAvailable = false; }

const LS = {
  get(k) {
    try { const v = localStorage.getItem(k); if (v !== null) return v; } catch (e) {}
    return Object.prototype.hasOwnProperty.call(memStore, k) ? memStore[k] : null;
  },
  set(k, v) {
    memStore[k] = v;
    try { localStorage.setItem(k, v); } catch (e) {}
  },
  readJSON(k, fb) {
    try { const v = LS.get(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
  },
  writeJSON(k, o) { LS.set(k, JSON.stringify(o)); }
};

/* ---------- 持久化数据 ---------- */
function defaultStats() {
  return {
    totalTime: 0, totalKeys: 0, totalCorrect: 0, totalErrors: 0,
    sessions: 0, bestCpm: 0, bestCombo: 0, perfectCount: 0,
    keyLat: {}, keyErr: {}, days: {}, dailyDone: {}, achievements: {},
    streak: 0, lastDay: null, placement: null
  };
}
function defaultPref() {
  return {
    freeMode: false, soundOn: true, metronome: false, bpm: 120, showHand: true,
    scheme: 'quanpin', targetMode: 'level',
    theme: 'auto', fs: 'md', motion: 'on', showKeyboard: null, onboarded: false, blind: false
  };
}

let progress = LS.readJSON(K_PROGRESS, {});
let stats = Object.assign(defaultStats(), LS.readJSON(K_STATS, null) || {});
let history = LS.readJSON(K_HISTORY, []);
let pref = Object.assign(defaultPref(), LS.readJSON(K_PREF, null) || {});

const saveProgress = () => LS.writeJSON(K_PROGRESS, progress);
const saveStats = () => LS.writeJSON(K_STATS, stats);
const saveHistory = () => LS.writeJSON(K_HISTORY, history);
const savePref = () => LS.writeJSON(K_PREF, pref);

/* ---------- 全局状态 ---------- */
const state = {
  view: 'map',
  level: null,
  chapter: null,
  text: '',
  pinyin: null,
  index: 0,
  started: false,
  finished: false,
  paused: false,
  elapsedBase: 0,
  segStart: 0,
  totalKeys: 0,
  correctKeys: 0,
  errorKeys: 0,
  combo: 0,
  maxCombo: 0,
  keyTimes: [],
  keyLat: {},
  keyErr: {},
  lastKeyAt: 0,
  samples: [],
  lastSample: 0,
  peakCpm: 0,
  timerId: null,
  composing: false,
  nextLevelId: null,
  target: 100,
  timeLimit: 0
};

/* ---------- 关卡扁平化 ---------- */
const FLAT = [];
CHAPTERS.forEach((ch) => ch.levels.forEach((lv) => FLAT.push(Object.assign({}, lv, { chapterId: ch.id, chapterColor: ch.color }))));
const LEVEL_BY_ID = {};
FLAT.forEach((lv) => { LEVEL_BY_ID[lv.id] = lv; });
const TOTAL_STARS_MAX = FLAT.length * 3;

function isUnlocked(levelId) {
  if (pref.freeMode) return true;
  const i = FLAT.findIndex((l) => l.id === levelId);
  if (i <= 0) return true;
  const p = progress[FLAT[i - 1].id];
  return !!(p && p.stars >= 1);
}
function nextLevelOf(levelId) {
  const i = FLAT.findIndex((l) => l.id === levelId);
  return i >= 0 && i + 1 < FLAT.length ? FLAT[i + 1].id : null;
}

/* ============================================================
   双拼（小鹤）转换
   ============================================================ */
function splitPinyin(py) {
  py = String(py).toLowerCase();
  if (!/^[a-z]+$/.test(py)) return null;
  if (/^yu/.test(py)) {
    const rest = py.slice(2);
    return { initial: 'y', final: 'v' + rest };
  }
  for (let i = 0; i < PINYIN_INITIALS.length; i++) {
    const ini = PINYIN_INITIALS[i];
    if (py.indexOf(ini) === 0) return { initial: ini, final: py.slice(ini.length) };
  }
  return { initial: '', final: py };
}

function toShuangpin(py) {
  const p = splitPinyin(py);
  if (!p) return null;
  // 零声母音节：按小鹤规则直接输入原拼音字母
  if (p.initial === '') return p.final;
  const ini = XIAOHE_INITIAL[p.initial] || p.initial;
  const fin = XIAOHE_FINAL[p.final];
  if (!fin) return null;
  return ini + fin;
}

/* ============================================================
   弱键分析（智能生成）
   ============================================================ */
function weakKeyStats() {
  const keys = {};
  Object.keys(stats.keyLat || {}).forEach((k) => {
    if (k.length !== 1) return;
    keys[k] = keys[k] || { k, n: 0, ms: 0, err: 0 };
    keys[k].n = stats.keyLat[k][0];
    keys[k].ms = stats.keyLat[k][1];
  });
  Object.keys(stats.keyErr || {}).forEach((k) => {
    if (k.length !== 1) return;
    keys[k] = keys[k] || { k, n: 0, ms: 0, err: 0 };
    keys[k].err = stats.keyErr[k];
  });

  const list = Object.keys(keys).map((k) => keys[k]).filter((e) => e.n + e.err >= 3);
  if (!list.length) return [];

  const lats = list.filter((e) => e.n > 0).map((e) => e.ms / e.n);
  const lo = lats.length ? Math.min.apply(null, lats) : 0;
  const hi = lats.length ? Math.max.apply(null, lats) : 1;
  const span = Math.max(1, hi - lo);

  list.forEach((e) => {
    const lat = e.n > 0 ? e.ms / e.n : hi;
    const latN = clamp((lat - lo) / span, 0, 1);
    const errRate = e.err / Math.max(1, e.n + e.err);
    e.avg = Math.round(lat);
    e.errRate = errRate;
    e.score = latN * 0.55 + clamp(errRate * 3, 0, 1) * 0.45;
  });
  list.sort((a, b) => b.score - a.score);
  return list;
}

/* 按弱键权重生成练习文本 */
function generateWeakDrill(len) {
  const ranked = weakKeyStats();
  if (!ranked.length) return null;
  const top = ranked.slice(0, 8);
  const pool = [];
  top.forEach((e, i) => {
    const weight = Math.max(1, Math.round((top.length - i) * 1.6));
    for (let j = 0; j < weight; j++) pool.push(e.k);
  });
  if (!pool.length) return null;
  const out = [];
  let count = 0;
  while (count < len) {
    const n = 3 + Math.floor(Math.random() * 3);
    let w = '';
    for (let i = 0; i < n; i++) { w += pool[Math.floor(Math.random() * pool.length)]; count++; }
    out.push(w);
    count++;
  }
  return { text: out.join(' '), keys: top.map((e) => e.k) };
}

/* ============================================================
   目标速度（目标式练习）
   ============================================================ */
const TARGET_FACTOR = { drill: 0.9, text: 1.0, code: 0.78, zh: 0.5 };

function effectiveTarget(level) {
  const base = level.target || 100;
  if (pref.targetMode !== 'personal' || !stats.placement) return base;
  const f = TARGET_FACTOR[level.type] || 1;
  return clamp(Math.round(stats.placement.target * f), 15, 400);
}

/* ============================================================
   外观：主题 / 字号 / 动画 / 触摸设备
   ============================================================ */
const mediaDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/* 触摸设备判定：
   以「主指针是否为粗指针」为准——触摸屏笔记本的主指针是鼠标，不会被误判成手机。
   仅在没有 matchMedia 的老浏览器里才退回 UA 判断。 */
function mq(query) {
  return !!(window.matchMedia && window.matchMedia(query).matches);
}
const isTouch = window.matchMedia
  ? (mq('(pointer: coarse)') || (mq('(any-pointer: coarse)') && !mq('(pointer: fine)')))
  : /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent || '');

function resolvedTheme() {
  if (pref.theme === 'auto') return (mediaDark && mediaDark.matches) ? 'dark' : 'light';
  return pref.theme;
}

let TC = {};
function readThemeColors() {
  const cs = window.getComputedStyle ? getComputedStyle(document.documentElement) : null;
  const g = (n, fb) => {
    if (!cs) return fb;
    const v = (cs.getPropertyValue(n) || '').trim();
    return v || fb;
  };
  TC = {
    grid: g('--chart-grid', '#e6eaf2'),
    axis: g('--chart-axis', '#98a2b3'),
    hint: g('--chart-hint', '#b6bfcd'),
    line: g('--chart-line', '#4c6ef5'),
    line2: g('--chart-line2', '#0ca678'),
    target: g('--chart-target', '#f0a500'),
    targetTxt: g('--chart-target-txt', '#c98a00'),
    fill: g('--chart-fill', 'rgba(76,110,245,.28)'),
    fill2: g('--chart-fill2', 'rgba(12,166,120,.26)'),
    heatNone: g('--heat-none', '#f4f6fa'),
    surface: g('--surface', '#ffffff'),
    theme: resolvedTheme()
  };
}

function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.setAttribute('data-theme', t);
  readThemeColors();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#11141b' : '#f2f5fa');
}

function applyFontSize() {
  document.body.setAttribute('data-fs', pref.fs || 'md');
}

function applyMotion() {
  document.body.setAttribute('data-motion', pref.motion === 'off' ? 'off' : 'on');
}

function applyTouch() {
  document.body.classList.toggle('touch', isTouch);
  if (pref.showKeyboard === null || pref.showKeyboard === undefined) pref.showKeyboard = !isTouch;
  document.body.classList.toggle('show-kb', !!pref.showKeyboard);
}

function applyBlind() {
  document.body.classList.toggle('blind', !!pref.blind);
}

function applyAllAppearance() {
  applyTheme();
  applyFontSize();
  applyMotion();
  applyTouch();
  applyBlind();
}

function syncSettingsUI() {
  $$('#seg-theme button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === (pref.theme || 'auto')));
  $$('#seg-fs button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === (pref.fs || 'md')));
  $$('#seg-motion button').forEach((b) => b.classList.toggle('is-active', b.dataset.v === (pref.motion || 'on')));
  const s = $('#sp-sound');
  if (s) { s.checked = !!pref.soundOn; $('#sp-sound-txt').textContent = pref.soundOn ? '开启' : '关闭'; }
  const k = $('#sp-keyboard');
  if (k) { k.checked = !!pref.showKeyboard; $('#sp-keyboard-txt').textContent = pref.showKeyboard ? '显示' : '隐藏'; }
  const row = $('#sp-row-kb');
  if (row) row.style.display = '';
}

function openSettings(open) {
  const p = $('#settings-panel'), m = $('#settings-mask'), b = $('#btn-settings');
  const on = open === undefined ? !p.classList.contains('on') : open;
  p.classList.toggle('on', on);
  if (m) m.classList.toggle('on', on);
  if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) {
    syncSettingsUI();
    const note = $('#sp-storage-note');
    if (note) {
      note.textContent = storageAvailable
        ? '成绩保存在这台设备的浏览器里。换设备时用「导出备份」带走，再在新设备「导入备份」。'
        : '当前环境不允许浏览器本地存储（例如直接双击打开文件），本次成绩只保存在内存里，刷新后会丢失。建议用本地服务打开，或先导出备份。';
    }
  }
}

/* ============================================================
   数据备份
   ============================================================ */
function exportData() {
  const data = { app: 'typing-dojo', v: 1, at: new Date().toISOString(), progress, stats, history, pref };
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `指尖修行-备份-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { alert('当前环境不支持导出。'); }
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let d;
    try { d = JSON.parse(String(reader.result)); }
    catch (e) { alert('这个文件读不出来，请确认是本网站导出的 JSON 备份。'); return; }
    if (!d || d.app !== 'typing-dojo' || !d.progress) { alert('这不是本网站的备份文件。'); return; }
    if (!confirm('导入会覆盖当前的关卡进度、成绩和成就。确定继续吗？')) return;

    progress = d.progress || {};
    stats = Object.assign(defaultStats(), d.stats || {});
    history = Array.isArray(d.history) ? d.history : [];
    const keepAppearance = { theme: pref.theme, fs: pref.fs, motion: pref.motion };
    pref = Object.assign(defaultPref(), d.pref || {}, keepAppearance, { onboarded: true });

    saveProgress(); saveStats(); saveHistory(); savePref();
    applyAllAppearance();
    syncSettingsUI();
    renderMap();
    if (state.view === 'stats') renderStats();
    alert('导入完成，进度已恢复。');
  };
  reader.onerror = () => alert('读取文件失败。');
  reader.readAsText(file);
}

/* ============================================================
   新手引导
   ============================================================ */
const ONBOARD_STEPS = [
  {
    icon: '1',
    title: '这是一个打字闯关道场',
    body: `<p>19 个关卡分五章，从「认识键盘」一路练到「英文美文 / 语文短文 / 代码符号」。每一关都有星级评分，三星要求<b>正确率 97% 以上且达到目标速度</b>。</p>
           <ul><li>地图顶部还有<b>每日一练</b>、<b>水平测试</b>和<b>弱键特训</b></li>
               <li>没有基础也没关系，第一章只有八个键</li></ul>`
  },
  {
    icon: '2',
    title: '怎么开始打',
    body: `<p>点任意一关就进入练习。直接开始打字就行，<b>不用点任何输入框</b>。</p>
           <ul><li>打对了字变<span style="color:var(--ok)">绿色</span>，当前的字有下划线</li>
               <li>打错了字闪<span style="color:var(--bad)">红色</span>，进度不前进，重打一遍就好</li>
               <li>按 <kbd>Backspace</kbd> 可以退回一格</li>
               <li>按 <kbd>Esc</kbd> 随时回到地图</li></ul>`
  },
  {
    icon: '3',
    title: '键盘会告诉你用哪根手指',
    body: `<p>屏幕下方的虚拟键盘上，<b>高亮的那一格就是下一个要按的键</b>；再下面的双手示意图会告诉你该用哪根手指。</p>
           <ul><li>需要 Shift 时，会同时高亮另一只手的 Shift</li>
               <li>中文关卡会显示拼音提示，切换到<b>小鹤双拼</b>还会显示双拼码</li>
               <li>手机和平板可以直接用系统键盘，键盘图默认收起</li></ul>`
  },
  {
    icon: '4',
    title: '数据和设置',
    body: `<p>所有成绩都存在你自己的浏览器里，不会上传。右上角「设置」可以调整：</p>
           <ul><li><b>主题</b>：浅色 / 深色 / 跟随系统</li>
               <li><b>界面字号</b>：小 / 中 / 大 / 特大</li>
               <li><b>动画效果</b>：觉得晃眼可以关掉</li>
               <li><b>数据</b>：导出备份，换设备时导入即可</li></ul>`
  }
];

let obStep = 0;
function renderOnboard() {
  const s = ONBOARD_STEPS[obStep];
  $('#ob-body').innerHTML = `<div class="ob-icon">${s.icon}</div><h3>${s.title}</h3>${s.body}`;
  $('#ob-dots').innerHTML = ONBOARD_STEPS.map((_, i) => `<i class="${i === obStep ? 'on' : ''}"></i>`).join('');
  $('#ob-prev').style.visibility = obStep === 0 ? 'hidden' : 'visible';
  $('#ob-next').textContent = obStep === ONBOARD_STEPS.length - 1 ? '开始练习' : '下一步';
  $('#ob-skip').style.display = obStep === ONBOARD_STEPS.length - 1 ? 'none' : '';
}

function showOnboard() {
  obStep = 0;
  renderOnboard();
  $('#onboard-modal').classList.add('show');
}

function closeOnboard() {
  $('#onboard-modal').classList.remove('show');
  if (!pref.onboarded) { pref.onboarded = true; savePref(); }
}

/* ============================================================
   音效
   ============================================================ */
let audioCtx = null;
function beep(freq, dur, type, vol) {
  if (!pref.soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch (e) {}
}
const playTone = (ok) => beep(ok ? 880 : 180, ok ? 0.05 : 0.09, ok ? 'sine' : 'square', ok ? 0.04 : 0.05);
const playTick = () => beep(1400, 0.03, 'sine', 0.035);

/* ============================================================
   键盘渲染
   ============================================================ */
let keyEls = {};
let kbRoot = null;

function buildKeyboard(root, opts) {
  opts = opts || {};
  root.innerHTML = '';
  const map = {};
  KEY_ROWS.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach((k) => {
      const el = document.createElement('div');
      el.className = 'key';
      if (k.f && !opts.noFinger) el.classList.add('f-' + k.f);
      if (k.wide) el.classList.add('wide');
      if (k.home) el.classList.add('home');
      el.style.flexGrow = String(k.w);
      el.style.flexBasis = '0';

      let html = '';
      if (k.t.length === 1 && k.t !== ' ') {
        html += `<span class="k-main">${k.f ? k.t.toUpperCase() : esc(k.t)}</span>`;
        if (k.s) html += `<span class="k-shift">${esc(k.s)}</span>`;
      } else {
        html += `<span class="k-main k-label">${esc(k.label || k.t)}</span>`;
      }
      if (k.home) html += '<span class="k-nub"></span>';
      el.innerHTML = html;

      el.dataset.ch = k.t;
      el.__spec = k;
      map[k.t] = el;
      if (k.s) map[k.s] = el;
      rowEl.appendChild(el);
    });
    root.appendChild(rowEl);
  });
  return map;
}

function buildAllKeyboards() {
  const mainKb = $('#keyboard');
  if (mainKb) {
    keyEls = buildKeyboard(mainKb);
    kbRoot = mainKb;
    bindVirtualKeyboard();
  }
  const learnKb = $('#learn-keyboard');
  if (learnKb) buildKeyboard(learnKb);
}

const KEY_FINGER = {
  '`': 'l5', '1': 'l5', '2': 'l4', '3': 'l3', '4': 'l2', '5': 'l2',
  '6': 'r2', '7': 'r2', '8': 'r3', '9': 'r4', '0': 'r5', '-': 'r5', '=': 'r5',
  'q': 'l5', 'w': 'l4', 'e': 'l3', 'r': 'l2', 't': 'l2', 'y': 'r2', 'u': 'r2',
  'i': 'r3', 'o': 'r4', 'p': 'r5', '[': 'r5', ']': 'r5', '\\': 'r5',
  'a': 'l5', 's': 'l4', 'd': 'l3', 'f': 'l2', 'g': 'l2', 'h': 'r2', 'j': 'r2',
  'k': 'r3', 'l': 'r4', ';': 'r5', "'": 'r5',
  'z': 'l5', 'x': 'l4', 'c': 'l3', 'v': 'l2', 'b': 'l2', 'n': 'r2', 'm': 'r2',
  ',': 'r3', '.': 'r4', '/': 'r5', ' ': 'thumb'
};

function normalizeKey(ch) {
  if (ch === '\n') return 'Enter';
  if (ch === '\t') return 'Tab';
  if (SHIFT_MAP[ch]) return SHIFT_MAP[ch];
  if (/[A-Z]/.test(ch)) return ch.toLowerCase();
  return ch;
}

function flashKey(ch, ok) {
  const el = keyEls[normalizeKey(ch)];
  if (!el) return;
  el.classList.add('active', ok ? 'hit-ok' : 'hit-bad');
  setTimeout(() => el.classList.remove('active', 'hit-ok', 'hit-bad'), 130);
}

function clearKbHighlight() {
  if (!kbRoot) return;
  $$('.key.next, .key.next-2, .key.next-shift', kbRoot).forEach((el) => el.classList.remove('next', 'next-2', 'next-shift'));
}

/* ---------- 手部指示 ---------- */
function updateHand(finger) {
  $$('.finger').forEach((f) => f.classList.toggle('on', !!finger && f.dataset.f === finger));
}

/* ============================================================
   模拟键盘：鼠标 / 手指点击键帽输入
   ============================================================ */
let shiftLatch = false;
let capsLatch = false;

function setLatchVisual() {
  const l = keyEls['ShiftLeft'];
  const r = keyEls['ShiftRight'];
  const c = keyEls['CapsLock'];
  if (l) l.classList.toggle('latched', shiftLatch);
  if (r) r.classList.toggle('latched', shiftLatch);
  if (c) c.classList.toggle('latched', capsLatch);
}

function resetLatch() {
  shiftLatch = false;
  capsLatch = false;
  setLatchVisual();
}

function revealKey(el) {
  if (!el || !document.body.classList.contains('blind')) return;
  el.classList.add('reveal');
  clearTimeout(el._rv);
  el._rv = setTimeout(() => el.classList.remove('reveal'), 480);
}

/* 点键帽 = 按下一个键，走和物理键盘完全相同的输入通路 */
function virtualKeyPress(spec) {
  if (!spec) return false;
  if (state.view !== 'practice' || state.finished || state.paused) return false;

  const el = keyEls[spec.t];
  revealKey(el);
  if (el) {
    el.classList.add('pressing');
    clearTimeout(el._pt);
    el._pt = setTimeout(() => el.classList.remove('pressing'), 110);
  }

  // 修饰键：单击锁定 / 再点取消
  if (spec.t === 'ShiftLeft' || spec.t === 'ShiftRight') {
    shiftLatch = !shiftLatch;
    setLatchVisual();
    return true;
  }
  if (spec.t === 'CapsLock') {
    capsLatch = !capsLatch;
    setLatchVisual();
    return true;
  }
  if (spec.t === 'Backspace') { stepBack(); return true; }
  if (spec.t === 'Enter') { processString('\n'); return true; }
  // Tab 不参与输入：物理键盘上它是被 preventDefault 掉的，模拟键盘保持一致，避免误判为打错
  if (spec.t === 'Tab') return false;
  if (spec.t.length !== 1) return false; // Ctrl / Alt / Win / Menu 不参与输入

  let ch = spec.t;
  if (/^[a-z]$/.test(ch)) {
    // Shift 与 Caps 同时按下时互相抵消，与真实键盘一致
    ch = (shiftLatch !== capsLatch) ? ch.toUpperCase() : ch;
  } else if (shiftLatch && spec.s) {
    ch = spec.s;
  }
  processString(ch);
  return true;
}

const KB_DOWN_EVENT = (typeof window !== 'undefined' && window.PointerEvent) ? 'pointerdown' : 'mousedown';

function bindVirtualKeyboard() {
  if (!kbRoot) return;
  kbRoot.addEventListener(KB_DOWN_EVENT, (e) => {
    const el = e.target && e.target.closest ? e.target.closest('.key') : null;
    if (!el) return;
    // 阻止默认行为，避免点键帽时把焦点从隐藏输入框抢走
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    virtualKeyPress(el.__spec);
  });
}

/* ============================================================
   下一个按键
   ============================================================ */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

function nextKeyInfo() {
  const ch = state.text[state.index];
  if (ch === undefined) return null;

  if (state.pinyin) {
    const py = state.pinyin[state.index];
    if (!py) return null;
    if (py === ' ') return { key: ' ', shift: false, label: '空格', finger: 'thumb', hint: '空格' };
    if (/^[a-z]/i.test(py)) {
      if (pref.scheme === 'xiaohe') {
        const sp = toShuangpin(py);
        if (sp && sp.length >= 1 && sp.length <= 2) {
          return {
            keys: sp.split(''), label: sp, finger: KEY_FINGER[sp[0]],
            finger2: sp.length > 1 ? KEY_FINGER[sp[1]] : null,
            hint: py, isPy: true, isSp: true
          };
        }
      }
      const k = py[0].toLowerCase();
      return { key: k, shift: false, label: py, finger: KEY_FINGER[k], hint: py, isPy: true };
    }
    const pk = PUNCT_KEY[py] || py;
    return { key: pk, shift: false, label: py, finger: KEY_FINGER[pk] || null, hint: py, isPy: true, punct: true };
  }

  if (ch === '\n') return { key: 'Enter', shift: false, label: 'Enter', finger: 'r5', hint: '回车换行' };
  if (ch === ' ') return { key: ' ', shift: false, label: '空格', finger: 'thumb', hint: '空格' };
  if (ch === '\t') return { key: 'Tab', shift: false, label: 'Tab', finger: 'l5', hint: 'Tab' };

  if (CJK_RE.test(ch)) {
    return { key: null, shift: false, label: ch, finger: null, hint: '用拼音输入法打出这个字', cjk: true };
  }

  let base = ch;
  let shift = false;
  if (SHIFT_MAP[ch]) { base = SHIFT_MAP[ch]; shift = true; }
  else if (/[A-Z]/.test(ch)) { base = ch.toLowerCase(); shift = true; }
  return { key: base, shift, label: ch, finger: KEY_FINGER[base], hint: ch };
}

function updateNextKey() {
  clearKbHighlight();
  const info = nextKeyInfo();
  const nk = $('#nk-key');
  const nf = $('#nk-finger');
  if (!nk || !nf) return;
  if (kbRoot) kbRoot.classList.toggle('sp-mode', !!(info && info.isSp));

  if (!info) {
    nk.textContent = '—';
    nk.classList.add('dim');
    nf.textContent = '已完成';
    updateHand(null);
    return;
  }

  const fingerName = info.finger ? FINGER_NAMES[info.finger] : '';

  if (info.key === null) {
    nk.textContent = info.label;
    nk.classList.remove('dim');
    nf.textContent = info.hint;
    updateHand(null);
    return;
  }

  /* 双拼：高亮两个键，并标注 1 / 2 */
  if (info.isSp) {
    nk.classList.remove('dim');
    nk.textContent = info.label.toUpperCase();
    nf.textContent = info.keys.length > 1
      ? `小鹤双拼 ${info.label} · 先敲 ${info.keys[0].toUpperCase()}，再敲 ${info.keys[1].toUpperCase()}`
      : `小鹤双拼 ${info.label} · 按 ${info.keys[0].toUpperCase()} 键`;
    const a = keyEls[info.keys[0]];
    if (a) a.classList.add('next');
    if (info.keys[1]) {
      const b = keyEls[info.keys[1]];
      if (b && b !== a) b.classList.add('next-2');
    }
    updateHand(info.finger);
    return;
  }

  nk.classList.remove('dim');
  nk.textContent = info.key === ' ' ? '空格' : (info.key.length === 1 ? info.key.toUpperCase() : info.key);

  let text;
  if (info.punct) text = `标点「${info.hint}」· 按 ${info.key} 键`;
  else if (info.isPy) text = `拼音 ${info.hint} · 首字母 ${info.key.toUpperCase()} · ${fingerName}`;
  else if (info.shift) text = `${fingerName} · 配合${(info.finger || '')[0] === 'r' ? '左' : '右'}手 Shift`;
  else text = fingerName;
  nf.textContent = text;

  const el = keyEls[info.key];
  if (el) el.classList.add('next');
  if (info.shift) {
    const sEl = keyEls[(info.finger || '')[0] === 'r' ? 'ShiftLeft' : 'ShiftRight'];
    if (sEl) sEl.classList.add('next-shift');
  }
  updateHand(info.finger);
}

/* ============================================================
   节拍器
   ============================================================ */
let metroId = null;
function stopMetro() {
  if (metroId) { clearInterval(metroId); metroId = null; }
  const b = $('#beat');
  if (b) b.classList.remove('on');
  const box = $('#bpm-box');
  if (box) box.classList.add('off');
}
function startMetro() {
  stopMetro();
  const beat = $('#beat');
  if (!pref.metronome || state.finished || state.paused || state.view !== 'practice') {
    if (beat) beat.querySelector('span').textContent = '节拍器已关闭';
    return;
  }
  const box = $('#bpm-box');
  if (box) box.classList.remove('off');
  if (beat) {
    beat.classList.add('on');
    beat.querySelector('span').textContent = `节拍器 ${pref.bpm} BPM · 跟着节奏敲`;
  }
  const period = 60000 / pref.bpm;
  const tick = () => {
    playTick();
    const dot = beat && beat.querySelector('i');
    if (dot) { dot.classList.remove('hit'); void dot.offsetWidth; dot.classList.add('hit'); }
  };
  tick();
  metroId = setInterval(tick, period);
}

/* ============================================================
   视图
   ============================================================ */
function showView(name) {
  state.view = name;
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === 'view-' + name));
  $$('.navbtn').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === name));
  if (typeof window.scrollTo === 'function') {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { try { window.scrollTo(0, 0); } catch (e2) {} }
  }
  if (name === 'stats') renderStats();
  setTimeout(updateTapHint, 50);
}

function leavePractice() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  stopMetro();
  state.paused = false;
}

/* ============================================================
   关卡地图
   ============================================================ */
function computeTotals() {
  let stars = 0, best = 0, cleared = 0;
  FLAT.forEach((lv) => {
    const r = progress[lv.id];
    if (r) {
      stars += r.stars;
      best = Math.max(best, r.score || 0);
      if (r.stars >= 1) cleared++;
    }
  });
  return { stars, best, cleared };
}

function renderMap() {
  const wrap = $('#chapters');
  if (!wrap) return;
  wrap.innerHTML = '';

  CHAPTERS.forEach((ch) => {
    const sec = document.createElement('section');
    sec.className = 'chapter';

    const head = document.createElement('div');
    head.className = 'chapter-head';
    head.style.setProperty('--c', ch.color);
    head.innerHTML = `
      <div class="ch-no">${ch.no}</div>
      <div class="ch-txt"><h2>${esc(ch.title)}</h2><p>${esc(ch.sub)}</p></div>
      <div class="ch-count"></div>`;
    sec.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'level-grid';
    let chStars = 0;

    ch.levels.forEach((lv) => {
      const rec = progress[lv.id];
      const stars = rec ? rec.stars : 0;
      chStars += stars;
      const unlocked = isUnlocked(lv.id);

      const card = document.createElement('button');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      card.style.setProperty('--c', ch.color);
      card.dataset.level = lv.id;

      const typeLabel = { drill: '指法训练', text: '短文', zh: '中文', code: '代码' }[lv.type] || '练习';
      const starHtml = [1, 2, 3].map((n) => `<i class="${stars >= n ? 'on' : ''}">★</i>`).join('');

      card.innerHTML = `
        <div class="lc-top"><span class="lc-id">${lv.id}</span><span class="lc-type">${typeLabel}</span></div>
        <div class="lc-name">${esc(lv.name)}</div>
        <div class="lc-sub">${esc(lv.sub || '')}</div>
        <div class="lc-stars">${starHtml}</div>
        ${rec ? `<div class="lc-best">最佳 ${rec.cpm} 字/分 · ${Math.round(rec.acc * 100)}%</div>` : '<div class="lc-best dim">尚未挑战</div>'}
        ${unlocked ? '' : '<div class="lc-lock">先通过上一关</div>'}`;
      grid.appendChild(card);
    });

    head.querySelector('.ch-count').textContent = `★ ${chStars} / ${ch.levels.length * 3}`;
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });

  const t = computeTotals();
  $('#hud-stars').textContent = String(t.stars);
  $('#hud-score').textContent = String(t.best);
  $('#hud-clear').textContent = `${t.cleared}/${FLAT.length}`;
  $('#hud-streak').textContent = `${stats.streak || 0} 天`;
  renderDaily();
  renderTools();
}

/* ---------- 训练中心卡片 ---------- */
function renderTools() {
  const p = stats.placement;
  const foot = $('#tt-place-foot');
  if (foot) {
    if (p) {
      const d = new Date(p.at);
      foot.textContent = `上次 ${p.cpm} 字/分 · ${p.level} · ${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
    } else {
      foot.textContent = '还没测过 · 点这里开始';
    }
  }

  const wf = $('#tt-weak-foot');
  if (wf) {
    const wk = weakKeyStats();
    wf.textContent = wk.length
      ? '当前最弱：' + wk.slice(0, 5).map((e) => (e.k === ' ' ? '空格' : e.k.toUpperCase())).join(' ')
      : '样本不足 · 先练几关';
  }

  const toggle = $('#toggle-target');
  if (toggle) {
    toggle.checked = pref.targetMode === 'personal';
    const lbl = $('#target-label');
    if (lbl) {
      lbl.textContent = pref.targetMode === 'personal' && stats.placement
        ? `目标 ${stats.placement.target} 字/分（按你的水平）`
        : '按关卡默认目标';
    }
  }
}

/* ---------- 每日一练 ---------- */
function dailyIndex() {
  const k = todayKey();
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h % DAILY_POOL.length;
}

function dailyLevel() {
  const p = DAILY_POOL[dailyIndex()];
  let type = 'text';
  if (p.pinyin) type = 'zh';
  else if (p.text.indexOf('\n') >= 0 || /[<>{}\[\]()=>;]/.test(p.text)) type = 'code';
  return {
    id: 'daily',
    name: '每日一练',
    sub: p.kind,
    type,
    text: p.text,
    pinyin: p.pinyin || null,
    target: p.target,
    tip: '这是今天为你准备的挑战。完成后记得回来看看连续打卡天数。'
  };
}

function renderDaily() {
  const p = DAILY_POOL[dailyIndex()];
  const done = !!stats.dailyDone[todayKey()];
  const d = new Date();
  const card = $('#daily-card');
  if (!card) return;

  card.classList.toggle('done', done);
  $('#dc-title').textContent = done ? '今日挑战已完成' : '今日挑战 · ' + p.kind;
  $('#dc-meta').textContent = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 目标 ${p.target} 字/分`;
  $('#dc-preview').textContent = p.text;
  $('#dc-streak').textContent = String(stats.streak || 0);
  const btn = $('#dc-start');
  btn.textContent = done ? '再练一次' : '开始今日挑战';
  btn.classList.toggle('primary', !done);
  btn.classList.toggle('ghost', done);
}

/* ============================================================
   文本生成
   ============================================================ */
function generateDrill(keys, len) {
  const out = [];
  let count = 0;
  while (count < len) {
    const n = 3 + Math.floor(Math.random() * 3);
    let w = '';
    for (let i = 0; i < n; i++) { w += keys[Math.floor(Math.random() * keys.length)]; count++; }
    out.push(w);
    count++;
  }
  return out.join(' ');
}
function prepareText(level) {
  if (level.text) return level.text;
  if (level.type === 'drill') return generateDrill(level.keys, level.len || 110);
  return '';
}

/* ============================================================
   特殊关卡构造
   ============================================================ */
function placementLevel() {
  return {
    id: 'placement',
    name: '水平测试',
    sub: `${PLACEMENT_SECONDS} 秒 · 测出你的真实速度`,
    type: 'text',
    text: PLACEMENT_TEXT,
    pinyin: null,
    target: 100,
    timed: PLACEMENT_SECONDS,
    tip: `${PLACEMENT_SECONDS} 秒内尽可能又快又准地打。不用追求极限速度，按你平时舒服的节奏来，结果才准确。时间到会自动结算。`
  };
}

function weakLevel() {
  const d = generateWeakDrill(110);
  if (!d) return null;
  return {
    id: 'weak',
    name: '弱键特训',
    sub: '针对：' + d.keys.map((k) => (k === ' ' ? '空格' : k.toUpperCase())).join(' '),
    type: 'drill',
    text: d.text,
    pinyin: null,
    target: 70,
    tip: '这段文本由你的历史数据生成——越弱的键出现得越多。这是刻意练习，慢一点没关系，打对最重要。'
  };
}

/* ============================================================
   开始关卡
   ============================================================ */
function startLevel(levelOrId) {
  let level;
  if (levelOrId === 'daily') level = dailyLevel();
  else if (levelOrId === 'placement') level = placementLevel();
  else if (levelOrId === 'weak') level = weakLevel();
  else if (typeof levelOrId === 'string') level = LEVEL_BY_ID[levelOrId];
  else level = levelOrId;
  if (!level) return;

  const chapter = CHAPTERS.find((c) => c.id === level.chapterId) || null;

  state.level = level;
  state.chapter = chapter;
  state.text = prepareText(level);
  state.pinyin = level.pinyin || null;
  state.index = 0;
  state.started = false;
  state.finished = false;
  state.paused = false;
  state.elapsedBase = 0;
  state.segStart = 0;
  state.totalKeys = 0;
  state.correctKeys = 0;
  state.errorKeys = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.keyTimes = [];
  state.keyLat = {};
  state.keyErr = {};
  state.lastKeyAt = 0;
  state.samples = [];
  state.lastSample = 0;
  state.peakCpm = 0;
  state.nextLevelId = null;
  state.timeLimit = level.timed || 0;
  state.target = level.id === 'placement' ? 100 : effectiveTarget(level);

  $('#p-name').textContent = (level.id === 'daily' || level.id === 'placement' || level.id === 'weak')
    ? level.name : `${level.id}　${level.name}`;
  $('#p-sub').textContent = (chapter ? chapter.title + ' · ' : '') + (level.sub || '');
  $('#p-tip').innerHTML = `<b>小提示</b>${esc(level.tip || '')}`;
  $('#p-tip').style.setProperty('--c', chapter ? chapter.color : '#4c6ef5');
  $('#m-target').textContent = level.id === 'placement' ? '不计目标' : state.target + ' 字/分';
  $('#p-timer').textContent = state.timeLimit > 0 ? fmtClock(state.timeLimit) : '0:00';
  $('#p-progress').style.width = '0%';
  $('#ls-cpm').textContent = '0';
  $('#ls-avg').textContent = '0';
  $('#ls-peak').textContent = '0';
  $('#ls-bar').style.width = '0%';
  $('#btn-pause').textContent = '暂停';
  $('#text-display').classList.remove('blur');
  $('#hands').classList.toggle('off', !pref.showHand);
  $('#toggle-metro').checked = !!pref.metronome;
  $('#toggle-hand').checked = !!pref.showHand;
  $('#toggle-blind').checked = !!pref.blind;
  $('#bpm-val').textContent = String(pref.bpm);
  $('#scheme').value = pref.scheme;
  resetLatch();

  renderText();
  updateMetrics();
  updateNextKey();
  drawChart();

  if (state.timerId) clearInterval(state.timerId);
  state.timerId = setInterval(tick, 100);
  showView('practice');
  startMetro();

  const tkb = $('#btn-touch-kb');
  if (tkb) tkb.textContent = pref.showKeyboard ? '隐藏键盘图' : '显示键盘图';
  if (isTouch) {
    setTimeout(updateTapHint, 60);
  } else {
    setTimeout(focusInput, 60);
  }
}

function renderText() {
  const box = $('#text-display');
  box.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < state.text.length; i++) {
    const ch = state.text[i];
    const span = document.createElement('span');
    span.className = 'ch';
    if (ch === '\n') { span.classList.add('nl'); span.textContent = '↵\n'; }
    else if (ch === ' ') { span.classList.add('sp'); span.textContent = ' '; }
    else span.textContent = ch;
    frag.appendChild(span);
  }
  box.appendChild(frag);
  box.scrollTop = 0;
  paint();
}

function paint() {
  const nodes = $('#text-display').children;
  for (let i = 0; i < nodes.length; i++) {
    const ch = state.text[i];
    let cls = 'ch';
    if (ch === '\n') cls += ' nl';
    else if (ch === ' ') cls += ' sp';
    if (i < state.index) cls += ' correct';
    else if (i === state.index) cls += ' current';
    if (nodes[i].className !== cls) nodes[i].className = cls;
  }
}

function scrollToCurrent() {
  const box = $('#text-display');
  const node = box.children[state.index];
  if (!node) return;
  const target = Math.max(0, node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2);
  if (typeof box.scrollTo === 'function') {
    try { box.scrollTo({ top: target, behavior: 'smooth' }); return; } catch (e) {}
  }
  box.scrollTop = target;
}

function markWrong() {
  const node = $('#text-display').children[state.index];
  if (!node) return;
  node.classList.add('wrong');
  clearTimeout(node._wt);
  node._wt = setTimeout(() => node.classList.remove('wrong'), 220);
}

/* 退回一格（键盘 Backspace / 触摸设备按钮共用） */
function stepBack() {
  if (state.view !== 'practice' || state.finished || state.paused) return;
  if (state.index <= 0) return;
  state.index--;
  state.combo = 0;
  paint();
  scrollToCurrent();
  updateMetrics();
  updateNextKey();
}

/* ============================================================
   输入
   ============================================================ */
function focusInput() {
  const el = $('#hidden-input');
  if (!el) return;
  el.value = '';
  try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
}

/* 触摸设备上的「点这里开始输入」提示 */
function isTouchMode() {
  return document.body.classList.contains('touch');
}
function updateTapHint() {
  const h = $('#tap-hint');
  if (!h) return;
  const show = isTouchMode() && state.view === 'practice' && !state.finished && !state.paused
    && document.activeElement !== $('#hidden-input');
  h.classList.toggle('show', show);
}

function announce(msg) {
  const live = $('#live-region');
  if (live) live.textContent = msg;
}

function processString(str) {
  if (state.finished || state.paused || !str) return;
  for (const ch of str) {
    if (state.finished || state.paused) break;
    if (!handleChar(ch)) break;
  }
}

function handleChar(ch) {
  const target = state.text[state.index];
  if (target === undefined) return true;
  const now = performance.now();

  if (!state.started) {
    state.started = true;
    state.segStart = now;
    state.elapsedBase = 0;
  }

  state.totalKeys++;
  const ok = ch === target;

  if (ok) {
    if (state.lastKeyAt) {
      const d = now - state.lastKeyAt;
      if (d > 0 && d < 3000) {
        const k = normalizeKey(ch);
        if (!state.keyLat[k]) state.keyLat[k] = [0, 0];
        state.keyLat[k][0] += 1;
        state.keyLat[k][1] += d;
      }
    }
    state.lastKeyAt = now;

    state.correctKeys++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.keyTimes.push(now);
    flashKey(ch, true);
    playTone(true);
    state.index++;
    paint();
    scrollToCurrent();
    if (state.index >= state.text.length) {
      updateMetrics();
      finishLevel();
      return true;
    }
  } else {
    state.errorKeys++;
    state.combo = 0;
    const badKey = normalizeKey(target);
    if (badKey.length === 1) state.keyErr[badKey] = (state.keyErr[badKey] || 0) + 1;
    markWrong();
    flashKey(ch, false);
    playTone(false);
  }

  updateMetrics();
  updateNextKey();
  return ok;
}

function elapsedMs() {
  if (!state.started) return 0;
  return state.paused ? state.elapsedBase : state.elapsedBase + (performance.now() - state.segStart);
}

function updateMetrics() {
  const el = elapsedMs() / 1000;
  const minutes = el / 60;
  const cpm = minutes > 0.002 ? state.correctKeys / minutes : 0;
  const acc = state.totalKeys > 0 ? state.correctKeys / state.totalKeys : 1;

  $('#m-cpm').textContent = String(Math.round(cpm));
  $('#m-wpm').textContent = String(Math.round(cpm / 5));
  $('#m-acc').textContent = Math.round(acc * 100) + '%';
  $('#m-combo').textContent = String(state.combo);
  $('#m-err').textContent = String(state.errorKeys);
  const pct = Math.min(100, (state.index / (state.text.length || 1)) * 100);
  $('#p-progress').style.width = pct + '%';
  const bar = $('#p-progress-bar');
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function tick() {
  const el = elapsedMs() / 1000;
  if (state.timeLimit > 0) {
    const left = Math.max(0, state.timeLimit - el);
    $('#p-timer').textContent = fmtClock(left);
    if (state.started && left <= 0) { finishLevel(); return; }
  } else {
    $('#p-timer').textContent = fmtClock(el);
  }
  if (state.started && !state.paused) updateMetrics();

  const now = performance.now();
  if (now - state.lastSample < 250) return;
  state.lastSample = now;

  const win = 5000;
  const recent = state.keyTimes.filter((t) => now - t <= win);
  const liveCpm = recent.length > 0 ? (recent.length / win) * 60000 : 0;
  state.samples.push(liveCpm);
  if (state.samples.length > 80) state.samples.shift();
  if (liveCpm > state.peakCpm) state.peakCpm = liveCpm;

  $('#ls-cpm').textContent = String(Math.round(liveCpm));
  const barMax = Math.max(120, state.target * 1.6);
  $('#ls-bar').style.width = Math.min(100, (liveCpm / barMax) * 100) + '%';
  $('#ls-avg').textContent = String(Math.round(el > 1 ? state.correctKeys / (el / 60) : 0));
  $('#ls-peak').textContent = String(Math.round(state.peakCpm));
  drawChart();
}

function togglePause() {
  if (state.finished) return;
  if (state.paused) {
    state.paused = false;
    state.segStart = performance.now();
    $('#btn-pause').textContent = '暂停';
    $('#text-display').classList.remove('blur');
    startMetro();
    focusInput();
  } else {
    if (state.started) state.elapsedBase += performance.now() - state.segStart;
    state.paused = true;
    $('#btn-pause').textContent = '继续';
    $('#text-display').classList.add('blur');
    stopMetro();
  }
}

/* ============================================================
   速度曲线
   ============================================================ */
function drawChart() {
  const c = $('#speed-chart');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 600;
  const h = 150;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.height = h + 'px';
  }
  const ctx = c.getContext && c.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const padL = 44, padR = 12, padT = 14, padB = 22;
  const iw = w - padL - padR, ih = h - padT - padB;
  const samples = state.samples;
  const dataMax = samples.length ? Math.max.apply(null, samples) : 0;
  const target = state.target || 100;
  let top = Math.max(60, target * 1.4, dataMax * 1.15);
  top = Math.ceil(top / 20) * 20;

  const N = 80;
  const xOf = (i) => padL + (i / (N - 1)) * iw;
  const yOf = (v) => padT + ih - (v / top) * ih;

  ctx.strokeStyle = TC.grid; ctx.lineWidth = 1;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = TC.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 3; g++) {
    const v = (top / 3) * g, y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
    ctx.fillText(String(Math.round(v)), padL - 8, y);
  }

  const ty = yOf(target);
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.strokeStyle = TC.target;
  ctx.beginPath(); ctx.moveTo(padL, ty); ctx.lineTo(padL + iw, ty); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = TC.targetTxt; ctx.textAlign = 'left';
  ctx.fillText('目标 ' + target, padL + 6, ty - 9);

  if (samples.length < 2) {
    ctx.fillStyle = TC.hint; ctx.textAlign = 'center';
    ctx.fillText('开始输入后，这里会实时画出你的速度曲线', padL + iw / 2, padT + ih / 2);
    return;
  }

  const offset = N - samples.length;
  const pts = samples.map((v, i) => [xOf(offset + i), yOf(v)]);
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
  grad.addColorStop(0, TC.fill);
  grad.addColorStop(1, 'rgba(76,110,245,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0][0], padT + ih);
  pts.forEach((p) => ctx.lineTo(p[0], p[1]));
  ctx.lineTo(pts[pts.length - 1][0], padT + ih);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.strokeStyle = TC.line; ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

  const last = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(last[0], last[1], 4.5, 0, Math.PI * 2);
  ctx.fillStyle = TC.surface; ctx.fill();
  ctx.strokeStyle = TC.line; ctx.lineWidth = 2.5; ctx.stroke();
}

/* ============================================================
   结算
   ============================================================ */
function computeStars(acc, cpm, target) {
  if (acc >= 0.97 && cpm >= target) return 3;
  if (acc >= 0.90 && cpm >= target * 0.7) return 2;
  return 1;
}

function markDay() {
  const today = todayKey();
  if (stats.lastDay === today) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yk = dateKey(y);
  stats.streak = stats.lastDay === yk ? (stats.streak || 0) + 1 : 1;
  stats.lastDay = today;
  if (!stats.days) stats.days = {};
  stats.days[today] = (stats.days[today] || 0) + 1;
  const keys = Object.keys(stats.days).sort();
  while (keys.length > 400) delete stats.days[keys.shift()];
}

function achMet(id, c) {
  switch (id) {
    case 'first': return c.cleared >= 1;
    case 'perfect': return stats.perfectCount >= 1;
    case 'combo50': return stats.bestCombo >= 50;
    case 'combo100': return stats.bestCombo >= 100;
    case 'cpm100': return stats.bestCpm >= 100;
    case 'cpm150': return stats.bestCpm >= 150;
    case 'cpm200': return stats.bestCpm >= 200;
    case 'zh': return c.chCleared.ch4;
    case 'code': return c.chCleared.ch5;
    case 'stars20': return c.stars >= 20;
    case 'stars57': return c.stars >= TOTAL_STARS_MAX;
    case 'time30': return stats.totalTime >= 1800;
    case 'daily3': return stats.streak >= 3;
    case 'daily7': return stats.streak >= 7;
    case 'daily30': return stats.streak >= 30;
    case 'allclear': return c.cleared >= FLAT.length;
    default: return false;
  }
}

function checkAchievements() {
  const chCleared = {};
  CHAPTERS.forEach((ch) => {
    chCleared[ch.id] = ch.levels.every((lv) => progress[lv.id] && progress[lv.id].stars >= 1);
  });
  const t = computeTotals();
  const ctx = { cleared: t.cleared, stars: t.stars, chCleared };
  const newly = [];
  ACHIEVEMENTS.forEach((a) => {
    if (stats.achievements[a.id]) return;
    if (achMet(a.id, ctx)) { stats.achievements[a.id] = Date.now(); newly.push(a); }
  });
  return newly;
}

function finishLevel() {
  state.finished = true;
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  stopMetro();

  const elapsed = Math.max(0.001, elapsedMs() / 1000);
  const cpm = state.correctKeys / (elapsed / 60);
  const acc = state.totalKeys > 0 ? state.correctKeys / state.totalKeys : 1;
  const target = state.target;
  const isPlacement = state.level.id === 'placement';
  const isWeak = state.level.id === 'weak';
  const stars = computeStars(acc, cpm, target);
  const score = Math.round(state.correctKeys * 10 * Math.pow(acc, 1.5) * clamp(cpm / target, 0.6, 2) + state.maxCombo * 4);

  /* 关卡记录（水平测试 / 弱键特训 不写入关卡进度） */
  let isNewBest = false;
  let bestCpm = Math.round(cpm);
  if (!isPlacement && !isWeak) {
    const prev = progress[state.level.id];
    isNewBest = !prev || score > prev.score;
    bestCpm = prev ? Math.max(prev.cpm, Math.round(cpm)) : Math.round(cpm);
    progress[state.level.id] = {
      stars: prev ? Math.max(prev.stars, stars) : stars,
      score: prev ? Math.max(prev.score, score) : score,
      cpm: bestCpm,
      acc: prev ? Math.max(prev.acc, acc) : acc,
      plays: (prev ? prev.plays : 0) + 1,
      at: Date.now()
    };
  }
  if (state.level.id === 'daily') stats.dailyDone[todayKey()] = score;
  saveProgress();

  /* 累计统计 */
  stats.totalTime += elapsed;
  stats.totalKeys += state.totalKeys;
  stats.totalCorrect += state.correctKeys;
  stats.totalErrors += state.errorKeys;
  stats.sessions += 1;
  stats.bestCpm = Math.max(stats.bestCpm, Math.round(cpm));
  stats.bestCombo = Math.max(stats.bestCombo, state.maxCombo);
  if (state.errorKeys === 0 && state.correctKeys > 0) stats.perfectCount += 1;
  Object.keys(state.keyLat).forEach((k) => {
    if (!stats.keyLat[k]) stats.keyLat[k] = [0, 0];
    stats.keyLat[k][0] += state.keyLat[k][0];
    stats.keyLat[k][1] += state.keyLat[k][1];
  });
  Object.keys(state.keyErr).forEach((k) => {
    stats.keyErr[k] = (stats.keyErr[k] || 0) + state.keyErr[k];
  });
  markDay();

  /* 历史 */
  history.unshift({
    t: Date.now(), id: state.level.id, name: state.level.name,
    cpm: Math.round(cpm), acc, score, stars, dur: Math.round(elapsed)
  });
  if (history.length > 300) history.length = 300;
  saveHistory();

  /* 水平测试结果 */
  let placeTarget = null;
  if (isPlacement) {
    const lvName = cpm < 60 ? '入门新手' : cpm < 100 ? '熟练打手' : cpm < 150 ? '键盘高手' : '指尖大神';
    placeTarget = clamp(Math.round(cpm * 1.15), 30, 300);
    stats.placement = { cpm: Math.round(cpm), acc, target: placeTarget, level: lvName, at: Date.now() };
  }

  const newly = checkAchievements();
  saveStats();

  /* 弹窗 */
  $('#r-stars').style.display = isPlacement ? 'none' : '';
  $('#r-stars').innerHTML = [1, 2, 3].map((n) => `<i class="${stars >= n ? 'on' : ''}">★</i>`).join('');
  $('#r-title').textContent = isPlacement
    ? '测试完成！'
    : stars === 3 ? '完美通关！' : stars === 2 ? '不错，再快一点！' : '完成！继续打磨准确率';
  $('#r-sub').textContent = isPlacement
    ? '下面是根据你这次表现算出的建议目标速度'
    : (isNewBest ? '新纪录 · 刷新了本关历史最佳分数' : '已记录本次成绩');

  const placeBox = $('#r-place-box');
  if (placeBox) {
    placeBox.classList.toggle('on', isPlacement);
    if (isPlacement) {
      $('#r-place-level').textContent = stats.placement.level;
      $('#r-place-target').textContent = String(placeTarget);
      $('#r-place-note').textContent = `本次 ${Math.round(cpm)} 字/分 · 正确率 ${Math.round(acc * 100)}%。开启「目标式练习」后，所有关卡的三星目标都会按这个速度来定。`;
    }
  }
  $('#r-apply').style.display = isPlacement ? '' : 'none';

  $('#r-score').textContent = String(score);
  $('#r-cpm').textContent = String(Math.round(cpm));
  $('#r-acc').textContent = Math.round(acc * 100) + '%';
  $('#r-time').textContent = fmtClock(elapsed);
  $('#r-combo').textContent = String(state.maxCombo);
  $('#r-err').textContent = String(state.errorKeys);
  $('#r-best').textContent = isPlacement || isWeak ? '—' : `${bestCpm} 字/分`;

  /* 最慢的三个键 */
  const slow = Object.keys(state.keyLat)
    .filter((k) => state.keyLat[k][0] >= 2)
    .map((k) => ({ k, avg: state.keyLat[k][1] / state.keyLat[k][0] }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
  $('#r-slow').innerHTML = slow.length
    ? slow.map((s) => `<div class="slow-key"><b>${esc(s.k === ' ' ? '空格' : s.k.toUpperCase())}</b><span>${Math.round(s.avg)} ms</span></div>`).join('')
    : '<div class="slow-key"><b>—</b><span>样本不足</span></div>';

  /* 新成就 */
  $('#r-ach').innerHTML = newly.map((a) => `<div class="toast">解锁成就「${esc(a.name)}」· ${esc(a.desc)}</div>`).join('');

  const nextId = (isPlacement || isWeak || state.level.id === 'daily') ? null : nextLevelOf(state.level.id);
  state.nextLevelId = nextId;
  $('#r-next').style.display = nextId ? '' : 'none';

  renderMap();
  announce(`${state.level.name}完成，速度 ${Math.round(cpm)} 字每分，正确率 ${Math.round(acc * 100)}%，获得 ${stars} 星`);
  const th = $('#tap-hint');
  if (th) th.classList.remove('show');
  setTimeout(() => $('#result-modal').classList.add('show'), 260);
  if (!isPlacement && stars === 3) setTimeout(fireConfetti, 300);
}

/* ============================================================
   撒花
   ============================================================ */
function fireConfetti() {
  const c = $('#confetti');
  if (!c || !c.getContext) return;
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth || 800, H = window.innerHeight || 600;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  c.classList.add('on');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#4c6ef5', '#7048e8', '#f0a500', '#0ca678', '#e8590c', '#e18cc0', '#6fb3e0'];
  const parts = [];
  for (let i = 0; i < 110; i++) {
    parts.push({
      x: Math.random() * W,
      y: -30 - Math.random() * H * 0.6,
      w: 6 + Math.random() * 7,
      h: 8 + Math.random() * 10,
      vy: 2.4 + Math.random() * 3.4,
      vx: -1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI * 2,
      vr: -0.14 + Math.random() * 0.28,
      color: colors[(Math.random() * colors.length) | 0]
    });
  }
  let frames = 0;
  (function loop() {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.045;
      if (p.y < H + 60) alive++;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = clamp((H + 80 - p.y) / 160, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frames++;
    if (alive > 0 && frames < 280) requestAnimationFrame(loop);
    else { ctx.clearRect(0, 0, W, H); c.classList.remove('on'); }
  })();
}

/* ============================================================
   成绩统计页
   ============================================================ */
function drawTrend(canvas, values, opts) {
  if (!canvas) return;
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 480;
  const h = 172;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const padL = 44, padR = 12, padT = 14, padB = 24;
  const iw = w - padL - padR, ih = h - padT - padB;

  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';

  if (!values.length) {
    ctx.fillStyle = TC.hint;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('还没有数据，先去练一关吧', padL + iw / 2, padT + ih / 2);
    return;
  }

  const max = Math.max.apply(null, values);
  const min = Math.min.apply(null, values);
  const top = opts.pct ? 1 : Math.max(20, Math.ceil((max * 1.15) / 10) * 10);
  const bot = opts.pct ? clamp(Math.floor((min - 0.05) * 10) / 10, 0, 0.95) : 0;
  const span = Math.max(0.0001, top - bot);

  const n = values.length;
  const xOf = (i) => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yOf = (v) => padT + ih - ((v - bot) / span) * ih;

  ctx.strokeStyle = TC.grid; ctx.lineWidth = 1;
  ctx.fillStyle = TC.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 3; g++) {
    const v = bot + (span / 3) * g, y = yOf(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
    ctx.fillText(opts.pct ? Math.round(v * 100) + '%' : String(Math.round(v)), padL - 8, y);
  }

  const pts = values.map((v, i) => [xOf(i), yOf(v)]);
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
  grad.addColorStop(0, opts.pct ? TC.fill2 : TC.fill);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0][0], padT + ih);
  pts.forEach((p) => ctx.lineTo(p[0], p[1]));
  ctx.lineTo(pts[pts.length - 1][0], padT + ih);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.strokeStyle = opts.pct ? TC.line2 : TC.line;
  ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke();

  if (n <= 40) {
    pts.forEach((p) => {
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2);
      ctx.fillStyle = TC.surface; ctx.fill();
      ctx.strokeStyle = opts.pct ? TC.line2 : TC.line; ctx.lineWidth = 1.8; ctx.stroke();
    });
  }
}

const HEAT_STOPS = [
  [238, 243, 251], [199, 217, 247], [157, 182, 239],
  [242, 200, 107], [235, 154, 82], [232, 89, 12]
];
const HEAT_STOPS_DARK = [
  [42, 50, 68], [58, 78, 124], [92, 118, 190],
  [196, 146, 62], [222, 122, 62], [236, 92, 32]
];
function heatColor(t) {
  t = clamp(t, 0, 1);
  const stops = resolvedTheme() === 'dark' ? HEAT_STOPS_DARK : HEAT_STOPS;
  const seg = (stops.length - 1) * t;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i], b = stops[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

let heatMap = null;
let heatMode = 'lat';
function buildHeatKeyboard() {
  const root = $('#heat-keyboard');
  if (!root) return;
  heatMap = buildKeyboard(root, { noFinger: true });
}

function applyHeat() {
  if (!heatMap) return;
  const useErr = heatMode === 'err';
  const vals = [];
  Object.keys(heatMap).forEach((k) => {
    if (k.length !== 1) return;
    if (useErr) {
      const n = (stats.keyLat[k] && stats.keyLat[k][0]) || 0;
      const e = stats.keyErr[k] || 0;
      if (n + e >= 3) vals.push({ k, v: e / Math.max(1, n + e), n: n + e });
    } else {
      const e = stats.keyLat[k];
      if (e && e[0] >= 3) vals.push({ k, v: e[1] / e[0], n: e[0] });
    }
  });

  const nums = vals.map((x) => x.v);
  const lo = nums.length ? Math.min.apply(null, nums) : 0;
  const hi = nums.length ? Math.max.apply(null, nums) : 1;
  const byKey = {};
  vals.forEach((x) => { byKey[x.k] = x.v; });

  Object.keys(heatMap).forEach((k) => {
    if (k.length !== 1) return;
    const el = heatMap[k];
    if (!(k in byKey)) { el.style.background = TC.heatNone; return; }
    const t = hi - lo < (useErr ? 0.02 : 1) ? 0.5 : (byKey[k] - lo) / (hi - lo);
    el.style.background = heatColor(t);
  });

  const ranked = vals.slice().sort((a, b) => b.v - a.v).slice(0, 3);
  const el = $('#heat-slowest');
  if (el) {
    el.textContent = ranked.length
      ? (useErr ? '最易错：' : '最慢：') + ranked.map((r) => {
        const name = r.k === ' ' ? '空格' : r.k.toUpperCase();
        return useErr ? `${name}（错 ${Math.round(r.v * 100)}%）` : `${name}（${Math.round(r.v)}ms）`;
      }).join('、')
      : '样本不足，多练几关就能看到热力图';
  }
}

function renderStats() {
  const accAll = stats.totalKeys > 0 ? stats.totalCorrect / stats.totalKeys : 1;

  $('#st-time').textContent = fmtDur(stats.totalTime);
  $('#st-sessions').textContent = `${stats.sessions} 次练习 · ${Object.keys(stats.days || {}).length} 天`;
  $('#st-keys').textContent = stats.totalKeys.toLocaleString('en-US');
  $('#st-acc').textContent = `平均正确率 ${(accAll * 100).toFixed(1)}%`;
  $('#st-best').textContent = `${stats.bestCpm} 字/分`;
  $('#st-avg').textContent = `平均 ${history.length ? Math.round(history.reduce((s, h) => s + h.cpm, 0) / history.length) : 0} 字/分`;
  $('#st-combo').textContent = String(stats.bestCombo);
  $('#st-perfect').textContent = `零失误通关 ${stats.perfectCount} 次`;

  const recent = history.slice(0, 30).reverse();
  drawTrend($('#chart-cpm'), recent.map((h) => h.cpm), { pct: false });
  drawTrend($('#chart-acc'), recent.map((h) => h.acc), { pct: true });

  $('#chapter-progress').innerHTML = CHAPTERS.map((ch) => {
    const total = ch.levels.length * 3;
    let got = 0, cleared = 0;
    ch.levels.forEach((lv) => {
      const r = progress[lv.id];
      if (r) { got += r.stars; if (r.stars >= 1) cleared++; }
    });
    const pct = Math.round((got / total) * 100);
    return `<div class="cp-row">
      <span>${esc(ch.title)}</span>
      <div class="cp-bar"><i style="width:${pct}%;background:${ch.color}"></i></div>
      <span class="cp-num">${cleared}/${ch.levels.length} 关 · ${got}★</span>
    </div>`;
  }).join('');

  applyHeat();

  const unlocked = ACHIEVEMENTS.filter((a) => stats.achievements[a.id]).length;
  $('#ach-count').textContent = `${unlocked} / ${ACHIEVEMENTS.length}`;
  $('#ach-grid').innerHTML = ACHIEVEMENTS.map((a) => {
    const on = !!stats.achievements[a.id];
    return `<div class="ach ${on ? 'on' : ''}">
      <div class="ach-ico">${on ? '✓' : '?'}</div>
      <div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>
    </div>`;
  }).join('');

  $('#hist-count').textContent = history.length ? `共 ${history.length} 条` : '';
  const body = $('#hist-body');
  if (!history.length) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a8b1c2;padding:26px">还没有练习记录</td></tr>';
  } else {
    body.innerHTML = history.slice(0, 60).map((h) => {
      const d = new Date(h.t);
      const time = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      return `<tr>
        <td>${time}</td>
        <td>${esc(h.name)}</td>
        <td>${h.cpm}</td>
        <td>${Math.round(h.acc * 100)}%</td>
        <td>${h.score}</td>
        <td style="color:#f0a500">${'★'.repeat(h.stars)}</td>
      </tr>`;
    }).join('');
  }
}

function exportCSV() {
  if (!history.length) { alert('还没有练习记录可以导出。'); return; }
  const rows = [['时间', '关卡', '速度(字/分)', '正确率', '得分', '星级', '用时(秒)']];
  history.slice().reverse().forEach((h) => {
    rows.push([new Date(h.t).toLocaleString('zh-CN'), h.name, h.cpm, Math.round(h.acc * 100) + '%', h.score, h.stars, h.dur]);
  });
  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `指尖修行-成绩-${todayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) { alert('当前环境不支持导出。'); }
}

/* ============================================================
   自定义练习
   ============================================================ */
const SNIPPETS = [
  {
    name: '英文 · 晨读短文', kind: 'text',
    text: 'A calm morning is a gift. Sit up straight, rest your fingers on the home row, and let the words come one at a time. Speed is not the goal today; accuracy is.'
  },
  {
    name: '中文 · 论语选句', kind: 'zh',
    text: '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？'
  },
  {
    name: '代码 · JavaScript', kind: 'code',
    text: 'const list = [3, 1, 2];\nlist.sort((a, b) => a - b);\nconsole.log(list.join(", "));'
  },
  {
    name: '英文 · 键盘字母表', kind: 'text',
    text: 'the quick brown fox jumps over the lazy dog'
  }
];

function renderPacks() {
  const box = $('#pack-grid');
  if (!box) return;
  const label = { drill: '指法', text: '英文', zh: '中文', code: '代码' };
  box.innerHTML = TRAINING_PACKS.map((p) => `
    <button class="pack" data-pack="${p.id}" data-type="${p.type}">
      <b>${esc(p.name)}</b>
      <span>${esc(p.desc)}</span>
      <i>${label[p.type] || '练习'} · 目标 ${p.target}</i>
    </button>`).join('');
}

function startPack(id) {
  const p = TRAINING_PACKS.find((x) => x.id === id);
  if (!p) return;
  startLevel({
    id: p.id, name: p.name, sub: p.desc, type: p.type,
    text: p.text, keys: p.keys, len: p.len, pinyin: p.pinyin || null,
    target: p.target, tip: p.tip
  });
}

function renderSnippets() {
  const box = $('#snippet-list');
  if (!box) return;
  box.innerHTML = SNIPPETS.map((s, i) => `
    <button class="snippet" data-i="${i}">
      <b>${esc(s.name)}</b>
      <span>${esc(s.text.replace(/\n/g, ' ⏎ '))}</span>
    </button>`).join('');
}

function startCustom() {
  const text = $('#custom-text').value.replace(/\r\n/g, '\n');
  if (!text.trim()) { alert('请先粘贴或输入一段文本。'); return; }
  if (text.length > 1200) { alert('文本太长了（上限 1200 字），建议分成几段练习。'); return; }

  let kind = $('#custom-kind').value;
  if (kind === 'auto') {
    if (CJK_RE.test(text)) kind = 'zh';
    else if (/[{}<>\[\];=]|=>/.test(text)) kind = 'code';
    else kind = 'text';
  }
  const target = Number($('#custom-target').value) || 120;
  const kindName = { text: '英文 / 数字', zh: '中文（拼音输入）', code: '代码' }[kind];

  startLevel({
    id: 'custom',
    name: '自定义练习',
    sub: kindName + ` · ${text.length} 个字符`,
    type: kind,
    text,
    pinyin: null,
    target,
    tip: kind === 'zh'
      ? '请切换到中文输入法，按拼音整词输入会更快。目标速度可以按自己的水平随时调整。'
      : '把注意力放在准确率上。这段文本是你自己的内容，练熟之后可以回到这里换一段新的。'
  });
}

/* ============================================================
   事件绑定
   ============================================================ */
function updateCustomHint() {
  const kind = $('#custom-kind').value;
  const map = {
    auto: '自动识别：含汉字按中文处理，含括号分号按代码处理，其余按英文处理。',
    text: '英文 / 数字模式：适合文章、单词表、字母练习。',
    zh: '中文模式：建议切换到拼音输入法，按整词输入更快。',
    code: '代码模式：支持回车换行，缩进空格也要照打。'
  };
  $('#custom-hint').textContent = map[kind] || map.auto;
}

function bindEvents() {
  $$('.navbtn').forEach((b) => {
    b.addEventListener('click', () => {
      leavePractice();
      if (b.dataset.nav === 'map') renderMap();
      showView(b.dataset.nav);
    });
  });
  $('#brand-home').addEventListener('click', () => { leavePractice(); renderMap(); showView('map'); });

  $('#chapters').addEventListener('click', (e) => {
    const card = e.target.closest('.level-card');
    if (!card) return;
    if (card.classList.contains('locked')) {
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 400);
      return;
    }
    startLevel(card.dataset.level);
  });

  $('#dc-start').addEventListener('click', () => startLevel('daily'));

  /* 训练中心 */
  $('#tile-placement').addEventListener('click', () => startLevel('placement'));
  $('#tile-weak').addEventListener('click', () => {
    const wk = weakKeyStats();
    if (!wk.length) {
      alert('样本还不够。先随便练几关（建议至少完成 2 关），我才能分析出你的弱键。');
      return;
    }
    const lv = weakLevel();
    if (!lv) { alert('暂时无法生成弱键练习，再练几关试试。'); return; }
    startLevel(lv);
  });
  $('#toggle-target').addEventListener('change', (e) => {
    if (e.target.checked && !stats.placement) {
      alert('先做一次「水平测试」，我才能知道该给你定多快的目标。');
      e.target.checked = false;
      return;
    }
    pref.targetMode = e.target.checked ? 'personal' : 'level';
    savePref();
    renderTools();
  });

  /* 输入方案 */
  $('#scheme').addEventListener('change', (e) => {
    pref.scheme = e.target.value;
    savePref();
    updateNextKey();
  });

  /* 热力图切换 */
  $$('.hsw').forEach((b) => {
    b.addEventListener('click', () => {
      heatMode = b.dataset.heat;
      $$('.hsw').forEach((x) => x.classList.toggle('is-active', x === b));
      applyHeat();
    });
  });

  /* 训练方案库 */
  $('#pack-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.pack');
    if (b) startPack(b.dataset.pack);
  });

  $('#toggle-free').addEventListener('change', (e) => {
    pref.freeMode = e.target.checked;
    savePref(); renderMap();
  });

  /* ---------- 设置面板 ---------- */
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#sp-close').addEventListener('click', () => openSettings(false));
  $('#settings-mask').addEventListener('click', () => openSettings(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#settings-panel').classList.contains('on')) {
      openSettings(false);
      e.stopPropagation();
    }
  }, true);

  $('#seg-theme').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pref.theme = b.dataset.v; savePref();
    applyTheme(); syncSettingsUI();
    drawChart();
    if (state.view === 'stats') renderStats();
  });
  $('#seg-fs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pref.fs = b.dataset.v; savePref();
    applyFontSize(); syncSettingsUI();
    drawChart();
    if (state.view === 'stats') renderStats();
  });
  $('#seg-motion').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pref.motion = b.dataset.v; savePref();
    applyMotion(); syncSettingsUI();
  });
  $('#sp-sound').addEventListener('change', (e) => {
    pref.soundOn = e.target.checked; savePref(); syncSettingsUI();
  });
  $('#sp-keyboard').addEventListener('change', (e) => {
    pref.showKeyboard = e.target.checked; savePref();
    document.body.classList.toggle('show-kb', !!pref.showKeyboard);
    syncSettingsUI();
  });
  $('#btn-export-data').addEventListener('click', exportData);
  $('#btn-import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importData(f);
    e.target.value = '';
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('确定要清空全部关卡进度、成绩和成就吗？此操作不可撤销。')) return;
    progress = {}; stats = defaultStats(); history = [];
    saveProgress(); saveStats(); saveHistory();
    renderMap();
    if (state.view === 'stats') renderStats();
  });

  /* ---------- 新手引导 ---------- */
  $('#btn-help').addEventListener('click', showOnboard);
  $('#ob-next').addEventListener('click', () => {
    if (obStep >= ONBOARD_STEPS.length - 1) closeOnboard();
    else { obStep++; renderOnboard(); }
  });
  $('#ob-prev').addEventListener('click', () => {
    if (obStep > 0) { obStep--; renderOnboard(); }
  });
  $('#ob-skip').addEventListener('click', closeOnboard);
  $('#onboard-modal').addEventListener('click', (e) => {
    if (e.target.id === 'onboard-modal') closeOnboard();
  });

  /* ---------- 触摸设备 ---------- */
  const tapHint = $('#tap-hint');
  if (tapHint) {
    tapHint.addEventListener('click', (e) => { e.stopPropagation(); focusInput(); });
  }
  const tBack = $('#btn-touch-back');
  if (tBack) tBack.addEventListener('click', () => stepBack());
  const tKb = $('#btn-touch-kb');
  if (tKb) {
    tKb.addEventListener('click', () => {
      pref.showKeyboard = !pref.showKeyboard;
      document.body.classList.toggle('show-kb', !!pref.showKeyboard);
      tKb.textContent = pref.showKeyboard ? '隐藏键盘图' : '显示键盘图';
      savePref();
      syncSettingsUI();
    });
  }

  $('#btn-back').addEventListener('click', () => { leavePractice(); renderMap(); showView('map'); });
  $('#btn-restart').addEventListener('click', () => { if (state.level) startLevel(state.level); });
  $('#btn-pause').addEventListener('click', togglePause);

  $('#toggle-hand').addEventListener('change', (e) => {
    pref.showHand = e.target.checked; savePref();
    $('#hands').classList.toggle('off', !pref.showHand);
  });
  $('#toggle-blind').addEventListener('change', (e) => {
    pref.blind = e.target.checked; savePref();
    applyBlind();
  });
  $('#toggle-metro').addEventListener('change', (e) => {
    pref.metronome = e.target.checked; savePref(); startMetro();
  });
  $('#bpm-up').addEventListener('click', () => {
    pref.bpm = clamp(pref.bpm + 5, 40, 300); savePref();
    $('#bpm-val').textContent = String(pref.bpm); startMetro();
  });
  $('#bpm-down').addEventListener('click', () => {
    pref.bpm = clamp(pref.bpm - 5, 40, 300); savePref();
    $('#bpm-val').textContent = String(pref.bpm); startMetro();
  });

  const input = $('#hidden-input');
  input.addEventListener('compositionstart', () => { state.composing = true; });
  input.addEventListener('compositionend', () => {
    state.composing = false;
    const v = input.value; input.value = '';
    if (v) processString(v);
  });
  input.addEventListener('input', (e) => {
    if (state.composing || e.isComposing) return;
    const v = input.value; input.value = '';
    if (v) processString(v);
  });
  input.addEventListener('focus', () => {
    updateTapHint();
    // 触摸设备：系统键盘会占掉下半屏，主动把文本区滚到顶栏下方
    if (isTouchMode()) {
      setTimeout(() => {
        const card = $('.text-card');
        if (!card || typeof window.scrollTo !== 'function') return;
        const y = card.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0) - 68;
        try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
        catch (e) { try { window.scrollTo(0, Math.max(0, y)); } catch (e2) {} }
      }, 320);
    }
  });
  input.addEventListener('blur', () => setTimeout(updateTapHint, 60));

  document.addEventListener('keydown', (e) => {
    if (state.view !== 'practice') return;

    if (e.key === 'Escape') { leavePractice(); renderMap(); showView('map'); return; }
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (e.key === 'Backspace') {
      e.preventDefault();
      stepBack();
      return;
    }
    if (document.activeElement !== input) focusInput();
  });

  $('#view-practice').addEventListener('click', (e) => {
    // 点模拟键盘时不要抢焦点（否则移动端会弹出系统键盘）
    if (e.target && e.target.closest && e.target.closest('#keyboard')) return;
    if (state.view === 'practice' && !state.paused && document.activeElement !== input) focusInput();
  });
  window.addEventListener('focus', () => {
    if (state.view === 'practice' && !state.paused) focusInput();
  });

  $('#r-again').addEventListener('click', () => { $('#result-modal').classList.remove('show'); startLevel(state.level); });
  $('#r-map').addEventListener('click', () => { $('#result-modal').classList.remove('show'); renderMap(); showView('map'); });
  $('#r-next').addEventListener('click', () => {
    $('#result-modal').classList.remove('show');
    if (state.nextLevelId) startLevel(state.nextLevelId);
  });
  $('#r-apply').addEventListener('click', () => {
    pref.targetMode = 'personal';
    savePref();
    $('#result-modal').classList.remove('show');
    renderMap();
    showView('map');
  });
  $('#result-modal').addEventListener('click', (e) => {
    if (e.target.id === 'result-modal') $('#result-modal').classList.remove('show');
  });

  $('#learn-tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (!t) return;
    $$('#learn-tabs .tab').forEach((x) => x.classList.toggle('is-active', x === t));
    $$('.tabpane').forEach((p) => p.classList.toggle('is-active', p.id === t.dataset.tab));
  });

  $('#custom-start').addEventListener('click', startCustom);
  $('#custom-clear').addEventListener('click', () => { $('#custom-text').value = ''; $('#custom-text').focus(); });
  $('#custom-sample').addEventListener('click', () => {
    const s = SNIPPETS[Math.floor(Math.random() * SNIPPETS.length)];
    $('#custom-text').value = s.text;
    $('#custom-kind').value = 'auto';
    updateCustomHint();
  });
  $('#custom-target').addEventListener('input', (e) => { $('#custom-target-val').textContent = e.target.value; });
  $('#custom-kind').addEventListener('change', updateCustomHint);
  $('#snippet-list').addEventListener('click', (e) => {
    const b = e.target.closest('.snippet');
    if (!b) return;
    const s = SNIPPETS[Number(b.dataset.i)];
    $('#custom-text').value = s.text;
    $('#custom-kind').value = s.kind;
    updateCustomHint();
  });

  $('#btn-export').addEventListener('click', exportCSV);

  window.addEventListener('resize', () => {
    drawChart();
    if (state.view === 'stats') renderStats();
  });
}

/* ============================================================
   符号速查表
   ============================================================ */
function renderSymbolTable() {
  const grid = $('#sym-grid');
  if (!grid) return;
  grid.innerHTML = SYMBOL_TABLE.map((row) => `
    <div class="sym-cell">
      <div class="sym-char">${esc(row[0])}</div>
      <div class="sym-key"><kbd>${esc(row[1])}</kbd></div>
      <div class="sym-name">${esc(row[2])}</div>
    </div>`).join('');
}

/* ============================================================
   双拼韵母表（学习板块）
   ============================================================ */
function renderShuangpinTable() {
  const box = $('#sp-table');
  const init = $('#sp-init');
  if (!box) return;
  const rows = Object.keys(XIAOHE_FINAL)
    .filter((f) => f !== 'ue' && f !== 've' && f !== 'van' && f !== 'vn')
    .sort((a, b) => a.localeCompare(b));
  if (init) {
    init.innerHTML = `<div class="sp-init">
      <b>声母特例：</b>
      <span><kbd>V</kbd> = zh</span>
      <span><kbd>I</kbd> = ch</span>
      <span><kbd>U</kbd> = sh</span>
      <span class="muted">（其余声母按原键位）</span>
    </div>`;
  }
  const cells = rows.map((f) => `<div class="sp-cell"><kbd>${esc(XIAOHE_FINAL[f].toUpperCase())}</kbd><span>${esc(f)}</span></div>`).join('');
  const extra = `<div class="sp-cell"><kbd>T</kbd><span>üe / ue</span></div>
    <div class="sp-cell"><kbd>R</kbd><span>üan</span></div>
    <div class="sp-cell"><kbd>Y</kbd><span>ün</span></div>`;
  box.innerHTML = cells + extra;
}

/* ============================================================
   初始化
   ============================================================ */
function init() {
  /* 屏幕阅读器播报区 */
  if (!$('#live-region')) {
    const live = document.createElement('div');
    live.id = 'live-region';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('role', 'status');
    document.body.appendChild(live);
  }

  applyAllAppearance();

  $('#toggle-free').checked = !!pref.freeMode;
  $('#toggle-hand').checked = !!pref.showHand;
  $('#toggle-metro').checked = !!pref.metronome;
  $('#toggle-blind').checked = !!pref.blind;
  $('#bpm-val').textContent = String(pref.bpm);
  $('#scheme').value = pref.scheme;
  $('#hands').classList.toggle('off', !pref.showHand);
  $('#custom-target-val').textContent = $('#custom-target').value;

  buildAllKeyboards();
  buildHeatKeyboard();
  renderSymbolTable();
  renderShuangpinTable();
  renderSnippets();
  renderPacks();
  updateCustomHint();
  renderMap();
  bindEvents();
  syncSettingsUI();
  showView('map');

  /* 跟随系统主题变化 */
  if (mediaDark && mediaDark.addEventListener) {
    mediaDark.addEventListener('change', () => {
      if (pref.theme !== 'auto') return;
      applyTheme();
      drawChart();
      if (state.view === 'stats') renderStats();
    });
  }

  /* 视口变化（横竖屏切换）时重新判断触摸布局 */
  window.addEventListener('orientationchange', () => {
    document.body.classList.toggle('touch', isTouch);
    updateTapHint();
  });

  /* 首次访问：新手引导 */
  if (!pref.onboarded) setTimeout(showOnboard, 420);

  const m = location.search.match(/level=([\w-]+)/);
  if (m && LEVEL_BY_ID[m[1]]) startLevel(m[1]);
}

document.addEventListener('DOMContentLoaded', init);
