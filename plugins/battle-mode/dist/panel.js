import { jsxs as o, jsx as t, Fragment as ae } from "react/jsx-runtime";
import { useState as h, useEffect as se, useMemo as k, useCallback as B } from "react";
const P = [
  {
    id: "architect",
    name: "暴躁架构师",
    emoji: "🧨",
    constraint: "情绪化但动手快，论证全是「这他妈不行」+ 真凭实据",
    systemPrompt: "你是「暴躁架构师」。说话直接、情绪外露，但每个论断都必须带真凭实据（代码、数据、事实）。你的口头禅是「这他妈不行」「你管这叫方案？」。你鄙视空谈，崇拜能跑的代码。"
  },
  {
    id: "zen-pm",
    name: "禅宗产品经理",
    emoji: "🧘",
    constraint: "每句话是偈子，「慢即是快」「删即是加」",
    systemPrompt: "你是「禅宗产品经理」。用极简、诗意、充满禅机的语言说话，把每个概念都压成一句偈子。你的口头禅是「慢即是快」「删即是加」「少即是多」。你反对堆砌，主张留白。"
  },
  {
    id: "bard",
    name: "赛博吟游诗人",
    emoji: "🎭",
    constraint: "只能用代码、电影、流行梗来论证",
    systemPrompt: "你是「赛博吟游诗人」。你只能用代码片段、经典电影、游戏、流行梗来论证你的观点。拒绝抽象术语，一切论点都翻译成具体的故事、画面、台词。你最有名的句子格式是「这就像《XXX》里——」。"
  },
  {
    id: "teacher",
    name: "乡村数学老师",
    emoji: "🏫",
    constraint: "必须把每个概念降到「村里娃能听懂」的比喻",
    systemPrompt: "你是「乡村数学老师」。你的使命是把任何复杂概念讲成村里娃能听懂的比喻——牛、田、井、灶台。你鄙视术语堆砌，坚持「讲不明白就是没真懂」。你总说「你给俺说说，这是咋回事儿？」"
  },
  {
    id: "future",
    name: "未来人",
    emoji: "👽",
    constraint: "论证自带 2077 年回看滤镜",
    systemPrompt: "你是「未来人」，来自 2077 年。你看待今天的问题带着穿越者的视角——你知道这件事十年后会怎样被评价。你说话充满宿命感：「我们现在是在为历史背锅」「2077 年的孩子不会理解你们为什么吵这个」。"
  }
], K = (n) => P.find((r) => r.id === n) ?? P[0], I = [
  {
    id: "cultivation",
    name: "修仙",
    emoji: "☯️",
    reframe: (n) => `把「${n}」翻译成修仙世界的语境：你的道心、心魔、渡劫、功法。双方必须以修真者的身份重述立场，并用功法/渡劫/心魔的隐喻论证。`
  },
  {
    id: "three-kingdoms",
    name: "三国",
    emoji: "⚔️",
    reframe: (n) => `把「${n}」翻译成三国乱世的语境：主公、谋士、粮草、十万大军。双方必须以军师/主公的身份重述立场，用粮草、兵力、地势的隐喻论证。`
  },
  {
    id: "kitchen",
    name: "做菜",
    emoji: "🍳",
    reframe: (n) => `把「${n}」翻译成厨房语境：备菜、火候、高压锅、刀工。双方必须用做菜的隐喻论证——你的方案是一道菜，讲清楚怎么备料、怎么下锅、怎么出锅。`
  },
  {
    id: "horror",
    name: "恐怖片",
    emoji: "🎬",
    reframe: (n) => `把「${n}」翻译成恐怖片语境：地下室、旧家具、脚步声、你听见了吗。双方必须以「这个选择在恐怖片里会怎么演」的视角论证——作死 vs 求生。`
  },
  {
    id: "simulation",
    name: "模拟经营",
    emoji: "🏗️",
    reframe: (n) => `把「${n}」翻译成模拟经营游戏语境：资源、杠杆、现金流、扩张与破产。双方必须以经营者的身份论证——这是值得投资的方向，还是会把公司拖垮的扩张。`
  }
], ce = (n) => I.find((r) => r.id === n) ?? I[0], U = [
  { id: "time", name: "时间", emoji: "⏳", instruction: "从十年后回看，这个选择会被怎么评价？" },
  { id: "user", name: "最笨用户", emoji: "👵", instruction: "一个完全不懂技术的最普通用户，会被这个方案坑吗？" },
  { id: "cost", name: "成本", emoji: "💰", instruction: "老板看到账单时会说什么？这个方案的成本账怎么算？" },
  { id: "alien", name: "外星人", emoji: "🛸", instruction: "一个无预设的外星人看这堆东西，会觉得这是先进的还是退化的？" },
  { id: "devil", name: "魔鬼代言人", emoji: "😈", instruction: "对方立场里，哪怕只有 1% 是对的，那 1% 是什么？" },
  { id: "reverse", name: "反向", emoji: "🔄", instruction: "完全反着说：先站在你反对的立场，用你最擅长的论证方式替它辩护。" }
], me = () => {
  const n = Math.floor(Math.random() * U.length);
  return U[n];
}, N = {
  heavy: "重炮 🔥",
  sniper: "冷枪 🪃"
}, he = () => Math.random() < 0.55 ? "heavy" : "sniper", ue = [
  { id: "reverse", name: "反过来", emoji: "🔄", prompt: "把结论完全反过来，会不会也对？" },
  { id: "kid", name: "5 岁版", emoji: "👶", prompt: "用 5 岁孩子能听懂的话，把这个争议讲一遍。" },
  { id: "scale100", name: "放大 100 倍", emoji: "🚀", prompt: "把这个方案放大 100 倍，会发生什么？" },
  { id: "rule", name: "世界规则变一条", emoji: "🎲", prompt: "如果有一条世界规则变了（资源无限 / 内存无限 / 时间停止），你的结论会变吗？" }
];
function ye(n) {
  const { topic: r, sideA: l, sideB: m, roleA: a, roleB: u, worldview: d, roundNo: y, lastRoundSummary: $ } = n;
  return [
    `# Battle Mode 主持人指令（第 ${y} 轮）`,
    "",
    "你是这场对抗式辩论的主持人。核心理念：**赢的标准不是谁说服了谁，而是谁成长了**。",
    "",
    "## 战局",
    `- 争议点：${r}`,
    `- 辩手 A（${a.emoji}${a.name}）：持「${l}」立场`,
    `- 辩手 B（${u.emoji}${u.name}）：持「${m}」立场`,
    `- 当前世界观：${d.emoji}${d.name}`,
    $ ? `- 上一轮：${$}` : "- 这是第一轮。",
    "",
    "## 你的任务（本轮）",
    `1. 用 ${d.emoji}「${d.name}」世界观重述这个争议（${d.reframe(r)}）`,
    "2. 主持双方交锋：让 A 先出一招，B 正面回应，A 再辩护",
    `3. 如果选了火力（${n.firePower ? N[n.firePower] : "重炮/冷枪"}），用「重炮=正面轰核心论点，冷枪=攻边角漏洞」的标尺点评这一招`,
    "4. 结束后给出「血条」：双方论点存活/被击破统计",
    "",
    "## 角色约束（必须遵守）",
    `- A 必须按「${a.constraint}」论证（${a.systemPrompt}）`,
    `- B 必须按「${u.constraint}」论证（${u.systemPrompt}）`,
    "",
    "## 主持纪律",
    "- 不许让任何一方回避对方最强论点",
    "- 被证据打动而改立场 = 加分，死撑 = 扣分",
    "- 平局合法，允许「分歧成立，各自保留」",
    "",
    "输出：一轮完整的交锋（A 立论 → B 回应 → A 辩护 → 你的火力点评 + 血条）。"
  ].join(`
`);
}
function q(n) {
  const { topic: r, side: l, role: m, worldview: a, firePower: u, opponentLastMove: d } = n, y = u === "heavy";
  return [
    `# Battle Mode 辩手指令（${m.emoji}${m.name}）`,
    "",
    `你是「${m.name}」，本场辩手。你在为这个争议辩论：**${r}**`,
    `你的立场：**${l}**`,
    `当前世界观：${a.emoji}${a.name}（${a.reframe(r)}）`,
    d ? `对方上一招：${d}` : "",
    "",
    "## 你的人格（必须严格遵守）",
    m.systemPrompt,
    "",
    "## 本轮出招",
    y ? "你选择**重炮**：正面轰对方的核心论点。给最强的一击，带证据或带逻辑。" : "你选择**冷枪**：攻对方论证的边角漏洞。稳妥、不贪、找它的破绽。",
    "",
    "## 输出",
    "用你的人格语气，出一招（200 字内）。结尾用一句话点明「我这一招打的是对方的哪个点」。"
  ].join(`
`);
}
async function G(n, r = {}) {
  const l = window.__POLARIS_HOST_INVOKE__;
  if (l) return l(n, r);
  const m = window.__TAURI_INTERNALS__;
  if (m?.invoke) return m.invoke(n, r);
  throw new Error("宿主 invoke 不可用（需在 Polaris 内运行）");
}
const e = {
  container: { padding: 14, display: "flex", flexDirection: "column", height: "100%", gap: 10, overflow: "auto" },
  card: { padding: 10, borderRadius: 8, border: "1px solid #3F3F46", background: "#25252B", display: "flex", flexDirection: "column", gap: 8 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, color: "#8E8E93", marginBottom: 2 },
  input: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 56, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  ok: { fontSize: 12, color: "#4ADE80", padding: 4 },
  err: { fontSize: 12, color: "#F87171", padding: 4 },
  muted: { fontSize: 11, color: "#8E8E93" },
  h: { fontSize: 13, fontWeight: 600, color: "#F8F8F8" }
}, c = (n = !1, r = !1) => ({
  padding: "6px 14px",
  borderRadius: 6,
  fontSize: 12,
  cursor: r ? "not-allowed" : "pointer",
  background: n ? "#3B82F6" : "#2D2D33",
  color: n ? "#fff" : "#B4B4B8",
  border: n ? "none" : "1px solid #3F3F46",
  opacity: r ? 0.5 : 1
}), Q = (n) => ({
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  cursor: "pointer",
  border: "1px solid #3F3F46",
  background: n ? "#3B82F6" : "#2D2D33",
  color: n ? "#fff" : "#B4B4B8"
}), C = (n) => {
  navigator.clipboard?.writeText(n).catch(() => {
  });
};
function pe({
  pluginId: n,
  onSendToChat: r
}) {
  const [l, m] = h(""), [a, u] = h(""), [d, y] = h(""), [$, E] = h("architect"), [A, z] = h("zen-pm"), [_, W] = h("cultivation"), [x, Y] = h(1), [R, Z] = h(null), [p, ee] = h(null), [s, H] = h([]), [V, T] = h(null), [O, D] = h(null);
  se(() => {
    G("plugin_get_config", { pluginId: n }).then((i) => {
      typeof i?.lastBattle == "string" && i.lastBattle && T(i.lastBattle);
    }).catch(() => {
    });
  }, [n]);
  const w = l.trim() && a.trim() && d.trim(), f = k(() => K($), [$]), v = k(() => K(A), [A]), g = k(() => ce(_), [_]), te = B(() => {
    const i = [...P], S = Math.floor(Math.random() * i.length), j = i.splice(S, 1)[0], M = i[Math.floor(Math.random() * i.length)];
    E(j.id), z(M.id);
  }, []), X = B((i) => {
    const S = i === "A" ? $ : A, j = P.filter((de) => de.id !== S), M = j[Math.floor(Math.random() * j.length)];
    i === "A" ? E(M.id) : z(M.id);
  }, [$, A]), ie = B(() => {
    const i = I[Math.floor(Math.random() * I.length)];
    W(i.id);
  }, []), ne = B(() => {
    Z(me());
  }, []), oe = B(() => {
    ee(he());
  }, []), L = k(() => w ? ye({
    topic: l.trim(),
    sideA: a.trim(),
    sideB: d.trim(),
    roleA: f,
    roleB: v,
    worldview: g,
    roundNo: x,
    lastRoundSummary: s.length ? s[s.length - 1] : void 0,
    firePower: p ?? void 0
  }) : null, [w, l, a, d, f, v, g, x, p, s]), F = k(() => w ? {
    a: q({
      topic: l.trim(),
      side: a.trim(),
      role: f,
      worldview: g,
      firePower: p ?? "heavy",
      opponentLastMove: s.length ? s[s.length - 1] : void 0
    }),
    b: q({
      topic: l.trim(),
      side: d.trim(),
      role: v,
      worldview: g,
      firePower: (p ?? "heavy") === "heavy" ? "sniper" : "heavy",
      opponentLastMove: s.length ? s[s.length - 1] : void 0
    })
  } : null, [w, l, a, d, f, v, g, p, s]), b = k(() => w ? [
    `# ⚔️ Battle 战报 — ${l.trim()}`,
    "",
    `- **辩手 A**：${f.emoji} ${f.name}（${a.trim()}）`,
    `- **辩手 B**：${v.emoji} ${v.name}（${d.trim()}）`,
    `- **世界观**：${g.emoji} ${g.name}`,
    `- **轮数**：${x}`,
    "",
    "## 交锋记录",
    ...s.length ? s.map((S, j) => `${j + 1}. ${S}`) : ["（尚未交锋）"],
    "",
    "## 学到的三件事",
    "",
    "1. ",
    "2. ",
    "3. ",
    "",
    "## 共识 / 分歧 / 下一步",
    "",
    "- 共识：",
    "- 分歧：",
    "- 下一步："
  ].join(`
`) : null, [w, l, a, d, f, v, g, x, s]), re = B(async () => {
    if (!(!b || !r))
      try {
        await r(b), D({ ok: !0, text: "战报已发送到聊天（已持久化）" });
      } catch (i) {
        D({ ok: !1, text: `发送失败: ${i}` });
      }
  }, [b, r]), le = B(async () => {
    if (b)
      try {
        await G("plugin_set_config", { pluginId: n, patch: { lastBattle: b } }), T(b), D({ ok: !0, text: "已存档" });
      } catch (i) {
        D({ ok: !1, text: `存档失败: ${i}` });
      }
  }, [b]);
  return /* @__PURE__ */ o("div", { style: e.container, children: [
    /* @__PURE__ */ o("div", { style: e.row, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 14, fontWeight: 700, color: "#F8F8F8" }, children: "⚔️ Battle Mode" }),
      /* @__PURE__ */ t("span", { style: e.muted, children: "为学习而战" })
    ] }),
    /* @__PURE__ */ o("div", { style: e.card, children: [
      /* @__PURE__ */ t("div", { style: e.h, children: "1 · 立题" }),
      /* @__PURE__ */ o("div", { style: e.field, children: [
        /* @__PURE__ */ t("div", { style: e.label, children: "争议点" }),
        /* @__PURE__ */ t(
          "input",
          {
            style: e.input,
            value: l,
            placeholder: "要辩论什么？例：SimpleAI 该不该学主流 harness 的并发模型？",
            onChange: (i) => m(i.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ o("div", { style: e.row, children: [
        /* @__PURE__ */ o("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 4 }, children: [
          /* @__PURE__ */ t("div", { style: e.label, children: "辩手 A 立场" }),
          /* @__PURE__ */ t(
            "input",
            {
              style: e.input,
              value: a,
              placeholder: "例：不该，轻量引擎不该照搬重型架构",
              onChange: (i) => u(i.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ o("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 4 }, children: [
          /* @__PURE__ */ t("div", { style: e.label, children: "辩手 B 立场" }),
          /* @__PURE__ */ t(
            "input",
            {
              style: e.input,
              value: d,
              placeholder: "例：该，这是抄作业不是抄架构",
              onChange: (i) => y(i.target.value)
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o("div", { style: e.card, children: [
      /* @__PURE__ */ o("div", { style: e.row, children: [
        /* @__PURE__ */ t("div", { style: e.h, children: "2 · 角色卡" }),
        /* @__PURE__ */ t("button", { style: c(!1), onClick: te, children: "🎴 重抽 A/B" })
      ] }),
      /* @__PURE__ */ o("div", { style: e.row, children: [
        /* @__PURE__ */ t(
          J,
          {
            label: `A · ${f.emoji}${f.name}`,
            constraint: f.constraint,
            activeId: $,
            onSelect: (i) => E(i),
            onReroll: () => X("A")
          }
        ),
        /* @__PURE__ */ t(
          J,
          {
            label: `B · ${v.emoji}${v.name}`,
            constraint: v.constraint,
            activeId: A,
            onSelect: (i) => z(i),
            onReroll: () => X("B")
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ o("div", { style: e.card, children: [
      /* @__PURE__ */ o("div", { style: e.row, children: [
        /* @__PURE__ */ t("div", { style: e.h, children: "3 · 世界观跳伞" }),
        /* @__PURE__ */ t("button", { style: c(!1), onClick: ie, children: "🪂 重掷" })
      ] }),
      /* @__PURE__ */ o("div", { style: e.muted, children: [
        g.emoji,
        " ",
        g.name
      ] }),
      /* @__PURE__ */ t("div", { style: e.muted, children: g.reframe(l || "这个争议") }),
      /* @__PURE__ */ t("div", { style: e.row, children: I.map((i) => /* @__PURE__ */ o("button", { style: Q(_ === i.id), onClick: () => W(i.id), children: [
        i.emoji,
        " ",
        i.name
      ] }, i.id)) })
    ] }),
    /* @__PURE__ */ o("div", { style: e.card, children: [
      /* @__PURE__ */ o("div", { style: e.row, children: [
        /* @__PURE__ */ t("div", { style: e.h, children: "4 · 战斗" }),
        /* @__PURE__ */ o("span", { style: e.muted, children: [
          "第 ",
          x,
          " 轮"
        ] }),
        /* @__PURE__ */ t("button", { style: c(!1), onClick: ne, children: "🎲 维度骰子" }),
        /* @__PURE__ */ t("button", { style: c(!1), onClick: oe, children: "🎯 掷火力" })
      ] }),
      R && /* @__PURE__ */ o("div", { style: { padding: 8, borderRadius: 6, background: "#1D1D22", border: "1px solid #3F3F46" }, children: [
        /* @__PURE__ */ o("div", { style: e.muted, children: [
          "🎲 维度：",
          R.emoji,
          " ",
          R.name
        ] }),
        /* @__PURE__ */ t("div", { style: { fontSize: 12, color: "#E4E4E7" }, children: R.instruction })
      ] }),
      L && /* @__PURE__ */ o("div", { style: e.field, children: [
        /* @__PURE__ */ o("div", { style: e.label, children: [
          "主持人提示词（",
          p ? N[p] : "未掷火力",
          "）—— 拷给任意 AI 当主持人"
        ] }),
        /* @__PURE__ */ t("textarea", { style: { ...e.textarea, minHeight: 160 }, readOnly: !0, value: L }),
        /* @__PURE__ */ t("div", { style: e.row, children: /* @__PURE__ */ t("button", { style: c(!1), onClick: () => C(L), children: "📋 复制主持人提示词" }) })
      ] }),
      F && /* @__PURE__ */ o("div", { style: e.field, children: [
        /* @__PURE__ */ t("div", { style: e.label, children: "辩手提示词（A/B 各一份，拷给 AI 当辩手）" }),
        /* @__PURE__ */ o("div", { style: { ...e.card, background: "#1D1D22" }, children: [
          /* @__PURE__ */ o("div", { style: e.muted, children: [
            "🧨 A · ",
            f.name,
            "（",
            p ? N[p] : "重炮 🔥 默认",
            "）"
          ] }),
          /* @__PURE__ */ t("textarea", { style: { ...e.textarea, minHeight: 120 }, readOnly: !0, value: F.a }),
          /* @__PURE__ */ t("button", { style: c(!1), onClick: () => C(F.a), children: "📋 复制 A" })
        ] }),
        /* @__PURE__ */ o("div", { style: { ...e.card, background: "#1D1D22" }, children: [
          /* @__PURE__ */ o("div", { style: e.muted, children: [
            "🧘 B · ",
            v.name,
            "（",
            p ? p === "heavy" ? "冷枪 🪃" : "重炮 🔥" : "冷枪 🪃 默认",
            "）"
          ] }),
          /* @__PURE__ */ t("textarea", { style: { ...e.textarea, minHeight: 120 }, readOnly: !0, value: F.b }),
          /* @__PURE__ */ t("button", { style: c(!1), onClick: () => C(F.b), children: "📋 复制 B" })
        ] })
      ] }),
      /* @__PURE__ */ o("div", { style: e.field, children: [
        /* @__PURE__ */ t("div", { style: e.label, children: "本轮交锋记录（手动记：对方说了啥 / 你认了什么）" }),
        /* @__PURE__ */ t(
          "textarea",
          {
            style: e.textarea,
            placeholder: "把 AI 交锋的结果粘回来，作为战报素材…",
            value: s.join(`
`),
            onChange: (i) => H(i.target.value.split(`
`))
          }
        ),
        /* @__PURE__ */ o("div", { style: e.row, children: [
          /* @__PURE__ */ t("button", { style: c(), onClick: () => H([...s, `第 ${x} 轮交锋`]), children: "➕ 记一轮" }),
          /* @__PURE__ */ t("button", { style: c(!1), onClick: () => Y(x + 1), children: "⏭️ 下一轮" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o("div", { style: e.card, children: [
      /* @__PURE__ */ t("div", { style: e.h, children: "5 · 战报" }),
      b ? /* @__PURE__ */ o(ae, { children: [
        /* @__PURE__ */ t("textarea", { style: { ...e.textarea, minHeight: 180 }, readOnly: !0, value: b }),
        /* @__PURE__ */ o("div", { style: e.row, children: [
          r && /* @__PURE__ */ t("button", { style: c(!0), onClick: re, children: "📤 发到聊天（持久化）" }),
          /* @__PURE__ */ t("button", { style: c(!1), onClick: le, children: "💾 存档" })
        ] })
      ] }) : /* @__PURE__ */ t("div", { style: e.muted, children: "先填完立题（争议点 + 双立场）再生成战报。" }),
      O && /* @__PURE__ */ t("div", { style: O.ok ? e.ok : e.err, children: O.text }),
      V && /* @__PURE__ */ o("details", { children: [
        /* @__PURE__ */ t("summary", { style: { cursor: "pointer", fontSize: 12, color: "#8E8E93" }, children: "上次存档" }),
        /* @__PURE__ */ t("pre", { style: { whiteSpace: "pre-wrap", fontSize: 11, color: "#B4B4B8", margin: 0 }, children: V })
      ] })
    ] }),
    /* @__PURE__ */ o("div", { style: e.card, children: [
      /* @__PURE__ */ t("div", { style: e.h, children: "🔄 变奏四连（发散引擎）" }),
      /* @__PURE__ */ t("div", { style: e.row, children: ue.map((i) => /* @__PURE__ */ o("button", { style: c(!1), onClick: () => C(`${i.emoji} ${i.name}：${i.prompt}

话题：${l || ""}`), children: [
        i.emoji,
        " ",
        i.name
      ] }, i.id)) }),
      /* @__PURE__ */ t("div", { style: e.muted, children: "点一下复制一个「发散问题」，拷给 AI 追问。" })
    ] }),
    /* @__PURE__ */ t("div", { style: e.muted, children: "MVP v0.1 · 纯前端 · AI 由你把 prompt 拷给任意模型扮演 · 战报通过「发到聊天」持久化" })
  ] });
}
function J({ label: n, constraint: r, activeId: l, onSelect: m, onReroll: a }) {
  const [u, d] = h(!1);
  return /* @__PURE__ */ o("div", { style: { flex: 1, ...e.card, gap: 6 }, children: [
    /* @__PURE__ */ o("div", { style: e.row, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 12, fontWeight: 600, color: "#F8F8F8" }, children: n }),
      /* @__PURE__ */ t("button", { style: c(!1), onClick: a, children: "🔄 换一张" }),
      /* @__PURE__ */ t("button", { style: c(!1), onClick: () => d(!u), children: u ? "收起" : "换角色" })
    ] }),
    /* @__PURE__ */ t("div", { style: e.muted, children: r }),
    u && /* @__PURE__ */ t("div", { style: { ...e.row, gap: 4 }, children: P.filter((y) => y.id !== l).map((y) => /* @__PURE__ */ o("button", { style: Q(!1), onClick: () => {
      m(y.id), d(!1);
    }, children: [
      y.emoji,
      " ",
      y.name
    ] }, y.id)) })
  ] });
}
function ge(n) {
  return /* @__PURE__ */ t(pe, { ...n });
}
export {
  ge as default
};
