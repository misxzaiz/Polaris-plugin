/**
 * 蜂群实验台核心引擎（shared/engine.js）
 *
 * 纯算法核心：无 IO、无宿主依赖、确定性（mulberry32 种子化 PRNG）。
 * 面板与 MCP 双端共用本模块——同一权威，口径不漂移（watchtower/usage-core 同范式）。
 *
 * 两个涌现场景：
 *   boids —— 分离/对齐/聚合三规则（Reynolds 1987）+ 可选捕食者（惊群源）。
 *            涌现：群体秩序（极化）、成团（群簇数）。
 *   ants  —— 信息素沉积/蒸发觅食（Deneubourg 式简化模型：3 探针转向）。
 *            涌现：从乱走到路径收敛（采食效率上升）。
 *
 * 世界统一为环形（toroidal）正方形 [0,100)×[0,100)——消除边界效应，
 * 实验指标不被「靠墙」污染；距离一律取环面最短向量。
 */
'use strict';

const WORLD = 100; // 世界边长（世界单位）

// ── 种子化随机 ──────────────────────────────────────────────────────────────
// mulberry32：32 位种子、质量足够、可序列化复现——实验平台的「可复现」根。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 环面最短位移向量（x2-x1 落入 [-W/2, W/2)）
function wrapDelta(d) {
  const W = WORLD;
  let x = d % W;
  if (x < -W / 2) x += W; else if (x >= W / 2) x -= W;
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

// ── 场景与参数口径（MCP scenarios / 面板滑杆共同读这里）─────────────────────
const GRID = 64; // 蚁群信息素网格边长

const SCENARIOS = {
  boids: {
    id: 'boids',
    name: '蜂群鸟群（Boids）',
    description: '分离/对齐/聚合三规则涌现群体秩序；可选捕食者诱发惊群。看极化指数如何随对齐权重变化。',
    defaultTicks: 600,
    maxTicks: 3000, // O(N²) 邻居扫描，tick 数随 count 有乘积护栏（见 costGuard）
    params: [
      { key: 'count', type: 'number', min: 10, max: 400, step: 10, default: 120, desc: '个体数' },
      { key: 'separation', type: 'number', min: 0, max: 3, step: 0.1, default: 1.2, desc: '分离权重（防碰撞挤团）' },
      { key: 'alignment', type: 'number', min: 0, max: 3, step: 0.1, default: 1.0, desc: '对齐权重（秩序的主要来源）' },
      { key: 'cohesion', type: 'number', min: 0, max: 3, step: 0.1, default: 0.8, desc: '聚合权重（成团的主要来源）' },
      { key: 'perception', type: 'number', min: 2, max: 30, step: 1, default: 8, desc: '感知半径（世界单位）' },
      { key: 'maxSpeed', type: 'number', min: 0.3, max: 3, step: 0.1, default: 1.2, desc: '最大速度（世界单位/tick）' },
      { key: 'noise', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5, desc: '转向随机噪声（±noise 弧度/tick；对齐权重 vs 噪声=Vicsek 相变实验）' },
      { key: 'predator', type: 'boolean', default: false, desc: '启用捕食者（惊群源）' },
      { key: 'predatorSpeed', type: 'number', min: 0.5, max: 2.5, step: 0.1, default: 1.5, desc: '捕食者速度倍率（predator=true 时生效）' },
    ],
    metrics: [
      { key: 'polarization', desc: '极化指数 |Σv̂|/N ∈ [0,1]：越高越同向有序，接近 0 为乱向/散沙', higherIsMoreOrder: true },
      { key: 'meanNND', desc: '平均最近邻距离（世界单位）：过小=拥挤堆叠，过大=一盘散沙' },
      { key: 'clusters', desc: '群簇数：以感知半径为连通阈值的连通分量个数，越低越聚合成大团' },
      { key: 'catches', desc: '捕食者累计捕获数（predator=true 才有意义；捕获后个体随机重生，数量守恒）', cumulative: true },
    ],
  },
  ants: {
    id: 'ants',
    name: '蚁群觅食（信息素）',
    description: '携食蚁沉积信息素、信息素蒸发、3 探针转向——从乱走涌现出觅食路径。看累计采食曲线何时起飞。',
    defaultTicks: 1500,
    maxTicks: 20000, // O(N×3) 探针扫描，很便宜，上限宽
    params: [
      { key: 'count', type: 'number', min: 5, max: 300, step: 5, default: 80, desc: '蚂蚁数' },
      { key: 'deposit', type: 'number', min: 0.1, max: 5, step: 0.1, default: 1.0, desc: '信息素沉积强度（仅携食蚁沉积×2）' },
      { key: 'decay', type: 'number', min: 0.9, max: 0.999, step: 0.001, default: 0.985, desc: '每 tick 信息素保留率（1-保留=蒸发）' },
      { key: 'wander', type: 'number', min: 0, max: 1.5, step: 0.05, default: 0.35, desc: '游走角扰动幅度（弧度）' },
      { key: 'sensorDist', type: 'number', min: 2, max: 15, step: 1, default: 6, desc: '探针距离（世界单位）' },
      { key: 'smell', type: 'number', min: 0, max: 15, step: 1, default: 5, desc: '食物直接感知半径（0=纯信息素无直觉）' },
      { key: 'foodPiles', type: 'number', min: 1, max: 5, step: 1, default: 2, desc: '食物堆数' },
      { key: 'foodPerPile', type: 'number', min: 50, max: 500, step: 10, default: 500, desc: '每堆食物量（默认给足量防过早采空，对照实验才有区分度）' },
    ],
    metrics: [
      { key: 'food', desc: '累计采回食物量（巢穴计数），觅食效率的总账', cumulative: true },
      { key: 'carrying', desc: '当前携食蚂蚁数（往返流量）' },
      { key: 'coverage', desc: '探索覆盖率 ∈ [0,1]：被踩过的网格占比，衡量探索广度' },
      { key: 'pheromone', desc: '场内信息素总质量：乱走期高噪声扩散，路径收敛后集中且趋稳' },
    ],
  },
};

// ── 参数校验（显式拒绝，不静默钳制——实验参数必须所见即所跑）───────────────
function validateParams(scenarioId, rawParams) {
  const sc = SCENARIOS[scenarioId];
  if (!sc) return { ok: false, error: `未知场景: ${scenarioId}（可选: ${Object.keys(SCENARIOS).join('/')}）` };
  const out = {};
  const raw = rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams) ? rawParams : {};
  for (const p of sc.params) {
    if (!(p.key in raw)) { out[p.key] = p.default; continue; }
    const v = raw[p.key];
    if (p.type === 'boolean') {
      if (typeof v !== 'boolean') return { ok: false, error: `参数 ${p.key} 需要布尔值，实得 ${JSON.stringify(v)}` };
      out[p.key] = v;
    } else {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `参数 ${p.key} 需要有限数字，实得 ${JSON.stringify(v)}` };
      if (v < p.min || v > p.max) return { ok: false, error: `参数 ${p.key}=${v} 越界，允许 [${p.min}, ${p.max}]` };
      out[p.key] = p.step >= 1 ? Math.round(v) : v; // 整数参数（count/堆数）取整，其余原值
    }
  }
  const unknown = Object.keys(raw).filter((k) => !sc.params.some((p) => p.key === k));
  if (unknown.length) return { ok: false, error: `未知参数键: ${unknown.join(', ')}（该场景参数: ${sc.params.map((p) => p.key).join(', ')}）` };
  return { ok: true, params: out };
}

