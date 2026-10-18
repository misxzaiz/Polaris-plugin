// scenes/tengwang.js: 《滕王阁序》第一段 — four verses, ink-wash + vertical calligraphy.
//   V1  豫章故郡，洪都新府      (0–5.5)   滕王阁城楼剪影，旗幡，江月
//   V2  星分翼轸，地接衡庐      (5.5–11)  星野镜头下移，两座远山相接
//   V3  襟三江而带五湖，控蛮荆而引瓯越 (11–16.5) 俯瞰大地：三江如襟、五湖散布、群山对峙
//   V4  物华天宝，龙光射牛斗之墟 (16.5–22) 江畔古剑出匣，光柱直指星宿
// Each verse is one camera event + its vertical text, so picture and line stay aligned. Ink bloom between verses.
(() => {
  // ----- verse timing & calligraphy (all vertical, right column) -----
  const V = [
    { t0: 0.0,  txt: '豫章故郡，洪都新府', dur: 5.5, size: 46, x: 1650 },
    { t0: 5.5,  txt: '星分翼轸，地接衡庐', dur: 5.5, size: 46, x: 1650 },
    { t0: 11.0, txt: '襟三江而带五湖，', dur: 4.0, size: 44, x: 1720 },
    { t0: 15.0, txt: '控蛮荆而引瓯越', dur: 3.5, size: 44, x: 1600 },
    { t0: 16.5, txt: '物华天宝，龙光射牛斗之墟', dur: 5.5, size: 42, x: 1630 },
  ];
  function verseText(t) {
    for (const v of V) {
      if (t < v.t0) continue;
      if (t > v.t0 + v.dur) break;
      const n = v.txt.length;
      const reveal = n * ease(seg(t, v.t0, v.t0 + v.dur * .82));
      vText(v.txt, v.x, 240, v.size, PAL.ink, { reveal, font: `${v.size}px ${VFONT}` });
      if (t - v.t0 < .9) { /* seal appears at the end instead */ }
    }
  }
  // a red seal stamp under the current verse, once its reveal completes
  function verseSeal(t) {
    for (const v of V) {
      if (t < v.t0) continue;
      if (t > v.t0 + v.dur) break;
      const k = seg(t, v.t0 + v.dur * .82, v.t0 + v.dur * .95);
      if (k > 0 && k < 1) seal(v.x + 34, 240 + v.txt.length * v.size * 1.12 + 26, 40, {});
      break;
    }
  }

  // ----- set pieces -----
  // 滕王阁: 重檐歇山楼阁，按真实唐代楼阁形制（须弥座台基→一层柱廊格扇→腰檐斗拱→二层→歇山顶+鸱吻宝顶）。
  // (x, y) = 台基底面中心，s = 单位尺度（约一个柱间距）。
  function pavilion(t, x, y, s) {
    boilSeed('pav' + Math.round(x));
    // 夜景水墨配色：木构暗赭、屋面墨蓝、台基青灰，高光仅窗灯
    const wood = '#6E4531', woodDk = '#543424', roof = '#232339', roofL = '#33324E';
    const stone = '#7C756A', stoneDk = '#5F594E';

    // —— 竖向骨架（s = 柱间距，总高约 14.4s）——
    const bw = s * 8.0;                  // 一层面阔
    const h1 = s * 4.0;                  // 一层柱高
    const b2w = s * 6.2;                 // 二层面阔
    const h2 = s * 3.2;                  // 二层柱高
    const baseH = s * 2.2;               // 台基总高
    const eaveH = s * 2.0;               // 腰檐高度
    const topH = s * 1.9;                // 歇山顶高度
    const spireH = s * 1.2;              // 宝顶

    const yb = y;                        // 台基底
    const yf = y - baseH;                // 一层地面（台基顶）
    const y1e = yf - h1;                 // 一层顶（腰檐底）
    const y2f = y1e - eaveH;             // 二层底
    const y2e = y2f - h2;                // 二层顶（顶檐底）
    const y3e = y2e - topH;              // 正脊下
    const ytop = y3e - spireH;           // 宝顶尖

    // ===== 台基（须弥座：下枋-束腰-上枋） =====
    paint(rrPts(x - s * 5.8, yb - s * .6, s * 11.6, s * 1.0, s * .2), { wash: stone, fill: stoneDk, fillOp: 120, bleed: .12, tex: .8, ink: PAL.ink, sw: 1 });
    paint(rrPts(x - s * 5.0, yb - s * 1.6, s * 10.0, s * 1.0, s * .14), { wash: mixCol(stone, PAL.ink, .28), fill: mixCol(stoneDk, PAL.ink, .25), fillOp: 120, bleed: .12, tex: .8, ink: PAL.ink, sw: 1 });
    paint(rrPts(x - s * 5.6, yb - s * 2.1, s * 11.2, s * .55, s * .14), { wash: stone, fill: mixCol(stone, PAL.ink, .12), fillOp: 130, bleed: .1, tex: .8, ink: PAL.ink, sw: 1 });
    paint(rrPts(x - s * 4.8, yf, s * 9.6, s * .22, s * .05), { wash: mixCol(stone, PAL.cream, .25), fill: mixCol(stone, PAL.cream, .15), fillOp: 130, bleed: .08, tex: .7, ink: PAL.ink, sw: .7 });

    // ===== 一层柱廊 =====
    paint(rrPts(x - s * 4.0, y1e, s * 8.0, h1, s * .1), { wash: mixCol(wood, PAL.ink, .4), fill: mixCol(woodDk, PAL.ink, .35), fillOp: 135, bleed: .08, tex: .75, ink: PAL.ink, sw: 1 });
    for (const dx of [-3.5, -1.75, 0, 1.75, 3.5]) {
      inkLine([[x + dx * s, yf], [x + dx * s, y1e]], s * .26, mixCol(wood, PAL.ink, .05), 'inkfine', 0);
    }
    // 格扇：四个开间的棂花窗（3×2 网格 + 横棂，亮格线更清晰）
    for (const bx of [-2.625, -.875, .875, 2.625]) {
      const cx0 = x + bx * s, ww = s * 1.15, wy0 = yf - h1 * .9;
      paint(rrPts(cx0 - ww / 2, wy0 - h1 * .62, ww, h1 * .62, s * .04), { wash: mixCol(wood, PAL.ink, .55), fill: mixCol(wood, PAL.ink, .5), fillOp: 125, bleed: .05, tex: .7, ink: PAL.ink, sw: .6 });
      const lcol = mixCol('#F2C53D', PAL.cream, .35);           // 月光下的暖亮窗棂
      for (let g = 1; g < 3; g++) {
        const gx = cx0 - ww / 2 + ww * g / 3;
        inkLine([[gx, wy0 - h1 * .62], [gx, wy0]], s * .07, lcol, 'inkfine', 0);
      }
      for (let g = 1; g < 2; g++) {
        const gy = wy0 - h1 * .62 + h1 * .62 * g / 2;
        inkLine([[cx0 - ww / 2, gy], [cx0 + ww / 2, gy]], s * .07, lcol, 'inkfine', 0);
      }
      inkLine([[cx0 - ww / 2, wy0 - h1 * .62], [cx0 + ww / 2, wy0 - h1 * .62]], s * .08, lcol, 'inkfine', 0);
      inkLine([[cx0 - ww / 2, wy0], [cx0 + ww / 2, wy0]], s * .08, lcol, 'inkfine', 0);
    }
    // 一层寻杖栏杆
    for (let i = -3.7; i <= 3.7; i += .65) {
      inkLine([[x + i * s, yf + s * .12], [x + i * s, yf - s * .42]], s * .05, mixCol(stone, PAL.cream, .15), 'inkfine', 0);
    }
    inkLine([[x - s * 4.1, yf - s * .42], [x + s * 4.1, yf - s * .42]], s * .07, mixCol(stone, PAL.cream, .18), 'inkfine', 0);
    inkLine([[x - s * 4.1, yf + s * .12], [x + s * 4.1, yf + s * .12]], s * .1, mixCol(stone, PAL.cream, .22), 'inkfine', 0);

    // ===== 腰檐（重檐）：屋面+瓦楞+飞檐+斗拱 =====
    const ew1 = s * 10.4, ew2 = s * 7.6;
    paint([[x - ew1 / 2, y1e], [x + ew1 / 2, y1e], [x + ew2 / 2, y2f], [x - ew2 / 2, y2f]], { wash: roof, fill: mixCol(roof, PAL.ink, .3), fillOp: 150, bleed: .12, tex: .8, ink: PAL.ink, sw: 1, curv: .25 });
    for (let i = 1; i <= 3; i++) {
      const k = i / 4, wk = ew1 - (ew1 - ew2) * k;
      inkLine([[x - wk / 2 + s * .5, lerp(y1e, y2f, k)], [x + wk / 2 - s * .5, lerp(y1e, y2f, k)]], s * .04, mixCol(roof, PAL.cream, .08), 'inkfine', 0);
    }
    inkLine([[x - ew1 / 2, y1e - s * .03], [x + ew1 / 2, y1e - s * .03]], s * .09, mixCol(roofL, PAL.cream, .1), 'inkfine', 0);
    // 飞檐翘角：檐端斜出上挑，勾出灵动
    for (const sgn of [-1, 1]) {
      inkLine([[x + sgn * ew1 / 2, y1e], [x + sgn * (ew1 / 2 + s * .55), y1e - s * .6]], s * .12, mixCol(roofL, PAL.cream, .15), 'inkfine', .45);
      // 翘角尖端补一笔，让它更明显
      inkLine([[x + sgn * (ew1 / 2 + s * .42), y1e - s * .28], [x + sgn * (ew1 / 2 + s * .55), y1e - s * .6]], s * .1, mixCol(roofL, PAL.cream, .25), 'inkfine', 0);
    }
    // 斗拱层：紧贴檐口下方（屋面的正下缘 y1e），画在屋面之后，保证不被盖住
    for (const dx of [-4, -2, 0, 2, 4]) {
      const gx = x + dx * s;
      // 坐斗（横枋）+ 二跳（竖）+ 拱臂
      inkLine([[gx - s * .3, y1e], [gx + s * .3, y1e]], s * .1, mixCol(wood, PAL.cream, .25), 'inkfine', 0);
      inkLine([[gx - s * .2, y1e], [gx - s * .2, y1e - s * .3]], s * .09, mixCol(wood, PAL.cream, .25), 'inkfine', 0);
      inkLine([[gx + s * .2, y1e], [gx + s * .2, y1e - s * .3]], s * .09, mixCol(wood, PAL.cream, .25), 'inkfine', 0);
      inkLine([[gx, y1e], [gx, y1e - s * .36]], s * .1, mixCol(wood, PAL.cream, .3), 'inkfine', 0);
    }

    // ===== 二层柱廊 =====
    paint(rrPts(x - s * 3.1, y2e, s * 6.2, h2, s * .08), { wash: mixCol(wood, PAL.ink, .35), fill: mixCol(woodDk, PAL.ink, .32), fillOp: 135, bleed: .08, tex: .75, ink: PAL.ink, sw: 1 });
    for (const dx of [-2.1, 0, 2.1]) {
      inkLine([[x + dx * s, y2f], [x + dx * s, y2e]], s * .2, mixCol(wood, PAL.ink, .05), 'inkfine', 0);
    }
    // 暖窗灯（唯一高光）+ 两侧暗窗
    glow(x, y2f + s * 1.35, s * 1.8, '#FFC766', .3);
    paint(rrPts(x - s * .6, y2f + s * .5, s * 1.2, s * 1.35, s * .05), { wash: '#F2C53D', fill: '#F2C53D', fillOp: 205, bleed: .05, ink: null });
    paint(rrPts(x - s * 2.1, y2f + s * .5, s * .85, s * 1.35, s * .05), { wash: mixCol('#F2C53D', PAL.ink, .55), fill: mixCol('#F2C53D', PAL.ink, .5), fillOp: 130, bleed: .05, ink: null });
    paint(rrPts(x + s * 1.25, y2f + s * .5, s * .85, s * 1.35, s * .05), { wash: mixCol('#F2C53D', PAL.ink, .55), fill: mixCol('#F2C53D', PAL.ink, .5), fillOp: 130, bleed: .05, ink: null });

    // ===== 歇山顶 =====
    const tw1 = s * 8.4, tw2 = s * 3.0;
    paint([[x - tw1 / 2, y2e], [x + tw1 / 2, y2e], [x + tw2 / 2, y3e], [x - tw2 / 2, y3e]], { wash: roof, fill: mixCol(roof, PAL.ink, .25), fillOp: 150, bleed: .12, tex: .8, ink: PAL.ink, sw: 1, curv: .25 });
    for (let i = 1; i <= 3; i++) {
      const k = i / 4, wk = tw1 - (tw1 - tw2) * k;
      inkLine([[x - wk / 2 + s * .45, lerp(y2e, y3e, k)], [x + wk / 2 - s * .45, lerp(y2e, y3e, k)]], s * .04, mixCol(roof, PAL.cream, .08), 'inkfine', 0);
    }
    inkLine([[x - tw1 / 2, y2e - s * .03], [x + tw1 / 2, y2e - s * .03]], s * .08, mixCol(roofL, PAL.cream, .1), 'inkfine', 0);
    // 顶檐飞檐翘角
    for (const sgn of [-1, 1]) {
      inkLine([[x + sgn * tw1 / 2, y2e], [x + sgn * (tw1 / 2 + s * .5), y2e - s * .55]], s * .1, mixCol(roofL, PAL.cream, .15), 'inkfine', .4);
      inkLine([[x + sgn * (tw1 / 2 + s * .38), y2e - s * .26], [x + sgn * (tw1 / 2 + s * .5), y2e - s * .55]], s * .09, mixCol(roofL, PAL.cream, .25), 'inkfine', 0);
    }
    // 正脊 + 鸱吻（两端上翘的鱼尾吻兽）
    paint(rrPts(x - tw2 / 2, y3e - s * .22, tw2, s * .26, s * .06), { wash: mixCol(roof, PAL.ink, .45), fill: mixCol(roof, PAL.ink, .55), fillOp: 150, bleed: .06, tex: .8, ink: PAL.ink, sw: .7 });
    for (const sgn of [-1, 1]) {
      paint([[x + sgn * tw2 / 2, y3e - s * .18], [x + sgn * (tw2 / 2 + s * .26), y3e - s * .5], [x + sgn * (tw2 / 2 + s * .14), y3e - s * .16]], { wash: mixCol(roofL, PAL.cream, .12), fill: mixCol(roofL, PAL.cream, .08), fillOp: 120, bleed: .05, tex: .8, ink: PAL.ink, sw: .6, curv: .2 });
      inkLine([[x + sgn * (tw2 / 2 + s * .26), y3e - s * .5], [x + sgn * (tw2 / 2 + s * .34), y3e - s * .82]], s * .08, mixCol(roofL, PAL.cream, .2), 'inkfine', .4);
    }
    // 宝顶（宝珠 + 尖）
    paint(ellPts(x, y3e - s * .55, s * .26, s * .4, 10), { wash: mixCol(roof, PAL.ink, .2), fill: mixCol(roof, PAL.ink, .1), fillOp: 150, bleed: .1, tex: .7, ink: PAL.ink, sw: .7 });
    paint([[x - s * .14, y3e - s * .5], [x, y3e - s * 1.15], [x + s * .14, y3e - s * .5]], { wash: mixCol(roof, PAL.ink, .3), fill: mixCol(roof, PAL.ink, .4), fillOp: 150, bleed: .06, tex: .8, ink: PAL.ink, sw: .7 });

    // 月光：顶檐右坡一道淡高光
    inkLine([[x + s * 1.4, y2e + s * .1], [x + s * 3.4, y2e - s * .18]], s * .07, mixCol(PAL.cream, PAL.sky, .22), 'inkfine', 0);

    // 旗幡（阁两侧）：夜景下用暗朱砂+墨调，避免过于跳脱
    banner(t, x - s * 5.2, yf, s * 6.2, mixCol(TW.cinnabar, PAL.ink, .25), {});
    banner(t, x + s * 5.2, yf, s * 6.2, mixCol(TW.cinnabar, PAL.ink, .25), {});
  }

  // 俯瞰大地 for V3: three rivers like a sash (襟), five lakes, two mountain ranges flanking
  function landView(t) {
    boilSeed('land');
    paint(rectPts(-600, -400, W + 1200, H + 800), { wash: mixCol(TW.paper, '#E8DEC8', .6), ink: null });
    // far mountain ranges (right & left), 青黛
    mt(500, 560, 760, 300, mixCol(TW.jade, TW.night, .5), { fillOp: 90, sw: 1 });
    mt(1500, 600, 800, 330, mixCol(TW.jade, TW.night, .45), { fillOp: 90, sw: 1 });
    mt(920, 660, 620, 240, mixCol(TW.jade, TW.moss, .3), { fillOp: 80, sw: 1 });
    // five lakes (五湖): pale green ellipses in the mid-ground
    const lakes = [[520, 780, 60], [900, 860, 74], [1280, 780, 66], [700, 940, 46], [1420, 900, 52]];
    for (let i = 0; i < lakes.length; i++) {
      boilSeed('lake' + i);
      const [lx, ly, lr] = lakes[i];
      paint(ellPts(lx, ly, lr * 2.1, lr, 24), { wash: mixCol('#BFD8CC', PAL.sky, .3), fill: mixCol('#A7CBB8', PAL.sky, .4), fillOp: 120, bleed: .2, tex: .75, ink: PAL.ink, sw: .7 });
      ripples(t, lx, ly, lr * .5, 2, mixCol('#A7CBB8', PAL.ink, .2));
    }
    // three rivers as a ribbon sash (三江如襟): wide pale bands winding from upper left toward the viewer
    const rivers = [
      { c: mixCol('#BFD8CC', PAL.sky, .25), pts: [[-60, 300], [360, 460], [760, 520], [1160, 640], [1520, 780], [1860, 900]] },
      { c: mixCol('#B9D2C6', PAL.sky, .3), pts: [[-80, 520], [340, 640], [820, 720], [1300, 860], [1700, 940]] },
      { c: mixCol('#C4DCD2', PAL.sky, .2), pts: [[-40, 700], [420, 820], [980, 900], [1560, 1020]] },
    ];
    rivers.forEach((r, i) => {
      boilSeed('riv' + i);
      paint(ribbon(r.pts, 66, 110), { wash: r.c, fill: mixCol(r.c, PAL.paper, .2), fillOp: 130, bleed: .14, tex: .75, ink: PAL.ink, sw: 1, curv: .3 });
    });
    // 控蛮荆而引瓯越: the southern ranges drawn as a dark wall at the bottom
    paint([[400, 1100], [960, 880], [1520, 1100]], { wash: mixCol(TW.moss, TW.night, .55), fill: mixCol(TW.moss, PAL.ink, .3), fillOp: 120, bleed: .16, tex: .75, ink: PAL.ink, sw: 1.1 });
    // a few pines to mark the near shore
    pine(300, 960, 26); pine(1580, 980, 22); pine(1740, 950, 18);
  }

  // V4: an ancient sword on the river bank; its blade-light shoots into the star field (牛斗之墟)
  function swordBeam(t) {
    boilSeed('beam');
    // star field top
    nightSky(t, { stars: 90, moon: false, col: TW.night });
    // river band at the bottom, dark
    paint(rectPts(-600, 800, W + 1200, H + 400), { wash: mixCol(TW.night, TW.indigo, .3), fill: mixCol(TW.night, PAL.ink, .3), fillOp: 130, bleed: .12, tex: .8, ink: null });
    ripples(t, 960, 880, 320, 3, PAL.cream);
    // the beam: a tall pale shaft rising from the sword to the star cluster
    const bK = ease(seg(t, 16.9, 18.6));
    if (bK > 0) {
      const bh = lerp(90, 520, bK);
      glow(960, 560, 150, '#DCE6F0', .5 * bK);
      paint(ribbon([[960, 880], [960, 880 - bh]], 26 * (1 - bK * .5), 4), { wash: '#E8EFF6', washOp: 235 * bK, fill: '#C4D8EC', fillOp: 120 * bK, bleed: .1, tex: .5, ink: null });
      glow(960, 880 - bh, 90, '#DCE6F0', .8 * bK);
      // sparkle where it meets the stars
      paint(starPts(960, 880 - bh, 30 * bK, .3, 4), { wash: PAL.cream, washOp: 255 * bK, ink: null });
    }
    // the sword: blade angled up-right, hilt toward the river
    boilSeed('sword');
    const sk = ease(seg(t, 16.6, 17.3));
    push(); translate(960, 880); rotate(-.5); scale(1, 1);
    const blade = ribbon([[0, 0], [0, -150]], 14, 2);
    paint(blade, { wash: '#D8DEE6', fill: '#AEBBCE', fillOp: 160, bleed: .06, tex: .6, ink: PAL.ink, sw: .9, curv: .2 });
    paint(rrPts(-16, 2, 32, 16, 5), { wash: '#7E6A56', fill: '#5A4A3A', fillOp: 130, bleed: .08, tex: .7, ink: PAL.ink, sw: .9 });
    pop();
  }

  // ----- the first段, as a standalone loop (does not disturb the film's SHOTS timeline) -----
  LOOPS.tengwang = t => {
    const dur = 22;                                    // verse bounds are absolute loop times
    const lt = t;
    // route t to the verse that owns it; each verse is one camera event + its text
    if (lt < 5.5) v1(t, lt, 5.5);
    else if (lt < 11.0) v2(t, lt - 5.5, 5.5);
    else if (lt < 16.5) v3(t, lt - 11.0, 5.5);
    else v4(t, lt - 16.5, 5.5);
  };
  LOOPS.tengwang.len = 22;

  function v1(t, lt, dur) {
      camBegin(960, 540, 1 + .015 * Math.sin(lt * .5));
      nightSky(t, { stars: 34, moon: true });
      paint(rectPts(-600, 700, W + 1200, H + 500), { wash: mixCol(TW.night, TW.indigo, .35), fill: mixCol(TW.night, PAL.ink, .25), fillOp: 130, bleed: .12, tex: .8, ink: null });
      // distant shoreline + the pavilion (tall: 14.4 * 42px ≈ 605px of the 1080 frame ≈ 56%)
      paint(ellPts(700, 820, 660, 220, 30, 4), { wash: mixCol(TW.night, TW.indigo, .5), fill: mixCol(TW.night, PAL.ink, .35), fillOp: 120, bleed: .2, tex: .75, ink: null });
      pavilion(t, 960, 940, 42);
      // far side: a low city wall line with a gate tower
      boilSeed('wall');
      inkLine([[560, 808], [1440, 808]], 1.2, mixCol(TW.night, PAL.ink, .4), 'inkfine', 0);
      paint([[600, 808], [620, 768], [640, 808]], { wash: mixCol(TW.night, PAL.ink, .35), ink: PAL.ink, sw: .7 });
      // moon reflection on the water
      ripples(t, 560, 900, 140, 2, mixCol(PAL.cream, PAL.ink, .15));
      camEnd();
      verseText(t);
      verseSeal(t);
      if (lt > dur - .5) inkBloom((lt - (dur - .5)) / .5);
    }
    // V2  星分翼轸，地接衡庐 — camera pulls from the stars down to two mountain ranges
    function v2(t, lt, dur) {
      const k = ease(seg(lt, 0, dur));
      camBegin(960, lerp(380, 620, k), 1 - .12 * k);
      nightSky(t, { stars: 120, moon: true });
      // the two ranges sliding in from left/right as the camera comes down
      const kk = ease(seg(lt, .25, dur - .3));
      mt(lerp(-120, 480, kk), 700, 780, 320, mixCol(TW.night, TW.indigo, .25), { fillOp: 95, sw: 1.1 });
      mt(lerp(W + 120, 1460, kk), 720, 820, 340, mixCol(TW.night, TW.indigo, .3), { fillOp: 95, sw: 1.1 });
      mt(960, 760, 900, 300, mixCol(TW.night, TW.indigo, .2), { fillOp: 85, sw: 1 });
      // a faint mist band where the ranges meet
      paint(ellPts(960, 720, 760, 90, 30), { fill: mixCol(PAL.cream, PAL.sky, .25), fillOp: 70, bleed: .3, tex: .6, ink: null });
      camEnd();
      verseText(t);
      verseSeal(t);
      if (lt > dur - .5) inkBloom((lt - (dur - .5)) / .5);
    }
    // V3  襟三江而带五湖，控蛮荆而引瓯越 — bird's-eye land
    function v3(t, lt, dur) {
      camBegin(960, 540, 1.05 + .02 * Math.sin(lt * .4));
      landView(t);
      camEnd();
      verseText(t);
      verseSeal(t);
      if (lt > dur - .5) inkBloom((lt - (dur - .5)) / .5);
    }
    // V4  物华天宝，龙光射牛斗之墟 — the sword's light into the star field
    function v4(t, lt, dur) {
      camBegin(960, 540, 1 + .015 * Math.sin(lt * .5));
      swordBeam(t);
      camEnd();
      verseText(t);
      verseSeal(t);
      if (lt > dur - .5) inkBloom((lt - (dur - .5)) / .5, mixCol(PAL.ink, TW.night, .5));
    }
})();