import { jsx as r, jsxs as l, Fragment as Ne } from "react/jsx-runtime";
import { useState as m, useCallback as b, useEffect as ne, useRef as Fe } from "react";
const oe = "agnes", _e = 12, Ie = 8, Ee = 5e3, V = [
  { label: "约 3 秒", frames: 81, rate: 24, seconds: "3.4" },
  { label: "约 5 秒", frames: 121, rate: 24, seconds: "5.0" },
  { label: "约 10 秒", frames: 241, rate: 24, seconds: "10.0" },
  { label: "约 18 秒", frames: 441, rate: 24, seconds: "18.4" }
], re = ["1024x1024", "1024x768", "768x1024", "1280x768", "768x1280"];
async function H(t, n = {}) {
  const s = window.__POLARIS_HOST_INVOKE__;
  if (s) return s(t, n);
  const a = window.__TAURI_INTERNALS__;
  if (a?.invoke) return a.invoke(t, n);
  throw new Error("宿主 invoke 不可用（需在 Polaris 内运行）");
}
async function ae() {
  const t = await H("plugin_get_config", { pluginId: oe });
  return {
    apiKey: t.apiKey || "",
    apiBase: t.apiBase || "https://apihub.agnes-ai.com",
    imageModel: t.imageModel || "agnes-image-2.1-flash",
    videoModel: t.videoModel || "agnes-video-v2.0",
    defaultSize: t.defaultSize || "1024x1024"
  };
}
async function Ce(t) {
  await H("plugin_set_config", { pluginId: oe, patch: t });
}
function U(t) {
  return new Promise((n, s) => {
    const a = new FileReader();
    a.onload = () => n(a.result), a.onerror = () => s(a.error), a.readAsDataURL(t);
  });
}
function Be(t, n = "image/png") {
  return t.startsWith("data:") ? t : `data:${n};base64,${t}`;
}
async function Me(t) {
  const n = await H(
    "router_dispatch",
    {
      req: {
        target: "cap.http",
        payload: {
          action: "request",
          method: t.method,
          url: t.url,
          headers: t.headers || {},
          body: t.body || "",
          bodyType: t.bodyType || "text",
          timeoutMs: t.timeoutMs || 12e4
        }
      }
    }
  );
  if (!n || !n.ok) throw new Error(n && n.error || "cap.http 转发失败");
  const s = n.result || {};
  return {
    status: Number(s.status) || 0,
    statusText: String(s.statusText || ""),
    ok: !!s.ok,
    body: String(s.body ?? "")
  };
}
async function K(t, n, s) {
  const a = `${t.apiBase.replace(/\/+$/, "")}${n}`, o = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${t.apiKey}`,
    ...s.headers || {}
  }, d = s.method || "GET", u = s.body ? String(s.body) : "";
  try {
    const h = await Me({ method: d, url: a, headers: o, body: u, bodyType: "json" });
    if (!h.ok)
      throw new Error(`API 返回错误 ${h.status}: ${String(h.body || "").slice(0, 500)}`);
    return JSON.parse(h.body || "{}");
  } catch (h) {
    if (String(h?.message || "").match(/^API 返回错误/)) throw h;
  }
  const p = await fetch(a, {
    ...s,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t.apiKey}`, ...s.headers || {} }
  });
  if (!p.ok) {
    const h = await p.text().catch(() => "");
    throw new Error(`API 返回错误 ${p.status}: ${h.slice(0, 500)}`);
  }
  return p.json();
}
async function je(t, n) {
  const s = n.size || t.defaultSize, a = n.responseFormat || "url", o = n.images || [], d = { model: t.imageModel, prompt: n.prompt, size: s };
  o.length > 0 ? d.extra_body = { image: o, response_format: a } : a === "b64_json" ? d.return_base64 = !0 : d.extra_body = { response_format: "url" };
  const p = (await K(t, "/v1/images/generations", {
    method: "POST",
    body: JSON.stringify(d)
  })).data?.[0] || {};
  return {
    url: typeof p.url == "string" ? p.url : null,
    base64: typeof p.b64_json == "string" ? p.b64_json : null,
    mimeType: "image/png",
    revisedPrompt: typeof p.revised_prompt == "string" ? p.revised_prompt : null,
    size: s,
    model: t.imageModel
  };
}
function Pe(t) {
  const n = Math.min(Math.max(t, 9), 441), s = Math.round((n - 1) / 8);
  return Math.min(Math.max(8 * s + 1, 9), 441);
}
async function Ae(t, n) {
  const s = n.numFrames || 121, a = Pe(s), o = {
    model: t.videoModel,
    prompt: n.prompt,
    width: 1152,
    height: 768,
    num_frames: a,
    frame_rate: n.frameRate || 24
  };
  n.image && (o.image = n.image), n.negativePrompt && (o.negative_prompt = n.negativePrompt), n.seed !== void 0 && (o.seed = n.seed);
  const d = {};
  n.images && n.images.length > 0 && (d.image = n.images), n.mode && (n.mode === "keyframes" ? d.mode = "keyframes" : o.mode = n.mode), Object.keys(d).length > 0 && (o.extra_body = d);
  const u = await K(t, "/v1/videos", {
    method: "POST",
    body: JSON.stringify(o)
  }), p = typeof u.video_id == "string" && u.video_id ? u.video_id : typeof u.id == "string" ? u.id : "";
  if (!p) throw new Error("响应缺少 video_id");
  return {
    videoId: p,
    taskId: typeof u.task_id == "string" ? u.task_id : null,
    status: typeof u.status == "string" ? u.status : "queued",
    progress: typeof u.progress == "number" ? u.progress : 0,
    seconds: typeof u.seconds == "string" ? u.seconds : null,
    size: typeof u.size == "string" ? u.size : null,
    url: null,
    error: null,
    framesNormalized: s !== a
  };
}
async function ie(t, n) {
  const s = encodeURIComponent(n);
  let a;
  try {
    a = await K(t, `/agnesapi?video_id=${s}`, { method: "GET" });
  } catch (p) {
    if (p instanceof Error && p.message.includes("404"))
      a = { status: "queued", progress: 0 };
    else
      throw p;
  }
  const o = typeof a.status == "string" ? a.status : "unknown", d = typeof a.url == "string" && a.url.trim() ? a.url : null, u = o === "failed" ? typeof a.error == "string" ? a.error : "未知错误" : null;
  return {
    videoId: n,
    taskId: typeof a.task_id == "string" ? a.task_id : null,
    status: o,
    progress: typeof a.progress == "number" ? a.progress : 0,
    seconds: typeof a.seconds == "string" ? a.seconds : null,
    size: typeof a.size == "string" ? a.size : null,
    url: d,
    error: u,
    framesNormalized: !1
  };
}
const i = {
  container: { padding: 14, display: "flex", flexDirection: "column", height: "100%", gap: 10, overflow: "auto" },
  tabs: { display: "flex", gap: 6, borderBottom: "1px solid #3F3F46", paddingBottom: 8 },
  tab: (t) => ({
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid #3F3F46",
    background: t ? "#3B82F6" : "#2D2D33",
    color: t ? "#fff" : "#B4B4B8"
  }),
  label: { fontSize: 11, color: "#8E8E93", marginBottom: 4 },
  input: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 90, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" },
  select: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12 },
  btn: (t = !1) => ({
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    background: t ? "#3B82F6" : "#2D2D33",
    color: t ? "#fff" : "#B4B4B8",
    border: t ? "none" : "1px solid #3F3F46"
  }),
  card: { padding: 10, borderRadius: 8, border: "1px solid #3F3F46", background: "#25252B", display: "flex", flexDirection: "column", gap: 8 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  statusOk: { fontSize: 12, color: "#4ADE80", padding: 4 },
  statusErr: { fontSize: 12, color: "#F87171", padding: 4 },
  chip: (t) => ({
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid #3F3F46",
    background: t ? "#3B82F6" : "#2D2D33",
    color: t ? "#fff" : "#B4B4B8"
  }),
  thumb: { width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #3F3F46" }
};
function g({ label: t, children: n }) {
  return /* @__PURE__ */ l("div", { style: i.field, children: [
    /* @__PURE__ */ r("div", { style: i.label, children: t }),
    n
  ] });
}
const w = /* @__PURE__ */ new Map();
function Re(t) {
  const n = Fe(t);
  n.current = t;
  const s = b((a) => {
    if (w.has(a)) return;
    const o = async () => {
      if (!document.hidden)
        try {
          const d = await ae(), u = await ie(d, a);
          if (n.current(a, u), u.status === "completed" || u.status === "failed") {
            const p = w.get(a);
            p && (clearInterval(p), w.delete(a));
          }
        } catch (d) {
          console.error("[Agnes] poll failed", d);
        }
    };
    w.set(a, setInterval(o, Ee)), o();
  }, []);
  return ne(() => () => {
    for (const a of w.values()) clearInterval(a);
    w.clear();
  }, []), { startPolling: s };
}
function De({ pluginId: t, onSendToChat: n }) {
  const [s, a] = m("image"), [o, d] = m(null), [u, p] = m(!0), [h, N] = m(null), F = b(async () => {
    p(!0);
    try {
      d(await ae());
    } catch (e) {
      N({ ok: !1, text: `读取配置失败: ${e}` });
    } finally {
      p(!1);
    }
  }, []);
  ne(() => {
    F();
  }, [F]);
  const [k, le] = m(""), [_, de] = m("1024x1024"), [I, ce] = m("text"), [E, q] = m([]), [P, ue] = m("url"), [A, pe] = m([]), [C, W] = m(!1), [G, J] = m(""), [S, me] = m(""), [R, ge] = m(1), [y, he] = m("text"), [z, X] = m(null), [B, Y] = m([]), [D, fe] = m(""), [M, ye] = m(""), [L, Q] = m([]), [j, Z] = m(!1), [ee, $] = m(""), T = b((e, c) => {
    Q((f) => f.map(
      (x) => x.videoId === e ? {
        ...x,
        status: c.status,
        progress: c.progress,
        url: c.url || x.url,
        seconds: c.seconds ?? x.seconds,
        size: c.size ?? x.size,
        error: c.error ?? x.error
      } : x
    ));
  }, []), { startPolling: te } = Re(T), v = !!o && !o.apiKey, be = b(async (e) => {
    if (!e) return;
    const c = await Promise.all(Array.from(e).slice(0, 4).map(U));
    q((f) => [...f, ...c].slice(0, 4));
  }, []), xe = b(async () => {
    if (!(!o || v || !k.trim() || C)) {
      W(!0), J("");
      try {
        const e = await je(o, {
          prompt: k.trim(),
          size: _,
          images: I === "image" ? E : void 0,
          responseFormat: P
        }), c = e.url ?? (e.base64 ? Be(e.base64, e.mimeType) : "");
        if (!c) throw new Error("响应缺少 url 或 base64");
        pe((f) => [{
          prompt: k.trim(),
          size: _,
          src: c,
          model: e.model,
          createdAt: Date.now()
        }, ...f].slice(0, _e));
      } catch (e) {
        J(e instanceof Error ? e.message : String(e));
      } finally {
        W(!1);
      }
    }
  }, [o, v, k, C, _, I, E, P]), ve = b(async (e) => {
    if (!e) return;
    const c = await Promise.all(Array.from(e).slice(0, 4).map(U));
    Y((f) => [...f, ...c].slice(0, 4));
  }, []), we = b(async (e) => {
    !e || !e[0] || X(await U(e[0]));
  }, []), ke = b(async () => {
    if (!(!o || v || !S.trim() || j)) {
      Z(!0), $("");
      try {
        const e = V[R] ?? V[1], c = await Ae(o, {
          prompt: S.trim(),
          numFrames: e.frames,
          frameRate: e.rate,
          image: y === "image" && z ? z : void 0,
          images: y === "multi" || y === "keyframes" ? B : void 0,
          mode: y === "image" ? "ti2vid" : y === "keyframes" ? "keyframes" : void 0,
          negativePrompt: D.trim() || void 0,
          seed: M.trim() ? Number(M) : void 0
        });
        c.framesNormalized && $("帧数已自动纠正为合法值 8n+1。"), Q((f) => [{
          prompt: S.trim(),
          videoId: c.videoId,
          status: c.status,
          progress: c.progress,
          url: null,
          seconds: c.seconds,
          size: null,
          error: null,
          createdAt: Date.now()
        }, ...f].slice(0, Ie)), te(c.videoId);
      } catch (e) {
        $(e instanceof Error ? e.message : String(e));
      } finally {
        Z(!1);
      }
    }
  }, [o, v, S, j, R, y, z, B, D, M, te]), Se = b(async (e) => {
    if (o)
      try {
        const c = await ie(o, e);
        T(e, c);
      } catch (c) {
        console.error("[Agnes] query failed", c);
      }
  }, [o, T]), ze = b(async () => {
    if (o) {
      N(null);
      try {
        await Ce({
          apiKey: o.apiKey,
          apiBase: o.apiBase,
          imageModel: o.imageModel,
          videoModel: o.videoModel,
          defaultSize: o.defaultSize
        }), N({ ok: !0, text: "配置已保存" }), await F();
      } catch (e) {
        N({ ok: !1, text: `保存失败: ${e}` });
      }
    }
  }, [o, F]);
  return u && !o ? /* @__PURE__ */ r("div", { style: i.container, children: /* @__PURE__ */ l("div", { style: { fontSize: 12, color: "#8E8E93" }, children: [
    "加载配置中…（插件 ",
    t,
    "）"
  ] }) }) : /* @__PURE__ */ l("div", { style: i.container, children: [
    /* @__PURE__ */ l("div", { style: i.row, children: [
      /* @__PURE__ */ r("span", { style: { fontSize: 14, fontWeight: 600, color: "#F8F8F8" }, children: "Agnes 多模态" }),
      v && /* @__PURE__ */ r("span", { style: { fontSize: 11, color: "#FBBF24" }, children: "未配置 API Key" })
    ] }),
    /* @__PURE__ */ r("div", { style: i.tabs, children: ["image", "video", "settings"].map((e) => /* @__PURE__ */ r("button", { style: i.tab(s === e), onClick: () => a(e), children: { image: "生图", video: "生视频", settings: "设置" }[e] }, e)) }),
    s === "image" && /* @__PURE__ */ l("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ r(g, { label: "模式", children: /* @__PURE__ */ r("div", { style: i.row, children: ["text", "image"].map((e) => /* @__PURE__ */ r("button", { style: i.chip(I === e), onClick: () => ce(e), children: e === "text" ? "文生图" : "图生图" }, e)) }) }),
      I === "image" && /* @__PURE__ */ l(g, { label: "输入图（最多 4 张，data URL）", children: [
        /* @__PURE__ */ r(
          "input",
          {
            style: i.input,
            type: "file",
            accept: "image/*",
            multiple: !0,
            onChange: (e) => be(e.target.files)
          }
        ),
        E.length > 0 && /* @__PURE__ */ r("div", { style: i.row, children: E.map((e, c) => /* @__PURE__ */ r(
          "img",
          {
            src: e,
            style: i.thumb,
            alt: "input",
            onClick: () => q((f) => f.filter((x, O) => O !== c))
          },
          c
        )) })
      ] }),
      /* @__PURE__ */ r(g, { label: "提示词", children: /* @__PURE__ */ r(
        "textarea",
        {
          style: i.textarea,
          value: k,
          placeholder: "描述要生成的图片内容…",
          onChange: (e) => le(e.target.value)
        }
      ) }),
      /* @__PURE__ */ r(g, { label: "尺寸", children: /* @__PURE__ */ r("select", { style: i.select, value: _, onChange: (e) => de(e.target.value), children: re.map((e) => /* @__PURE__ */ r("option", { value: e, children: e }, e)) }) }),
      /* @__PURE__ */ r(g, { label: "返回格式", children: /* @__PURE__ */ l("select", { style: i.select, value: P, onChange: (e) => ue(e.target.value), children: [
        /* @__PURE__ */ r("option", { value: "url", children: "URL（推荐）" }),
        /* @__PURE__ */ r("option", { value: "b64_json", children: "Base64" })
      ] }) }),
      /* @__PURE__ */ r("button", { style: i.btn(!0), onClick: xe, disabled: C || !!v, children: C ? "生成中…" : "生成图片" }),
      G && /* @__PURE__ */ r("div", { style: i.statusErr, children: G }),
      A.length > 0 && /* @__PURE__ */ l("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ l("div", { style: { fontSize: 11, color: "#8E8E93" }, children: [
          "历史（",
          A.length,
          "）"
        ] }),
        A.map((e, c) => /* @__PURE__ */ r("div", { style: i.card, children: /* @__PURE__ */ l("div", { style: i.row, children: [
          /* @__PURE__ */ r("img", { src: e.src, style: { width: 48, height: 48, borderRadius: 4, objectFit: "cover" }, alt: "result" }),
          /* @__PURE__ */ l("div", { style: { flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ r("div", { style: { fontSize: 11, color: "#B4B4B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.prompt }),
            /* @__PURE__ */ r("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [e.model, e.size].filter(Boolean).join(" · ") })
          ] }),
          /* @__PURE__ */ r("a", { href: e.src, download: `agnes-${c}.png`, style: i.btn(), children: "下载" }),
          n && /* @__PURE__ */ r("button", { style: i.btn(), onClick: () => n(e.src), children: "发送" })
        ] }) }, c))
      ] })
    ] }),
    s === "video" && /* @__PURE__ */ l("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ r(g, { label: "模式", children: /* @__PURE__ */ r("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: ["text", "image", "multi", "keyframes"].map((e) => /* @__PURE__ */ r("button", { style: i.chip(y === e), onClick: () => he(e), children: { text: "文生视频", image: "图生视频", multi: "多图", keyframes: "关键帧" }[e] }, e)) }) }),
      y === "image" && /* @__PURE__ */ l(g, { label: "输入图（单张）", children: [
        /* @__PURE__ */ r("input", { style: i.input, type: "file", accept: "image/*", onChange: (e) => we(e.target.files) }),
        z && /* @__PURE__ */ r("img", { src: z, style: i.thumb, alt: "input", onClick: () => X(null) })
      ] }),
      (y === "multi" || y === "keyframes") && /* @__PURE__ */ l(g, { label: "输入图（2-4 张）", children: [
        /* @__PURE__ */ r("input", { style: i.input, type: "file", accept: "image/*", multiple: !0, onChange: (e) => ve(e.target.files) }),
        B.length > 0 && /* @__PURE__ */ r("div", { style: i.row, children: B.map((e, c) => /* @__PURE__ */ r(
          "img",
          {
            src: e,
            style: i.thumb,
            alt: "input",
            onClick: () => Y((f) => f.filter((x, O) => O !== c))
          },
          c
        )) })
      ] }),
      /* @__PURE__ */ r(g, { label: "提示词", children: /* @__PURE__ */ r(
        "textarea",
        {
          style: i.textarea,
          value: S,
          placeholder: "描述视频内容、镜头运动、光线…",
          onChange: (e) => me(e.target.value)
        }
      ) }),
      /* @__PURE__ */ r(g, { label: "时长", children: /* @__PURE__ */ r(
        "select",
        {
          style: i.select,
          value: R,
          onChange: (e) => ge(Number(e.target.value)),
          children: V.map((e, c) => /* @__PURE__ */ l("option", { value: c, children: [
            e.label,
            "（",
            e.frames,
            " 帧）"
          ] }, e.frames))
        }
      ) }),
      /* @__PURE__ */ l("details", { children: [
        /* @__PURE__ */ r("summary", { style: { cursor: "pointer", fontSize: 12, color: "#8E8E93" }, children: "高级" }),
        /* @__PURE__ */ l("div", { style: { display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }, children: [
          /* @__PURE__ */ r(g, { label: "反向提示词", children: /* @__PURE__ */ r(
            "textarea",
            {
              style: i.textarea,
              value: D,
              placeholder: "避免的内容…",
              onChange: (e) => fe(e.target.value)
            }
          ) }),
          /* @__PURE__ */ r(g, { label: "随机种子（可选）", children: /* @__PURE__ */ r(
            "input",
            {
              style: i.input,
              value: M,
              placeholder: "留空随机",
              onChange: (e) => ye(e.target.value)
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ r("button", { style: i.btn(!0), onClick: ke, disabled: j || !!v, children: j ? "创建中…" : "创建视频" }),
      ee && /* @__PURE__ */ r("div", { style: i.statusErr, children: ee }),
      L.length > 0 && /* @__PURE__ */ l("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ l("div", { style: { fontSize: 11, color: "#8E8E93" }, children: [
          "任务（",
          L.length,
          "）"
        ] }),
        L.map((e) => /* @__PURE__ */ l("div", { style: i.card, children: [
          /* @__PURE__ */ l("div", { style: i.row, children: [
            /* @__PURE__ */ r("span", { style: { fontSize: 12, color: "#F8F8F8", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.status === "completed" ? "✅ 已完成" : e.status === "failed" ? "❌ 失败" : `⏳ ${e.status}（${e.progress}%）` }),
            e.url && /* @__PURE__ */ l(Ne, { children: [
              /* @__PURE__ */ r(
                "a",
                {
                  href: e.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: { fontSize: 11, color: "#60A5FA" },
                  children: "打开"
                }
              ),
              /* @__PURE__ */ r("a", { href: e.url, download: `agnes-${e.videoId.slice(0, 12)}.mp4`, style: i.btn(), children: "下载" }),
              n && /* @__PURE__ */ r("button", { style: i.btn(), onClick: () => n(e.url), children: "发送" })
            ] })
          ] }),
          /* @__PURE__ */ r("div", { style: { fontSize: 10, color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.prompt || e.videoId }),
          (e.status === "queued" || e.status === "in_progress") && /* @__PURE__ */ r("div", { style: i.row, children: /* @__PURE__ */ r("button", { style: i.btn(), onClick: () => Se(e.videoId), children: "刷新" }) }),
          e.error && /* @__PURE__ */ r("div", { style: i.statusErr, children: e.error })
        ] }, e.videoId))
      ] })
    ] }),
    s === "settings" && o && /* @__PURE__ */ l("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ r(g, { label: "API Key", children: /* @__PURE__ */ r(
        "input",
        {
          style: i.input,
          type: "password",
          value: o.apiKey,
          placeholder: "sk-…",
          onChange: (e) => d({ ...o, apiKey: e.target.value })
        }
      ) }),
      /* @__PURE__ */ r(g, { label: "API Base URL", children: /* @__PURE__ */ r(
        "input",
        {
          style: i.input,
          value: o.apiBase,
          onChange: (e) => d({ ...o, apiBase: e.target.value })
        }
      ) }),
      /* @__PURE__ */ r(g, { label: "图片模型", children: /* @__PURE__ */ r(
        "input",
        {
          style: i.input,
          value: o.imageModel,
          onChange: (e) => d({ ...o, imageModel: e.target.value })
        }
      ) }),
      /* @__PURE__ */ r(g, { label: "视频模型", children: /* @__PURE__ */ r(
        "input",
        {
          style: i.input,
          value: o.videoModel,
          onChange: (e) => d({ ...o, videoModel: e.target.value })
        }
      ) }),
      /* @__PURE__ */ r(g, { label: "默认图片尺寸", children: /* @__PURE__ */ r(
        "select",
        {
          style: i.select,
          value: o.defaultSize,
          onChange: (e) => d({ ...o, defaultSize: e.target.value }),
          children: re.map((e) => /* @__PURE__ */ r("option", { value: e, children: e }, e))
        }
      ) }),
      /* @__PURE__ */ r("div", { style: i.row, children: /* @__PURE__ */ r("button", { style: i.btn(!0), onClick: ze, children: "保存配置" }) }),
      h && /* @__PURE__ */ r("div", { style: h.ok ? i.statusOk : i.statusErr, children: h.text }),
      /* @__PURE__ */ r("div", { style: { fontSize: 10, color: "#71717A", lineHeight: 1.5 }, children: '配置保存在 Polaris config.json 的 plugins["agnes"]；MCP server 与面板共用。 （旧版内置插件的 <appConfigDir>/agnes/config.json 会在首次读取时自动兼容。）' })
    ] })
  ] });
}
function Le(t) {
  if (typeof t != "object" || t === null) return !1;
  const n = t;
  return n.type !== "image" && n.type !== "video" ? !1 : n.type === "image" ? typeof n.url == "string" || typeof n.base64 == "string" : !0;
}
function $e(t) {
  let n = t;
  if (typeof n == "string")
    try {
      const s = JSON.parse(n);
      typeof s == "object" && s !== null && (n = s);
    } catch {
      return null;
    }
  return Le(n) ? n : null;
}
function Te(t) {
  return t.url ? t.url : t.base64 ? `data:${t.mimeType || "image/png"};base64,${t.base64}` : null;
}
async function se(t, n) {
  try {
    const a = await (await fetch(t)).blob(), o = URL.createObjectURL(a), d = document.createElement("a");
    d.href = o, d.download = n, document.body.appendChild(d), d.click(), d.remove(), URL.revokeObjectURL(o);
  } catch {
    window.open(t, "_blank", "noopener");
  }
}
function Oe({ data: t, status: n, toolName: s }) {
  const [a, o] = m(!1), d = $e(t);
  return d ? d.type === "image" ? /* @__PURE__ */ r(Ve, { d }) : /* @__PURE__ */ r(Ue, { d, onToggle: () => o((u) => !u), expanded: a }) : /* @__PURE__ */ r("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated px-3 py-2", children: /* @__PURE__ */ l("header", { className: "flex min-w-0 items-center gap-2", children: [
    /* @__PURE__ */ r("span", { className: "text-sm", children: "🎨" }),
    /* @__PURE__ */ l("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ r("div", { className: "truncate text-sm font-medium text-text-primary", children: "Agnes 媒体" }),
      /* @__PURE__ */ l("div", { className: "mt-0.5 truncate text-xs text-text-secondary", children: [
        "数据解析失败（",
        s,
        "）· 状态 ",
        n
      ] })
    ] })
  ] }) });
}
function Ve({ d: t }) {
  const n = Te(t);
  if (!n)
    return /* @__PURE__ */ r("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary", children: "图片数据缺失" });
  const s = [t.model, t.size].filter(Boolean).join(" · ");
  return /* @__PURE__ */ l("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated", children: [
    /* @__PURE__ */ l("header", { className: "flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2", children: [
      /* @__PURE__ */ r("div", { className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-400", children: /* @__PURE__ */ r("span", { className: "text-sm", children: "🖼️" }) }),
      /* @__PURE__ */ l("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ r("div", { className: "truncate text-sm font-medium text-text-primary", children: "Agnes 图片" }),
        s && /* @__PURE__ */ r("div", { className: "mt-0.5 truncate text-[11px] text-text-tertiary", children: s })
      ] }),
      /* @__PURE__ */ l("div", { className: "ml-auto flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ r(
          "a",
          {
            href: n,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "新窗口打开",
            children: /* @__PURE__ */ l("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ r("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
              /* @__PURE__ */ r("polyline", { points: "15 3 21 3 21 9" }),
              /* @__PURE__ */ r("line", { x1: "10", y1: "14", x2: "21", y2: "3" })
            ] })
          }
        ),
        /* @__PURE__ */ r(
          "button",
          {
            type: "button",
            onClick: () => {
              const o = t.mimeType?.includes("jpeg") ? "jpg" : "png";
              se(n, `agnes-${Date.now()}.${o}`);
            },
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "下载",
            children: /* @__PURE__ */ l("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ r("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
              /* @__PURE__ */ r("polyline", { points: "7 10 12 15 17 10" }),
              /* @__PURE__ */ r("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
            ] })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ r("div", { className: "flex items-center justify-center bg-background-surface p-2", children: /* @__PURE__ */ r(
      "img",
      {
        src: n,
        alt: t.prompt || t.revisedPrompt || "Agnes 生成图片",
        className: "max-h-[420px] w-auto max-w-full rounded-md object-contain",
        loading: "lazy"
      }
    ) }),
    (t.prompt || t.revisedPrompt) && /* @__PURE__ */ r("div", { className: "border-t border-border px-3 py-2 text-[11px] leading-relaxed text-text-secondary", children: t.revisedPrompt || t.prompt })
  ] });
}
function Ue({ d: t, onToggle: n, expanded: s }) {
  const a = t.status === "completed" && !!t.url, o = [t.model, t.seconds && `${t.seconds}s`, t.size].filter(Boolean).join(" · "), d = () => {
    t.url && se(t.url, `agnes-${t.videoId || Date.now()}.mp4`);
  };
  return /* @__PURE__ */ l("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated", children: [
    /* @__PURE__ */ l("header", { className: "flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2", children: [
      /* @__PURE__ */ r("div", { className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-400", children: /* @__PURE__ */ r("span", { className: "text-sm", children: "🎬" }) }),
      /* @__PURE__ */ l("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ r("div", { className: "truncate text-sm font-medium text-text-primary", children: "Agnes 视频" }),
        o && /* @__PURE__ */ r("div", { className: "mt-0.5 truncate text-[11px] text-text-tertiary", children: o })
      ] }),
      a && /* @__PURE__ */ l("div", { className: "ml-auto flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ r(
          "a",
          {
            href: t.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "新窗口打开",
            children: /* @__PURE__ */ l("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ r("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
              /* @__PURE__ */ r("polyline", { points: "15 3 21 3 21 9" }),
              /* @__PURE__ */ r("line", { x1: "10", y1: "14", x2: "21", y2: "3" })
            ] })
          }
        ),
        /* @__PURE__ */ r(
          "button",
          {
            type: "button",
            onClick: d,
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "下载",
            children: /* @__PURE__ */ l("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ r("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
              /* @__PURE__ */ r("polyline", { points: "7 10 12 15 17 10" }),
              /* @__PURE__ */ r("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
            ] })
          }
        )
      ] })
    ] }),
    a ? /* @__PURE__ */ r("div", { className: "bg-black p-2", children: /* @__PURE__ */ r(
      "video",
      {
        src: t.url,
        controls: !0,
        className: "max-h-[460px] w-full rounded-md",
        preload: "metadata"
      }
    ) }) : /* @__PURE__ */ l("div", { className: "flex items-center gap-3 bg-background-surface px-3 py-6", children: [
      /* @__PURE__ */ r("span", { className: "h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" }),
      /* @__PURE__ */ l("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ r("div", { className: "text-sm text-text-primary", children: t.status === "failed" ? "视频生成失败" : "视频生成中..." }),
        /* @__PURE__ */ r("div", { className: "mt-0.5 truncate text-[11px] text-text-tertiary", children: t.error ? t.error : t.videoId ? `videoId: ${t.videoId}${typeof t.progress == "number" ? ` · 进度 ${t.progress}%` : ""}` : "等待任务创建" })
      ] })
    ] }),
    t.prompt && /* @__PURE__ */ l(
      "button",
      {
        type: "button",
        onClick: n,
        className: "flex w-full items-center gap-1 border-t border-border px-3 py-2 text-left text-[11px] leading-relaxed text-text-secondary hover:bg-background-hover",
        children: [
          /* @__PURE__ */ r("span", { className: "flex-1 truncate", children: s ? t.prompt : t.prompt.length > 90 ? `${t.prompt.slice(0, 90)}…` : t.prompt }),
          /* @__PURE__ */ r("span", { className: "shrink-0 text-text-tertiary", children: s ? "收起" : "展开" })
        ]
      }
    )
  ] });
}
function qe(t) {
  return t && t.toolName ? /* @__PURE__ */ r(Oe, { ...t }) : /* @__PURE__ */ r(De, { ...t });
}
export {
  qe as default
};
