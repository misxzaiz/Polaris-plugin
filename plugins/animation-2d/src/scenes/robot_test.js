// scenes/robot_test.js: standalone loop test — 小铁 the robot stands in a snowy yard and waves.
// Not part of the film's timeline (registered as a LOOP, so it never disturbs the SHOTS list).
// Render one frame via:  node render.mjs --loop=robot --sheet=1.5 --out=out/check/robot_test.jpg
(() => {
  LOOPS.robot = function robotTest(t) {
    const u = 22, x = 960, gy = 940;
    camBegin(960, 520, 1.05);
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: PAL.night, ink: null });
    pine(320, 720, 42); pine(1630, 700, 50);
    paint(rectPts(-400, 820, W + 800, 300, 4), { wash: mixCol(PAL.cream, PAL.sky, .42), fill: mixCol(PAL.cream, PAL.sky, .6), fillOp: 130, bleed: .05, tex: .7, ink: null });
    fence([620, 780, 940, 1100, 1260], 900, 100);
    snow(t, 26, 1);
    const mood = emotions(t, [[0, 'neutral'], [.5, 'happy'], [1, 'excited']]);
    robot(x, gy, u, { ...mood, view: 'q', rot: -.02, aL: .3, aR: 1.8, lookX: .6 });
    camEnd();
    snow(t, 18, 1.4);
  };
  LOOPS.robot.len = 4;
})();