// cuihua.js: 翠花 — a Northeast-Chinese New Year character built on the Clawd engine.
// 翠花 keeps the block-bodied Clawd skeleton (views, emotions, turns, dances all still work), but wears a
// red cotton-padded jacket with flower pattern, two pigtail buns with red yarn, and big rosy cheeks.
// Also: scenery and props for a snowy 东北 village New Year's Eve (lanterns, window cut-outs, dumplings,
// firecrackers, a ribbon fan, snow, pines, fences, the pickle jar).
// Everything is a pure function of t; every element gets its own boil seed.

// ---------- 翠花's palette & body ----------
const CU = { col: '#C0332A', dk: '#8F261F', lt: '#E8775C', hair: '#3A3247', yarn: '#E23E36' };
const FLO = [[-3.2, -3.05], [3.2, -3.05], [-4.4, -4.85], [4.4, -4.85], [-2.0, -2.7], [2.0, -2.7], [0, -2.95]];

// flowers sprinkled on the padded jacket (drawn in body-local space, below the hem so they miss the face)
function jacketFlowers(u, sw) {
  boilSeed('jacket');
  for (const [fx, fy] of FLO) {
    push(); translate(fx * u, fy * u);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; paint(ellPts(Math.cos(a) * .34 * u, Math.sin(a) * .34 * u, .28 * u, .34 * u, 8), { wash: '#EFC14B', fill: '#E2476E', fillOp: 60, ink: null }); }
    paint(ellPts(0, 0, .2 * u, .2 * u, 8), { wash: '#E2476E', ink: null });
    pop();
  }
}

// two pigtail buns + a hair whorl on top of the head
function pigtails(u, sw) {
  boilSeed('pigtails');
  for (const s of [-1, 1]) {
    push(); translate(s * 3.7 * u, -9.7 * u);
    paint(ellPts(0, 0, 1.18 * u, 1.18 * u, 18), { wash: CU.hair, fill: '#57506B', fillOp: 55, bleed: .1, tex: .7, ink: PAL.ink, sw: sw * .7 });
    paint(ellPts(0, 1.12 * u, .3 * u, .3 * u, 8), { wash: CU.yarn, ink: PAL.ink, sw: sw * .45 });
    inkLine([[-.55 * u, .9 * u], [.55 * u, .9 * u]], sw * .4, CU.yarn, 'ink', 0);
    pop();
  }
  paint(ellPts(0, -8.7 * u, 1.35 * u, .5 * u, 14), { fill: CU.hair, fillOp: 160, bleed: .12, tex: .7, ink: null });
}

// 翠花: Clawd engine + her skin. col/dk/lt are pinned to the jacket (moods shift the face, not the coat).
function cuihua(x, y, u, o = {}) {
  const extra = { ...o, col: CU.col, dk: CU.dk, lt: CU.lt };
  const prev = o.draw;
  extra.draw = (u2, sw) => { jacketFlowers(u2, sw); pigtails(u2, sw); if (prev) prev(u2, sw); };
  clawd(x, y, u, extra);
}

// ---------- props ----------
// A red New Year lantern. lit 0..1: dark and dim when low, warm glow + bright body when lit.
function lantern(x, y, r, lit, o = {}) {
  const gl = lit > .05 ? .95 + .08 * Math.sin(T * 2.4) : .1;
  if (lit > .05) glow(x, y + r * .1, r * 3.4, o.glowCol || '#FFB84D', .55 * lit);
  boilSeed('lantern' + Math.round(x) + o.seed || '');
  push(); translate(x, y); if (o.rot) rotate(o.rot);
  const sw = clamp(r / 18, .5, 1.6);
  inkLine([[0, -r * 2.1], [0, -r * 1.15]], sw * .6, o.stringCol || PAL.ink, 'inkfine', 0);
  paint(rrPts(-r * .34, -r * 1.28, r * .68, r * .5, r * .14), { wash: o.topCol || '#A63B2C', ink: PAL.ink, sw: sw * .55 });
  paint(ellPts(0, -r * .18, r * .62, r * .95, 24), { wash: lit > .05 ? o.bodyCol || '#E04838' : '#A63B2C', fill: lit > .05 ? '#F2C53D' : '#7C2019', fillOp: lit > .05 ? 150 : 90, bleed: .12, tex: .75, ink: PAL.ink, sw });
  paint(ellPts(0, -r * .18, r * .62, r * .95, 24), { fill: o.ribCol || PAL.ochre, fillOp: 55 * (lit > .05 ? 1 : .3), bleed: .1, tex: .8, border: .6, ink: null });
  paint(rrPts(-r * .38, -r * .92, r * .76, r * .34, r * .12), { wash: o.topCol || '#A63B2C', ink: PAL.ink, sw: sw * .55 });
  const tas = []; for (let k = 0; k <= 3; k++) tas.push([(k - 1.5) * r * .3 + Math.sin(k * 5) * r * .05, -r * .62 + k * r * .5]);
  paint(ribbon(tas, r * .3, r * .14), { wash: '#D8394E', fill: '#E2476E', fillOp: 60, ink: PAL.ink, sw: sw * .4 });
  pop();
}

