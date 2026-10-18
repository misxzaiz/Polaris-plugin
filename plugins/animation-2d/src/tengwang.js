// tengwang.js: 《滕王阁序》ink-wash vocabulary — reusable scenery primitives + vertical calligraphy.
// Everything is a pure function of t with its own boil seed, so it never disturbs other shots.

// ink-wash palette (soft paper, ink, jade, moss, cinnabar — no pure white/black)
const TW = {
  ink: '#2B2A33',
  night: '#262A45',
  indigo: '#3A4878',
  jade: '#3F7C6E',
  moss: '#5F7D50',
  ochre: '#D9A441',
  cinnabar: '#B83A2C',
  paper: '#F3EBDC',
};
// vertical calligraphy font stack (Windows KaiTi first, then generic serif fallbacks)
const VFONT = '"KaiTi","STKaiti","Kai","SimSun","Noto Serif SC",serif';

// ----- vertical calligraphy, right column, top to bottom -----
// txt may include ，。 as separate chars (they occupy a slot, as in classic vertical text).
// reveal: 0..n — number of leading chars currently shown (fractional = soft ink-in).
function vText(txt, cx, cy, size, col, o = {}) {
  const gap = (o.gap ?? 1.12) * size, font = o.font || `${size}px ${VFONT}`;
  const n = o.reveal ?? txt.length;
  for (let i = 0; i < txt.length; i++) {
    const k = clamp(n - i);                    // 0 pre, 1 … fully inked
    if (k <= 0) continue;
    const y = cy + i * gap;
    const ink = k < 1 ? ease(k) : 1;           // soft wash-in
    const alpha = (o.alpha ?? 1) * (o.inkAll ? 1 : 1);
    letter(txt[i], cx, y, size, col, { font, ink: false, alpha: ink * alpha, rot: (o.rot ?? 0) + (k < 1 ? (1 - ink) * (o.rotK ?? .02) : 0) });
  }
}
// a small cinnabar seal (white-文 style, no characters) — the painter's chop on the finished scroll
function seal(x, y, s, o = {}) {
  boilSeed('seal' + Math.round(x));
  paint(rrPts(x - s / 2, y - s / 2, s, s, s * .1), { wash: o.col || TW.cinnabar, washOp: 235, bleed: .12, tex: .8, ink: PAL.ink, sw: 1 });
  paint(rrPts(x - s * .3, y - s * .3, s * .6, s * .6, s * .06), { wash: TW.paper, washOp: 225, bleed: .05, tex: .4, ink: null });
}
// soft ink-bloom transition: p 0..1 covers the frame with a spreading ink wash (call inside a shot, screen space)
function inkBloom(p, col = PAL.ink) {
  if (p <= 0 || p >= 1) return;
  const r = lerp(40, 1750, easeInOut(p)), r2 = lerp(60, 1780, ease(p));
  paint(ellPts(W / 2, H / 2, r, r * .62, 36), { wash: col, washOp: 255 * (p < .5 ? p * 2 : 1), bleed: .25, tex: .8, ink: null });
  paint(ellPts(W / 2, H / 2, r2, r2 * .62, 36), { fill: mixCol(col, PAL.paper, .25), fillOp: 90 * (p < .5 ? p * 2 : 1), bleed: .3, tex: .7, ink: null });
}
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

// ----- scenery -----
// 水墨远山: layered silhouette mountains, farther = paler/bluer
function mt(cx, cy, rx, ry, col, o = {}) {
  boilSeed('mt' + Math.round(cx));
  paint(ellPts(cx, cy, rx, ry, 34, 2), { wash: col, fill: mixCol(col, PAL.night, .4), fillOp: o.fillOp ?? 110, bleed: .18, tex: .75, ink: PAL.ink, sw: o.sw ?? 1 });
}
// layered sky at night: night wash + fine stars + a moon. twinkle per-star on t.
function nightSky(t, o = {}) {
  boilSeed('nsky');
  paint(rectPts(-600, -400, W + 1200, H + 800), { wash: o.col || TW.night, ink: null });
  const n = o.stars ?? 70;
  for (let i = 0; i < n; i++) {
    boilSeed('ns' + i);
    const h1 = hash(i * 3), h2 = hash(i * 7 + 5), h3 = hash(i * 11);
    const x = h1 * W, y = h2 * H * .62, r = (1.1 + 2.6 * h3);
    const tw = .5 + .5 * Math.sin(t * (1.2 + 2 * h2) + i * 2.1);
    paint(ellPts(x, y, r * tw, r * tw * .8, 8), { wash: PAL.cream, washOp: (110 + 120 * h3) * tw, ink: null });
    if (h1 > .85) { // a few bright ones get a star cross
      const rr = r * 3.2;
      paint(starPts(x, y, rr * tw, .2, 4), { wash: PAL.cream, washOp: 140 * tw, ink: null });
    }
  }
  if (o.moon !== false) {
    boilSeed('moon');
    const mx = o.moonX ?? 320, my = o.moonY ?? 190, mr = o.moonR ?? 56;
    glow(mx, my, mr * 3, '#F4E3B8', .35);
    paint(ellPts(mx, my, mr, mr, 26), { wash: PAL.cream, fill: TW.ochre, fillOp: 46, bleed: .1, tex: .6, ink: PAL.ink, sw: .7 });
    paint(ellPts(mx - mr * .3, my - mr * .3, mr * .14, mr * .1, 8), { fill: mixCol(PAL.cream, TW.ochre, .5), fillOp: 130, ink: null });
  }
}
// a banner flag on a tall pole (旗幡), gently swaying with t
function banner(t, x, y, h, col, o = {}) {
  boilSeed('banner' + Math.round(x));
  inkLine([[x, y], [x, y - h]], 1.2, PAL.ink, 'inkfine', 0);
  const ph = Math.sin(tFilter(o.phase ?? 0) * 2 + t * 1.6) * .2, L = h * .42;
  const top = y - h;
  const P = [[x, top], [x + L, top + 6], [x + L + ph * 10, top + h * .3], [x + L * .6 + ph * 14, top + h * .46], [x, top + h * .12]];
  paint(ribbon(P, h * .16, h * .09), { wash: col, fill: mixCol(col, TW.paper, .3), fillOp: 120, bleed: .1, tex: .7, ink: PAL.ink, sw: .8, curv: .3 });
}
// tFilter is a no-op identity; kept so banners may be offset per element without breaking purity
const tFilter = () => 0;
// gentle water ripples: a few thin arcs on a水面, moving slowly
function ripples(t, x, y, r, n = 3, col = PAL.cream) {
  boilSeed('rip' + Math.round(x));
  for (let i = 0; i < n; i++) {
    const ph = frac(t * .3 + i / n);
    const rr = r * (ph + i * .18);
    const a = .5 - ph * .3;
    if (a > 0) paint(ellPts(x, y + rr * .06, rr * .9, rr * .26, 24), { wash: col, washOp: 90 * a, ink: null });
  }
}