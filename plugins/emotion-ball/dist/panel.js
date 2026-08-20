// src/Panel.tsx
import React3 from "react";

// src/BallView.tsx
import React from "react";

// src/geometry.ts
var HEAD_C = 110;
var EYE_HALF = 20;
var TAU = Math.PI * 2;
function rad(d) {
  return d * Math.PI / 180;
}
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function centroid(ring) {
  let x = 0, y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / ring.length, y / ring.length];
}
function ringPath(ring) {
  let s = "M";
  for (let i = 0; i < ring.length; i++) {
    s += (i ? "L" : "") + ring[i][0].toFixed(2) + " " + ring[i][1].toFixed(2);
  }
  return s + "Z";
}
function genEyeRing(cx, cy, rx, ry, openTop = 1, openBot = 1, tilt = 0, squish = 0) {
  const N = 48;
  const ring = [];
  const ct = Math.cos(rad(tilt));
  const st = Math.sin(rad(tilt));
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU;
    const sa = Math.sin(a);
    const open = sa >= 0 ? openTop : openBot;
    const ryc = ry * (0.04 + 0.96 * open);
    const rxc = rx * (1 - squish * (1 - open));
    let x = Math.cos(a) * rxc;
    let y = sa * ryc;
    const rx2 = x * ct - y * st;
    const ry2 = x * st + y * ct;
    ring.push([+(cx + rx2).toFixed(2), +(cy + ry2).toFixed(2)]);
  }
  return ring;
}
function genBlobBody(cx, cy, r, wobble = 0) {
  const N = 48;
  const ring = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU;
    const w = 1 + wobble * (Math.sin(a * 3 + 1.1) * 0.4 + Math.sin(a * 5 + 0.3) * 0.3);
    ring.push([
      +(cx + Math.cos(a) * r * w).toFixed(2),
      +(cy + Math.sin(a) * r * w).toFixed(2)
    ]);
  }
  return ring;
}
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
}
function lerpColor(a, b, t) {
  if (a === b) return b;
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const target = amt < 0 ? 0 : 255;
  const a = Math.abs(amt);
  return rgbToHex(
    r + (target - r) * a,
    g + (target - g) * a,
    b + (target - b) * a
  );
}