// 乘积护栏：显式拒绝算不完的组合，不静默降载（宁出错不掺水）
// 成本两笔账：逐 tick 邻居扫描 n²×ticks + 逐采样点指标计算 n²×samples（boids 均 O(n²)）
function costGuard(scenarioId, params, ticks, sampleEvery) {
  const n = params.count;
  const t = ticks;
  if (scenarioId === 'boids') {
    const samples = Math.ceil(t / (sampleEvery || t));
    if (n * n * (t + samples) > 4.0e8) {
      return { ok: false, error: `算力护栏：count²×(ticks+采样点)=${n}²×(${t}+${samples}) 超上限（4e8），请降低个体数/tick 数或加大 sampleEvery` };
    }
  }
  if (scenarioId === 'ants' && n * t > 5.0e7) {
    return { ok: false, error: `算力护栏：count×ticks=${n}×${t} 超上限（5e7），请降低蚂蚁数或 tick 数` };
  }
  return { ok: true };
}

function validateRunArgs(scenarioId, rawParams, ticks, seed, sampleEvery) {
  const vp = validateParams(scenarioId, rawParams);
  if (!vp.ok) return vp;
  const sc = SCENARIOS[scenarioId];
  let t = ticks === undefined || ticks === null ? sc.defaultTicks : ticks;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 1 || t > sc.maxTicks || Math.round(t) !== t) {
    return { ok: false, error: `ticks 需为 1~${sc.maxTicks} 的整数，实得 ${JSON.stringify(ticks)}` };
  }
  let se = sampleEvery === undefined || sampleEvery === null ? Math.max(1, Math.round(t / 30)) : sampleEvery;
  const cg = costGuard(scenarioId, vp.params, t, se);
  if (!cg.ok) return cg;
  if (typeof se !== 'number' || !Number.isFinite(se) || se < 1 || se > t || Math.round(se) !== se) {
    return { ok: false, error: `sampleEvery 需为 1~${t} 的整数，实得 ${JSON.stringify(sampleEvery)}` };
  }
  let s = seed;
  if (s === undefined || s === null || s === '') {
    s = Math.floor(Math.random() * 4294967296); // 未指定种子→随机生成并回显，调用方可引用复跑
  } else {
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 4294967295 || Math.round(s) !== s) {
      return { ok: false, error: `seed 需为 0~4294967295 的整数，实得 ${JSON.stringify(seed)}` };
    }
  }
  return { ok: true, params: vp.params, ticks: t, seed: s >>> 0, sampleEvery: se };
}

