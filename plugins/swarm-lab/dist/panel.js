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

// shared/engine.js
var require_engine = __commonJS({
  "shared/engine.js"(exports, module) {
    "use strict";
    var WORLD = 100;
    function mulberry32(seed) {
      let a = seed >>> 0;
      return function rand() {
        a |= 0;
        a = a + 1831565813 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    function wrapDelta(d) {
      const W = WORLD;
      let x = d % W;
      if (x < -W / 2) x += W;
      else if (x >= W / 2) x -= W;
      return x;
    }
    function dist2(ax, ay, bx, by) {
      const dx = wrapDelta(bx - ax), dy = wrapDelta(by - ay);
      return dx * dx + dy * dy;
    }
    function wrapPos(p) {
      let x = p % WORLD;
      if (x < 0) x += WORLD;
      return x;
    }
    var GRID = 64;
    var SCENARIOS2 = {
      boids: {
        id: "boids",
        name: "\u8702\u7FA4\u9E1F\u7FA4\uFF08Boids\uFF09",
        description: "\u5206\u79BB/\u5BF9\u9F50/\u805A\u5408\u4E09\u89C4\u5219\u6D8C\u73B0\u7FA4\u4F53\u79E9\u5E8F\uFF1B\u53EF\u9009\u6355\u98DF\u8005\u8BF1\u53D1\u60CA\u7FA4\u3002\u770B\u6781\u5316\u6307\u6570\u5982\u4F55\u968F\u5BF9\u9F50\u6743\u91CD\u53D8\u5316\u3002",
        defaultTicks: 600,
        maxTicks: 3e3,
        // O(N²) 邻居扫描，tick 数随 count 有乘积护栏（见 costGuard）
        params: [
          { key: "count", type: "number", min: 10, max: 400, step: 10, default: 120, desc: "\u4E2A\u4F53\u6570" },
          { key: "separation", type: "number", min: 0, max: 3, step: 0.1, default: 1.2, desc: "\u5206\u79BB\u6743\u91CD\uFF08\u9632\u78B0\u649E\u6324\u56E2\uFF09" },
          { key: "alignment", type: "number", min: 0, max: 3, step: 0.1, default: 1, desc: "\u5BF9\u9F50\u6743\u91CD\uFF08\u79E9\u5E8F\u7684\u4E3B\u8981\u6765\u6E90\uFF09" },
          { key: "cohesion", type: "number", min: 0, max: 3, step: 0.1, default: 0.8, desc: "\u805A\u5408\u6743\u91CD\uFF08\u6210\u56E2\u7684\u4E3B\u8981\u6765\u6E90\uFF09" },
          { key: "perception", type: "number", min: 2, max: 30, step: 1, default: 8, desc: "\u611F\u77E5\u534A\u5F84\uFF08\u4E16\u754C\u5355\u4F4D\uFF09" },
          { key: "maxSpeed", type: "number", min: 0.3, max: 3, step: 0.1, default: 1.2, desc: "\u6700\u5927\u901F\u5EA6\uFF08\u4E16\u754C\u5355\u4F4D/tick\uFF09" },
          { key: "noise", type: "number", min: 0, max: 1, step: 0.05, default: 0.5, desc: "\u8F6C\u5411\u968F\u673A\u566A\u58F0\uFF08\xB1noise \u5F27\u5EA6/tick\uFF1B\u5BF9\u9F50\u6743\u91CD vs \u566A\u58F0=Vicsek \u76F8\u53D8\u5B9E\u9A8C\uFF09" },
          { key: "predator", type: "boolean", default: false, desc: "\u542F\u7528\u6355\u98DF\u8005\uFF08\u60CA\u7FA4\u6E90\uFF09" },
          { key: "predatorSpeed", type: "number", min: 0.5, max: 2.5, step: 0.1, default: 1.5, desc: "\u6355\u98DF\u8005\u901F\u5EA6\u500D\u7387\uFF08predator=true \u65F6\u751F\u6548\uFF09" }
        ],
        metrics: [
          { key: "polarization", desc: "\u6781\u5316\u6307\u6570 |\u03A3v\u0302|/N \u2208 [0,1]\uFF1A\u8D8A\u9AD8\u8D8A\u540C\u5411\u6709\u5E8F\uFF0C\u63A5\u8FD1 0 \u4E3A\u4E71\u5411/\u6563\u6C99", higherIsMoreOrder: true },
          { key: "meanNND", desc: "\u5E73\u5747\u6700\u8FD1\u90BB\u8DDD\u79BB\uFF08\u4E16\u754C\u5355\u4F4D\uFF09\uFF1A\u8FC7\u5C0F=\u62E5\u6324\u5806\u53E0\uFF0C\u8FC7\u5927=\u4E00\u76D8\u6563\u6C99" },
          { key: "clusters", desc: "\u7FA4\u7C07\u6570\uFF1A\u4EE5\u611F\u77E5\u534A\u5F84\u4E3A\u8FDE\u901A\u9608\u503C\u7684\u8FDE\u901A\u5206\u91CF\u4E2A\u6570\uFF0C\u8D8A\u4F4E\u8D8A\u805A\u5408\u6210\u5927\u56E2" },
          { key: "catches", desc: "\u6355\u98DF\u8005\u7D2F\u8BA1\u6355\u83B7\u6570\uFF08predator=true \u624D\u6709\u610F\u4E49\uFF1B\u6355\u83B7\u540E\u4E2A\u4F53\u968F\u673A\u91CD\u751F\uFF0C\u6570\u91CF\u5B88\u6052\uFF09", cumulative: true }
        ]
      },
      ants: {
        id: "ants",
        name: "\u8681\u7FA4\u89C5\u98DF\uFF08\u4FE1\u606F\u7D20\uFF09",
        description: "\u643A\u98DF\u8681\u6C89\u79EF\u4FE1\u606F\u7D20\u3001\u4FE1\u606F\u7D20\u84B8\u53D1\u30013 \u63A2\u9488\u8F6C\u5411\u2014\u2014\u4ECE\u4E71\u8D70\u6D8C\u73B0\u51FA\u89C5\u98DF\u8DEF\u5F84\u3002\u770B\u7D2F\u8BA1\u91C7\u98DF\u66F2\u7EBF\u4F55\u65F6\u8D77\u98DE\u3002",
        defaultTicks: 1500,
        maxTicks: 2e4,
        // O(N×3) 探针扫描，很便宜，上限宽
        params: [
          { key: "count", type: "number", min: 5, max: 300, step: 5, default: 80, desc: "\u8682\u8681\u6570" },
          { key: "deposit", type: "number", min: 0.1, max: 5, step: 0.1, default: 1, desc: "\u4FE1\u606F\u7D20\u6C89\u79EF\u5F3A\u5EA6\uFF08\u4EC5\u643A\u98DF\u8681\u6C89\u79EF\xD72\uFF09" },
          { key: "decay", type: "number", min: 0.9, max: 0.999, step: 1e-3, default: 0.985, desc: "\u6BCF tick \u4FE1\u606F\u7D20\u4FDD\u7559\u7387\uFF081-\u4FDD\u7559=\u84B8\u53D1\uFF09" },
          { key: "wander", type: "number", min: 0, max: 1.5, step: 0.05, default: 0.35, desc: "\u6E38\u8D70\u89D2\u6270\u52A8\u5E45\u5EA6\uFF08\u5F27\u5EA6\uFF09" },
          { key: "sensorDist", type: "number", min: 2, max: 15, step: 1, default: 6, desc: "\u63A2\u9488\u8DDD\u79BB\uFF08\u4E16\u754C\u5355\u4F4D\uFF09" },
          { key: "smell", type: "number", min: 0, max: 15, step: 1, default: 5, desc: "\u98DF\u7269\u76F4\u63A5\u611F\u77E5\u534A\u5F84\uFF080=\u7EAF\u4FE1\u606F\u7D20\u65E0\u76F4\u89C9\uFF09" },
          { key: "foodPiles", type: "number", min: 1, max: 5, step: 1, default: 2, desc: "\u98DF\u7269\u5806\u6570" },
          { key: "foodPerPile", type: "number", min: 50, max: 500, step: 10, default: 500, desc: "\u6BCF\u5806\u98DF\u7269\u91CF\uFF08\u9ED8\u8BA4\u7ED9\u8DB3\u91CF\u9632\u8FC7\u65E9\u91C7\u7A7A\uFF0C\u5BF9\u7167\u5B9E\u9A8C\u624D\u6709\u533A\u5206\u5EA6\uFF09" }
        ],
        metrics: [
          { key: "food", desc: "\u7D2F\u8BA1\u91C7\u56DE\u98DF\u7269\u91CF\uFF08\u5DE2\u7A74\u8BA1\u6570\uFF09\uFF0C\u89C5\u98DF\u6548\u7387\u7684\u603B\u8D26", cumulative: true },
          { key: "carrying", desc: "\u5F53\u524D\u643A\u98DF\u8682\u8681\u6570\uFF08\u5F80\u8FD4\u6D41\u91CF\uFF09" },
          { key: "coverage", desc: "\u63A2\u7D22\u8986\u76D6\u7387 \u2208 [0,1]\uFF1A\u88AB\u8E29\u8FC7\u7684\u7F51\u683C\u5360\u6BD4\uFF0C\u8861\u91CF\u63A2\u7D22\u5E7F\u5EA6" },
          { key: "pheromone", desc: "\u573A\u5185\u4FE1\u606F\u7D20\u603B\u8D28\u91CF\uFF1A\u4E71\u8D70\u671F\u9AD8\u566A\u58F0\u6269\u6563\uFF0C\u8DEF\u5F84\u6536\u655B\u540E\u96C6\u4E2D\u4E14\u8D8B\u7A33" }
        ]
      }
    };
    function validateParams(scenarioId, rawParams) {
      const sc = SCENARIOS2[scenarioId];
      if (!sc) return { ok: false, error: `\u672A\u77E5\u573A\u666F: ${scenarioId}\uFF08\u53EF\u9009: ${Object.keys(SCENARIOS2).join("/")}\uFF09` };
      const out = {};
      const raw = rawParams && typeof rawParams === "object" && !Array.isArray(rawParams) ? rawParams : {};
      for (const p of sc.params) {
        if (!(p.key in raw)) {
          out[p.key] = p.default;
          continue;
        }
        const v = raw[p.key];
        if (p.type === "boolean") {
          if (typeof v !== "boolean") return { ok: false, error: `\u53C2\u6570 ${p.key} \u9700\u8981\u5E03\u5C14\u503C\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}` };
          out[p.key] = v;
        } else {
          if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, error: `\u53C2\u6570 ${p.key} \u9700\u8981\u6709\u9650\u6570\u5B57\uFF0C\u5B9E\u5F97 ${JSON.stringify(v)}` };
          if (v < p.min || v > p.max) return { ok: false, error: `\u53C2\u6570 ${p.key}=${v} \u8D8A\u754C\uFF0C\u5141\u8BB8 [${p.min}, ${p.max}]` };
          out[p.key] = p.step >= 1 ? Math.round(v) : v;
        }
      }
      const unknown = Object.keys(raw).filter((k) => !sc.params.some((p) => p.key === k));
      if (unknown.length) return { ok: false, error: `\u672A\u77E5\u53C2\u6570\u952E: ${unknown.join(", ")}\uFF08\u8BE5\u573A\u666F\u53C2\u6570: ${sc.params.map((p) => p.key).join(", ")}\uFF09` };
      return { ok: true, params: out };
    }
    function costGuard(scenarioId, params, ticks, sampleEvery) {
      const n = params.count;
      const t = ticks;
      if (scenarioId === "boids") {
        const samples = Math.ceil(t / (sampleEvery || t));
        if (n * n * (t + samples) > 4e8) {
          return { ok: false, error: `\u7B97\u529B\u62A4\u680F\uFF1Acount\xB2\xD7(ticks+\u91C7\u6837\u70B9)=${n}\xB2\xD7(${t}+${samples}) \u8D85\u4E0A\u9650\uFF084e8\uFF09\uFF0C\u8BF7\u964D\u4F4E\u4E2A\u4F53\u6570/tick \u6570\u6216\u52A0\u5927 sampleEvery` };
        }
      }
      if (scenarioId === "ants" && n * t > 5e7) {
        return { ok: false, error: `\u7B97\u529B\u62A4\u680F\uFF1Acount\xD7ticks=${n}\xD7${t} \u8D85\u4E0A\u9650\uFF085e7\uFF09\uFF0C\u8BF7\u964D\u4F4E\u8682\u8681\u6570\u6216 tick \u6570` };
      }
      return { ok: true };
    }
    function validateRunArgs(scenarioId, rawParams, ticks, seed, sampleEvery) {
      const vp = validateParams(scenarioId, rawParams);
      if (!vp.ok) return vp;
      const sc = SCENARIOS2[scenarioId];
      let t = ticks === void 0 || ticks === null ? sc.defaultTicks : ticks;
      if (typeof t !== "number" || !Number.isFinite(t) || t < 1 || t > sc.maxTicks || Math.round(t) !== t) {
        return { ok: false, error: `ticks \u9700\u4E3A 1~${sc.maxTicks} \u7684\u6574\u6570\uFF0C\u5B9E\u5F97 ${JSON.stringify(ticks)}` };
      }
      let se = sampleEvery === void 0 || sampleEvery === null ? Math.max(1, Math.round(t / 30)) : sampleEvery;
      const cg = costGuard(scenarioId, vp.params, t, se);
      if (!cg.ok) return cg;
      if (typeof se !== "number" || !Number.isFinite(se) || se < 1 || se > t || Math.round(se) !== se) {
        return { ok: false, error: `sampleEvery \u9700\u4E3A 1~${t} \u7684\u6574\u6570\uFF0C\u5B9E\u5F97 ${JSON.stringify(sampleEvery)}` };
      }
      let s = seed;
      if (s === void 0 || s === null || s === "") {
        s = Math.floor(Math.random() * 4294967296);
      } else {
        if (typeof s !== "number" || !Number.isFinite(s) || s < 0 || s > 4294967295 || Math.round(s) !== s) {
          return { ok: false, error: `seed \u9700\u4E3A 0~4294967295 \u7684\u6574\u6570\uFF0C\u5B9E\u5F97 ${JSON.stringify(seed)}` };
        }
      }
      return { ok: true, params: vp.params, ticks: t, seed: s >>> 0, sampleEvery: se };
    }
    function initBoids(params, rand) {
      const agents = [];
      for (let i = 0; i < params.count; i++) {
        const angle = rand() * Math.PI * 2;
        agents.push({ x: rand() * WORLD, y: rand() * WORLD, vx: Math.cos(angle), vy: Math.sin(angle) });
      }
      const predator = params.predator ? { x: rand() * WORLD, y: rand() * WORLD, vx: 0, vy: 0 } : null;
      return { agents, predator, catches: 0 };
    }
    function stepBoids(run, p, rand) {
      const { agents } = run;
      const n = agents.length;
      const per2 = p.perception * p.perception;
      const F = 0.1;
      for (let i = 0; i < n; i++) {
        const a = agents[i];
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, cnt = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const b = agents[j];
          const dx = wrapDelta(b.x - a.x), dy = wrapDelta(b.y - a.y);
          const d2 = dx * dx + dy * dy;
          if (d2 > per2) continue;
          cnt++;
          ax += b.vx;
          ay += b.vy;
          cx += dx;
          cy += dy;
          const d = Math.sqrt(d2) || 1e-9;
          sx -= dx / d;
          sy -= dy / d;
        }
        let fx = 0, fy = 0;
        const sp = Math.hypot(a.vx, a.vy) || 1e-9;
        if (cnt > 0) {
          fx += sx / cnt * p.separation * F;
          fy += sy / cnt * p.separation * F;
          const aln = Math.hypot(ax / cnt, ay / cnt) || 1e-9;
          fx += (ax / cnt / aln - a.vx / sp) * p.alignment * F;
          fy += (ay / cnt / aln - a.vy / sp) * p.alignment * F;
          fx += cx / cnt / p.perception * p.cohesion * F;
          fy += cy / cnt / p.perception * p.cohesion * F;
        }
        if (run.predator) {
          const pr = run.predator;
          const dx = wrapDelta(a.x - pr.x), dy = wrapDelta(a.y - pr.y);
          const d2 = dx * dx + dy * dy;
          if (d2 < per2 * 9) {
            const d = Math.sqrt(d2) || 1e-9;
            const flee = 2.5 * (1 - d / (p.perception * 3));
            fx += dx / d * flee * 0.5;
            fy += dy / d * flee * 0.5;
          }
        }
        a.vx += fx;
        a.vy += fy;
        if (p.noise > 0) {
          const ang = (rand() - 0.5) * 2 * p.noise;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const nx = a.vx * ca - a.vy * sa, ny = a.vx * sa + a.vy * ca;
          a.vx = nx;
          a.vy = ny;
        }
        const sp2 = Math.hypot(a.vx, a.vy) || 1e-9;
        if (sp2 > p.maxSpeed) {
          a.vx = a.vx / sp2 * p.maxSpeed;
          a.vy = a.vy / sp2 * p.maxSpeed;
        }
      }
      for (let i = 0; i < n; i++) {
        const a = agents[i];
        a.x = wrapPos(a.x + a.vx);
        a.y = wrapPos(a.y + a.vy);
      }
      if (run.predator) {
        const pr = run.predator;
        let best = -1, bestD = Infinity;
        for (let i = 0; i < n; i++) {
          const d2 = dist2(pr.x, pr.y, agents[i].x, agents[i].y);
          if (d2 < bestD) {
            bestD = d2;
            best = i;
          }
        }
        const spd = p.maxSpeed * p.predatorSpeed;
        if (best >= 0) {
          const dx = wrapDelta(agents[best].x - pr.x), dy = wrapDelta(agents[best].y - pr.y);
          const d = Math.hypot(dx, dy) || 1e-9;
          pr.vx = dx / d * spd;
          pr.vy = dy / d * spd;
          if (d < 1.2) {
            run.catches++;
            const a = agents[best];
            a.x = rand() * WORLD;
            a.y = rand() * WORLD;
            pr.x = wrapPos(pr.x + pr.vx);
            pr.y = wrapPos(pr.y + pr.vy);
            return;
          }
        }
        pr.x = wrapPos(pr.x + pr.vx);
        pr.y = wrapPos(pr.y + pr.vy);
      }
    }
    function boidsMetrics(run, p) {
      const { agents } = run;
      const n = agents.length;
      let sx = 0, sy = 0;
      for (const a of agents) {
        const sp = Math.hypot(a.vx, a.vy) || 1e-9;
        sx += a.vx / sp;
        sy += a.vy / sp;
      }
      const polarization = Math.hypot(sx, sy) / n;
      const nnd = new Array(n).fill(Infinity);
      const parent = new Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;
      const find = (x) => {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };
      const per2 = p.perception * p.perception;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d2 = dist2(agents[i].x, agents[i].y, agents[j].x, agents[j].y);
          if (d2 < nnd[i]) nnd[i] = d2;
          if (d2 < nnd[j]) nnd[j] = d2;
          if (d2 < per2) {
            const ri = find(i), rj = find(j);
            if (ri !== rj) parent[ri] = rj;
          }
        }
      }
      const roots = /* @__PURE__ */ new Set();
      let nndSum = 0;
      for (let i = 0; i < n; i++) {
        roots.add(find(i));
        nndSum += Math.sqrt(nnd[i]);
      }
      return {
        polarization,
        meanNND: nndSum / n,
        clusters: roots.size,
        catches: run.catches
      };
    }
    function initAnts(params, rand) {
      const nest = { x: WORLD / 2, y: WORLD / 2 };
      const piles = [];
      for (let k = 0; k < Math.round(params.foodPiles); k++) {
        let placed = false;
        for (let tries = 0; tries < 200 && !placed; tries++) {
          const x = rand() * WORLD, y = rand() * WORLD;
          if (dist2(x, y, nest.x, nest.y) < 25 * 25) continue;
          const minGap = tries < 100 ? 15 : 5;
          if (piles.some((q) => dist2(x, y, q.x, q.y) < minGap * minGap)) continue;
          piles.push({ x, y, amount: Math.round(params.foodPerPile), r: 2.2 });
          placed = true;
        }
      }
      const ants = [];
      for (let i = 0; i < Math.round(params.count); i++) {
        ants.push({ x: nest.x, y: nest.y, heading: rand() * Math.PI * 2, carrying: false });
      }
      const pher = new Float32Array(GRID * GRID);
      const visited = new Uint8Array(GRID * GRID);
      return { nest, piles, ants, pher, visited, food: 0, covered: 0 };
    }
    function stepAnts(run, p, rand) {
      const { ants, pher, visited, piles, nest } = run;
      const keep = p.decay;
      let pherSum = 0;
      for (let i = 0; i < pher.length; i++) {
        pher[i] *= keep;
        pherSum += pher[i];
      }
      for (const a of ants) {
        if (a.carrying) {
          const dx = wrapDelta(nest.x - a.x), dy = wrapDelta(nest.y - a.y);
          a.heading = Math.atan2(dy, dx);
          a.x = wrapPos(a.x + Math.cos(a.heading));
          a.y = wrapPos(a.y + Math.sin(a.heading));
          markVisited(visited, run, a.x, a.y);
          deposit(pher, a.x, a.y, p.deposit * 2);
          if (dx * dx + dy * dy < 2) {
            run.food++;
            a.carrying = false;
            a.heading += Math.PI + (rand() - 0.5);
          }
          continue;
        }
        for (const pile of piles) {
          if (pile.amount <= 0) continue;
          if (dist2(a.x, a.y, pile.x, pile.y) < pile.r * pile.r) {
            pile.amount--;
            a.carrying = true;
            break;
          }
        }
        if (a.carrying) continue;
        if (p.smell > 0) {
          let bestPile = null, bestD = Infinity;
          for (const pile of piles) {
            if (pile.amount <= 0) continue;
            const d2 = dist2(a.x, a.y, pile.x, pile.y);
            if (d2 < bestD) {
              bestD = d2;
              bestPile = pile;
            }
          }
          if (bestPile && bestD < p.smell * p.smell) {
            a.heading = Math.atan2(wrapDelta(bestPile.y - a.y), wrapDelta(bestPile.x - a.x)) + (rand() - 0.5) * 0.2;
            a.x = wrapPos(a.x + Math.cos(a.heading));
            a.y = wrapPos(a.y + Math.sin(a.heading));
            markVisited(visited, run, a.x, a.y);
            continue;
          }
        }
        const base = a.heading;
        const sense = (h) => pher[cellIdx(wrapPos(a.x + Math.cos(h) * p.sensorDist), wrapPos(a.y + Math.sin(h) * p.sensorDist))];
        const vL = sense(base - 0.6), vC = sense(base), vR = sense(base + 0.6);
        let bestH = base;
        if (vL > vC && vL >= vR) bestH = base - 0.6;
        else if (vR > vC && vR > vL) bestH = base + 0.6;
        a.heading = bestH + (rand() - 0.5) * 2 * p.wander;
        a.x = wrapPos(a.x + Math.cos(a.heading));
        a.y = wrapPos(a.y + Math.sin(a.heading));
        markVisited(visited, run, a.x, a.y);
      }
      run.pheromoneLast = pherSum;
    }
    function cellIdx(x, y) {
      const cx = Math.min(GRID - 1, Math.max(0, Math.floor(x / WORLD * GRID)));
      const cy = Math.min(GRID - 1, Math.max(0, Math.floor(y / WORLD * GRID)));
      return cy * GRID + cx;
    }
    function markVisited(visited, run, x, y) {
      const idx = cellIdx(x, y);
      if (!visited[idx]) {
        visited[idx] = 1;
        run.covered++;
      }
    }
    function deposit(pher, x, y, amount) {
      pher[cellIdx(x, y)] += amount;
    }
    function antsMetrics(run) {
      return {
        food: run.food,
        carrying: run.ants.reduce((s, a) => s + (a.carrying ? 1 : 0), 0),
        coverage: run.covered / (GRID * GRID),
        pheromone: run.pheromoneLast || 0
      };
    }
    function normalizeParams(scenarioId, params) {
      const sc = SCENARIOS2[scenarioId];
      const out = {};
      for (const p of sc.params) {
        const raw = params && typeof params === "object" && p.key in params ? params[p.key] : p.default;
        if (p.type === "boolean") out[p.key] = raw === true;
        else out[p.key] = typeof raw === "number" && Number.isFinite(raw) ? raw : p.default;
      }
      for (const p of sc.params) {
        if (p.type === "number" && p.step >= 1) out[p.key] = Math.max(1, Math.round(out[p.key]));
      }
      return out;
    }
    function createRun(scenarioId, rawParams, seed) {
      const sc = SCENARIOS2[scenarioId];
      if (!sc) throw new Error(`\u672A\u77E5\u573A\u666F: ${scenarioId}`);
      const params = normalizeParams(scenarioId, rawParams);
      const rand = mulberry32(seed >>> 0);
      const state = scenarioId === "boids" ? initBoids(params, rand) : initAnts(params, rand);
      let tickCount = 0;
      return {
        scenario: scenarioId,
        params,
        seed: seed >>> 0,
        state,
        get tickCount() {
          return tickCount;
        },
        tick() {
          if (scenarioId === "boids") stepBoids(state, params, rand);
          else stepAnts(state, params, rand);
          tickCount++;
        },
        metrics() {
          return scenarioId === "boids" ? boidsMetrics(state, params) : antsMetrics(state);
        }
      };
    }
    function runBatch(scenarioId, params, seed, ticks, sampleEvery) {
      const run = createRun(scenarioId, params, seed);
      const metricKeys = SCENARIOS2[scenarioId].metrics.map((m) => m.key);
      const series = [];
      series.push({ tick: 0, ...run.metrics() });
      let nextSample = sampleEvery;
      for (let t = 1; t <= ticks; t++) {
        run.tick();
        if (t === nextSample || t === ticks) {
          series.push({ tick: t, ...run.metrics() });
          nextSample += sampleEvery;
        }
      }
      const summary = {};
      for (const k of metricKeys) {
        const vals = series.map((s) => s[k]);
        summary[k] = {
          first: vals[0],
          last: vals[vals.length - 1],
          min: Math.min(...vals),
          max: Math.max(...vals),
          mean: vals.reduce((a, b) => a + b, 0) / vals.length
        };
      }
      return { scenario: scenarioId, params, seed: run.seed, ticks, sampleEvery, series, summary };
    }
    function snapshotGrid(scenarioId, params, seed, ticks, cells) {
      const run = createRun(scenarioId, params, seed);
      for (let t = 0; t < ticks; t++) run.tick();
      const c = Math.min(48, Math.max(8, Math.round(cells || 24)));
      const grid = new Array(c * c).fill(0);
      const agents = scenarioId === "boids" ? run.state.agents : run.state.ants;
      let sx = 0, sy = 0;
      for (const a of agents) {
        sx += a.x;
        sy += a.y;
        const cx = Math.min(c - 1, Math.floor(a.x / WORLD * c));
        const cy = Math.min(c - 1, Math.floor(a.y / WORLD * c));
        grid[cy * c + cx]++;
      }
      const maxCell = Math.max(...grid, 1);
      const chars = " .:-=+*#%@";
      const rows = [];
      for (let r = 0; r < c; r++) {
        rows.push(grid.slice(r * c, r * c + c).map((v) => chars[Math.min(9, Math.floor(v / maxCell * 9.99))]).join(""));
      }
      const cxm = sx / agents.length, cym = sy / agents.length;
      let spread = 0;
      for (const a of agents) spread += Math.hypot(wrapDelta(a.x - cxm), wrapDelta(a.y - cym));
      return {
        scenario: scenarioId,
        seed: run.seed,
        ticks,
        cells: c,
        rows,
        centroid: { x: cxm, y: cym },
        spread: spread / agents.length,
        maxCell
      };
    }
    module.exports = {
      WORLD,
      GRID,
      SCENARIOS: SCENARIOS2,
      mulberry32,
      wrapDelta,
      dist2,
      wrapPos,
      validateParams,
      validateRunArgs,
      costGuard,
      normalizeParams,
      createRun,
      runBatch,
      snapshotGrid
    };
  }
});