// src/emotions.ts
var L_OFF = [-EYE_HALF - 4, 0];
var R_OFF = [EYE_HALF + 4, 0];
var RING_PARAMS = [
  [17, 20, 1, 1, 0, 0],
  // 0 平静大眼（更圆更萌）
  [18, 22, 1.05, 1.05, 0, 0],
  // 1 圆睁
  [17, 17, 0.08, 1, 0, 0],
  // 2 笑眼(上弧闭)
  [15, 10, 0.5, 0.5, 0, 0.4],
  // 3 眯眼
  [15, 2, 0.04, 0.04, 0, 0.6],
  // 4 闭合细线
  [16, 15, 1, 0.85, -18, 0],
  // 5 斜左
  [16, 15, 1, 0.85, 18, 0],
  // 6 斜右
  [17, 16, 0.3, 1, 0, 0.2],
  // 7 怒目(上压)
  [16, 12, 0.55, 0.55, 0, 0],
  // 8 困倦半开
  [19, 12, 1, 1, 0, 0],
  // 9 聆听(扁宽)
  [14, 9, 0.6, 0.6, 0, 0.3],
  // 10 扫读窄
  [12, 13, 0.7, 0.7, 0, 0.1],
  // 11 害羞小
  [20, 24, 1.1, 1.1, 0, 0],
  // 12 惊讶大圆
  [17, 17, 1, 0.4, -10, 0],
  // 13 悲伤下垂
  [16, 16, 1, 0.9, -4, 0]
  // 14 期待上望
];
function genEyeRings() {
  return RING_PARAMS.map((p) => {
    const [rx, ry, ot, ob, tilt, sq] = p;
    return {
      L: genEyeRing(HEAD_C + L_OFF[0], HEAD_C + L_OFF[1], rx, ry, ot, ob, tilt, sq),
      R: genEyeRing(HEAD_C + R_OFF[0], HEAD_C + R_OFF[1], rx, ry, ot, ob, -tilt, sq)
    };
  });
}
var DEFAULT_BODY = {
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  color: "#F3F0EA",
  breathe: 0.01,
  ribbons: 0,
  confetti: 0,
  zzz: 0,
  orbit: 0
};
var DEFAULT_EYE = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  open: 1,
  color: "#1A1A1A",
  lookX: 0,
  lookY: 0
};
var EMOTION_SEED = [
  // ===== 1) 生命周期（8 个） =====
  {
    id: "00",
    name: "\u7761\u7720",
    group: "life",
    desc: "\u95ED\u773C\u6210\u7EC6\u7EBF\uFF0C\u53F3\u4E0A\u89D2 zzz \u7F13\u7F13\u98D8\u8D77\uFF0C\u53EA\u5269\u7F13\u6162\u547C\u5438",
    en: { name: "Sleeping", desc: "Eyes closed to thin lines, zzz drifting up, slow breath only" },
    transition: 900,
    gaze: false,
    pool: [4],
    poolMs: [6e3, 1e4],
    blinkMs: null,
    openness: 0.08,
    body: { y: 4, rotate: -2, breathe: 0.018, color: "#EEEBE4", zzz: 1 },
    eyes: { both: { y: 4, lookY: 2 } },
    anims: [{ target: "eyes", prop: "y", type: "sine", amp: 1.2, period: 3600 }]
  },
  {
    id: "01",
    name: "\u5524\u9192",
    group: "life",
    desc: "\u4ECE\u95ED\u5408\u773C\u73AF\u7F13\u7F13\u7741\u5F00\uFF0C\u63C9\u773C\u4F3C\u7684\u7728\u4E24\u4E0B\uFF0C\u8FDB\u5165\u5F85\u673A",
    en: { name: "Waking", desc: "Eyes crack open with groggy blinks, then idle" },
    transition: 320,
    gaze: false,
    pool: [4],
    poolMs: [800, 800],
    blinkMs: null,
    sequence: {
      settle: { next: "02" },
      frames: [
        { at: 0, eyes: { both: { open: 0.1, y: 4 } } },
        { at: 420, eyes: { left: { open: 0.55, y: 2 }, right: { open: 0.12, y: 4 } } },
        { at: 820, eyes: { both: { open: 0.3, y: 3 } } },
        { at: 1400, eyes: { both: { open: 1, scaleX: 1.12, scaleY: 1.12, y: -2 } } },
        { at: 2100, eyes: { both: { open: 1, y: 0 } } }
      ]
    }
  },
  {
    id: "02",
    name: "\u5F85\u673A\u653E\u7A7A",
    group: "life",
    desc: "\u5DE6\u770B\u770B\u3001\u53F3\u770B\u770B\uFF0C\u76EE\u5149\u4E24\u4FA7\u505C\u7559\uFF0C\u5076\u5C14\u81EA\u65CB\u7529\u5F69\u5E26",
    en: { name: "Idle", desc: "Glances left and right, occasional ribbon spin" },
    transition: 700,
    gaze: true,
    pool: [0],
    poolMs: [9e3, 16e3],
    blinkMs: [6e3, 14e3],
    antics: true,
    body: { breathe: 0.012 },
    anims: [
      { target: "eyes", prop: "lookX", type: "glance", amp: 10, period: 4800 },
      { target: "eyes", prop: "lookY", type: "sine", amp: 2, period: 4100, phase: 1.1 }
    ]
  },
  {
    id: "03",
    name: "\u597D\u5947",
    group: "life",
    desc: "\u5706\u7741\u4E0E\u5E73\u9759\u773C\u73AF\u5FEB\u901F\u8F6E\u6362\uFF0C\u5934\u5FAE\u503E\uFF0C\u76EE\u5149\u6253\u91CF",
    en: { name: "Curious", desc: "Wide and calm rings rotate quickly, head tilted" },
    transition: 420,
    gaze: true,
    pool: [1, 0, 14],
    poolMs: [1800, 3200],
    blinkMs: [2500, 5500],
    poolSpeed: 10,
    body: { rotate: 4, breathe: 0.01 },
    eyes: { both: { lookY: -1 } },
    anims: [{ target: "eyes", prop: "lookX", type: "sine", amp: 2.4, period: 2800 }]
  },
  {
    id: "04",
    name: "\u503E\u542C",
    group: "life",
    desc: "\u6241\u5BBD\u773C\u73AF\uFF0C\u76EE\u5149\u5FAE\u5411\u4E0A\uFF0C\u7F13\u7F13\u5DE6\u53F3\u626B\u89C6",
    en: { name: "Listening", desc: "Wide flat eyes, gazing slightly up, slow scan" },
    transition: 500,
    gaze: true,
    pool: [9],
    poolMs: [4e3, 7e3],
    blinkMs: [4e3, 8e3],
    eyes: { both: { lookY: -2 } },
    anims: [{ target: "eyes", prop: "lookX", type: "sine", amp: 4, period: 5200 }]
  },
  {
    id: "05",
    name: "\u4E13\u6CE8",
    group: "life",
    desc: "\u772F\u773C\u7A84\u73AF\uFF0C\u76EE\u5149\u9501\u5B9A\u6B63\u524D\u65B9\uFF0C\u547C\u5438\u6781\u7F13",
    en: { name: "Focused", desc: "Narrow eyes locked forward, slow breath" },
    transition: 400,
    gaze: true,
    pool: [10],
    poolMs: [8e3, 12e3],
    blinkMs: [5e3, 1e4],
    body: { breathe: 6e-3 },
    anims: [{ target: "eyes", prop: "lookY", type: "sine", amp: 0.8, period: 6e3 }]
  },
  {
    id: "06",
    name: "\u56F0\u60D1",
    group: "life",
    desc: "\u4E00\u53EA\u773C\u5706\u7741\u4E00\u53EA\u773C\u5FAE\u772F\uFF0C\u5934\u6B6A\uFF0C\u76EE\u5149\u6E38\u79FB",
    en: { name: "Confused", desc: "One eye wide, one squinting, head tilted, wandering gaze" },
    transition: 500,
    gaze: true,
    pool: [1, 3],
    poolMs: [2500, 4500],
    blinkMs: [3e3, 6e3],
    body: { rotate: 6 },
    eyes: { left: { scaleY: 0.6 }, right: { scaleY: 1 } },
    anims: [{ target: "eyes", prop: "lookX", type: "jitter", amp: 3, speed: 0.4, decay: 0 }]
  },
  {
    id: "07",
    name: "\u8D70\u795E",
    group: "life",
    desc: "\u773C\u73AF\u7F13\u6162\u4E0A\u7FFB\uFF0C\u547C\u5438\u7EF5\u957F\uFF0C\u5BF9\u5916\u754C\u77ED\u6682\u5931\u7126",
    en: { name: "Dazing", desc: "Eyes drift up slowly, long breath, zoning out" },
    transition: 800,
    gaze: false,
    pool: [14, 4],
    poolMs: [5e3, 8e3],
    blinkMs: [8e3, 14e3],
    openness: 0.7,
    anims: [{ target: "eyes", prop: "lookY", type: "sine", amp: 5, period: 8e3 }]
  },
  // ===== 2) 情绪反应（12 个） =====
  {
    id: "10",
    name: "\u5F00\u5FC3",
    group: "emotion",
    desc: "\u7B11\u773C\u5F2F\u5F2F\uFF0C\u5934\u5FAE\u62AC\uFF0C\u8EAB\u4F53\u8F7B\u5F39",
    en: { name: "Happy", desc: "Smiling crescent eyes, slight bounce" },
    transition: 360,
    gaze: true,
    pool: [2, 0],
    poolMs: [2200, 4e3],
    blinkMs: [3e3, 6e3],
    body: { y: -2, breathe: 0.02, color: "#FFF6E0" },
    anims: [
      { target: "body", prop: "y", type: "sine", amp: 3, period: 1600 },
      { target: "eyes", prop: "lookX", type: "glance", amp: 4, period: 3e3 }
    ]
  },
  {
    id: "11",
    name: "\u5927\u7B11",
    group: "emotion",
    desc: "\u7B11\u773C\u5168\u95ED\uFF0C\u8EAB\u4F53\u4E0A\u4E0B\u98A4\u52A8\uFF0C\u6492\u82B1\u5E86\u795D",
    en: { name: "Laughing", desc: "Eyes fully shut, body shaking, confetti burst" },
    transition: 300,
    gaze: false,
    pool: [4],
    poolMs: [1500, 2500],
    blinkMs: null,
    openness: 0.06,
    body: { breathe: 0.03, color: "#FFE3B3", confetti: 1 },
    anims: [{ target: "body", prop: "y", type: "jitter", amp: 2, speed: 8, decay: 0 }]
  },
  {
    id: "12",
    name: "\u5BB3\u7F9E",
    group: "emotion",
    desc: "\u5C0F\u773C\u73AF\uFF0C\u76EE\u5149\u8EB2\u95EA\u5411\u53F3\u4E0B\uFF0C\u4F53\u8272\u6CDB\u7C89",
    en: { name: "Shy", desc: "Small eyes, gaze darting away, blushing pink" },
    transition: 600,
    gaze: true,
    pool: [11],
    poolMs: [3e3, 5e3],
    blinkMs: [2500, 5e3],
    body: { color: "#F9D7D0", rotate: -3 },
    eyes: { both: { lookX: 6, lookY: 4 } },
    anims: [{ target: "eyes", prop: "lookX", type: "jitter", amp: 2, speed: 0.3, decay: 0 }]
  },
  {
    id: "13",
    name: "\u60CA\u8BB6",
    group: "emotion",
    desc: "\u773C\u775B\u77AC\u95F4\u5706\u7741\uFF0C\u8EAB\u4F53\u540E\u4EF0\uFF0C\u5B9A\u683C\u4E00\u77AC",
    en: { name: "Surprised", desc: "Eyes snap wide, body leans back, freezes" },
    transition: 150,
    gaze: true,
    pool: [12],
    poolMs: [1500, 2500],
    blinkMs: [1500, 3e3],
    sequence: {
      settle: "hold",
      frames: [
        { at: 0, eyes: { both: { scaleX: 1.3, scaleY: 1.3 } }, body: { y: -3, scale: 1.04 } },
        { at: 600, eyes: { both: { scaleX: 1, scaleY: 1 } }, body: { y: 0, scale: 1 } }
      ]
    }
  },
  {
    id: "14",
    name: "\u751F\u6C14",
    group: "emotion",
    desc: "\u6012\u76EE\u4E0A\u538B\uFF0C\u5934\u524D\u503E\uFF0C\u4F53\u8272\u53D8\u7EA2\uFF0C\u547C\u5438\u6025\u4FC3",
    en: { name: "Angry", desc: "Furrowed eyes, head forward, reddening, fast breath" },
    transition: 280,
    gaze: true,
    pool: [7],
    poolMs: [2e3, 3500],
    blinkMs: [2e3, 4e3],
    body: { y: 2, rotate: 0, breathe: 0.03, color: "#F4C0B0" },
    eyes: { both: { lookY: -2 } },
    anims: [{ target: "body", prop: "y", type: "jitter", amp: 1, speed: 6, decay: 0 }]
  },
  {
    id: "15",
    name: "\u60B2\u4F24",
    group: "emotion",
    desc: "\u773C\u89D2\u4E0B\u5782\uFF0C\u5934\u4F4E\u5782\uFF0C\u4F53\u8272\u53D8\u51B7\u7070\u84DD",
    en: { name: "Sad", desc: "Drooping eyes, head down, cool grey-blue tone" },
    transition: 700,
    gaze: false,
    pool: [13],
    poolMs: [4e3, 7e3],
    blinkMs: [5e3, 9e3],
    openness: 0.7,
    body: { y: 6, rotate: 2, color: "#D8DCE4", breathe: 8e-3 },
    eyes: { both: { lookY: 3 } },
    anims: [{ target: "eyes", prop: "lookY", type: "sine", amp: 1.5, period: 5e3 }]
  },
  {
    id: "16",
    name: "\u5F97\u610F",
    group: "emotion",
    desc: "\u7B11\u773C\u534A\u95ED\uFF0C\u5934\u5FAE\u4EF0\uFF0C\u5F69\u5E26\u73AF\u7ED5",
    en: { name: "Smug", desc: "Half-closed smiling eyes, head back, orbiting ribbon" },
    transition: 500,
    gaze: true,
    pool: [2],
    poolMs: [3e3, 5e3],
    blinkMs: [4e3, 8e3],
    body: { y: -3, rotate: -4, color: "#FBE6C2", orbit: 1 },
    eyes: { both: { lookY: -3 } }
  },
  {
    id: "17",
    name: "\u671F\u5F85",
    group: "emotion",
    desc: "\u773C\u73AF\u4E0A\u671B\u5FAE\u7741\uFF0C\u8EAB\u4F53\u524D\u503E\u8F7B\u6643",
    en: { name: "Expectant", desc: "Eyes looking up, leaning forward, swaying" },
    transition: 450,
    gaze: true,
    pool: [14],
    poolMs: [2e3, 3500],
    blinkMs: [3e3, 6e3],
    poolSpeed: 8,
    body: { y: -1, color: "#E8F0E4" },
    eyes: { both: { lookY: -4 } },
    anims: [
      { target: "body", prop: "x", type: "sine", amp: 2, period: 2400 },
      { target: "eyes", prop: "lookX", type: "sine", amp: 2, period: 1800 }
    ]
  },
  {
    id: "18",
    name: "\u56F0\u60D1\u607C",
    group: "emotion",
    desc: "\u4E00\u53EA\u772F\u773C\u4E00\u53EA\u659C\u773C\uFF0C\u5934\u6B6A\uFF0C\u76EE\u5149\u659C\u89C6",
    en: { name: "Puzzled", desc: "One squint one slanted, head tilted, sidelong gaze" },
    transition: 500,
    gaze: true,
    pool: [3, 5],
    poolMs: [2500, 4500],
    blinkMs: [3e3, 6e3],
    body: { rotate: 5 },
    eyes: { left: { scaleX: 0.9 }, right: { scaleX: 0.7, lookX: 4 } },
    anims: [{ target: "eyes", prop: "lookX", type: "glance", amp: 3, period: 3600 }]
  },
  {
    id: "19",
    name: "\u5BA0\u7231",
    group: "emotion",
    desc: "\u7B11\u773C\u772F\u6210\u6708\u7259\uFF0C\u4F53\u8272\u6E29\u6696\uFF0C\u76EE\u5149\u67D4\u548C",
    en: { name: "Adoring", desc: "Crescent smiling eyes, warm tone, soft gaze" },
    transition: 600,
    gaze: true,
    pool: [2, 11],
    poolMs: [3e3, 5e3],
    blinkMs: [4e3, 7e3],
    body: { color: "#FBEAD8", breathe: 0.014 },
    eyes: { both: { lookY: 1 } }
  },
  {
    id: "20",
    name: "\u6FC0\u52A8",
    group: "emotion",
    desc: "\u5706\u7741\u773C\u73AF\u5FEB\u901F\u8F6E\u6362\uFF0C\u8EAB\u4F53\u98A4\u6296\uFF0C\u6492\u82B1",
    en: { name: "Excited", desc: "Wide eyes rotating fast, trembling, confetti" },
    transition: 200,
    gaze: true,
    pool: [12, 1],
    poolMs: [800, 1600],
    blinkMs: [2e3, 4e3],
    poolSpeed: 12,
    body: { color: "#FDD9C0", confetti: 1, breathe: 0.025 },
    anims: [{ target: "body", prop: "y", type: "jitter", amp: 1.5, speed: 10, decay: 0 }]
  },
  {
    id: "21",
    name: "\u6DE1\u5B9A",
    group: "emotion",
    desc: "\u5E73\u9759\u5927\u773C\uFF0C\u547C\u5438\u5E73\u7A33\uFF0C\u76EE\u5149\u4E0D\u6E38\u79FB",
    en: { name: "Calm", desc: "Calm wide eyes, steady breath, no wandering gaze" },
    transition: 600,
    gaze: true,
    pool: [0],
    poolMs: [1e4, 16e3],
    blinkMs: [6e3, 12e3],
    body: { breathe: 0.01, color: "#EDEDEA" }
  },
  // ===== 3) 代理状态（12 个） =====
  {
    id: "30",
    name: "\u601D\u8003",
    group: "agent",
    desc: "\u76EE\u5149\u4E0A\u671B\uFF0C\u5934\u9876\u5E38\u9A7B\u73AF\u5E26\u73AF\u7ED5\uFF0C\u547C\u5438\u7EF5\u957F",
    en: { name: "Thinking", desc: "Gaze upward, orbiting ribbon overhead, slow breath" },
    transition: 400,
    gaze: true,
    pool: [14, 0],
    poolMs: [3e3, 5e3],
    blinkMs: [4e3, 7e3],
    body: { orbit: 1, breathe: 8e-3, color: "#E4E8F0" },
    eyes: { both: { lookY: -3 } },
    anims: [{ target: "eyes", prop: "lookX", type: "sine", amp: 1.5, period: 4e3 }]
  },
  {
    id: "31",
    name: "\u68C0\u7D22",
    group: "agent",
    desc: "\u7A84\u773C\u73AF\u5FEB\u901F\u5DE6\u53F3\u626B\u8BFB\uFF0C\u76EE\u5149\u9AD8\u9891\u626B\u52A8",
    en: { name: "Searching", desc: "Narrow eyes scanning rapidly left-right" },
    transition: 250,
    gaze: true,
    pool: [10],
    poolMs: [1200, 2e3],
    blinkMs: [3e3, 6e3],
    poolSpeed: 10,
    anims: [{ target: "eyes", prop: "lookX", type: "scan", amp: 8, period: 1400 }]
  },
  {
    id: "32",
    name: "\u8BFB\u5199",
    group: "agent",
    desc: "\u772F\u773C\u5411\u4E0B\uFF0C\u76EE\u5149\u968F\u884C\u8F7B\u8F7B\u4E0A\u4E0B\u626B",
    en: { name: "Reading", desc: "Squinting down, eyes tracking up-down gently" },
    transition: 350,
    gaze: true,
    pool: [3],
    poolMs: [3e3, 5e3],
    blinkMs: [4e3, 8e3],
    eyes: { both: { lookY: 5 } },
    anims: [{ target: "eyes", prop: "lookY", type: "scan", amp: 3, period: 2e3 }]
  },
  {
    id: "33",
    name: "\u751F\u6210",
    group: "agent",
    desc: "\u5E73\u9759\u773C\u73AF\uFF0C\u76EE\u5149\u5FAE\u5411\u53F3\u4E0B\uFF0C\u547C\u5438\u5E73\u7A33\u6709\u8282\u5F8B",
    en: { name: "Generating", desc: "Calm eyes, gaze right-down, rhythmic breath" },
    transition: 300,
    gaze: true,
    pool: [0],
    poolMs: [4e3, 7e3],
    blinkMs: [5e3, 9e3],
    eyes: { both: { lookX: 3, lookY: 2 } },
    anims: [{ target: "body", prop: "scale", type: "pulse", amp: 0.012, period: 2400 }]
  },
  {
    id: "34",
    name: "\u6821\u9A8C",
    group: "agent",
    desc: "\u773C\u73AF\u5FEB\u901F\u7728\u52A8\uFF0C\u76EE\u5149\u9501\u5B9A\uFF0C\u5076\u6709\u5FAE\u6296",
    en: { name: "Verifying", desc: "Rapid blinks, locked gaze, slight jitter" },
    transition: 300,
    gaze: true,
    pool: [1],
    poolMs: [2e3, 3500],
    blinkMs: [800, 1600],
    eyes: { both: { lookY: -1 } },
    anims: [{ target: "eyes", prop: "lookX", type: "jitter", amp: 1, speed: 0.6, decay: 0 }]
  },
  {
    id: "35",
    name: "\u51FA\u9519",
    group: "agent",
    desc: "\u5706\u7741\u4E00\u77AC\uFF0C\u4F53\u8272\u53D8\u7EA2\uFF0C\u76EE\u5149\u6E38\u79FB\u4E0D\u5B9A",
    en: { name: "Error", desc: "Snap wide, reddening, darting gaze" },
    transition: 180,
    gaze: true,
    pool: [12, 7],
    poolMs: [1e3, 1800],
    blinkMs: [1500, 3e3],
    poolSpeed: 12,
    body: { color: "#F4B8A8", breathe: 0.03 },
    anims: [{ target: "eyes", prop: "lookX", type: "jitter", amp: 4, speed: 0.8, decay: 0 }]
  },
  {
    id: "36",
    name: "\u5B8C\u6210",
    group: "agent",
    desc: "\u7B11\u773C\u5F2F\u5F2F\uFF0C\u6492\u82B1\u5E86\u795D\uFF0C\u968F\u5373\u56DE\u5F85\u673A",
    en: { name: "Done", desc: "Smiling eyes, confetti, then back to idle" },
    transition: 300,
    gaze: true,
    pool: [2],
    poolMs: [1500, 2500],
    blinkMs: [3e3, 6e3],
    body: { color: "#E0F0D8", confetti: 1 },
    sequence: { settle: { next: "02" }, frames: [] }
  },
  {
    id: "37",
    name: "\u7B49\u5F85\u8F93\u5165",
    group: "agent",
    desc: "\u5E73\u9759\u773C\u73AF\uFF0C\u76EE\u5149\u5C45\u4E2D\uFF0C\u547C\u5438\u5E73\u7F13\uFF0C\u5076\u5C14\u7728\u773C",
    en: { name: "Awaiting", desc: "Calm centered gaze, slow breath, occasional blink" },
    transition: 500,
    gaze: true,
    pool: [0],
    poolMs: [6e3, 1e4],
    blinkMs: [4e3, 8e3],
    body: { breathe: 0.01 }
  },
  {
    id: "38",
    name: "\u8C03\u7528\u5DE5\u5177",
    group: "agent",
    desc: "\u772F\u773C\u7A84\u73AF\uFF0C\u76EE\u5149\u659C\u5411\uFF0C\u8EAB\u4F53\u5FAE\u524D\u503E",
    en: { name: "Tool use", desc: "Narrow slanted eyes, leaning forward" },
    transition: 280,
    gaze: true,
    pool: [10, 5],
    poolMs: [1800, 3e3],
    blinkMs: [3e3, 6e3],
    poolSpeed: 8,
    body: { y: 1, rotate: -2 },
    eyes: { both: { lookX: 4, lookY: -1 } }
  },
  {
    id: "39",
    name: "\u6DF1\u601D\u8003",
    group: "agent",
    desc: "\u95ED\u773C\u6210\u7EBF\uFF0C\u5934\u4F4E\u5782\uFF0C\u73AF\u5E26\u73AF\u7ED5\uFF0C\u547C\u5438\u6781\u7F13",
    en: { name: "Deep thought", desc: "Eyes shut, head down, orbiting ribbon, very slow breath" },
    transition: 600,
    gaze: false,
    pool: [4],
    poolMs: [5e3, 8e3],
    blinkMs: null,
    openness: 0.1,
    body: { y: 5, rotate: 3, orbit: 1, breathe: 5e-3, color: "#DCE2EC" },
    eyes: { both: { lookY: 3 } }
  },
  {
    id: "40",
    name: "\u7EC4\u7EC7\u8BED\u8A00",
    group: "agent",
    desc: "\u773C\u73AF\u534A\u5F00\uFF0C\u76EE\u5149\u5FAE\u6E38\u79FB\uFF0C\u547C\u5438\u6709\u8282\u5F8B",
    en: { name: "Composing", desc: "Half-open eyes, slight gaze drift, rhythmic breath" },
    transition: 350,
    gaze: true,
    pool: [8],
    poolMs: [2500, 4e3],
    blinkMs: [3500, 7e3],
    eyes: { both: { lookY: 1 } },
    anims: [
      { target: "eyes", prop: "lookX", type: "sine", amp: 2, period: 3200 },
      { target: "body", prop: "scale", type: "pulse", amp: 0.01, period: 2e3 }
    ]
  },
  {
    id: "41",
    name: "\u56DE\u987E",
    group: "agent",
    desc: "\u772F\u773C\u5411\u4E0A\u671B\uFF0C\u76EE\u5149\u56DE\u987E\uFF0C\u547C\u5438\u7F13\u6162",
    en: { name: "Reviewing", desc: "Squinting upward, recollecting, slow breath" },
    transition: 450,
    gaze: true,
    pool: [3, 14],
    poolMs: [3e3, 5e3],
    blinkMs: [4e3, 8e3],
    eyes: { both: { lookY: -4 } },
    anims: [{ target: "eyes", prop: "lookX", type: "glance", amp: 3, period: 4e3 }]
  }
];