// a red paper window cut-out: a rosette of petals around a heart-ish centre, pressed on the glass
function chuanghua(cx, cy, r, col = '#D93A2E') {
  boilSeed('chuanghua' + Math.round(cx));
  push(); translate(cx, cy);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    paint(ellPts(Math.cos(a) * r * .55, Math.sin(a) * r * .55, r * .34, r * .5, 14), { wash: col, fill: mixCol(col, PAL.cream, .25), fillOp: 80, ink: PAL.ink, sw: clamp(r / 60, .4, 1) });
  }
  paint(ellPts(0, 0, r * .4, r * .4, 16), { wash: col, ink: PAL.ink, sw: clamp(r / 70, .35, .9) });
  paint(heartPts(0, 0, r * .22), { wash: mixCol(col, PAL.ochre, .35), ink: PAL.ink, sw: clamp(r / 90, .3, .7) });
  pop();
}

// a pleated dumpling (元宵/饺子), cream with an ink outline and pinch marks
function jiaozi(x, y, s, o = {}) {
  boilSeed('jiaozi' + Math.round(x * 7));
  push(); translate(x, y); if (o.rot) rotate(o.rot);
  const P = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10) - Math.PI / 2; P.push([Math.cos(a) * s, -Math.sin(a) * s * .78]); }
  const Q = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1 - i / 10) - Math.PI / 2; Q.push([Math.cos(a) * s * .72, -Math.sin(a) * s * .9 - s * .1]); }
  paint(P.concat(Q), { wash: PAL.cream, fill: mixCol(PAL.cream, PAL.paper, .4), fillOp: 120, bleed: .05, tex: .6, ink: PAL.ink, sw: clamp(s / 22, .4, 1.2), curv: .35 });
  for (let k = -3; k <= 3; k++) inkLine([[k * s * .22, -s * .2], [k * s * .3 + s * .06, -s * .5]], clamp(s / 40, .25, .6), PAL.ink, 'inkfine', 0);
  pop();
}

// a 二踢脚 firecracker: red tube, paper ends, a fuse; lit>0 sparks at the fuse tip
function pao(x, y, s, o = {}) {
  boilSeed('pao' + Math.round(x));
  push(); translate(x, y); if (o.rot) rotate(o.rot);
  const sw = clamp(s / 16, .45, 1.4);
  paint(rrPts(-s * .8, -s * .55, s * 1.6, s * 1.1, s * .22), { wash: '#D23A30', fill: '#96302A', fillOp: 110, bleed: .06, tex: .7, ink: PAL.ink, sw });
  paint(rrPts(-s * .95, -s * .72, s * .5, s * 1.44, s * .16), { wash: '#B8B0A4', ink: PAL.ink, sw: sw * .6 });
  inkLine([[-s * .95, -s * 1.0], [-s * .45, -s * 1.35], [s * .1, -s * 1.05]], sw * .45, PAL.ink, 'inkfine', .5);
  if (o.lit > 0) {
    const fl = .7 + .3 * Math.sin(T * 40);
    glow(s * .1, -s * 1.05, s * 1.6, '#FFC766', .8 * o.lit * fl);
    paint(starPts(s * .1, -s * 1.05, s * .34 * fl, .55, 4), { wash: PAL.cream, fill: PAL.ochre, fillOp: 140, ink: null });
  }
  pop();
}

// a red ribbon fan, drawn at the arm tip (arm space): opens upward from the hand
function fan(u, sw) {
  push(); rotate(-.35);
  const R = u * 1.75, n = 9;
  const P = [[0, 0]];
  for (let i = 0; i <= n; i++) { const a = lerp(1.55, 3.35, i / n), rr = R * (1 + .06 * Math.sin(i * 2.7)); P.push([Math.cos(a) * rr, -Math.sin(a) * rr]); }
  paint(P, { wash: '#D94838', fill: '#F2C53D', fillOp: 90, bleed: .12, tex: .75, ink: PAL.ink, sw: sw * .8, curv: .4 });
  for (let i = 0; i <= n; i++) { const a = lerp(1.55, 3.35, i / n); inkLine([[0, 0], [Math.cos(a) * R * .85, -Math.sin(a) * R * .85]], sw * .3, '#C0392B', 'inkfine', 0); }
  pop();
}

