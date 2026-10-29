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

// shared/canvas-core.js
var require_canvas_core = __commonJS({
  "shared/canvas-core.js"(exports, module) {
    "use strict";
    var LIMITS = {
      MAX_BOARDS: 50,
      MAX_NODES: 500,
      MAX_EDGES: 1e3,
      MAX_TITLE: 120,
      MAX_TEXT: 2e3,
      MAX_LABEL: 80,
      MAX_OPS: 200,
      GRID: 40,
      COORD_LIMIT: 1e5,
      MIN_W: 80,
      MIN_H: 40,
      MAX_W: 2e3,
      MAX_H: 4e3,
      DEFAULT_W: { note: 220, card: 260, group: 480 },
      DEFAULT_H: { note: 96, card: 140, group: 320 }
    };
    var NODE_TYPES = ["note", "card", "group"];
    var COLORS = ["default", "blue", "green", "amber", "rose", "violet"];
    var LAYOUT_DIRECTIONS = ["radial", "LR", "TB"];
    var OPS = [
      "add_note",
      "add_card",
      "add_group",
      "add_edge",
      "update_node",
      "move_node",
      "delete_node",
      "delete_edge",
      "set_title",
      "relayout"
    ];
    var K = {
      INDEX: "xt.boards",
      BOARD_PREFIX: "xt.board.",
      PREFIX: "xt.",
      board: (id) => `xt.board.${id}`
    };
    function newId(prefix) {
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    function snap(v) {
      return Math.round(Number(v) / LIMITS.GRID) * LIMITS.GRID;
    }
    function clampNum(v, min, max) {
      return Math.min(max, Math.max(min, Number(v)));
    }
    function validId(id) {
      return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
    }
    function validStr(s, max) {
      return typeof s === "string" && s.length <= max;
    }
    function validXY(v) {
      return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LIMITS.COORD_LIMIT;
    }
    function deepClone(x) {
      return JSON.parse(JSON.stringify(x));
    }
    function nodeLabel(node) {
      if (!node) return "?";
      const head = node.title && String(node.title).trim() || String(node.text || "").split("\n")[0].trim();
      return head ? head.slice(0, 40) : node.id;
    }
    function newBoard(title, now) {
      const t = title === void 0 || title === null || String(title).trim() === "" ? "\u672A\u547D\u540D\u753B\u5E03" : String(title).trim();
      if (t.length > LIMITS.MAX_TITLE) return { error: `\u6807\u9898\u8D85\u957F\uFF08\u4E0A\u9650 ${LIMITS.MAX_TITLE} \u5B57\uFF09` };
      const ts = now || Date.now();
      return {
        id: newId("xt"),
        doc: { rev: 1, title: t, createdAt: ts, updatedAt: ts, nodes: [], edges: [] }
      };
    }
    function sanitizeDoc(raw) {
      if (!raw || typeof raw !== "object") return null;
      const doc = {
        rev: Number.isFinite(Number(raw.rev)) ? Math.max(0, Math.floor(Number(raw.rev))) : 0,
        title: validStr(raw.title, LIMITS.MAX_TITLE) ? raw.title : "\u672A\u547D\u540D\u753B\u5E03",
        createdAt: Number(raw.createdAt) || 0,
        updatedAt: Number(raw.updatedAt) || 0,
        nodes: [],
        edges: []
      };
      const seen = /* @__PURE__ */ new Set();
      if (Array.isArray(raw.nodes)) {
        for (const n of raw.nodes) {
          if (!n || typeof n !== "object" || !validId(n.id) || seen.has(n.id)) continue;
          if (!NODE_TYPES.includes(n.type)) continue;
          if (!validXY(n.x) || !validXY(n.y)) continue;
          seen.add(n.id);
          doc.nodes.push({
            id: n.id,
            type: n.type,
            x: snap(n.x),
            y: snap(n.y),
            w: clampNum(n.w || LIMITS.DEFAULT_W[n.type], LIMITS.MIN_W, LIMITS.MAX_W),
            h: clampNum(n.h || LIMITS.DEFAULT_H[n.type], LIMITS.MIN_H, LIMITS.MAX_H),
            title: validStr(n.title, LIMITS.MAX_TITLE) ? n.title : "",
            text: validStr(n.text, LIMITS.MAX_TEXT) ? n.text : "",
            color: COLORS.includes(n.color) ? n.color : "default",
            z: Number.isFinite(Number(n.z)) ? Number(n.z) : n.type === "group" ? -1 : 0
          });
        }
      }
      const nodeIds = new Set(doc.nodes.map((n) => n.id));
      const edgeSeen = /* @__PURE__ */ new Set();
      if (Array.isArray(raw.edges)) {
        for (const e of raw.edges) {
          if (!e || typeof e !== "object" || !validId(e.id) || edgeSeen.has(e.id)) continue;
          if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) continue;
          const pairKey = `${e.from}->${e.to}`;
          if (edgeSeen.has(pairKey)) continue;
          edgeSeen.add(e.id);
          edgeSeen.add(pairKey);
          doc.edges.push({
            id: e.id,
            from: e.from,
            to: e.to,
            label: validStr(e.label, LIMITS.MAX_LABEL) ? e.label : ""
          });
        }
      }
      return doc;
    }
    function normalizeNewNode(opType, args, doc) {
      const type = opType === "add_note" ? "note" : opType === "add_card" ? "card" : "group";
      const a = args && typeof args === "object" ? args : {};
      let id = a.id;
      if (id === void 0 || id === null || id === "") id = newId("n");
      if (!validId(id)) return { error: `\u8282\u70B9 id \u975E\u6CD5\uFF08\u53EA\u5141\u8BB8\u5B57\u6BCD\u6570\u5B57_-\uFF0C\u226464 \u4F4D\uFF09\uFF1A${JSON.stringify(id)}` };
      if (doc.nodes.some((n) => n.id === id)) return { error: `\u8282\u70B9 id \u5DF2\u5B58\u5728\uFF1A${id}` };
      if (!validXY(a.x) || !validXY(a.y)) {
        return { error: `${type} \u8282\u70B9\u9700\u8981\u6709\u9650\u5750\u6807 x/y\uFF08|\u503C| \u2264 ${LIMITS.COORD_LIMIT}\uFF09\uFF0C\u6536\u5230 x=${JSON.stringify(a.x)} y=${JSON.stringify(a.y)}` };
      }
      if (a.title !== void 0 && !validStr(a.title, LIMITS.MAX_TITLE)) return { error: `title \u8D85\u957F\uFF08\u4E0A\u9650 ${LIMITS.MAX_TITLE} \u5B57\uFF09` };
      if (a.text !== void 0 && !validStr(a.text, LIMITS.MAX_TEXT)) return { error: `text \u8D85\u957F\uFF08\u4E0A\u9650 ${LIMITS.MAX_TEXT} \u5B57\uFF09` };
      if (a.color !== void 0 && !COLORS.includes(a.color)) return { error: `color \u5FC5\u987B\u662F ${COLORS.join("/")} \u4E4B\u4E00` };
      return {
        node: {
          id,
          type,
          x: snap(a.x),
          y: snap(a.y),
          w: a.w === void 0 ? LIMITS.DEFAULT_W[type] : clampNum(a.w, LIMITS.MIN_W, LIMITS.MAX_W),
          h: a.h === void 0 ? LIMITS.DEFAULT_H[type] : clampNum(a.h, LIMITS.MIN_H, LIMITS.MAX_H),
          title: typeof a.title === "string" ? a.title : "",
          text: typeof a.text === "string" ? a.text : "",
          color: a.color === void 0 ? "default" : a.color,
          z: type === "group" ? -1 : 0
        }
      };
    }
    function normalizeNewEdge(args, doc) {
      const a = args && typeof args === "object" ? args : {};
      let id = a.id;
      if (id === void 0 || id === null || id === "") id = newId("e");
      if (!validId(id)) return { error: `\u8FB9 id \u975E\u6CD5\uFF1A${JSON.stringify(id)}` };
      if (doc.edges.some((e) => e.id === id)) return { error: `\u8FB9 id \u5DF2\u5B58\u5728\uFF1A${id}` };
      if (!validId(a.from) || !validId(a.to)) return { error: "add_edge \u9700\u8981 from/to \u4E24\u4E2A\u8282\u70B9 id" };
      if (a.from === a.to) return { error: `\u4E0D\u5141\u8BB8\u81EA\u73AF\uFF08from=to=${a.from}\uFF09` };
      if (!doc.nodes.some((n) => n.id === a.from)) return { error: `from \u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${a.from}\uFF08\u540C\u4E00\u6279 op \u91CC\u5148 add \u518D\u8FDE\u8FB9\u5373\u53EF\uFF09` };
      if (!doc.nodes.some((n) => n.id === a.to)) return { error: `to \u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${a.to}` };
      if (doc.edges.some((e) => e.from === a.from && e.to === a.to)) {
        return { error: `\u91CD\u590D\u8FB9\uFF1A${a.from} \u2192 ${a.to} \u5DF2\u5B58\u5728` };
      }
      if (a.label !== void 0 && !validStr(a.label, LIMITS.MAX_LABEL)) return { error: `label \u8D85\u957F\uFF08\u4E0A\u9650 ${LIMITS.MAX_LABEL} \u5B57\uFF09` };
      return { edge: { id, from: a.from, to: a.to, label: typeof a.label === "string" ? a.label : "" } };
    }
    function findNode(doc, id) {
      return doc.nodes.find((n) => n.id === id) || null;
    }
    function applyOne(doc, op) {
      if (!op || typeof op !== "object" || !OPS.includes(op.op)) {
        return { error: `\u672A\u77E5 op\uFF1A${JSON.stringify(op && op.op)}\uFF08\u53EF\u7528\uFF1A${OPS.join("/")}\uFF09` };
      }
      const a = op.args && typeof op.args === "object" ? op.args : {};
      switch (op.op) {
        case "add_note":
        case "add_card":
        case "add_group": {
          if (doc.nodes.length >= LIMITS.MAX_NODES) return { error: `\u8282\u70B9\u6570\u5DF2\u8FBE\u4E0A\u9650 ${LIMITS.MAX_NODES}` };
          const r = normalizeNewNode(op.op, a, doc);
          if (r.error) return r;
          doc.nodes.push(r.node);
          return null;
        }
        case "add_edge": {
          if (doc.edges.length >= LIMITS.MAX_EDGES) return { error: `\u8FB9\u6570\u5DF2\u8FBE\u4E0A\u9650 ${LIMITS.MAX_EDGES}` };
          const r = normalizeNewEdge(a, doc);
          if (r.error) return r;
          doc.edges.push(r.edge);
          return null;
        }
        case "update_node": {
          const n = findNode(doc, a.id);
          if (!n) return { error: `\u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${a.id}` };
          const patch = a.patch && typeof a.patch === "object" ? a.patch : {};
          const keys = Object.keys(patch);
          if (!keys.length) return { error: "update_node \u9700\u8981 patch\uFF08title/text/color\uFF09" };
          for (const k of keys) {
            if (k === "title") {
              if (!validStr(patch.title, LIMITS.MAX_TITLE)) return { error: "title \u975E\u6CD5\u6216\u8D85\u957F" };
              n.title = patch.title;
            } else if (k === "text") {
              if (!validStr(patch.text, LIMITS.MAX_TEXT)) return { error: "text \u975E\u6CD5\u6216\u8D85\u957F" };
              n.text = patch.text;
            } else if (k === "color") {
              if (!COLORS.includes(patch.color)) return { error: `color \u5FC5\u987B\u662F ${COLORS.join("/")} \u4E4B\u4E00` };
              n.color = patch.color;
            } else {
              return { error: `update_node \u4E0D\u652F\u6301\u5B57\u6BB5 ${k}\uFF08\u7C7B\u578B/\u5750\u6807\u8BF7\u7528 move_node \u6216\u91CD\u5EFA\u8282\u70B9\uFF09` };
            }
          }
          return null;
        }
        case "move_node": {
          const n = findNode(doc, a.id);
          if (!n) return { error: `\u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${a.id}` };
          if (!validXY(a.x) || !validXY(a.y)) return { error: `move_node \u9700\u8981\u6709\u9650\u5750\u6807 x/y\uFF0C\u6536\u5230 x=${JSON.stringify(a.x)} y=${JSON.stringify(a.y)}` };
          n.x = snap(a.x);
          n.y = snap(a.y);
          return null;
        }
        case "delete_node": {
          const n = findNode(doc, a.id);
          if (!n) return { error: `\u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${a.id}` };
          doc.nodes = doc.nodes.filter((x) => x.id !== a.id);
          doc.edges = doc.edges.filter((e) => e.from !== a.id && e.to !== a.id);
          return null;
        }
        case "delete_edge": {
          const e = doc.edges.find((x) => x.id === a.id);
          if (!e) return { error: `\u8FB9\u4E0D\u5B58\u5728\uFF1A${a.id}` };
          doc.edges = doc.edges.filter((x) => x.id !== a.id);
          return null;
        }
        case "set_title": {
          const t = typeof a.title === "string" ? a.title.trim() : "";
          if (!t) return { error: "set_title \u9700\u8981\u975E\u7A7A title" };
          if (t.length > LIMITS.MAX_TITLE) return { error: `\u6807\u9898\u8D85\u957F\uFF08\u4E0A\u9650 ${LIMITS.MAX_TITLE} \u5B57\uFF09` };
          doc.title = t;
          return null;
        }
        case "relayout": {
          const dir = a.direction === void 0 ? "radial" : a.direction;
          if (!LAYOUT_DIRECTIONS.includes(dir)) return { error: `direction \u5FC5\u987B\u662F ${LAYOUT_DIRECTIONS.join("/")} \u4E4B\u4E00` };
          if (a.root !== void 0 && a.root !== null && !findNode(doc, a.root)) return { error: `root \u8282\u70B9\u4E0D\u5B58\u5728\uFF1A${a.root}` };
          const r = computeLayout(doc, dir, a.root || null);
          if (r.error) return r;
          return null;
        }
        default:
          return { error: `\u672A\u77E5 op\uFF1A${op.op}` };
      }
    }
    function applyOps(doc, ops, ctx) {
      if (!doc || typeof doc !== "object" || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
        return { errors: [{ index: -1, op: null, error: "\u677F\u6587\u6863\u5F62\u72B6\u975E\u6CD5\uFF08\u7F3A nodes/edges\uFF09" }] };
      }
      if (!Array.isArray(ops) || ops.length === 0) {
        return { errors: [{ index: -1, op: null, error: "ops \u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4" }] };
      }
      if (ops.length > LIMITS.MAX_OPS) {
        return { errors: [{ index: -1, op: null, error: `\u5355\u6279 op \u6570\u8D85\u9650\uFF08${ops.length} > ${LIMITS.MAX_OPS}\uFF09\uFF0C\u8BF7\u62C6\u6279` }] };
      }
      const next = deepClone(doc);
      next.nodes = next.nodes || [];
      next.edges = next.edges || [];
      const errors = [];
      for (let i = 0; i < ops.length; i++) {
        const e = applyOne(next, ops[i]);
        if (e) {
          errors.push({ index: i, op: ops[i] && ops[i].op, error: e.error });
          break;
        }
      }
      if (errors.length) return { errors, applied: 0 };
      next.rev = (Number(doc.rev) || 0) + 1;
      next.updatedAt = ctx && ctx.now || Date.now();
      return { doc: next, applied: ops.length, errors: [] };
    }
    function computeLayout(doc, direction, rootId) {
      const nodes = doc.nodes;
      if (!nodes.length) return { error: "\u753B\u5E03\u4E3A\u7A7A\uFF0C\u65E0\u4ECE\u5E03\u5C40" };
      const byId = new Map(nodes.map((n) => [n.id, n]));
      if (direction === "radial") {
        const adj = new Map(nodes.map((n) => [n.id, []]));
        for (const e of doc.edges) {
          if (!adj.has(e.from) || !adj.has(e.to)) continue;
          adj.get(e.from).push(e.to);
          adj.get(e.to).push(e.from);
        }
        let root = rootId && byId.has(rootId) ? rootId : null;
        if (!root) {
          let bestDeg = -1;
          for (const n of nodes) {
            const deg = (adj.get(n.id) || []).length;
            if (deg > bestDeg) {
              bestDeg = deg;
              root = n.id;
            }
          }
        }
        const depth = /* @__PURE__ */ new Map([[root, 0]]);
        const queue = [root];
        while (queue.length) {
          const cur = queue.shift();
          for (const nb of adj.get(cur) || []) {
            if (!depth.has(nb)) {
              depth.set(nb, depth.get(cur) + 1);
              queue.push(nb);
            }
          }
        }
        const layers = /* @__PURE__ */ new Map();
        for (const n of nodes) {
          const d2 = depth.get(n.id) === void 0 ? 999 : depth.get(n.id);
          if (!layers.has(d2)) layers.set(d2, []);
          layers.get(d2).push(n);
        }
        const b2 = boundsOf(nodes);
        const cx = Math.round((b2.minX + b2.maxX) / 2);
        const cy = Math.round((b2.minY + b2.maxY) / 2);
        const RING = 340;
        for (const [d2, members] of layers) {
          if (d2 === 0) {
            members[0].x = snap(cx - members[0].w / 2);
            members[0].y = snap(cy - members[0].h / 2);
            continue;
          }
          const radius = RING * Math.min(d2, 6) + (d2 > 6 ? 120 * (d2 - 6) : 0);
          members.forEach((n, i) => {
            const angle = 2 * Math.PI * i / members.length - Math.PI / 2 + d2 * 0.35;
            n.x = snap(cx + Math.cos(angle) * radius - n.w / 2);
            n.y = snap(cy + Math.sin(angle) * radius * 0.72 - n.h / 2);
          });
        }
        return {};
      }
      const out = new Map(nodes.map((n) => [n.id, []]));
      const indeg = new Map(nodes.map((n) => [n.id, 0]));
      for (const e of doc.edges) {
        if (!out.has(e.from) || !out.has(e.to) || e.from === e.to) continue;
        out.get(e.from).push(e.to);
        indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
      }
      const layer = /* @__PURE__ */ new Map();
      let frontier = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
      if (!frontier.length) frontier = [nodes[0].id];
      frontier.forEach((id) => layer.set(id, 0));
      let d = 0;
      let placed = frontier.length;
      while (frontier.length) {
        const next = [];
        for (const id of frontier) {
          for (const nb of out.get(id) || []) {
            if (layer.has(nb)) continue;
            layer.set(nb, d + 1);
            next.push(nb);
          }
        }
        frontier = next;
        if (frontier.length) {
          d += 1;
          placed += frontier.length;
        }
      }
      const maxLayer = d;
      const GAP_MAIN = direction === "LR" ? 360 : 240;
      const GAP_CROSS = direction === "LR" ? 160 : 200;
      const buckets = /* @__PURE__ */ new Map();
      for (const n of nodes) {
        const ld = layer.has(n.id) ? layer.get(n.id) : maxLayer + 1;
        if (!buckets.has(ld)) buckets.set(ld, []);
        buckets.get(ld).push(n);
      }
      const b = boundsOf(nodes);
      const originX = direction === "LR" ? b.minX : Math.round((b.minX + b.maxX) / 2);
      const originY = direction === "LR" ? Math.round((b.minY + b.maxY) / 2) : b.minY;
      for (const [ld, members] of buckets) {
        members.forEach((n, i) => {
          if (direction === "LR") {
            n.x = snap(originX + ld * GAP_MAIN);
            n.y = snap(originY + (i - (members.length - 1) / 2) * GAP_CROSS - n.h / 2);
          } else {
            n.x = snap(originX + (i - (members.length - 1) / 2) * GAP_CROSS - n.w / 2);
            n.y = snap(originY + ld * GAP_MAIN);
          }
        });
      }
      return {};
    }
    function boundsOf(nodes) {
      if (!nodes || !nodes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.w);
        maxY = Math.max(maxY, n.y + n.h);
      }
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
    function bounds(doc) {
      return boundsOf(doc && Array.isArray(doc.nodes) ? doc.nodes : []);
    }
    function exportMarkdown(doc) {
      const d = sanitizeDoc(doc);
      if (!d) return { error: "\u677F\u6587\u6863\u5F62\u72B6\u975E\u6CD5" };
      const lines = [`# ${d.title}`, ""];
      const inGroup = /* @__PURE__ */ new Set();
      const groups = d.nodes.filter((n) => n.type === "group");
      const loose = d.nodes.filter((n) => n.type !== "group");
      const emitNode = (n, indent) => {
        const pad = "  ".repeat(indent);
        const head = nodeLabel(n);
        lines.push(`${pad}- ${head}`);
        const body = String(n.text || "").split("\n").filter((l) => l.trim());
        if (n.title && n.text && body.join("").trim()) {
          for (const l of body) lines.push(`${pad}  ${l.trim()}`);
        }
      };
      let looseEmitted = false;
      for (const g of groups) {
        lines.push(`## \u5206\u7EC4\uFF1A${nodeLabel(g)}`);
        const inner = loose.filter((n) => n.x >= g.x && n.x + n.w <= g.x + g.w && n.y >= g.y && n.y + n.h <= g.y + g.h);
        for (const n of inner) {
          inGroup.add(n.id);
          emitNode(n, 1);
        }
        if (!inner.length) lines.push("  \uFF08\u7A7A\uFF09");
      }
      const rest = loose.filter((n) => !inGroup.has(n.id));
      if (rest.length) {
        if (groups.length) {
          lines.push("");
          lines.push("## \u672A\u5206\u7EC4");
        }
        for (const n of rest) {
          emitNode(n, 0);
          looseEmitted = true;
        }
      }
      if (!groups.length && !looseEmitted && !d.nodes.length) lines.push("\uFF08\u7A7A\u753B\u5E03\uFF09");
      if (d.edges.length) {
        lines.push("");
        lines.push("## \u5173\u8054");
        const byId = new Map(d.nodes.map((n) => [n.id, n]));
        for (const e of d.edges) {
          const f = byId.get(e.from);
          const t = byId.get(e.to);
          if (!f || !t) continue;
          lines.push(`- ${nodeLabel(f)} \u2192 ${nodeLabel(t)}${e.label ? `\uFF08${e.label}\uFF09` : ""}`);
        }
      }
      return { markdown: lines.join("\n") };
    }
    function indexEntryOf(id, doc, now) {
      return {
        id,
        title: doc && doc.title || "\u672A\u547D\u540D\u753B\u5E03",
        updatedAt: doc && doc.updatedAt || now || 0,
        nodeCount: doc && Array.isArray(doc.nodes) ? doc.nodes.length : 0
      };
    }
    function upsertIndex(index, entry) {
      const list = Array.isArray(index) ? index.filter((e) => e && e.id !== entry.id) : [];
      list.push(entry);
      return list;
    }
    function removeIndex(index, id) {
      return (Array.isArray(index) ? index : []).filter((e) => e && e.id !== id);
    }
    module.exports = {
      LIMITS,
      NODE_TYPES,
      COLORS,
      LAYOUT_DIRECTIONS,
      OPS,
      K,
      newId,
      snap,
      clampNum,
      validId,
      nodeLabel,
      newBoard,
      sanitizeDoc,
      applyOps,
      computeLayout,
      bounds,
      boundsOf,
      exportMarkdown,
      indexEntryOf,
      upsertIndex,
      removeIndex
    };
  }
});