// src/renderer.ts
var SVGNS = "http://www.w3.org/2000/svg";
function defaultPose() {
  return {
    body: { ...DEFAULT_BODY },
    left: { ...DEFAULT_EYE },
    right: { ...DEFAULT_EYE }
  };
}
function clonePose(p) {
  return {
    body: { ...p.body },
    left: { ...p.left },
    right: { ...p.right }
  };
}
function el(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}
function r2(v) {
  return Math.round(v * 100) / 100;
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
var CONFETTI_COLORS = ["#f9705c", "#5b95f0", "#3fbe86", "#f5b13f", "#9a72ee", "#35c3bd"];
var BallRenderer = class {
  id;
  lite;
  rings;
  shapeRing;
  bodyPath;
  head;
  eyeL;
  eyeR;
  defs;
  fxBack;
  fxFront;
  bodyG;
  stopA;
  stopB;
  stopC;
  curColor = DEFAULT_BODY.color;
  curSketch = 0;
  zzzNodes = null;
  cheekL;
  cheekR;
  baseC;
  // 彩带
  trails = [];
  planes = [];
  planeG = 4;
  baseHue = 0;
  spawnIdx = 0;
  wasFast = false;
  prevYaw = 0;
  prevNow = 0;
  confPieces = [];
  silRows = [];
  silMinY = 1e9;
  silMaxY = -1e9;
  // SVG 骨架引用
  svg;
  constructor(container, opts = {}) {
    this.id = "eb" + Math.random().toString(36).slice(2, 9);
    this.lite = !!opts.lite;
    this.rings = genEyeRings();
    const shapeName = opts.shape || "blob";
    if (shapeName === "blob") {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C, 108, 0.012);
    } else if (shapeName === "wedge") {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C + 12, 100, 0);
    } else {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C, 100, 0.04);
    }
    for (const p of this.shapeRing) {
      if (p[1] < this.silMinY) this.silMinY = p[1];
      if (p[1] > this.silMaxY) this.silMaxY = p[1];
    }
    this.buildSil();
    const svg = el("svg", {
      viewBox: "-16 -16 252 252",
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": opts.label || "AI emotion ball"
    });
    svg.style.display = "block";
    svg.style.overflow = "visible";
    this.svg = svg;
    const defs = el("defs", {});
    this.defs = defs;
    const grad = el("radialGradient", { id: this.id + "g", cx: "38%", cy: "30%", r: "78%" });
    this.stopA = el("stop", { offset: "0%" });
    this.stopB = el("stop", { offset: "55%" });
    this.stopC = el("stop", { offset: "100%" });
    grad.appendChild(this.stopA);
    grad.appendChild(this.stopB);
    grad.appendChild(this.stopC);
    defs.appendChild(grad);
    const rim = el("radialGradient", { id: this.id + "r", cx: "50%", cy: "50%", r: "50%" });
    const rimA = el("stop", { offset: "70%" });
    const rimB = el("stop", { offset: "100%" });
    rimA.setAttribute("stop-color", "rgba(0,0,0,0)");
    rimB.setAttribute("stop-color", "rgba(0,0,0,0.18)");
    rim.appendChild(rimA);
    rim.appendChild(rimB);
    defs.appendChild(rim);
    svg.appendChild(defs);
    this.fxBack = el("g", { "pointer-events": "none" });
    svg.appendChild(this.fxBack);
    this.bodyG = el("g", {});
    this.head = el("path", {
      d: ringPath(this.shapeRing),
      fill: "url(#" + this.id + "g)",
      stroke: "none",
      "stroke-width": "2"
    });
    this.bodyG.appendChild(this.head);
    const rimLayer = el("path", {
      d: ringPath(this.shapeRing),
      fill: "url(#" + this.id + "r)",
      stroke: "none",
      "pointer-events": "none"
    });
    this.bodyG.appendChild(rimLayer);
    const gloss = el("path", {
      d: ringPath(this.shapeRing),
      fill: "url(#" + this.id + "g)",
      stroke: "none",
      opacity: "0.5",
      "pointer-events": "none",
      transform: "translate(0 0) scale(0.92)",
      "transform-origin": "110px 110px"
    });
    gloss.style.mixBlendMode = "overlay";
    this.bodyG.appendChild(gloss);
    this.eyeL = this.buildEye(0);
    this.eyeR = this.buildEye(1);
    this.bodyG.appendChild(this.eyeL.node);
    this.bodyG.appendChild(this.eyeR.node);
    this.bodyG.appendChild(this.eyeL.highlight);
    this.bodyG.appendChild(this.eyeR.highlight);
    this.cheekL = el("ellipse", {
      cx: String(HEAD_C - 32),
      cy: String(HEAD_C + 18),
      rx: "9",
      ry: "5",
      fill: "rgba(244,114,108,0.5)",
      stroke: "none",
      opacity: "0",
      "pointer-events": "none"
    });
    this.cheekR = el("ellipse", {
      cx: String(HEAD_C + 32),
      cy: String(HEAD_C + 18),
      rx: "9",
      ry: "5",
      fill: "rgba(244,114,108,0.5)",
      stroke: "none",
      opacity: "0",
      "pointer-events": "none"
    });
    this.bodyG.appendChild(this.cheekL);
    this.bodyG.appendChild(this.cheekR);
    svg.appendChild(this.bodyG);
    this.fxFront = el("g", { "pointer-events": "none" });
    svg.appendChild(this.fxFront);
    this.baseC = [centroid(this.rings[0].L), centroid(this.rings[0].R)];
    if (!this.lite) {
      this.zzzNodes = [];
      for (let i = 0; i < 3; i++) {
        const zn = el("text", {
          x: "0",
          y: "0",
          fill: "#A8A296",
          opacity: "0",
          "font-family": "'Space Grotesk', 'Noto Sans SC', sans-serif",
          "font-weight": "700",
          "font-style": "italic",
          "text-anchor": "middle"
        });
        zn.textContent = "z";
        this.fxFront.appendChild(zn);
        this.zzzNodes.push(zn);
      }
    }
    const c = opts.color || DEFAULT_BODY.color;
    this.setBodyColor(c);
    container.appendChild(svg);
  }
  buildEye(k) {
    const ring = k === 0 ? this.rings[0].L : this.rings[0].R;
    const node = el("path", { fill: "#1A1A1A", stroke: "none", "stroke-width": "1.6" });
    node.setAttribute("d", ringPath(ring));
    const highlight = el("ellipse", {
      rx: "2.4",
      ry: "3.2",
      fill: "rgba(255,255,255,0.85)",
      stroke: "none",
      "pointer-events": "none"
    });
    return { node, ring, c: centroid(ring), highlight };
  }
  buildSil() {
    const SIL_STEP = 2;
    const rows = Math.ceil((this.silMaxY - this.silMinY) / SIL_STEP) + 1;
    const out = [];
    for (let r = 0; r < rows; r++) {
      const y = this.silMinY + r * SIL_STEP;
      let lo = 1e9, hi = -1e9;
      for (let e = 0; e < this.shapeRing.length; e++) {
        const a = this.shapeRing[e];
        const b = this.shapeRing[(e + 1) % this.shapeRing.length];
        const y0 = a[1], y1 = b[1];
        if (y0 <= y && y1 >= y || y1 <= y && y0 >= y) {
          const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
          const x = a[0] + (b[0] - a[0]) * t;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
      if (lo > hi) {
        lo = HEAD_C - 4;
        hi = HEAD_C + 4;
      }
      out.push([lo, hi]);
    }
    this.silRows = out;
  }
  silAt(y) {
    const r = Math.round((clamp(y, this.silMinY, this.silMaxY) - this.silMinY) / 2);
    return this.silRows[clamp(r, 0, this.silRows.length - 1)];
  }
  setBodyColor(color) {
    if (color === this.curColor) return;
    this.curColor = color;
    this.stopA.setAttribute("stop-color", shade(color, 0.18));
    this.stopB.setAttribute("stop-color", color);
    this.stopC.setAttribute("stop-color", shade(color, -0.25));
  }
  /** 更新眼睛环（外部弹簧插值后传入） */
  setEyeRings(L, R) {
    this.eyeL.ring = L;
    this.eyeR.ring = R;
    this.eyeL.c = centroid(L);
    this.eyeR.c = centroid(R);
  }
  /** 单只眼睛应用 pose + 球面投影 */
  setEye(eye, pose, k, sketch, yaw) {
    eye.node.setAttribute("d", ringPath(eye.ring));
    const base = this.baseC[k];
    const open = clamp(pose.open, 0, 1.2);
    const sy = clamp(pose.scaleY * open, 0.02, 2.4);
    const sxBase = pose.scaleX;
    const halfH = EYE_HALF * sy + 2;
    let ey0 = HEAD_C + (base[1] - HEAD_C) + pose.y + pose.lookY;
    ey0 = clamp(ey0, this.silMinY + halfH, this.silMaxY - halfH);
    const sil = this.silAt(ey0);
    const cx0 = (sil[0] + sil[1]) / 2;
    const hw = Math.max((sil[1] - sil[0]) / 2, 12);
    const eyeCx = eye.c[0];
    const ox = eyeCx - HEAD_C + pose.x + pose.lookX;
    const theta = clamp(ox / hw, -1.15, 1.15);
    const total = theta + (yaw || 0);
    const cn = Math.cos(total);
    if (cn <= 0.02) {
      ;
      eye.node.style.display = "none";
      eye.highlight.style.display = "none";
      return;
    }
    ;
    eye.node.style.display = "";
    const ex = cx0 + hw * Math.sin(total) * 0.985;
    const dyN = (ey0 - HEAD_C) / 130;
    const fy = Math.sqrt(1 - dyN * dyN * 0.22);
    eye.node.setAttribute(
      "transform",
      "translate(" + r2(ex) + " " + r2(ey0) + ")" + (pose.rotate ? " rotate(" + r2(pose.rotate) + ")" : "") + " scale(" + r2(sxBase * cn) + " " + r2(sy * fy) + ") translate(" + r2(-eyeCx) + " " + r2(-eye.c[1]) + ")"
    );
    const open2 = clamp(pose.open, 0, 1.2);
    if (open2 < 0.3) {
      ;
      eye.highlight.style.display = "none";
    } else {
      ;
      eye.highlight.style.display = "";
      const hx = ex - sxBase * cn * 4 + pose.lookX * 0.3;
      const hy = ey0 - sy * fy * 5 + pose.lookY * 0.3;
      eye.highlight.setAttribute("cx", r2(hx));
      eye.highlight.setAttribute("cy", r2(hy));
      eye.highlight.setAttribute("rx", r2(2.4 * sxBase * cn));
      eye.highlight.setAttribute("ry", r2(3.2 * sy * fy * open2));
    }
    const fill = sketch > 0.5 ? "none" : pose.color;
    const stroke = sketch > 0.5 ? pose.color : "none";
    if (fill !== eye.lastFill) {
      eye.node.setAttribute("fill", fill);
      eye.lastFill = fill;
    }
    if (stroke !== eye.lastStroke) {
      eye.node.setAttribute("stroke", stroke);
      eye.lastStroke = stroke;
    }
  }
  /**
   * 每帧应用 pose。
   * 返回 yaw 供彩带判断。
   */
  applyPose(pose, yaw = 0) {
    const b = pose.body;
    const now = performance.now();
    const sketch = 0;
    this.bodyG.setAttribute(
      "transform",
      "translate(" + r2(HEAD_C + b.x) + " " + r2(HEAD_C + b.y) + ") rotate(" + r2(b.rotate || 0) + ") scale(" + r2(b.scale) + ") translate(" + r2(-HEAD_C) + " " + r2(-HEAD_C) + ")"
    );
    this.setBodyColor(b.color);
    const [r, g, bl] = hexToRgb(b.color);
    const isWarm = r > g + 10 && r > bl + 10;
    const cheekOp = isWarm ? 0.55 : 0;
    this.cheekL.setAttribute("opacity", String(cheekOp));
    this.cheekR.setAttribute("opacity", String(cheekOp));
    this.setEye(this.eyeL, pose.left, 0, sketch, yaw);
    this.setEye(this.eyeR, pose.right, 1, sketch, yaw);
    if (this.lite) return yaw;
    const dt = this.prevNow ? clamp((now - this.prevNow) / 1e3, 1e-3, 0.05) : 1 / 60;
    this.prevNow = now;
    if (this.zzzNodes) {
      const zOn = (b.zzz || 0) > 0;
      for (let z = 0; z < this.zzzNodes.length; z++) {
        const zn = this.zzzNodes[z];
        if (!zOn) {
          if (zn.getAttribute("opacity") !== "0") zn.setAttribute("opacity", "0");
          continue;
        }
        const zp = (now * 33e-5 + z / 3) % 1;
        const zo = (zp < 0.18 ? zp / 0.18 : 1 - (zp - 0.18) / 0.82) * 0.8 * b.zzz;
        zn.setAttribute("opacity", zo.toFixed(3));
        zn.setAttribute("font-size", (12 + zp * 11).toFixed(1));
        zn.setAttribute(
          "transform",
          "translate(" + r2(180 + zp * 34 + 4 * Math.sin(zp * 9)) + " " + r2(48 - zp * 42) + ") rotate(" + r2(-10 + zp * 14) + ")"
        );
      }
    }
    this.updateTrails(dt);
    this.updateConfetti(dt);
    return yaw;
  }
  /** 设置目光（归一化 [-1,1]） */
  setGaze(nx, ny) {
  }
  // ============ 彩带 ============
  spawnTrailSpin(yawVel) {
    if (Math.abs(yawVel) < 2) return;
    if (!this.wasFast) {
      this.makePlanes();
      this.wasFast = true;
    }
    this.spawnTrail(this.prevYaw, yawVel > 0 ? 1 : -1);
  }
  makePlanes() {
    const base = rand(-0.85, 0.85);
    this.planes = [{ tilt: rand(0.16, 0.5), roll: base + rand(-0.12, 0.12) }];
    this.planeG = Math.round(rand(3, 5));
    this.baseHue = rand(0, 360);
    this.spawnIdx = 0;
  }
  spawnTrail(lam0, dir) {
    if (this.trails.length > 8) return;
    const pl = this.planes[0];
    const tierStep = 38 / Math.max(this.planeG - 1, 1);
    const rw = this.planeG <= 3 ? rand(8, 10.5) : this.planeG === 4 ? rand(6.6, 8.6) : rand(5.6, 7.4);
    this.createTrail({
      o: {
        lam: lam0,
        lamVel: dir * rand(0.5, 1.1),
        tilt: pl.tilt + rand(-0.04, 0.04),
        roll: pl.roll + rand(-0.05, 0.05),
        rad: 116 + this.spawnIdx * tierStep + rand(-1.5, 1.5),
        radVel: rand(0, 2.5),
        follow: rand(0.74, 0.94),
        carry: 0,
        arc: rand(2.2, 3.4)
      },
      r: rw,
      hue: this.baseHue + 360 * this.spawnIdx / Math.max(this.planeG, 1) + rand(-14, 14)
    });
    this.spawnIdx++;
  }
  spawnOrbit(idx) {
    this.createTrail({
      orbit: true,
      o: {
        lam: rand(0, TAU),
        lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.7, 2.3),
        tilt: rand(0.1, 0.22),
        roll: rand(-0.12, 0.12),
        rad: 124 + idx * 16,
        radVel: 0,
        follow: 0.8,
        carry: 0,
        arc: rand(2.4, 3.2)
      },
      r: rand(5.5, 7),
      hue: rand(0, 360)
    });
  }
  createTrail(cfg) {
    if (this.trails.length > 8) return;
    const gid = this.id + "tg" + Math.random().toString(36).slice(2, 7);
    const gradEl = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse" });
    const stops = [];
    for (let s = 0; s < 5; s++) {
      const st = el("stop", { offset: (s / 4).toFixed(3) });
      gradEl.appendChild(st);
      stops.push(st);
    }
    this.defs.appendChild(gradEl);
    const fill = "url(#" + gid + ")";
    const back = el("path", { stroke: "none", fill, opacity: "0" });
    const front = el("path", { stroke: "none", fill, opacity: "0" });
    this.fxBack.appendChild(back);
    this.fxFront.appendChild(front);
    this.trails.push({
      o: cfg.o,
      r: cfg.r,
      life: 0,
      ret: 0,
      hist: [],
      orbitMode: !!cfg.orbit,
      hue: cfg.hue,
      hueSpan: rand(45, 95) * (Math.random() < 0.5 ? 1 : -1),
      hueVel: rand(18, 42) * (Math.random() < 0.5 ? 1 : -1),
      gradEl,
      stops,
      back,
      front
    });
  }
  updateTrails(dt) {
    const now = performance.now();
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      const o = t.o;
      o.lam += o.lamVel * dt;
      o.rad += o.radVel * dt;
      o.lamVel *= 0.99;
      o.radVel *= 0.96;
      const p = this.orbitPoint(o, o.lam);
      t.hist.unshift(p);
      const maxHist = 22;
      if (t.hist.length > maxHist) t.hist.length = maxHist;
      t.hue += t.hueVel * dt;
      for (let s = 0; s < t.stops.length; s++) {
        const local = t.hue + s / (t.stops.length - 1) * t.hueSpan;
        const col = this.hslToHex(local % 360, 0.68, 0.55);
        t.stops[s].setAttribute("stop-color", col);
      }
      const a = t.gradEl.getAttribute("id");
      const first = t.hist[0];
      const last = t.hist[t.hist.length - 1] || first;
      t.gradEl.setAttribute("x1", String(r2(first.x)));
      t.gradEl.setAttribute("y1", String(r2(first.y)));
      t.gradEl.setAttribute("x2", String(r2(last.x)));
      t.gradEl.setAttribute("y2", String(r2(last.y)));
      const d = this.trailPath(t.hist, t.r);
      t.front.setAttribute("d", d);
      t.front.setAttribute("opacity", String(t.orbitMode ? 0.85 : Math.max(0, 1 - t.life / 3)));
      t.back.setAttribute("d", d);
      t.back.setAttribute("opacity", String(t.orbitMode ? 0.4 : Math.max(0, 0.5 - t.life / 3)));
      if (!t.orbitMode) {
        t.life += dt;
        if (t.life > 3 && t.hist.length <= 1) {
          this.fxBack.removeChild(t.back);
          this.fxFront.removeChild(t.front);
          t.gradEl.remove();
          this.trails.splice(i, 1);
        } else if (t.life > 0.4) {
          t.hist.pop();
        }
      }
    }
  }
  trailPath(hist, r) {
    if (hist.length < 2) return "";
    let s = "M";
    for (let i = 0; i < hist.length; i++) {
      const p = hist[i];
      const w = r * (1 - i / hist.length * 0.7);
      s += (i ? "L" : "") + p.x.toFixed(2) + " " + p.y.toFixed(2);
      if (i === 0) s += " L" + (p.x + w).toFixed(2) + " " + p.y.toFixed(2);
    }
    return s;
  }
  orbitPoint(o, lam) {
    const hx = o.rad * Math.sin(lam);
    const hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt);
    const ca = Math.cos(o.roll), sa = Math.sin(o.roll);
    return {
      x: HEAD_C + hx * ca - hy * sa,
      y: HEAD_C + hx * sa + hy * ca,
      z: Math.cos(lam) * Math.cos(o.tilt),
      l: lam
    };
  }
  hslToHex(h, s, l) {
    h /= 360;
    const k = (n) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return shade(
      "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join(""),
      0
    );
  }
  // ============ 撒花 ============
  burst(n) {
    if (this.lite) return;
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU);
      const spd = rand(40, 110);
      this.confPieces.push({
        x: HEAD_C + Math.cos(ang) * rand(96, 116),
        y: HEAD_C + Math.sin(ang) * rand(96, 116),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(20, 75),
        life: 0,
        max: rand(1.2, 2.4),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        r: rand(3, 5),
        star: Math.random() < 0.25,
        node: null
      });
    }
  }
  updateConfetti(dt) {
    for (let i = this.confPieces.length - 1; i >= 0; i--) {
      const p = this.confPieces[i];
      p.life += dt;
      if (p.life > p.max) {
        if (p.node) {
          p.node.remove();
        }
        this.confPieces.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.vx *= 0.99;
      const op = Math.max(0, 1 - p.life / p.max);
      if (!p.node) {
        p.node = el("path", {
          d: this.starPath(),
          fill: p.color,
          opacity: String(op)
        });
        this.fxFront.appendChild(p.node);
      }
      p.node.setAttribute("opacity", String(op));
      p.node.setAttribute("transform", "translate(" + r2(p.x) + " " + r2(p.y) + ") rotate(" + r2(p.life * 220) + ") scale(" + r2(p.r / 4) + ")");
    }
  }
  starPath() {
    const pts = [];
    for (let e = 0; e < 10; e++) {
      const a = -Math.PI / 2 + e * Math.PI / 5;
      const r = e % 2 === 0 ? 1 : 0.42;
      pts.push((Math.cos(a) * r).toFixed(3) + " " + (Math.sin(a) * r).toFixed(3));
    }
    return "M" + pts.join("L") + "Z";
  }
  destroy() {
    this.svg.remove();
  }
};

