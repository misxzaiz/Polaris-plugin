// scenes/cuihua.js: 《翠花》 — a 31 s New Year's Eve music-video for 翠花, a Northeast-Chinese girl in a red
// flower jacket, built on the Clawd engine (views, emotions, turns, dances all inherited).
//
// A (0–5.6)   dozy 翠花 in her snowy yard → a snowflake on her nose → the idea → she runs off right.  iris in / wipe out
// B (5.6–10.4) she presses a window paper, hangs and lights a lantern.                                     wipe in / wipe out
// C (10.4–15.8) dumpling table: she steals a hot one, gets scalded, huffs.                                 wipe in / wipe out
// D (15.8–21.2) a firecracker: light, scurry, crouch, BOOM, relief, she bounces off.                       wipe in / cut on action out
// E (21.2–26.0) 秧歌: 翠花 dances with a red fan, snow falling, then catches her breath, proud.             cut in / wipe out
// F (26.0–31.0) back in the yard at night: a warm bowl; the village lights ripple on; she smiles.          wipe in / iris out
(() => {
  const RED = ['#4A1420', '#7A1E2E'];   // film-wide wipe colour: deep festive red

  // ---------- shot A: the dozy yard ----------
  function shotYard(t, lt, dur) {
    const u = 19, x = 770, gy = 930;
    camBegin(lerp(900, 946, ease(seg(lt, 0, dur))) + 6 * Math.sin(lt * .5), 530, 1 + .04 * ease(seg(lt, 0, dur)));
    // far: night sky, moon, drifting clouds, snow-dusted pines, the dim village ridge
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: PAL.night, ink: null });
    paint(ellPts(150, 130, 60, 60, 20), { wash: PAL.cream, fill: PAL.ochre, fillOp: 40, ink: PAL.ink, sw: .8 });
    paint(ellPts(340, 210, 130, 62, 22), { fill: mixCol(PAL.indigo, PAL.night, .64), fillOp: 170, bleed: .24, tex: .62, ink: null });
    paint(ellPts(720, 300, 210, 105, 26), { fill: mixCol(PAL.indigo, PAL.night, .66), fillOp: 150, bleed: .22, tex: .6, ink: null });
    snow(t, 34, .5);
    pine(1500, 760, 46); pine(1600, 790, 34);
    for (const [px, py, s] of [[1150, 700, 40], [1330, 690, 30], [1580, 600, 26], [520, 690, 34], [700, 650, 24]]) pine(px, py, s);
    glow(980, 550, 230, '#FFC766', .12);
    housesRidge(1180, 700, 860, 210, lt, () => .5);
    // mid: snow banks, the fence, the yard floor
    paint(ellPts(1500, 940, 620, 200, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .55), fill: mixCol(PAL.sap, PAL.night, .8), fillOp: 130, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    paint(ellPts(540, 940, 660, 210, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .55), fill: mixCol(PAL.sap, PAL.night, .8), fillOp: 130, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    fence([560, 705, 850, 995, 1140, 1285], 912, 112);
    paint(rectPts(-400, 830, W + 800, 330, 4), { wash: mixCol(PAL.cream, PAL.sky, .42), fill: mixCol(PAL.cream, PAL.sky, .6), fillOp: 130, bleed: .05, tex: .7, ink: null });
    lantern(1420, 780, 42, 0, { rot: .06 });                       // the unlit gate lantern
    pot(560, 940, 62);
    boilSeed('those');
    for (let i = 0; i < 14; i++) { const h1 = hash(i * 3), h2 = hash(i * 5), h3 = hash(i * 7); paint(ellPts(h1 * W, 930 + h2 * 90, 6 + 14 * h3, 3 + 6 * h3, 8), { wash: PAL.cream, washOp: 150, ink: null }); }
    // 翠花: bored → a snowflake lands on her nose → the idea → runs out the gate
    const mood = emotions(lt, [[0, 'bored'], [1.25, 'surprised', { lookX: .3, lookY: 1 }], [1.95, 'happy'], [2.75, 'idea'], [3.35, 'excited']]);
    let pose;
    if (lt < 3.05) pose = { view: 'q', rot: -.02, aL: -1, aR: -1 };
    else if (lt < 3.18) pose = turn(lt, 3.05, 3.18, -.25, .25);     // turn into the run (drawn key views)
    else { const w = stroll(lt, 3.18, 4.6, 770, 1560, u); pose = { ...w, aL: .3, aR: -.2 }; }
    cuihua(x, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0), noLegs: false });
    if (lt >= 1.25 && lt < 1.95) {                                  // the snowflake on her nose
      const k = ease(seg(lt, 1.25, 1.95));
      paint(ellPts(x + .2 * u, 662 - k * u, 4.5, 4.5, 10), { wash: PAL.cream, washOp: 255, ink: null });
    }
    const eye = toScreen(x, gy - 5.5 * u);
    camEnd();
    snow(t, 26, 1.3);
    if (lt < .55) iris(...eye, lerp(0, 1500, easeIn(lt / .55)));    // iris in from 翠花
    boilSeed('wipeA');
    if (lt > dur - .35) brushWipe((lt - (dur - .35)) / .7, RED);
  }

  // ---------- shot B: the window paper + the lantern ----------
  // window frame 1000,380 w320 h280, centre 1140,520; sill at y≈674; bench top y=900
  function shotWindow(t, lt, dur) {
    const u = 26, x = 760, benchY = 900;
    camBegin(960 + 8 * Math.sin(lt * .5), 540, 1 + .02 * Math.sin(lt * .6));
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: mixCol('#4A3830', '#2E2726', .5), fill: mixCol('#4A3830', '#1F2550', .3), fillOp: 90, bleed: .08, tex: .7, ink: null });
    for (let i = 0; i < 26; i++) { const h1 = hash(i * 9); paint(rrPts(-200 + h1 * (W + 400), -160 + hash(i * 13) * (H + 320), 10 + 40 * hash(i * 5), 10 + 40 * hash(i * 7), 3), { fill: mixCol('#4A3830', '#1F2550', .5), fillOp: 60, bleed: .08, ink: null }); }
    glow(1140, 520, 240, '#FFB85C', .16);
    windowProps(1000, 380, 320, 280);
    paint(rectPts(-400, 660, W + 800, 480, 4), { wash: mixCol('#5C4939', '#2E2726', .45), fill: mixCol('#5C4939', '#1F2550', .3), fillOp: 130, bleed: .05, tex: .7, ink: null });
    paint(ellPts(1100, 940, 900, 260, 30, 6), { wash: mixCol(PAL.cream, PAL.sky, .5), fill: mixCol(PAL.cream, PAL.sky, .7), fillOp: 120, bleed: .08, tex: .7, ink: null });
    paint(rrPts(1760, 930, 130, 90, 10), { wash: '#D93A2E', fill: mixCol('#D93A2E', PAL.ochre, .2), fillOp: 80, ink: PAL.ink, sw: 1.1 });
    paint(rrPts(-60, 900, 620, 46, 12), { wash: mixCol('#5C4939', '#2E2726', .35), fill: mixCol('#5C4939', '#1F2550', .3), fillOp: 120, ink: PAL.ink, sw: 1.3 });
    // 翠花: cut (0–1.3), admire (1.3–2.6), hang the lantern (2.6–3.9), admire it lit (3.9–4.8)
    const mood = emotions(lt, [[0, 'neutral'], [1.35, 'happy'], [2.65, 'proud', { emote: 'spark' }], [3.9, 'excited'], [4.3, 'happy']]);
    let pose;
    if (lt < 1.3) pose = { view: 'q', aL: -1.4, aR: 1.3, rot: -.03, lookY: -.5 };
    else if (lt < 2.6) pose = { view: 'q', aL: -.4, aR: -.4, lookX: .35, rot: .02 };
    else if (lt < 3.9) pose = { view: 'q', aL: lerp(-.6, -.2, ease(seg(lt, 2.7, 3.6))), aR: lerp(-.6, 1.55, ease(seg(lt, 2.7, 3.6))), lookX: .8, lookY: .8, dy: -1.2 * ease(seg(lt, 2.7, 3.3)) };
    else pose = { view: 'q', aL: -.3, aR: -.4, lookX: .9, lookY: .4 };
    cuihua(x, benchY, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0) });
    // the lantern: from her hand up to the eave beside the window, then it lights
    const hangK = ease(seg(lt, 2.7, 3.5));
    const Ly = lerp(700, 462, hangK), Lx = lerp(952, 986, hangK);
    lantern(Lx, Ly, 34, seg(lt, 3.7, 4.1), { rot: .05 });
    if (lt > 1.35) chuanghua(1140, 520, 52);                        // the paper she cut, on the window
    const eye = toScreen(x, benchY - 5.5 * u);
    camEnd();
    snow(t, 20, .9);
    if (lt < .3) brushWipe(.5 + lt / .6, RED);
    boilSeed('wipeB');
    if (lt > dur - .35) brushWipe((lt - (dur - .35)) / .7, RED);
  }

  // ---------- shot C: the dumpling table ----------
  function shotDumpling(t, lt, dur) {
    const u = 24, x = 880, gy = 790;
    camBegin(lerp(880, 1020, ease(seg(lt, 0, dur))) + 8 * Math.sin(lt * .5), 560, 1.04);
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: mixCol('#5C4939', '#3E3329', .4), fill: mixCol('#5C4939', '#1F2550', .25), fillOp: 90, bleed: .08, tex: .7, ink: null });
    glow(700, 830, 300, '#FF8C4A', .22);
    glow(1150, 700, 200, '#F2C53D', .18);
    paint(ellPts(1600, 1010, 780, 250, 30, 6), { wash: mixCol(PAL.cream, PAL.ochre, .45), fill: mixCol(PAL.cream, PAL.ochre, .65), fillOp: 110, bleed: .06, tex: .7, ink: null });
    boilSeed('peppers');
    for (const [px, n] of [[400, 3], [1500, 3]]) for (let k = 0; k < n; k++) paint(ellPts(px + k * 26 - 26, 150 + k * 44, 12, 18, 10, 0, k), { wash: '#C0392B', fill: '#E2476E', fillOp: 90, bleed: .08, ink: PAL.ink, sw: .6 });
    inkLine([[340, 250], [340, 130]], 1.6, PAL.ink, 'dry', 0); inkLine([[1460, 250], [1460, 130]], 1.6, PAL.ink, 'dry', 0);
    paint(rrPts(-80, 690, 520, 36, 10), { wash: mixCol('#6B4E38', '#1F2550', .35), fill: mixCol('#6B4E38', '#3E3329', .4), fillOp: 130, ink: PAL.ink, sw: 1.3 });
    paint(rrPts(1420, 690, 520, 36, 10), { wash: mixCol('#6B4E38', '#1F2550', .35), fill: mixCol('#6B4E38', '#3E3329', .4), fillOp: 130, ink: PAL.ink, sw: 1.3 });
    for (let i = 0; i < 10; i++) { const h1 = hash(i), h2 = hash(i + 3); jiaozi(1570 + h1 * 150, 700 - h2 * 30, 20 + 8 * hash(i + 6), { rot: (h1 - .5) * .6 }); }
    const mood = emotions(lt, [[0, 'neutral'], [1.5, 'mischief', { lookX: .6 }], [2.6, 'mischief'], [3.0, 'surprised'], [3.7, 'disgusted'], [4.3, 'mischief']]);
    let pose;
    if (lt < 1.5) pose = { view: 'q', aR: -.2, aL: -.3 };
    else if (lt < 2.6) pose = { view: 'q', aR: lerp(1.5, -.6, ease(seg(lt, 1.5, 2.0))), aL: -.3, lookX: .6, rot: .03 };
    else if (lt < 3.0) pose = { view: 'q', aR: -.2, aL: -.2, lookX: .6 };
    else if (lt < 4.3) { const huff = Math.sin(lt * TAU * 4) * .04; pose = { view: 'q', aR: -.7 + huff, aL: -.5 + huff, dy: -.3 + Math.abs(huff) * 4 }; }
    else pose = { view: 'q', aR: -.3, aL: -.3, lookX: .6 };
    cuihua(x, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0) });
    // the stolen dumpling arcs from the pile to her mouth (2.0–2.7); afterwards she's scalded
    const eatK = ease(seg(lt, 1.95, 2.7));
    if (lt > 1.95 && lt < 3.0) { const p = arcPt([1660, 720], [x + 2.2 * u, gy - 5 * u], 170, eatK); jiaozi(p[0], p[1], 17, { rot: lt * 30 }); }
    if (lt >= 3.0) steam(x + 1 * u, gy - 8 * u, 60, lt, 2);          // 烫!
    const eye = toScreen(x, gy - 5.5 * u);
    camEnd();
    snow(t, 12, .6);
    if (lt > 3.0) { const fl = .3 + .2 * Math.sin(t * 20); glow(1700, 640, 110, '#FF8C4A', fl); }
    if (lt < .3) brushWipe(.5 + lt / .6, RED);
    boilSeed('wipeC');
    if (lt > dur - .35) brushWipe((lt - (dur - .35)) / .7, RED);
  }

  // ---------- shot D: the firecracker ----------
  const TB = 2.35;   // the boom, in this shot's clock (18.15 s video time)
  function shotCracker(t, lt, dur) {
    const u = 20, xc = 950, gy = 940;
    const boom = lt >= TB;
    camBegin(lerp(960, 1000, ease(seg(lt, TB - 1.4, TB + .6))) + (boom ? shakeXY(t, 16 * Math.exp(-(t - (15.8 + TB)) * 6))[0] : 0), 545, 1.02);
    // --- scenery: same winter yard, simpler ---
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: PAL.night, ink: null });
    paint(ellPts(150, 130, 58, 58, 20), { wash: PAL.cream, fill: PAL.ochre, fillOp: 40, ink: PAL.ink, sw: .8 });
    for (let i = 0; i < 26; i++) { const h1 = hash(i), h2 = hash(i + 9); paint(starPts(h1 * W, h2 * H * .5, 2 + 3 * hash(i + 4), .4, 4), { wash: PAL.cream, washOp: 120 + 90 * Math.sin(t * 2 + i * 2), ink: null }); }
    pine(170, 780, 50); pine(1760, 760, 56);
    paint(ellPts(400, 960, 620, 220, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .5), fill: mixCol(PAL.sap, PAL.night, .75), fillOp: 120, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    paint(ellPts(1560, 960, 620, 220, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .5), fill: mixCol(PAL.sap, PAL.night, .75), fillOp: 120, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    fence([240, 450, 660, 870, 1260, 1490, 1720], 925, 115);
    paint(rectPts(-400, 830, W + 800, 330, 4), { wash: mixCol(PAL.cream, PAL.sky, .42), fill: mixCol(PAL.cream, PAL.sky, .6), fillOp: 130, bleed: .05, tex: .7, ink: null });
    boilSeed('thoseD');
    for (let i = 0; i < 12; i++) { const h1 = hash(i * 3), h2 = hash(i * 5); paint(ellPts(h1 * W, 930 + h2 * 90, 6 + 13 * hash(i * 7), 3 + 5 * hash(i * 7), 8), { wash: PAL.cream, washOp: 150, ink: null }); }
    // --- the firecracker: lit fuse, then gone ---
    if (!boom) {
      const fuse = seg(lt, 1.0, 1.5);
      pao(xc, gy - 6, 26, { lit: fuse, rot: -.08 });
      if (fuse > 0) { const fl = 1 + .5 * Math.sin(lt * 46); glow(xc - 20, gy - 46, 46, '#FFC766', .85 * fl * fuse); }
    } else {
      // the blast: a red flash, smoke puffs, and red/cream bits flying on arcs
      const a = lt - TB, sh = Math.exp(-a * 6);
      for (let i = 0; i < 10; i++) {
        const k = seg(a, i * .02, .6 + i * .03), ang = -Math.PI / 2 + (hash(i * 3) - .5) * 2.6;
        const p = arcPt([xc, gy - 30], [xc + Math.cos(ang) * 340, gy - 30 - Math.sin(ang) * 300], 70, k);
        paint(rrPts(p[0], p[1], 7 + 5 * hash(i * 5), 4 + 3 * hash(i * 5), 2), { wash: '#C0392B', fill: '#E2476E', fillOp: 120, ink: null });
        paint(ellPts(xc + Math.cos(ang) * 300 * k, gy - 30 - Math.sin(ang) * 260 * k, 5, 5, 8), { wash: PAL.cream, washOp: 220 * (1 - k), ink: null });
      }
      for (let i = 0; i < 3; i++) {   // smoke rings expanding
        const k = seg(a, .05 + i * .12, .9 + i * .12), r = (30 + i * 46) * k + 16;
        paint(ellPts(xc + jit(10), gy - 40 + jit(10), r, r * .8, 20), { wash: mixCol(PAL.cream, '#9A93A8', .5), washOp: 120 * (1 - k) * sh, ink: null });
      }
    }
    // --- 翠花: walk in, crouch and light the fuse, scurry away, crouch, BOOM take, relief, bounce off right ---
    const mood = emotions(lt, [[0, 'happy'], [.7, 'neutral'], [1.0, 'neutral'], [1.5, 'scared'], [TB - .3, 'scared'], [TB + .1, 'surprised'], [TB + .7, 'laugh'], [3.6, 'excited']]);
    let pose;
    if (lt < .5) pose = { view: 'q', walk: lt * 3, dy: -Math.abs(Math.sin(lt * Math.PI)) * .5, aL: .3, aR: .3 };
    else if (lt < 1.05) { const k = ease(seg(lt, .5, 1.05)); pose = { view: 'q', aR: lerp(.3, -1.4, k), aL: -.3 * (1 - k), dy: -1.6 * k, sq: .2 * (1 - k), lookX: .8, lookY: 1 }; }   // crouch to the fuse
    else if (lt < 1.5) { const flick = Math.sin(lt * 26) * .12; pose = { view: 'q', aR: -1.4 + flick, aL: -.4, dy: -1.6, sq: .18, lookX: .8, lookY: 1 }; }   // strike the match
    else if (lt < 2.05) { const k = ease(seg(lt, 1.5, 2.05)); pose = { view: 'q', walk: k * 4, aL: 1.4, aR: 1.4, lookX: -1, dy: -Math.abs(Math.sin(lt * Math.PI * 3)) * .5 }; }
    else if (lt < TB) { const k = ease(seg(lt, 2.05, 2.3)); pose = { view: 'front', aL: 1.5, aR: 1.5, sq: .28 + .12 * k, lookX: .3, lookY: -.8 }; }   // cover her ears, crouch low
    else if (lt < TB + .6) pose = { view: 'front', aL: 1.5, aR: 1.5, sq: (mood.sq || 0) - .1, dy: (mood.dy || 0) * .7 };
    else if (lt < 3.4) pose = { view: 'front', aL: .9 + .3 * Math.sin(lt * 7), aR: .9 - .3 * Math.sin(lt * 7), sq: .1 * Math.sin(lt * 7), dy: -1 * Math.abs(Math.sin(lt * 7)) };
    else { const w = stroll(lt, 3.4, 5.2, 1330, 1860, u); pose = { ...w, view: 'q', aL: 1.1, aR: .6, sq: .05 }; }
    const x = lt < 1.05 ? lerp(560, 920, ease(seg(lt, 0, 1.05))) :
              lt < 2.05 ? lerp(920, 1330, ease(seg(lt, 1.05, 2.05))) :
              lt < 3.4 ? 1330 : lt < 5.2 ? lerp(1330, 1860, ease(seg(lt, 3.4, 5.2))) : 1860;
    cuihua(x, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0) });
    const eye = toScreen(x, gy - 5.5 * u);
    camEnd();
    if (boom) flash(Math.exp(-(lt - TB) * 5) * .9, '#FFF3D6');       // the blast flash
    snow(t, 26, 1.3);
    if (lt < .3) brushWipe(.5 + lt / .6, RED);
    // cut on action into E: no wipe out — 翠花 keeps bouncing, straight into the dance
  }

  // ---------- shot E: the 秧歌 ----------
  function shotDance(t, lt, dur) {
    const u = 22, x = 920, gy = 980;
    camBegin(lerp(960, 900, ease(seg(lt, 2.2, 4))) + 10 * Math.sin(lt * .5), 520, 1.02);
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: PAL.night, ink: null });
    paint(ellPts(300, 140, 52, 52, 20), { wash: PAL.cream, fill: PAL.ochre, fillOp: 34, ink: PAL.ink, sw: .8 });
    for (let i = 0; i < 30; i++) { const h1 = hash(i), h2 = hash(i + 9); paint(starPts(h1 * W, h2 * H * .5, 2 + 3 * hash(i + 4), .4, 4), { wash: PAL.cream, washOp: 120 + 90 * Math.sin(t * 2 + i * 2), ink: null }); }
    pine(260, 800, 52); pine(1750, 780, 60);
    paint(ellPts(420, 960, 560, 230, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .5), fill: mixCol(PAL.sap, PAL.night, .7), fillOp: 120, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    paint(ellPts(1580, 960, 600, 240, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .5), fill: mixCol(PAL.sap, PAL.night, .7), fillOp: 120, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    fence([280, 480, 680, 880, 1360, 1560, 1780], 920, 120);
    paint(rectPts(-400, 760, W + 800, 330, 4), { wash: mixCol(PAL.cream, PAL.sky, .4), fill: mixCol(PAL.cream, PAL.sky, .6), fillOp: 130, bleed: .05, tex: .7, ink: null });
    const mood = emotions(lt, [[0, 'excited'], [1.4, 'excited'], [2.6, 'happy'], [3.5, 'happy'], [4.4, 'proud']]);
    let pose;
    if (lt < .4) {   // carry the bounce in from D's cut-on-action
      const m = move('bounce', lt, 1);
      pose = { ...m, view: 'q', walk: null, lookX: -.6 };
    } else if (lt < 1.4) {   // a little hop-run into the dance
      const w = stroll(lt, .4, 1.4, 920, 700, u);
      pose = { ...w, view: 'q', aL: .6, aR: .6 };
    } else if (lt < 3.4) {
      const st = ['spin', 'bounce', 'sway', 'wave'][Math.floor(lt / .6) % 4];
      const m = move(st, lt, 1);
      pose = { ...m, view: st === 'spin' ? m.view : 'front', flip: st === 'spin' ? m.flip : false, walk: null };
    } else pose = { view: 'front', aL: -.5, aR: -.5, lookX: .4, dy: -.2 + .4 * Math.abs(Math.sin(lt * .8)) };
    cuihua(x, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0), armR: (u2, sw) => fan(u2, sw) });
    camEnd();
    snow(t, 30, 1.1);
    boilSeed('wipeE');
    if (lt > dur - .35) brushWipe((lt - (dur - .35)) / .7, RED);
  }

  // ---------- shot F: the warm finale ----------
  function shotFinale(t, lt, dur) {
    const u = 24, x = 860, gy = 940;
    camBegin(lerp(960, 1000, ease(seg(lt, 0, dur))) + 8 * Math.sin(lt * .5), 540, 1 + .05 * ease(seg(lt, 0, dur)));
    // the same yard as A, but warmer: the village lights ripple on one by one
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: mixCol(PAL.night, '#3A2F45', .25), fill: mixCol(PAL.indigo, PAL.night, .3), fillOp: 80, bleed: .1, tex: .7, ink: null });
    paint(ellPts(150, 130, 60, 60, 20), { wash: PAL.cream, fill: PAL.ochre, fillOp: 50, ink: PAL.ink, sw: .8 });
    for (let i = 0; i < 24; i++) { const h1 = hash(i), h2 = hash(i + 9); paint(starPts(h1 * W, h2 * H * .5, 2 + 3 * hash(i + 4), .4, 4), { wash: PAL.cream, washOp: 130 + 90 * Math.sin(t * 2 + i * 2), ink: null }); }
    pine(1500, 760, 46); pine(1600, 790, 34);
    for (const [px, py, s] of [[1150, 700, 40], [1330, 690, 30], [1580, 600, 26], [520, 690, 34], [700, 650, 24]]) pine(px, py, s);
    housesRidge(1180, 700, 860, 210, lt, (o, i) => seg(o, .35 + i * .3, .85 + i * .3));   // the ripple: each house lights in turn
    paint(ellPts(1500, 940, 620, 200, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .5), fill: mixCol(PAL.sap, PAL.night, .75), fillOp: 130, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    paint(ellPts(540, 940, 660, 210, 30, 5), { wash: mixCol(PAL.sap, PAL.night, .5), fill: mixCol(PAL.sap, PAL.night, .75), fillOp: 130, bleed: .2, tex: .7, ink: PAL.ink, sw: 1 });
    fence([560, 705, 850, 995, 1140, 1285], 912, 112);
    paint(rectPts(-400, 830, W + 800, 330, 4), { wash: mixCol(PAL.cream, PAL.sky, .42), fill: mixCol(PAL.cream, PAL.sky, .6), fillOp: 130, bleed: .05, tex: .7, ink: null });
    pot(560, 940, 62);
    lantern(1420, 780, 42, 1, { rot: .06 });                          // the lantern from B, now lit at the gate
    boilSeed('thoseF');
    for (let i = 0; i < 14; i++) { const h1 = hash(i * 3), h2 = hash(i * 5), h3 = hash(i * 7); paint(ellPts(h1 * W, 930 + h2 * 90, 6 + 14 * h3, 3 + 6 * h3, 8), { wash: PAL.cream, washOp: 150, ink: null }); }
    snow(t, 16, .6);
    const mood = emotions(lt, [[0, 'shy'], [3.2, 'happy'], [3.8, 'shy'], [4.2, 'happy']]);
    let pose;
    if (lt < 3.2) pose = { view: 'q', aL: -.3, aR: -.5, dy: 0, rot: .03 * Math.sin(lt * 1.3), lookY: -.2 };
    else pose = { view: 'q', aL: -.3, aR: -.5, dy: 0, lookY: -.7 };
    cuihua(x, gy, u, { ...mood, ...pose, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0) });
    bowl(x + 2.2 * u, gy - 6.4 * u, 32, t);                           // a warm bowl of dumplings, held at her chest
    const eye = toScreen(x, gy - 6 * u);
    camEnd();
    snow(t, 22, 1.3);
    if (lt < .3) brushWipe(.5 + lt / .6, RED);
    if (lt > dur - .5) {   // iris to 翠花's face, hold, shut
      const r = lt < dur - .25 ? lerp(1500, 300, ease(seg(lt, dur - .5, dur - .25))) : lerp(300, 0, easeIn(seg(lt, dur - .25, dur)));
      iris(...eye, r);
    }
  }

  shots([[0, shotYard], [5.6, shotWindow], [10.4, shotDumpling], [15.8, shotCracker], [21.2, shotDance], [26.0, shotFinale]]);
})();