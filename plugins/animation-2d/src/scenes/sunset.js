// sunset.js: 《海滩落日》— Clawd walks onto the beach at golden hour, hops onto the driftwood and
// watches the day end: the sun slides down and sinks behind the sea, the afterglow burns wide, then
// the blue hour takes over — the sky deepens, the first stars appear, the moon rises, the lighthouse
// far off starts sweeping its beam; the waves never stop rolling in. 3 shots, 19.2 s, bpm 92.
//
// Shot A 0–7.2    wide   golden beach, stroll in, hop onto the log, watch the sea  → brush wipe
// Shot B 7.2–13.6 medium the sun slides to the horizon and sinks; he turns around, moved → cut
// Shot C 13.6–19.2 wide   blue hour: stars, moon, lighthouse, boat lamp; he gets sleepy → iris out
//
// Everything is a pure function of t; every element gets its own boil seed. No text anywhere.

(() => {
  const WIPE = [mixCol(PAL.violet, PAL.ink, .25), mixCol(PAL.ochre, PAL.cream, .35)];
  const HOR = 575;                                    // sea horizon line
  const LOGX = 1134, LOGTOP = 990;                    // the driftwood log
  const T_B = 7.2, T_C = 13.6, T_END = 19.2;

  // hex-colour keyframes over t (hand-tuned; every colour curve eases)
  function khex(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) {
        const [a, va] = keys[i - 1], [b, vb] = keys[i];
        return mixCol(va, vb, ease((t - a) / (b - a)));
      }
    }
    return keys[keys.length - 1][1];
  }

  // sun track: right and down, grazing the horizon at 12.9 and well under by 13.6
  const sunX = t => kf(t, [[0, 1150], [5.5, 1230], [10, 1300], [T_C, 1410]]);
  const sunY = t => kf(t, [[0, 255], [5.5, 360], [10, 470], [12.1, 540], [12.9, 573], [13.6, 660]]);
  // how high the sun still is (1 = high, 0 = touching the horizon) — drives glow, glitter, warmth
  const elev = t => clamp((HOR - 26 - sunY(t)) / 300);

  // ---------- sky ----------
  function sky(t) {
    const top = khex(t, [[0, '#A6C6DE'], [5.5, '#B3A6CE'], [9.5, '#827BB4'], [T_C, '#494F8C'], [T_END, '#232A57']]);
    const hz = khex(t, [[0, '#F2DCB2'], [5.5, '#F2AE6B'], [9.5, '#D8796B'], [T_C, '#7C587F'], [T_END, '#3B4780']]);
    boilSeed('su-sky');
    paint(rectPts(-700, -500, W + 1400, H + 1200), { wash: top, ink: null });
    // two soft warm bands centred on the sun (read as horizon glow, not clouds)
    boilSeed('su-skyhz');
    paint(ellPts(sunX(t), HOR + 60, 1560, 300, 30, 4),
      { fill: hz, fillOp: 120, bleed: .55, tex: .35, ink: null });
    boilSeed('su-skyhz2');
    paint(ellPts(sunX(t), HOR + 30, 950, 180, 26, 4),
      { fill: hz, fillOp: 110, bleed: .6, tex: .35, ink: null });
    // a hot band that hugs the horizon only while the sun is near/under it
    const hotA = (elev(t) < .3 ? 1 - elev(t) * 3.3 : 0) * clamp(1 - seg(t, 14.6, 17.2));
    if (hotA > .02) {
      boilSeed('su-skyhot');
      paint(ellPts(sunX(t), HOR - 40, 560, 150, 26, 8),
        { fill: khex(t, [[0, '#E8875C'], [T_C, '#B85A70']]), fillOp: 115 * hotA, bleed: .5, tex: .35, ink: null });
    }
  }

  // ---------- stars (blue hour) ----------
  function stars(t) {
    const zb = seg(t, 14.6, T_END);
    if (zb <= 0) return;
    for (let i = 0; i < 44; i++) {
      const sx = 60 + hash(i) * 1780, sy = 70 + hash(i + 1) * 430;
      if (sy > HOR - 50) continue;
      const th = hash(i + 5) * .62, k = clamp((zb - th) / .1);
      if (k <= .02) continue;
      boilSeed('su-st' + i);
      const tw = .72 + .28 * Math.sin(t * 2.2 + hash(i + 9) * 9);
      const r = 2 + 3 * hash(i + 3);
      if (i < 4) glow(sx, sy, 26 * r, '#CFE1FF', .3 * k);
      paint(starPts(sx, sy, r, .5, 4, hash(i + 7) * 3),
        { wash: PAL.cream, washOp: 235 * k * tw, ink: null });
    }
    const mK = seg(t, 17.1, 17.25) * (1 - seg(t, 17.45, 17.8));  // one meteor streaks and fades
    if (mK > .02) {
      boilSeed('su-met');
      const mx = lerp(1150, 1420, ease(seg(t, 17.1, 17.6))), my = lerp(120, 250, ease(seg(t, 17.1, 17.6)));
      inkLine([[mx - 90, my - 44], [mx, my]], 1.6, mixCol(PAL.cream, '#CFE1FF', .5), 'ink', 0);
      glow(mx, my, 34, '#CFE1FF', .5 * mK);
    }
  }

  // ---------- moon (rises at the end of the afterglow) ----------
  // crescent as one closed outline: outer arc (far side) + inner arc of the bite circle (near side)
  function crescent(cx, cy, R) {
    const r = R * .95, dd = R * .5;
    const phi = -2.35;                                  // bite direction: upper-left
    const a = (dd * dd + R * R - r * r) / (2 * dd);
    const th1 = Math.acos(clamp(a / R, -1, 1));
    const th2 = Math.acos(clamp((a - dd) / r, -1, 1));
    const P = [];
    for (let i = 0; i <= 22; i++) {
      const ang = phi + th1 + i / 22 * (TAU - 2 * th1); // the far side, the long way round
      P.push([cx + Math.cos(ang) * R + jit(1.2), cy + Math.sin(ang) * R + jit(1.2)]);
    }
    const bx = cx + dd * Math.cos(phi), by = cy + dd * Math.sin(phi);
    for (let i = 0; i <= 14; i++) {
      const ang = phi + TAU - th2 - i / 14 * (TAU - 2 * th2);   // the bite edge, around the far side of the bite circle
      P.push([bx + Math.cos(ang) * r + jit(1.2), by + Math.sin(ang) * r + jit(1.2)]);
    }
    return P;
  }
  function moon(t) {
    const k = ease(seg(t, 14.7, 16.5));
    if (k <= 0) return;
    const mx = kf(t, [[14.7, 1545], [T_END, 1470]]), my = kf(t, [[14.7, 460], [T_END, 325]]);
    glow(mx, my, 95, '#DCE8FF', .35 * k);
    boilSeed('su-moon');
    paint(crescent(mx, my, 46), {
      wash: mixCol(PAL.cream, '#D8E4FF', .5), washOp: 255 * k,
      ink: mixCol(PAL.ink, '#3B4780', .3), sw: .9,
    });
    // a faint cool glitter path below the moon
    boilSeed('su-mglit');
    for (let i = 0; i < 9; i++) {
      const gy = HOR + 44 + i * 30 + hash(i) * 8;
      if (gy > 950) continue;
      const spread = 26 + i * 9, gx = mx + (hash(i + 3) - .5) * 2 * spread;
      inkLine([[gx, gy], [gx + 10 + hash(i + 5) * 16, gy + jit(2)]], .8,
        mixCol(PAL.cream, PAL.teal, .4), 'inkfine', 0);
    }
  }

  // ---------- lighthouse (far right, wakes at the blue hour) ----------
  function lighthouse(t) {
    const k = seg(t, 15.2, 16.2); if (k <= .02) return;
    const x0 = 1772, dark = mixCol(PAL.ink, '#3B4780', .35);
    boilSeed('su-lh');
    paint([[x0, HOR + 6], [x0 + 38, HOR + 6], [x0 + 29, HOR - 98], [x0 + 9, HOR - 98]],
      { wash: mixCol(PAL.cream, '#C9B79A', .3), washOp: 250 * k, ink: dark, sw: .8 * k });
    boilSeed('su-lhs');
    paint(rectPts(x0 + 3, HOR - 70, 30, 14), { wash: mixCol(PAL.rose, dark, .25), washOp: 240 * k, ink: null });
    paint(rectPts(x0 + 2, HOR - 36, 32, 14), { wash: mixCol(PAL.rose, dark, .25), washOp: 240 * k, ink: null });
    const on = Math.exp(-8 * frac(t / 2.6));                    // the beam breathes
    paint(rectPts(x0 + 6, HOR - 112, 26, 15), {
      wash: on > .45 ? '#FFE9A0' : mixCol(PAL.indigo, PAL.ink, .2), washOp: 250 * k, ink: dark, sw: .7 * k,
    });
    const beamA = on * k * .8;
    if (beamA > .02) {
      glow(x0 + 19, HOR - 104, 100, '#FFD98A', beamA);
      boilSeed('su-beam');
      paint([[x0 + 16, HOR - 106], [x0 - 520, HOR - 224], [x0 - 640, HOR - 70], [x0 + 16, HOR - 98]],
        { wash: '#FFE9A0', washOp: 60 * beamA, ink: null });
    }
  }

  // ---------- fishing boat (drifts right all day, shows its lamp at dusk) ----------
  function boat(t) {
    const bx = kf(t, [[0, 300], [8, 590], [T_C, 850], [T_END, 1090]]);
    const by = HOR + 40, night = seg(t, 12.5, 15.5);
    boilSeed('su-boat');
    paint([[bx - 56, by], [bx + 56, by], [bx + 40, by + 20], [bx - 42, by + 20]],
      { wash: mixCol('#7A5A74', PAL.ink, .25 + .2 * night), washOp: 250, ink: mixCol(PAL.ink, '#3B4780', .15), sw: .8 });
    inkLine([[bx, by], [bx, by - 52]], 1.1, mixCol(PAL.ink, '#3B4780', .1), 'ink', 0);
    paint([[bx - 2, by - 50], [bx + 40, by - 12], [bx - 2, by - 10]],
      { wash: mixCol(PAL.cream, '#E8B98A', .35), washOp: 235 * (1 - night * .5), ink: mixCol(PAL.ink, '#3B4780', .1), sw: .7 });
    if (night > .25) {
      const la = .5 + .5 * Math.sin(t * 3.1);
      glow(bx + 44, by - 4, 40 + 14 * la, '#FFC766', .55 * night);
      paint(ellPts(bx + 44, by - 4, 3, 3, 8), { wash: '#FFD98A', ink: mixCol(PAL.ink, PAL.ochre, .3), sw: .5 });
    }
  }

  // ---------- sea ----------
  function sea(t) {
    const col = khex(t, [[0, '#6FAFA8'], [5.5, '#6995AC'], [9.5, '#56689F'], [T_C, '#3E4E8F'], [T_END, '#262F5E']]);
    boilSeed('su-sea');
    paint(rectPts(-100, HOR, W + 300, H + 400, 2), { wash: col, washOp: 255, ink: null });
    paint(rectPts(-100, HOR, W + 300, H + 400, 2), { wash: col, washOp: 220, ink: null });  // twice: the sun sinks BEHIND this
    boilSeed('su-horl');
    inkLine([[-100, HOR + jit(1.5)], [700, HOR + jit(1.5)], [1400, HOR - jit(2)], [W + 100, HOR + jit(1.5)]],
      1, khex(t, [[0, '#4F606E'], [T_END, '#1E2649']]), 'inkfine', .3);
    // the afterglow spreading over the water while the sky still burns
    const gA = clamp(1 - Math.abs(seg(t, 12.7, 16.8) - .45) * 2.6) + .18 * clamp(1 - seg(t, 16.8, 18.4) * 2);
    if (gA > .05) {
      boilSeed('su-glowrefl');
      paint(ellPts(sunX(t) - 100, 800, 860, 140, 24, 12),
        { fill: khex(t, [[12.7, '#E8875C'], [15, '#C86B78'], [17, '#6B5E8C']]), fillOp: 90 * gA, bleed: .5, tex: .4, ink: null });
    }
  }

  // the sun's glitter column on the water — wide and hot when the sun is low; sinks with it
  function glitter(t) {
    const e = elev(t), sa = seg(t, 13.15, 13.85);
    const k = e * (1 - sa); if (k <= .03) return;
    const cols = khex(t, [[0, '#FFE9A8'], [9.5, '#FFC766']]);
    boilSeed('su-gl');
    for (let i = 0; i < 15; i++) {
      const gy = HOR + 26 + i * 24 + hash(i + 8) * 6;
      if (gy > 940) continue;
      const spread = 130 + (940 - HOR) * (1 - e) * .4 + (gy - HOR) * .34;
      if (hash(i + 3) > .35 + .6 * k) continue;
      const gx = sunX(t) + (hash(i) - .5) * 2 * spread;
      const g2 = clamp(frac(t * (.6 + hash(i) * .5)) * 3);
      inkLine([[gx, gy], [gx + 14 + hash(i + 5) * 30 + g2 * 10, gy + jit(2)]],
        1.4, cols, 'ink', 0);
    }
  }

  // ---------- waves ----------
  function waveRow(t, i, y0, amp, lam, sp, th, op) {
    boilSeed('su-wa' + i);
    const night = seg(t, 12.5, T_END);
    const col = khex(t, [[0, '#8ED0C8'], [9.5, '#7E9EC9'], [T_C, '#5F6CA8'], [T_END, '#3A4578']]);
    const foam = mixCol(PAL.cream, '#9FB4D8', .18 + .5 * night);
    const bob = Math.sin(t * .8 + i * 1.7) * 5;
    const amp2 = amp * (1 + .22 * Math.sin(t * .5 + i * 2));
    const pts = [];
    for (let x = -140; x <= W + 160; x += 140) {
      pts.push([x, y0 + bob + amp2 * Math.sin((x / lam + t * sp) * TAU) + jit(1.5)]);
    }
    const crest = through(pts, 5);
    const belly = crest.concat(crest.map(([x, y]) => [x, y + th + amp * .8]).reverse());
    paint(belly, { wash: col, washOp: Math.min(205, Math.round(op * 1.35 * (1 - .3 * night))), ink: null });
    inkLine(crest, 1.1, foam, 'ink', .5);                        // the crisp foam line
    const n = Math.floor((W + 300) / 150);
    for (let j = 0; j < n; j++) {                                // foam caps where the crest peaks
      boilSeed('su-wf' + i + '-' + j);
      const x = j * 150 + hash(j + i * 7) * 90;
      const ph = Math.sin((x / lam + t * sp) * TAU);
      if (ph < .55) continue;
      const y = y0 + bob + amp2 * ph, r = 5 + 5 * hash(j + i * 3);
      paint(ellPts(x, y - 2, r * 2.4, r, 10, 1), { wash: foam, washOp: 200, ink: null });
    }
  }

  // ---------- beach ----------
  const sandTop = x => 1012 + Math.sin(x * .008 + 2) * 10;
  function sand(t) {
    const col = khex(t, [[0, '#EAD2A6'], [9.5, '#CBB492'], [T_C, '#AE9D8C'], [17, '#8A8592'], [T_END, '#6E6C86']]);
    boilSeed('su-sand');
    const pts = [];
    for (let x = -100; x <= W + 120; x += 220) pts.push([x, sandTop(x) + jit(2)]);
    paint(through(pts, 4).concat([[W + 200, H + 500], [-300, H + 500]]), { wash: col, washOp: 255, ink: null });
    boilSeed('su-dune');
    inkLine([[-100, 1052 + jit(2)], [500, 1044 + jit(2)], [1200, 1054 + jit(2)], [W + 100, 1048 + jit(2)]],
      .9, khex(t, [[0, '#C9AE7E'], [T_END, '#57567A']]), 'inkfine', .5);
    for (let i = 0; i < 22; i++) {                               // pebbles on the sand
      boilSeed('su-peb' + i);
      const x = 40 + hash(i) * 1780, y = 1046 + hash(i + 4) * 30, r = 3 + 3.4 * hash(i + 9);
      paint(ellPts(x, y, r * 1.5, r, 9, i), {
        wash: khex(t, [[0, '#C8B08C'], [T_END, '#5D5D80']]), washOp: 220,
        ink: mixCol(PAL.ink, '#57567A', .35), sw: .5,
      });
    }
  }

  // the tide: water laps the sand edge, foam breathes in and out
  function shoreFoam(t) {
    const night = seg(t, 12.5, T_END);
    const seaNow = khex(t, [[0, '#6FAFA8'], [9.5, '#56689F'], [T_C, '#3E4E8F'], [T_END, '#262F5E']]);
    const foam = mixCol(PAL.cream, '#9FB4D8', .12 + .45 * night);
    const tide = Math.sin(t * .32) * 20 + Math.sin(t * .9) * 5;
    const foamY = 1012 - tide;
    boilSeed('su-lap');
    paint(rectPts(-100, foamY, W + 200, H, 2), { wash: seaNow, washOp: 255, ink: null });
    boilSeed('su-wet');
    paint(ellPts(960, foamY + 12, 1000, 26, 26, 6),
      { fill: mixCol(PAL.cream, seaNow, .45), fillOp: 70, bleed: .4, ink: null });
    boilSeed('su-foam');
    const pts = [];
    for (let x = -120; x <= W + 140; x += 150) {
      pts.push([x, foamY - 6 + Math.sin(x * .013 + t * 1.1) * 7 + jit(2)]);
    }
    const edge = through(pts, 4);
    const band = edge.concat(edge.map(([x, y]) => [x, y + 20 + 10 * Math.abs(Math.sin(x * .009 + t * .7))]).reverse());
    paint(band, { wash: foam, washOp: 190, ink: null });
    for (let j = 0; j < 14; j++) {                               // bubbles left on the wet sand
      boilSeed('su-bub' + j);
      const ph = frac(t * .32 + j * .71);
      const bx = j * 143 - 60 + hash(j) * 60;
      const by = foamY + 24 + ph * 18 * hash(j + 3);
      if (by > H + 10) continue;
      const r = (3.5 + hash(j + 2) * 4) * (1 - ph * .6);
      paint(ellPts(bx, by, r * 1.6, r, 9, j), { wash: foam, washOp: 90 * (1 - ph), ink: null });
    }
  }

  // the driftwood log Clawd sits on
  function log(t) {
    const col = khex(t, [[0, '#B98A5E'], [13.6, '#97785C'], [T_END, '#5E5470']]);
    const dk = khex(t, [[0, '#8A6248'], [T_END, '#4A4462']]);
    boilSeed('su-log');
    paint(rrPts(LOGX - 190, LOGTOP, 380, 66, 30, 3), { wash: col, washOp: 255, ink: mixCol(PAL.ink, '#3B4780', .1), sw: 1.2 });
    boilSeed('su-logd');
    paint(ellPts(LOGX - 178, LOGTOP + 34, 16, 22, 12, 2), { wash: dk, washOp: 220, ink: mixCol(PAL.ink, '#3B4780', .1), sw: .7 });
    for (let i = 0; i < 3; i++) {                                // wood grain curves
      boilSeed('su-lgr' + i);
      const g0 = LOGTOP + 14 + i * 14;
      inkLine([[LOGX - 120 + i * 40, g0], [LOGX - 40 + i * 60, g0 + 3], [LOGX + 90 + i * 30, g0 - 3]],
        .7, mixCol(dk, PAL.ink, .25), 'inkfine', .4);
    }
  }

  // shells + a starfish by the log
  function props(t) {
    boilSeed('su-shell');
    paint([[1018, 1021], [1044, 1016], [1052, 1036], [1034, 1040]],
      { wash: khex(t, [[0, '#F5DCAE'], [T_END, '#6A688A']]), ink: mixCol(PAL.ink, '#57567A', .3), sw: .6 });
    for (let k = 0; k < 3; k++) inkLine([[1026 + k * 9, 1030], [1027 + k * 9, 1042 + k]], .6,
      mixCol(PAL.ink, '#57567A', .3), 'inkfine', .4);
    boilSeed('su-star');
    paint(starPts(890, 1036, 11, .45, 5, .4),
      { wash: khex(t, [[0, '#E88A8A'], [17, '#8A5F78']]), ink: mixCol(PAL.ink, '#57567A', .3), sw: .7 });
  }

  // ---------- palm (left edge, silhouette-dark) ----------
  function palm(t) {
    const sway = wob(t, .5) * .05;
    const fill = khex(t, [[0, '#5C7D8A'], [9.5, '#4A5078'], [T_C, '#393F66'], [T_END, '#2C3050']]);
    push(); translate(90, 640); rotate(sway * .4);
    boilSeed('su-trunk');
    paint(ribbon([[-190, 640], [-110, 400], [-40, 170], [26, -318], [44, -352]], 44, 18),
      { wash: fill, washOp: 252, ink: mixCol(PAL.ink, '#2C3050', .2), sw: 1 });
    for (let i = 0; i < 7; i++) {
      boilSeed('su-lf' + i);
      const a = -Math.PI / 2 + (i - 3) * .48 + sway * (1 + (i % 2));
      const len = 205 + 60 * hash(i + 3);
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len * .75 + len * .28;   // fronds droop
      paint(ribbon([[44, -352], [44 + dx * .4, -352 + dy * .3 - 12], [44 + dx, -352 + dy]], 20, 5),
        { wash: fill, washOp: 252, ink: null });
    }
    pop();
  }

  // ---------- gulls ----------
  function gull(id, x, y, s, fl) {
    boilSeed('su-gl' + id);
    const f = Math.sin(fl) * 5 * s, c = mixCol(PAL.ink, '#3D4568', .3);
    inkLine([[x - 15 * s, y], [x - 6 * s, y - 6 * s + f], [x, y]], 1.5, c, 'ink', .5);
    inkLine([[x, y], [x + 6 * s, y - 6 * s + f], [x + 15 * s, y]], 1.5, c, 'ink', .5);
  }
  function birds(t) {
    if (t < 8.5) {
      const k1 = seg(t, 1.0, 7.6); if (k1 > 0 && k1 < 1) gull(1, lerp(380, 1560, k1) + wob(t, .5) * 14, 280 - k1 * 30 + wob(t, .4) * 16, 1.55, t * 9);
      const k2 = seg(t, 3.4, 7.4); if (k2 > 0 && k2 < 1) gull(2, lerp(1500, 300, k2), 370 + k2 * 40, 1.2, t * 10 + 2);
    }
    if (t > 15.5) {                                              // distant gulls heading home in the blue hour
      const k = seg(t, 15.5, 19.0);
      gull(3, lerp(1330, 1560, k) + wob(t, .5) * 8, 250 - k * 20, .85, t * 8);
      gull(4, lerp(1400, 1620, k), 292 - k * 14, .65, t * 9 + 1);
    }
  }

  // ---------- the character ----------
  function hero(t, lt, shot) {
    const u = shot === 'B' ? 30 : 20;
    const X = LOGX + 4, gySit = LOGTOP - 4 + 3.9 * u;   // noLegs body bottom sits 2u above the feet line: sink him onto the log
    const sit = { noLegs: true, sq: .05, aL: -.35, aR: -.45 };
    if (shot === 'A') {
      if (lt < 4.35) {                                           // hasn't reached the log yet
        const w = stroll(t, .45, 4.3, 260, 1000, u);
        const mood = emotions(lt, [[0, 'happy'], [4.2, 'happy']]);
        clawd(w.x, sandTop(w.x) - 2, u, { ...mood, view: w.view, flip: w.flip, walk: w.walk, dy: (mood.dy || 0) + w.dy });
        return;
      }
      if (lt < 4.8) {                                            // arrive, turn to the sea
        const mood = emotions(lt, [[0, 'happy']]);
        const tv = turn(lt, 4.35, 4.75, .25, .5);
        clawd(1000, sandTop(1000) - 2, u, { ...mood, ...tv, view: tv.view, flip: tv.flip, dy: mood.dy || 0 });
        return;
      }
      if (lt < 5.3) {                                            // hop onto the log
        const mood = emotions(lt, [[0, 'excited']]);
        const j = jump(lt, 4.8, 5.25, 2.4), k = ease(seg(lt, 4.8, 5.25));
        clawd(lerp(1000, X, k), lerp(sandTop(1000), gySit, k), u,
          { ...mood, view: 'back', noLegs: true, dy: j.dy, sq: j.sq, aL: -.3, aR: -.3 });
        return;
      }
      const mood = emotions(lt, [[0, 'happy'], [1.4, 'neutral']]);   // sitting, watching
      clawd(X, gySit, u, { ...mood, ...sit, dy: (mood.dy || 0) - 1.9 + .12 * Math.sin(lt * 2.1),
        aL: -.35 + .1 * Math.sin(lt * 1.7), aR: -.45 - .07 * Math.sin(lt * 1.7) });
      return;
    }
    if (shot === 'B') {
      const mood = emotions(lt, [[0, 'neutral'], [12.55, 'surprised', { lookY: -.4 }], [12.94, 'love']]);
      const tj = turn(lt, 12.72, 13.12, .5, .05);
      const breathe = -1.9 - .12 * Math.exp(-Math.pow(((lt - 7.2) % 3.1 - 1.5) / 1.1, 2));
      const o = { ...mood, ...sit, view: 'back', dy: (mood.dy || 0) + breathe, sq: .05 + (mood.sq || 0) * .5 };
      if (lt >= 12.72) {                                         // turns around, moved by the sunset
        o.view = tj.view; o.flip = tj.flip; o.aL = .8; o.aR = .95;
        o.dy = (mood.dy || 0) - 1.9; o.sq = -.06 + (mood.sq || 0) * .5;
      }
      clawd(X, gySit, u, o);
      return;
    }
    // C: watches the afterglow, then gets sleepy as the stars come out
    const mood = emotions(lt, [[0, 'neutral'], [0.9, 'proud'], [2.3, 'sleepy']]);
    const tj = turn(lt, 1.7, 2.1, .5, .05);
    const o = { ...mood, ...sit, view: 'back', dy: (mood.dy || 0) - 1.9 + .12 * Math.sin(lt * 2) };
    if (lt >= 1.7) { o.view = tj.view; o.flip = tj.flip; }
    clawd(X, gySit, u, o);
  }

  // ============================================================================ shots
  function scenery(t) {
    sky(t); stars(t); moon(t);
    const e = elev(t), sy = sunY(t);
    paint(ellPts(sunX(t), sy, 66, 66, 26, 2),                    // the sun disc (the sea paints over its lower half)
      { wash: khex(t, [[0, '#FFF0B8'], [9.5, '#FFC97E'], [12.6, '#FFA268']]),
        fill: khex(t, [[0, '#FFD98A'], [12.6, '#F0876A']]), fillOp: 90, tex: .2, ink: null });
    sea(t); glitter(t);
    glow(sunX(t), sy - 20, lerp(330, 230, 1 - e),
      khex(t, [[0, '#FFE9A8'], [9.5, '#FFB35C'], [12.6, '#FF8F6B']]), .5 + .35 * e);
    lighthouse(t); boat(t); birds(t);
    waveRow(t, 0, 645, 12, 460, .27, 24, 110);
    waveRow(t, 1, 745, 18, 580, -.2, 32, 125);
    waveRow(t, 2, 855, 24, 700, .16, 42, 140);
    sand(t); shoreFoam(t); props(t); log(t); palm(t);
  }

  function shotA(t, lt, dur) {
    camBegin(kf(lt, [[0, 900], [T_B, 950]]), kf(lt, [[0, 545], [T_B, 555]]), kf(lt, [[0, .98], [T_B, 1.04]]));
    scenery(t);
    hero(t, lt, 'A');
    camEnd();
    boilSeed('su-ta');
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, WIPE);
  }

  function shotB(t, lt, dur) {
    camBegin(LOGX + kf(lt, [[0, 28], [dur, 8]]), kf(lt, [[0, 762], [6, 748]]), kf(lt, [[0, 1.4], [6.2, 1.5]]));
    scenery(t);
    hero(t, lt, 'B');
    camEnd();
    if (lt > 12.6 && lt < 13.1) flash(.12 * Math.exp(-(lt - 12.6) * 9), '#FFE0A8');   // the last glint at the horizon kiss
    boilSeed('su-tb');
    if (lt < .3) brushWipe(.5 + lt / .6, WIPE);
  }

  function shotC(t, lt, dur) {
    camBegin(960 + 8 * Math.sin(lt * .4), kf(lt, [[0, 560], [dur, 572]]), kf(lt, [[0, 1.0], [1.6, 1.02], [dur, 1.06]]));
    scenery(t);
    hero(t, lt, 'C');
    const eye = toScreen(LOGX + 4, LOGTOP - 4 - 4 * 20);
    camEnd();
    boilSeed('su-tc');
    if (lt < .3) brushWipe(.5 + lt / .6, WIPE);
    if (lt > 4.2) {                                              // iris to the face: hold, then shut
      const k1 = ease(seg(lt, 4.2, 4.75)), k2 = easeIn(seg(lt, 5.3, 5.55));
      iris(...eye, k2 < 1 ? lerp(lerp(1500, 340, k1), 0, k2) : 0);
    }
  }

  shots([[0, shotA], [T_B, shotB], [T_C, shotC]]);
})();