// src/engine.ts
function spring(v0) {
  return { x: v0, v: 0, t: v0 };
}
function animVal(a, t, dt) {
  const p = a.period || 2e3;
  const ph = (a.phase || 0) * p;
  switch (a.type) {
    case "sine":
      return Math.sin(t / p * TAU + ph) * (a.amp || 0);
    case "glance": {
      const u = t % p / p;
      const g = u < 0.25 ? 1 : u < 0.5 ? 1 - (u - 0.25) * 8 : u < 0.75 ? -1 : -1 + (u - 0.75) * 8;
      return g * (a.amp || 0);
    }
    case "scan": {
      const u = t % p / p;
      return (u < 0.5 ? u * 2 : 2 - u * 2) * 2 - 1 * (a.amp || 0);
    }
    case "jitter": {
      const s = a.speed || 1;
      const n = Math.sin(t * s * 7.3) * 0.6 + Math.sin(t * s * 13.1) * 0.3 + Math.sin(t * s * 23.7) * 0.1;
      const dec = a.decay ? Math.max(0, 1 - t / a.decay) : 1;
      return n * (a.amp || 0) * dec;
    }
    case "pulse": {
      const u = t % p / p;
      return (u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2) * (a.amp || 0);
    }
    case "blink":
      return 0;
  }
  return 0;
}
var EmotionEngine = class {
  renderer;
  emotions = /* @__PURE__ */ new Map();
  curId;
  fallbackId;
  curPose;
  targetPose;
  eyeSpringL = [];
  eyeSpringR = [];
  bodySpring = {
    x: spring(0),
    y: spring(0),
    scale: spring(1),
    rotate: spring(0)
  };
  rings = genEyeRings();
  curRingIdx = 0;
  targetRingIdx = 0;
  ringT = 1;
  poolTimer = 0;
  poolNext = 3e3;
  blinkTimer = 0;
  blinkNext = 5e3;
  blinkPhase = 0;
  animStartT = 0;
  transT = 1;
  transFrom = defaultPose();
  transTo = defaultPose();
  sequence = null;
  seqT = 0;
  anticsTimer = 0;
  idleTimer = 0;
  idleEnabled;
  gazeX = 0;
  gazeY = 0;
  yaw = 0;
  yawVel = 0;
  running = false;
  active = true;
  lastT = 0;
  cbs = {};
  constructor(container, opts = {}) {
    this.renderer = new BallRenderer(container, {
      shape: opts.shape,
      color: opts.color,
      eyeColor: opts.eyeColor,
      eyeScale: opts.eyeScale,
      lite: opts.lite,
      label: opts.label
    });
    for (const e of EMOTION_SEED) this.emotions.set(e.id, e);
    this.fallbackId = opts.fallbackId || "02";
    this.curId = opts.emotion || "02";
    this.idleEnabled = opts.idle ?? false;
    this.curPose = defaultPose();
    this.targetPose = this.computePose(this.curId);
    this.curPose = clonePose(this.targetPose);
    this.initSprings();
    this.enterEmotion(this.curId, false);
    if (opts.autostart !== false) {
      this.start();
    } else {
      this.renderer.setEyeRings(this.rings[this.curRingIdx].L, this.rings[this.curRingIdx].R);
      this.renderer.applyPose(this.curPose, 0);
    }
  }
  initSprings() {
    this.eyeSpringL = [];
    this.eyeSpringR = [];
    for (const r of this.rings) {
      const cL = this.ringCentroid(r.L);
      const cR = this.ringCentroid(r.R);
      this.eyeSpringL.push({
        x: spring(cL[0]),
        y: spring(cL[1])
      });
      this.eyeSpringR.push({
        x: spring(cR[0]),
        y: spring(cR[1])
      });
    }
  }
  ringCentroid(ring) {
    let x = 0, y = 0;
    for (const p of ring) {
      x += p[0];
      y += p[1];
    }
    return [x / ring.length, y / ring.length];
  }
  /** 计算某个情绪的基础 pose */
  computePose(id) {
    const def = this.emotions.get(id) || this.emotions.get(this.fallbackId);
    const p = defaultPose();
    if (def.body) Object.assign(p.body, def.body);
    if (def.eyes?.both) {
      Object.assign(p.left, def.eyes.both);
      Object.assign(p.right, def.eyes.both);
    }
    if (def.eyes?.left) Object.assign(p.left, def.eyes.left);
    if (def.eyes?.right) Object.assign(p.right, def.eyes.right);
    if (def.openness !== void 0) {
      p.left.open = def.openness;
      p.right.open = def.openness;
    }
    if (def.pool.length > 0) {
      this.targetRingIdx = def.pool[0];
      if (this.ringT >= 1) this.curRingIdx = this.targetRingIdx;
    }
    return p;
  }
  enterEmotion(id, auto) {
    const def = this.emotions.get(id);
    if (!def) {
      this.emit("error", { message: `Unknown emotionId: ${id}`, fallback: this.fallbackId });
      this.enterEmotion(this.fallbackId, true);
      return;
    }
    this.curId = id;
    this.transFrom = clonePose(this.curPose);
    this.targetPose = this.computePose(id);
    this.transTo = clonePose(this.targetPose);
    this.transT = 0;
    this.animStartT = performance.now();
    this.poolTimer = 0;
    this.poolNext = def.poolMs ? this.randRange(def.poolMs[0], def.poolMs[1]) : 99999;
    this.blinkNext = def.blinkMs ? this.randRange(def.blinkMs[0], def.blinkMs[1]) : 99999;
    this.blinkTimer = 0;
    this.sequence = def.sequence || null;
    this.seqT = 0;
    this.idleTimer = 0;
    if (def.body?.ribbons) this.renderer.spawnTrailSpin(4);
    if (def.body?.confetti) this.renderer.burst(24);
    if (def.body?.orbit) {
      this.renderer.spawnOrbit(0);
      this.renderer.spawnOrbit(1);
    }
    this.emit("change", { id, def, auto });
  }
  randRange(a, b) {
    return a + Math.random() * (b - a);
  }
  // ============ 对外 API ============
  setEmotion(id) {
    this.enterEmotion(id, false);
  }
  handleAIMessage(msg) {
    let obj;
    if (typeof msg === "string") {
      try {
        obj = JSON.parse(msg);
      } catch {
        this.emit("error", { message: "JSON parse failed" });
        this.enterEmotion(this.fallbackId, true);
        return;
      }
    } else obj = msg;
    const eid = obj.emotionId || obj.emotion;
    if (eid && this.emotions.has(String(eid))) {
      this.enterEmotion(String(eid), true);
      if (obj.tips) this.emit("tips", { text: obj.tips });
    } else {
      this.emit("error", { message: `Unknown/missing emotionId: ${eid}`, fallback: this.fallbackId });
      this.enterEmotion(this.fallbackId, true);
    }
  }
  setGaze(nx, ny) {
    this.gazeX = clamp(nx, -1, 1);
    this.gazeY = clamp(ny, -1, 1);
  }
  setActive(v) {
    this.active = v;
  }
  on(ev, cb) {
    (this.cbs[ev] = this.cbs[ev] || []).push(cb);
  }
  emit(ev, data) {
    (this.cbs[ev] || []).forEach((cb) => cb(data));
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this.lastT) / 1e3, 1e-3, 0.05);
      this.lastT = now;
      if (this.active) this.frame(dt, now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  destroy() {
    this.running = false;
    this.renderer.destroy();
  }
  // ============ 主循环 ============
  frame(dt, now) {
    const def = this.emotions.get(this.curId);
    if (this.transT < 1) {
      this.transT = Math.min(1, this.transT + dt * 1e3 / (def.transition || 400));
      const e = this.easeInOut(this.transT);
      this.curPose.body = this.lerpBody(this.transFrom.body, this.transTo.body, e);
      this.curPose.left = this.lerpEye(this.transFrom.left, this.transTo.left, e);
      this.curPose.right = this.lerpEye(this.transFrom.right, this.transTo.right, e);
    } else {
      this.curPose.body = { ...this.targetPose.body };
      this.curPose.left = { ...this.targetPose.left };
      this.curPose.right = { ...this.targetPose.right };
    }
    this.poolTimer += dt * 1e3;
    if (def.pool.length > 1 && this.poolTimer > this.poolNext) {
      this.poolTimer = 0;
      this.poolNext = this.randRange(def.poolMs[0], def.poolMs[1]);
      const others = def.pool.filter((i) => i !== this.targetRingIdx);
      const next = others[Math.floor(Math.random() * others.length)];
      this.targetRingIdx = next;
      this.ringT = 0;
    }
    if (this.ringT < 1) {
      this.ringT = Math.min(1, this.ringT + dt * (def.poolSpeed || 6));
      const e = this.easeInOut(this.ringT);
      const L = this.lerpRingPts(this.rings[this.curRingIdx].L, this.rings[this.targetRingIdx].L, e);
      const R = this.lerpRingPts(this.rings[this.curRingIdx].R, this.rings[this.targetRingIdx].R, e);
      this.renderer.setEyeRings(L, R);
      if (this.ringT >= 1) this.curRingIdx = this.targetRingIdx;
    } else {
      this.renderer.setEyeRings(this.rings[this.curRingIdx].L, this.rings[this.curRingIdx].R);
    }
    const animOff = { eyeX: 0, eyeY: 0, eyeOpen: 0, bodyX: 0, bodyY: 0, bodyScale: 0 };
    if (def.anims) {
      const t = (now - this.animStartT) / 1e3;
      for (const a of def.anims) {
        const v = animVal(a, t, dt);
        if (a.target === "eyes") {
          if (a.prop === "lookX") animOff.eyeX += v;
          else if (a.prop === "lookY") animOff.eyeY += v;
          else if (a.prop === "x") animOff.eyeX += v;
          else if (a.prop === "y") animOff.eyeY += v;
          else if (a.prop === "open") animOff.eyeOpen += v;
        } else if (a.target === "body") {
          if (a.prop === "x") animOff.bodyX += v;
          else if (a.prop === "y") animOff.bodyY += v;
          else if (a.prop === "scale") animOff.bodyScale += v;
        }
      }
    }
    this.curPose.left.lookX = this.targetPose.left.lookX + animOff.eyeX;
    this.curPose.left.lookY = this.targetPose.left.lookY + animOff.eyeY;
    this.curPose.right.lookX = this.targetPose.right.lookX + animOff.eyeX;
    this.curPose.right.lookY = this.targetPose.right.lookY + animOff.eyeY;
    this.curPose.body.x = this.targetPose.body.x + animOff.bodyX;
    this.curPose.body.y = this.targetPose.body.y + animOff.bodyY;
    const breathe = def.body?.breathe || 0.01;
    this.curPose.body.scale = this.targetPose.body.scale + animOff.bodyScale + Math.sin(now * 15e-4) * breathe;
    if (def.gaze) {
      this.curPose.left.lookX += this.gazeX * 8;
      this.curPose.left.lookY += this.gazeY * 5;
      this.curPose.right.lookX += this.gazeX * 8;
      this.curPose.right.lookY += this.gazeY * 5;
    }
    if (def.blinkMs) {
      this.blinkTimer += dt * 1e3;
      if (this.blinkTimer > this.blinkNext) {
        this.blinkTimer = 0;
        this.blinkNext = this.randRange(def.blinkMs[0], def.blinkMs[1]);
        this.blinkPhase = 1;
      }
      if (this.blinkPhase > 0) {
        this.blinkPhase = Math.max(0, this.blinkPhase - dt * 8);
        const b = Math.sin((1 - this.blinkPhase) * Math.PI);
        const factor = 1 - b * 0.9;
        this.curPose.left.open = this.targetPose.left.open * factor;
        this.curPose.right.open = this.targetPose.right.open * factor;
      } else {
        this.curPose.left.open = this.targetPose.left.open;
        this.curPose.right.open = this.targetPose.right.open;
      }
    }
    if (this.sequence) {
      this.seqT += dt;
      const frames = this.sequence.frames || [];
      for (const f of frames) {
        if (this.seqT * 1e3 >= f.at) {
          if (f.eyes?.both) {
            Object.assign(this.curPose.left, f.eyes.both);
            Object.assign(this.curPose.right, f.eyes.both);
          }
          if (f.eyes?.left) Object.assign(this.curPose.left, f.eyes.left);
          if (f.eyes?.right) Object.assign(this.curPose.right, f.eyes.right);
          if (f.body) Object.assign(this.curPose.body, f.body);
        }
      }
      const last = frames[frames.length - 1];
      if (last && this.seqT * 1e3 > last.at + 600) {
        const settle = this.sequence.settle;
        if (settle === "base") {
          this.targetRingIdx = def.pool[0] || 0;
          this.ringT = 0;
        } else if (settle === "hold") {
        } else if (settle && settle.next) {
          this.enterEmotion(settle.next, true);
        }
        this.sequence = null;
      }
    }
    if (def.antics) {
      this.anticsTimer += dt;
      if (this.anticsTimer > this.randRange(9, 18)) {
        this.anticsTimer = 0;
        if (Math.random() < 0.5) this.yawVel = (Math.random() < 0.5 ? -1 : 1) * 6;
        else this.curPose.body.y -= 20;
      }
    }
    if (this.idleEnabled) {
      this.idleTimer += dt;
      const cfg = typeof this.idleEnabled === "object" ? this.idleEnabled : {};
      const after = cfg.after || 45;
      const to = cfg.to || "00";
      if (this.idleTimer > after && this.curId !== to) {
        this.enterEmotion(to, true);
      }
    }
    this.yaw += this.yawVel * dt;
    this.yawVel *= 0.92;
    if (Math.abs(this.yawVel) > 2) this.renderer.spawnTrailSpin(this.yawVel);
    this.renderer.applyPose(this.curPose, this.yaw);
  }
  easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  lerpBody(a, b, t) {
    return {
      ...a,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      scale: lerp(a.scale, b.scale, t),
      rotate: lerp(a.rotate, b.rotate, t),
      color: lerpColor(a.color, b.color, t),
      breathe: lerp(a.breathe, b.breathe, t),
      ribbons: t > 0.5 ? b.ribbons : a.ribbons,
      confetti: t > 0.5 ? b.confetti : a.confetti,
      zzz: lerp(a.zzz, b.zzz, t),
      orbit: t > 0.5 ? b.orbit : a.orbit
    };
  }
  lerpEye(a, b, t) {
    return {
      ...a,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      scaleX: lerp(a.scaleX, b.scaleX, t),
      scaleY: lerp(a.scaleY, b.scaleY, t),
      rotate: lerp(a.rotate, b.rotate, t),
      open: lerp(a.open, b.open, t),
      color: lerpColor(a.color, b.color, t),
      lookX: lerp(a.lookX, b.lookX, t),
      lookY: lerp(a.lookY, b.lookY, t)
    };
  }
  lerpRingPts(a, b, t) {
    const out = new Array(a.length);
    for (let i = 0; i < a.length; i++) {
      out[i] = [lerp(a[i][0], b[i][0], t), lerp(a[i][1], b[i][1], t)];
    }
    return out;
  }
};

