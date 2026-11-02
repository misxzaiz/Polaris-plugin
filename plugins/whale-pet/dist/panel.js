// src/Panel.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function getInvoke() {
  const w = window;
  if (!w.__POLARIS_HOST_INVOKE__) throw new Error("__POLARIS_HOST_INVOKE__ \u4E0D\u5B58\u5728\uFF08\u8BF7\u66F4\u65B0 Polaris \u4E3B\u5E94\u7528\uFF09");
  return w.__POLARIS_HOST_INVOKE__;
}
var FALLBACK_PORT = 9863;
var IDLE = ["\u5F85\u673A\u547C\u5438\u4F11\u95F2"];
var TURN = ["\u4E1C\u5F20\u897F\u671B"];
var CLICKS = [
  "\u70B9\u51FB\u56DE\u5E94-\u5F00\u5FC3\u8DC3\u52A8",
  "\u70B9\u51FB\u56DE\u5E94-\u5BB3\u7F9E\u60CA\u8BB6",
  "\u70B9\u51FB\u56DE\u5E94-\u50B2\u5A07\u751F\u6C14",
  "\u70B9\u51FB\u56DE\u5E94-\u6320\u75D2\u54AF\u54AF\u7B11",
  "\u70B9\u51FB\u56DE\u5E94-\u5143\u6C14\u6325\u624B"
];
var CATEGORIES = [
  { id: "\u5C0F\u52A8\u4F5C", weight: 20, actions: ["\u60A0\u95F2\u54FC\u6B4C", "\u8D85\u5927\u4F38\u61D2\u8170", "\u539F\u5730\u6572\u51FB\u684C\u9762\u4E92\u52A8", "\u539F\u5730\u91CD\u529B\u4E0B\u8E72\u538B\u7F29", "\u54C8\u6B20\u8FDE\u5929", "\u539F\u5730\u5C0F\u61A9\u6C89\u7720", "\u5973\u4EC6\u5C48\u819D\u793C\u4EEA", "\u88AB\u5413\u4E00\u8DF3", "\u5C0F\u5E45\u5EA6\u539F\u5730360\u5EA6\u65CB\u8F6C\u5C55\u793A", "\u5077\u5403\u96F6\u98DF\u88AB\u6293\u4F4F", "\u7528\u9CB8\u9C7C\u5C3E\u5DF4\u62CD\u6253\u5730\u9762", "\u6253\u778C\u7761\u88AB\u60CA\u9192", "\u7167\u955C\u5B50", "\u6574\u4F53\u6362\u88C5\u8BD5\u8272", "\u8F7B\u5FEB\u8BB0\u5F55", "\u5199\u4EE3\u7801", "\u6447\u6247\u7EB3\u51C9", "\u6668\u95F4\u5237\u7259"] },
  { id: "\u73A9\u800D", weight: 20, actions: ["\u539F\u5730\u4E13\u5FC3\u73A9\u9B54\u65B9", "\u539F\u5730\u8E72\u4E0B\u73A9\u73A9\u5177\u6C7D\u8F66", "\u9CB8\u9C7C\u5410\u6CE1\u6CE1\u7279\u6548", "\u539F\u5730\u8DF3\u8DC3\u6293\u788E\u5934\u9876\u7269\u54C1", "\u73A9\u6E38\u620F\u6C14\u6025\u8D25\u574F", "\u73A9\u6C34\u67AA", "\u5C0F\u63D0\u7434\u6F14\u594F", "\u84DD\u9CB8\u73B0\u4E16", "\u4F18\u96C5\u5973\u4EC6\u821E", "\u8F7B\u5FEB\u6447\u6446\u821E", "\u53EF\u7231\u5B85\u821E", "\u5439\u6C14\u7403", "\u52A8\u7269\u73AF\u7ED5", "\u653E\u98CE\u7B5D", "\u62C6\u793C\u7269", "\u53D8\u9E3D\u5B50", "\u6251\u514B\u9B54\u672F", "\u62BD\u9640\u87BA", "\u5439\u7B1B\u5B50", "\u8774\u8776\u871C\u8702\u73AF\u7ED5\u5934\u9876\u5F00\u82B1", "\u64B8\u732B", "\u51ED\u7A7A\u751F\u82B1", "\u9A91\u6728\u9A6C", "\u4E09\u7403\u629B\u63A5", "\u8E22\u6BFD\u5B50", "\u4E0B\u4E94\u5B50\u68CB", "\u8361\u79CB\u5343"] },
  { id: "\u5403\u4EC0\u4E48", weight: 16, actions: ["\u5403\u767D\u996D", "\u5927\u53E3\u5403\u96F6\u98DF", "\u5403Token", "\u5403\u65E9\u9910", "\u5403\u5348\u9910", "\u5403\u665A\u9910", "\u5403\u51B0\u6DC7\u6DCB\u878D\u5316", "\u5403\u5927\u95F8\u87F9", "\u5403\u7CD6\u846B\u82A6", "\u5403\u957F\u5BFF\u9762", "\u5403\u897F\u74DC", "\u6DAE\u706B\u9505"] },
  { id: "\u65F6\u8282", weight: 14, actions: ["\u88AB\u843D\u53F6\u6DF9\u6CA1", "\u4E2D\u79CB\u8D4F\u6708\u5403\u6708\u997C", "\u5806\u96EA\u4EBA", "\u653E\u70DF\u82B1", "\u5403\u7CBD\u5B50", "\u5403\u5E74\u7CD5", "\u5403\u9752\u56E2", "\u5403\u814A\u516B\u7CA5", "\u5403\u91CD\u9633\u7CD5", "\u6536\u7EA2\u5305", "\u5199\u798F\u5B57", "\u7A7F\u9488\u4E5E\u5DE7", "\u821E\u72EE\u5934", "\u8BA8\u7CD6\u5357\u74DC\u706F", "\u63D2\u8331\u8438\u8D4F\u83CA", "\u653E\u6CB3\u706F", "\u840C\u5316\u5C0F\u5E7D\u7075", "\u88C5\u70B9\u5723\u8BDE\u6811", "\u653E\u5B54\u660E\u706F", "\u5403\u6C64\u5706", "\u5403\u997A\u5B50"] },
  { id: "\u6587\u5B57", weight: 10, actions: ["\u662F\u554A\uFF0C\u5403\u4EC0\u4E48", "\u6DF1\u5EA6\u601D\u8003\u788E\u788E\u5FF5"] }
];
var IDLE_WEIGHT = 10;
var TURN_WEIGHT = 5;
var MOVE_WEIGHT = 5;
function pick(arr, avoid) {
  if (arr.length === 1) return arr[0];
  const filtered = avoid ? arr.filter((x) => x !== avoid) : arr;
  const pool = filtered.length ? filtered : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}