// src/Panel.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef as useRef2, useState as useState3 } from "react";

// src/BoardList.tsx
import { useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
var fmtTime = (ts) => ts ? new Date(ts).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
function BoardList(props) {
  const [title, setTitle] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const submit = () => {
    const t = title.trim();
    if (!t) return;
    props.onCreate(t);
    setTitle("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "x-list-root", children: [
    /* @__PURE__ */ jsxs("div", { className: "x-list-head", children: [
      /* @__PURE__ */ jsx("span", { className: "x-list-title", children: "\u5FC3\u56FE\u753B\u5E03" }),
      /* @__PURE__ */ jsx("button", { className: "x-btn", disabled: props.busy, onClick: props.onRefresh, children: "\u5237\u65B0" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "x-newrow", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          className: "x-input",
          placeholder: "\u65B0\u753B\u5E03\u6807\u9898\uFF0C\u5982\u300C\u7F51\u5173\u91CD\u6784\u8111\u66B4\u300D",
          value: title,
          maxLength: 120,
          onChange: (e) => setTitle(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") submit();
          }
        }
      ),
      /* @__PURE__ */ jsx("button", { className: "x-btn x-btn-primary", disabled: props.busy || !title.trim(), onClick: submit, children: "\u65B0\u5EFA" })
    ] }),
    props.boards.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "x-empty", children: [
      /* @__PURE__ */ jsx("p", { children: "\u8FD8\u6CA1\u6709\u753B\u5E03\u3002" }),
      /* @__PURE__ */ jsxs("p", { className: "x-dim", children: [
        "\u4E24\u79CD\u7528\u6CD5\uFF1A",
        /* @__PURE__ */ jsx("br", {}),
        "\u2460 \u5728\u5BF9\u8BDD\u91CC\u8BA9 AI\u300C\u628A\u8FD9\u51E0\u4E2A\u521B\u610F\u753B\u5230\u753B\u5E03\u4E0A\u300D\uFF1B",
        /* @__PURE__ */ jsx("br", {}),
        "\u2461 \u8FD9\u91CC\u65B0\u5EFA\u4E00\u5757\uFF0C\u7136\u540E\u4EB2\u624B\u62D6\u51FA\u6765\u3002"
      ] })
    ] }) : /* @__PURE__ */ jsx("div", { className: "x-items", children: props.boards.map((b) => /* @__PURE__ */ jsxs("div", { className: "x-item", onClick: () => props.onOpen(b.id), children: [
      /* @__PURE__ */ jsxs("div", { className: "x-item-main", children: [
        /* @__PURE__ */ jsx("div", { className: "x-item-title", children: b.title }),
        /* @__PURE__ */ jsxs("div", { className: "x-item-meta", children: [
          "\u8282\u70B9 ",
          b.nodeCount,
          " \xB7 \u66F4\u65B0 ",
          fmtTime(b.updatedAt)
        ] })
      ] }),
      confirmId === b.id ? /* @__PURE__ */ jsxs("div", { className: "x-item-actions", onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "x-btn x-btn-danger",
            disabled: props.busy,
            onClick: () => {
              setConfirmId(null);
              props.onDelete(b.id);
            },
            children: "\u786E\u8BA4\u5220\u9664"
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "x-btn", onClick: () => setConfirmId(null), children: "\u53D6\u6D88" })
      ] }) : /* @__PURE__ */ jsx("div", { className: "x-item-actions", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsx("button", { className: "x-btn", onClick: () => setConfirmId(b.id), children: "\u5220\u9664" }) })
    ] }, b.id)) }),
    /* @__PURE__ */ jsx("style", { children: CSS })
  ] });
}
var CSS = `
.x-list-root { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 10px 12px; gap: 10px; }
.x-list-head { display: flex; align-items: center; justify-content: space-between; }
.x-list-title { font-size: 14px; font-weight: 600; }
.x-newrow { display: flex; gap: 8px; }
.x-input { flex: 1; min-width: 0; background: var(--p-chip, rgba(128,128,128,.1)); color: var(--p-text, #e6edf3);
  border: 1px solid var(--p-border, #2b3444); border-radius: 6px; padding: 5px 10px; font-size: 12px; outline: none; }
.x-input:focus { border-color: var(--p-accent, #4a7dff); }
.x-empty { margin-top: 30px; text-align: center; line-height: 1.9; }
.x-dim { color: var(--p-text-dim, #8b949e); font-size: 12px; }
.x-items { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.x-item { display: flex; align-items: center; gap: 8px; border: 1px solid var(--p-border, #2b3444);
  border-radius: 8px; padding: 8px 10px; cursor: pointer; }
.x-item:hover { border-color: var(--p-accent, #4a7dff); }
.x-item-main { flex: 1; min-width: 0; }
.x-item-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x-item-meta { color: var(--p-text-dim, #8b949e); font-size: 11px; margin-top: 2px; }
.x-item-actions { display: flex; gap: 6px; flex-shrink: 0; }
`;