// src/BallView.tsx
var EmotionBallView = React.memo(function EmotionBallView2(props) {
  const {
    emotion = "02",
    shape = "blob",
    color,
    eyeColor,
    eyeScale = 1,
    lite = false,
    size = 200,
    gaze = true,
    onReady,
    onEmotionChange
  } = props;
  const containerRef = React.useRef(null);
  const engineRef = React.useRef(null);
  const onReadyRef = React.useRef(onReady);
  const onChangeRef = React.useRef(onEmotionChange);
  onReadyRef.current = onReady;
  onChangeRef.current = onEmotionChange;
  const themeColor = React.useMemo(() => {
    if (color) return color;
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--primary-500") || getComputedStyle(document.documentElement).getPropertyValue("--primary");
      const s = v.trim();
      if (!s) return "#F3F0EA";
      if (s.startsWith("#")) return s;
      const m = s.match(/(\d+)\s+(\d+)\s+(\d+)/);
      if (m) {
        return "#" + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, "0")).join("");
      }
      return "#F3F0EA";
    } catch {
      return "#F3F0EA";
    }
  }, [color]);
  React.useEffect(() => {
    if (!containerRef.current) return;
    const opts = {
      emotion,
      shape,
      color: themeColor,
      eyeColor,
      eyeScale,
      lite,
      autostart: !lite
      // 画廊静态帧省电，主球动画
    };
    const eng = new EmotionEngine(containerRef.current, opts);
    engineRef.current = eng;
    eng.on("change", (e) => {
      onChangeRef.current?.(e.id);
    });
    onReadyRef.current?.(eng);
    return () => {
      eng.destroy();
      engineRef.current = null;
    };
  }, []);
  React.useEffect(() => {
    engineRef.current?.setEmotion(emotion);
  }, [emotion]);
  React.useEffect(() => {
    if (!gaze) return;
    const el2 = containerRef.current;
    if (!el2) return;
    let raf = 0;
    const onMove = (e) => {
      const r = el2.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width * 2 - 1;
      const ny = (e.clientY - r.top) / r.height * 2 - 1;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => engineRef.current?.setGaze(nx, ny));
    };
    el2.addEventListener("mousemove", onMove);
    const onLeave = () => engineRef.current?.setGaze(0, 0);
    el2.addEventListener("mouseleave", onLeave);
    return () => {
      el2.removeEventListener("mousemove", onMove);
      el2.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [gaze]);
  return React.createElement("div", {
    ref: containerRef,
    style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" },
    "aria-label": "AI emotion ball"
  });
});