// ── boids 场景 ──────────────────────────────────────────────────────────────
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
  const F = 0.1; // 全局转向力尺度：速度增量以 maxSpeed 的小比例施加，避免 wA>1 时 (avg−v) 直接外插导致震荡
  // 先算转向再统一落位（同 tick 邻居用旧位置，消除顺序偏置）
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
      ax += b.vx; ay += b.vy;
      cx += dx; cy += dy;
      const d = Math.sqrt(d2) || 1e-9;
      sx -= dx / d; sy -= dy / d; // 分离：远离方向，越近越强
    }
    let fx = 0, fy = 0;
    const sp = Math.hypot(a.vx, a.vy) || 1e-9;
    if (cnt > 0) {
      // 分离：远离邻居（1/d 权重和按邻居数归一，≤1 量级）
      fx += (sx / cnt) * p.separation * F;
      fy += (sy / cnt) * p.separation * F;
      // 对齐：朝邻居平均「单位」速度转向（单位向量差 ≤2，wA∈[0,3] 单调可控）
      const aln = Math.hypot(ax / cnt, ay / cnt) || 1e-9;
      fx += ((ax / cnt / aln) - a.vx / sp) * p.alignment * F;
      fy += ((ay / cnt / aln) - a.vy / sp) * p.alignment * F;
      // 聚合：朝局部中心（偏移按感知半径归一 ≤1）
      fx += (cx / cnt / p.perception) * p.cohesion * F;
      fy += (cy / cnt / p.perception) * p.cohesion * F;
    }
    // 捕食者：惊群逃逸（在感知半径 3 倍内即逃离；逃力不经 F 缩放——
    // 捕食者速度是猎物 1.5~2.5 倍，逃力太弱猎物永远跑不掉）
    if (run.predator) {
      const pr = run.predator;
      const dx = wrapDelta(a.x - pr.x), dy = wrapDelta(a.y - pr.y);
      const d2 = dx * dx + dy * dy;
      if (d2 < per2 * 9) {
        const d = Math.sqrt(d2) || 1e-9;
        const flee = 2.5 * (1 - d / (p.perception * 3));
        fx += (dx / d) * flee * 0.5; fy += (dy / d) * flee * 0.5;
      }
    }
    a.vx += fx; a.vy += fy;
    // Vicsek 式噪声：±noise 弧度角扰动（种子化 rand，保确定性）
    if (p.noise > 0) {
      const ang = (rand() - 0.5) * 2 * p.noise;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = a.vx * ca - a.vy * sa, ny = a.vx * sa + a.vy * ca;
      a.vx = nx; a.vy = ny;
    }
    const sp2 = Math.hypot(a.vx, a.vy) || 1e-9;
    if (sp2 > p.maxSpeed) { a.vx = (a.vx / sp2) * p.maxSpeed; a.vy = (a.vy / sp2) * p.maxSpeed; }
  }
  for (let i = 0; i < n; i++) {
    const a = agents[i];
    a.x = wrapPos(a.x + a.vx); a.y = wrapPos(a.y + a.vy);
  }
  // 捕食者追踪最近个体；捕获=惊散+随机重生（数量守恒，catches 计数）
  if (run.predator) {
    const pr = run.predator;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d2 = dist2(pr.x, pr.y, agents[i].x, agents[i].y);
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    const spd = p.maxSpeed * p.predatorSpeed;
    if (best >= 0) {
      const dx = wrapDelta(agents[best].x - pr.x), dy = wrapDelta(agents[best].y - pr.y);
      const d = Math.hypot(dx, dy) || 1e-9;
      pr.vx = (dx / d) * spd; pr.vy = (dy / d) * spd;
      if (d < 1.2) {
        run.catches++;
        const a = agents[best];
        // 重生也走种子随机——可复现是本引擎的硬承诺，任何随机都用同一 rand 流
        a.x = rand() * WORLD; a.y = rand() * WORLD;
        pr.x = wrapPos(pr.x + pr.vx); pr.y = wrapPos(pr.y + pr.vy);
        return;
      }
    }
    pr.x = wrapPos(pr.x + pr.vx); pr.y = wrapPos(pr.y + pr.vy);
  }
}

