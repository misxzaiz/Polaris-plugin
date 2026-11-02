var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shared/core.js
var require_core = __commonJS({
  "shared/core.js"(exports, module) {
    "use strict";
    var LIMITS = {
      MAX_TRACKS: 16,
      MAX_NOTES: 512,
      MAX_BARS: 16,
      MIN_BPM: 40,
      MAX_BPM: 240,
      PITCH_MIN: 21,
      // A0
      PITCH_MAX: 108,
      // C8
      LEN_MAX: 32,
      // 音符最长 32 步（2 小节）
      TITLE_MAX: 64,
      NAME_MAX: 24,
      SCORES_CAP: 200
    };
    var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    var WAVES2 = ["sine", "square", "sawtooth", "triangle"];
    var STYLES = ["arpeggio", "walkbass", "pad", "melody", "riff"];
    function noteNameToMidi(s) {
      const m = /^([A-G])(#{1,2}|b{1,2}|)(-?\d)$/.exec(String(s || "").trim());
      if (!m) return null;
      const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
      let acc = 0;
      for (const ch of m[2]) acc += ch === "#" ? 1 : -1;
      const midi = (parseInt(m[3], 10) + 1) * 12 + base + acc;
      return midi >= 0 && midi <= 127 ? midi : null;
    }
    function midiToNoteName3(midi) {
      const n = Math.round(midi);
      return `${NOTE_NAMES[(n % 12 + 12) % 12]}${Math.floor(n / 12) - 1}`;
    }
    function keyRootToPc(root) {
      const m = /^([A-G])(#{1,2}|b{1,2}|)$/.exec(String(root || "").trim());
      if (!m) return null;
      const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
      let acc = 0;
      for (const ch of m[2]) acc += ch === "#" ? 1 : -1;
      return ((base + acc) % 12 + 12) % 12;
    }
    var SCALES = {
      maj: [0, 2, 4, 5, 7, 9, 11],
      min: [0, 2, 3, 5, 7, 8, 10]
    };
    function parseKey(key) {
      const s = String(key || "").trim();
      const m = /^([A-G](?:#{1,2}|b{1,2})?)(maj|min|m|M)?$/.exec(s);
      if (!m) return null;
      const rootPc = keyRootToPc(m[1]);
      if (rootPc == null) return null;
      const mode = m[2] === "min" || m[2] === "m" ? "min" : "maj";
      return { rootPc, mode };
    }
    function inScale(pitch, keyInfo) {
      const pc = (pitch % 12 + 12) % 12;
      const rel = ((pc - keyInfo.rootPc) % 12 + 12) % 12;
      return SCALES[keyInfo.mode].includes(rel);
    }
    function chordOffsets(mode, degree) {
      const sc = SCALES[mode];
      return [0, 2, 4].map((i) => {
        const idx = degree + i;
        return sc[idx % 7] + (idx >= 7 ? 12 : 0) - sc[degree];
      });
    }
    function mulberry32(seed) {
      let a = seed >>> 0;
      return function() {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function seedFrom(obj) {
      const s = JSON.stringify(obj);
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    function validateScore3(input) {
      const errors = [];
      const pick = (msg) => {
        errors.push(msg);
      };
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, errors: ["\u4E50\u8C31\u5FC5\u987B\u662F JSON \u5BF9\u8C61"] };
      }
      const meta = input.meta;
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
        return { ok: false, errors: ["meta \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u542B title/bpm/key/bars\uFF09"] };
      }
      const title = typeof meta.title === "string" ? meta.title.trim() : "";
      if (!title) pick("meta.title \u4E0D\u80FD\u4E3A\u7A7A\uFF081-64 \u5B57\u7B26\uFF09");
      else if (title.length > LIMITS.TITLE_MAX) pick(`meta.title \u8FC7\u957F\uFF08${title.length} > ${LIMITS.TITLE_MAX} \u5B57\u7B26\uFF09`);
      const bpm = meta.bpm;
      if (!Number.isInteger(bpm) || bpm < LIMITS.MIN_BPM || bpm > LIMITS.MAX_BPM) {
        pick(`meta.bpm \u5FC5\u987B\u662F ${LIMITS.MIN_BPM}-${LIMITS.MAX_BPM} \u7684\u6574\u6570\uFF08\u6536\u5230\uFF1A${JSON.stringify(bpm)}\uFF09`);
      }
      const keyInfo = parseKey(meta.key);
      if (!keyInfo) pick("meta.key \u5FC5\u987B\u662F\u8C03\u5F0F\u540D\uFF08\u5982 C\u3001Am\u3001F#m\uFF1B\u5927\u8C03\u53EF\u7701\u7565\u540E\u7F00\uFF09");
      const bars = meta.bars;
      if (!Number.isInteger(bars) || bars < 1 || bars > LIMITS.MAX_BARS) {
        pick(`meta.bars \u5FC5\u987B\u662F 1-${LIMITS.MAX_BARS} \u7684\u6574\u6570\uFF08\u6536\u5230\uFF1A${JSON.stringify(bars)}\uFF09`);
      }
      if (meta.style != null && !STYLES.includes(meta.style)) {
        pick(`meta.style \u53EA\u5141\u8BB8 ${STYLES.join("/")}\uFF08\u6536\u5230\uFF1A${JSON.stringify(meta.style)}\uFF09`);
      }
      if (meta.swing != null && (!Number.isFinite(meta.swing) || meta.swing < 0 || meta.swing > 60)) {
        pick("meta.swing \u5FC5\u987B\u662F 0-60 \u7684\u6570\u5B57\uFF08\u6446\u52A8\u767E\u5206\u6BD4\uFF09");
      }
      if (errors.length) return { ok: false, errors };
      const maxStep = bars * 16;
      if (!Array.isArray(input.tracks) || !input.tracks.length) {
        pick(`tracks \u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4\uFF081-${LIMITS.MAX_TRACKS} \u8F68\uFF09`);
        return { ok: false, errors };
      }
      if (input.tracks.length > LIMITS.MAX_TRACKS) {
        pick(`tracks \u8D85\u9650\uFF08${input.tracks.length} > ${LIMITS.MAX_TRACKS} \u8F68\uFF09`);
        return { ok: false, errors };
      }
      const names = /* @__PURE__ */ new Set();
      let totalNotes = 0;
      const tracks = input.tracks.map((t, ti) => {
        if (!t || typeof t !== "object" || Array.isArray(t)) {
          pick(`tracks[${ti}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
          return null;
        }
        const name = typeof t.name === "string" ? t.name.trim() : "";
        if (!name) {
          pick(`tracks[${ti}].name \u4E0D\u80FD\u4E3A\u7A7A\uFF081-24 \u5B57\u7B26\uFF09`);
          return null;
        }
        if (name.length > LIMITS.NAME_MAX) {
          pick(`tracks[${ti}].name \u8FC7\u957F\uFF08> ${LIMITS.NAME_MAX} \u5B57\u7B26\uFF09`);
          return null;
        }
        if (names.has(name)) {
          pick(`\u8F68\u9053\u540D "${name}" \u91CD\u590D\uFF08\u8C31\u5185\u5FC5\u987B\u552F\u4E00\uFF09`);
          return null;
        }
        names.add(name);
        if (t.type === "drum") return validateDrumTrack(t, ti, name, maxStep, pick);
        return validateSynthTrack(t, ti, name, maxStep, pick);
      });
      if (errors.length) return { ok: false, errors };
      for (const t of tracks) totalNotes += t.type === "synth" ? t.notes.length : Object.values(t.pattern).flat().length;
      if (totalNotes > LIMITS.MAX_NOTES) {
        pick(`\u97F3\u7B26\u603B\u6570\u8D85\u9650\uFF08${totalNotes} > ${LIMITS.MAX_NOTES}\uFF1B\u8BF7\u62C6\u5206\u4E50\u8C31\u6216\u7CBE\u7B80\uFF09`);
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
      if (t.wave != null && !WAVES2.includes(t.wave)) {
        pick(`tracks[${ti}].wave \u53EA\u5141\u8BB8 ${WAVES2.join("/")}`);
        return null;
      }
      let cutoff = t.cutoff == null ? 2e3 : Number(t.cutoff);
      if (!Number.isFinite(cutoff) || cutoff < 200 || cutoff > 12e3) {
        pick(`tracks[${ti}].cutoff \u5FC5\u987B\u662F 200-12000 Hz\uFF08\u6536\u5230\uFF1A${JSON.stringify(t.cutoff)}\uFF09`);
        return null;
      }
      let octaveShift = t.octaveShift == null ? 0 : Number(t.octaveShift);
      if (!Number.isInteger(octaveShift) || octaveShift < -2 || octaveShift > 2) {
        pick(`tracks[${ti}].octaveShift \u5FC5\u987B\u662F -2..2 \u7684\u6574\u6570`);
        return null;
      }
      if (!Array.isArray(t.notes)) {
        pick(`tracks[${ti}].notes \u5FC5\u987B\u662F\u6570\u7EC4`);
        return null;
      }
      const notes = [];
      for (let i = 0; i < t.notes.length; i++) {
        const n = t.notes[i];
        if (!n || typeof n !== "object") {
          pick(`tracks[${ti}].notes[${i}] \u5FC5\u987B\u662F\u5BF9\u8C61 {step,pitch,len,vel?}`);
          return null;
        }
        const step = n.step;
        if (!Number.isInteger(step) || step < 0 || step >= maxStep) {
          pick(`tracks[${ti}].notes[${i}].step \u5FC5\u987B\u662F 0-${maxStep - 1} \u7684\u6574\u6570\uFF08\u672C\u8C31 ${maxStep} \u6B65\uFF1B\u6536\u5230\uFF1A${JSON.stringify(step)}\uFF09`);
          return null;
        }
        let pitch = typeof n.pitch === "string" ? noteNameToMidi(n.pitch) : n.pitch;
        if (!Number.isInteger(pitch) || pitch < LIMITS.PITCH_MIN || pitch > LIMITS.PITCH_MAX) {
          pick(`tracks[${ti}].notes[${i}].pitch \u5FC5\u987B\u662F MIDI ${LIMITS.PITCH_MIN}-${LIMITS.PITCH_MAX} \u6216\u97F3\u540D\uFF08\u5982 "C4"\uFF1B\u6536\u5230\uFF1A${JSON.stringify(n.pitch)}\uFF09`);
          return null;
        }
        let len = n.len == null ? 1 : n.len;
        if (!Number.isInteger(len) || len < 1 || len > LIMITS.LEN_MAX) {
          pick(`tracks[${ti}].notes[${i}].len \u5FC5\u987B\u662F 1-${LIMITS.LEN_MAX} \u7684\u6574\u6570\u6B65`);
          return null;
        }
        let vel = n.vel == null ? 0.8 : Number(n.vel);
        if (!Number.isFinite(vel) || vel < 0.1 || vel > 1) {
          pick(`tracks[${ti}].notes[${i}].vel \u5FC5\u987B\u662F 0.1-1\uFF08\u6536\u5230\uFF1A${JSON.stringify(n.vel)}\uFF09`);
          return null;
        }
        notes.push({ step, pitch, len, vel: Math.round(vel * 100) / 100 });
      }
      return { name, type: "synth", wave: t.wave || "sawtooth", vol: clampVol(t.vol, 0.3), cutoff, octaveShift, notes };
    }
    var DRUMS = ["kick", "snare", "hat", "clap"];
    function validateDrumTrack(t, ti, name, maxStep, pick) {
      const p = t.pattern;
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        pick(`tracks[${ti}].pattern \u5FC5\u987B\u662F\u5BF9\u8C61\uFF08\u952E\uFF1A${DRUMS.join("/")}\uFF09`);
        return null;
      }
      const pattern = {};
      for (const d of DRUMS) {
        const v = p[d];
        if (v == null || Array.isArray(v) && !v.length) {
          pattern[d] = [];
          continue;
        }
        if (v === "every2") {
          pattern[d] = [];
          for (let s = 0; s < maxStep; s += 2) pattern[d].push(s);
          continue;
        }
        if (v === "every4") {
          pattern[d] = [];
          for (let s = 0; s < maxStep; s += 4) pattern[d].push(s);
          continue;
        }
        if (!Array.isArray(v)) {
          pick(`tracks[${ti}].pattern.${d} \u5FC5\u987B\u662F\u6B65\u53F7\u6570\u7EC4\u6216 "every2"/"every4"`);
          return null;
        }
        const steps = [];
        for (const s of v) {
          if (!Number.isInteger(s) || s < 0 || s >= maxStep) {
            pick(`tracks[${ti}].pattern.${d} \u6B65\u53F7\u8D8A\u754C\uFF1A${JSON.stringify(s)}\uFF08\u672C\u8C31 0-${maxStep - 1}\uFF09`);
            return null;
          }
          steps.push(s);
        }
        pattern[d] = [...new Set(steps)].sort((a, b) => a - b);
      }
      return { name, type: "drum", vol: clampVol(t.vol, 0.5), pattern };
    }
    function generateScore2(skeleton) {
      if (!skeleton || typeof skeleton !== "object") return { ok: false, errors: ["\u9AA8\u67B6\u5FC5\u987B\u662F\u5BF9\u8C61"] };
      const keyInfo = parseKey(skeleton.key);
      if (!keyInfo) return { ok: false, errors: [`key \u4E0D\u5408\u6CD5\uFF1A${JSON.stringify(skeleton.key)}\uFF08\u5982 C\u3001Am\u3001F#m\uFF09`] };
      const bpm = skeleton.bpm == null ? 96 : skeleton.bpm;
      const bars = skeleton.bars == null ? 4 : skeleton.bars;
      const style = skeleton.style || "melody";
      let degrees;
      if (Array.isArray(skeleton.progression) && skeleton.progression.length) {
        degrees = [];
        for (const ch of skeleton.progression) {
          const d = chordNameToDegree(ch, keyInfo);
          if (d == null) return { ok: false, errors: [`\u548C\u5F26 "${ch}" \u4E0D\u5728 ${skeleton.key} \u8C03\u5F0F\u7684\u81EA\u7136\u4E09\u548C\u5F26\u91CC\uFF08\u53EF\u7528\uFF1A${scaleChords(keyInfo).join(" ")}\uFF09`] };
          degrees.push(d);
        }
      } else {
        degrees = defaultProgression(keyInfo.mode);
      }
      while (degrees.length < bars) degrees = degrees.concat(degrees.slice(0, bars - degrees.length));
      degrees = degrees.slice(0, bars);
      const rnd = mulberry32(seedFrom({ key: skeleton.key, bars, style, degrees }));
      const rootPitch = 60 + (keyInfo.rootPc - 0 + 12) % 12;
      const lead = expandLead(degrees, keyInfo, bars, style, rootPitch, rnd);
      const bass = expandBass(degrees, keyInfo, bars, rootPitch - 24, rnd);
      const drums = expandDrums(style, bars, rnd);
      const score2 = {
        meta: { title: String(skeleton.title || "\u672A\u547D\u540D").slice(0, LIMITS.TITLE_MAX) || "\u672A\u547D\u540D", bpm, key: String(skeleton.key).trim(), bars, style },
        tracks: [
          { name: "Lead", type: "synth", wave: style === "pad" ? "triangle" : "sawtooth", vol: 0.3, cutoff: 2400, octaveShift: 0, notes: lead },
          { name: "Bass", type: "synth", wave: "square", vol: 0.35, cutoff: 700, octaveShift: 0, notes: bass },
          { name: "Drums", type: "drum", vol: 0.5, pattern: drums }
        ]
      };
      const v = validateScore3(score2);
      return v.ok ? v : { ok: false, errors: v.errors };
    }
    function chordNameToDegree(name, keyInfo) {
      const m = /^([A-G])(#{1,2}|b{1,2}|)(m|M|dim|aug)?/.exec(String(name || "").trim());
      if (!m) return null;
      const rootPc = keyRootToPc(m[1] + m[2]);
      if (rootPc == null) return null;
      const sc = SCALES[keyInfo.mode];
      for (let d = 0; d < 7; d++) {
        const chordRoot = (keyInfo.rootPc + sc[d]) % 12;
        if (chordRoot === rootPc) {
          const offs = chordOffsets(keyInfo.mode, d);
          const isMinorChord = offs[2] - offs[0] === 7 && offs[1] - offs[0] === 3;
          const wantedMinor = m[3] === "m";
          if (m[3] == null || m[3] === "M" ? !isMinorChord : isMinorChord) return d;
          return d;
        }
      }
      return null;
    }
    function scaleChords(keyInfo) {
      const sc = SCALES[keyInfo.mode];
      const names = [];
      for (let d = 0; d < 7; d++) {
        const offs = chordOffsets(keyInfo.mode, d);
        const root = (keyInfo.rootPc + sc[d]) % 12;
        const minor = offs[1] - offs[0] === 3;
        names.push(NOTE_NAMES[root] + (minor ? "m" : ""));
      }
      return names;
    }
    function defaultProgression(mode) {
      return mode === "min" ? [0, 5, 2, 6] : [0, 5, 3, 4];
    }
    function expandLead(degrees, keyInfo, bars, style, rootPitch, rnd) {
      const notes = [];
      const sc = SCALES[keyInfo.mode];
      const pitchOf = (degreeIdx, oct) => {
        const d = (degreeIdx % 7 + 7) % 7;
        const o = Math.floor(degreeIdx / 7);
        return rootPitch + sc[d] + 12 * (oct + o);
      };
      if (style === "pad") {
        for (let b = 0; b < bars; b++) {
          const offs = chordOffsets(keyInfo.mode, degrees[b]);
          const rootMidi = pitchOf(degrees[b], 0);
          notes.push({ step: b * 16, pitch: clampPitch(rootMidi), len: 16, vel: 0.6 });
          notes.push({ step: b * 16, pitch: clampPitch(rootMidi + 7), len: 16, vel: 0.5 });
        }
        return notes;
      }
      if (style === "arpeggio") {
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
      const motif = [];
      let cur = pitchOf(degrees[0], 1) + (rnd() < 0.5 ? 0 : 2);
      for (let s = 0; s < 16; s += 4) {
        const offs = chordOffsets(keyInfo.mode, degrees[0]);
        const target = s === 0 ? cur : cur + (rnd() < 0.7 ? (rnd() < 0.5 ? 1 : -1) * (rnd() < 0.3 ? 2 : 1) : rnd() < 0.5 ? 4 : -3);
        cur = clampScaleDegree(target, keyInfo);
        const rel = ((cur - rootPitch) % 12 + 12) % 12;
        const near = sc.reduce((best, iv, i) => Math.abs(iv - rel) < Math.abs(sc[best] - rel) ? i : best, 0);
        const midi = rootPitch + sc[near] + 12 * Math.floor((cur - rootPitch) / 12);
        motif.push({ step: s, midi: clampPitch(midi), len: 4, vel: s === 0 ? 0.9 : 0.7 });
      }
      for (let b = 0; b < bars; b++) {
        for (const m of motif) {
          let midi = m.midi;
          if (b === bars - 1 && m === motif[3]) {
            midi = pitchOf(degrees[b], 1);
          }
          notes.push({ step: b * 16 + m.step, pitch: midi, len: m.len, vel: m.vel });
        }
      }
      return notes;
    }
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
    function expandDrums(style, bars, rnd) {
      const maxStep = bars * 16;
      const kick = [];
      const snare = [];
      const hat = [];
      const clap = [];
      for (let b = 0; b < bars; b++) {
        const off = b * 16;
        kick.push(off, off + 6, off + 10);
        snare.push(off + 4, off + 12);
        if (style === "riff") kick.push(off + 3);
        if (rnd() < 0.3 && b % 2 === 1) clap.push(off + 14);
      }
      const filter = (arr) => arr.filter((s) => s < maxStep).sort((a, b) => a - b);
      return { kick: filter(kick), snare: filter(snare), hat: "every2", clap: filter(clap) };
    }
    function analyzeScore3(score2) {
      const keyInfo = parseKey(score2.meta.key);
      const out = { summary: "", outOfScale: [], density: {}, conflicts: [], suggestions: [] };
      if (!keyInfo) {
        out.summary = `\u8C03\u5F0F "${score2.meta.key}" \u65E0\u6CD5\u89E3\u6790`;
        return out;
      }
      const total = score2.meta.bars * 16;
      const synthTracks = score2.tracks.filter((t) => t.type === "synth");
      let noteCount = 0;
      let busySteps = /* @__PURE__ */ new Set();
      for (const t of synthTracks) {
        for (const n of t.notes) {
          noteCount++;
          busySteps.add(`${n.step}`);
          if (!inScale(n.pitch, keyInfo)) {
            out.outOfScale.push({ track: t.name, step: n.step, pitch: n.pitch, note: midiToNoteName3(n.pitch), suggest: `\u6539\u4E3A ${nearestScaleNote(n.pitch, keyInfo)}` });
          }
        }
      }
      for (const t of synthTracks) {
        const byStep = /* @__PURE__ */ new Map();
        for (const n of t.notes) {
          const k = `${n.step}`;
          if (!byStep.has(k)) byStep.set(k, []);
          byStep.get(k).push(n.pitch);
        }
        for (const [step, pitches] of byStep) {
          if (pitches.length > 1) out.conflicts.push({ track: t.name, step: Number(step), pitches, suggest: "\u540C\u8F68\u540C\u4E00\u6B65\u591A\u97F3\u4F1A\u540C\u65F6\u9E23\u54CD\uFF0C\u786E\u8BA4\u662F\u5426\u9700\u8981\u548C\u58F0\u97F3\u7A0B" });
        }
      }
      const perBar = [];
      for (let b = 0; b < score2.meta.bars; b++) {
        let active = 0;
        for (let s = 0; s < 16; s++) if (busySteps.has(`${b * 16 + s}`)) active++;
        perBar.push(Math.round(active / 16 * 100));
      }
      out.density = { perBarPercent: perBar, overallPercent: Math.round(busySteps.size / total * 100) };
      if (out.outOfScale.length) {
        out.suggestions.push(`\u6709 ${out.outOfScale.length} \u4E2A\u97F3\u5728 ${score2.meta.key} \u8C03\u5F0F\u5916\u2014\u2014\u82E5\u662F\u6709\u610F\u7684\u79BB\u8C03\u8272\u5F69\u53EF\u4FDD\u7559\uFF0C\u5426\u5219\u53EF\u6309 suggest \u97F3\u66FF\u6362`);
      }
      if (out.conflicts.length) {
        out.suggestions.push(`\u6709 ${out.conflicts.length} \u5904\u540C\u8F68\u540C\u62CD\u591A\u97F3\uFF0C\u542C\u611F\u4E3A\u548C\u58F0\u53E0\u7F6E\uFF1B\u82E5\u975E\u672C\u610F\u8BF7\u9519\u5F00 step`);
      }
      const emptyBar = perBar.findIndex((p) => p === 0);
      if (emptyBar >= 0) out.suggestions.push(`\u7B2C ${emptyBar + 1} \u5C0F\u8282\u6CA1\u6709\u4EFB\u4F55\u97F3\u7B26\uFF08\u5B8C\u5168\u9759\u97F3\uFF09\uFF0C\u786E\u8BA4\u662F\u5426\u6709\u610F\u7559\u767D`);
      if (!out.suggestions.length) out.suggestions.push("\u8C31\u9762\u65E0\u660E\u663E\u5F02\u5E38");
      out.summary = `${score2.tracks.length} \u8F68 / ${noteCount} \u97F3\u7B26 / ${score2.meta.bars} \u5C0F\u8282 @ ${score2.meta.bpm} BPM ${score2.meta.key}\uFF1B\u5BC6\u5EA6 ${out.density.overallPercent}%`;
      return out;
    }
    function nearestScaleNote(pitch, keyInfo) {
      for (let d = 0; d <= 6; d++) {
        if (inScale(pitch - d, keyInfo)) return midiToNoteName3(pitch - d);
        if (inScale(pitch + d, keyInfo)) return midiToNoteName3(pitch + d);
      }
      return midiToNoteName3(pitch);
    }
    function estimateDuration2(meta) {
      return Math.round(meta.bars * 16 * (60 / meta.bpm / 4) * 10) / 10;
    }
    function projectIndex(score2, id, updatedAt) {
      return {
        id,
        title: score2.meta.title,
        key: score2.meta.key,
        bpm: score2.meta.bpm,
        bars: score2.meta.bars,
        dur: estimateDuration2(score2.meta),
        tracks: score2.tracks.length,
        updatedAt
      };
    }
    module.exports = {
      LIMITS,
      NOTE_NAMES,
      WAVES: WAVES2,
      STYLES,
      DRUMS,
      SCALES,
      noteNameToMidi,
      midiToNoteName: midiToNoteName3,
      parseKey,
      inScale,
      chordOffsets,
      validateScore: validateScore3,
      generateScore: generateScore2,
      analyzeScore: analyzeScore3,
      estimateDuration: estimateDuration2,
      projectIndex
    };
  }
});

// src/Panel.tsx
import { useCallback, useEffect, useState } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res && res.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  try {
    const r = await capDispatch("cap.kv", { action: "get", key });
    return r && r.value !== void 0 ? r.value : null;
  } catch (_) {
    return null;
  }
}
async function restartService(pluginId, serviceId) {
  await capDispatch("cap.pluginServiceManager", { action: "restart", pluginId, serviceId });
}

// src/model.ts
var core = __toESM(require_core());
var validateScore2 = core.validateScore;
var analyzeScore2 = core.analyzeScore;
var midiToNoteName2 = core.midiToNoteName;
var PLUGIN_ID = "daw-studio";
var SERVICE_ID = "daw-studio-server";
var cachedMeta = null;
var metaAt = 0;
function invalidateMeta() {
  cachedMeta = null;
  metaAt = 0;
}
async function readMeta(force = false) {
  if (!force && cachedMeta && Date.now() - metaAt < 1e4) return cachedMeta;
  const m = await kvGet("dawstudio.meta");
  if (!m || typeof m.port !== "number" || !m.token) {
    throw new SvcError("\u670D\u52A1\u672A\u5C31\u7EEA\uFF08dawstudio.meta \u7F3A\u5931\uFF09\uFF1A\u670D\u52A1\u53EF\u80FD\u5728\u542F\u52A8\u4E2D\uFF0C\u7A0D\u5019\u6216\u70B9\u300C\u91CD\u542F\u670D\u52A1\u300D");
  }
  cachedMeta = m;
  metaAt = Date.now();
  return m;
}
var SvcError = class extends Error {
};
async function svcRequest(method, apiPath, body) {
  const meta = await readMeta();
  let res;
  try {
    res = await capDispatch("cap.http", {
      action: "request",
      method,
      url: `http://127.0.0.1:${meta.port}${apiPath}`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${meta.token}` },
      ...body != null ? { body: JSON.stringify(body), bodyType: "json" } : {},
      timeoutMs: 3e4
    });
  } catch (e) {
    invalidateMeta();
    throw new SvcError(`\u5BBF\u4E3B\u8F6C\u53D1\u901A\u9053\u4E0D\u53EF\u7528\uFF08${e.message}\uFF09\uFF1A\u53EF\u70B9\u300C\u91CD\u542F\u670D\u52A1\u300D\u81EA\u6551`);
  }
  let parsed = null;
  try {
    parsed = JSON.parse(String(res.body ?? ""));
  } catch (_) {
    parsed = null;
  }
  const status = res.status ?? 0;
  if (!parsed || status >= 400) {
    const msg = parsed?.errors ? parsed.errors.join("\uFF1B") : parsed?.error || `\u670D\u52A1 HTTP ${status || "\u65E0\u54CD\u5E94"}`;
    throw new SvcError(msg);
  }
  return parsed;
}
var api = {
  meta: () => svcRequest("GET", "/api/meta"),
  listScores: () => svcRequest("GET", "/api/scores"),
  getScore: (id) => svcRequest("GET", `/api/scores/${encodeURIComponent(id)}`),
  writeScore: (payload) => svcRequest("POST", "/api/scores", payload),
  createScore: (skeleton) => svcRequest("POST", "/api/scores", { skeleton }),
  deleteScore: (id) => svcRequest("DELETE", `/api/scores/${encodeURIComponent(id)}`),
  analyze: (id) => svcRequest("POST", "/api/analyze", { id }),
  validate: (score2) => svcRequest("POST", "/api/validate", { score: score2 }),
  /**
   * 自救：先试 restart（已注册场景）；not registered 时降级 autostart 重扫
   * （热安装插件在下次 discover 前不会注册，restart 必报 not registered——
   * daw-studio 实证，坑清单「平台权限与桥」节）。
   */
  restart: async () => {
    try {
      await restartService(PLUGIN_ID, SERVICE_ID);
    } catch (e) {
      if (!String(e.message).includes("not registered")) throw e;
      await capDispatch("cap.pluginServiceManager", { action: "autostart" });
    }
  }
};

// src/engine.ts
var LOOKAHEAD_MS = 25;
var SCHEDULE_AHEAD = 0.1;
var VOICE_CAP = 16;
var activeVoices = 0;
function noteFreq(pitch) {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}
function playSynthNote(ac2, out, tr, n, t, stepDur) {
  if (activeVoices >= VOICE_CAP) return;
  activeVoices++;
  const dur = Math.max(0.05, n.len * stepDur);
  const o = ac2.createOscillator();
  const g = ac2.createGain();
  const f = ac2.createBiquadFilter();
  o.type = tr.wave;
  const octave = (tr.octaveShift || 0) * 12;
  o.frequency.value = noteFreq(n.pitch + octave);
  f.type = "lowpass";
  f.frequency.value = tr.cutoff;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(Math.max(0.02, n.vel * tr.vol), t + 0.01);
  g.gain.linearRampToValueAtTime(Math.max(0.01, n.vel * tr.vol * 0.7), t + 0.05);
  g.gain.exponentialRampToValueAtTime(1e-3, t + dur);
  o.connect(f);
  f.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  o.onended = () => {
    activeVoices--;
  };
}
function playKick(ac2, out, t, vol) {
  const o = ac2.createOscillator();
  const g = ac2.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  g.gain.setValueAtTime(0.6 * vol, t);
  g.gain.exponentialRampToValueAtTime(1e-3, t + 0.2);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.22);
}
function noiseBuf(ac2, sec) {
  const buf = ac2.createBuffer(1, Math.ceil(ac2.sampleRate * sec), ac2.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function playSnare(ac2, out, t, vol) {
  const src = ac2.createBufferSource();
  src.buffer = noiseBuf(ac2, 0.2);
  const g = ac2.createGain();
  const f = ac2.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 1e3;
  g.gain.setValueAtTime(0.3 * vol, t);
  g.gain.exponentialRampToValueAtTime(1e-3, t + 0.15);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.16);
}
function playHat(ac2, out, t, vol) {
  const src = ac2.createBufferSource();
  src.buffer = noiseBuf(ac2, 0.05);
  const g = ac2.createGain();
  const f = ac2.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7e3;
  g.gain.setValueAtTime(0.15 * vol, t);
  g.gain.exponentialRampToValueAtTime(1e-3, t + 0.05);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.06);
}
function playClap(ac2, out, t, vol) {
  for (let i = 0; i < 3; i++) {
    const src = ac2.createBufferSource();
    src.buffer = noiseBuf(ac2, 0.05);
    const g = ac2.createGain();
    const f = ac2.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1500;
    const tt = t + i * 0.01;
    g.gain.setValueAtTime(0.2 * vol, tt);
    g.gain.exponentialRampToValueAtTime(1e-3, tt + 0.1);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(tt);
    src.stop(tt + 0.12);
  }
}
var DRUM_FN = {
  kick: playKick,
  snare: playSnare,
  hat: playHat,
  clap: playClap
};
function auditionNote(tr, pitch) {
  const ac2 = ensureAc();
  if (!ac2) return;
  const g = ac2.createGain();
  g.gain.value = tr.vol;
  g.connect(ac2.destination);
  playSynthNote(ac2, g, tr, { step: 0, pitch, len: 2, vel: 0.8 }, ac2.currentTime, 0.125);
}
var ac = null;
var masterGain = null;
var timer = null;
var nextStepTime = 0;
var currentStep = 0;
var score = null;
var onStep = null;
function ensureAc() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  return ac;
}
function ensureRunning() {
  const a = ensureAc();
  if (!a) return false;
  if (a.state === "suspended") void a.resume();
  return true;
}
function isPlaying() {
  return timer != null;
}
function play(s, cb) {
  const a = ensureAc();
  if (!a) return "\u6B64\u73AF\u5883\u4E0D\u652F\u6301 Web Audio";
  if (a.state === "suspended") void a.resume();
  if (timer != null) stop();
  score = s;
  onStep = cb || null;
  currentStep = 0;
  nextStepTime = a.currentTime + 0.06;
  if (!masterGain) {
    masterGain = a.createGain();
    masterGain.connect(a.destination);
  }
  masterGain.gain.value = 0.9;
  timer = window.setInterval(schedule, LOOKAHEAD_MS);
  return null;
}
function stop() {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
  currentStep = 0;
}
function schedule() {
  const a = ac;
  const s = score;
  if (!a || !s || timer == null) return;
  const stepDur = 60 / s.meta.bpm / 4;
  const swingPct = s.meta.swing || 0;
  const totalSteps = s.meta.bars * 16;
  while (nextStepTime < a.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(a, s, currentStep, nextStepTime, stepDur);
    if (onStep) {
      const delayMs = Math.max(0, (nextStepTime - a.currentTime) * 1e3);
      const stepAt = currentStep;
      window.setTimeout(() => onStep && onStep(stepAt), delayMs);
    }
    const swingOffset = currentStep % 2 === 1 ? stepDur * (swingPct / 100) : 0;
    nextStepTime += stepDur + swingOffset;
    currentStep = (currentStep + 1) % totalSteps;
  }
}
function scheduleStep(a, s, step, t, stepDur) {
  const swingOffset = step % 2 === 1 ? stepDur * ((s.meta.swing || 0) / 100) : 0;
  const tt = t + swingOffset;
  for (const tr of s.tracks) {
    if (tr.type === "drum") scheduleDrumStep(a, tr, step, tt, stepDur);
    else scheduleSynthStep(a, tr, step, tt, stepDur);
  }
}
function scheduleSynthStep(a, tr, step, t, stepDur) {
  const trackGain = a.createGain();
  trackGain.gain.value = tr.vol;
  trackGain.connect(masterGain);
  for (const n of tr.notes) {
    if (n.step === step) playSynthNote(a, trackGain, { ...tr, vol: 1 }, n, t, stepDur);
  }
}
function scheduleDrumStep(a, tr, step, t, _stepDur) {
  for (const [name, steps] of Object.entries(tr.pattern)) {
    const fn = DRUM_FN[name];
    if (fn && Array.isArray(steps) && steps.includes(step)) fn(a, masterGain, t, tr.vol);
  }
}
async function exportWav(s) {
  const AC = window.OfflineAudioContext;
  if (!AC) return null;
  const sampleRate = 44100;
  const dur = s.meta.bars * 16 * (60 / s.meta.bpm / 4) + 0.5;
  const oc = new AC(2, Math.ceil(sampleRate * dur), sampleRate);
  const og = oc.createGain();
  og.gain.value = 0.9;
  og.connect(oc.destination);
  const stepDur = 60 / s.meta.bpm / 4;
  const swingPct = s.meta.swing || 0;
  const activeVoicesLocal = { n: 0 };
  for (const tr of s.tracks) {
    const tg = oc.createGain();
    tg.gain.value = tr.vol;
    tg.connect(og);
    if (tr.type === "drum") {
      for (const [name, steps] of Object.entries(tr.pattern)) {
        const fn = DRUM_FN[name];
        if (!fn || !Array.isArray(steps)) continue;
        for (const step of steps) {
          const t = step * stepDur + (step % 2 === 1 ? stepDur * (swingPct / 100) : 0);
          if (t < dur - 0.4) fn(oc, tg, t, 1);
        }
      }
    } else {
      for (const n of tr.notes) {
        if (activeVoicesLocal.n >= VOICE_CAP) break;
        activeVoicesLocal.n++;
        const t = n.step * stepDur + (n.step % 2 === 1 ? stepDur * (swingPct / 100) : 0);
        const durN = Math.max(0.05, n.len * stepDur);
        const o = oc.createOscillator();
        const g = oc.createGain();
        const f = oc.createBiquadFilter();
        o.type = tr.wave;
        o.frequency.value = noteFreq(n.pitch + (tr.octaveShift || 0) * 12);
        f.type = "lowpass";
        f.frequency.value = tr.cutoff;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(Math.max(0.02, n.vel), t + 0.01);
        g.gain.linearRampToValueAtTime(Math.max(0.01, n.vel * 0.7), t + 0.05);
        g.gain.exponentialRampToValueAtTime(1e-3, t + durN);
        o.connect(f);
        f.connect(g);
        g.connect(tg);
        o.start(t);
        o.stop(t + durN + 0.02);
      }
    }
  }
  const rendered = await oc.startRendering();
  return encodeWav(rendered);
}
function encodeWav(buf) {
  const numCh = buf.numberOfChannels;
  const len = buf.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const ws = (off2, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off2 + i, str.charCodeAt(i));
  };
  ws(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ws(36, "data");
  view.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, v < 0 ? v * 32768 : v * 32767, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

// src/Panel.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var WAVES = ["sawtooth", "square", "sine", "triangle"];
var TRACK_COLORS = ["#ff6b9d", "#5ed6a8", "#5ec8ff", "#ffd27a", "#c792ea", "#f78c6c"];
var STEP_W = 26;
var ROW_H = 20;
function Panel() {
  const [tab, setTab] = useState("library");
  const [svcErr, setSvcErr] = useState(null);
  const [svcInfo, setSvcInfo] = useState("");
  const [scores, setScores] = useState([]);
  const [cap, setCap] = useState(200);
  const [skeleton, setSkeleton] = useState({ title: "", bpm: 96, key: "Am", bars: 4, style: "melody", progression: "" });
  const [score2, setScore] = useState(null);
  const [curTrack, setCurTrack] = useState(0);
  const [playStep, setPlayStep] = useState(-1);
  const [saveMsg, setSaveMsg] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [volume, setVolume] = useState(0.9);
  const loadScores = useCallback(async () => {
    try {
      const r = await api.listScores();
      setScores(r.scores);
      setCap(r.cap);
      setSvcErr(null);
      setSvcInfo(`v${(await api.meta()).version} \xB7 ${r.scores.length}/${r.cap} \u4EFD`);
    } catch (e) {
      setSvcErr(e.message);
    }
  }, []);
  useEffect(() => {
    void loadScores();
  }, [loadScores]);
  useEffect(() => {
    const timer2 = window.setInterval(() => {
      if (tab === "library") void loadScores();
    }, 5e3);
    const onFocus = () => {
      void loadScores();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer2);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadScores, tab]);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && isPlaying()) {
        stop();
        setPlayStep(-1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const openScore = useCallback(async (id) => {
    try {
      const r = await api.getScore(id);
      setScore(r.score);
      setCurTrack(0);
      setAnalysis(null);
      setSaveMsg(null);
      setTab("edit");
    } catch (e) {
      setSvcErr(e.message);
    }
  }, []);
  const doCreate = useCallback(async () => {
    try {
      const prog = skeleton.progression.trim() ? skeleton.progression.split(/[,，\s]+/).filter(Boolean) : void 0;
      const r = await api.createScore({
        title: skeleton.title || "\u672A\u547D\u540D",
        bpm: Number(skeleton.bpm),
        key: skeleton.key,
        bars: Number(skeleton.bars),
        style: skeleton.style,
        ...prog ? { progression: prog } : {}
      });
      setScore(r.score);
      setTab("edit");
      setSvcErr(null);
      void loadScores();
    } catch (e) {
      setSvcErr(e.message);
    }
  }, [skeleton, loadScores]);
  const doSave = useCallback(async () => {
    if (!score2) return;
    const v = validateScore2(score2);
    if (!v.ok) {
      setSaveMsg({ ok: false, text: v.errors.join("\uFF1B") });
      return;
    }
    try {
      const r = await api.writeScore({ id: score2.id, score: v.score });
      setScore({ ...r.score });
      setSaveMsg({ ok: true, text: `\u5DF2\u4FDD\u5B58\uFF08${r.id}\uFF09` });
      void loadScores();
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message });
    }
  }, [score2, loadScores]);
  const doAnalyze = useCallback(async () => {
    if (!score2) return;
    setAnalysis(analyzeScore2(score2));
  }, [score2]);
  const doDelete = useCallback(async (id) => {
    try {
      await api.deleteScore(id);
      void loadScores();
    } catch (e) {
      setSvcErr(e.message);
    }
  }, [loadScores]);
  const togglePlay = useCallback(() => {
    if (!score2) return;
    if (isPlaying()) {
      stop();
      setPlayStep(-1);
      return;
    }
    ensureRunning();
    const err = play(score2, (st) => setPlayStep(st));
    if (err) setSvcErr(err);
  }, [score2]);
  const doExport = useCallback(async () => {
    if (!score2) return;
    try {
      const blob = await exportWav(score2);
      if (!blob) {
        setSaveMsg({ ok: false, text: "\u6B64\u73AF\u5883\u4E0D\u652F\u6301\u79BB\u7EBF\u6E32\u67D3" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${score2.meta.title.replace(/[\\/:*?"<>|]/g, "_")}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    } catch (e) {
      setSaveMsg({ ok: false, text: `\u5BFC\u51FA\u5931\u8D25\uFF1A${e.message}` });
    }
  }, [score2]);
  const mutateMeta = (patch) => {
    setScore((s) => s ? { ...s, meta: { ...s.meta, ...patch } } : s);
  };
  const mutateTrack = (idx, patch) => {
    setScore((s) => {
      if (!s) return s;
      const tracks = s.tracks.map((t, i) => i === idx ? { ...t, ...patch } : t);
      return { ...s, tracks };
    });
  };
  const toggleNote = (step, pitch) => {
    setScore((s) => {
      if (!s) return s;
      const tr = s.tracks[curTrack];
      if (!tr || tr.type !== "synth") return s;
      const notes = [...tr.notes];
      const idx = notes.findIndex((n) => n.step === step && n.pitch === pitch);
      if (idx >= 0) notes.splice(idx, 1);
      else {
        notes.push({ step, pitch, len: 2, vel: 0.8 });
        if (ensureRunning()) auditionNote(tr, pitch);
      }
      return { ...s, tracks: s.tracks.map((t, i) => i === curTrack ? { ...t, notes } : t) };
    });
  };
  const toggleDrum = (drum, step) => {
    setScore((s) => {
      if (!s) return s;
      const tr = s.tracks[curTrack];
      if (!tr || tr.type !== "drum") return s;
      const cur = tr.pattern[drum] || [];
      const next = cur.includes(step) ? cur.filter((x) => x !== step) : [...cur, step].sort((a, b) => a - b);
      return { ...s, tracks: s.tracks.map((t, i) => i === curTrack ? { ...t, pattern: { ...tr.pattern, [drum]: next } } : t) };
    });
  };
  const addTrack = () => {
    setScore((s) => {
      if (!s || s.tracks.length >= 16) return s;
      return { ...s, tracks: [...s.tracks, { name: `\u8F68${s.tracks.length + 1}`, type: "synth", wave: "triangle", vol: 0.25, cutoff: 2e3, octaveShift: 0, notes: [] }] };
    });
  };
  const totalSteps = score2 ? score2.meta.bars * 16 : 32;
  return /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column", color: "var(--polaris-text, #dde6ff)", background: "var(--polaris-bg, transparent)", fontSize: 12, gap: 8, overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
      ["library", "edit", "analyze", "settings"].map((t) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => {
            setTab(t);
            if (t !== "edit") {
              stop();
              setPlayStep(-1);
            }
          },
          style: { padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(126,232,250,.25)", background: tab === t ? "rgba(126,232,250,.2)" : "transparent", color: "inherit", cursor: "pointer" },
          children: t === "library" ? "\u8C31\u5E93" : t === "edit" ? "\u7F16\u8F91" : t === "analyze" ? "\u5206\u6790" : "\u8BBE\u7F6E"
        },
        t
      )),
      /* @__PURE__ */ jsx("div", { style: { marginLeft: "auto", color: "rgba(160,180,220,.6)", fontSize: 11 }, children: svcInfo })
    ] }),
    svcErr && /* @__PURE__ */ jsxs("div", { style: { padding: "6px 10px", borderRadius: 6, background: "rgba(255,107,157,.12)", border: "1px solid rgba(255,107,157,.4)", display: "flex", gap: 8, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("span", { style: { flex: 1 }, children: svcErr }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: async () => {
            try {
              await api.restart();
              invalidateMeta();
              setTimeout(() => void loadScores(), 1500);
              setSvcErr(null);
            } catch (e) {
              setSvcErr(`\u91CD\u542F\u5931\u8D25\uFF1A${e.message}`);
            }
          },
          style: { padding: "3px 8px", cursor: "pointer" },
          children: "\u91CD\u542F\u670D\u52A1"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { flex: 1, overflow: "auto" }, children: [
      tab === "library" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { border: "1px solid rgba(126,232,250,.2)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: "rgba(126,232,250,.9)" }, children: "\u65B0\u5EFA\uFF08\u9AA8\u67B6 \u2192 \u7B97\u6CD5\u5C55\u5F00\uFF0C100% \u5728\u8C03\u4E0A\uFF09" }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
            /* @__PURE__ */ jsx("input", { placeholder: "\u66F2\u540D", value: skeleton.title, onChange: (e) => setSkeleton({ ...skeleton, title: e.target.value }), style: inp }),
            /* @__PURE__ */ jsx("input", { type: "number", min: 40, max: 240, value: skeleton.bpm, onChange: (e) => setSkeleton({ ...skeleton, bpm: Number(e.target.value) }), style: { ...inp, width: 60 }, title: "BPM" }),
            /* @__PURE__ */ jsx("input", { placeholder: "Am", value: skeleton.key, onChange: (e) => setSkeleton({ ...skeleton, key: e.target.value }), style: { ...inp, width: 60 }, title: "\u8C03\u5F0F" }),
            /* @__PURE__ */ jsx("input", { type: "number", min: 1, max: 16, value: skeleton.bars, onChange: (e) => setSkeleton({ ...skeleton, bars: Number(e.target.value) }), style: { ...inp, width: 50 }, title: "\u5C0F\u8282" }),
            /* @__PURE__ */ jsxs("select", { value: skeleton.style, onChange: (e) => setSkeleton({ ...skeleton, style: e.target.value }), style: inp, children: [
              /* @__PURE__ */ jsx("option", { value: "melody", children: "\u65CB\u5F8B" }),
              /* @__PURE__ */ jsx("option", { value: "arpeggio", children: "\u7436\u97F3" }),
              /* @__PURE__ */ jsx("option", { value: "walkbass", children: "\u884C\u8D70\u8D1D\u65AF" }),
              /* @__PURE__ */ jsx("option", { value: "pad", children: "\u94FA\u5E95" }),
              /* @__PURE__ */ jsx("option", { value: "riff", children: "\u8FDE\u590D\u6BB5" })
            ] }),
            /* @__PURE__ */ jsx("input", { placeholder: "\u548C\u5F26\u8FDB\u884C\uFF08\u53EF\u9009\uFF0C\u5982 Am,F,C,G\uFF09", value: skeleton.progression, onChange: (e) => setSkeleton({ ...skeleton, progression: e.target.value }), style: { ...inp, flex: 1, minWidth: 160 } }),
            /* @__PURE__ */ jsx("button", { onClick: doCreate, style: btnPri, children: "\u751F\u6210" })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { color: "rgba(160,180,220,.55)", fontSize: 11 }, children: "\u63D0\u793A\uFF1AAI \u53EF\u5728\u5BF9\u8BDD\u91CC\u76F4\u63A5\u751F\u6210\uFF08MCP score_create/score_write\uFF09\uFF1B\u8FD9\u91CC\u7ED9\u624B\u52A8\u5165\u53E3\u3002\u751F\u6210\u540E\u8FDB\u7F16\u8F91\u5FAE\u8C03\u3002" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
          scores.length === 0 && /* @__PURE__ */ jsx("div", { style: { color: "rgba(160,180,220,.5)", padding: 12, textAlign: "center" }, children: "\u66F2\u8C31\u5E93\u4E3A\u7A7A\u2014\u2014\u4E0A\u9762\u751F\u6210\u4E00\u4EFD\uFF0C\u6216\u8BA9 AI \u7ECF MCP \u5199\u5165" }),
          scores.map((s, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(126,232,250,.05)", borderLeft: `3px solid ${TRACK_COLORS[i % TRACK_COLORS.length]}` }, children: [
            /* @__PURE__ */ jsx("span", { style: { cursor: "pointer", fontWeight: 600, minWidth: 90 }, onClick: () => void openScore(s.id), children: s.title }),
            /* @__PURE__ */ jsxs("span", { style: { color: "rgba(160,180,220,.6)", fontSize: 11 }, children: [
              s.key,
              " \xB7 ",
              s.bars,
              " \u5C0F\u8282 \xB7 ",
              s.bpm,
              " BPM \xB7 ",
              s.dur,
              "s \xB7 ",
              s.tracks,
              " \u8F68"
            ] }),
            /* @__PURE__ */ jsx("span", { style: { color: "rgba(160,180,220,.4)", fontSize: 11, marginLeft: "auto" }, children: new Date(s.updatedAt).toLocaleString() }),
            /* @__PURE__ */ jsx("button", { onClick: () => void openScore(s.id), style: btn, children: "\u6253\u5F00" }),
            /* @__PURE__ */ jsx("button", { onClick: () => void doDelete(s.id), style: { ...btn, color: "#ff6b9d" }, children: "\u5220\u9664" })
          ] }, s.id)),
          scores.length >= cap && /* @__PURE__ */ jsxs("div", { style: { color: "#ffd27a", fontSize: 11 }, children: [
            "\u5DF2\u8FBE\u4E0A\u9650 ",
            cap,
            " \u4EFD\uFF0C\u8BF7\u6E05\u7406\u540E\u518D\u5EFA"
          ] })
        ] })
      ] }),
      tab === "edit" && score2 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }, children: [
          /* @__PURE__ */ jsx("input", { value: score2.meta.title, onChange: (e) => mutateMeta({ title: e.target.value }), style: { ...inp, width: 140 } }),
          /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
            "BPM ",
            /* @__PURE__ */ jsx("input", { type: "number", min: 40, max: 240, value: score2.meta.bpm, onChange: (e) => mutateMeta({ bpm: Number(e.target.value) }), style: { ...inp, width: 56 } })
          ] }),
          /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
            "\u8C03\u5F0F ",
            /* @__PURE__ */ jsx("input", { value: score2.meta.key, onChange: (e) => mutateMeta({ key: e.target.value }), style: { ...inp, width: 56 } })
          ] }),
          /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
            "\u5C0F\u8282 ",
            /* @__PURE__ */ jsx("input", { type: "number", min: 1, max: 16, value: score2.meta.bars, onChange: (e) => mutateMeta({ bars: Number(e.target.value) }), style: { ...inp, width: 48 } })
          ] }),
          /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
            "\u6446\u52A8 ",
            /* @__PURE__ */ jsx("input", { type: "number", min: 0, max: 60, value: score2.meta.swing ?? 0, onChange: (e) => mutateMeta({ swing: Number(e.target.value) }), style: { ...inp, width: 48 } }),
            "%"
          ] }),
          /* @__PURE__ */ jsx("button", { onClick: togglePlay, style: btnPri, children: isPlaying() ? "\u23F8 \u6682\u505C" : "\u25B6 \u64AD\u653E" }),
          /* @__PURE__ */ jsx("button", { onClick: () => {
            stop();
            setPlayStep(-1);
          }, style: btn, children: "\u25A0" }),
          /* @__PURE__ */ jsx("button", { onClick: doExport, style: btn, children: "\u2B07 WAV" }),
          /* @__PURE__ */ jsx("button", { onClick: doSave, style: btnPri, children: "\u4FDD\u5B58" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }, children: [
          score2.tracks.map((t, i) => /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => setCurTrack(i),
              style: { padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${TRACK_COLORS[i % TRACK_COLORS.length]}`, background: i === curTrack ? `${TRACK_COLORS[i % TRACK_COLORS.length]}33` : "transparent", color: "inherit" },
              children: [
                t.name,
                "\uFF08",
                t.type === "drum" ? "\u9F13" : `${t.notes.length} \u97F3`,
                "\uFF09"
              ]
            },
            i
          )),
          /* @__PURE__ */ jsx("button", { onClick: addTrack, style: { ...btn, padding: "3px 8px" }, children: "+ \u8F68" })
        ] }),
        /* @__PURE__ */ jsx(ScoreGrid, { score: score2, curTrack, playStep, onCell: toggleNote, onDrum: toggleDrum }),
        score2.tracks[curTrack]?.type === "synth" && (() => {
          const tr = score2.tracks[curTrack];
          return /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [
            /* @__PURE__ */ jsx("input", { value: tr.name, onChange: (e) => mutateTrack(curTrack, { name: e.target.value }), style: { ...inp, width: 90 } }),
            /* @__PURE__ */ jsx("select", { value: tr.wave, onChange: (e) => mutateTrack(curTrack, { wave: e.target.value }), style: inp, children: WAVES.map((w) => /* @__PURE__ */ jsx("option", { value: w, children: w }, w)) }),
            /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
              "\u622A\u6B62 ",
              /* @__PURE__ */ jsx("input", { type: "range", min: 200, max: 12e3, value: tr.cutoff, onChange: (e) => mutateTrack(curTrack, { cutoff: Number(e.target.value) }), style: { width: 100 } })
            ] }),
            /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
              "\u97F3\u91CF ",
              /* @__PURE__ */ jsx("input", { type: "range", min: 0, max: 100, value: Math.round(tr.vol * 100), onChange: (e) => mutateTrack(curTrack, { vol: Number(e.target.value) / 100 }), style: { width: 80 } })
            ] }),
            /* @__PURE__ */ jsxs("label", { style: { color: "rgba(160,180,220,.6)" }, children: [
              "\u516B\u5EA6 ",
              /* @__PURE__ */ jsx("input", { type: "number", min: -2, max: 2, value: tr.octaveShift, onChange: (e) => mutateTrack(curTrack, { octaveShift: Number(e.target.value) }), style: { ...inp, width: 44 } })
            ] })
          ] });
        })(),
        saveMsg && /* @__PURE__ */ jsx("div", { style: { color: saveMsg.ok ? "#5ed6a8" : "#ff6b9d" }, children: saveMsg.text })
      ] }),
      tab === "analyze" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        !score2 && /* @__PURE__ */ jsx("div", { style: { color: "rgba(160,180,220,.5)", padding: 12 }, children: "\u5148\u5728\u8C31\u5E93\u6253\u5F00\u4E00\u4EFD\u4E50\u8C31" }),
        score2 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("button", { onClick: doAnalyze, style: { ...btnPri, alignSelf: "flex-start" }, children: "\u5206\u6790\u5F53\u524D\u4E50\u8C31" }),
          analysis && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontWeight: 600 }, children: analysis.summary }),
            analysis.outOfScale.length > 0 && /* @__PURE__ */ jsx(Section, { title: `\u8C03\u5F0F\u5916\u97F3\uFF08${analysis.outOfScale.length}\uFF09`, color: "#ffd27a", children: analysis.outOfScale.map((o, i) => /* @__PURE__ */ jsxs("div", { style: { fontSize: 11 }, children: [
              o.track,
              " \u7B2C ",
              o.step + 1,
              " \u6B65 ",
              o.note,
              " \u2192 \u5EFA\u8BAE ",
              o.suggest
            ] }, i)) }),
            analysis.conflicts.length > 0 && /* @__PURE__ */ jsx(Section, { title: `\u540C\u62CD\u53E0\u97F3\uFF08${analysis.conflicts.length}\uFF09`, color: "#5ec8ff", children: analysis.conflicts.map((c, i) => /* @__PURE__ */ jsxs("div", { style: { fontSize: 11 }, children: [
              c.track,
              " \u7B2C ",
              c.step + 1,
              " \u6B65\uFF1A",
              c.pitches.map((p) => midiToNoteName2(p)).join("+"),
              " \u2014\u2014 ",
              c.suggest
            ] }, i)) }),
            /* @__PURE__ */ jsx(Section, { title: "\u5EFA\u8BAE", color: "#5ed6a8", children: analysis.suggestions.map((s, i) => /* @__PURE__ */ jsx("div", { style: { fontSize: 11 }, children: s }, i)) }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: 11, color: "rgba(160,180,220,.6)" }, children: [
              "\u6BCF\u5C0F\u8282\u5BC6\u5EA6\uFF1A",
              analysis.density.perBarPercent.map((p, i) => `\u7B2C${i + 1}\u5C0F\u8282 ${p}%`).join(" \xB7 ")
            ] })
          ] })
        ] })
      ] }),
      tab === "settings" && /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }, children: [
        /* @__PURE__ */ jsxs("label", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          "\u4E3B\u97F3\u91CF ",
          /* @__PURE__ */ jsx("input", { type: "range", min: 0, max: 100, value: Math.round(volume * 100), onChange: (e) => setVolume(Number(e.target.value) / 100), style: { flex: 1 } })
        ] }),
        /* @__PURE__ */ jsx("button", { onClick: () => {
          setVolume(Math.max(0, volume - 0.1));
        }, style: { display: "none" } }),
        /* @__PURE__ */ jsxs("div", { style: { border: "1px solid rgba(126,232,250,.2)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontWeight: 600 }, children: "\u670D\u52A1" }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "rgba(160,180,220,.6)" }, children: "\u6570\u636E\u9762 127.0.0.1 \u76F4\u8FDE\uFF08Bearer token\uFF0Cmeta \u7ECF cap.kv \u5206\u53D1\uFF09\uFF1B\u66F2\u8C31\u5168\u6587\u843D appConfigDir/daw-studio/scores\uFF0Ckv \u53EA\u5B58\u7D22\u5F15\u3002\u96F6\u51FA\u7F51\u3002" }),
          /* @__PURE__ */ jsx("button", { onClick: () => {
            invalidateMeta();
            void loadScores();
          }, style: { ...btn, alignSelf: "flex-start" }, children: "\u91CD\u8FDE\u670D\u52A1" })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "rgba(160,180,220,.5)" }, children: "AI \u95ED\u73AF\uFF1A\u5BF9\u8BDD\u91CC score_create\uFF08\u9AA8\u67B6\u751F\u6210\uFF09/ score_write\uFF08\u7CBE\u786E\u8BB0\u8C31\uFF09/ score_analyze\uFF08\u81EA\u67E5\uFF09\u3002 \u64AD\u653E\u4E0E\u5BFC\u51FA\u5728\u6B64\u9762\u677F\uFF0C\u7531\u4F60\u624B\u52A8\u89E6\u53D1\u2014\u2014AI \u4E0D\u4F1A\u7A81\u7136\u51FA\u58F0\u3002" })
      ] })
    ] })
  ] });
}
function Section({ title, color, children }) {
  return /* @__PURE__ */ jsxs("div", { style: { border: `1px solid ${color}44`, borderRadius: 8, padding: 8 }, children: [
    /* @__PURE__ */ jsx("div", { style: { color, fontWeight: 600, marginBottom: 4, fontSize: 12 }, children: title }),
    children
  ] });
}
function ScoreGrid({ score: score2, curTrack, playStep, onCell, onDrum }) {
  const tr = score2.tracks[curTrack];
  const total = score2.meta.bars * 16;
  const gridStyle = { touchAction: "none" };
  if (!tr) return null;
  if (tr.type === "drum") {
    const drums = ["kick", "snare", "hat", "clap"];
    const labels = { kick: "\u5E95\u9F13", snare: "\u519B\u9F13", hat: "\u8E29\u9572", clap: "\u62CD\u624B" };
    return /* @__PURE__ */ jsx("div", { style: { ...gridStyle, overflowX: "auto" }, children: /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: total * STEP_W + 56 }, children: [
      playStep >= 0 && /* @__PURE__ */ jsx("div", { style: { position: "absolute", left: 56 + playStep * STEP_W, top: 0, bottom: 0, width: STEP_W, background: "rgba(126,232,250,.12)", pointerEvents: "none", borderRadius: 3 } }),
      drums.map((d) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", height: ROW_H + 4, alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("div", { style: { width: 56, fontSize: 11, color: "rgba(160,180,220,.6)" }, children: labels[d] }),
        Array.from({ length: total }, (_, s) => {
          const on = tr.pattern[d]?.includes(s);
          return /* @__PURE__ */ jsx(
            "div",
            {
              onClick: () => onDrum(d, s),
              style: { width: STEP_W - 2, height: ROW_H, margin: 1, borderRadius: 3, cursor: "pointer", background: on ? "#7ee8fa" : s % 4 === 0 ? "#202840" : "#1a2030", flexShrink: 0 }
            },
            s
          );
        })
      ] }, d))
    ] }) });
  }
  const LO = 36;
  const HI = 84;
  const pitches = [];
  for (let p = HI; p >= LO; p--) pitches.push(p);
  const isBlack = (p) => [1, 3, 6, 8, 10].includes((p % 12 + 12) % 12);
  return /* @__PURE__ */ jsx("div", { style: { ...gridStyle, overflowX: "auto" }, children: /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: total * STEP_W + 40 }, children: [
    playStep >= 0 && /* @__PURE__ */ jsx("div", { style: { position: "absolute", left: 40 + playStep * STEP_W, top: 0, bottom: 0, width: STEP_W, background: "rgba(126,232,250,.12)", pointerEvents: "none", borderRadius: 3 } }),
    pitches.map((p) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", height: ROW_H, alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("div", { style: { width: 40, fontSize: 9, color: "rgba(160,180,220,.5)", background: isBlack(p) ? "#0a0e17" : "transparent" }, children: p % 12 === 0 ? midiToNoteName2(p) : "" }),
      Array.from({ length: total }, (_, s) => {
        const on = tr.notes.some((n) => n.step === s && n.pitch === p);
        return /* @__PURE__ */ jsx(
          "div",
          {
            onClick: () => onCell(s, p),
            style: { width: STEP_W - 2, height: ROW_H - 2, margin: 1, borderRadius: 2, cursor: "pointer", flexShrink: 0, background: on ? "#7ee8fa" : isBlack(p) ? s % 4 === 0 ? "#141a28" : "#0d1119" : s % 4 === 0 ? "#202840" : "#161c2a" }
          },
          s
        );
      })
    ] }, p))
  ] }) });
}
var inp = {
  background: "rgba(26,32,48,.8)",
  border: "1px solid rgba(126,232,250,.2)",
  color: "inherit",
  padding: "3px 6px",
  borderRadius: 4,
  fontSize: 12
};
var btn = {
  border: "1px solid rgba(126,232,250,.25)",
  background: "rgba(126,232,250,.08)",
  color: "inherit",
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12
};
var btnPri = {
  ...btn,
  borderColor: "#7ee8fa",
  background: "rgba(126,232,250,.2)"
};

// src/index.tsx
var src_default = Panel;
export {
  src_default as default
};