// src/aiChatStore.ts
import React2 from "react";
var DEFAULT_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini"
};
var SYS_PROMPT = `\u4F60\u662F Emotion Ball \u6D4B\u8BD5\u52A9\u624B\u3002\u8BF7\u7B80\u77ED\u56DE\u590D\uFF081-2\u53E5\u8BDD\uFF09\u3002\u56DE\u590D\u672B\u5C3E\u5FC5\u987B\u7528\u4E00\u884C [emotion:ID] \u6807\u8BB0\u4F60\u7684\u60C5\u7EEA\uFF0CID \u8303\u56F4\uFF1A
- 00-07: \u751F\u547D\u5468\u671F\uFF0800\u7761\u7720/01\u5524\u9192/02\u5F85\u673A/03\u597D\u5947/04\u503E\u542C/05\u4E13\u6CE8/06\u56F0\u60D1/07\u8D70\u795E\uFF09
- 10-21: \u60C5\u7EEA\uFF0810\u5F00\u5FC3/11\u5927\u7B11/12\u5BB3\u7F9E/13\u60CA\u8BB6/14\u751F\u6C14/15\u60B2\u4F24/16\u5F97\u610F/17\u671F\u5F85/18\u56F0\u60D1\u607C/19\u5BA0\u7231/20\u6FC0\u52A8/21\u6DE1\u5B9A\uFF09
- 30-41: \u4EE3\u7406\u72B6\u6001\uFF0830\u601D\u8003/31\u68C0\u7D22/32\u8BFB\u5199/33\u751F\u6210/34\u6821\u9A8C/35\u51FA\u9519/36\u5B8C\u6210/37\u7B49\u5F85\u8F93\u5165/38\u8C03\u7528\u5DE5\u5177/39\u6DF1\u601D\u8003/40\u7EC4\u7EC7\u8BED\u8A00/41\u56DE\u987E\uFF09
\u4F8B\u5982\uFF1A
\u597D\u7684\uFF0C\u6211\u5E2E\u4F60\u770B\u770B\uFF01
[emotion:10]`;
var SimpleStore = class {
  state;
  listeners = /* @__PURE__ */ new Set();
  constructor() {
    this.state = {
      aiConfig: { ...DEFAULT_CONFIG },
      messages: [{ role: "system", content: SYS_PROMPT }],
      aiStatus: "idle",
      aiError: null,
      emotion: "02",
      streamText: "",
      autoEmotion: true,
      showHistory: false,
      setAiConfig: (patch) => {
        this.state.aiConfig = { ...this.state.aiConfig, ...patch };
        this.emit();
      },
      addMessage: (m) => {
        this.state.messages = [...this.state.messages, m];
        this.emit();
      },
      clearMessages: () => {
        this.state.messages = [{ role: "system", content: SYS_PROMPT }];
        this.emit();
      },
      setAiStatus: (s) => {
        this.state.aiStatus = s;
        this.emit();
      },
      setAiError: (e) => {
        this.state.aiError = e;
        this.emit();
      },
      setEmotion: (id) => {
        this.state.emotion = id;
        this.emit();
      },
      setStreamText: (t) => {
        this.state.streamText = t;
        this.emit();
      },
      appendStreamText: (t) => {
        this.state.streamText = this.state.streamText + t;
        this.emit();
      },
      setAutoEmotion: (b) => {
        this.state.autoEmotion = b;
        this.emit();
      },
      setShowHistory: (b) => {
        this.state.showHistory = b;
        this.emit();
      }
    };
  }
  subscribe = (cb) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = () => this.state;
  emit() {
    this.listeners.forEach((l) => l());
  }
};
var chatStore = new SimpleStore();
function useChatStore() {
  return React2.useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot, chatStore.getSnapshot);
}
function parseEmotionFromText(text) {
  const m = text.match(/\[emotion:([0-9]+)\]/);
  if (!m) return null;
  const id = m[1];
  return EMOTION_SEED.some((e) => e.id === id) ? id : null;
}
function stripEmotionTag(text) {
  return text.replace(/\n?\[emotion:[0-9]+\]/g, "").trim();
}
async function sendChatMessage(config, messages, onChunk, signal) {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: config.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let full = "";
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const tr = line.trim();
      if (!tr || !tr.startsWith("data: ")) continue;
      const data = tr.slice(6);
      if (data === "[DONE]") continue;
      try {
        const p = JSON.parse(data);
        const c = p.choices?.[0]?.delta?.content || "";
        if (c) {
          full += c;
          onChunk(c);
        }
      } catch {
      }
    }
  }
  return full;
}
function groupedEmotions() {
  const groups = {
    life: { label: "\u751F\u547D\u5468\u671F", items: [] },
    emotion: { label: "\u60C5\u7EEA\u53CD\u5E94", items: [] },
    agent: { label: "\u4EE3\u7406\u72B6\u6001", items: [] },
    custom: { label: "\u81EA\u5B9A\u4E49", items: [] }
  };
  for (const e of EMOTION_SEED) {
    groups[e.group]?.items.push(e);
  }
  return Object.entries(groups).map(([k, v]) => ({ group: k, label: v.label, items: v.items }));
}