// ---------- scenery ----------
// falling snow. depth lets a shot layer two depths (near flakes drift more).
function snow(t, n = 32, depth = 1) {
  boilSeed('snow' + depth);
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 7 + depth * 13), h2 = hash(i * 11 + depth * 3), h3 = hash(i * 5);
    const sp = (46 + 70 * h1) * depth, r = (1.4 + 2.6 * h2) * depth;
    const y = (h3 * (H + 100) + t * sp) % (H + 100) - 30;
    const x = h2 * (W + 160) - 80 + Math.sin(t * (0.7 + h1) + i) * (7 + 16 * depth * h3);
    const tw = .55 + .45 * Math.sin(t * 3 + i * 2);
    paint(ellPts(x, y, r * tw, r * tw, 8), { wash: PAL.cream, washOp: (110 + 120 * h1) * tw, ink: null });
  }
}

// a dark pine on a far hill
function pine(x, y, s) {
  boilSeed('pine' + Math.round(x));
  const c = mixCol(PAL.sap, PAL.night, .5);
  paint([[-.95 * s, 0], [0, -2.1 * s], [.95 * s, 0]], { wash: c, ink: null });
  paint([[-1.35 * s, -1.1 * s], [0, -3.6 * s], [1.35 * s, -1.1 * s]], { wash: c, ink: null });
  paint([[-1.7 * s, -2.3 * s], [0, -5.2 * s], [1.7 * s, -2.3 * s]], { wash: c, fill: mixCol(c, PAL.cream, .2), fillOp: 60, bleed: .15, tex: .7, ink: null });
  paint(rectPts(-.2 * s, 0, .4 * s, .25 * s), { fill: mixCol(PAL.sap, PAL.night, .35), fillOp: 200, ink: null });
  // snow caps
  for (const yy of [-2.1 * s, -3.6 * s, -5.2 * s]) inkLine([[-.28 * s, yy - .05 * s], [0, yy - .3 * s], [.28 * s, yy - .05 * s]], clamp(s / 45, .4, 1), PAL.cream, 'inkfine', .5);
}

// a picket fence along the ground at height gy; xs = where to put pickets
function fence(xs, gy, h, col = mixCol(PAL.sap, PAL.night, .5)) {
  boilSeed('fence');
  inkLine([[Math.min(...xs) - 40, gy - h * .62], [Math.max(...xs) + 40, gy - h * .62]], 2.2, col, 'dry', .3);
  for (const x of xs) {
    boilSeed('fence' + x);
    paint(rrPts(x - h * .09, gy - h * .85, h * .18, h, h * .08), { wash: col, fill: mixCol(col, PAL.cream, .2), fillOp: 80, bleed: .08, ink: PAL.ink, sw: 1 });
    paint(ellPts(x + (x % 2 ? h * .1 : -h * .1), gy - h * .5, h * .04, h * .04, 6), { wash: PAL.cream, washOp: 160, ink: null }); // snow on each post
  }
}

// the 酸菜缸: a big pottery pickle jar with a flat lid
function pot(x, y, s) {
  boilSeed('pot' + Math.round(x));
  push(); translate(x, y);
  paint(ellPts(0, 0, s, s * .72, 24), { wash: '#6E5A48', fill: '#57463A', fillOp: 140, bleed: .1, tex: .8, ink: PAL.ink, sw: clamp(s / 20, .5, 1.4) });
  paint(ellPts(0, -s * .66, s * .82, s * .3, 20), { wash: '#7E6A56', ink: PAL.ink, sw: clamp(s / 24, .45, 1.2) });
  paint(ellPts(0, -s * .86, s * .62, s * .16, 16), { wash: '#8A7664', fill: PAL.cream, fillOp: 40, ink: PAL.ink, sw: clamp(s / 28, .4, 1) });
  paint(ellPts(0, -s * .14, s * .3, s * .34, 16), { fill: PAL.cream, fillOp: 90, bleed: .2, ink: null }); // snow on the lip
  pop();
}

