// robot.js: 小铁 — a blocky robot character built on the Clawd engine.
// 小铁 keeps the Clawd skeleton (views, emotions, turns, dances all still work), but wears a steel-grey
// rounded body, a single antenna with a glowing tip, a riveted chest plate, bolt eyes and a speaker-grille mouth.
// Everything is a pure function of t; every element gets its own boil seed.

// ---------- 小铁's palette ----------
const RB = { col: '#7B8794', dk: '#4E5760', lt: '#C9D2DA', steel: '#3A4148', glow: '#6FE8FF', bolt: '#2A2F34' };

// rivets on the chest plate (body-local space, drawn before the engine's face so they sit on the plate)
function rivets(u, sw) {
  boilSeed('rivets');
  for (const [rx, ry] of [[-2.4, -3.4], [0, -3.4], [2.4, -3.4], [-2.4, -1.6], [0, -1.6], [2.4, -1.6]]) {
    paint(ellPts(rx * u, ry * u, .2 * u, .2 * u, 8), { wash: RB.bolt, ink: null });
  }
}

// a single antenna with a soft glowing tip, on top of the head
function antenna(u, sw) {
  boilSeed('antenna');
  push(); translate(0, -9.8 * u);
  inkLine([[0, 0], [0, -1.7 * u]], sw * .5, RB.steel, 'inkfine', 0);
  glow(0, -1.8 * u, u * 1.1, RB.glow, .5 + .2 * Math.sin(T * 5));
  paint(ellPts(0, -1.85 * u, .3 * u, .3 * u, 10), { wash: RB.glow, ink: null });
  pop();
}

// 小铁: Clawd engine + his skin. col/dk/lt are pinned to the steel (moods shift the face, not the hull).
function robot(x, y, u, o = {}) {
  const extra = { ...o, col: RB.col, dk: RB.dk, lt: RB.lt };
  const prev = o.draw;
  extra.draw = (u2, sw) => { rivets(u2, sw); antenna(u2, sw); if (prev) prev(u2, sw); };
  clawd(x, y, u, extra);
}