function rollNext(current) {
  const totalCat = CATEGORIES.reduce((s, c) => s + c.weight, 0);
  const r = Math.random() * 100;
  let acc = 0;
  if (r < (acc += IDLE_WEIGHT)) return { anim: pick(IDLE, current), once: false };
  if (r < (acc += TURN_WEIGHT)) return { anim: pick(TURN, current), once: false };
  if (r < (acc += MOVE_WEIGHT)) return { anim: pick(CATEGORIES[1].actions, current), once: true };
  const catR = Math.random() * totalCat;
  let cAcc = 0;
  for (const c of CATEGORIES) {
    cAcc += c.weight;
    if (catR < cAcc) return { anim: pick(c.actions, current), once: true };
  }
  return { anim: pick(IDLE, current), once: false };
}
async function resolvePort(invoke) {
  let port = FALLBACK_PORT;
  try {
    const res = await invoke("plugin_service_list", {});
    const wrapped = res;
    const services = wrapped?.result?.services ?? wrapped?.services ?? [];
    const svc = services.find((s) => s.pluginId === "whale-pet" && s.serviceId === "whale-pet-assets" && s.port);
    if (svc?.port) port = svc.port;
  } catch {
  }
  return port;
}
function b64ToBlobUrl(b64, contentType) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType || "video/webm" });
  return URL.createObjectURL(blob);
}
async function loadAsset(base, channel, anim, ext, contentType, cache) {
  if (channel === "direct") return `${base}/asset/webm/${encodeURIComponent(anim)}${ext}`;
  const key = `${anim}${ext}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await capHttpFetch("GET", `${base}/asset/webm/${encodeURIComponent(anim)}${ext}`, 6e4);
  if (r.status !== 200) throw new Error(`\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25 HTTP ${r.status}: ${anim}`);
  if (!r.isBase64) throw new Error(`cap.http \u54CD\u5E94\u975E base64\uFF08${r.contentType || "\u672A\u77E5"}\uFF09: ${anim}`);
  const url = b64ToBlobUrl(r.body, r.contentType || contentType);
  cache.set(key, url);
  return url;
}
async function capHttpFetch(method, url, timeoutMs = 6e4) {
  const res = await getInvoke()(
    "router_dispatch",
    { req: { target: "cap.http", payload: { action: "request", method, url, timeoutMs } } }
  );
  if (!res || !res.ok) throw new Error(res && res.error || "cap.http \u8F6C\u53D1\u5931\u8D25");
  const r = res.result || {};
  return {
    status: Number(r.status) || 0,
    body: String(r.body ?? ""),
    isBase64: !!r.isBase64,
    contentType: String(r.contentType || "")
  };
}
async function probeHealth(port) {
  for (const base of [`http://localhost:${port}`, `http://127.0.0.1:${port}`]) {
    const ok = await fetch(`${base}/__health`).then((r) => r.json()).then((j) => !!j?.ok).catch(() => false);
    if (ok) return { channel: "direct", base };
  }
  const viaBase = `http://127.0.0.1:${port}`;
  try {
    const r = await capHttpFetch("GET", `${viaBase}/__health`, 8e3);
    if (r.status === 200) return { channel: "viaCap", base: viaBase };
  } catch {
  }
  return null;
}
var EXT_MIME = {
  ".webm": "video/webm",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".ttf": "font/ttf"
};
function WhalePetPanel(props) {
  const videoRef = useRef(null);
  const [state, setState] = useState({ pokes: 0 });
  const [phase, setPhase] = useState("init");
  const [errMsg, setErrMsg] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const currentAnimRef = useRef(IDLE[0]);
  const channelRef = useRef("direct");
  const baseRef = useRef(null);
  const onPokeRef = useRef(() => {
  });
  const blobCacheRef = useRef(/* @__PURE__ */ new Map());
  const switchTo = useCallback(async (anim, once) => {
    const base = baseRef.current;
    if (!base) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      const url = await loadAsset(base, channelRef.current, anim, ".webm", EXT_MIME[".webm"], blobCacheRef.current);
      v.src = url;
      v.loop = !once;
      currentAnimRef.current = anim;
      await v.play();
    } catch (e) {
    }
  }, []);
  const handleEnded = useCallback(() => {
    const next = rollNext(currentAnimRef.current);
    void switchTo(next.anim, next.once);
  }, [switchTo]);
  const handleClick = useCallback(() => {
    onPokeRef.current();
    void switchTo(pick(CLICKS), true);
  }, [switchTo]);
  useEffect(() => {
    onPokeRef.current = () => setState((s) => ({ pokes: s.pokes + 1 }));
  }, []);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const invoke = getInvoke();
        const port = await resolvePort(invoke);
        if (!alive) return;
        let working = null;
        for (let i = 0; i < 8 && !working; i++) {
          if (!alive) return;
          working = await probeHealth(port);
          if (!working && alive) setErrMsg(`\u8D44\u6E90\u670D\u52A1\u542F\u52A8\u4E2D\u2026\uFF08\u7B2C ${i + 1} \u8F6E\u63A2\u6D4B\uFF09`);
          if (!working) await new Promise((r) => setTimeout(r, 1500));
        }
        if (!alive) return;
        if (!working) {
          setPhase("error");
          setErrMsg(`\u8D44\u6E90\u670D\u52A1\u672A\u5C31\u7EEA\uFF08localhost:${port}\uFF09\u3002\u53EF\u70B9\u51FB\u6B64\u63D0\u793A\u91CD\u8BD5\uFF1B\u82E5\u53CD\u590D\u5931\u8D25\u8BF7\u91CD\u542F\u5E94\u7528\u3002`);
          return;
        }
        baseRef.current = working.base;
        channelRef.current = working.channel;
        setPhase("ready");
        const v = videoRef.current;
        if (v) {
          const url = await loadAsset(working.base, working.channel, IDLE[0], ".webm", EXT_MIME[".webm"], blobCacheRef.current);
          v.src = url;
          v.loop = true;
          currentAnimRef.current = IDLE[0];
          setVideoSrc(url);
          void v.play().catch(() => {
          });
        }
      } catch (e) {
        if (alive) {
          setPhase("error");
          setErrMsg(String(e instanceof Error ? e.message : e).slice(0, 120));
        }
      }
    })();
    return () => {
      alive = false;
      blobCacheRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
        }
      });
      blobCacheRef.current.clear();
    };
  }, [retryTick]);
  return /* @__PURE__ */ jsxs("div", { style: { font: '13px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', color: "#d7dde6", background: "#0a1428", minHeight: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexWrap: "wrap" }, children: [
      /* @__PURE__ */ jsxs("span", { style: { fontSize: 15, fontWeight: 700, color: "#e6edf3" }, children: [
        "ds",
        /* @__PURE__ */ jsx("span", { style: { color: "#3b82f6" }, children: "\u5927\u80A5\u9C7C" })
      ] }),
      /* @__PURE__ */ jsx("span", { style: { fontSize: 10, color: "#3b82f6", border: "1px solid #3b82f6", borderRadius: 6, padding: "1px 6px" }, children: "v0.3.2" }),
      /* @__PURE__ */ jsxs("span", { style: { color: "#7d8590", fontSize: 11, marginLeft: "auto" }, children: [
        "\u5DF2\u966A\u4F34 ",
        state.pokes,
        " \u6B21"
      ] })
    ] }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        onClick: handleClick,
        style: { flex: 1, position: "relative", minHeight: 260, borderTop: "1px solid #1f2630", borderBottom: "1px solid #1f2630", overflow: "hidden", cursor: "pointer", background: "linear-gradient(#0b1f3a, #0a1428)" },
        children: [
          /* @__PURE__ */ jsx(
            "video",
            {
              ref: videoRef,
              loop: true,
              muted: true,
              playsInline: true,
              onEnded: handleEnded,
              style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: videoSrc ? "block" : "none" }
            }
          ),
          phase === "init" && /* @__PURE__ */ jsx("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7d8590", fontSize: 12 }, children: "\u9CB8\u9C7C\u6B63\u5728\u6E38\u8FC7\u6765\u2026" }),
          phase === "error" && errMsg && /* @__PURE__ */ jsx(
            "div",
            {
              onClick: () => {
                setPhase("init");
                setErrMsg(null);
                setRetryTick((t) => t + 1);
              },
              style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f0883e", fontSize: 12, padding: 20, textAlign: "center", cursor: "pointer" },
              title: "\u70B9\u51FB\u91CD\u8BD5",
              children: errMsg
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { style: { padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "#7d8590", flexWrap: "wrap" }, children: /* @__PURE__ */ jsxs("span", { children: [
      "\u70B9\u51FB\u9CB8\u9C7C ",
      /* @__PURE__ */ jsx("span", { style: { color: "#3b82f6", fontWeight: 600 }, children: state.pokes }),
      " \u6B21 \xB7 \u5B83\u4F1A\u56DE\u5E94\u4F60"
    ] }) })
  ] });
}

// src/index.tsx
var index_default = WhalePetPanel;
export {
  index_default as default
};