// the window with warm lamplight inside + snowy sill
function windowProps(x, y, w, h) {
  boilSeed('window');
  // warm light from inside
  glow(x + w / 2 - 120, y + h / 2, w * .9, '#FFC766', .3);
  paint(rrPts(x, y, w, h, 14), { wash: mixCol(PAL.night, PAL.indigo, .55), fill: '#F2C53D', fillOp: 120, bleed: .06, tex: .7, ink: PAL.ink, sw: 1.4 });
  // two panes, one warm square lit from inside
  paint(rrPts(x + w * .07, y + h * .07, w * .39, h * .4, 8), { wash: mixCol('#F2C53D', PAL.cream, .55), fill: '#F2C53D', fillOp: 160, bleed: .05, tex: .6, ink: PAL.ink, sw: 1 });
  paint(rrPts(x + w * .54, y + h * .07, w * .39, h * .4, 8), { wash: mixCol('#F2C53D', PAL.cream, .35), fill: PAL.ochre, fillOp: 130, bleed: .05, tex: .6, ink: PAL.ink, sw: 1 });
  paint(rrPts(x + w * .07, y + h * .53, w * .39, h * .37, 8), { wash: '#4A3B33', fill: PAL.indigo, fillOp: 90, ink: PAL.ink, sw: 1 });
  paint(rrPts(x + w * .54, y + h * .53, w * .39, h * .37, 8), { wash: mixCol(PAL.night, PAL.indigo, .4), fill: PAL.indigo, fillOp: 80, ink: PAL.ink, sw: 1 });
  // mullions
  inkLine([[x + w * .5, y + 8], [x + w * .5, y + h - 12]], 2, PAL.ink, 'dry', 0);
  inkLine([[x + 8, y + h * .5], [x + w - 8, y + h * .5]], 2, PAL.ink, 'dry', 0);
  // snowy sill
  paint(ellPts(x + w / 2, y + h + 14, w * .58, 26, 20), { wash: PAL.cream, fill: mixCol(PAL.cream, PAL.sky, .25), fillOp: 90, bleed: .15, tex: .7, ink: null });
  paint(rrPts(x - 26, y + h + 10, w + 52, 30, 10), { wash: mixCol(PAL.sap, PAL.night, .4), ink: PAL.ink, sw: 1.2 });
}

// a row of distant village houses with a lantern each; lit 0..1 drives the warm glow (for the finale ripple)
function housesRidge(cx, cy, rx, ry, t, litSeq) {
  boilSeed('ridge');
  paint(ellPts(cx, cy, rx, ry, 30, 3), { wash: mixCol(PAL.night, PAL.indigo, .3), fill: mixCol(PAL.indigo, PAL.night, .5), fillOp: 120, bleed: .2, tex: .7, ink: null });
  const n = 7;
  for (let i = 0; i < n; i++) {
    boilSeed('house' + i);
    const k = i / (n - 1), hx = cx - rx * .78 + k * rx * 1.56, hy = cy - ry * Math.sqrt(Math.max(0, 1 - ((hx - cx) / rx) ** 2)) * .9 - 14;
    const s = 26 + 14 * hash(i * 3);
    paint(rrPts(hx - s * .8, hy - s * .5, s * 1.6, s, s * .08), { wash: mixCol('#5C4A3E', PAL.night, .35), fill: '#4A3B33', fillOp: 120, ink: PAL.ink, sw: 1.1 });
    paint([[hx - s * .95, hy - s * .55], [hx, hy - s * 1.25], [hx + s * .95, hy - s * .55]], { wash: mixCol('#6E5A48', PAL.night, .3), ink: PAL.ink, sw: 1 });
    const L = litSeq(t, i, hx, hy);
    if (L > .04) glow(hx + s * .25, hy - s * .18, s * 1.5, '#FFB85C', .8 * L);
    paint(rrPts(hx + s * .08, hy - s * .3, s * .8, s * .5, s * .06), { wash: L > .04 ? '#F2C53D' : '#3A2E26', fill: '#F2C53D', fillOp: 130 * L, ink: PAL.ink, sw: .8 });
  }
}

// steam rising off a hot bowl (chain of soft curls)
function steam(x, y, h, t, seed = 0) {
  boilSeed('steam' + seed);
  for (let i = 0; i < 3; i++) {
    const ph = frac(t * .55 + i / 3 + seed), sway = Math.sin((ph * TAU) * 2 + i * 2) * 10 * ph;
    const P = []; for (let k = 0; k <= 5; k++) { const q = ph + k * .09; if (q > 1) break; P.push([sway * q * q, -q * q * h]); }
    paint(ribbon(P, 16 * (1 - ph * .6), 4), { wash: PAL.cream, washOp: 230 * (1 - ph * .8), ink: null });
  }
}

// a warm bowl of dumplings with steam; bowl-y
function bowl(x, y, s, t) {
  boilSeed('bowl');
  paint(ellPts(x, y, s * 1.5, s * .5, 24), { wash: '#5B4939', fill: '#463731', fillOp: 130, bleed: .1, tex: .7, ink: PAL.ink, sw: clamp(s / 20, .5, 1.3) });
  paint(ellPts(x, y - s * .3, s * 1.15, s * .42, 22), { wash: '#B8B0A4', fill: PAL.cream, fillOp: 110, bleed: .06, tex: .7, ink: PAL.ink, sw: clamp(s / 24, .45, 1.1) });
  for (let i = 0; i < 3; i++) jiaozi(x - s * .4 + i * s * .4, y - s * .34 - s * .1 * hash(i * 2), s * .22, { rot: (i - 1) * .3 });
  steam(x, y - s * .5, s * 2.6, t, 1);
}