// src/styles.ts
var injected = false;
function ensurePanelStyles() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.id = "emotion-ball-v2-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}
var STYLES = `
.ebv2-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

.ebv2-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ebv2-title { font-weight: 600; font-size: 14px; letter-spacing: 0.3px; }
.ebv2-header-right { display: flex; align-items: center; gap: 6px; }
.ebv2-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #71717a;
}
.ebv2-status-dot.dot-idle { background: #71717a; }
.ebv2-status-dot.dot-active { background: #3b82f6; animation: ebv2-pulse 1.2s ease-in-out infinite; }
.ebv2-status-dot.dot-error { background: #ef4444; }
.ebv2-status-text { font-size: 11px; color: var(--text-muted, #a1a1aa); }

@keyframes ebv2-pulse {
  0%,100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.ebv2-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 0 10px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ebv2-stage-info { text-align: center; max-width: 240px; }
.ebv2-stage-name { font-size: 13px; font-weight: 600; color: var(--text-primary, #e4e4e7); }
.ebv2-stage-desc { font-size: 11px; color: var(--text-muted, #a1a1aa); line-height: 1.4; margin-top: 2px; }
.ebv2-shape-switch {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.ebv2-shape-btn {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: transparent;
  color: var(--text-muted, #a1a1aa);
  cursor: pointer;
}
.ebv2-shape-btn.active {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.1);
  color: #60a5fa;
}

.ebv2-tabs {
  display: flex;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.ebv2-tab-btn {
  flex: 1;
  padding: 8px 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-muted, #a1a1aa);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
}
.ebv2-tab-btn:hover { color: var(--text-primary, #e4e4e7); background: var(--background-hover, rgba(255,255,255,0.03)); }
.ebv2-tab-btn.active { color: #60a5fa; border-bottom-color: #60a5fa; }

.ebv2-tab-content { flex: 1; overflow-y: auto; padding: 10px; }

/* \u753B\u5ECA */
.ebv2-gallery { display: flex; flex-direction: column; gap: 12px; }
.ebv2-gallery-group-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600;
  color: var(--text-secondary, #a1a1aa);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ebv2-group-dot { width: 6px; height: 6px; border-radius: 50%; }
.ebv2-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 6px;
}
.ebv2-gallery-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  background: var(--background-elevated, rgba(255,255,255,0.03));
  cursor: pointer;
  transition: all 0.15s ease;
}
.ebv2-gallery-card:hover {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.06);
  transform: translateY(-1px);
}
.ebv2-card-id { font-size: 9px; color: var(--text-muted, #71717a); font-family: monospace; }
.ebv2-card-name { font-size: 10px; color: var(--text-secondary, #a1a1aa); text-align: center; }

/* \u5BF9\u8BDD */
.ebv2-chat { display: flex; flex-direction: column; height: 100%; gap: 8px; }
.ebv2-chat-msgs {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 80px; max-height: 320px;
}
.ebv2-chat-msg {
  padding: 6px 10px; border-radius: 8px;
  font-size: 12px; line-height: 1.5;
}
.ebv2-chat-msg.user {
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.12);
  align-self: flex-end; max-width: 85%;
}
.ebv2-chat-msg.assistant {
  background: var(--background-elevated, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  align-self: flex-start; max-width: 85%;
}
.ebv2-chat-msg.streaming { border-color: rgba(6,182,212,0.3); }
.ebv2-chat-role { font-size: 10px; font-weight: 600; color: var(--text-muted, #a1a1aa); margin-bottom: 2px; }
.ebv2-chat-content { word-break: break-word; white-space: pre-wrap; }
.ebv2-chat-empty {
  text-align: center; color: var(--text-muted, #a1a1aa);
  font-size: 12px; padding: 20px; font-style: italic;
}
.ebv2-chat-error {
  padding: 6px 10px; font-size: 11px;
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: 6px; color: #f87171;
}
.ebv2-chat-input-row { display: flex; gap: 6px; align-items: flex-end; }
.ebv2-chat-input {
  flex: 1; padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px; font-family: inherit;
  resize: vertical; min-height: 36px; max-height: 80px;
}
.ebv2-chat-input:focus { outline: none; border-color: rgba(59,130,246,0.4); }
.ebv2-chat-input:disabled { opacity: 0.5; }
.ebv2-chat-actions { display: flex; gap: 4px; }
.ebv2-btn {
  padding: 6px 14px; border-radius: 6px; border: none;
  font-size: 12px; font-weight: 500; cursor: pointer;
  white-space: nowrap; transition: all 0.15s;
}
.ebv2-btn.send { background: #3b82f6; color: white; }
.ebv2-btn.send:hover { background: #2563eb; }
.ebv2-btn.send:disabled { opacity: 0.4; cursor: not-allowed; }
.ebv2-btn.stop { background: #ef4444; color: white; }
.ebv2-btn.stop:hover { background: #dc2626; }
.ebv2-btn-ghost {
  padding: 4px 8px; border-radius: 4px; border: none;
  background: transparent; color: var(--text-muted, #a1a1aa);
  font-size: 11px; cursor: pointer;
}
.ebv2-btn-ghost:hover { background: var(--background-hover, rgba(255,255,255,0.05)); color: var(--text-primary, #e4e4e7); }
.ebv2-chat-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 6px; border-top: 1px solid var(--border, rgba(255,255,255,0.06));
}
.ebv2-checkbox { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted, #a1a1aa); cursor: pointer; }
.ebv2-checkbox input { accent-color: #3b82f6; }

/* \u914D\u7F6E */
.ebv2-config { display: flex; flex-direction: column; gap: 12px; }
.ebv2-config-field { display: flex; flex-direction: column; gap: 4px; }
.ebv2-config-label { font-size: 11px; font-weight: 500; color: var(--text-secondary, #a1a1aa); }
.ebv2-config-input {
  padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  background: var(--background, #0f0f13);
  color: var(--text-primary, #e4e4e7);
  font-size: 12px; font-family: monospace;
}
.ebv2-config-input:focus { outline: none; border-color: rgba(59,130,246,0.4); }
.ebv2-config-hint { font-size: 11px; color: var(--text-muted, #a1a1aa); line-height: 1.4; }
.ebv2-config-presets { padding-top: 8px; border-top: 1px solid var(--border, rgba(255,255,255,0.06)); }
.ebv2-config-preset-title { font-size: 11px; font-weight: 500; color: var(--text-secondary, #a1a1aa); margin-bottom: 6px; }
.ebv2-config-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ebv2-preset-btn {
  padding: 6px 8px; border-radius: 6px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--background-elevated, rgba(255,255,255,0.03));
  color: var(--text-secondary, #a1a1aa);
  font-size: 11px; cursor: pointer;
}
.ebv2-preset-btn:hover { border-color: rgba(59,130,246,0.3); color: var(--text-primary, #e4e4e7); }
.ebv2-preset-btn.active { border-color: #60a5fa; background: rgba(59,130,246,0.08); color: #60a5fa; }
`;