// src/BoardCanvas.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState as useState2 } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  }
  return invoke;
}

// src/model.ts
var import_canvas_core = __toESM(require_canvas_core());
var xcore = import_canvas_core.default;
async function capDispatch(target, payload) {
  const res = await getHostInvoke()("router_dispatch", { req: { target, payload } });
  if (!res || res.ok !== true) throw new Error(res?.error || `${target} \u8C03\u7528\u5931\u8D25`);
  return res.result ?? {};
}
async function kvGet(key) {
  const r = await capDispatch("cap.kv", { action: "get", key });
  return r.value ?? null;
}
async function kvSet(key, value) {
  await capDispatch("cap.kv", { action: "set", key, value: value === void 0 ? null : value });
}
async function kvDel(key) {
  await capDispatch("cap.kv", { action: "delete", key });
}
async function loadBoard(id) {
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const raw = await kvGet(xcore.K.board(id));
  return raw ? xcore.sanitizeDoc(raw) : null;
}
function upsertEntry(index, id, doc) {
  const rest = (Array.isArray(index) ? index : []).filter((e) => e && e.id !== id);
  rest.push({ id, title: doc.title, updatedAt: doc.updatedAt, nodeCount: doc.nodes.length });
  return rest;
}
async function saveBoard(id, doc) {
  await kvSet(xcore.K.board(id), doc);
  try {
    const index = await kvGet(xcore.K.INDEX) || [];
    await kvSet(xcore.K.INDEX, upsertEntry(index, id, doc));
  } catch {
  }
}
async function deleteBoard(id) {
  await kvDel(xcore.K.board(id));
  try {
    const index = await kvGet(xcore.K.INDEX) || [];
    await kvSet(xcore.K.INDEX, index.filter((e) => e && e.id !== id));
  } catch {
  }
}
async function listBoards() {
  const index = await kvGet(xcore.K.INDEX) || [];
  const result = [];
  let changed = false;
  for (const e of Array.isArray(index) ? index : []) {
    if (!e || typeof e.id !== "string") {
      changed = true;
      continue;
    }
    const doc = await loadBoard(e.id);
    if (doc) {
      result.push({ id: e.id, title: doc.title, updatedAt: doc.updatedAt, nodeCount: doc.nodes.length });
      if (e.nodeCount !== doc.nodes.length || e.title !== doc.title) changed = true;
    } else {
      changed = true;
    }
  }
  if (changed) {
    kvSet(xcore.K.INDEX, result).catch(() => {
    });
  }
  return result;
}
async function createBoard(title) {
  const r = xcore.newBoard(title);
  if ("error" in r && r.error) throw new Error(r.error);
  if (!("id" in r)) throw new Error("\u65B0\u5EFA\u753B\u5E03\u5931\u8D25");
  await kvSet(xcore.K.board(r.id), r.doc);
  try {
    const index = await kvGet(xcore.K.INDEX) || [];
    await kvSet(xcore.K.INDEX, [
      ...index.filter((e) => e && e.id !== r.id),
      { id: r.id, title: r.doc.title, updatedAt: r.doc.updatedAt, nodeCount: 0 }
    ]);
  } catch {
  }
  return r.id;
}

