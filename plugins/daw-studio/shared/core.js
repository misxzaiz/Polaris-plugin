'use strict';
/**
 * core.js —— AI 乐谱工作台纯函数层（CJS 同构，禁止引入 Node 专属 API）
 *
 * 被 service/main.js(require)、mcp/server.js(require)、面板 src/(esbuild 打包)
 * 与 test/(node --test) 四方共用，保证 schema 校验/旋律展开/分析口径全端一致。
 *
 * 职责：
 *   1. 乐谱 schema strict validator（逐字段类型/范围/上限，人话错误收集）
 *   2. 算法旋律引擎（骨架 {key,bpm,bars,progression,style} → 确定性展开成谱；
 *      固定种子 LCG 可复现；约束保证：输出 100% 在调上、无声部冲突）
 *   3. 谱面分析 analyze（调式外音清单、节奏密度、声部冲突、人话建议）
 *   4. 量化工具（音名/MIDI 转换、调式音阶表、和弦音、WAV 时长估算）
 */

// ── 常量与上限 ──────────────────────────────────────────────────────────────

const LIMITS = {
  MAX_TRACKS: 16,
  MAX_NOTES: 512,
  MAX_BARS: 16,
  MIN_BPM: 40,
  MAX_BPM: 240,
  PITCH_MIN: 21,   // A0
  PITCH_MAX: 108,  // C8
  LEN_MAX: 32,     // 音符最长 32 步（2 小节）
  TITLE_MAX: 64,
  NAME_MAX: 24,
  SCORES_CAP: 200,
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
const STYLES = ['arpeggio', 'walkbass', 'pad', 'melody', 'riff'];

/** 音名（C#4 形态）→ MIDI 号；非法返回 null */
function noteNameToMidi(s) {
  const m = /^([A-G])(#{1,2}|b{1,2}|)(-?\d)$/.exec(String(s || '').trim());
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  let acc = 0;
  for (const ch of m[2]) acc += ch === '#' ? 1 : -1;
  const midi = (parseInt(m[3], 10) + 1) * 12 + base + acc;
  return midi >= 0 && midi <= 127 ? midi : null;
}

/** MIDI 号 → 音名（C4 = 60） */
function midiToNoteName(midi) {
  const n = Math.round(midi);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/** 调式根音名 → pitch class 0-11；非法返回 null */
function keyRootToPc(root) {
  const m = /^([A-G])(#{1,2}|b{1,2}|)$/.exec(String(root || '').trim());
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  let acc = 0;
  for (const ch of m[2]) acc += ch === '#' ? 1 : -1;
  return ((base + acc) % 12 + 12) % 12;
}

/** 自然小调/自然大调音阶（半音偏移，相对根音） */
const SCALES = {
  maj: [0, 2, 4, 5, 7, 9, 11],
  min: [0, 2, 3, 5, 7, 8, 10],
};

/**
 * 调式 key（如 "Am"、"C"）→ { rootPc, mode }；非法返回 null。
 * 无后缀默认大调；"m"/"min"/"m" 结尾为小调。
 */
function parseKey(key) {
  const s = String(key || '').trim();
  const m = /^([A-G](?:#{1,2}|b{1,2})?)(maj|min|m|M)?$/.exec(s);
  if (!m) return null;
  const rootPc = keyRootToPc(m[1]);
  if (rootPc == null) return null;
  const mode = (m[2] === 'min' || m[2] === 'm') ? 'min' : 'maj';
  return { rootPc, mode };
}

/** 调式内判断：pitch class 是否在音阶里 */
function inScale(pitch, keyInfo) {
  const pc = ((pitch % 12) + 12) % 12;
  const rel = ((pc - keyInfo.rootPc) % 12 + 12) % 12;
  return SCALES[keyInfo.mode].includes(rel);
}

/** 三和弦（调式内级数 0-6）的音级偏移，相对**和弦根音**（供叠加在和弦根音 MIDI 上） */
function chordOffsets(mode, degree) {
  const sc = SCALES[mode];
  // 三和弦 = 音阶第 degree、degree+2、degree+4 级（0 基）；减去 sc[degree] 变为相对和弦根音
  return [0, 2, 4].map((i) => {
    const idx = degree + i;
    return sc[idx % 7] + (idx >= 7 ? 12 : 0) - sc[degree];
  });
}

// ── 固定种子伪随机（LCG，可复现展开）────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 种子自骨架内容派生（同骨架同结果，跨端一致） */
function seedFrom(obj) {
  const s = JSON.stringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── schema 校验 ─────────────────────────────────────────────────────────────

/**
 * strict 校验乐谱对象。
 * @returns {{ok: true, score: object} | {ok: false, errors: string[]}}
 * 人话错误：指明字段、错在哪、合法范围。
 */
function validateScore(input) {
  const errors = [];
  const pick = (msg) => { errors.push(msg); };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['乐谱必须是 JSON 对象'] };
  }
  const meta = input.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, errors: ['meta 必须是对象（含 title/bpm/key/bars）'] };
  }
  const title = typeof meta.title === 'string' ? meta.title.trim() : '';
  if (!title) pick('meta.title 不能为空（1-64 字符）');
  else if (title.length > LIMITS.TITLE_MAX) pick(`meta.title 过长（${title.length} > ${LIMITS.TITLE_MAX} 字符）`);

  const bpm = meta.bpm;
  if (!Number.isInteger(bpm) || bpm < LIMITS.MIN_BPM || bpm > LIMITS.MAX_BPM) {
    pick(`meta.bpm 必须是 ${LIMITS.MIN_BPM}-${LIMITS.MAX_BPM} 的整数（收到：${JSON.stringify(bpm)}）`);
  }
  const keyInfo = parseKey(meta.key);
  if (!keyInfo) pick('meta.key 必须是调式名（如 C、Am、F#m；大调可省略后缀）');
  const bars = meta.bars;
  if (!Number.isInteger(bars) || bars < 1 || bars > LIMITS.MAX_BARS) {
    pick(`meta.bars 必须是 1-${LIMITS.MAX_BARS} 的整数（收到：${JSON.stringify(bars)}）`);
  }
  if (meta.style != null && !STYLES.includes(meta.style)) {
    pick(`meta.style 只允许 ${STYLES.join('/')}（收到：${JSON.stringify(meta.style)}）`);
  }
  if (meta.swing != null && (!Number.isFinite(meta.swing) || meta.swing < 0 || meta.swing > 60)) {
    pick('meta.swing 必须是 0-60 的数字（摆动百分比）');
  }
  if (errors.length) return { ok: false, errors };

  const maxStep = bars * 16;
  if (!Array.isArray(input.tracks) || !input.tracks.length) {
    pick(`tracks 必须是非空数组（1-${LIMITS.MAX_TRACKS} 轨）`);
    return { ok: false, errors };
  }
  if (input.tracks.length > LIMITS.MAX_TRACKS) {
    pick(`tracks 超限（${input.tracks.length} > ${LIMITS.MAX_TRACKS} 轨）`);
    return { ok: false, errors };
  }

  const names = new Set();
  let totalNotes = 0;
  const tracks = input.tracks.map((t, ti) => {
    if (!t || typeof t !== 'object' || Array.isArray(t)) { pick(`tracks[${ti}] 必须是对象`); return null; }
    const name = typeof t.name === 'string' ? t.name.trim() : '';
    if (!name) { pick(`tracks[${ti}].name 不能为空（1-24 字符）`); return null; }
    if (name.length > LIMITS.NAME_MAX) { pick(`tracks[${ti}].name 过长（> ${LIMITS.NAME_MAX} 字符）`); return null; }
    if (names.has(name)) { pick(`轨道名 "${name}" 重复（谱内必须唯一）`); return null; }
    names.add(name);

    if (t.type === 'drum') return validateDrumTrack(t, ti, name, maxStep, pick);
    // 默认 synth
    return validateSynthTrack(t, ti, name, maxStep, pick);
  });
  if (errors.length) return { ok: false, errors };

  for (const t of tracks) totalNotes += t.type === 'synth' ? t.notes.length : Object.values(t.pattern).flat().length;
  if (totalNotes > LIMITS.MAX_NOTES) {
    pick(`音符总数超限（${totalNotes} > ${LIMITS.MAX_NOTES}；请拆分乐谱或精简）`);
    return { ok: false, errors };
  }

  return { ok: true, score: { meta: cleanMeta(meta), tracks } };
}

function cleanMeta(meta) {
  const out = { title: meta.title.trim(), bpm: meta.bpm, key: String(meta.key).trim(), bars: meta.bars };
  if (meta.style != null) out.style = meta.style;
  if (meta.swing != null) out.swing = meta.swing;
  return out;
}

function clampVol(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function validateSynthTrack(t, ti, name, maxStep, pick) {
  if (t.wave != null && !WAVES.includes(t.wave)) {
    pick(`tracks[${ti}].wave 只允许 ${WAVES.join('/')}`); return null;
  }
  let cutoff = t.cutoff == null ? 2000 : Number(t.cutoff);
  if (!Number.isFinite(cutoff) || cutoff < 200 || cutoff > 12000) {
    pick(`tracks[${ti}].cutoff 必须是 200-12000 Hz（收到：${JSON.stringify(t.cutoff)}）`); return null;
  }
  let octaveShift = t.octaveShift == null ? 0 : Number(t.octaveShift);
  if (!Number.isInteger(octaveShift) || octaveShift < -2 || octaveShift > 2) {
    pick(`tracks[${ti}].octaveShift 必须是 -2..2 的整数`); return null;
  }
  if (!Array.isArray(t.notes)) { pick(`tracks[${ti}].notes 必须是数组`); return null; }
  const notes = [];
  for (let i = 0; i < t.notes.length; i++) {
    const n = t.notes[i];
    if (!n || typeof n !== 'object') { pick(`tracks[${ti}].notes[${i}] 必须是对象 {step,pitch,len,vel?}`); return null; }
    const step = n.step;
    if (!Number.isInteger(step) || step < 0 || step >= maxStep) {
      pick(`tracks[${ti}].notes[${i}].step 必须是 0-${maxStep - 1} 的整数（本谱 ${maxStep} 步；收到：${JSON.stringify(step)}）`); return null;
    }
    // pitch 兼容音名（"C4"）与 MIDI 号
    let pitch = typeof n.pitch === 'string' ? noteNameToMidi(n.pitch) : n.pitch;
    if (!Number.isInteger(pitch) || pitch < LIMITS.PITCH_MIN || pitch > LIMITS.PITCH_MAX) {
      pick(`tracks[${ti}].notes[${i}].pitch 必须是 MIDI ${LIMITS.PITCH_MIN}-${LIMITS.PITCH_MAX} 或音名（如 "C4"；收到：${JSON.stringify(n.pitch)}）`); return null;
    }
    let len = n.len == null ? 1 : n.len;
    if (!Number.isInteger(len) || len < 1 || len > LIMITS.LEN_MAX) {
      pick(`tracks[${ti}].notes[${i}].len 必须是 1-${LIMITS.LEN_MAX} 的整数步`); return null;
    }
    let vel = n.vel == null ? 0.8 : Number(n.vel);
    if (!Number.isFinite(vel) || vel < 0.1 || vel > 1) {
      pick(`tracks[${ti}].notes[${i}].vel 必须是 0.1-1（收到：${JSON.stringify(n.vel)}）`); return null;
    }
    notes.push({ step, pitch, len, vel: Math.round(vel * 100) / 100 });
  }
  return { name, type: 'synth', wave: t.wave || 'sawtooth', vol: clampVol(t.vol, 0.3), cutoff, octaveShift, notes };
}

const DRUMS = ['kick', 'snare', 'hat', 'clap'];

function validateDrumTrack(t, ti, name, maxStep, pick) {
  const p = t.pattern;
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    pick(`tracks[${ti}].pattern 必须是对象（键：${DRUMS.join('/')}）`); return null;
  }
  const pattern = {};
  for (const d of DRUMS) {
    const v = p[d];
    if (v == null || (Array.isArray(v) && !v.length)) { pattern[d] = []; continue; }
    if (v === 'every2') { pattern[d] = []; for (let s = 0; s < maxStep; s += 2) pattern[d].push(s); continue; }
    if (v === 'every4') { pattern[d] = []; for (let s = 0; s < maxStep; s += 4) pattern[d].push(s); continue; }
    if (!Array.isArray(v)) { pick(`tracks[${ti}].pattern.${d} 必须是步号数组或 "every2"/"every4"`); return null; }
    const steps = [];
    for (const s of v) {
      if (!Number.isInteger(s) || s < 0 || s >= maxStep) {
        pick(`tracks[${ti}].pattern.${d} 步号越界：${JSON.stringify(s)}（本谱 0-${maxStep - 1}）`); return null;
      }
      steps.push(s);
    }
    pattern[d] = [...new Set(steps)].sort((a, b) => a - b);
  }
  return { name, type: 'drum', vol: clampVol(t.vol, 0.5), pattern };
}

// ── 算法旋律引擎（骨架 → 确定性展开）────────────────────────────────────────

/**
 * 骨架：{ title, bpm, key, bars, style?, progression?: ["Am","F","C","G"] }
 * progression 缺省 = 调式内 I-vi-IV-V（大调）或 i-VI-III-VII（小调）。
 * 展开原则：强拍落和弦音、弱拍级进经过音、第一小节动机移调重现。
 * @returns {{ok:true, score:object} | {ok:false, errors:string[]}}
 */
function generateScore(skeleton) {
  if (!skeleton || typeof skeleton !== 'object') return { ok: false, errors: ['骨架必须是对象'] };
  const keyInfo = parseKey(skeleton.key);
  if (!keyInfo) return { ok: false, errors: [`key 不合法：${JSON.stringify(skeleton.key)}（如 C、Am、F#m）`] };
  const bpm = skeleton.bpm == null ? 96 : skeleton.bpm;
  const bars = skeleton.bars == null ? 4 : skeleton.bars;
  const style = skeleton.style || 'melody';

  // 和弦进行 → 调式内级数
  let degrees;
  if (Array.isArray(skeleton.progression) && skeleton.progression.length) {
    degrees = [];
    for (const ch of skeleton.progression) {
      const d = chordNameToDegree(ch, keyInfo);
      if (d == null) return { ok: false, errors: [`和弦 "${ch}" 不在 ${skeleton.key} 调式的自然三和弦里（可用：${scaleChords(keyInfo).join(' ')}）`] };
      degrees.push(d);
    }
  } else {
    degrees = defaultProgression(keyInfo.mode);
  }
  while (degrees.length < bars) degrees = degrees.concat(degrees.slice(0, bars - degrees.length));
  degrees = degrees.slice(0, bars);

  const rnd = mulberry32(seedFrom({ key: skeleton.key, bars, style, degrees }));
  const rootPitch = 60 + ((keyInfo.rootPc - 0 + 12) % 12); // C4 起的调式主音
  const lead = expandLead(degrees, keyInfo, bars, style, rootPitch, rnd);
  const bass = expandBass(degrees, keyInfo, bars, rootPitch - 24, rnd);
  const drums = expandDrums(style, bars, rnd);

  const score = {
    meta: { title: String(skeleton.title || '未命名').slice(0, LIMITS.TITLE_MAX) || '未命名', bpm, key: String(skeleton.key).trim(), bars, style },
    tracks: [
      { name: 'Lead', type: 'synth', wave: style === 'pad' ? 'triangle' : 'sawtooth', vol: 0.3, cutoff: 2400, octaveShift: 0, notes: lead },
      { name: 'Bass', type: 'synth', wave: 'square', vol: 0.35, cutoff: 700, octaveShift: 0, notes: bass },
      { name: 'Drums', type: 'drum', vol: 0.5, pattern: drums },
    ],
  };
  const v = validateScore(score);
  return v.ok ? v : { ok: false, errors: v.errors };
}

/** 和弦名（Am / F / G / Bm 等）→ 调式内级数（0 基） */
function chordNameToDegree(name, keyInfo) {
  const m = /^([A-G])(#{1,2}|b{1,2}|)(m|M|dim|aug)?/.exec(String(name || '').trim());
  if (!m) return null;
  const rootPc = keyRootToPc(m[1] + m[2]);
  if (rootPc == null) return null;
  const sc = SCALES[keyInfo.mode];
  for (let d = 0; d < 7; d++) {
    const chordRoot = (keyInfo.rootPc + sc[d]) % 12;
    if (chordRoot === rootPc) {
      // 检查三和弦性质匹配（小调级和弦 vs 大调和弦名）
      const offs = chordOffsets(keyInfo.mode, d);
      const isMinorChord = offs[2] - offs[0] === 7 && offs[1] - offs[0] === 3;
      const wantedMinor = m[3] === 'm';
      if (m[3] == null || m[3] === 'M' ? !isMinorChord : isMinorChord) return d;
      return d; // 名义性质不匹配也接受（按位置解析），analyze 会提示
    }
  }
  return null;
}

/** 调式内自然三和弦名列表（人话提示用） */
function scaleChords(keyInfo) {
  const sc = SCALES[keyInfo.mode];
  const names = [];
  for (let d = 0; d < 7; d++) {
    const offs = chordOffsets(keyInfo.mode, d);
    const root = (keyInfo.rootPc + sc[d]) % 12;
    const minor = offs[1] - offs[0] === 3;
    names.push(NOTE_NAMES[root] + (minor ? 'm' : ''));
  }
  return names;
}

function defaultProgression(mode) {
  return mode === 'min' ? [0, 5, 2, 6] : [0, 5, 3, 4]; // 小调 i-VI-III-VII；大调 I-vi-IV-V
}

/** Lead 声部：强拍和弦音 + 弱拍级进 + 动机移调重现 */
function expandLead(degrees, keyInfo, bars, style, rootPitch, rnd) {
  const notes = [];
  const sc = SCALES[keyInfo.mode];
  const pitchOf = (degreeIdx, oct) => {
    // 调式级数（可越八度）→ MIDI
    const d = ((degreeIdx % 7) + 7) % 7;
    const o = Math.floor(degreeIdx / 7);
    return rootPitch + sc[d] + 12 * (oct + o);
  };

  if (style === 'pad') {
    // 全音符和弦长音：每小节一个长音（和弦根音+五音）
    for (let b = 0; b < bars; b++) {
      const offs = chordOffsets(keyInfo.mode, degrees[b]);
      const rootMidi = pitchOf(degrees[b], 0);
      notes.push({ step: b * 16, pitch: clampPitch(rootMidi), len: 16, vel: 0.6 });
      notes.push({ step: b * 16, pitch: clampPitch(rootMidi + 7), len: 16, vel: 0.5 });
      void offs;
    }
    return notes;
  }

  if (style === 'arpeggio') {
    // 16 分琶音上下行循环：和弦音 1-3-5-3
    for (let b = 0; b < bars; b++) {
      const offs = chordOffsets(keyInfo.mode, degrees[b]);
      for (let s = 0; s < 16; s++) {
        const idx = [0, 1, 2, 1][s % 4];
        const oct = s % 8 < 4 ? 0 : 1;
        const midi = pitchOf(degrees[b], 0) + offs[idx] + 12 * oct;
        notes.push({ step: b * 16 + s, pitch: clampPitch(midi), len: 1, vel: s % 4 === 0 ? 0.85 : 0.6 });
      }
    }
    return notes;
  }

  // melody / riff / walkbass 前景：动机生成 + 移调重现
  // 第一小节：4 个两拍位的音（step 0/4/8/12），从和弦音出发，级进+偶尔跳进
  const motif = [];
  let cur = pitchOf(degrees[0], 1) + (rnd() < 0.5 ? 0 : 2); // 从和弦 3/5 音附近起
  for (let s = 0; s < 16; s += 4) {
    const offs = chordOffsets(keyInfo.mode, degrees[0]);
    const target = s === 0 ? cur : cur + (rnd() < 0.7 ? (rnd() < 0.5 ? 1 : -1) * (rnd() < 0.3 ? 2 : 1) : (rnd() < 0.5 ? 4 : -3));
    cur = clampScaleDegree(target, keyInfo);
    const rel = ((cur - rootPitch) % 12 + 12) % 12;
    const near = sc.reduce((best, iv, i) => Math.abs(iv - rel) < Math.abs(sc[best] - rel) ? i : best, 0);
    const midi = rootPitch + sc[near] + 12 * Math.floor((cur - rootPitch) / 12);
    motif.push({ step: s, midi: clampPitch(midi), len: 4, vel: s === 0 ? 0.9 : 0.7 });
    void offs;
  }
  for (let b = 0; b < bars; b++) {
    for (const m of motif) {
      // 移调到本小节和弦最近和弦音（简单化：原样重现 + 尾小节回主音）
      let midi = m.midi;
      if (b === bars - 1 && m === motif[3]) {
        midi = pitchOf(degrees[b], 1); // 终止在主音
      }
      notes.push({ step: b * 16 + m.step, pitch: midi, len: m.len, vel: m.vel });
    }
  }
  return notes;
}

/** 把 MIDI 近似吸附到调式内最近音 */
function clampScaleDegree(midi, keyInfo) {
  const sc = SCALES[keyInfo.mode];
  const rootPc = keyInfo.rootPc;
  for (let d = 0; d < 12; d++) {
    if (inScale(midi - d, { rootPc, mode: keyInfo.mode }) && d <= 6) return midi - d >= 0 && inScale(midi - d, { rootPc, mode: keyInfo.mode }) ? midi - d : midi + (d === 0 ? 0 : 1);
    if (inScale(midi + d, { rootPc, mode: keyInfo.mode })) return midi + d;
  }
  return midi;
}

function clampPitch(midi) {
  return Math.min(LIMITS.PITCH_MAX, Math.max(LIMITS.PITCH_MIN, midi));
}

/** Bass 声部：walkbass=根音-五音四分音符；其余=根音长音 */
function expandBass(degrees, keyInfo, bars, rootBass, rnd) {
  const notes = [];
  for (let b = 0; b < bars; b++) {
    const d = degrees[b];
    const sc = SCALES[keyInfo.mode];
    const rootMidi = rootBass + sc[d % 7] + 12 * Math.floor(d / 7);
    const fifth = rootMidi + 7;
    notes.push({ step: b * 16, pitch: clampPitch(rootMidi), len: 8, vel: 0.8 });
    notes.push({ step: b * 16 + 8, pitch: clampPitch(rnd() < 0.4 ? fifth : rootMidi + 12), len: 8, vel: 0.7 });
  }
  return notes;
}

/** 鼓组：按 style 出基础律动 */
function expandDrums(style, bars, rnd) {
  const maxStep = bars * 16;
  const kick = []; const snare = []; const hat = []; const clap = [];
  for (let b = 0; b < bars; b++) {
    const off = b * 16;
    kick.push(off, off + 6, off + 10);
    snare.push(off + 4, off + 12);
    if (style === 'riff') kick.push(off + 3);
    if (rnd() < 0.3 && b % 2 === 1) clap.push(off + 14); // 偶发过门拍手
  }
  const filter = (arr) => arr.filter((s) => s < maxStep).sort((a, b) => a - b);
  return { kick: filter(kick), snare: filter(snare), hat: 'every2', clap: filter(clap) };
}

// ── 谱面分析（AI 自查闭环）──────────────────────────────────────────────────

/**
 * 分析乐谱：调式外音、节奏密度、声部冲突、建议。
 * @returns {{summary, outOfScale: Array, density, conflicts: Array, suggestions: string[]}}
 */
function analyzeScore(score) {
  const keyInfo = parseKey(score.meta.key);
  const out = { summary: '', outOfScale: [], density: {}, conflicts: [], suggestions: [] };
  if (!keyInfo) { out.summary = `调式 "${score.meta.key}" 无法解析`; return out; }

  const total = score.meta.bars * 16;
  const synthTracks = score.tracks.filter((t) => t.type === 'synth');
  let noteCount = 0;
  let busySteps = new Set();

  for (const t of synthTracks) {
    for (const n of t.notes) {
      noteCount++;
      busySteps.add(`${n.step}`);
      if (!inScale(n.pitch, keyInfo)) {
        out.outOfScale.push({ track: t.name, step: n.step, pitch: n.pitch, note: midiToNoteName(n.pitch), suggest: `改为 ${nearestScaleNote(n.pitch, keyInfo)}` });
      }
    }
  }
  // 声部冲突：同轨同 step 多音
  for (const t of synthTracks) {
    const byStep = new Map();
    for (const n of t.notes) {
      const k = `${n.step}`;
      if (!byStep.has(k)) byStep.set(k, []);
      byStep.get(k).push(n.pitch);
    }
    for (const [step, pitches] of byStep) {
      if (pitches.length > 1) out.conflicts.push({ track: t.name, step: Number(step), pitches, suggest: '同轨同一步多音会同时鸣响，确认是否需要和声音程' });
    }
  }
  // 节奏密度：每小节活跃步占比
  const perBar = [];
  for (let b = 0; b < score.meta.bars; b++) {
    let active = 0;
    for (let s = 0; s < 16; s++) if (busySteps.has(`${b * 16 + s}`)) active++;
    perBar.push(Math.round((active / 16) * 100));
  }
  out.density = { perBarPercent: perBar, overallPercent: Math.round((busySteps.size / total) * 100) };

  // 建议（人话，不亮红——不知道用户意图）
  if (out.outOfScale.length) {
    out.suggestions.push(`有 ${out.outOfScale.length} 个音在 ${score.meta.key} 调式外——若是有意的离调色彩可保留，否则可按 suggest 音替换`);
  }
  if (out.conflicts.length) {
    out.suggestions.push(`有 ${out.conflicts.length} 处同轨同拍多音，听感为和声叠置；若非本意请错开 step`);
  }
  const emptyBar = perBar.findIndex((p) => p === 0);
  if (emptyBar >= 0) out.suggestions.push(`第 ${emptyBar + 1} 小节没有任何音符（完全静音），确认是否有意留白`);
  if (!out.suggestions.length) out.suggestions.push('谱面无明显异常');
  out.summary = `${score.tracks.length} 轨 / ${noteCount} 音符 / ${score.meta.bars} 小节 @ ${score.meta.bpm} BPM ${score.meta.key}；密度 ${out.density.overallPercent}%`;
  return out;
}

function nearestScaleNote(pitch, keyInfo) {
  for (let d = 0; d <= 6; d++) {
    if (inScale(pitch - d, keyInfo)) return midiToNoteName(pitch - d);
    if (inScale(pitch + d, keyInfo)) return midiToNoteName(pitch + d);
  }
  return midiToNoteName(pitch);
}

/** 时长估算（秒）：bars*16 步 × (60/bpm/4) */
function estimateDuration(meta) {
  return Math.round(meta.bars * 16 * (60 / meta.bpm / 4) * 10) / 10;
}

/** 索引投影（kv 瘦身条目） */
function projectIndex(score, id, updatedAt) {
  return {
    id, title: score.meta.title, key: score.meta.key, bpm: score.meta.bpm,
    bars: score.meta.bars, dur: estimateDuration(score.meta),
    tracks: score.tracks.length, updatedAt,
  };
}

module.exports = {
  LIMITS, NOTE_NAMES, WAVES, STYLES, DRUMS, SCALES,
  noteNameToMidi, midiToNoteName, parseKey, inScale, chordOffsets,
  validateScore, generateScore, analyzeScore,
  estimateDuration, projectIndex,
};
