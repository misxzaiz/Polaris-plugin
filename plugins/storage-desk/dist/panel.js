// src/i18nShim.ts
function hostI18n() {
  return globalThis.__POLARIS_APP_CORE__?.i18n;
}
function useTranslation(...namespaces) {
  const inst = hostI18n();
  const ns = Array.isArray(namespaces) && namespaces.length > 0 ? namespaces[0] : void 0;
  if (!inst) {
    return { t: (key, opts) => key, i18n: void 0 };
  }
  return {
    t: (key, opts) => inst.t(key, { ns, ...typeof opts === "object" && opts ? opts : {} }),
    i18n: inst
  };
}

// src/DataStorageCard.tsx
import { useEffect as useEffect2, useMemo, useState as useState2 } from "react";

// src/transport.ts
function invoke(cmd, args) {
  const fn = globalThis.__POLARIS_HOST_INVOKE__;
  if (typeof fn !== "function") throw new Error("\u5BBF\u4E3B\u901A\u9053\u4E0D\u53EF\u7528\uFF1A\u8BF7\u66F4\u65B0 Polaris\u3002");
  return fn(cmd, args);
}

// src/logger.ts
function createLogger(scope) {
  const fmt = (msg) => `[${scope}] ${msg}`;
  return {
    debug: (msg, ...rest) => {
      if (import.meta.env?.DEV) console.debug(fmt(msg), ...rest);
    },
    info: (msg, ...rest) => console.info(fmt(msg), ...rest),
    warn: (msg, ...rest) => console.warn(fmt(msg), ...rest),
    error: (msg, ...rest) => console.error(fmt(msg), ...rest)
  };
}

