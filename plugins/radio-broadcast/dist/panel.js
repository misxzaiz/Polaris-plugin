// src/index.tsx
import { useEffect, useState } from "react";

// src/host.ts
function hostWindow() {
  return window;
}
function getHostInvoke() {
  const invoke = hostWindow().__POLARIS_HOST_INVOKE__;
  if (!invoke) {
    throw new Error("\u5BBF\u4E3B invoke \u4E0D\u53EF\u7528\uFF1A\u9700\u8981\u4E3B\u5E94\u7528\u63D0\u4F9B __POLARIS_HOST_INVOKE__");
  }
  return invoke;
}

// src/index.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function RadioBroadcastPanel() {
  const [bridge, setBridge] = useState("checking");
  useEffect(() => {
    let alive = true;
    try {
      void getHostInvoke()("health_check").then(() => {
        if (alive) setBridge("ok");
      }).catch(() => {
        if (alive) setBridge("unavailable");
      });
    } catch {
      if (alive) setBridge("unavailable");
    }
    return () => {
      alive = false;
    };
  }, []);
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("h2", { children: "AI \u8FDE\u7EED\u64AD\u62A5 \xB7 \u63D2\u4EF6\u9AA8\u67B6" }),
    /* @__PURE__ */ jsx("p", { children: "core-slimdown B2-1 \u6B65\u9AA4 1\uFF1A\u63D2\u4EF6\u4ED3\u9AA8\u67B6\u5DF2\u5C31\u7EEA\uFF0C\u9762\u677F\u4E0E\u63A7\u5236\u5668\u5C06\u5728\u6B65\u9AA4 2 \u8FC1\u5165\u3002" }),
    /* @__PURE__ */ jsxs("p", { children: [
      "\u5BBF\u4E3B\u6865\u72B6\u6001\uFF1A",
      bridge === "checking" ? "\u63A2\u6D4B\u4E2D" : bridge === "ok" ? "\u53EF\u7528" : "\u4E0D\u53EF\u7528"
    ] }),
    /* @__PURE__ */ jsx("p", { children: "\u5F53\u524D\u4E3A\u5360\u4F4D\u9762\u677F\uFF0C\u672A\u4E0A\u67B6\u4E14\u4E0D\u53EF\u7528\u4E8E\u751F\u4EA7\u3002" })
  ] });
}
export {
  RadioBroadcastPanel as default
};