// src/Panel.tsx
var import_engine = __toESM(require_engine());
import { useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var SCENARIOS = Object.values(import_engine.default.SCENARIOS);
var css = `
.sw-root{position:relative;height:100%;display:flex;flex-direction:column;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6E9F2;background:transparent}
.sw-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sw-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sw-body::-webkit-scrollbar{width:9px;height:9px}
.sw-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sw-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E1220 75%,rgba(14,18,32,0))}
.sw-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0b2f3b,#12203a 60%,#0E1220);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid #1f4a5a}
.sw-tt{flex:1;min-width:0}
.sw-tt b{font-size:15px;display:block}
.sw-tt small{color:#8B94A9;font-size:10.5px;display:block;margin-top:1px}
.sw-tabs{display:flex;gap:4px}
.sw-tab{background:transparent;border:none;color:#8B94A9;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.sw-tab:hover{color:#E6E9F2}
.sw-tab.on{background:#1D2436;color:#E6E9F2;font-weight:600}
.sw-stage{margin:0 16px 10px}
.sw-canvas{display:block;width:100%;aspect-ratio:1/1;border-radius:13px;border:1px solid #232B40;background:#0b0e17}
.sw-ctrl{display:flex;align-items:center;gap:6px;padding:0 16px 10px;flex-wrap:wrap}
.sw-btn{background:#1e7a63;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.sw-btn:hover{filter:brightness(1.12)}
.sw-btn.ghost{background:#20263A;color:#E6E9F2;border:1px solid #2a3145}
.sw-speed{display:inline-flex;align-items:center;gap:5px;color:#8B94A9;font-size:11.5px;margin-left:auto}
.sw-speed select{background:#20263A;color:#E6E9F2;border:1px solid #2a3145;border-radius:7px;padding:4px 6px;font-size:12px}
.sw-head-metric{margin:0 16px 10px;background:#141927;border:1px solid #232B40;border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:12px}
.sw-hm-label{font-size:11px;color:#8B94A9;white-space:nowrap}
.sw-hm-value{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:#4fd1a0;min-width:74px}
.sw-curve{flex:1;height:44px;min-width:0}
.sw-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sw-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sw-card{background:#141927;border:1px solid #232B40;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sw-card-b{padding:11px 13px}
.sw-sub{font-size:10.5px;color:#8B94A9;line-height:1.6;margin-bottom:8px}
.sw-param{display:flex;align-items:center;gap:8px;padding:5px 0}
.sw-pk{font-size:11.5px;color:#B4B8C4;min-width:150px;flex-shrink:0}
.sw-pk b{color:#E6E9F2;font-variant-numeric:tabular-nums}
.sw-param input[type=range]{flex:1;min-width:0;accent-color:#4fd1a0}
.sw-chip{background:#1D2436;border:1px solid #2a3145;border-radius:999px;color:#B4B8C4;font-size:11.5px;padding:4px 14px;cursor:pointer}
.sw-chip.on{background:#14352a;border-color:#4fd1a0;color:#b7efdc;font-weight:600}
.sw-metric{padding:6px 0;border-bottom:1px solid #1c2333}
.sw-metric:last-child{border-bottom:none}
.sw-mk{font-size:12.5px}
.sw-mk b{color:#4fd1a0;font-variant-numeric:tabular-nums}
.sw-about{font-size:11.5px;color:#8B94A9;line-height:1.7;padding:12px 18px}
.sw-about b{color:#E6E9F2}
`;
var HEAD_METRIC = { boids: "polarization", ants: "food" };
var STRUCTURAL = {
  boids: /* @__PURE__ */ new Set(["count", "predator"]),
  ants: /* @__PURE__ */ new Set(["count", "foodPiles", "foodPerPile"])
};
function defaultsOf(sc) {
  const o = {};
  for (const p of sc.params) o[p.key] = p.default;
  return o;
}
function SwarmLabPanel() {
  const [scenarioId, setScenarioId] = useState("boids");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [seed, setSeed] = useState(42);
  const [readouts, setReadouts] = useState({ tick: 0, metrics: {} });
  const [paramValues, setParamValues] = useState(() => defaultsOf(SCENARIOS[0]));
  const [, bumpTick] = useState(0);
  const canvasRef = useRef(null);
  const heatRef = useRef(null);
  const curveCanvas = useRef(null);
  const curveRef = useRef([]);
  const runRef = useRef(null);
  const rafRef = useRef(0);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const sidRef = useRef(scenarioId);
  playingRef.current = playing;
  speedRef.current = speed;
  sidRef.current = scenarioId;
  const buildRun = (sid, sd) => {
    const target = SCENARIOS.find((s) => s.id === sid);
    const params = defaultsOf(target);
    runRef.current = import_engine.default.createRun(sid, params, sd);
    curveRef.current = [];
    setParamValues({ ...params });
    setReadouts({ tick: 0, metrics: {} });
  };
  useEffect(() => {
    buildRun(scenarioId, seed);
  }, [scenarioId, seed]);
  useEffect(() => {
    let stop = false;
    const loop = () => {
      if (stop) return;
      const run = runRef.current;
      if (run && playingRef.current) {
        for (let i = 0; i < speedRef.current; i++) run.tick();
        const m = run.metrics();
        const arr = curveRef.current;
        arr.push({ tick: run.tickCount, ...m });
        if (arr.length > 160) arr.shift();
        setReadouts({ tick: run.tickCount, metrics: m });
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stop = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);
  function draw() {
    const cv = canvasRef.current;
    const run = runRef.current;
    if (!cv || !run) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(w * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const S = cv.width;
    const k = S / import_engine.default.WORLD;
    ctx.fillStyle = "#0b0e17";
    ctx.fillRect(0, 0, S, S);
    if (run.scenario === "ants") drawAnts(ctx, run.state, k, dpr);
    else drawBoids(ctx, run.state, k);
  }
  function drawBoids(ctx, st, k) {
    const { agents, predator } = st;
    ctx.fillStyle = "#4fd1a0";
    for (const a of agents) {
      const sp = Math.hypot(a.vx, a.vy) || 1e-9;
      const ux = a.vx / sp, uy = a.vy / sp;
      const x = a.x * k, y = a.y * k, r = 3.2 * k;
      ctx.beginPath();
      ctx.moveTo(x + ux * r * 1.6, y + uy * r * 1.6);
      ctx.lineTo(x - ux * r - uy * r * 0.7, y - uy * r + ux * r * 0.7);
      ctx.lineTo(x - ux * r + uy * r * 0.7, y - uy * r - ux * r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    if (predator) {
      ctx.fillStyle = "#F08AA8";
      ctx.beginPath();
      ctx.arc(predator.x * k, predator.y * k, 5.5 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawAnts(ctx, st, k, dpr) {
    const { ants, pher, nest, piles } = st;
    let heat = heatRef.current;
    if (!heat) {
      heat = document.createElement("canvas");
      heatRef.current = heat;
    }
    heat.width = import_engine.default.GRID;
    heat.height = import_engine.default.GRID;
    const hctx = heat.getContext("2d");
    if (hctx) {
      const img = hctx.createImageData(import_engine.default.GRID, import_engine.default.GRID);
      let maxP = 1e-6;
      for (let i = 0; i < pher.length; i++) if (pher[i] > maxP) maxP = pher[i];
      for (let i = 0; i < pher.length; i++) {
        const v = Math.min(1, pher[i] / maxP);
        img.data[i * 4] = 26;
        img.data[i * 4 + 1] = Math.round(120 + 60 * v);
        img.data[i * 4 + 2] = 110;
        img.data[i * 4 + 3] = Math.round(v * 190);
      }
      hctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(heat, 0, 0, import_engine.default.WORLD * k, import_engine.default.WORLD * k);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.strokeStyle = "#9FB6DD";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(nest.x * k, nest.y * k, 4 * k, 0, Math.PI * 2);
    ctx.stroke();
    for (const p of piles) {
      if (p.amount <= 0) continue;
      ctx.fillStyle = "#7EE2A0";
      ctx.beginPath();
      ctx.arc(p.x * k, p.y * k, p.r * k * (0.5 + 0.5 * (p.amount / 200)), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const a of ants) {
      ctx.fillStyle = a.carrying ? "#F0B47A" : "#E6E9F2";
      ctx.fillRect(a.x * k - 1.2 * k, a.y * k - 1.2 * k, 2.4 * k, 2.4 * k);
    }
  }
  useEffect(() => {
    const cv = curveCanvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 300;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(44 * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const arr = curveRef.current;
    const head = HEAD_METRIC[sidRef.current];
    if (arr.length < 2) return;
    const vals = arr.map((p) => p[head]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    ctx.strokeStyle = "#4fd1a0";
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    arr.forEach((p, i) => {
      const x = i / (arr.length - 1) * cv.width;
      const y = cv.height - 4 * dpr - (p[head] - lo) / span * (cv.height - 8 * dpr);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [readouts]);
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  const headKey = HEAD_METRIC[scenarioId];
  const headVal = readouts.metrics[headKey];
  const fmt = (key, v) => v === void 0 ? "\u2014" : v.toFixed(key === "food" || key === "catches" || key === "clusters" ? 0 : 3);
  const onParam = (p, value) => {
    const run = runRef.current;
    if (!run) return;
    setParamValues((prev) => ({ ...prev, [p.key]: value }));
    if (!STRUCTURAL[scenarioId].has(p.key)) {
      run.params[p.key] = value;
      bumpTick((t) => t + 1);
    } else {
      buildRun(scenarioId, seed);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "sw-root", children: [
    css ? /* @__PURE__ */ jsx("style", { children: css }) : null,
    /* @__PURE__ */ jsxs("div", { className: "sw-top", children: [
      /* @__PURE__ */ jsx("div", { className: "sw-logo", children: "\u{1F41D}" }),
      /* @__PURE__ */ jsxs("div", { className: "sw-tt", children: [
        /* @__PURE__ */ jsx("b", { children: "\u8702\u7FA4\u5B9E\u9A8C\u53F0" }),
        /* @__PURE__ */ jsxs("small", { children: [
          "\u591A\u667A\u80FD\u4F53\u6D8C\u73B0\u884C\u4E3A\u6C99\u76D8 \xB7 \u79CD\u5B50 ",
          seed,
          " \xB7 tick ",
          readouts.tick
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sw-tabs", children: SCENARIOS.map((s) => /* @__PURE__ */ jsx("button", { className: `sw-tab${s.id === scenarioId ? " on" : ""}`, onClick: () => setScenarioId(s.id), children: s.name.split("\uFF08")[0] }, s.id)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "sw-body", children: [
      /* @__PURE__ */ jsx("div", { className: "sw-stage", children: /* @__PURE__ */ jsx("canvas", { ref: canvasRef, className: "sw-canvas" }) }),
      /* @__PURE__ */ jsxs("div", { className: "sw-ctrl", children: [
        /* @__PURE__ */ jsx("button", { className: "sw-btn", onClick: () => setPlaying((p) => !p), children: playing ? "\u23F8 \u6682\u505C" : "\u25B6 \u5F00\u59CB" }),
        /* @__PURE__ */ jsx("button", { className: "sw-btn ghost", onClick: () => {
          const r = runRef.current;
          if (r) {
            r.tick();
            setReadouts({ tick: r.tickCount, metrics: r.metrics() });
          }
        }, children: "\u5355\u6B65" }),
        /* @__PURE__ */ jsx("button", { className: "sw-btn ghost", onClick: () => buildRun(scenarioId, seed), children: "\u91CD\u7F6E" }),
        /* @__PURE__ */ jsx("button", { className: "sw-btn ghost", onClick: () => setSeed(Math.floor(Math.random() * 4294967296)), children: "\u65B0\u79CD\u5B50" }),
        /* @__PURE__ */ jsxs("label", { className: "sw-speed", children: [
          "\u901F\u5EA6",
          /* @__PURE__ */ jsx("select", { value: speed, onChange: (e) => setSpeed(Number(e.target.value)), children: [1, 2, 4, 8].map((v) => /* @__PURE__ */ jsxs("option", { value: v, children: [
            v,
            "\xD7"
          ] }, v)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sw-head-metric", children: [
        /* @__PURE__ */ jsx("div", { className: "sw-hm-label", children: headKey === "polarization" ? "\u6781\u5316\u6307\u6570\uFF08\u79E9\u5E8F\uFF09" : "\u7D2F\u8BA1\u91C7\u98DF\uFF08\u4EA7\u51FA\uFF09" }),
        /* @__PURE__ */ jsx("div", { className: "sw-hm-value", children: fmt(headKey, headVal) }),
        /* @__PURE__ */ jsx("canvas", { ref: curveCanvas, className: "sw-curve" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "sw-sec", children: [
        "\u5B9E\u9A8C\u53C2\u6570 ",
        /* @__PURE__ */ jsx("span", { className: "sw-hint", children: sc.name })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sw-card", children: /* @__PURE__ */ jsxs("div", { className: "sw-card-b", children: [
        /* @__PURE__ */ jsx("div", { className: "sw-sub", children: sc.description }),
        sc.params.map((p) => /* @__PURE__ */ jsx("div", { className: "sw-param", children: p.type === "boolean" ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { className: "sw-pk", children: p.desc }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: `sw-chip${paramValues[p.key] ? " on" : ""}`,
              onClick: () => onParam(p, !paramValues[p.key]),
              children: paramValues[p.key] ? "\u5F00" : "\u5173"
            }
          )
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("span", { className: "sw-pk", children: [
            p.desc,
            " ",
            /* @__PURE__ */ jsx("b", { children: String(paramValues[p.key]) })
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "range",
              min: p.min,
              max: p.max,
              step: p.step,
              value: Number(paramValues[p.key]),
              onChange: (e) => onParam(p, Number(e.target.value))
            }
          )
        ] }) }, p.key))
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "sw-sec", children: [
        "\u5B9E\u65F6\u6307\u6807 ",
        /* @__PURE__ */ jsx("span", { className: "sw-hint", children: "\u9010\u5E27\u8BFB\u6570" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "sw-card", children: /* @__PURE__ */ jsx("div", { className: "sw-card-b", children: sc.metrics.map((m) => /* @__PURE__ */ jsxs("div", { className: "sw-metric", children: [
        /* @__PURE__ */ jsxs("div", { className: "sw-mk", children: [
          /* @__PURE__ */ jsx("b", { children: m.key }),
          " ",
          fmt(m.key, readouts.metrics[m.key])
        ] }),
        /* @__PURE__ */ jsx("div", { className: "sw-sub", children: m.desc })
      ] }, m.key)) }) }),
      /* @__PURE__ */ jsxs("div", { className: "sw-about", children: [
        "\u7EAF\u672C\u5730\u786E\u5B9A\u6027\u4EFF\u771F\uFF08mulberry32 \u79CD\u5B50\uFF09\uFF0C\u65E0\u670D\u52A1\u65E0\u5916\u8054\u3002\u60F3\u505A\u5BF9\u7167\u5B9E\u9A8C\uFF0C\u8BA9 AI \u7528 MCP \u5DE5\u5177",
        /* @__PURE__ */ jsx("b", { children: " swarmlab_compare" }),
        " \u540C\u79CD\u5B50\u8DD1\u53C2\u6570\u7EC4\uFF1B\u9762\u677F\u4E0E AI \u5171\u7528\u540C\u4E00\u5F15\u64CE\u4E0E\u53E3\u5F84\u3002"
      ] })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function SwarmLabEntry(_props) {
  return /* @__PURE__ */ jsx2(SwarmLabPanel, {});
}
export {
  SwarmLabEntry as default
};