// src/dataRootService.ts
var log = createLogger("DataRootService");
async function dispatchDataRoot(action, payload) {
  const res = await invoke("router_dispatch", {
    req: {
      target: "cap.data_root",
      payload: {
        action,
        ...payload
      }
    }
  });
  if (!res.ok) {
    throw new Error(res.error || `cap.data_root ${action} \u5931\u8D25`);
  }
  return res.result || {};
}
async function getDataRootInfo() {
  try {
    const res = await dispatchDataRoot("get_info", {});
    return res;
  } catch (e) {
    log.warn("cap.data_root get_info \u5931\u8D25", { error: String(e) });
    throw e;
  }
}
async function scanLegacyData() {
  try {
    const res = await dispatchDataRoot("scan_legacy", {});
    return res;
  } catch (e) {
    log.warn("cap.data_root scan_legacy \u5931\u8D25", { error: String(e) });
    throw e;
  }
}
async function openPathInExplorer(path) {
  await invoke("open_path_in_explorer", { path });
}
async function migrateLegacyData(sources, overwrite = false) {
  try {
    const res = await dispatchDataRoot("migrate", {
      options: { sources, overwrite }
    });
    return res;
  } catch (e) {
    log.warn("cap.data_root migrate \u5931\u8D25", { error: String(e) });
    throw e;
  }
}
async function validateDataRootTarget(options) {
  try {
    const res = await dispatchDataRoot("validate_target", { options });
    return res;
  } catch (e) {
    log.warn("cap.data_root validate_target \u5931\u8D25", { error: String(e) });
    throw e;
  }
}
async function setDataRoot(options) {
  try {
    const res = await dispatchDataRoot("set_root", { options });
    return res;
  } catch (e) {
    log.warn("cap.data_root set_root \u5931\u8D25", { error: String(e) });
    throw e;
  }
}
function formatBytes(bytes) {
  if (bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

// src/deps.ts
function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
function isWeb() {
  return !isTauri();
}
function core() {
  const c = globalThis.__POLARIS_APP_CORE__;
  if (!c?.stores) throw new Error("\u5BBF\u4E3B App Core \u672A\u6302\u8F7D\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  return c;
}
function forwardStore(name) {
  const fn = (...args) => {
    const hook = core().stores[name];
    if (typeof hook !== "function") throw new Error(`\u5BBF\u4E3B ${name} \u4E0D\u53EF\u7528`);
    return hook(...args);
  };
  return new Proxy(fn, {
    get: (_t, prop) => {
      const hook = core().stores[name];
      const v = hook[prop];
      return typeof v === "function" ? v.bind(hook) : v;
    }
  });
}
var useHistoryPrefsStore = forwardStore("useHistoryPrefsStore");
function opfsHelpers() {
  const h = core().services.opfsHelpers;
  if (!h) throw new Error("\u5BBF\u4E3B opfsHelpers \u4E0D\u53EF\u7528\uFF1A\u8BF7\u628A Polaris \u66F4\u65B0\u5230\u8F83\u65B0\u7248\u672C\u540E\u518D\u6253\u5F00\u672C\u63D2\u4EF6\u3002");
  return h;
}
var isOpfsMigrated = () => opfsHelpers().isOpfsMigrated();
var probeOpfsDialogCount = () => opfsHelpers().probeOpfsDialogCount();
var migrateOpfsToTauri = (...args) => opfsHelpers().migrateOpfsToTauri(...args);
var clearOpfsDialogs = (...args) => opfsHelpers().clearOpfsDialogs(...args);

// src/ChangeDataRootWizard.tsx
import { useEffect, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var log2 = createLogger("ChangeDataRootWizard");
function ChangeDataRootWizard({ current, onClose, onChanged }) {
  const { t } = useTranslation("settings");
  const [step, setStep] = useState("select");
  const [targetPath, setTargetPath] = useState("");
  const [resetToDefault, setResetToDefault] = useState(false);
  const [mode, setMode] = useState("move_data");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const [report, setReport] = useState(null);
  const [restarting, setRestarting] = useState(false);
  async function handleBrowse() {
    if (!isTauri()) {
      window.alert(t("dataStorage.wizard.tauriOnly", "\u6539\u8DEF\u5F84\u4EC5\u5728\u684C\u9762\u7AEF\u53EF\u7528"));
      return;
    }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        directory: true,
        multiple: false,
        title: t("dataStorage.wizard.pickTitle", "\u9009\u62E9\u65B0\u7684\u6570\u636E\u5B58\u50A8\u4F4D\u7F6E")
      });
      if (typeof picked === "string" && picked.length > 0) {
        setTargetPath(picked);
        setResetToDefault(false);
      }
    } catch (e) {
      log2.warn("\u9009\u62E9\u76EE\u5F55\u5931\u8D25", { error: String(e) });
    }
  }
  async function handleNext() {
    setValidating(true);
    setValidation(null);
    try {
      const v = await validateDataRootTarget({
        newPath: resetToDefault ? null : targetPath,
        mode
      });
      setValidation(v);
      if (v.ok) {
        setStep("confirm");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setValidation({
        ok: false,
        errors: [msg],
        warnings: [],
        resolvedPath: targetPath,
        currentSizeBytes: 0
      });
    } finally {
      setValidating(false);
    }
  }
  async function handleConfirm() {
    setStep("progress");
    setApplyError(null);
    try {
      const r = await setDataRoot({
        newPath: resetToDefault ? null : targetPath,
        mode
      });
      setReport(r);
      setStep("done");
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setApplyError(msg);
      setStep("error");
    }
  }
  async function handleRestart() {
    setRestarting(true);
    try {
      if (isTauri()) {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } else {
        window.location.reload();
      }
    } catch (e) {
      log2.error("\u91CD\u542F\u5931\u8D25", e instanceof Error ? e : new Error(String(e)));
      setRestarting(false);
    }
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && step !== "progress") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);
  const canProceed = (resetToDefault || targetPath.trim().length > 0) && !validating;
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal",
      onClick: (e) => {
        if (e.target === e.currentTarget && step !== "progress") onClose();
      },
      children: /* @__PURE__ */ jsxs("div", { className: "w-[560px] max-w-[92vw] bg-surface border border-border rounded-lg shadow-2xl", children: [
        /* @__PURE__ */ jsxs("div", { className: "px-5 py-3 border-b border-border flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("h3", { className: "text-sm font-medium text-text-primary", children: t("dataStorage.wizard.title", "\u66F4\u6539\u6570\u636E\u5B58\u50A8\u4F4D\u7F6E") }),
          step !== "progress" && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "text-text-tertiary hover:text-text-primary text-xs",
              children: "\u2715"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "px-5 py-4 space-y-4", children: [
          step === "select" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-secondary", children: t("dataStorage.wizard.currentLabel", "\u5F53\u524D\u4F4D\u7F6E") }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-primary font-mono break-all", children: current.root }),
            /* @__PURE__ */ jsxs("div", { className: "border-t border-border pt-3 space-y-3", children: [
              /* @__PURE__ */ jsx("div", { className: "text-xs text-text-secondary", children: t("dataStorage.wizard.targetLabel", "\u65B0\u4F4D\u7F6E") }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: resetToDefault ? "" : targetPath,
                    onChange: (e) => {
                      setTargetPath(e.target.value);
                      setResetToDefault(false);
                    },
                    placeholder: t(
                      "dataStorage.wizard.targetPlaceholder",
                      "\u70B9\u51FB\u53F3\u4FA7\u6D4F\u89C8\u9009\u62E9\u76EE\u5F55"
                    ),
                    disabled: resetToDefault,
                    className: "flex-1 px-3 py-1.5 bg-background-surface border border-border rounded text-sm text-text-primary font-mono disabled:opacity-50"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: handleBrowse,
                    disabled: resetToDefault,
                    className: "text-xs px-3 py-1.5 bg-background-surface border border-border rounded hover:text-text-primary text-text-secondary disabled:opacity-50",
                    children: t("dataStorage.wizard.browse", "\u6D4F\u89C8\u2026")
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2 text-xs text-text-secondary cursor-pointer", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: resetToDefault,
                    onChange: (e) => {
                      setResetToDefault(e.target.checked);
                      if (e.target.checked) setTargetPath("");
                    },
                    className: "w-3.5 h-3.5"
                  }
                ),
                t("dataStorage.wizard.resetDefault", "\u6062\u590D\u9ED8\u8BA4\u4F4D\u7F6E")
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "border-t border-border pt-3 space-y-2", children: [
              /* @__PURE__ */ jsx("div", { className: "text-xs text-text-secondary", children: t("dataStorage.wizard.modeLabel", "\u5904\u7406\u65B9\u5F0F") }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-start gap-2 text-xs cursor-pointer p-2 rounded hover:bg-background-surface", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "radio",
                    name: "mode",
                    checked: mode === "move_data",
                    onChange: () => setMode("move_data"),
                    className: "mt-0.5"
                  }
                ),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("div", { className: "text-text-primary", children: t("dataStorage.wizard.modeMove", "\u540C\u65F6\u79FB\u52A8\u6570\u636E\uFF08\u63A8\u8350\uFF09") }),
                  /* @__PURE__ */ jsx("div", { className: "text-text-tertiary mt-0.5", children: t(
                    "dataStorage.wizard.modeMoveHint",
                    "\u5C06\u73B0\u6709\u6570\u636E\u590D\u5236\u5230\u65B0\u4F4D\u7F6E\uFF0C\u65E7\u4F4D\u7F6E\u6570\u636E\u4FDD\u7559\u4EE5\u4FBF\u56DE\u6EDA\u3002"
                  ) })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-start gap-2 text-xs cursor-pointer p-2 rounded hover:bg-background-surface", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "radio",
                    name: "mode",
                    checked: mode === "switch_only",
                    onChange: () => setMode("switch_only"),
                    className: "mt-0.5"
                  }
                ),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("div", { className: "text-text-primary", children: t("dataStorage.wizard.modeSwitch", "\u4EC5\u5207\u6362\u4F4D\u7F6E") }),
                  /* @__PURE__ */ jsx("div", { className: "text-text-tertiary mt-0.5", children: t(
                    "dataStorage.wizard.modeSwitchHint",
                    "\u53EA\u66F4\u6539\u8BBE\u7F6E\uFF0C\u65E7\u4F4D\u7F6E\u6570\u636E\u539F\u5730\u4FDD\u7559\uFF0C\u65B0\u4F4D\u7F6E\u4ECE\u96F6\u5F00\u59CB\u3002"
                  ) })
                ] })
              ] })
            ] }),
            validation && !validation.ok && /* @__PURE__ */ jsx("div", { className: "p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-500 space-y-1", children: validation.errors.map((e, i) => /* @__PURE__ */ jsx("div", { children: e }, i)) })
          ] }),
          step === "confirm" && validation && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-secondary", children: t("dataStorage.wizard.confirmTitle", "\u786E\u8BA4\u5207\u6362") }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-2 text-xs", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("span", { className: "text-text-tertiary", children: [
                  t("dataStorage.wizard.from", "\u4ECE"),
                  ": "
                ] }),
                /* @__PURE__ */ jsx("span", { className: "font-mono", children: current.root })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("span", { className: "text-text-tertiary", children: [
                  t("dataStorage.wizard.to", "\u5230"),
                  ": "
                ] }),
                /* @__PURE__ */ jsx("span", { className: "font-mono", children: validation.resolvedPath })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("span", { className: "text-text-tertiary", children: [
                  t("dataStorage.wizard.mode", "\u65B9\u5F0F"),
                  ": "
                ] }),
                /* @__PURE__ */ jsx("span", { className: "text-text-primary", children: mode === "move_data" ? t("dataStorage.wizard.modeMove", "\u540C\u65F6\u79FB\u52A8\u6570\u636E\uFF08\u63A8\u8350\uFF09") : t("dataStorage.wizard.modeSwitch", "\u4EC5\u5207\u6362\u4F4D\u7F6E") })
              ] }),
              mode === "move_data" && /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsxs("span", { className: "text-text-tertiary", children: [
                  t("dataStorage.wizard.dataSize", "\u6570\u636E\u91CF"),
                  ": "
                ] }),
                /* @__PURE__ */ jsx("span", { children: formatBytes(validation.currentSizeBytes) })
              ] })
            ] }),
            validation.warnings.length > 0 && /* @__PURE__ */ jsx("div", { className: "p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-500 space-y-1", children: validation.warnings.map((w, i) => /* @__PURE__ */ jsxs("div", { children: [
              "\u26A0 ",
              w
            ] }, i)) }),
            /* @__PURE__ */ jsx("div", { className: "text-[11px] text-text-tertiary", children: t(
              "dataStorage.wizard.restartHint",
              "\u5207\u6362\u6210\u529F\u540E\u9700\u8981\u91CD\u542F\u5E94\u7528\u3002\u951A\u70B9\u5728\u6240\u6709\u5148\u51B3\u6761\u4EF6\u6210\u529F\u540E\u624D\u66F4\u65B0\uFF1B\u4E2D\u9014\u5931\u8D25\u53EF\u653E\u5FC3\u91CD\u8BD5\u3002"
            ) })
          ] }),
          step === "progress" && /* @__PURE__ */ jsxs("div", { className: "text-center py-8", children: [
            /* @__PURE__ */ jsx("div", { className: "inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" }),
            /* @__PURE__ */ jsx("div", { className: "text-sm text-text-primary", children: t("dataStorage.wizard.processing", "\u6B63\u5728\u5207\u6362\u6570\u636E\u6839\uFF0C\u8BF7\u7A0D\u5019\u2026") }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-tertiary mt-1", children: t("dataStorage.wizard.dontClose", "\u8BF7\u52FF\u5173\u95ED\u5E94\u7528") })
          ] }),
          step === "done" && report && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: "text-sm text-emerald-500", children: [
              "\u2713 ",
              t("dataStorage.wizard.success", "\u5207\u6362\u6210\u529F")
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "text-xs space-y-1 font-mono", children: [
              /* @__PURE__ */ jsxs("div", { children: [
                t("dataStorage.wizard.from", "\u4ECE"),
                ": ",
                report.oldRoot
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                t("dataStorage.wizard.to", "\u5230"),
                ": ",
                report.newRoot
              ] })
            ] }),
            report.moveReport && /* @__PURE__ */ jsxs("div", { className: "text-xs text-text-secondary", children: [
              t("dataStorage.report.copied", "\u5DF2\u590D\u5236"),
              ": ",
              report.moveReport.successCount,
              report.moveReport.skippedCount > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
                " \xB7 ",
                t("dataStorage.report.skipped", "\u8DF3\u8FC7"),
                ": ",
                report.moveReport.skippedCount
              ] }),
              report.moveReport.conflictCount > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
                " \xB7 ",
                t("dataStorage.report.conflict", "\u51B2\u7A81"),
                ": ",
                report.moveReport.conflictCount
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "text-xs text-text-tertiary", children: t(
              "dataStorage.wizard.restartNow",
              "\u9700\u8981\u91CD\u542F\u5E94\u7528\u8BA9\u65B0\u4F4D\u7F6E\u751F\u6548\u3002\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u7ACB\u5373\u91CD\u542F\u3002"
            ) })
          ] }),
          step === "error" && /* @__PURE__ */ jsxs("div", { className: "p-3 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-500", children: [
            /* @__PURE__ */ jsx("div", { className: "font-medium mb-1", children: t("dataStorage.wizard.errorTitle", "\u5207\u6362\u5931\u8D25") }),
            /* @__PURE__ */ jsx("div", { children: applyError })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "px-5 py-3 border-t border-border flex items-center justify-end gap-2", children: [
          step === "select" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "text-xs px-3 py-1.5 text-text-secondary hover:text-text-primary",
                children: t("common.cancel", "\u53D6\u6D88")
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: handleNext,
                disabled: !canProceed,
                className: "text-xs px-3 py-1.5 bg-primary text-on-primary rounded disabled:opacity-50",
                children: validating ? t("dataStorage.wizard.validating", "\u6821\u9A8C\u4E2D\u2026") : t("common.next", "\u4E0B\u4E00\u6B65")
              }
            )
          ] }),
          step === "confirm" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setStep("select"),
                className: "text-xs px-3 py-1.5 text-text-secondary hover:text-text-primary",
                children: t("common.back", "\u4E0A\u4E00\u6B65")
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: handleConfirm,
                className: "text-xs px-3 py-1.5 bg-primary text-on-primary rounded",
                children: t("dataStorage.wizard.confirm", "\u5F00\u59CB\u5207\u6362")
              }
            )
          ] }),
          step === "done" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "text-xs px-3 py-1.5 text-text-secondary hover:text-text-primary",
                children: t("dataStorage.wizard.restartLater", "\u7A0D\u540E\u91CD\u542F")
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: handleRestart,
                disabled: restarting,
                className: "text-xs px-3 py-1.5 bg-primary text-on-primary rounded disabled:opacity-50",
                children: restarting ? t("dataStorage.wizard.restarting", "\u91CD\u542F\u4E2D\u2026") : t("dataStorage.wizard.restartNowBtn", "\u7ACB\u5373\u91CD\u542F")
              }
            )
          ] }),
          step === "error" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "text-xs px-3 py-1.5 text-text-secondary hover:text-text-primary",
                children: t("common.close", "\u5173\u95ED")
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setStep("select"),
                className: "text-xs px-3 py-1.5 bg-primary text-on-primary rounded",
                children: t("common.retry", "\u91CD\u8BD5")
              }
            )
          ] })
        ] })
      ] })
    }
  );
}