// src/Panel.tsx
ensurePanelStyles();
var GROUP_COLORS = {
  life: "#5b95f0",
  emotion: "#f5b13f",
  agent: "#3fbe86",
  custom: "#9a72ee"
};
function EmotionBallPanel() {
  const s = useChatStore();
  const [tab, setTab] = React3.useState("gallery");
  const [mainEmotion, setMainEmotion] = React3.useState("02");
  const [shape, setShape] = React3.useState("blob");
  const [previewHover, setPreviewHover] = React3.useState(null);
  return React3.createElement(
    "div",
    { className: "ebv2-panel" },
    // Header
    React3.createElement(
      "div",
      { className: "ebv2-header" },
      React3.createElement("span", { className: "ebv2-title" }, "Emotion Ball v2"),
      React3.createElement(
        "div",
        { className: "ebv2-header-right" },
        React3.createElement("span", {
          className: "ebv2-status-dot " + (s.aiStatus === "error" ? "dot-error" : s.aiStatus === "streaming" || s.aiStatus === "connecting" ? "dot-active" : "dot-idle")
        }),
        React3.createElement(
          "span",
          { className: "ebv2-status-text" },
          s.aiStatus === "idle" ? "\u7A7A\u95F2" : s.aiStatus === "connecting" ? "\u8FDE\u63A5\u4E2D" : s.aiStatus === "streaming" ? "\u8F93\u51FA\u4E2D" : "\u9519\u8BEF"
        )
      )
    ),
    // 主球展示区
    React3.createElement(
      "div",
      { className: "ebv2-stage" },
      React3.createElement(EmotionBallView, {
        emotion: s.aiStatus === "streaming" || s.aiStatus === "connecting" ? s.emotion : mainEmotion,
        shape,
        size: 180,
        gaze: true,
        onEmotionChange: (id) => setMainEmotion(id)
      }),
      React3.createElement(
        "div",
        { className: "ebv2-stage-info" },
        React3.createElement(
          "div",
          { className: "ebv2-stage-name" },
          (EMOTION_SEED.find((e) => e.id === (s.aiStatus === "streaming" || s.aiStatus === "connecting" ? s.emotion : mainEmotion)) || EMOTION_SEED[0]).name
        ),
        React3.createElement(
          "div",
          { className: "ebv2-stage-desc" },
          (EMOTION_SEED.find((e) => e.id === (s.aiStatus === "streaming" || s.aiStatus === "connecting" ? s.emotion : mainEmotion)) || EMOTION_SEED[0]).desc
        )
      ),
      // 形态切换
      React3.createElement(
        "div",
        { className: "ebv2-shape-switch" },
        ["blob", "wedge", "gem"].map(
          (sh) => React3.createElement("button", {
            key: sh,
            className: "ebv2-shape-btn " + (shape === sh ? "active" : ""),
            onClick: () => setShape(sh)
          }, sh === "blob" ? "\u5706\u80D6" : sh === "wedge" ? "\u4E09\u89D2" : "\u83F1\u5F62")
        )
      )
    ),
    // Tabs
    React3.createElement(
      "div",
      { className: "ebv2-tabs" },
      React3.createElement(TabBtn, { active: tab === "gallery", onClick: () => setTab("gallery") }, "\u753B\u5ECA"),
      React3.createElement(TabBtn, { active: tab === "chat", onClick: () => setTab("chat") }, "AI \u5BF9\u8BDD"),
      React3.createElement(TabBtn, { active: tab === "config", onClick: () => setTab("config") }, "\u914D\u7F6E")
    ),
    // Tab 内容
    React3.createElement(
      "div",
      { className: "ebv2-tab-content" },
      tab === "gallery" && React3.createElement(GalleryTab, {
        onPick: (id) => {
          setMainEmotion(id);
          setTab("gallery");
        },
        hover: previewHover,
        setHover: setPreviewHover
      }),
      tab === "chat" && React3.createElement(ChatTab, { onEmotion: setMainEmotion }),
      tab === "config" && React3.createElement(ConfigTab)
    )
  );
}
function TabBtn({ active, onClick, children }) {
  return React3.createElement("button", {
    className: "ebv2-tab-btn " + (active ? "active" : ""),
    onClick
  }, children);
}
function GalleryTab({ onPick, hover, setHover }) {
  const groups = groupedEmotions();
  return React3.createElement(
    "div",
    { className: "ebv2-gallery" },
    groups.map(
      (g) => React3.createElement(
        "div",
        { key: g.group, className: "ebv2-gallery-group" },
        React3.createElement(
          "div",
          { className: "ebv2-gallery-group-title" },
          React3.createElement("span", {
            className: "ebv2-group-dot",
            style: { background: GROUP_COLORS[g.group] || "#888" }
          }),
          g.label
        ),
        React3.createElement(
          "div",
          { className: "ebv2-gallery-grid" },
          g.items.map(
            (e) => React3.createElement(
              "div",
              {
                key: e.id,
                className: "ebv2-gallery-card " + (hover === e.id ? "hover" : ""),
                onMouseEnter: () => setHover(e.id),
                onMouseLeave: () => setHover(null),
                onClick: () => onPick(e.id)
              },
              React3.createElement(EmotionBallView, {
                emotion: e.id,
                size: 64,
                gaze: false,
                lite: true
              }),
              React3.createElement("div", { className: "ebv2-card-id" }, e.id),
              React3.createElement("div", { className: "ebv2-card-name" }, e.name)
            )
          )
        )
      )
    )
  );
}
function ChatTab({ onEmotion }) {
  const s = useChatStore();
  const [input, setInput] = React3.useState("");
  const abortRef = React3.useRef(null);
  const scrollRef = React3.useRef(null);
  const streamRef = React3.useRef("");
  React3.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [s.messages, s.streamText]);
  const handleSend = React3.useCallback(async () => {
    const text = input.trim();
    if (!text || s.aiStatus === "connecting" || s.aiStatus === "streaming") return;
    if (!s.aiConfig.apiKey) {
      s.setAiError("\u8BF7\u5148\u5728\u914D\u7F6E\u9875\u586B\u5165 API Key");
      return;
    }
    setInput("");
    s.setStreamText("");
    streamRef.current = "";
    s.setAiError(null);
    s.addMessage({ role: "user", content: text });
    s.setAiStatus("connecting");
    if (s.autoEmotion) s.setEmotion("30");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const full = await sendChatMessage(
        s.aiConfig,
        [...s.messages, { role: "user", content: text }],
        (chunk) => {
          if (streamRef.current === "") {
            s.setAiStatus("streaming");
            if (s.autoEmotion) s.setEmotion("33");
          }
          streamRef.current += chunk;
          s.appendStreamText(chunk);
          if (s.autoEmotion) {
            const eid2 = parseEmotionFromText(streamRef.current);
            if (eid2) {
              s.setEmotion(eid2);
              onEmotion(eid2);
            }
          }
        },
        ac.signal
      );
      const clean = stripEmotionTag(full);
      const eid = s.autoEmotion ? parseEmotionFromText(full) || "02" : "02";
      s.addMessage({ role: "assistant", content: clean || "(\u7A7A\u54CD\u5E94)" });
      s.setAiStatus("idle");
      if (s.autoEmotion) {
        s.setEmotion(eid);
        onEmotion(eid);
      }
      s.setStreamText("");
      streamRef.current = "";
    } catch (err) {
      if (err.name === "AbortError") {
        s.setAiStatus("idle");
        s.setEmotion("02");
        return;
      }
      s.setAiError(err.message || String(err));
      s.setAiStatus("error");
      if (s.autoEmotion) s.setEmotion("35");
    }
  }, [input, s, onEmotion]);
  const handleStop = React3.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    s.setAiStatus("idle");
    s.setEmotion("02");
  }, [s]);
  const handleKeyDown = React3.useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);
  return React3.createElement(
    "div",
    { className: "ebv2-chat" },
    React3.createElement(
      "div",
      { ref: scrollRef, className: "ebv2-chat-msgs" },
      s.messages.slice(1).map(
        (m, i) => React3.createElement(
          "div",
          {
            key: i,
            className: "ebv2-chat-msg " + (m.role === "user" ? "user" : "assistant")
          },
          React3.createElement("div", { className: "ebv2-chat-role" }, m.role === "user" ? "\u6211" : "AI"),
          React3.createElement("div", { className: "ebv2-chat-content" }, m.content)
        )
      ),
      s.streamText && React3.createElement(
        "div",
        { className: "ebv2-chat-msg assistant streaming" },
        React3.createElement("div", { className: "ebv2-chat-role" }, "AI"),
        React3.createElement("div", { className: "ebv2-chat-content" }, s.streamText)
      ),
      s.messages.length <= 1 && !s.streamText && React3.createElement(
        "div",
        { className: "ebv2-chat-empty" },
        "\u53D1\u9001\u6D88\u606F\u6D4B\u8BD5 AI \u60C5\u7EEA\u7403\u3002AI \u56DE\u590D\u65F6\u4F1A\u81EA\u52A8\u5207\u6362\u60C5\u7EEA\u3002"
      )
    ),
    s.aiError && React3.createElement("div", { className: "ebv2-chat-error" }, s.aiError),
    React3.createElement(
      "div",
      { className: "ebv2-chat-input-row" },
      React3.createElement("textarea", {
        className: "ebv2-chat-input",
        value: input,
        onChange: (e) => setInput(e.target.value),
        onKeyDown: handleKeyDown,
        placeholder: "\u8F93\u5165\u6D88\u606F\uFF08Enter \u53D1\u9001\uFF0CShift+Enter \u6362\u884C\uFF09",
        rows: 2,
        disabled: s.aiStatus === "connecting" || s.aiStatus === "streaming"
      }),
      React3.createElement(
        "div",
        { className: "ebv2-chat-actions" },
        s.aiStatus === "connecting" || s.aiStatus === "streaming" ? React3.createElement("button", { className: "ebv2-btn stop", onClick: handleStop }, "\u505C\u6B62") : React3.createElement("button", {
          className: "ebv2-btn send",
          onClick: handleSend,
          disabled: !input.trim()
        }, "\u53D1\u9001")
      )
    ),
    React3.createElement(
      "div",
      { className: "ebv2-chat-footer" },
      React3.createElement(
        "label",
        { className: "ebv2-checkbox" },
        React3.createElement("input", {
          type: "checkbox",
          checked: s.autoEmotion,
          onChange: (e) => s.setAutoEmotion(e.target.checked)
        }),
        React3.createElement("span", null, "\u81EA\u52A8\u60C5\u7EEA\uFF08\u89E3\u6790 [emotion:ID]\uFF09")
      ),
      React3.createElement("button", {
        className: "ebv2-btn-ghost",
        onClick: () => s.clearMessages()
      }, "\u6E05\u7A7A")
    )
  );
}
function ConfigTab() {
  const s = useChatStore();
  return React3.createElement(
    "div",
    { className: "ebv2-config" },
    React3.createElement(
      "div",
      { className: "ebv2-config-field" },
      React3.createElement("label", { className: "ebv2-config-label" }, "API \u7AEF\u70B9"),
      React3.createElement("input", {
        className: "ebv2-config-input",
        value: s.aiConfig.baseUrl,
        onChange: (e) => s.setAiConfig({ baseUrl: e.target.value }),
        placeholder: "https://api.openai.com/v1"
      })
    ),
    React3.createElement(
      "div",
      { className: "ebv2-config-field" },
      React3.createElement("label", { className: "ebv2-config-label" }, "API Key"),
      React3.createElement("input", {
        className: "ebv2-config-input",
        type: "password",
        value: s.aiConfig.apiKey,
        onChange: (e) => s.setAiConfig({ apiKey: e.target.value }),
        placeholder: "sk-..."
      })
    ),
    React3.createElement(
      "div",
      { className: "ebv2-config-field" },
      React3.createElement("label", { className: "ebv2-config-label" }, "\u6A21\u578B"),
      React3.createElement("input", {
        className: "ebv2-config-input",
        value: s.aiConfig.model,
        onChange: (e) => s.setAiConfig({ model: e.target.value }),
        placeholder: "gpt-4o-mini"
      })
    ),
    React3.createElement(
      "div",
      { className: "ebv2-config-hint" },
      "\u652F\u6301\u4EFB\u4F55 OpenAI \u517C\u5BB9 API\uFF08DeepSeek / Groq / Ollama / \u4E2D\u8F6C\u7AD9\u7B49\uFF09\u3002AI \u9700\u5728\u56DE\u590D\u672B\u5C3E\u8F93\u51FA [emotion:ID] \u6807\u8BB0\u3002"
    ),
    React3.createElement(
      "div",
      { className: "ebv2-config-presets" },
      React3.createElement("div", { className: "ebv2-config-preset-title" }, "\u5FEB\u901F\u9009\u62E9"),
      React3.createElement(
        "div",
        { className: "ebv2-config-preset-grid" },
        presetBtn("OpenAI", { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" }, s),
        presetBtn("DeepSeek", { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" }, s),
        presetBtn("Groq", { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" }, s),
        presetBtn("Ollama", { baseUrl: "http://localhost:11434/v1", model: "llama3.2" }, s)
      )
    )
  );
}
function presetBtn(label, cfg, s) {
  const active = s.aiConfig.baseUrl === cfg.baseUrl && s.aiConfig.model === cfg.model;
  return React3.createElement("button", {
    key: label,
    className: "ebv2-preset-btn " + (active ? "active" : ""),
    onClick: () => s.setAiConfig(cfg)
  }, label);
}
export {
  EmotionBallPanel as default
};
