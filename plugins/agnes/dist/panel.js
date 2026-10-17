import { jsx as t, jsxs as s, Fragment as Ne } from "react/jsx-runtime";
import { useState as p, useCallback as y, useEffect as re, useRef as _e } from "react";
const ne = "agnes", Ie = 12, Se = 8, Ce = 5e3, T = [
  { label: "约 3 秒", frames: 81, rate: 24, seconds: "3.4" },
  { label: "约 5 秒", frames: 121, rate: 24, seconds: "5.0" },
  { label: "约 10 秒", frames: 241, rate: 24, seconds: "10.0" },
  { label: "约 18 秒", frames: 441, rate: 24, seconds: "18.4" }
], te = ["1024x1024", "1024x768", "768x1024", "1280x768", "768x1280"];
async function oe(r, n = {}) {
  const l = window.__POLARIS_HOST_INVOKE__;
  if (l) return l(r, n);
  const i = window.__TAURI_INTERNALS__;
  if (i?.invoke) return i.invoke(r, n);
  throw new Error("宿主 invoke 不可用（需在 Polaris 内运行）");
}
async function ie() {
  const r = await oe("plugin_get_config", { pluginId: ne });
  return {
    apiKey: r.apiKey || "",
    apiBase: r.apiBase || "https://apihub.agnes-ai.com",
    imageModel: r.imageModel || "agnes-image-2.1-flash",
    videoModel: r.videoModel || "agnes-video-v2.0",
    defaultSize: r.defaultSize || "1024x1024"
  };
}
async function Ee(r) {
  await oe("plugin_set_config", { pluginId: ne, patch: r });
}
function U(r) {
  return new Promise((n, l) => {
    const i = new FileReader();
    i.onload = () => n(i.result), i.onerror = () => l(i.error), i.readAsDataURL(r);
  });
}
function Be(r, n = "image/png") {
  return r.startsWith("data:") ? r : `data:${n};base64,${r}`;
}
async function H(r, n, l) {
  const i = `${r.apiBase.replace(/\/+$/, "")}${n}`, o = await fetch(i, {
    ...l,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${r.apiKey}`,
      ...l.headers || {}
    }
  });
  if (!o.ok) {
    const d = await o.text().catch(() => "");
    throw new Error(`API 返回错误 ${o.status}: ${d.slice(0, 500)}`);
  }
  return o.json();
}
async function Me(r, n) {
  const l = n.size || r.defaultSize, i = n.responseFormat || "url", o = n.images || [], d = { model: r.imageModel, prompt: n.prompt, size: l };
  o.length > 0 ? d.extra_body = { image: o, response_format: i } : i === "b64_json" ? d.return_base64 = !0 : d.extra_body = { response_format: "url" };
  const m = (await H(r, "/v1/images/generations", {
    method: "POST",
    body: JSON.stringify(d)
  })).data?.[0] || {};
  return {
    url: typeof m.url == "string" ? m.url : null,
    base64: typeof m.b64_json == "string" ? m.b64_json : null,
    mimeType: "image/png",
    revisedPrompt: typeof m.revised_prompt == "string" ? m.revised_prompt : null,
    size: l,
    model: r.imageModel
  };
}
function je(r) {
  const n = Math.min(Math.max(r, 9), 441), l = Math.round((n - 1) / 8);
  return Math.min(Math.max(8 * l + 1, 9), 441);
}
async function Pe(r, n) {
  const l = n.numFrames || 121, i = je(l), o = {
    model: r.videoModel,
    prompt: n.prompt,
    width: 1152,
    height: 768,
    num_frames: i,
    frame_rate: n.frameRate || 24
  };
  n.image && (o.image = n.image), n.negativePrompt && (o.negative_prompt = n.negativePrompt), n.seed !== void 0 && (o.seed = n.seed);
  const d = {};
  n.images && n.images.length > 0 && (d.image = n.images), n.mode && (n.mode === "keyframes" ? d.mode = "keyframes" : o.mode = n.mode), Object.keys(d).length > 0 && (o.extra_body = d);
  const u = await H(r, "/v1/videos", {
    method: "POST",
    body: JSON.stringify(o)
  }), m = typeof u.video_id == "string" && u.video_id ? u.video_id : typeof u.id == "string" ? u.id : "";
  if (!m) throw new Error("响应缺少 video_id");
  return {
    videoId: m,
    taskId: typeof u.task_id == "string" ? u.task_id : null,
    status: typeof u.status == "string" ? u.status : "queued",
    progress: typeof u.progress == "number" ? u.progress : 0,
    seconds: typeof u.seconds == "string" ? u.seconds : null,
    size: typeof u.size == "string" ? u.size : null,
    url: null,
    error: null,
    framesNormalized: l !== i
  };
}
async function ae(r, n) {
  const l = encodeURIComponent(n);
  let i;
  try {
    i = await H(r, `/agnesapi?video_id=${l}`, { method: "GET" });
  } catch (m) {
    if (m instanceof Error && m.message.includes("404"))
      i = { status: "queued", progress: 0 };
    else
      throw m;
  }
  const o = typeof i.status == "string" ? i.status : "unknown", d = typeof i.url == "string" && i.url.trim() ? i.url : null, u = o === "failed" ? typeof i.error == "string" ? i.error : "未知错误" : null;
  return {
    videoId: n,
    taskId: typeof i.task_id == "string" ? i.task_id : null,
    status: o,
    progress: typeof i.progress == "number" ? i.progress : 0,
    seconds: typeof i.seconds == "string" ? i.seconds : null,
    size: typeof i.size == "string" ? i.size : null,
    url: d,
    error: u,
    framesNormalized: !1
  };
}
const a = {
  container: { padding: 14, display: "flex", flexDirection: "column", height: "100%", gap: 10, overflow: "auto" },
  tabs: { display: "flex", gap: 6, borderBottom: "1px solid #3F3F46", paddingBottom: 8 },
  tab: (r) => ({
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid #3F3F46",
    background: r ? "#3B82F6" : "#2D2D33",
    color: r ? "#fff" : "#B4B4B8"
  }),
  label: { fontSize: 11, color: "#8E8E93", marginBottom: 4 },
  input: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 90, padding: 8, borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" },
  select: { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #3F3F46", background: "#25252B", color: "#F8F8F8", fontSize: 12 },
  btn: (r = !1) => ({
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    background: r ? "#3B82F6" : "#2D2D33",
    color: r ? "#fff" : "#B4B4B8",
    border: r ? "none" : "1px solid #3F3F46"
  }),
  card: { padding: 10, borderRadius: 8, border: "1px solid #3F3F46", background: "#25252B", display: "flex", flexDirection: "column", gap: 8 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  statusOk: { fontSize: 12, color: "#4ADE80", padding: 4 },
  statusErr: { fontSize: 12, color: "#F87171", padding: 4 },
  chip: (r) => ({
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    cursor: "pointer",
    border: "1px solid #3F3F46",
    background: r ? "#3B82F6" : "#2D2D33",
    color: r ? "#fff" : "#B4B4B8"
  }),
  thumb: { width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "1px solid #3F3F46" }
};
function g({ label: r, children: n }) {
  return /* @__PURE__ */ s("div", { style: a.field, children: [
    /* @__PURE__ */ t("div", { style: a.label, children: r }),
    n
  ] });
}
const b = /* @__PURE__ */ new Map();
function Ae(r) {
  const n = _e(r);
  n.current = r;
  const l = y((i) => {
    if (b.has(i)) return;
    const o = async () => {
      if (!document.hidden)
        try {
          const d = await ie(), u = await ae(d, i);
          if (n.current(i, u), u.status === "completed" || u.status === "failed") {
            const m = b.get(i);
            m && (clearInterval(m), b.delete(i));
          }
        } catch (d) {
          console.error("[Agnes] poll failed", d);
        }
    };
    b.set(i, setInterval(o, Ce)), o();
  }, []);
  return re(() => () => {
    for (const i of b.values()) clearInterval(i);
    b.clear();
  }, []), { startPolling: l };
}
function Re({ pluginId: r, onSendToChat: n }) {
  const [l, i] = p("image"), [o, d] = p(null), [u, m] = p(!0), [j, F] = p(null), N = y(async () => {
    m(!0);
    try {
      d(await ie());
    } catch (e) {
      F({ ok: !1, text: `读取配置失败: ${e}` });
    } finally {
      m(!1);
    }
  }, []);
  re(() => {
    N();
  }, [N]);
  const [w, le] = p(""), [_, de] = p("1024x1024"), [I, ce] = p("text"), [S, K] = p([]), [P, ue] = p("url"), [A, pe] = p([]), [C, W] = p(!1), [q, G] = p(""), [k, me] = p(""), [R, ge] = p(1), [h, fe] = p("text"), [z, J] = p(null), [E, X] = p([]), [D, he] = p(""), [B, ye] = p(""), [L, Y] = p([]), [M, Q] = p(!1), [Z, $] = p(""), V = y((e, c) => {
    Y((f) => f.map(
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
  }, []), { startPolling: ee } = Ae(V), v = !!o && !o.apiKey, xe = y(async (e) => {
    if (!e) return;
    const c = await Promise.all(Array.from(e).slice(0, 4).map(U));
    K((f) => [...f, ...c].slice(0, 4));
  }, []), ve = y(async () => {
    if (!(!o || v || !w.trim() || C)) {
      W(!0), G("");
      try {
        const e = await Me(o, {
          prompt: w.trim(),
          size: _,
          images: I === "image" ? S : void 0,
          responseFormat: P
        }), c = e.url ?? (e.base64 ? Be(e.base64, e.mimeType) : "");
        if (!c) throw new Error("响应缺少 url 或 base64");
        pe((f) => [{
          prompt: w.trim(),
          size: _,
          src: c,
          model: e.model,
          createdAt: Date.now()
        }, ...f].slice(0, Ie));
      } catch (e) {
        G(e instanceof Error ? e.message : String(e));
      } finally {
        W(!1);
      }
    }
  }, [o, v, w, C, _, I, S, P]), be = y(async (e) => {
    if (!e) return;
    const c = await Promise.all(Array.from(e).slice(0, 4).map(U));
    X((f) => [...f, ...c].slice(0, 4));
  }, []), we = y(async (e) => {
    !e || !e[0] || J(await U(e[0]));
  }, []), ke = y(async () => {
    if (!(!o || v || !k.trim() || M)) {
      Q(!0), $("");
      try {
        const e = T[R] ?? T[1], c = await Pe(o, {
          prompt: k.trim(),
          numFrames: e.frames,
          frameRate: e.rate,
          image: h === "image" && z ? z : void 0,
          images: h === "multi" || h === "keyframes" ? E : void 0,
          mode: h === "image" ? "ti2vid" : h === "keyframes" ? "keyframes" : void 0,
          negativePrompt: D.trim() || void 0,
          seed: B.trim() ? Number(B) : void 0
        });
        c.framesNormalized && $("帧数已自动纠正为合法值 8n+1。"), Y((f) => [{
          prompt: k.trim(),
          videoId: c.videoId,
          status: c.status,
          progress: c.progress,
          url: null,
          seconds: c.seconds,
          size: null,
          error: null,
          createdAt: Date.now()
        }, ...f].slice(0, Se)), ee(c.videoId);
      } catch (e) {
        $(e instanceof Error ? e.message : String(e));
      } finally {
        Q(!1);
      }
    }
  }, [o, v, k, M, R, h, z, E, D, B, ee]), ze = y(async (e) => {
    if (o)
      try {
        const c = await ae(o, e);
        V(e, c);
      } catch (c) {
        console.error("[Agnes] query failed", c);
      }
  }, [o, V]), Fe = y(async () => {
    if (o) {
      F(null);
      try {
        await Ee({
          apiKey: o.apiKey,
          apiBase: o.apiBase,
          imageModel: o.imageModel,
          videoModel: o.videoModel,
          defaultSize: o.defaultSize
        }), F({ ok: !0, text: "配置已保存" }), await N();
      } catch (e) {
        F({ ok: !1, text: `保存失败: ${e}` });
      }
    }
  }, [o, N]);
  return u && !o ? /* @__PURE__ */ t("div", { style: a.container, children: /* @__PURE__ */ s("div", { style: { fontSize: 12, color: "#8E8E93" }, children: [
    "加载配置中…（插件 ",
    r,
    "）"
  ] }) }) : /* @__PURE__ */ s("div", { style: a.container, children: [
    /* @__PURE__ */ s("div", { style: a.row, children: [
      /* @__PURE__ */ t("span", { style: { fontSize: 14, fontWeight: 600, color: "#F8F8F8" }, children: "Agnes 多模态" }),
      v && /* @__PURE__ */ t("span", { style: { fontSize: 11, color: "#FBBF24" }, children: "未配置 API Key" })
    ] }),
    /* @__PURE__ */ t("div", { style: a.tabs, children: ["image", "video", "settings"].map((e) => /* @__PURE__ */ t("button", { style: a.tab(l === e), onClick: () => i(e), children: { image: "生图", video: "生视频", settings: "设置" }[e] }, e)) }),
    l === "image" && /* @__PURE__ */ s("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ t(g, { label: "模式", children: /* @__PURE__ */ t("div", { style: a.row, children: ["text", "image"].map((e) => /* @__PURE__ */ t("button", { style: a.chip(I === e), onClick: () => ce(e), children: e === "text" ? "文生图" : "图生图" }, e)) }) }),
      I === "image" && /* @__PURE__ */ s(g, { label: "输入图（最多 4 张，data URL）", children: [
        /* @__PURE__ */ t(
          "input",
          {
            style: a.input,
            type: "file",
            accept: "image/*",
            multiple: !0,
            onChange: (e) => xe(e.target.files)
          }
        ),
        S.length > 0 && /* @__PURE__ */ t("div", { style: a.row, children: S.map((e, c) => /* @__PURE__ */ t(
          "img",
          {
            src: e,
            style: a.thumb,
            alt: "input",
            onClick: () => K((f) => f.filter((x, O) => O !== c))
          },
          c
        )) })
      ] }),
      /* @__PURE__ */ t(g, { label: "提示词", children: /* @__PURE__ */ t(
        "textarea",
        {
          style: a.textarea,
          value: w,
          placeholder: "描述要生成的图片内容…",
          onChange: (e) => le(e.target.value)
        }
      ) }),
      /* @__PURE__ */ t(g, { label: "尺寸", children: /* @__PURE__ */ t("select", { style: a.select, value: _, onChange: (e) => de(e.target.value), children: te.map((e) => /* @__PURE__ */ t("option", { value: e, children: e }, e)) }) }),
      /* @__PURE__ */ t(g, { label: "返回格式", children: /* @__PURE__ */ s("select", { style: a.select, value: P, onChange: (e) => ue(e.target.value), children: [
        /* @__PURE__ */ t("option", { value: "url", children: "URL（推荐）" }),
        /* @__PURE__ */ t("option", { value: "b64_json", children: "Base64" })
      ] }) }),
      /* @__PURE__ */ t("button", { style: a.btn(!0), onClick: ve, disabled: C || !!v, children: C ? "生成中…" : "生成图片" }),
      q && /* @__PURE__ */ t("div", { style: a.statusErr, children: q }),
      A.length > 0 && /* @__PURE__ */ s("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ s("div", { style: { fontSize: 11, color: "#8E8E93" }, children: [
          "历史（",
          A.length,
          "）"
        ] }),
        A.map((e, c) => /* @__PURE__ */ t("div", { style: a.card, children: /* @__PURE__ */ s("div", { style: a.row, children: [
          /* @__PURE__ */ t("img", { src: e.src, style: { width: 48, height: 48, borderRadius: 4, objectFit: "cover" }, alt: "result" }),
          /* @__PURE__ */ s("div", { style: { flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ t("div", { style: { fontSize: 11, color: "#B4B4B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.prompt }),
            /* @__PURE__ */ t("div", { style: { fontSize: 10, color: "#8E8E93" }, children: [e.model, e.size].filter(Boolean).join(" · ") })
          ] }),
          /* @__PURE__ */ t("a", { href: e.src, download: `agnes-${c}.png`, style: a.btn(), children: "下载" }),
          n && /* @__PURE__ */ t("button", { style: a.btn(), onClick: () => n(e.src), children: "发送" })
        ] }) }, c))
      ] })
    ] }),
    l === "video" && /* @__PURE__ */ s("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ t(g, { label: "模式", children: /* @__PURE__ */ t("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: ["text", "image", "multi", "keyframes"].map((e) => /* @__PURE__ */ t("button", { style: a.chip(h === e), onClick: () => fe(e), children: { text: "文生视频", image: "图生视频", multi: "多图", keyframes: "关键帧" }[e] }, e)) }) }),
      h === "image" && /* @__PURE__ */ s(g, { label: "输入图（单张）", children: [
        /* @__PURE__ */ t("input", { style: a.input, type: "file", accept: "image/*", onChange: (e) => we(e.target.files) }),
        z && /* @__PURE__ */ t("img", { src: z, style: a.thumb, alt: "input", onClick: () => J(null) })
      ] }),
      (h === "multi" || h === "keyframes") && /* @__PURE__ */ s(g, { label: "输入图（2-4 张）", children: [
        /* @__PURE__ */ t("input", { style: a.input, type: "file", accept: "image/*", multiple: !0, onChange: (e) => be(e.target.files) }),
        E.length > 0 && /* @__PURE__ */ t("div", { style: a.row, children: E.map((e, c) => /* @__PURE__ */ t(
          "img",
          {
            src: e,
            style: a.thumb,
            alt: "input",
            onClick: () => X((f) => f.filter((x, O) => O !== c))
          },
          c
        )) })
      ] }),
      /* @__PURE__ */ t(g, { label: "提示词", children: /* @__PURE__ */ t(
        "textarea",
        {
          style: a.textarea,
          value: k,
          placeholder: "描述视频内容、镜头运动、光线…",
          onChange: (e) => me(e.target.value)
        }
      ) }),
      /* @__PURE__ */ t(g, { label: "时长", children: /* @__PURE__ */ t(
        "select",
        {
          style: a.select,
          value: R,
          onChange: (e) => ge(Number(e.target.value)),
          children: T.map((e, c) => /* @__PURE__ */ s("option", { value: c, children: [
            e.label,
            "（",
            e.frames,
            " 帧）"
          ] }, e.frames))
        }
      ) }),
      /* @__PURE__ */ s("details", { children: [
        /* @__PURE__ */ t("summary", { style: { cursor: "pointer", fontSize: 12, color: "#8E8E93" }, children: "高级" }),
        /* @__PURE__ */ s("div", { style: { display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }, children: [
          /* @__PURE__ */ t(g, { label: "反向提示词", children: /* @__PURE__ */ t(
            "textarea",
            {
              style: a.textarea,
              value: D,
              placeholder: "避免的内容…",
              onChange: (e) => he(e.target.value)
            }
          ) }),
          /* @__PURE__ */ t(g, { label: "随机种子（可选）", children: /* @__PURE__ */ t(
            "input",
            {
              style: a.input,
              value: B,
              placeholder: "留空随机",
              onChange: (e) => ye(e.target.value)
            }
          ) })
        ] })
      ] }),
      /* @__PURE__ */ t("button", { style: a.btn(!0), onClick: ke, disabled: M || !!v, children: M ? "创建中…" : "创建视频" }),
      Z && /* @__PURE__ */ t("div", { style: a.statusErr, children: Z }),
      L.length > 0 && /* @__PURE__ */ s("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
        /* @__PURE__ */ s("div", { style: { fontSize: 11, color: "#8E8E93" }, children: [
          "任务（",
          L.length,
          "）"
        ] }),
        L.map((e) => /* @__PURE__ */ s("div", { style: a.card, children: [
          /* @__PURE__ */ s("div", { style: a.row, children: [
            /* @__PURE__ */ t("span", { style: { fontSize: 12, color: "#F8F8F8", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.status === "completed" ? "✅ 已完成" : e.status === "failed" ? "❌ 失败" : `⏳ ${e.status}（${e.progress}%）` }),
            e.url && /* @__PURE__ */ s(Ne, { children: [
              /* @__PURE__ */ t(
                "a",
                {
                  href: e.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: { fontSize: 11, color: "#60A5FA" },
                  children: "打开"
                }
              ),
              /* @__PURE__ */ t("a", { href: e.url, download: `agnes-${e.videoId.slice(0, 12)}.mp4`, style: a.btn(), children: "下载" }),
              n && /* @__PURE__ */ t("button", { style: a.btn(), onClick: () => n(e.url), children: "发送" })
            ] })
          ] }),
          /* @__PURE__ */ t("div", { style: { fontSize: 10, color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: e.prompt || e.videoId }),
          (e.status === "queued" || e.status === "in_progress") && /* @__PURE__ */ t("div", { style: a.row, children: /* @__PURE__ */ t("button", { style: a.btn(), onClick: () => ze(e.videoId), children: "刷新" }) }),
          e.error && /* @__PURE__ */ t("div", { style: a.statusErr, children: e.error })
        ] }, e.videoId))
      ] })
    ] }),
    l === "settings" && o && /* @__PURE__ */ s("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
      /* @__PURE__ */ t(g, { label: "API Key", children: /* @__PURE__ */ t(
        "input",
        {
          style: a.input,
          type: "password",
          value: o.apiKey,
          placeholder: "sk-…",
          onChange: (e) => d({ ...o, apiKey: e.target.value })
        }
      ) }),
      /* @__PURE__ */ t(g, { label: "API Base URL", children: /* @__PURE__ */ t(
        "input",
        {
          style: a.input,
          value: o.apiBase,
          onChange: (e) => d({ ...o, apiBase: e.target.value })
        }
      ) }),
      /* @__PURE__ */ t(g, { label: "图片模型", children: /* @__PURE__ */ t(
        "input",
        {
          style: a.input,
          value: o.imageModel,
          onChange: (e) => d({ ...o, imageModel: e.target.value })
        }
      ) }),
      /* @__PURE__ */ t(g, { label: "视频模型", children: /* @__PURE__ */ t(
        "input",
        {
          style: a.input,
          value: o.videoModel,
          onChange: (e) => d({ ...o, videoModel: e.target.value })
        }
      ) }),
      /* @__PURE__ */ t(g, { label: "默认图片尺寸", children: /* @__PURE__ */ t(
        "select",
        {
          style: a.select,
          value: o.defaultSize,
          onChange: (e) => d({ ...o, defaultSize: e.target.value }),
          children: te.map((e) => /* @__PURE__ */ t("option", { value: e, children: e }, e))
        }
      ) }),
      /* @__PURE__ */ t("div", { style: a.row, children: /* @__PURE__ */ t("button", { style: a.btn(!0), onClick: Fe, children: "保存配置" }) }),
      j && /* @__PURE__ */ t("div", { style: j.ok ? a.statusOk : a.statusErr, children: j.text }),
      /* @__PURE__ */ t("div", { style: { fontSize: 10, color: "#71717A", lineHeight: 1.5 }, children: '配置保存在 Polaris config.json 的 plugins["agnes"]；MCP server 与面板共用。 （旧版内置插件的 <appConfigDir>/agnes/config.json 会在首次读取时自动兼容。）' })
    ] })
  ] });
}
function De(r) {
  if (typeof r != "object" || r === null) return !1;
  const n = r;
  return n.type !== "image" && n.type !== "video" ? !1 : n.type === "image" ? typeof n.url == "string" || typeof n.base64 == "string" : !0;
}
function Le(r) {
  let n = r;
  if (typeof n == "string")
    try {
      const l = JSON.parse(n);
      typeof l == "object" && l !== null && (n = l);
    } catch {
      return null;
    }
  return De(n) ? n : null;
}
function $e(r) {
  return r.url ? r.url : r.base64 ? `data:${r.mimeType || "image/png"};base64,${r.base64}` : null;
}
async function se(r, n) {
  try {
    const i = await (await fetch(r)).blob(), o = URL.createObjectURL(i), d = document.createElement("a");
    d.href = o, d.download = n, document.body.appendChild(d), d.click(), d.remove(), URL.revokeObjectURL(o);
  } catch {
    window.open(r, "_blank", "noopener");
  }
}
function Ve({ data: r, status: n, toolName: l }) {
  const [i, o] = p(!1), d = Le(r);
  return d ? d.type === "image" ? /* @__PURE__ */ t(Oe, { d }) : /* @__PURE__ */ t(Te, { d, onToggle: () => o((u) => !u), expanded: i }) : /* @__PURE__ */ t("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated px-3 py-2", children: /* @__PURE__ */ s("header", { className: "flex min-w-0 items-center gap-2", children: [
    /* @__PURE__ */ t("span", { className: "text-sm", children: "🎨" }),
    /* @__PURE__ */ s("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ t("div", { className: "truncate text-sm font-medium text-text-primary", children: "Agnes 媒体" }),
      /* @__PURE__ */ s("div", { className: "mt-0.5 truncate text-xs text-text-secondary", children: [
        "数据解析失败（",
        l,
        "）· 状态 ",
        n
      ] })
    ] })
  ] }) });
}
function Oe({ d: r }) {
  const n = $e(r);
  if (!n)
    return /* @__PURE__ */ t("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated px-3 py-2 text-xs text-text-secondary", children: "图片数据缺失" });
  const l = [r.model, r.size].filter(Boolean).join(" · ");
  return /* @__PURE__ */ s("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated", children: [
    /* @__PURE__ */ s("header", { className: "flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2", children: [
      /* @__PURE__ */ t("div", { className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-400", children: /* @__PURE__ */ t("span", { className: "text-sm", children: "🖼️" }) }),
      /* @__PURE__ */ s("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ t("div", { className: "truncate text-sm font-medium text-text-primary", children: "Agnes 图片" }),
        l && /* @__PURE__ */ t("div", { className: "mt-0.5 truncate text-[11px] text-text-tertiary", children: l })
      ] }),
      /* @__PURE__ */ s("div", { className: "ml-auto flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ t(
          "a",
          {
            href: n,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "新窗口打开",
            children: /* @__PURE__ */ s("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ t("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
              /* @__PURE__ */ t("polyline", { points: "15 3 21 3 21 9" }),
              /* @__PURE__ */ t("line", { x1: "10", y1: "14", x2: "21", y2: "3" })
            ] })
          }
        ),
        /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            onClick: () => {
              const o = r.mimeType?.includes("jpeg") ? "jpg" : "png";
              se(n, `agnes-${Date.now()}.${o}`);
            },
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "下载",
            children: /* @__PURE__ */ s("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ t("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
              /* @__PURE__ */ t("polyline", { points: "7 10 12 15 17 10" }),
              /* @__PURE__ */ t("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
            ] })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ t("div", { className: "flex items-center justify-center bg-background-surface p-2", children: /* @__PURE__ */ t(
      "img",
      {
        src: n,
        alt: r.prompt || r.revisedPrompt || "Agnes 生成图片",
        className: "max-h-[420px] w-auto max-w-full rounded-md object-contain",
        loading: "lazy"
      }
    ) }),
    (r.prompt || r.revisedPrompt) && /* @__PURE__ */ t("div", { className: "border-t border-border px-3 py-2 text-[11px] leading-relaxed text-text-secondary", children: r.revisedPrompt || r.prompt })
  ] });
}
function Te({ d: r, onToggle: n, expanded: l }) {
  const i = r.status === "completed" && !!r.url, o = [r.model, r.seconds && `${r.seconds}s`, r.size].filter(Boolean).join(" · "), d = () => {
    r.url && se(r.url, `agnes-${r.videoId || Date.now()}.mp4`);
  };
  return /* @__PURE__ */ s("section", { className: "my-2 w-full overflow-hidden rounded-lg border border-border bg-background-elevated", children: [
    /* @__PURE__ */ s("header", { className: "flex min-w-0 items-center gap-2 border-b border-border bg-background-surface px-3 py-2", children: [
      /* @__PURE__ */ t("div", { className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-400", children: /* @__PURE__ */ t("span", { className: "text-sm", children: "🎬" }) }),
      /* @__PURE__ */ s("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ t("div", { className: "truncate text-sm font-medium text-text-primary", children: "Agnes 视频" }),
        o && /* @__PURE__ */ t("div", { className: "mt-0.5 truncate text-[11px] text-text-tertiary", children: o })
      ] }),
      i && /* @__PURE__ */ s("div", { className: "ml-auto flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ t(
          "a",
          {
            href: r.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "新窗口打开",
            children: /* @__PURE__ */ s("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ t("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
              /* @__PURE__ */ t("polyline", { points: "15 3 21 3 21 9" }),
              /* @__PURE__ */ t("line", { x1: "10", y1: "14", x2: "21", y2: "3" })
            ] })
          }
        ),
        /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            onClick: d,
            className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-background-hover hover:text-text-primary",
            title: "下载",
            children: /* @__PURE__ */ s("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ t("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
              /* @__PURE__ */ t("polyline", { points: "7 10 12 15 17 10" }),
              /* @__PURE__ */ t("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
            ] })
          }
        )
      ] })
    ] }),
    i ? /* @__PURE__ */ t("div", { className: "bg-black p-2", children: /* @__PURE__ */ t(
      "video",
      {
        src: r.url,
        controls: !0,
        className: "max-h-[460px] w-full rounded-md",
        preload: "metadata"
      }
    ) }) : /* @__PURE__ */ s("div", { className: "flex items-center gap-3 bg-background-surface px-3 py-6", children: [
      /* @__PURE__ */ t("span", { className: "h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" }),
      /* @__PURE__ */ s("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ t("div", { className: "text-sm text-text-primary", children: r.status === "failed" ? "视频生成失败" : "视频生成中..." }),
        /* @__PURE__ */ t("div", { className: "mt-0.5 truncate text-[11px] text-text-tertiary", children: r.error ? r.error : r.videoId ? `videoId: ${r.videoId}${typeof r.progress == "number" ? ` · 进度 ${r.progress}%` : ""}` : "等待任务创建" })
      ] })
    ] }),
    r.prompt && /* @__PURE__ */ s(
      "button",
      {
        type: "button",
        onClick: n,
        className: "flex w-full items-center gap-1 border-t border-border px-3 py-2 text-left text-[11px] leading-relaxed text-text-secondary hover:bg-background-hover",
        children: [
          /* @__PURE__ */ t("span", { className: "flex-1 truncate", children: l ? r.prompt : r.prompt.length > 90 ? `${r.prompt.slice(0, 90)}…` : r.prompt }),
          /* @__PURE__ */ t("span", { className: "shrink-0 text-text-tertiary", children: l ? "收起" : "展开" })
        ]
      }
    )
  ] });
}
function Ke(r) {
  return r && r.toolName ? /* @__PURE__ */ t(Ve, { ...r }) : /* @__PURE__ */ t(Re, { ...r });
}
export {
  Ke as default
};