// node_modules/zustand/esm/vanilla.mjs
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/react.mjs
import React from "react";
var identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    () => selector(api.getInitialState())
  );
  React.useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// node_modules/zustand/esm/middleware.mjs
function createJSONStorage(getStorage, options) {
  let storage;
  try {
    storage = getStorage();
  } catch (e) {
    return;
  }
  const persistStorage = {
    getItem: (name) => {
      var _a;
      const parse = (str2) => {
        if (str2 === null) {
          return null;
        }
        return JSON.parse(str2, options == null ? void 0 : options.reviver);
      };
      const str = (_a = storage.getItem(name)) != null ? _a : null;
      if (isPromiseLike(str)) {
        return str.then(parse);
      }
      return parse(str);
    },
    setItem: (name, newValue) => storage.setItem(name, JSON.stringify(newValue, options == null ? void 0 : options.replacer)),
    removeItem: (name) => storage.removeItem(name)
  };
  return persistStorage;
}
var isPromiseLike = (value) => typeof (value == null ? void 0 : value.then) === "function";
var toSyncThenable = (value) => ({
  then(onFulfilled) {
    return onFulfilled ? toThenable(onFulfilled)(value) : this;
  }
});
var toThenable = (fn) => (input) => {
  try {
    const result = fn(input);
    return isPromiseLike(result) ? result : toSyncThenable(result);
  } catch (error) {
    return {
      then(_onFulfilled, onRejected) {
        return onRejected ? toThenable(onRejected)(error) : this;
      }
    };
  }
};
var persistImpl = (config, baseOptions) => (set, get, api) => {
  let options = {
    storage: createJSONStorage(() => window.localStorage),
    partialize: (state) => state,
    version: 0,
    merge: (persistedState, currentState) => ({
      ...currentState,
      ...persistedState
    }),
    ...baseOptions
  };
  let hasHydrated = false;
  let hydrationVersion = 0;
  const hydrationListeners = /* @__PURE__ */ new Set();
  const finishHydrationListeners = /* @__PURE__ */ new Set();
  let storage = options.storage;
  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        );
        set(...args);
      },
      get,
      api
    );
  }
  const setItem = () => {
    const state = options.partialize({ ...get() });
    return storage.setItem(options.name, {
      state,
      version: options.version
    });
  };
  const savedSetState = api.setState;
  api.setState = (...args) => {
    savedSetState(...args);
    return setItem();
  };
  const configResult = config(
    (...args) => {
      set(...args);
      return setItem();
    },
    get,
    api
  );
  api.getInitialState = () => configResult;
  let stateFromStorage;
  const hydrate = () => {
    var _a, _b;
    if (!storage) return;
    const currentVersion = ++hydrationVersion;
    hasHydrated = false;
    hydrationListeners.forEach((cb) => {
      var _a2;
      return cb((_a2 = get()) != null ? _a2 : configResult);
    });
    const postRehydrationCallback = ((_b = options.onRehydrateStorage) == null ? void 0 : _b.call(options, (_a = get()) != null ? _a : configResult)) || void 0;
    return toThenable(storage.getItem.bind(storage))(options.name).then((deserializedStorageValue) => {
      if (deserializedStorageValue) {
        if (typeof deserializedStorageValue.version === "number" && deserializedStorageValue.version !== options.version) {
          if (options.migrate) {
            const migration = options.migrate(
              deserializedStorageValue.state,
              deserializedStorageValue.version
            );
            if (isPromiseLike(migration)) {
              return migration.then((result) => [true, result]);
            }
            return [true, migration];
          }
          console.error(
            `State loaded from storage couldn't be migrated since no migrate function was provided`
          );
        } else {
          return [false, deserializedStorageValue.state];
        }
      }
      return [false, void 0];
    }).then((migrationResult) => {
      var _a2;
      if (currentVersion !== hydrationVersion) {
        return;
      }
      const [migrated, migratedState] = migrationResult;
      stateFromStorage = options.merge(
        migratedState,
        (_a2 = get()) != null ? _a2 : configResult
      );
      set(stateFromStorage, true);
      if (migrated) {
        return setItem();
      }
    }).then(() => {
      if (currentVersion !== hydrationVersion) {
        return;
      }
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(get(), void 0);
      stateFromStorage = get();
      hasHydrated = true;
      finishHydrationListeners.forEach((cb) => cb(stateFromStorage));
    }).then(
      () => void 0,
      (e) => {
        if (currentVersion !== hydrationVersion) {
          return;
        }
        postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
      }
    );
  };
  api.persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions
      };
      if (newOptions.storage) {
        storage = newOptions.storage;
      }
    },
    clearStorage: () => {
      ++hydrationVersion;
      storage == null ? void 0 : storage.removeItem(options.name);
    },
    getOptions: () => options,
    rehydrate: () => {
      try {
        return Promise.resolve(hydrate());
      } catch (error) {
        return Promise.reject(error);
      }
    },
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb);
      return () => {
        hydrationListeners.delete(cb);
      };
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb);
      return () => {
        finishHydrationListeners.delete(cb);
      };
    }
  };
  if (!options.skipHydration) {
    hydrate();
  }
  return stateFromStorage || configResult;
};
var persist = persistImpl;