// 极化：|Σv̂|/N ∈ [0,1]
function boidsMetrics(run, p) {
  const { agents } = run;
  const n = agents.length;
  let sx = 0, sy = 0;
  for (const a of agents) {
    const sp = Math.hypot(a.vx, a.vy) || 1e-9;
    sx += a.vx / sp; sy += a.vy / sp;
  }
  const polarization = Math.hypot(sx, sy) / n;
  // 平均最近邻 + 群簇（并查集，感知半径为连通阈值）——每 tick 全量算 O(N²)，采样点才调
  const nnd = new Array(n).fill(Infinity);
  const parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
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
  const roots = new Set();
  let nndSum = 0;
  for (let i = 0; i < n; i++) { roots.add(find(i)); nndSum += Math.sqrt(nnd[i]); }
  return {
    polarization,
    meanNND: nndSum / n,
    clusters: roots.size,
    catches: run.catches,
  };
}

// ── ants 场景 ───────────────────────────────────────────────────────────────
function initAnts(params, rand) {
  const nest = { x: WORLD / 2, y: WORLD / 2 };
  // 食物堆：种子化撒点，保证离巢足够远（≥25 世界单位）；200 次放不下则放宽堆间距
  const piles = [];
  for (let k = 0; k < Math.round(params.foodPiles); k++) {
    let placed = false;
    for (let tries = 0; tries < 200 && !placed; tries++) {
      const x = rand() * WORLD, y = rand() * WORLD;
      if (dist2(x, y, nest.x, nest.y) < 25 * 25) continue;
      const minGap = tries < 100 ? 15 : 5; // 放不下时逐步放宽堆间距，防死循环
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
  // 信息素蒸发（每 tick 统一衰减）
  const keep = p.decay;
  let pherSum = 0;
  for (let i = 0; i < pher.length; i++) { pher[i] *= keep; pherSum += pher[i]; }
  for (const a of ants) {
    if (a.carrying) {
      // 携食：直接朝巢穴方向（归巢不靠信息素），沿途沉积（这是唯一信息素来源→梯度从食物指向巢）
      const dx = wrapDelta(nest.x - a.x), dy = wrapDelta(nest.y - a.y);
      a.heading = Math.atan2(dy, dx);
      a.x = wrapPos(a.x + Math.cos(a.heading)); a.y = wrapPos(a.y + Math.sin(a.heading));
      markVisited(visited, run, a.x, a.y);
      deposit(pher, a.x, a.y, p.deposit * 2);
      if (dx * dx + dy * dy < 2.0) {
        run.food++;
        a.carrying = false;
        a.heading += Math.PI + (rand() - 0.5); // 出巢反向再出发
      }
      continue;
    }
    // 找食：先看是否踩到食物堆
    for (const pile of piles) {
      if (pile.amount <= 0) continue;
      if (dist2(a.x, a.y, pile.x, pile.y) < pile.r * pile.r) {
        pile.amount--;
        a.carrying = true;
        break;
      }
    }
    if (a.carrying) continue;
    // 嗅觉：感知半径内直接朝最近食物堆转向（smell=0 则纯信息素，实验对照用）
    if (p.smell > 0) {
      let bestPile = null, bestD = Infinity;
      for (const pile of piles) {
        if (pile.amount <= 0) continue;
        const d2 = dist2(a.x, a.y, pile.x, pile.y);
        if (d2 < bestD) { bestD = d2; bestPile = pile; }
      }
      if (bestPile && bestD < p.smell * p.smell) {
        a.heading = Math.atan2(wrapDelta(bestPile.y - a.y), wrapDelta(bestPile.x - a.x)) + (rand() - 0.5) * 0.2;
        a.x = wrapPos(a.x + Math.cos(a.heading)); a.y = wrapPos(a.y + Math.sin(a.heading));
        markVisited(visited, run, a.x, a.y);
        continue;
      }
    }
    // 3 探针采样信息素，转向最强方向 + 游走扰动；搜索蚁不沉积——
    // （血泪：搜索蚁也沉积会让「哪里走过哪里香」的自我反馈形成无食物信号的
    //   信息素泥潭，蚁群集体困在噪声里永远发现不了食物；经典模型只让携食蚁留痕）
    // （血泪2：三探针并列时必须取正前——曾因首探针胜出恒左偏 0.6 rad，
    //   空场上全体蚂蚁原地画半径≈1.7 的圈，1500 tick 零发现）
    const base = a.heading;
    const sense = (h) => pher[cellIdx(wrapPos(a.x + Math.cos(h) * p.sensorDist), wrapPos(a.y + Math.sin(h) * p.sensorDist))];
    const vL = sense(base - 0.6), vC = sense(base), vR = sense(base + 0.6);
    let bestH = base; // 并列（含全 0）一律直行
    if (vL > vC && vL >= vR) bestH = base - 0.6;
    else if (vR > vC && vR > vL) bestH = base + 0.6;
    a.heading = bestH + (rand() - 0.5) * 2 * p.wander;
    a.x = wrapPos(a.x + Math.cos(a.heading)); a.y = wrapPos(a.y + Math.sin(a.heading));
    markVisited(visited, run, a.x, a.y);
  }
  run.pheromoneLast = pherSum;
}

function cellIdx(x, y) {
  const cx = Math.min(GRID - 1, Math.max(0, Math.floor((x / WORLD) * GRID)));
  const cy = Math.min(GRID - 1, Math.max(0, Math.floor((y / WORLD) * GRID)));
  return cy * GRID + cx;
}
// 踩格标记（所有蚂蚁都算探索）；信息素沉积是另一回事（仅携食蚁）
function markVisited(visited, run, x, y) {
  const idx = cellIdx(x, y);
  if (!visited[idx]) { visited[idx] = 1; run.covered++; }
}
function deposit(pher, x, y, amount) {
  pher[cellIdx(x, y)] += amount;
}

function antsMetrics(run) {
  return {
    food: run.food,
    carrying: run.ants.reduce((s, a) => s + (a.carrying ? 1 : 0), 0),
    coverage: run.covered / (GRID * GRID),
    pheromone: run.pheromoneLast || 0,
  };
}

// ── 运行器（双端同一入口）───────────────────────────────────────────────────
// 直连入口（面板/测试不经 validateRunArgs）也要参数完备——缺键补默认值。
// 血泪：runBatch('boids', {}, …) 曾静默产出 0 个个体，指标全 0/NaN，把
// 确定性测试骗成假绿（两个空跑当然相等）。
function normalizeParams(scenarioId, params) {
  const sc = SCENARIOS[scenarioId];
  const out = {};
  for (const p of sc.params) {
    const raw = params && typeof params === 'object' && p.key in params ? params[p.key] : p.default;
    if (p.type === 'boolean') out[p.key] = raw === true;
    else out[p.key] = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default;
  }
  // 整数刻度参数取整并保底 ≥1（count/foodPiles/foodPerPile）
  for (const p of sc.params) {
    if (p.type === 'number' && p.step >= 1) out[p.key] = Math.max(1, Math.round(out[p.key]));
  }
  return out;
}

function createRun(scenarioId, rawParams, seed) {
  const sc = SCENARIOS[scenarioId];
  if (!sc) throw new Error(`未知场景: ${scenarioId}`);
  const params = normalizeParams(scenarioId, rawParams);
  const rand = mulberry32(seed >>> 0);
  const state = scenarioId === 'boids' ? initBoids(params, rand) : initAnts(params, rand);
  let tickCount = 0;
  return {
    scenario: scenarioId,
    params,
    seed: seed >>> 0,
    state,
    get tickCount() { return tickCount; },
    tick() {
      if (scenarioId === 'boids') stepBoids(state, params, rand);
      else stepAnts(state, params, rand);
      tickCount++;
    },
    metrics() {
      return scenarioId === 'boids' ? boidsMetrics(state, params) : antsMetrics(state);
    },
  };
}

// 批次实验：跑 ticks、每 sampleEvery 采样，输出采样曲线 + 摘要（first/last/min/max/mean）
function runBatch(scenarioId, params, seed, ticks, sampleEvery) {
  const run = createRun(scenarioId, params, seed);
  const metricKeys = SCENARIOS[scenarioId].metrics.map((m) => m.key);
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
  // 摘要：逐指标 first/last/min/max/mean（采样点口径）
  const summary = {};
  for (const k of metricKeys) {
    const vals = series.map((s) => s[k]);
    summary[k] = {
      first: vals[0],
      last: vals[vals.length - 1],
      min: Math.min(...vals),
      max: Math.max(...vals),
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    };
  }
  return { scenario: scenarioId, params, seed: run.seed, ticks, sampleEvery, series, summary };
}

// 密度快照：把个体数落 cells×cells 网格，输出字符图（AI 可读的空间格局）
function snapshotGrid(scenarioId, params, seed, ticks, cells) {
  const run = createRun(scenarioId, params, seed);
  for (let t = 0; t < ticks; t++) run.tick();
  const c = Math.min(48, Math.max(8, Math.round(cells || 24)));
  const grid = new Array(c * c).fill(0);
  const agents = scenarioId === 'boids' ? run.state.agents : run.state.ants;
  let sx = 0, sy = 0;
  for (const a of agents) {
    sx += a.x; sy += a.y;
    const cx = Math.min(c - 1, Math.floor((a.x / WORLD) * c));
    const cy = Math.min(c - 1, Math.floor((a.y / WORLD) * c));
    grid[cy * c + cx]++;
  }
  const maxCell = Math.max(...grid, 1);
  const chars = ' .:-=+*#%@'; // 10 级密度
  const rows = [];
  for (let r = 0; r < c; r++) {
    rows.push(grid.slice(r * c, r * c + c).map((v) => chars[Math.min(9, Math.floor((v / maxCell) * 9.99))]).join(''));
  }
  // 散布半径：个体到质心的平均环面距离
  const cxm = sx / agents.length, cym = sy / agents.length;
  let spread = 0;
  for (const a of agents) spread += Math.hypot(wrapDelta(a.x - cxm), wrapDelta(a.y - cym));
  return {
    scenario: scenarioId, seed: run.seed, ticks, cells: c,
    rows, centroid: { x: cxm, y: cym },
    spread: spread / agents.length,
    maxCell,
  };
}

module.exports = {
  WORLD, GRID, SCENARIOS,
  mulberry32, wrapDelta, dist2, wrapPos,
  validateParams, validateRunArgs, costGuard, normalizeParams,
  createRun, runBatch, snapshotGrid,
};
