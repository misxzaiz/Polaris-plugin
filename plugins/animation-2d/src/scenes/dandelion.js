// dandelion.js: 《蒲公英》— a spring-day short. Clawd finds a dandelion on a hill, blows it, but the last
// seed loops back on the wind and lands on his nose; a sneeze launches it up, it settles on his head, and by
// the time he sees it in a puddle's reflection it has bloomed. 5 shots, 21.6 s, bpm 92. See STORYBOARD.md.
//
// Shot A 0–4.4   wide   iris in — stroll in, find the dandelion, lean in        → brush wipe
// Shot B 4.4–9.2 medium  wind-up, blow, seeds sail off, one loops back to nose  → camera push carried on
// Shot C 9.2–13.8 close   cross-eyed stare, puff attempts, sneeze, seed to head → camera carries up & down
// Shot D 13.8–17.8 medium pat the head, puddle reflection, bloom, jump for joy  → cut on action
// Shot E 17.8–21.6 wide   trot off right, turn to camera, heart, iris shut      → out
//
// Everything is a pure function of t; every element gets its own boil seed. No text anywhere.

(() => {
  const WIPE = [mixCol(PAL.sap, PAL.teal, .4), mixCol(PAL.cream, PAL.sky, .35)];
  const FR = [960, 1180, 1400, 330];                                   // the front hill (cx, cy, rx, ry)
  const hillY = x => FR[1] - FR[3] * Math.sqrt(Math.max(0, 1 - ((x - FR[0]) / FR[2]) ** 2));
  const DX = 1190, DY = hillY(DX) + 6;                                 // the dandelion's ground point
  const BLOSSOM = [DX, DY - 78];                                       // the puff sits here (before the blow)
  const STAND = 1105;                                                  // where Clawd stands from shot A on
  const UWIND = { A: 17, B: 24, C: 46, D: 26, E: 19 };                 // per-shot character scale

  // Wind strength over the video: idle breeze, the blow, its tail, the sneeze, the ending breeze.
  const windAt = t => clamp(
    .2
    + .8 * Math.exp(-Math.pow((t - 5.55) / .7, 2))
    + .3 * Math.exp(-Math.pow((t - 7.1) / 1.1, 2))
    + .55 * Math.exp(-Math.pow((t - 11.8) / .4, 2))
    + .12 * Math.exp(-Math.pow((t - 18.6) / 2.2, 2))
  );

  // ---------- scenery ----------
  function dandelion(t, wind) {
    boilSeed('das');
    const pf = 1 - seg(t, 5.4, 5.65) * .88;                            // the puff empties when blown
    if (pf <= .12) return;
    const sway = wob(t, .8, 1.2) * (2 + 7 * wind);
    boilSeed('dastem');
    inkLine(through([[DX - 2, DY + 2], [DX + sway * .35, DY - 38], [DX + sway, DY - 74]]),
      1.4, mixCol(PAL.sap, PAL.ink, .4), 'ink', .55);
    for (let j = 0; j < 10; j++) {                                     // the puff: soft white circles
      boilSeed('dapuff' + j);
      const a = j / 10 * TAU, r = (4 + 4.6 * hash(j + 5)) * pf;
      paint(ellPts(DX + sway + Math.cos(a) * 12 * pf, DY - 80 + Math.sin(a) * 10 * pf, r, r, 8),
        { wash: mixCol(PAL.cream, PAL.paper, .4), ink: null });
    }
    for (let j = 0; j < 8; j++) {                                      // thin fluff sparks
      boilSeed('dafl' + j);
      const a = j / 8 * TAU + .3;
      inkLine([[DX + sway + Math.cos(a) * 5 * pf, DY - 80 + Math.sin(a) * 5 * pf],
               [DX + sway + Math.cos(a) * 17 * pf, DY - 80 + Math.sin(a) * 15 * pf]],
        .55, PAL.cream, 'inkfine', 0);
    }
  }

  function day(t, wind) {
    boilSeed('dsky');
    paint(rectPts(-700, -500, W + 1400, H + 1000), { wash: mixCol(PAL.cream, PAL.sky, .5), ink: null });
    paint(ellPts(W * .32, H * .16, W * .55, H * .4, 30, 8),
      { fill: mixCol(PAL.cream, PAL.sky, .75), fillOp: 150, bleed: .3, tex: .45, ink: null });
    glow(1640, 195, 230, '#FFE9A8', .45);                              // the sun: real light
    boilSeed('dsun');
    paint(ellPts(1640, 195, 60, 60, 24, 1), { wash: PAL.cream, fill: PAL.ochre, fillOp: 45, ink: null });
    boilSeed('dback');
    paint(ellPts(1500, 1170, 1000, 480, 40, 10),
      { wash: mixCol(PAL.violet, PAL.cream, .58), fill: mixCol(PAL.teal, PAL.cream, .4), fillOp: 90, bleed: .25, tex: .55, ink: null });
    boilSeed('dfront');
    paint(ellPts(...FR, 40, 2),
      { wash: mixCol(PAL.sap, PAL.teal, .2), fill: mixCol(PAL.sap, PAL.cream, .2), fillOp: 85, bleed: .08, tex: .5, ink: PAL.ink, sw: 1 });
    for (let i = 0; i < 13; i++) {                                     // little meadow daisies
      boilSeed('dfl' + i);
      const fx = 130 + hash(i) * 1650, fy = hillY(fx) + 34 + hash(i + 40) * 150, r = 4.5 + 3 * hash(i + 9);
      paint(starPts(fx, fy, r * 2, .5, 5, hash(i + 3) * 3),
        { wash: hash(i + 2) > .6 ? PAL.rose : PAL.cream, fill: PAL.cream, fillOp: 60, ink: null });
      paint(ellPts(fx, fy, r * .5, r * .5, 8), { wash: PAL.ochre, ink: null });
    }
    for (let i = 0; i < 22; i++) {                                     // grass tufts that lean with the wind
      boilSeed('dtu' + i);
      const a = -Math.PI / 2 + (hash(i + 7) - .5) * 1.7;
      const x = FR[0] + Math.cos(a) * (FR[2] * (.5 + .55 * hash(i + 2)));
      const y = hillY(x) + 14 + hash(i + 4) * 130, sw = wob(t, .55, hash(i) * 3) * (3 + 9 * wind);
      for (const k of [-1, 0, 1])
        inkLine([[x + k * 6, y], [x + k * 10 + sw + wind * 7, y - 18 - 9 * hash(i + k + 30)]],
          .65, mixCol(PAL.sap, PAL.cream, .4), 'inkfine', .4);
    }
    dandelion(t, wind);
  }

  function streaks(t, y0) {                                            // thin crisp wind curls over the hill
    for (let i = 0; i < 3; i++) {
      boilSeed('dwk' + i);
      const k = frac(t * 1.4 + i * .41); if (k > .9) continue;
      const x = lerp(1060, 1680, ease(k)) + i * 46, y = y0 + i * 38 + Math.sin(k * 7 + i) * 10;
      inkLine(through([[x, y], [x + 42, y - 30], [x + 108, y - 6], [x + 148, y + 20]]),
        1.5, mixCol(PAL.cream, PAL.paper, .55), 'inkfine', .6);
    }
  }

  // ---------- the seed (boomerang, sneeze flight, nose / head passengers) ----------
  function seedSpr(id, x, y, rot, s = 1, op = 255) {
    if (op <= 0) return;
    glow(x, y, 34 * s, '#FFD96A', .22 * clamp(op / 255));               // a warm halo so it reads against the sky
    boilSeed('dsd' + id);
    paint(starPts(x, y, 9 * s, .42, 4, rot), { wash: PAL.cream, washOp: Math.min(255, op), ink: mixCol(PAL.ochre, PAL.ink, .35), sw: .8 });
    for (let k = 0; k < 5; k++) {
      const a = rot + TAU * k / 5 + .25;
      inkLine([[x + Math.cos(a) * 4.5 * s, y + Math.sin(a) * 4.5 * s],
               [x + Math.cos(a) * 13 * s, y + Math.sin(a) * 13 * s],
               [x + Math.cos(a) * 16.5 * s + jit(1), y + Math.sin(a) * 16.5 * s]],
        .7, mixCol(PAL.ochre, PAL.paper, .35), 'inkfine', .5);
    }
    paint(ellPts(x, y, 3.2 * s, 3.2 * s, 8), { wash: mixCol('#C9A15C', PAL.ochre, .4), ink: null });
  }

  // The plant on Clawd's head. kOpen: 0 = closed fluffy seed, 1 = bloomed daisy. Called in the draw hook (body-local).
  function plant(u, sw, kOpen, sway = 0, glint = 0) {
    boilSeed('dplant');
    const top = -8.05 * u + Math.abs(sway) * .2 * u;
    inkLine([[0, top + .7 * u], [sway * .5 * u, top + .1 * u], [sway * u, top - .7 * u]],
      Math.max(.45, sw * .8), mixCol(PAL.sap, PAL.ink, .35), 'inkfine', .55);
    const hx = sway * u, hy = top - 1.15 * u;
    if (kOpen < 1) {                                                   // the seed as it landed
      boilSeed('dplantseed');
      const s = .42 * u * (1 - .5 * kOpen);
      paint(starPts(hx, hy, s * .9, .42, 4, .4), { wash: PAL.cream, ink: null });
      paint(ellPts(hx, hy, s * .3, s * .3, 8), { wash: mixCol('#C9A15C', PAL.ochre, .4), ink: null });
    }
    if (kOpen > 0) {                                                   // the bloom
      boilSeed('dplantfl');
      paint(starPts(hx, hy, .85 * u * kOpen, .5, 6, sway * 2 + 3 * kOpen), { wash: PAL.cream, fill: PAL.cream, fillOp: 40 * kOpen, ink: PAL.ink, sw: Math.max(.4, sw * .6) });
      paint(ellPts(hx, hy, .22 * u * kOpen, .22 * u * kOpen, 8), { wash: PAL.ochre, ink: null });
      if (glint > 0 && glint < 1)
        paint(starPts(hx + .6 * u, hy - .55 * u, .34 * u * backOut(glint) * (1 - glint * .5), .3, 4, glint * 3),
          { wash: PAL.cream, washOp: 255 * (1 - glint * glint), ink: null });
    }
  }
  const bloomK = t => backOut(seg(t, 14.35, 14.8));                    // it blooms as he pats it — he doesn't see it yet

  // ---------- shot A: the find ----------
  function shotA(t, lt, dur) {
    const wind = windAt(t), u = UWIND.A;
    camBegin(kf(t, [[0, 880], [4.4, 935]]), kf(t, [[0, 560], [4.4, 528]]), kf(t, [[0, 1], [4.4, 1.04]]));
    day(t, wind);
    const walk = stroll(t, .55, 2.05, 320, STAND, u);
    const x = t < 2.05 ? walk.x : STAND;
    const gy = hillY(x) + 4, gyF = hillY(STAND) + 4;
    const mood = emotions(t, [[0, 'happy'], [2.02, 'surprised', { lookX: .6, lookY: .55 }],
                              [2.55, 'excited', { lookX: .7, lookY: .5 }], [3.6, 'excited', { lookX: .62, lookY: .45 }]]);
    let pose;
    if (t < 2.05) pose = { view: walk.view, walk: walk.walk, dy: walk.dy };
    else if (t < 2.3) pose = turn(t, 2.02, 2.3, .25, .12);
    else pose = { view: 'q', flip: false };
    const lean = ease(seg(t, 2.9, 3.5));                               // lean in toward the flower
    const xl = x + lean * 10;
    clawd(xl, gy, u, { ...mood, ...pose, rot: (mood.rot || 0) + .07 * lean * Math.sign(DX - x), sq: (mood.sq || 0) + .14 * lean });
    const eye = toScreen(xl, gyF - 4.6 * u);
    camEnd();
    if (lt < .5) iris(...eye, lerp(0, 1500, easeIn(lt / .5)));         // open on Clawd
    boilSeed('dta');
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, WIPE);
  }

  // ---------- shot B: the blow and the boomerang ----------
  function shotB(t, lt, dur) {
    const wind = windAt(t), u = UWIND.B, X = STAND, gy = hillY(X) + 4;
    const NOSE = [X + .12 * u, gy - 4.45 * u];
    camBegin(kf(lt, [[0, 1135], [dur, 1128]]) + 7 * Math.sin(lt * .7), kf(lt, [[0, 640], [2.6, 630], [dur, 555]]),
             kf(lt, [[0, 1.14], [2.5, 1.2], [dur, 1.42]]));            // the push carries into shot C
    day(t, wind);
    if (wind > .5 && lt > .95 && lt < 2.3) streaks(t, 640);
    // the seeds: 1..7 sail off right through the open sky; seed 0 leaves, loops back and lands on the nose
    for (let i = 1; i < 8; i++) {
      if (lt <= 1.0) break;
      const k = seg(lt, 1.0 + i * .045, 1.0 + i * .045 + 1.9); if (k >= .98) continue;
      const D = 520 + 380 * hash(i + 3), rise = 240 + 180 * hash(i + 70);
      const sx = BLOSSOM[0] + D * easeOut(k) + wob(t, .6, i) * 10;
      const sy = BLOSSOM[1] - rise * (1 - Math.exp(-k * 3.2));
      seedSpr(i, sx, sy, -Math.PI / 2 + .3 * Math.sin(lt * 3 + i), 1.25 - .35 * k, 255 - 225 * clamp((k - .8) / .18));
    }
    const blos = ease(seg(lt, 1.0, 1.85));
    if (lt > 1.0 && lt < 1.85) seedSpr(0, BLOSSOM[0] + 720 * backOut(blos), BLOSSOM[1] - 215 * Math.sin(Math.PI * blos * .92), -Math.PI / 2, 1, 255);
    else if (lt >= 1.85 && lt < 3.15) {                                // coming round again, from off right
      const k = ease(seg(lt, 1.85, 3.15)), p = arcPt([1860, 405], NOSE, 210, k);
      seedSpr(0, p[0], p[1], -Math.PI / 2 + 2.4 * k, 1.1, 255);
    }
    const mood = emotions(lt, [[0, 'happy'], [.5, 'determined', { lookX: .85 }],
                               [1.0, 'happy', { lookX: .85, lookY: -.3 }], [1.85, 'happy', { lookX: .8, lookY: -.25 }],
                               [2.5, 'surprised', { lookX: .95, lookY: -.1 }], [3.2, 'confused', { lookY: .92 }]]);
    let pose;
    if (lt < .5) pose = { view: 'q', aR: -.1 };
    else if (lt < 1.0) { const k = seg(lt, .5, 1.0); pose = { view: 'q', sq: -.13 * k, aR: .25 * k, aL: .15 * k }; }   // inhale
    else if (lt < 1.35) { const k = seg(lt, 1.0, 1.35); pose = { view: 'q', sq: -.22, aR: .9 * backOut(k), aL: .45 * backOut(k), dy: -1.1 * Math.sin(Math.PI * k) }; }   // the puff
    else pose = { view: 'q', aR: lerp(.9, .25, ease(seg(lt, 1.35, 2.1))), aL: lerp(.45, .15, ease(seg(lt, 1.35, 2.1))) };
    clawd(X, gy, u, { ...mood, ...pose, sq: (mood.sq || 0) + (pose.sq || 0), dy: (mood.dy || 0) * (lt < 1.0 ? .4 : 1) + (pose.dy || 0) });
    if (lt >= 3.15) seedSpr(0, NOSE[0] + jit(.7), NOSE[1] + jit(.5), -Math.PI / 2 + wob(lt * 2.4) * .3, 1.1, 255);   // passenger on the nose
    camEnd();
    boilSeed('dtb');
    if (lt < .3) brushWipe(.5 + lt / .6, WIPE);
  }

  // ---------- shot C: the stare, the puffs, the sneeze ----------
  function shotC(t, lt, dur) {
    const wind = windAt(t), u = UWIND.C, X = STAND, gy = hillY(X) + 4;
    const NOSE = [X + .12 * u, gy - 4.5 * u], HEAD = [X, gy - 8.55 * u], APEX = [X + 200, gy - 9.6 * u - 40];
    const shk = lt > 2.55 ? shakeXY(t, 7 * Math.exp(-(lt - 2.55) * 10)) : [0, 0];   // the sneeze shakes the camera
    camBegin(X + 5 * Math.sin(lt * .5) + shk[0], kf(lt, [[0, gy - 5.2 * u], [2.0, gy - 5.2 * u], [3.0, HEAD[1] + 60], [dur, HEAD[1] + 120]]) + shk[1],
             kf(lt, [[0, 1.5], [1.2, 1.44], [2.55, 1.36], [3.2, 1.27], [dur, 1.22]]));
    day(t, wind);
    if (lt > 2.5 && lt < 3.1) streaks(t, gy - 3 * u);
    const mood = emotions(lt, [[0, 'confused', { lookY: .85 }], [1.05, 'determined', { lookY: .8, lookX: .05 }],
                               [2.0, 'determined', { lookY: .78 }], [2.62, 'dizzy', { lookY: -.35, lookX: .3 }],
                               [3.55, 'confused', { lookY: -.1, lookX: 0 }]]);
    let pose = { view: 'front' };
    const sqz = ease(seg(lt, 2.0, 2.52)) * (lt < 2.55 ? 1 : Math.exp(-(lt - 2.55) * 9));   // the scunch before the sneeze
    if (lt <= 2.55) pose.squint = .85 * sqz;
    else { pose = { view: 'front', mouth: 'laugh' }; }
    if (lt > 2.55 && lt < 3.1) { const j = jump(lt, 2.55, 2.95, 1.6); pose.dy = j.dy; pose.sq = (pose.sq || 0) + j.sq; }  // little recoil hop
    let mt;
    if ((lt > 1.1 && lt < 1.45) || (lt > 1.65 && lt < 2.0)) mt = 'o';   // the two failed puffs
    if (lt > 2.45 && lt < 2.9) mt = 'O';                               // ACHOO
    if (lt > 3.3) mt = 'cat';
    clawd(X, gy, u, { ...mood, ...pose, ...(mt ? { mouth: mt } : {}),
             dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0) });
    // the nose seed: jiggling under the puffs, then the sneeze flight up and gently down to the head
    if (lt < 2.55) {
      const puff = (lt > 1.1 && lt < 1.45) || (lt > 1.65 && lt < 2.0);
      seedSpr(0, NOSE[0] + jit(puff ? 2.5 : .8), NOSE[1] + jit(puff ? 2 : .5),
        -Math.PI / 2 + wob(lt * 2.6) * .3, 1.3 + (puff ? .12 * Math.sin(lt * 40) : 0), 255);
    } else if (lt < 3.55) {
      const k = ease(seg(lt, 2.55, 3.55)), p = arcPt(NOSE, APEX, 240, k);
      seedSpr(0, p[0], p[1], -Math.PI / 2 + k * 4, 1, 255);
    } else if (lt < 4.05) {
      const k = ease(seg(lt, 3.55, 4.05)), p = arcPt(APEX, HEAD, 130, k);
      seedSpr(0, p[0], p[1], -Math.PI / 2 + 4 + .8 * Math.sin(k * 9), 1, 255);
    } else seedSpr(0, HEAD[0] + jit(.6), HEAD[1] + jit(.4), -Math.PI / 2, 1, 255);   // it stays where it landed
    const az = lt - 2.55;                                              // sneeze puffs in front of the mouth
    if (az > 0 && az < .45) {
      for (let i = 0; i < 3; i++) {
        boilSeed('dazf' + i);
        const q = seg(az, i * .05, .35 + i * .05);
        paint(ellPts(X + 30 + q * 130 * (1 + i * .3), NOSE[1] + 10 + i * 16 - q * 30, 16 + 34 * q, 12 + 22 * q, 12),
          { fill: PAL.cream, fillOp: 130 * (1 - q), ink: null });
      }
    }
    camEnd();
    if (lt > 2.56) flash(.28 * Math.exp(-(lt - 2.56) * 14), '#FFFDF6');   // a puff of white at the ACHOO
    boilSeed('dtc');                                                   // C carries the camera in from B: no wipe here
  }

  // ---------- shot D: the puddle discovery and the bloom ----------
  function shotD(t, lt, dur) {
    const wind = windAt(t), u = UWIND.D, X = 1000, gy = hillY(X) + 4;
    const PU = [1075, gy + 34];
    camBegin(kf(lt, [[0, 1085], [.6, 1075], [dur, 1010]]), kf(lt, [[0, 470], [1.0, 695], [dur, 705]]),
             kf(lt, [[0, 1.22], [1.0, 1.3], [2.0, 1.24], [dur, 1.2]]));
    day(t, wind);
    boilSeed('dpud');
    inkLine([[-100, gy + 42], [W / 2, gy + 50], [W + 100, gy + 44]], 0.8, mixCol(PAL.sap, PAL.ink, .3), 'inkfine', .5);
    paint(ellPts(...PU, 158, 30, 24, 2), { fill: mixCol(PAL.sky, PAL.cream, .3), fillOp: 215, ink: PAL.ink, sw: .8 });
    if (lt > .8) {                                                     // the reflection fades in
      const k = ease(seg(lt, .8, 1.5)), bk = clamp(bloomK(t)), wsh = wob(t, 1.1) * 2;
      push(); translate(PU[0], PU[1] - 2 + wsh); scale(1, .42);
      paint(starPts(0, 0, 20 * Math.max(.3, bk) * k, .5, 6, wob(t, 2) * .2), { wash: PAL.cream, washOp: 235 * k, ink: k > .5 ? mixCol(PAL.ochre, PAL.ink, .3) : null, sw: .6 * k });
      paint(ellPts(0, 0, 6.5 * Math.max(.3, bk) * k, 6.5 * Math.max(.3, bk) * k, 10), { wash: PAL.ochre, washOp: 235 * k, ink: null });
      pop();
      boilSeed('dpudgloss');
      inkLine([[PU[0] - 110 + jit(3), PU[1] + 8], [PU[0] - 46, PU[1] + 8]], .6, mixCol(PAL.cream, PAL.sky, .5), 'inkfine', .7);
    }
    const mood = emotions(lt, [[0, 'thinking', { lookY: .5 }], [.62, 'surprised', { lookY: .85, lookX: -.1 }],
                               [1.5, 'surprised'], [1.95, 'love'], [3.05, 'laugh']]);
    let pose;
    if (lt < .55) pose = { view: 'front', aR: 1.25 + .16 * Math.sin(lt * 11) };     // patting the top of the head — the seed blooms under his palm
    else if (lt < 1.1) pose = { view: 'front', aR: lerp(1.25, .2, ease(seg(lt, .55, 1.1))) };
    else if (lt < 3.2) { const j = jump(lt, 2.0, 2.55, 2.4); pose = { view: 'front', aR: .95, aL: .75, dy: j.dy, sq: j.sq }; }
    else pose = turn(lt, 3.2, 3.5, 0, .25);                            // turn right; E finishes the move
    if (lt > 3.5) { pose.view = 'q'; pose.flip = false; const j = jump(lt, 3.55, 4.0, 1.2); pose.dy = (pose.dy || 0) + j.dy; pose.sq = (pose.sq || 0) + j.sq; }   // hops off, E catches it
    clawd(X, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0),
             draw: (du, dsw) => plant(du, dsw, bloomK(t), ((mood.dy || 0) + (pose.dy || 0)) / 2.5, pulse(t, 4) * (lt > 1.6 ? 1 : 0)) });
    camEnd();
    boilSeed('dtd');
  }

  // ---------- shot E: the goodbye ----------
  function shotE(t, lt, dur) {
    const wind = windAt(t), u = UWIND.E;
    camBegin(960 + 10 * Math.sin(lt * .5), kf(lt, [[0, 555], [dur, 545]]), kf(lt, [[0, 1.0], [dur, 1.05]]));
    day(t, wind);
    const walk = stroll(t, 17.8, 19.0, 1000, 1430, u);
    const x = lt < 1.2 ? walk.x : 1430, gy = hillY(x) + 4, gyE = hillY(1430) + 4;
    const mood = emotions(lt, [[0, 'happy'], [1.5, 'excited'], [1.75, 'happy'], [2.05, 'love']]);
    let pose;
    if (lt < 1.2) pose = { view: walk.view, walk: walk.walk, dy: walk.dy };
    else if (lt < 1.45) pose = turn(lt, 1.2, 1.45, .25, 0);
    else pose = { view: 'front' };
    if (lt > 2.05 && lt < 2.75) { const j = jump(lt, 2.1, 2.6, 1.8); pose.dy = j.dy; pose.sq = j.sq; }   // a happy hop
    clawd(x, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0),
             draw: (du, dsw) => plant(du, dsw, bloomK(t), ((mood.dy || 0) + (pose.dy || 0)) / 2.5, pulse(t, 4)) });
    const eye = toScreen(x, gyE - 6 * u);
    camEnd();
    boilSeed('dte');
    if (lt > 2.4) {                                                    // iris to the face: hold, then shut
      const k1 = ease(seg(lt, 2.4, 2.9)), k2 = easeIn(seg(lt, 3.35, 3.78));
      iris(...eye, k2 < 1 ? lerp(lerp(1500, 300, k1), 0, k2) : 0);
    }
  }

  shots([[0, shotA], [4.4, shotB], [9.2, shotC], [13.8, shotD], [17.8, shotE]]);
})();