// src/historyPrefsStore.ts
var clamp = (n, min, max) => Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
var HISTORY_PREFS_LIMITS = {
  listPageSize: { min: 10, max: 100, default: 20 },
  restorePageSize: { min: 20, max: 500, default: 50 },
  recentCards: { min: 0, max: 10, default: 5 }
};
var useHistoryPrefsStore2 = create()(
  persist(
    (set) => ({
      listPageSize: HISTORY_PREFS_LIMITS.listPageSize.default,
      restorePageSize: HISTORY_PREFS_LIMITS.restorePageSize.default,
      recentCards: HISTORY_PREFS_LIMITS.recentCards.default,
      setListPageSize: (n) => set({
        listPageSize: clamp(
          n,
          HISTORY_PREFS_LIMITS.listPageSize.min,
          HISTORY_PREFS_LIMITS.listPageSize.max
        )
      }),
      setRestorePageSize: (n) => set({
        restorePageSize: clamp(
          n,
          HISTORY_PREFS_LIMITS.restorePageSize.min,
          HISTORY_PREFS_LIMITS.restorePageSize.max
        )
      }),
      setRecentCards: (n) => set({
        recentCards: clamp(
          n,
          HISTORY_PREFS_LIMITS.recentCards.min,
          HISTORY_PREFS_LIMITS.recentCards.max
        )
      })
    }),
    { name: "polaris-history-prefs" }
  )
);