// src/BoardCanvas.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var clampZ = (z) => Math.min(4, Math.max(0.08, z));
var clone = (x) => JSON.parse(JSON.stringify(x));
function BoardCanvas(props) {
  const { boardId, toast } = props;
  const [doc, setDoc] = useState2(null);
  const [missing, setMissing] = useState2(false);
  const [vp, setVp] = useState2({ px: 0, py: 0, z: 1 });
  const [sel, setSel] = useState2(/* @__PURE__ */ new Set());
  const [selEdge, setSelEdge] = useState2(null);
  const [editing, setEditing] = useState2(null);
  const [relayoutOpen, setRelayoutOpen] = useState2(false);
  const [edgeDraft, setEdgeDraft] = useState2(null);
  const wrapRef = useRef(null);
  const docRef = useRef(null);
  const vpRef = useRef(vp);
  const selRef = useRef(sel);
  const editingRef = useRef(editing);
  const dragRef = useRef(null);
  const activePtrs = useRef(/* @__PURE__ */ new Map());
  const preDragDocRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const spaceRef = useRef(false);
  const fitDoneRef = useRef(false);
  vpRef.current = vp;
  selRef.current = sel;
  editingRef.current = editing;
  const toWorld = useCallback((clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (clientX - rect.left - v.px) / v.z, y: (clientY - rect.top - v.py) / v.z };
  }, []);
  useEffect(() => {
    let alive = true;
    fitDoneRef.current = false;
    loadBoard(boardId).then((d) => {
      if (!alive) return;
      docRef.current = d;
      setDoc(d);
      setMissing(!d);
    }).catch((e) => {
      if (alive) {
        setMissing(true);
        toast(`\u52A0\u8F7D\u753B\u5E03\u5931\u8D25\uFF1A${e.message}`, true);
      }
    });
    return () => {
      alive = false;
    };
  }, [boardId, toast]);
  const pollOnce = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    if (dragRef.current || editingRef.current) return;
    try {
      const remote = await loadBoard(boardId);
      if (!remote || !docRef.current) return;
      if (remote.rev > docRef.current.rev) {
        docRef.current = remote;
        setDoc(remote);
        undoRef.current = [];
        redoRef.current = [];
        toast("\u753B\u5E03\u5DF2\u5728\u5176\u4ED6\u7AEF\u66F4\u65B0\uFF0C\u5DF2\u5237\u65B0");
      }
    } catch {
    }
  }, [boardId, toast]);
  useEffect(() => {
    const timer = setInterval(() => {
      void pollOnce();
    }, 5e3);
    const onVis = () => {
      if (document.visibilityState === "visible") void pollOnce();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [pollOnce]);
  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const d = docRef.current;
    const b = d && d.nodes.length ? xcore.bounds(d) : { minX: 0, minY: 0, width: 0, height: 0 };
    const pad = 120;
    const z = b.width || b.height ? clampZ(Math.min((rect.width - pad) / b.width, (rect.height - pad) / b.height, 1.5)) : 1;
    setVp({
      px: (rect.width - b.width * z) / 2 - b.minX * z,
      py: (rect.height - b.height * z) / 2 - b.minY * z,
      z
    });
  }, []);
  const zoomAt = useCallback((factor, cx, cy) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const v = vpRef.current;
    const mx = cx === void 0 ? rect.width / 2 : cx - rect.left;
    const my = cy === void 0 ? rect.height / 2 : cy - rect.top;
    const z2 = clampZ(v.z * factor);
    setVp({ z: z2, px: mx - (mx - v.px) / v.z * z2, py: my - (my - v.py) / v.z * z2 });
  }, []);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 16e-4), e.clientX, e.clientY);
      } else {
        const v = vpRef.current;
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setVp({ ...v, px: v.px - dx, py: v.py - dy });
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoomAt]);
  useEffect(() => {
    if (doc && !fitDoneRef.current && doc.nodes.length) {
      fitDoneRef.current = true;
      fit();
    }
  }, [doc, fit]);
  const commit = useCallback((ops, opts) => {
    const cur = docRef.current;
    if (!cur) return false;
    const r = xcore.applyOps(cur, ops);
    if (!("doc" in r)) {
      toast(r.errors[0]?.error || "\u64CD\u4F5C\u88AB\u62D2\u7EDD", true);
      return false;
    }
    if (opts?.undoable !== false) {
      undoRef.current.push(clone(cur));
      if (undoRef.current.length > 50) undoRef.current.shift();
      redoRef.current = [];
    }
    docRef.current = r.doc;
    setDoc(r.doc);
    saveBoard(boardId, r.doc).catch((e) => {
      docRef.current = cur;
      setDoc(cur);
      toast(`\u4FDD\u5B58\u5931\u8D25\u5DF2\u56DE\u6EDA\uFF1A${e.message}`, true);
    });
    return true;
  }, [boardId, toast]);
  const pushUndo = useCallback(() => {
    const cur = docRef.current;
    if (!cur) return;
    undoRef.current.push(clone(cur));
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }, []);
  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    const cur = docRef.current;
    if (!prev || !cur) return;
    redoRef.current.push(clone(cur));
    docRef.current = prev;
    setDoc(prev);
    setSel(/* @__PURE__ */ new Set());
    setSelEdge(null);
    saveBoard(boardId, prev).catch((e) => toast(`\u64A4\u9500\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true));
  }, [boardId, toast]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    const cur = docRef.current;
    if (!next || !cur) return;
    undoRef.current.push(clone(cur));
    docRef.current = next;
    setDoc(next);
    setSel(/* @__PURE__ */ new Set());
    setSelEdge(null);
    saveBoard(boardId, next).catch((e) => toast(`\u91CD\u505A\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`, true));
  }, [boardId, toast]);
  const nodeById = useCallback((id) => docRef.current?.nodes.find((n) => n.id === id) || null, []);
  const onWrapPointerDownCapture = useCallback((e) => {
    activePtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = dragRef.current;
    if (!st || st.kind === "edge" || st.kind === "pinch") return;
    if (activePtrs.current.size < 2) return;
    const pts = [...activePtrs.current.values()];
    const d0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    if (st.kind === "node") {
      const cur = docRef.current;
      if (cur) {
        const restored = { ...cur, nodes: cur.nodes.map((n) => {
          const o = st.origins.get(n.id);
          return o ? { ...n, x: o.x, y: o.y } : n;
        }) };
        docRef.current = restored;
        setDoc(restored);
      }
    }
    dragRef.current = { kind: "pinch", d0, mid0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, px0: vpRef.current.px, py0: vpRef.current.py, z0: vpRef.current.z };
  }, []);
  const onWrapPointerDown = useCallback((e) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains("x-world")) return;
    wrapRef.current?.focus();
    if (dragRef.current) return;
    if (e.button === 0 && !spaceRef.current && (selRef.current.size || selEdge)) {
      setSel(/* @__PURE__ */ new Set());
      setSelEdge(null);
    }
    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, px0: vpRef.current.px, py0: vpRef.current.py };
    try {
      wrapRef.current?.setPointerCapture(e.pointerId);
    } catch {
    }
    e.preventDefault();
  }, [selEdge]);
  const onWrapPointerMove = useCallback((e) => {
    const st = dragRef.current;
    if (!st) return;
    if (st.kind === "pinch") {
      activePtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePtrs.current.size < 2) return;
      const pts = [...activePtrs.current.values()].slice(0, 2);
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const rect = wrapRef.current.getBoundingClientRect();
      const worldMid = { x: (st.mid0.x - rect.left - st.px0) / st.z0, y: (st.mid0.y - rect.top - st.py0) / st.z0 };
      const z2 = clampZ(st.z0 * (d / st.d0));
      setVp({ z: z2, px: mid.x - rect.left - worldMid.x * z2, py: mid.y - rect.top - worldMid.y * z2 });
      return;
    }
    if (st.kind === "pan") {
      setVp((v) => ({ ...v, px: st.px0 + (e.clientX - st.sx), py: st.py0 + (e.clientY - st.sy) }));
    } else if (st.kind === "node") {
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - st.swx;
      const dy = w.y - st.swy;
      const cur = docRef.current;
      if (!cur) return;
      const moved = new Map(cur.nodes.map((n) => {
        const o = st.origins.get(n.id);
        return [n.id, o ? { ...n, x: o.x + dx, y: o.y + dy } : n];
      }));
      const next = { ...cur, nodes: cur.nodes.map((n) => moved.get(n.id) || n) };
      docRef.current = next;
      setDoc(next);
    } else if (st.kind === "edge") {
      const w = toWorld(e.clientX, e.clientY);
      const src = nodeById(st.from);
      if (src) setEdgeDraft({ x1: src.x + src.w / 2, y1: src.y + src.h / 2, x2: w.x, y2: w.y });
    }
  }, [nodeById, toWorld]);
  const onWrapPointerUp = useCallback((e) => {
    const st = dragRef.current;
    activePtrs.current.delete(e.pointerId);
    if (!st) return;
    if (st.kind === "node") {
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - st.swx;
      const dy = w.y - st.swy;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        const ops = [];
        for (const [id, o] of st.origins) {
          ops.push({ op: "move_node", args: { id, x: o.x + dx, y: o.y + dy } });
        }
        const cur = docRef.current;
        if (cur) {
          const r = xcore.applyOps(cur, ops);
          if ("doc" in r) {
            if (preDragDocRef.current) {
              undoRef.current.push(preDragDocRef.current);
              if (undoRef.current.length > 50) undoRef.current.shift();
              redoRef.current = [];
              preDragDocRef.current = null;
            }
            docRef.current = r.doc;
            setDoc(r.doc);
            saveBoard(boardId, r.doc).catch((er) => {
              docRef.current = cur;
              setDoc(cur);
              toast(`\u4FDD\u5B58\u5931\u8D25\u5DF2\u56DE\u6EDA\uFF1A${er.message}`, true);
            });
          }
        }
      }
    } else if (st.kind === "edge") {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest("[data-node-id]")?.getAttribute("data-node-id");
      if (target && target !== st.from) {
        commit([{ op: "add_edge", args: { from: st.from, to: target } }]);
      }
      setEdgeDraft(null);
    }
    if (dragRef.current === st) {
      if (st.kind === "pinch" && activePtrs.current.size >= 2) return;
      dragRef.current = null;
    }
  }, [boardId, commit, toWorld, toast]);
  const onNodePointerDown = useCallback((e, node) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    wrapRef.current?.focus();
    if (editingRef.current) return;
    const multi = e.shiftKey || e.ctrlKey || e.metaKey;
    let next = new Set(selRef.current);
    if (!next.has(node.id)) next = multi ? /* @__PURE__ */ new Set([...next, node.id]) : /* @__PURE__ */ new Set([node.id]);
    else if (multi) {
      next.delete(node.id);
      setSel(next);
      selRef.current = next;
      return;
    }
    setSel(next);
    selRef.current = next;
    setSelEdge(null);
    const origins = /* @__PURE__ */ new Map();
    for (const id of next) {
      const n = nodeById(id);
      if (n && n.type !== "group") origins.set(id, { x: n.x, y: n.y });
      else if (n) origins.set(id, { x: n.x, y: n.y });
    }
    const w = toWorld(e.clientX, e.clientY);
    preDragDocRef.current = clone(docRef.current);
    dragRef.current = { kind: "node", swx: w.x, swy: w.y, origins };
    try {
      wrapRef.current?.setPointerCapture(e.pointerId);
    } catch {
    }
  }, [nodeById, toWorld]);
  const onEdgeHandleDown = useCallback((e, node) => {
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = { kind: "edge", from: node.id };
    setEdgeDraft({ x1: node.x + node.w / 2, y1: node.y + node.h / 2, x2: w.x, y2: w.y });
    try {
      wrapRef.current?.setPointerCapture(e.pointerId);
    } catch {
    }
  }, [toWorld]);
  const onKeyDown = useCallback((e) => {
    const target = e.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
    if (e.key === " ") {
      spaceRef.current = true;
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      const ops = [];
      for (const id of selRef.current) ops.push({ op: "delete_node", args: { id } });
      if (selEdge) ops.push({ op: "delete_edge", args: { id: selEdge } });
      if (ops.length) {
        e.preventDefault();
        commit(ops);
      }
      return;
    }
    if (e.key === "Escape") {
      setSel(/* @__PURE__ */ new Set());
      setSelEdge(null);
      setEditing(null);
      setEdgeDraft(null);
      dragRef.current = null;
    }
  }, [commit, redo, selEdge, undo]);
  const onKeyUp = useCallback((e) => {
    if (e.key === " ") spaceRef.current = false;
  }, []);
  const onEditCommit = useCallback((id, patch) => {
    setEditing(null);
    const n = nodeById(id);
    if (!n) return;
    const clean = {};
    if (patch.title !== void 0 && patch.title !== n.title) clean.title = patch.title;
    if (patch.text !== void 0 && patch.text !== n.text) clean.text = patch.text;
    if (Object.keys(clean).length) commit([{ op: "update_node", args: { id, patch: clean } }]);
  }, [commit, nodeById]);
  const setColor = useCallback((color) => {
    const ids = [...selRef.current];
    if (!ids.length) return;
    commit(ids.map((id) => ({ op: "update_node", args: { id, patch: { color } } })));
  }, [commit]);
  const groupSelected = useCallback(() => {
    const cur = docRef.current;
    const ids = [...selRef.current];
    if (!cur || ids.length < 2) return;
    const members = cur.nodes.filter((n) => ids.includes(n.id));
    const b = xcore.bounds({ ...cur, nodes: members });
    const pad = 40;
    commit([{ op: "add_group", args: { x: b.minX - pad, y: b.minY - pad, w: b.width + pad * 2, h: b.height + pad * 2, title: "\u5206\u7EC4" } }]);
  }, [commit]);
  const deleteSelection = useCallback(() => {
    const ops = [...selRef.current].map((id) => ({ op: "delete_node", args: { id } }));
    if (selEdge) ops.push({ op: "delete_edge", args: { id: selEdge } });
    if (ops.length) commit(ops);
    setSel(/* @__PURE__ */ new Set());
    setSelEdge(null);
  }, [commit, selEdge]);
  const relayout = useCallback((direction) => {
    setRelayoutOpen(false);
    commit([{ op: "relayout", args: { direction } }]);
  }, [commit]);
  const sendOutline = useCallback(async () => {
    const cur = docRef.current;
    if (!cur || !props.onSendToChat) return;
    const r = xcore.exportMarkdown(cur);
    if ("error" in r && r.error) {
      toast(r.error, true);
      return;
    }
    if ("markdown" in r) {
      await props.onSendToChat(`\u3010\u5FC3\u56FE\u753B\u5E03\u300A${cur.title}\u300B\u5927\u7EB2\u3011
${r.markdown}`);
      toast("\u5927\u7EB2\u5DF2\u53D1\u5230\u5BF9\u8BDD");
    }
  }, [props, toast]);
  const nodes = doc?.nodes || [];
  const edges = doc?.edges || [];
  const selArr = useMemo(() => [...sel], [sel]);
  if (missing) {
    return /* @__PURE__ */ jsxs2("div", { className: "x-root x-missing", children: [
      /* @__PURE__ */ jsx2("style", { children: CANVAS_CSS }),
      /* @__PURE__ */ jsx2("p", { children: "\u753B\u5E03\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664\u3002" }),
      /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: props.onBack, children: "\u8FD4\u56DE\u5217\u8868" })
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { className: "x-root x-croot", children: [
    /* @__PURE__ */ jsx2("style", { children: CANVAS_CSS }),
    /* @__PURE__ */ jsxs2("div", { className: "x-canvas-head", children: [
      /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: props.onBack, children: "\u2039 \u5217\u8868" }),
      /* @__PURE__ */ jsx2("span", { className: "x-canvas-title", children: doc?.title || props.title || "\u2026" }),
      /* @__PURE__ */ jsxs2("span", { className: "x-canvas-rev", children: [
        "rev ",
        doc?.rev ?? "-",
        " \xB7 ",
        nodes.length,
        " \u8282\u70B9 / ",
        edges.length,
        " \u8FB9"
      ] })
    ] }),
    /* @__PURE__ */ jsxs2(
      "div",
      {
        ref: wrapRef,
        className: "x-canvas-wrap",
        tabIndex: 0,
        "data-testid": "xintu-canvas",
        style: {
          backgroundPosition: `${vp.px}px ${vp.py}px`,
          backgroundSize: `${40 * vp.z}px ${40 * vp.z}px`
        },
        onPointerDown: onWrapPointerDown,
        onPointerDownCapture: onWrapPointerDownCapture,
        onPointerMove: onWrapPointerMove,
        onPointerUp: onWrapPointerUp,
        onPointerCancel: onWrapPointerUp,
        onKeyDown,
        onKeyUp,
        onContextMenu: (e) => e.preventDefault(),
        children: [
          /* @__PURE__ */ jsxs2("div", { className: "x-world", style: { transform: `translate(${vp.px}px, ${vp.py}px) scale(${vp.z})` }, children: [
            /* @__PURE__ */ jsxs2("svg", { className: "x-edge-layer", width: 1, height: 1, style: { position: "absolute", left: 0, top: 0, overflow: "visible" }, children: [
              /* @__PURE__ */ jsxs2("defs", { children: [
                /* @__PURE__ */ jsx2("marker", { id: "x-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse", children: /* @__PURE__ */ jsx2("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "var(--p-text-dim, #8b949e)" }) }),
                /* @__PURE__ */ jsx2("marker", { id: "x-arrow-hot", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse", children: /* @__PURE__ */ jsx2("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "var(--p-accent, #4a7dff)" }) })
              ] }),
              edges.map((e) => /* @__PURE__ */ jsx2(
                EdgeView,
                {
                  edge: e,
                  from: nodeById(e.from),
                  to: nodeById(e.to),
                  hot: selEdge === e.id,
                  onPick: () => {
                    setSelEdge(e.id);
                    setSel(/* @__PURE__ */ new Set());
                  }
                },
                e.id
              )),
              edgeDraft && /* @__PURE__ */ jsx2(
                "line",
                {
                  x1: edgeDraft.x1,
                  y1: edgeDraft.y1,
                  x2: edgeDraft.x2,
                  y2: edgeDraft.y2,
                  stroke: "var(--p-accent, #4a7dff)",
                  strokeWidth: 2,
                  strokeDasharray: "6 4"
                }
              )
            ] }),
            nodes.map((n) => /* @__PURE__ */ jsx2(
              NodeView,
              {
                node: n,
                selected: sel.has(n.id),
                editing: editing === n.id,
                onPointerDown: onNodePointerDown,
                onEdgeHandleDown,
                onDoubleClick: (id) => {
                  setEditing(id);
                },
                onEditCommit,
                onEditCancel: () => setEditing(null)
              },
              n.id
            ))
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "x-toolbar", children: [
            /* @__PURE__ */ jsx2("button", { className: "x-btn", title: "\u64A4\u9500 (Ctrl+Z)", onClick: undo, children: "\u21A9" }),
            /* @__PURE__ */ jsx2("button", { className: "x-btn", title: "\u91CD\u505A (Ctrl+Shift+Z)", onClick: redo, children: "\u21AA" }),
            /* @__PURE__ */ jsx2("span", { className: "x-toolbar-sep" }),
            /* @__PURE__ */ jsx2("button", { className: "x-btn", title: "\u7F29\u5C0F", onClick: () => zoomAt(1 / 1.25), children: "\u2212" }),
            /* @__PURE__ */ jsxs2("span", { className: "x-zoom", children: [
              Math.round(vp.z * 100),
              "%"
            ] }),
            /* @__PURE__ */ jsx2("button", { className: "x-btn", title: "\u653E\u5927", onClick: () => zoomAt(1.25), children: "\uFF0B" }),
            /* @__PURE__ */ jsx2("button", { className: "x-btn", title: "\u9002\u5E94\u5185\u5BB9", onClick: fit, children: "\u2922 \u9002\u5E94" }),
            /* @__PURE__ */ jsx2("span", { className: "x-toolbar-sep" }),
            /* @__PURE__ */ jsxs2("div", { className: "x-relayout-wrap", children: [
              /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: () => setRelayoutOpen((o) => !o), children: "\u2317 \u91CD\u6392" }),
              relayoutOpen && /* @__PURE__ */ jsxs2("div", { className: "x-relayout-menu", children: [
                /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: () => relayout("radial"), children: "radial \u73AF\u5F62\uFF08\u8111\u66B4\uFF09" }),
                /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: () => relayout("LR"), children: "LR \u6A2A\u5411\u5206\u5C42\uFF08\u6D41\u7A0B\uFF09" }),
                /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: () => relayout("TB"), children: "TB \u7EB5\u5411\u5206\u5C42\uFF08\u5C42\u7EA7\uFF09" })
              ] })
            ] }),
            props.onSendToChat && /* @__PURE__ */ jsx2("button", { className: "x-btn", title: "\u5BFC\u51FA\u5927\u7EB2\u5E76\u53D1\u5230\u5BF9\u8BDD", onClick: () => void sendOutline(), children: "\u53D1\u5230\u5BF9\u8BDD" })
          ] }),
          (selArr.length > 0 || selEdge) && /* @__PURE__ */ jsxs2("div", { className: "x-selbar", children: [
            selArr.length > 0 && /* @__PURE__ */ jsxs2(Fragment, { children: [
              /* @__PURE__ */ jsxs2("span", { className: "x-selbar-label", children: [
                selArr.length,
                " \u4E2A\u8282\u70B9"
              ] }),
              xcore.COLORS.map((c) => /* @__PURE__ */ jsx2(
                "button",
                {
                  className: `x-swatch x-swatch-${c}`,
                  title: c,
                  onClick: () => setColor(c)
                },
                c
              )),
              selArr.length >= 2 && /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: groupSelected, children: "\u6210\u7EC4" }),
              /* @__PURE__ */ jsx2("button", { className: "x-btn x-btn-danger", onClick: deleteSelection, children: "\u5220\u9664" })
            ] }),
            !selArr.length && selEdge && /* @__PURE__ */ jsxs2(Fragment, { children: [
              /* @__PURE__ */ jsx2("span", { className: "x-selbar-label", children: "\u5DF2\u9009\u8FDE\u7EBF" }),
              /* @__PURE__ */ jsx2("button", { className: "x-btn x-btn-danger", onClick: deleteSelection, children: "\u5220\u8FDE\u7EBF" })
            ] })
          ] })
        ]
      }
    )
  ] });
}
var EdgeView = memo(function EdgeView2(props) {
  const { edge, from, to, hot } = props;
  if (!from || !to) return null;
  const ac = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const bc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const horizontal = Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y);
  const s = horizontal ? { x: ac.x < bc.x ? from.x + from.w : from.x, y: ac.y } : { x: ac.x, y: ac.y < bc.y ? from.y + from.h : from.y };
  const t = horizontal ? { x: ac.x < bc.x ? to.x : to.x + to.w, y: bc.y } : { x: bc.x, y: ac.y < bc.y ? to.y : to.y + to.h };
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const d = horizontal ? `M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}` : `M ${s.x} ${s.y} C ${s.x} ${my}, ${t.x} ${my}, ${t.x} ${t.y}`;
  return /* @__PURE__ */ jsxs2("g", { className: hot ? "x-edge x-edge-hot" : "x-edge", children: [
    /* @__PURE__ */ jsx2("path", { d, fill: "none", stroke: "transparent", strokeWidth: 14, style: { pointerEvents: "stroke", cursor: "pointer" }, onClick: props.onPick }),
    /* @__PURE__ */ jsx2("path", { d, fill: "none", className: "x-edge-line", markerEnd: hot ? "url(#x-arrow-hot)" : "url(#x-arrow)", pointerEvents: "none" }),
    edge.label && /* @__PURE__ */ jsx2("text", { x: mx, y: my - 6, textAnchor: "middle", className: "x-edge-label", style: { pointerEvents: "none", userSelect: "none" }, children: edge.label })
  ] });
});
var NodeView = memo(function NodeView2(props) {
  const { node, selected, editing } = props;
  const [title, setTitle] = useState2(node.title);
  const [text, setText] = useState2(node.text);
  useEffect(() => {
    if (editing) {
      setTitle(node.title);
      setText(node.text);
    }
  }, [editing, node.title, node.text]);
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      "data-node-id": node.id,
      className: `x-node x-node-${node.type} x-c-${node.color}${selected ? " x-node-sel" : ""}${editing ? " x-node-editing" : ""}`,
      style: { left: node.x, top: node.y, width: node.w, height: node.h, zIndex: node.type === "group" ? 0 : 1 },
      onPointerDown: (e) => props.onPointerDown(e, node),
      onDoubleClick: (e) => {
        e.stopPropagation();
        props.onDoubleClick(node.id);
      },
      children: [
        node.type === "group" && /* @__PURE__ */ jsx2("div", { className: "x-group-tag", children: node.title || "\u5206\u7EC4" }),
        editing ? /* @__PURE__ */ jsxs2("div", { className: "x-editbox", onPointerDown: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              className: "x-edit-title",
              value: title,
              placeholder: "\u6807\u9898",
              onChange: (e) => setTitle(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Escape") props.onEditCancel();
              },
              autoFocus: true
            }
          ),
          /* @__PURE__ */ jsx2(
            "textarea",
            {
              className: "x-edit-text",
              value: text,
              placeholder: "\u6B63\u6587\u2026",
              onChange: (e) => setText(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Escape") props.onEditCancel();
              }
            }
          ),
          /* @__PURE__ */ jsxs2("div", { className: "x-edit-actions", children: [
            /* @__PURE__ */ jsx2("button", { className: "x-btn x-btn-primary", onClick: () => props.onEditCommit(node.id, { title, text }), children: "\u786E\u5B9A" }),
            /* @__PURE__ */ jsx2("button", { className: "x-btn", onClick: props.onEditCancel, children: "\u53D6\u6D88" })
          ] })
        ] }) : /* @__PURE__ */ jsxs2("div", { className: "x-node-body", children: [
          node.type !== "group" && node.title && /* @__PURE__ */ jsx2("div", { className: "x-node-title", children: node.title }),
          node.text && /* @__PURE__ */ jsx2("div", { className: "x-node-text", children: node.text })
        ] }),
        !editing && /* @__PURE__ */ jsx2(
          "div",
          {
            className: "x-node-handle",
            title: "\u62D6\u5230\u76EE\u6807\u8282\u70B9\u5EFA\u8FDE\u7EBF",
            onPointerDown: (e) => props.onEdgeHandleDown(e, node)
          }
        )
      ]
    }
  );
});
var CANVAS_CSS = `
.x-croot { min-height: 0; }
.x-missing { align-items: center; justify-content: center; display: flex; flex-direction: column; gap: 10px; }
.x-canvas-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--p-border, #2b3444); flex-shrink: 0; }
.x-canvas-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x-canvas-rev { color: var(--p-text-dim, #8b949e); font-size: 11px; margin-left: auto; flex-shrink: 0; }
.x-canvas-wrap { position: relative; flex: 1; min-height: 0; overflow: hidden; outline: none; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none;
  background-color: var(--p-panel, #10141b);
  background-image: radial-gradient(var(--p-border, #2b3444) 1px, transparent 1px); }
.x-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.x-edge-line { stroke: var(--p-text-dim, #8b949e); stroke-width: 1.6; }
.x-edge-hot .x-edge-line { stroke: var(--p-accent, #4a7dff); stroke-width: 2.2; }
.x-edge-label { fill: var(--p-text, #e6edf3); font-size: 11px; paint-order: stroke;
  stroke: var(--p-panel, #10141b); stroke-width: 4px; }
.x-node { position: absolute; box-sizing: border-box; border-radius: 8px; cursor: move;
  border: 1px solid var(--p-border, #2b3444); background: var(--p-chip, rgba(128,128,128,.12)); overflow: hidden; }
.x-node-sel { border-color: var(--p-accent, #4a7dff); box-shadow: 0 0 0 2px var(--p-accent, #4a7dff) inset; }
.x-node-editing { overflow: visible; z-index: 50 !important; }
.x-node-card { border-left: 3px solid var(--p-accent, #4a7dff); }
.x-node-group { border-style: dashed; background: transparent; cursor: move; }
.x-group-tag { position: absolute; left: 8px; top: 6px; color: var(--p-text-dim, #8b949e); font-size: 11px;
  background: var(--p-panel, #10141b); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--p-border, #2b3444); }
.x-node-body { padding: 8px 10px; height: 100%; box-sizing: border-box; overflow: hidden; pointer-events: none; }
.x-node-title { font-weight: 600; font-size: 12px; margin-bottom: 3px; }
.x-node-text { font-size: 12px; color: var(--p-text-dim, #b6bec9); white-space: pre-wrap; }
.x-c-default { --xc: var(--p-text-dim, #8b949e); }
.x-c-blue { --xc: #4a7dff; } .x-c-green { --xc: #3fb950; } .x-c-amber { --xc: #d29922; }
.x-c-rose { --xc: #f85149; } .x-c-violet { --xc: #a371f7; }
.x-node:not(.x-node-group) { border-left: 3px solid var(--xc, var(--p-accent, #4a7dff)); }
.x-node-handle { position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--p-accent, #4a7dff); border: 2px solid var(--p-panel, #10141b); cursor: crosshair; opacity: 0; transition: opacity .12s; }
.x-node:hover .x-node-handle { opacity: .9; }
.x-editbox { position: absolute; inset: -4px; min-width: 180px; background: var(--p-panel, #161B22);
  border: 1px solid var(--p-accent, #4a7dff); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; z-index: 60; }
.x-edit-title { background: var(--p-chip, rgba(128,128,128,.1)); color: var(--p-text, #e6edf3); border: 1px solid var(--p-border, #2b3444);
  border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
.x-edit-text { flex: 1; min-height: 60px; resize: none; background: var(--p-chip, rgba(128,128,128,.1)); color: var(--p-text, #e6edf3);
  border: 1px solid var(--p-border, #2b3444); border-radius: 4px; padding: 4px 6px; font-size: 12px; outline: none; font-family: inherit; }
.x-edit-actions { display: flex; gap: 6px; justify-content: flex-end; }
.x-toolbar { position: absolute; top: 8px; right: 10px; display: flex; gap: 5px; align-items: center;
  background: var(--p-panel, #161B22); border: 1px solid var(--p-border, #2b3444); border-radius: 8px; padding: 4px 6px; z-index: 90; }
.x-toolbar-sep { width: 1px; height: 16px; background: var(--p-border, #2b3444); }
.x-zoom { font-size: 11px; color: var(--p-text-dim, #8b949e); min-width: 34px; text-align: center; }
.x-relayout-wrap { position: relative; }
.x-relayout-menu { position: absolute; top: calc(100% + 4px); right: 0; display: flex; flex-direction: column; gap: 4px;
  background: var(--p-panel, #161B22); border: 1px solid var(--p-border, #2b3444); border-radius: 8px; padding: 6px; z-index: 95; white-space: nowrap; }
.x-selbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; align-items: center;
  background: var(--p-panel, #161B22); border: 1px solid var(--p-border, #2b3444); border-radius: 10px; padding: 6px 10px; z-index: 90; }
.x-selbar-label { font-size: 12px; color: var(--p-text-dim, #8b949e); margin-right: 2px; }
.x-swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--p-border, #2b3444); cursor: pointer; padding: 0; }
.x-swatch-default { background: var(--p-chip, rgba(128,128,128,.3)); }
.x-swatch-blue { background: #4a7dff; } .x-swatch-green { background: #3fb950; } .x-swatch-amber { background: #d29922; }
.x-swatch-rose { background: #f85149; } .x-swatch-violet { background: #a371f7; }
`;

// src/Panel.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function XintuPanel(props) {
  const [boards, setBoards] = useState3([]);
  const [activeId, setActiveId] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const [toasts, setToasts] = useState3([]);
  const toastSeq = useRef2(1);
  const toast = useCallback2((text, bad) => {
    const id = toastSeq.current++;
    setToasts((t) => [...t.slice(-2), { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 4200 : 2600);
  }, []);
  const refresh = useCallback2(async () => {
    try {
      setBoards(await listBoards());
    } catch (e) {
      toast(`\u52A0\u8F7D\u753B\u5E03\u5217\u8868\u5931\u8D25\uFF1A${e.message}`, true);
    }
  }, [toast]);
  useEffect2(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5e3);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);
  const onCreate = useCallback2(async (title) => {
    setBusy(true);
    try {
      const id = await createBoard(title);
      await refresh();
      setActiveId(id);
      toast("\u5DF2\u65B0\u5EFA\u753B\u5E03");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);
  const onDelete = useCallback2(async (id) => {
    setBusy(true);
    try {
      await deleteBoard(id);
      if (activeId === id) setActiveId(null);
      await refresh();
      toast("\u753B\u5E03\u5DF2\u5220\u9664");
    } catch (e) {
      toast(`\u5220\u9664\u5931\u8D25\uFF1A${e.message}`, true);
    } finally {
      setBusy(false);
    }
  }, [activeId, refresh, toast]);
  const active = boards.find((b) => b.id === activeId) || null;
  return /* @__PURE__ */ jsxs3("div", { className: "x-root", children: [
    /* @__PURE__ */ jsx3("style", { children: CSS2 }),
    activeId ? /* @__PURE__ */ jsx3(
      BoardCanvas,
      {
        boardId: activeId,
        title: active?.title || "",
        onBack: () => {
          setActiveId(null);
          void refresh();
        },
        toast,
        onSendToChat: props.onSendToChat
      }
    ) : /* @__PURE__ */ jsx3(
      BoardList,
      {
        boards,
        busy,
        onOpen: (id) => setActiveId(id),
        onCreate,
        onDelete,
        onRefresh: () => void refresh()
      }
    ),
    /* @__PURE__ */ jsx3("div", { className: "x-toasts", children: toasts.map((t) => /* @__PURE__ */ jsx3("div", { className: `x-toast${t.bad ? " x-toast-bad" : ""}`, children: t.text }, t.id)) })
  ] });
}
var CSS2 = `
.x-root { display: flex; flex-direction: column; height: 100%; min-height: 0;
  color: var(--p-text, #e6edf3); background: var(--p-panel, #10141b); font-size: 13px; }
.x-btn { border: 1px solid var(--p-border, #2b3444); background: var(--p-chip, rgba(128,128,128,.12));
  color: var(--p-text, #e6edf3); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; line-height: 1.6; }
.x-btn:hover { border-color: var(--p-accent, #4a7dff); }
.x-btn:disabled { opacity: .5; cursor: default; }
.x-btn-primary { background: var(--p-accent, #4a7dff); border-color: var(--p-accent, #4a7dff); color: #fff; }
.x-btn-danger { color: var(--p-danger, #f85149); border-color: var(--p-danger, #f85149); }
.x-toasts { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); display: flex;
  flex-direction: column; gap: 6px; z-index: 9999; pointer-events: none; }
.x-toast { background: var(--p-panel, #161B22); border: 1px solid var(--p-accent, #4a7dff); color: var(--p-text, #e6edf3);
  padding: 6px 14px; border-radius: 8px; font-size: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.4); max-width: 70vw; }
.x-toast-bad { border-color: var(--p-danger, #f85149); }
`;

// src/index.tsx
import { jsx as jsx4 } from "react/jsx-runtime";
function XintuEntry(props) {
  return /* @__PURE__ */ jsx4(XintuPanel, { ...props });
}
export {
  XintuEntry as default
};