// src/DataStorageCard.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var log3 = createLogger("DataStorageCard");
function DataStorageCard() {
  const { t } = useTranslation("settings");
  const historyPrefs = useHistoryPrefsStore2();
  const [info, setInfo] = useState2(null);
  const [legacy, setLegacy] = useState2([]);
  const [loading, setLoading] = useState2(true);
  const [error, setError] = useState2(null);
  const [showSubdirs, setShowSubdirs] = useState2(false);
  const [copyHint, setCopyHint] = useState2(null);
  const [selected, setSelected] = useState2(/* @__PURE__ */ new Set());
  const [migrating, setMigrating] = useState2(false);
  const [report, setReport] = useState2(null);
  const [reportExpanded, setReportExpanded] = useState2(false);
  const [migrateMode, setMigrateMode] = useState2("merge");
  const [wizardOpen, setWizardOpen] = useState2(false);
  const [restarting, setRestarting] = useState2(false);
  const [opfsCount, setOpfsCount] = useState2(0);
  const [opfsMigrated, setOpfsMigrated] = useState2(isOpfsMigrated());
  const [opfsMigrating, setOpfsMigrating] = useState2(false);
  const [opfsReport, setOpfsReport] = useState2(null);
  const [opfsClearing, setOpfsClearing] = useState2(false);
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [i, l] = await Promise.all([getDataRootInfo(), scanLegacyData()]);
      setInfo(i);
      setLegacy(l);
      setSelected(new Set(l.map((s) => s.path)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      log3.error("\u52A0\u8F7D\u6570\u636E\u6839\u4FE1\u606F\u5931\u8D25", e instanceof Error ? e : new Error(msg));
    } finally {
      setLoading(false);
    }
  }
  useEffect2(() => {
    void refresh();
    void probeOpfsDialogCount().then(setOpfsCount).catch(() => setOpfsCount(0));
  }, []);
  async function handleCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(t("dataStorage.copied", "\u5DF2\u590D\u5236"));
      window.setTimeout(() => setCopyHint(null), 1500);
    } catch (e) {
      log3.warn("\u590D\u5236\u5931\u8D25", { error: String(e) });
    }
  }
  async function handleOpen(path) {
    try {
      await openPathInExplorer(path);
    } catch (e) {
      log3.error("\u6253\u5F00\u76EE\u5F55\u5931\u8D25", e instanceof Error ? e : new Error(String(e)));
    }
  }
  function toggleSelect(path) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  async function handleMigrate() {
    if (selected.size === 0) return;
    const overwrite = migrateMode === "overwrite";
    const confirmMsg = overwrite ? t(
      "dataStorage.confirmMigrateOverwrite",
      "\u26A0 \u8986\u76D6\u6A21\u5F0F\u5C06\u7528\u65E7\u7248\u6570\u636E\u66FF\u6362\u65B0\u7248\u540C\u540D\u6587\u4EF6\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF0C\u786E\u8BA4\u7EE7\u7EED\uFF1F"
    ) : t(
      "dataStorage.confirmMigrate",
      "\u5C06\u5408\u5E76\u6240\u9009\u65E7\u6570\u636E\u5230\u5F53\u524D\u6570\u636E\u6839\u3002\u539F\u6570\u636E\u4FDD\u7559\u4EE5\u4FBF\u56DE\u6EDA\uFF0C\u91CD\u590D\u5185\u5BB9\u4E0D\u4F1A\u8986\u76D6\u3002\u662F\u5426\u7EE7\u7EED\uFF1F"
    );
    if (!window.confirm(confirmMsg)) return;
    setMigrating(true);
    setReport(null);
    try {
      const r = await migrateLegacyData(Array.from(selected), overwrite);
      setReport(r);
      void refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      log3.error("\u8FC1\u79FB\u5931\u8D25", e instanceof Error ? e : new Error(msg));
    } finally {
      setMigrating(false);
    }
  }
  async function handleOpfsMigrate() {
    setOpfsMigrating(true);
    setOpfsReport(null);
    try {
      const r = await migrateOpfsToTauri(false);
      setOpfsReport(r);
      setOpfsMigrated(isOpfsMigrated());
      void probeOpfsDialogCount().then(setOpfsCount);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOpfsReport({
        total: 0,
        success: 0,
        skipped: 0,
        failed: 1,
        errors: [{ name: "", error: msg }],
        flagged: false
      });
      log3.error("OPFS \u8FC1\u79FB\u5931\u8D25", e instanceof Error ? e : new Error(msg));
    } finally {
      setOpfsMigrating(false);
    }
  }
  async function handleOpfsClear() {
    if (!window.confirm(
      t(
        "dataStorage.confirmClearOpfs",
        "\u5C06\u6E05\u7A7A\u6D4F\u89C8\u5668 OPFS \u4E2D\u7684\u6240\u6709\u5BF9\u8BDD\u8BB0\u5F55\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF0C\u8BF7\u786E\u8BA4\u5DF2\u6210\u529F\u8FC1\u79FB\u5230\u78C1\u76D8\u3002\u662F\u5426\u7EE7\u7EED\uFF1F"
      )
    )) {
      return;
    }
    setOpfsClearing(true);
    try {
      const r = await clearOpfsDialogs();
      log3.info("OPFS \u6E05\u7406\u5B8C\u6210", r);
      void probeOpfsDialogCount().then(setOpfsCount);
    } catch (e) {
      log3.error("OPFS \u6E05\u7406\u5931\u8D25", e instanceof Error ? e : new Error(String(e)));
    } finally {
      setOpfsClearing(false);
    }
  }
  async function handleRestartApp() {
    setRestarting(true);
    try {
      if (isTauri()) {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } else {
        window.location.reload();
      }
    } catch (e) {
      log3.error("\u91CD\u542F\u5931\u8D25", e instanceof Error ? e : new Error(String(e)));
      setRestarting(false);
    }
  }
  const totalLegacyBytes = useMemo(
    () => legacy.reduce((sum, s) => sum + s.sizeBytes, 0),
    [legacy]
  );
  const totalLegacyFiles = useMemo(
    () => legacy.reduce((sum, s) => sum + s.fileCount, 0),
    [legacy]
  );
  const sourceLabel = info?.source ? info.source === "env" ? t("dataStorage.sourceEnv", "\u542F\u52A8\u73AF\u5883\u53D8\u91CF") : info.source === "anchor" ? t("dataStorage.sourceAnchor", "\u951A\u70B9\u81EA\u5B9A\u4E49") : t("dataStorage.sourceDefault", "\u9ED8\u8BA4\u76EE\u5F55") : info?.isCustom ? t("dataStorage.custom", "\u81EA\u5B9A\u4E49\u8DEF\u5F84") : t("dataStorage.default", "\u9ED8\u8BA4\u8DEF\u5F84");
  const sourceBadgeClass = info?.source ? info.source === "env" ? "bg-sky-500/15 text-sky-500" : info.source === "anchor" ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500" : info?.isCustom ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500";
  return /* @__PURE__ */ jsxs2("div", { className: "p-4 bg-surface rounded-lg border border-border space-y-4", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx2("h3", { className: "text-sm font-medium text-text-primary", children: t("dataStorage.title", "\u6570\u636E\u5B58\u50A8") }),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          onClick: refresh,
          disabled: loading,
          className: "text-xs px-2 py-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-50",
          children: loading ? t("dataStorage.loading", "\u52A0\u8F7D\u4E2D\u2026") : t("dataStorage.refresh", "\u5237\u65B0")
        }
      )
    ] }),
    error && /* @__PURE__ */ jsxs2("div", { className: "p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-500", children: [
      t("dataStorage.loadFailed", "\u52A0\u8F7D\u5931\u8D25"),
      ": ",
      error
    ] }),
    info && /* @__PURE__ */ jsxs2("div", { className: "space-y-2", children: [
      info.debugBuild && info.source === "anchor" && /* @__PURE__ */ jsx2("div", { className: "p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-500", children: t(
        "dataStorage.devOnInstalledAnchor",
        "\u5F00\u53D1\u6784\u5EFA\u6B63\u8FD0\u884C\u5728\u5B89\u88C5\u7248\u6570\u636E\u94FE\u4E0A\uFF1A\u5728\u6B64\u66F4\u6539\u6570\u636E\u6839\u4F1A\u4FEE\u6539\u5B89\u88C5\u7248\u951A\u70B9\u6587\u4EF6\uFF0C\u91CD\u542F\u540E\u751F\u6548\u3002"
      ) }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxs2("div", { className: "text-xs text-text-secondary mb-1", children: [
            t("dataStorage.currentLocation", "\u5F53\u524D\u4F4D\u7F6E"),
            /* @__PURE__ */ jsx2(
              "span",
              {
                className: `ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] ${sourceBadgeClass}`,
                children: sourceLabel
              }
            )
          ] }),
          /* @__PURE__ */ jsx2(
            "div",
            {
              className: "text-sm text-text-primary font-mono break-all select-all",
              title: info.root,
              children: info.root
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "flex flex-col items-end gap-1 flex-shrink-0", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => handleOpen(info.root),
              className: "text-xs px-2 py-1 bg-background-surface border border-border rounded hover:text-text-primary text-text-secondary",
              children: t("dataStorage.open", "\u6253\u5F00")
            }
          ),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => handleCopy(info.root),
              className: "text-xs px-2 py-1 bg-background-surface border border-border rounded hover:text-text-primary text-text-secondary",
              children: copyHint ?? t("dataStorage.copy", "\u590D\u5236")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3 text-xs text-text-secondary", children: [
        /* @__PURE__ */ jsxs2("span", { children: [
          t("dataStorage.totalSize", "\u5360\u7528"),
          ": ",
          formatBytes(info.totalSizeBytes)
        ] }),
        /* @__PURE__ */ jsx2("span", { children: "\xB7" }),
        /* @__PURE__ */ jsxs2("span", { children: [
          t("dataStorage.totalFiles", "\u6587\u4EF6"),
          ": ",
          info.totalFileCount
        ] }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: () => setShowSubdirs((v) => !v),
            className: "ml-auto text-text-tertiary hover:text-text-primary",
            children: showSubdirs ? t("dataStorage.collapse", "\u6298\u53E0\u5B50\u76EE\u5F55") : t("dataStorage.expand", "\u5C55\u5F00\u5B50\u76EE\u5F55")
          }
        )
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "flex items-center gap-2 pt-1", children: /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          onClick: () => setWizardOpen(true),
          className: "text-xs px-3 py-1.5 bg-background-surface border border-border rounded hover:text-text-primary text-text-secondary",
          children: t("dataStorage.changeLocation", "\u66F4\u6539\u4F4D\u7F6E\u2026")
        }
      ) }),
      showSubdirs && /* @__PURE__ */ jsx2("div", { className: "border border-border rounded divide-y divide-border", children: info.subdirs.map((sd) => /* @__PURE__ */ jsxs2(
        "div",
        {
          className: "flex items-center justify-between px-3 py-2 text-xs",
          children: [
            /* @__PURE__ */ jsxs2("div", { className: "font-mono text-text-primary", children: [
              sd.name,
              "/"
            ] }),
            /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3 text-text-secondary", children: [
              /* @__PURE__ */ jsx2("span", { children: formatBytes(sd.sizeBytes) }),
              /* @__PURE__ */ jsxs2("span", { children: [
                sd.fileCount,
                " ",
                t("dataStorage.items", "\u9879")
              ] }),
              /* @__PURE__ */ jsx2(
                "button",
                {
                  type: "button",
                  onClick: () => handleOpen(sd.path),
                  className: "text-text-tertiary hover:text-text-primary",
                  children: t("dataStorage.open", "\u6253\u5F00")
                }
              )
            ] })
          ]
        },
        sd.name
      )) }),
      /* @__PURE__ */ jsxs2("div", { className: "text-[11px] text-text-tertiary", children: [
        t("dataStorage.anchorHint", "\u951A\u70B9\u6587\u4EF6"),
        ": ",
        info.anchorFile
      ] })
    ] }),
    legacy.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "border-t border-border pt-3 space-y-2", children: [
      /* @__PURE__ */ jsx2("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxs2("div", { className: "text-xs text-text-secondary", children: [
        t("dataStorage.legacyTitle", "\u68C0\u6D4B\u5230\u65E7\u7248\u6570\u636E"),
        /* @__PURE__ */ jsxs2("span", { className: "ml-2 text-text-tertiary", children: [
          "(",
          legacy.length,
          " ",
          t("dataStorage.sources", "\u5904"),
          " \xB7 ",
          formatBytes(totalLegacyBytes),
          " \xB7 ",
          totalLegacyFiles,
          " ",
          t("dataStorage.items", "\u9879"),
          ")"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx2("div", { className: "border border-border rounded divide-y divide-border", children: legacy.map((s) => {
        const checked = selected.has(s.path);
        return /* @__PURE__ */ jsxs2(
          "label",
          {
            className: "flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-background-surface",
            children: [
              /* @__PURE__ */ jsx2(
                "input",
                {
                  type: "checkbox",
                  checked,
                  onChange: () => toggleSelect(s.path),
                  disabled: migrating,
                  className: "w-3.5 h-3.5"
                }
              ),
              /* @__PURE__ */ jsxs2("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsx2("div", { className: "text-text-primary truncate", children: s.label }),
                /* @__PURE__ */ jsx2("div", { className: "text-text-tertiary font-mono truncate", title: s.path, children: s.path })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3 text-text-secondary flex-shrink-0", children: [
                /* @__PURE__ */ jsx2("span", { children: formatBytes(s.sizeBytes) }),
                /* @__PURE__ */ jsxs2("span", { children: [
                  s.fileCount,
                  " ",
                  t("dataStorage.items", "\u9879")
                ] }),
                /* @__PURE__ */ jsx2(
                  "button",
                  {
                    type: "button",
                    onClick: (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleOpen(s.path);
                    },
                    className: "text-text-tertiary hover:text-text-primary",
                    children: t("dataStorage.open", "\u6253\u5F00")
                  }
                )
              ] })
            ]
          },
          s.path
        );
      }) }),
      /* @__PURE__ */ jsx2("div", { className: "flex items-center justify-between gap-2", children: /* @__PURE__ */ jsx2("div", { className: "text-[11px] text-text-tertiary flex-1", children: migrateMode === "merge" ? t(
        "dataStorage.legacyMigrateHint",
        "\u5408\u5E76\u6A21\u5F0F\uFF1A\u590D\u5236\u5230\u6570\u636E\u6839\uFF0C\u91CD\u590D\u5185\u5BB9\u8DF3\u8FC7\uFF1B\u51B2\u7A81\u6587\u4EF6\u5199\u5165 *.legacy-* \u526F\u672C\uFF0C\u65B0\u7248\u6570\u636E\u4FDD\u6301\u4E0D\u53D8\u3002"
      ) : t(
        "dataStorage.legacyMigrateHintOverwrite",
        "\u26A0 \u8986\u76D6\u6A21\u5F0F\uFF1A\u65E7\u7248\u6570\u636E\u76F4\u63A5\u66FF\u6362\u65B0\u7248\u540C\u540D\u6587\u4EF6\uFF0C\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002"
      ) }) }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3 text-xs", children: [
        /* @__PURE__ */ jsxs2("span", { className: "text-text-secondary", children: [
          t("dataStorage.migrateMode", "\u51B2\u7A81\u7B56\u7565"),
          ":"
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "inline-flex items-center gap-1.5 cursor-pointer", children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "radio",
              name: "migrateMode",
              checked: migrateMode === "merge",
              onChange: () => setMigrateMode("merge"),
              disabled: migrating,
              className: "w-3.5 h-3.5"
            }
          ),
          /* @__PURE__ */ jsx2("span", { className: migrateMode === "merge" ? "text-text-primary" : "text-text-tertiary", children: t("dataStorage.modeMerge", "\u5408\u5E76\uFF08\u63A8\u8350\uFF09") })
        ] }),
        /* @__PURE__ */ jsxs2("label", { className: "inline-flex items-center gap-1.5 cursor-pointer", children: [
          /* @__PURE__ */ jsx2(
            "input",
            {
              type: "radio",
              name: "migrateMode",
              checked: migrateMode === "overwrite",
              onChange: () => setMigrateMode("overwrite"),
              disabled: migrating,
              className: "w-3.5 h-3.5"
            }
          ),
          /* @__PURE__ */ jsx2("span", { className: migrateMode === "overwrite" ? "text-amber-500" : "text-text-tertiary", children: t("dataStorage.modeOverwrite", "\u65E7\u7248\u8986\u76D6\u65B0\u7248") })
        ] }),
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: handleMigrate,
            disabled: migrating || selected.size === 0,
            className: `ml-auto text-xs px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${migrateMode === "overwrite" ? "bg-amber-500 text-white" : "bg-primary text-on-primary"}`,
            children: migrating ? t("dataStorage.migrating", "\u8FC1\u79FB\u4E2D\u2026") : migrateMode === "overwrite" ? t("dataStorage.migrateOverwrite", "\u8986\u76D6\u8FC1\u79FB\u6240\u9009 ({{count}})", { count: selected.size }) : t("dataStorage.migrate", "\u8FC1\u79FB\u6240\u9009 ({{count}})", { count: selected.size })
          }
        )
      ] }),
      report && /* @__PURE__ */ jsxs2("div", { className: "mt-2 p-3 bg-background-surface border border-border rounded text-xs space-y-2", children: [
        (report.successCount > 0 || report.conflictCount > 0) && /* @__PURE__ */ jsxs2("div", { className: "flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded", children: [
          /* @__PURE__ */ jsx2("span", { className: "text-amber-500 text-base leading-none", children: "\u27F3" }),
          /* @__PURE__ */ jsxs2("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsx2("div", { className: "text-amber-500 font-medium", children: t("dataStorage.restartRequired", "\u8FC1\u79FB\u5B8C\u6210\uFF0C\u8BF7\u91CD\u542F\u5E94\u7528") }),
            /* @__PURE__ */ jsx2("div", { className: "text-text-secondary mt-0.5", children: t(
              "dataStorage.restartRequiredHint",
              "\u914D\u7F6E\u3001\u8C03\u5EA6\u4EFB\u52A1\u3001\u65E5\u5FD7\u7B49\u6570\u636E\u5DF2\u7ECF\u5199\u5165\u78C1\u76D8\uFF0C\u4F46\u8FD0\u884C\u4E2D\u7684\u5185\u5B58\u526F\u672C\u8FD8\u662F\u8FC1\u79FB\u524D\u7684\u7248\u672C\u3002\u91CD\u542F\u540E\u624D\u4F1A\u771F\u6B63\u52A0\u8F7D\u8FC1\u79FB\u540E\u7684\u6570\u636E\u3002"
            ) })
          ] }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: handleRestartApp,
              disabled: restarting,
              className: "flex-shrink-0 text-xs px-3 py-1.5 bg-amber-500 text-white rounded disabled:opacity-50 whitespace-nowrap",
              children: restarting ? t("dataStorage.restarting", "\u91CD\u542F\u4E2D\u2026") : t("dataStorage.restartNow", "\u7ACB\u5373\u91CD\u542F")
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs2("span", { className: "text-emerald-500", children: [
            "\u2713 ",
            report.successCount,
            " ",
            t("dataStorage.report.copied", "\u5DF2\u590D\u5236")
          ] }),
          report.skippedCount > 0 && /* @__PURE__ */ jsxs2("span", { className: "text-text-secondary", children: [
            "\u21B7 ",
            report.skippedCount,
            " ",
            t("dataStorage.report.skipped", "\u8DF3\u8FC7")
          ] }),
          report.conflictCount > 0 && /* @__PURE__ */ jsxs2("span", { className: "text-amber-500", children: [
            "\u26A0 ",
            report.conflictCount,
            " ",
            t("dataStorage.report.conflict", "\u51B2\u7A81")
          ] }),
          report.errorCount > 0 && /* @__PURE__ */ jsxs2("span", { className: "text-red-500", children: [
            "\u2717 ",
            report.errorCount,
            " ",
            t("dataStorage.report.failed", "\u5931\u8D25")
          ] }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => setReportExpanded((v) => !v),
              className: "ml-auto text-text-tertiary hover:text-text-primary",
              children: reportExpanded ? t("dataStorage.report.collapse", "\u6536\u8D77\u8BE6\u60C5") : t("dataStorage.report.expand", "\u67E5\u770B\u8BE6\u60C5")
            }
          )
        ] }),
        /* @__PURE__ */ jsxs2("div", { className: "text-[11px] text-text-tertiary font-mono", children: [
          t("dataStorage.report.logFile", "\u65E5\u5FD7"),
          ": ",
          report.logFile,
          " ",
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => handleOpen(report.logFile),
              className: "ml-2 text-text-secondary hover:text-text-primary underline",
              children: t("dataStorage.open", "\u6253\u5F00")
            }
          )
        ] }),
        reportExpanded && /* @__PURE__ */ jsx2("div", { className: "max-h-48 overflow-auto border border-border rounded", children: report.items.map((it, idx) => /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "flex items-start gap-2 px-2 py-1 text-[11px] border-b border-border last:border-b-0",
            children: [
              /* @__PURE__ */ jsx2(
                "span",
                {
                  className: `flex-shrink-0 w-14 ${it.status === "copied" ? "text-emerald-500" : it.status === "conflicted" ? "text-amber-500" : it.status === "failed" ? "text-red-500" : "text-text-tertiary"}`,
                  children: it.status
                }
              ),
              /* @__PURE__ */ jsxs2("div", { className: "flex-1 min-w-0 font-mono", children: [
                /* @__PURE__ */ jsx2("div", { className: "text-text-secondary truncate", title: it.source, children: it.source }),
                it.target && /* @__PURE__ */ jsxs2("div", { className: "text-text-tertiary truncate", title: it.target, children: [
                  "\u2192 ",
                  it.target
                ] }),
                it.message && /* @__PURE__ */ jsx2("div", { className: "text-text-tertiary", children: it.message })
              ] })
            ]
          },
          idx
        )) })
      ] })
    ] }),
    (isTauri() || isWeb()) && opfsCount > 0 && /* @__PURE__ */ jsxs2("div", { className: "border-t border-border pt-3 space-y-2", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx2("div", { className: "text-xs text-text-secondary", children: t("dataStorage.dialogMigrateTitle", "\u5386\u53F2\u5BF9\u8BDD\u8FC1\u79FB") }),
        opfsMigrated && /* @__PURE__ */ jsx2("span", { className: "text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500", children: t("dataStorage.dialogMigrated", "\u5DF2\u8FC1\u79FB") })
      ] }),
      /* @__PURE__ */ jsx2("div", { className: "text-[11px] text-text-tertiary", children: t(
        "dataStorage.dialogMigrateHint",
        "\u68C0\u6D4B\u5230\u6D4F\u89C8\u5668 OPFS \u4E2D\u5B58\u6709 {{count}} \u6761\u5386\u53F2\u5BF9\u8BDD\uFF1B\u5EFA\u8BAE\u8FC1\u79FB\u5230\u78C1\u76D8\u4EE5\u4FBF\u5907\u4EFD\u548C\u8DDF\u968F\u6570\u636E\u6839\u3002",
        { count: opfsCount }
      ) }),
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: handleOpfsMigrate,
            disabled: opfsMigrating,
            className: "text-xs px-3 py-1.5 bg-primary text-on-primary rounded disabled:opacity-50",
            children: opfsMigrating ? t("dataStorage.migrating", "\u8FC1\u79FB\u4E2D\u2026") : t("dataStorage.dialogMigrateBtn", "\u8FC1\u79FB\u5230\u78C1\u76D8")
          }
        ),
        opfsMigrated && /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            onClick: handleOpfsClear,
            disabled: opfsClearing,
            className: "text-xs px-3 py-1.5 bg-background-surface border border-border rounded text-text-secondary hover:text-text-primary disabled:opacity-50",
            children: opfsClearing ? t("dataStorage.clearing", "\u6E05\u7406\u4E2D\u2026") : t("dataStorage.dialogClearOpfs", "\u6E05\u7406 OPFS\uFF08\u53EF\u9009\uFF09")
          }
        )
      ] }),
      opfsReport && /* @__PURE__ */ jsxs2("div", { className: "p-2 bg-background-surface border border-border rounded text-[11px] space-y-1", children: [
        /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs2("span", { className: "text-emerald-500", children: [
            "\u2713 ",
            opfsReport.success
          ] }),
          opfsReport.skipped > 0 && /* @__PURE__ */ jsxs2("span", { className: "text-text-secondary", children: [
            "\u21B7 ",
            opfsReport.skipped
          ] }),
          opfsReport.failed > 0 && /* @__PURE__ */ jsxs2("span", { className: "text-red-500", children: [
            "\u2717 ",
            opfsReport.failed
          ] }),
          /* @__PURE__ */ jsxs2("span", { className: "text-text-tertiary", children: [
            "/ ",
            opfsReport.total,
            " ",
            t("dataStorage.dialogTotal", "\u6761")
          ] })
        ] }),
        opfsReport.errors.length > 0 && /* @__PURE__ */ jsxs2("div", { className: "max-h-24 overflow-auto text-text-tertiary font-mono", children: [
          opfsReport.errors.slice(0, 10).map((e, i) => /* @__PURE__ */ jsxs2("div", { children: [
            e.name || "(unnamed)",
            ": ",
            e.error
          ] }, i)),
          opfsReport.errors.length > 10 && /* @__PURE__ */ jsxs2("div", { children: [
            "... +",
            opfsReport.errors.length - 10
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2("div", { className: "border-t border-border pt-3 space-y-2", children: [
      /* @__PURE__ */ jsx2("div", { className: "text-xs text-text-secondary", children: t("dataStorage.historyPrefsTitle", "\u4F1A\u8BDD\u5386\u53F2\u4F53\u9A8C") }),
      /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsx2(
          HistoryPrefField,
          {
            label: t("dataStorage.historyListPageSize", "\u5217\u8868\u6BCF\u9875\u6761\u6570"),
            value: historyPrefs.listPageSize,
            min: HISTORY_PREFS_LIMITS.listPageSize.min,
            max: HISTORY_PREFS_LIMITS.listPageSize.max,
            onChange: historyPrefs.setListPageSize
          }
        ),
        /* @__PURE__ */ jsx2(
          HistoryPrefField,
          {
            label: t("dataStorage.historyRestorePageSize", "\u6062\u590D\u9996\u5C4F\u6D88\u606F\u6570"),
            hint: t("dataStorage.historyRestoreHint", "\u66F4\u65E9\u6D88\u606F\u5411\u4E0A\u6EDA\u52A8\u6309\u9700\u52A0\u8F7D"),
            value: historyPrefs.restorePageSize,
            min: HISTORY_PREFS_LIMITS.restorePageSize.min,
            max: HISTORY_PREFS_LIMITS.restorePageSize.max,
            onChange: historyPrefs.setRestorePageSize
          }
        ),
        /* @__PURE__ */ jsx2(
          HistoryPrefField,
          {
            label: t("dataStorage.historyRecentCards", "\u300C\u7EE7\u7EED\u5DE5\u4F5C\u300D\u5361\u7247\u6570"),
            value: historyPrefs.recentCards,
            min: HISTORY_PREFS_LIMITS.recentCards.min,
            max: HISTORY_PREFS_LIMITS.recentCards.max,
            onChange: historyPrefs.setRecentCards
          }
        )
      ] })
    ] }),
    wizardOpen && info && /* @__PURE__ */ jsx2(
      ChangeDataRootWizard,
      {
        current: info,
        onClose: () => setWizardOpen(false),
        onChanged: refresh
      }
    )
  ] });
}
function HistoryPrefField({
  label,
  hint,
  value,
  min,
  max,
  onChange
}) {
  return /* @__PURE__ */ jsxs2("label", { className: "flex flex-col gap-1 text-[11px] text-text-tertiary", children: [
    /* @__PURE__ */ jsx2("span", { children: label }),
    /* @__PURE__ */ jsx2(
      "input",
      {
        type: "number",
        min,
        max,
        value,
        onChange: (e) => onChange(Number(e.target.value)),
        className: "w-full px-2 py-1.5 text-xs bg-background-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/50 text-text-primary"
      }
    ),
    hint && /* @__PURE__ */ jsx2("span", { className: "text-[10px] text-text-muted", children: hint })
  ] });
}

// src/index.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function StorageDeskEntry() {
  const { t } = useTranslation("settings");
  return /* @__PURE__ */ jsxs3("div", { className: "flex flex-col h-full min-h-0 overflow-auto p-3 gap-3", children: [
    /* @__PURE__ */ jsx3("div", { className: "text-sm font-medium text-text-primary", children: t("nav.storageDesk", "\u5B58\u50A8\u7BA1\u7406") }),
    /* @__PURE__ */ jsx3(DataStorageCard, {})
  ] });
}
export {
  StorageDeskEntry as default
};
