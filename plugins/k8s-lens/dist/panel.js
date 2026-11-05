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

// shared/k8s-core.js
var require_k8s_core = __commonJS({
  "shared/k8s-core.js"(exports, module) {
    "use strict";
    var SEV = { ERROR: "error", WARN: "warn", INFO: "info" };
    var DEDUCT = { error: 2, warn: 0.7, info: 0.2 };
    function mk(rule, level, path, message, fix) {
      return { rule, level, path: path || "", message, fix: fix || "" };
    }
    function round1(n) {
      return Math.round(n * 10) / 10;
    }
    var KIND_API = {
      Pod: { api: "v1" },
      Namespace: { api: "v1" },
      Node: { api: "v1" },
      Event: { api: "v1" },
      ConfigMap: { api: "v1" },
      Secret: { api: "v1" },
      ServiceAccount: { api: "v1" },
      Service: { api: "v1" },
      Endpoints: { api: "v1" },
      PersistentVolume: { api: "v1" },
      PersistentVolumeClaim: { api: "v1" },
      ReplicationController: { api: "v1" },
      LimitRange: { api: "v1" },
      ResourceQuota: { api: "v1" },
      Deployment: { api: "apps/v1", deprecated: { "apps/v1beta1": "apps/v1", "apps/v1beta2": "apps/v1", "extensions/v1beta1": "apps/v1" } },
      StatefulSet: { api: "apps/v1", deprecated: { "apps/v1beta1": "apps/v1", "apps/v1beta2": "apps/v1" } },
      DaemonSet: { api: "apps/v1", deprecated: { "apps/v1beta2": "apps/v1", "extensions/v1beta2": "apps/v1" } },
      ReplicaSet: { api: "apps/v1", deprecated: { "apps/v1beta2": "apps/v1", "extensions/v1beta2": "apps/v1" } },
      ControllerRevision: { api: "apps/v1" },
      Job: { api: "batch/v1", deprecated: { "batch/v1beta1": "batch/v1" } },
      CronJob: { api: "batch/v1", deprecated: { "batch/v1beta1": "batch/v1", "batch/v2alpha1": "batch/v1" } },
      Ingress: { api: "networking.k8s.io/v1", deprecated: { "networking.k8s.io/v1beta1": "networking.k8s.io/v1", "extensions/v1beta1": "networking.k8s.io/v1" } },
      IngressClass: { api: "networking.k8s.io/v1" },
      NetworkPolicy: { api: "networking.k8s.io/v1", deprecated: { "extensions/v1beta1": "networking.k8s.io/v1" } },
      HorizontalPodAutoscaler: { api: "autoscaling/v2", legacy: ["autoscaling/v1"], deprecated: { "autoscaling/v2beta1": "autoscaling/v2", "autoscaling/v2beta2": "autoscaling/v2" } },
      PodDisruptionBudget: { api: "policy/v1", deprecated: { "policy/v1beta1": "policy/v1" } },
      PodSecurityPolicy: { api: null, deprecated: { "policy/v1beta1": null, "extensions/v1beta1": null } },
      Role: { api: "rbac.authorization.k8s.io/v1", deprecated: { "rbac.authorization.k8s.io/v1alpha1": "rbac.authorization.k8s.io/v1", "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" } },
      RoleBinding: { api: "rbac.authorization.k8s.io/v1", deprecated: { "rbac.authorization.k8s.io/v1alpha1": "rbac.authorization.k8s.io/v1", "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" } },
      ClusterRole: { api: "rbac.authorization.k8s.io/v1", deprecated: { "rbac.authorization.k8s.io/v1alpha1": "rbac.authorization.k8s.io/v1", "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" } },
      ClusterRoleBinding: { api: "rbac.authorization.k8s.io/v1", deprecated: { "rbac.authorization.k8s.io/v1alpha1": "rbac.authorization.k8s.io/v1", "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" } },
      StorageClass: { api: "storage.k8s.io/v1", deprecated: { "storage.k8s.io/v1beta1": "storage.k8s.io/v1" } },
      VolumeAttachment: { api: "storage.k8s.io/v1" },
      CSIDriver: { api: "storage.k8s.io/v1" },
      CSINode: { api: "storage.k8s.io/v1" },
      ValidatingWebhookConfiguration: { api: "admissionregistration.k8s.io/v1", deprecated: { "admissionregistration.k8s.io/v1beta1": "admissionregistration.k8s.io/v1" } },
      MutatingWebhookConfiguration: { api: "admissionregistration.k8s.io/v1", deprecated: { "admissionregistration.k8s.io/v1beta1": "admissionregistration.k8s.io/v1" } },
      CertificateSigningRequest: { api: "certificates.k8s.io/v1", deprecated: { "certificates.k8s.io/v1beta1": "certificates.k8s.io/v1" } },
      Lease: { api: "coordination.k8s.io/v1", deprecated: { "coordination.k8s.io/v1beta1": "coordination.k8s.io/v1" } },
      EndpointSlice: { api: "discovery.k8s.io/v1", deprecated: { "discovery.k8s.io/v1beta1": "discovery.k8s.io/v1" } },
      APIService: { api: "apiregistration.k8s.io/v1", deprecated: { "apiregistration.k8s.io/v1beta1": "apiregistration.k8s.io/v1" } },
      PriorityClass: { api: "scheduling.k8s.io/v1" },
      RuntimeClass: { api: "node.k8s.io/v1" }
    };
    var REMOVED_NO_REPLACE = "PodSecurityPolicy \u5728 v1.25 \u5DF2\u6574\u4F53\u79FB\u9664\u4E14\u65E0\u66FF\u4EE3\uFF1B\u8BF7\u8FC1\u79FB\u5230 PodSecurity Admission\uFF08namespace \u6807\u7B7E pod-security.kubernetes.io/*\uFF09\u6216\u7B2C\u4E09\u65B9\u7B56\u7565\u5F15\u64CE";
    function splitDocs(text) {
      const lines = text.split(/\r?\n/);
      const docs = [];
      let cur = [];
      let curStart = 1;
      const flush = () => {
        if (cur.some((l) => l.trim() !== "" && !l.trim().startsWith("#"))) {
          while (cur.length && cur[0].trim() === "") {
            cur.shift();
            curStart++;
          }
          docs.push({ text: cur.join("\n"), startLine: curStart });
        }
        cur = [];
      };
      for (let i = 0; i < lines.length; i++) {
        if (/^---(\s.*)?$/.test(lines[i])) {
          flush();
          const rest = lines[i].replace(/^---\s?/, "");
          cur = rest.trim() ? [rest] : [];
          curStart = i + 2;
          continue;
        }
        if (/^\.\.\.(\s.*)?$/.test(lines[i])) {
          flush();
          curStart = i + 2;
          continue;
        }
        if (cur.length === 0) curStart = i + 1;
        cur.push(lines[i]);
      }
      flush();
      return docs;
    }
    var KEY_RE = /^(?:"((?:[^"\\]|\\.)+)"|'([^']+)'|([^:#\s][^:#]*?))\s*:(?:\s|$)/;
    var BLOCK_RE = /^[|>][+-]?\d*\s*(?:#.*)?$/;
    function buildLineIndex(lines) {
      const index = /* @__PURE__ */ new Map();
      const register = (path, line, parent) => {
        if (path && !index.has(path)) index.set(path, { line, parent: parent || null });
      };
      const stack = [];
      const pathNow = () => stack.length ? stack[stack.length - 1].path : "";
      let blockIndent = -1;
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const lineNo = i + 1;
        if (blockIndent >= 0) {
          if (raw.trim() === "") continue;
          const ind = raw.match(/^ */)[0].length;
          if (ind > blockIndent) continue;
          blockIndent = -1;
        }
        let s = raw;
        let q = null;
        for (let c = 0; c < s.length; c++) {
          const ch = s[c];
          if (q) {
            if (ch === q) q = null;
          } else if (ch === "'" || ch === '"') q = ch;
          else if (ch === "#" && (c === 0 || s[c - 1] === " " || s[c - 1] === "	")) {
            s = s.slice(0, c);
            break;
          }
        }
        if (s.trim() === "") continue;
        const indent = s.match(/^ */)[0].length;
        const body = s.slice(indent);
        const seqM = /^-(?:\s+(.*))?$/.exec(body);
        if (seqM) {
          while (stack.length && stack[stack.length - 1].indent >= indent && isSeqLayer(stack[stack.length - 1].path)) stack.pop();
          while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
          const hostPath = pathNow();
          const host = stack.length ? stack[stack.length - 1] : null;
          const n = host ? (host.seq = (host.seq || 0) + 1) - 1 : 0;
          const itemPath = hostPath + "[" + n + "]";
          register(itemPath, lineNo, hostPath || null);
          stack.push({ indent, path: itemPath, seq: 0 });
          const restRaw = seqM[1] || "";
          if (restRaw.trim()) {
            const dashSpaces = /^-(\s+)/.exec(body);
            const keyCol = indent + 1 + (dashSpaces ? dashSpaces[1].length : 1);
            const inner = parseKeyLine(restRaw.trim(), keyCol);
            if (inner) {
              const p = itemPath + "." + inner.key;
              register(p, lineNo, itemPath);
              if (inner.empty) stack.push({ indent: inner.indent, path: p, seq: 0 });
              else if (inner.block) blockIndent = indent;
            }
          }
          continue;
        }
        const kl = parseKeyLine(body, indent);
        if (kl) {
          while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
          const parent = pathNow();
          const p = parent ? parent + "." + kl.key : kl.key;
          register(p, lineNo, parent || null);
          if (kl.empty) {
            stack.push({ indent, path: p, seq: 0 });
          } else if (kl.block) {
            blockIndent = indent;
          }
          continue;
        }
      }
      return index;
    }
    function isSeqLayer(pathStr) {
      return /\[\d+\]$/.test(pathStr);
    }
    function parseKeyLine(body, col) {
      const m = KEY_RE.exec(body);
      if (!m) return null;
      const key = (m[1] || m[2] || m[3] || "").trim();
      if (!key) return null;
      const after = body.slice(m[0].length).trim();
      const empty = after === "";
      const block = !empty && BLOCK_RE.test(after);
      return { key, empty, block, indent: col };
    }
    function lineForPath(index, path, fallbackLine) {
      if (!path) return fallbackLine;
      if (index.has(path)) return index.get(path).line;
      let cur = path;
      for (; ; ) {
        const dot = Math.max(cur.lastIndexOf("."), cur.lastIndexOf("["));
        if (dot <= 0) break;
        cur = cur.slice(0, dot);
        if (index.has(cur)) return index.get(cur).line;
      }
      return fallbackLine;
    }
    function isObj(x) {
      return x !== null && typeof x === "object" && !Array.isArray(x);
    }
    var NAME_RE = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
    function validRfc1123(name) {
      return typeof name === "string" && name.length <= 253 && NAME_RE.test(name);
    }
    function isPlaceholderValue(v) {
      const s = String(v).trim();
      if (!s) return true;
      if (/^\$\{.+\}$/.test(s) || /^<.+>$/.test(s)) return true;
      if (/^\$\(.+\)$/.test(s)) return true;
      if (/^(changeme|change-me|change_me|xxx+|placeholder|todo|dummy|example|your[-_].*|my[-_]secret.*)$/i.test(s)) return true;
      return false;
    }
    var SECRET_NAME_RE = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|APIKEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL|AUTH_KEY|SESSION_KEY)/i;
    var DANGEROUS_CAPS = /* @__PURE__ */ new Set(["SYS_ADMIN", "NET_ADMIN", "NET_RAW", "DAC_OVERRIDE", "SYS_PTRACE", "SYS_BOOT", "SYS_TIME", "MKNOD", "AUDIT_WRITE", "SETFCAP"]);
    function looksLikeHelm(text) {
      return /\{\{[^}]*\}\}/.test(String(text));
    }
    function podSpecPath(kind) {
      switch (kind) {
        case "Pod":
          return "spec";
        case "Deployment":
        case "StatefulSet":
        case "DaemonSet":
        case "ReplicaSet":
        case "ReplicationController":
        case "Job":
          return "spec.template.spec";
        case "CronJob":
          return "spec.jobTemplate.spec.template.spec";
        default:
          return null;
      }
    }
    function isWorkloadKind(kind) {
      return ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "ReplicationController"].includes(kind);
    }
    function lintDoc(doc, ctx) {
      const findings = [];
      if (!isObj(doc)) {
        findings.push(mk("k8s-not-object", SEV.ERROR, "", "\u6587\u6863\u4E0D\u662F\u952E\u503C\u6620\u5C04\uFF08\u53EF\u80FD\u662F\u7EAF\u6807\u91CF\u6216\u5217\u8868\uFF09\uFF0C\u65E0\u6CD5\u4F5C\u4E3A K8s \u8D44\u6E90\u89E3\u6790", "\u6BCF\u4E2A\u6587\u6863\u5E94\u662F\u4E00\u4E2A\u8D44\u6E90\u5BF9\u8C61\uFF08apiVersion/kind/metadata/spec\uFF09"));
        return { findings, resource: null };
      }
      const apiVersion = doc.apiVersion;
      const kind = doc.kind;
      if (apiVersion === void 0 || apiVersion === null || apiVersion === "") {
        findings.push(mk("k8s-missing-api", SEV.ERROR, "apiVersion", "\u7F3A\u5C11 apiVersion\u2014\u2014kubectl apply \u76F4\u63A5\u5931\u8D25", "\u8865 apiVersion\uFF0C\u5982 apps/v1\uFF08Deployment\uFF09\u3001v1\uFF08Pod/ConfigMap/Service\uFF09"));
      }
      if (kind === void 0 || kind === null || kind === "") {
        findings.push(mk("k8s-missing-kind", SEV.ERROR, "kind", "\u7F3A\u5C11 kind\u2014\u2014kubectl apply \u76F4\u63A5\u5931\u8D25", "\u8865 kind\uFF0C\u5982 Deployment / Service / ConfigMap"));
      }
      if (typeof kind !== "string" || !kind) {
        return { findings, resource: null };
      }
      const entry = KIND_API[kind];
      if (typeof apiVersion === "string" && apiVersion) {
        if (entry) {
          const dep = entry.deprecated && entry.deprecated[apiVersion];
          if (dep !== void 0) {
            if (dep === null) {
              findings.push(mk("k8s-deprecated-api", SEV.ERROR, "apiVersion", `${kind} \u7684 ${apiVersion} \u5DF2\u88AB\u96C6\u7FA4\u79FB\u9664\uFF0Capply \u5373\u5931\u8D25`, REMOVED_NO_REPLACE));
            } else {
              findings.push(mk("k8s-deprecated-api", SEV.ERROR, "apiVersion", `${kind} \u7684 ${apiVersion} \u5DF2\u5728 1.16/1.22/1.25 \u6E05\u7406\u6279\u6B21\u79FB\u9664\uFF0C\u73B0\u4EE3\u96C6\u7FA4 apply \u5373\u5931\u8D25\uFF08no matches for kind\uFF09`, `\u8FC1\u79FB\u5230 ${dep}`));
            }
          } else if (entry.api === null) {
            findings.push(mk("k8s-deprecated-api", SEV.ERROR, "apiVersion", `PodSecurityPolicy \u7684\u4EFB\u4F55 apiVersion\uFF08\u542B ${apiVersion}\uFF09\u90FD\u5DF2\u88AB\u79FB\u9664\uFF0Capply \u5373\u5931\u8D25`, REMOVED_NO_REPLACE));
          } else if (apiVersion !== entry.api && !(entry.legacy || []).includes(apiVersion)) {
            const sameGroup = entry.api.split("/")[0] === apiVersion.split("/")[0];
            if (apiVersion === "v1" && !entry.api.includes("/")) {
              findings.push(mk("k8s-kind-api-mismatch", SEV.ERROR, "apiVersion", `${kind} \u4E0D\u5C5E\u4E8E\u6838\u5FC3\u7EC4 v1\uFF0Capply \u5373\u5931\u8D25\uFF08no matches for kind\uFF09`, `\u6539\u7528 ${entry.api}`));
            } else if (sameGroup) {
              findings.push(mk("k8s-kind-api-mismatch", SEV.WARN, "apiVersion", `${apiVersion} \u4E0B\u672A\u77E5\u7684 kind\u300C${kind}\u300D\uFF08\u8BE5 group \u73B0\u884C\u7248\u672C\u662F ${entry.api}\uFF09`, `\u786E\u8BA4\u540E\u6539\u7528 ${entry.api}`));
            } else {
              findings.push(mk("k8s-kind-api-mismatch", SEV.ERROR, "apiVersion", `kind\u300C${kind}\u300D\u4E0E apiVersion\u300C${apiVersion}\u300D\u4E0D\u5339\u914D\uFF08${kind} \u7684\u73B0\u884C apiVersion \u662F ${entry.api}\uFF09`, `\u6539\u7528 ${entry.api}`));
            }
          } else if (apiVersion === "autoscaling/v1" && kind === "HorizontalPodAutoscaler") {
            findings.push(mk("k8s-hpa-v1", SEV.INFO, "apiVersion", "autoscaling/v1 \u662F HPA \u65E7\u7248\uFF08\u4EC5\u652F\u6301 CPU/\u5185\u5B58\u6307\u6807\uFF09\uFF0C\u4ECD\u5408\u6CD5\u4F46\u529F\u80FD\u53D7\u9650", "\u5EFA\u8BAE\u8FC1\u79FB autoscaling/v2\uFF08\u652F\u6301\u81EA\u5B9A\u4E49\u4E0E\u5916\u90E8\u6307\u6807\uFF09"));
          }
        } else {
          findings.push(mk("k8s-cr-skip", SEV.INFO, "kind", `kind\u300C${kind}\u300D\u4E0D\u5728\u5185\u7F6E\u68C0\u67E5\u8868\uFF08\u89C6\u4E3A CRD/\u6269\u5C55\u8D44\u6E90\uFF09\uFF0C\u53EA\u505A\u7ED3\u6784\u5C42\u68C0\u67E5`, ""));
        }
      }
      const meta = doc.metadata;
      if (!isObj(meta)) {
        findings.push(mk("k8s-missing-name", SEV.ERROR, "metadata", "\u7F3A\u5C11 metadata\u2014\u2014\u8D44\u6E90\u65E0\u540D\u5B57\uFF0Capply \u5931\u8D25", "\u8865 metadata.name"));
      } else {
        const name = meta.name;
        const genName = meta.generateName;
        if ((name === void 0 || name === null || name === "") && !genName) {
          findings.push(mk("k8s-missing-name", SEV.ERROR, "metadata.name", "\u7F3A\u5C11 metadata.name\uFF08\u6216 generateName\uFF09\u2014\u2014apply \u5931\u8D25", "\u8865 metadata.name\uFF0C\u5982 my-app"));
        } else if (name !== void 0 && name !== null && name !== "") {
          if (typeof name !== "string" || !validRfc1123(name)) {
            findings.push(mk("k8s-invalid-name", SEV.ERROR, "metadata.name", `\u300C${name}\u300D\u4E0D\u7B26\u5408 RFC1123 \u5B50\u57DF\u540D\u89C4\u8303\uFF08\u4EC5\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/-/.\uFF0C\u2264253 \u5B57\u7B26\uFF0C\u5F00\u5934\u7ED3\u5C3E\u987B\u4E3A\u5B57\u6BCD\u6216\u6570\u5B57\uFF09`, "\u6539\u4E3A\u5C0F\u5199\u8FDE\u5B57\u7B26\u5F0F\u547D\u540D\uFF0C\u5982 my-app-1"));
          }
        }
        for (const section of ["labels", "annotations"]) {
          const m = meta[section];
          if (isObj(m)) {
            for (const [k, v] of Object.entries(m)) {
              if (v !== null && typeof v !== "string") {
                findings.push(mk("k8s-label-value-type", SEV.ERROR, `metadata.${section}.${k}`, `${section}[${k}] \u7684\u503C\u662F ${typeof v}\uFF08${JSON.stringify(v)}\uFF09\u2014\u2014label/annotation \u503C\u53EA\u80FD\u662F\u5B57\u7B26\u4E32\uFF0Capply \u5373\u5931\u8D25\uFF08got ${typeof v}, expected string\uFF09`, `\u503C\u52A0\u5F15\u53F7\u6539\u4E3A\u5B57\u7B26\u4E32\uFF1A${k}: "${String(v)}"`));
              }
            }
          }
        }
      }
      const resource = {
        docIndex: ctx.docIndex,
        kind,
        apiVersion: typeof apiVersion === "string" ? apiVersion : String(apiVersion === void 0 || apiVersion === null ? "" : apiVersion),
        name: isObj(meta) && typeof meta.name === "string" ? meta.name : "",
        labels: isObj(meta) && isObj(meta.labels) ? meta.labels : null,
        selector: null,
        svcSelector: null,
        containerPorts: [],
        refs: [],
        podLabels: null,
        servicePorts: null,
        ingressBackends: null,
        rawSpec: null
      };
      const psPath = podSpecPath(kind);
      if (psPath) checkPodSpec(doc, psPath, kind, ctx, findings, resource);
      if (kind === "Pod") resource.podLabels = resource.labels;
      if (isWorkloadKind(kind)) checkWorkload(doc, kind, ctx, findings, resource);
      if (kind === "Job") {
        const spec = isObj(doc.spec) ? doc.spec : null;
        const tSpec = spec && isObj(spec.template) ? spec.template.spec : null;
        const rp = isObj(tSpec) ? tSpec.restartPolicy : void 0;
        if (rp === "Always") {
          findings.push(mk("k8s-restart-policy-job", SEV.ERROR, "spec.template.spec.restartPolicy", "Job \u7684 Pod restartPolicy \u4E0D\u80FD\u662F Always\uFF08apply \u5931\u8D25\uFF1AUnsupported value\uFF09", "Job \u7528 Never \u6216 OnFailure"));
        } else if (rp === void 0 || rp === null || rp === "") {
          findings.push(mk("k8s-restart-policy-job", SEV.ERROR, "spec.template.spec.restartPolicy", "Job \u7684 Pod restartPolicy \u7F3A\u7701\u65F6\u6309 Always \u5904\u7406\uFF0C\u5BF9 Job \u975E\u6CD5\uFF08apply \u5931\u8D25\uFF1AUnsupported value\uFF09", "\u663E\u5F0F\u5199 restartPolicy: Never\uFF08\u6216 OnFailure\uFF09"));
        }
      }
      if (kind === "CronJob") checkCronJob(doc, findings);
      if (kind === "Service") checkService(doc, findings, resource);
      if (kind === "Ingress") checkIngress(doc, findings, resource);
      return { findings, resource };
    }
    function eachContainer(podSpec, cb) {
      if (!isObj(podSpec)) return;
      for (const group of ["initContainers", "containers", "ephemeralContainers"]) {
        if (Array.isArray(podSpec[group])) {
          for (let i = 0; i < podSpec[group].length; i++) cb(podSpec[group][i], group, i, group === "initContainers");
        }
      }
    }
    function checkPodSpec(doc, psPath, kind, ctx, findings, resource) {
      const podSpec = psPath.split(".").reduce((acc, k) => isObj(acc) ? acc[k] : void 0, doc);
      if (!isObj(podSpec)) {
        findings.push(mk("k8s-missing-podspec", SEV.ERROR, psPath, `${kind} \u7F3A\u5C11 ${psPath}\uFF08PodSpec\uFF09\u2014\u2014\u8D44\u6E90\u4E0D\u5B8C\u6574\uFF0Capply \u5931\u8D25`, "\u8865\u9F50 spec.template.spec\uFF08containers \u5FC5\u586B\uFF09"));
        return;
      }
      const containersArr = Array.isArray(podSpec.containers) ? podSpec.containers : null;
      if (!containersArr || containersArr.length === 0) {
        findings.push(mk("k8s-no-containers", SEV.ERROR, psPath + ".containers", "containers \u4E3A\u7A7A\u6216\u7F3A\u5931\u2014\u2014\u6BCF\u4E2A Pod \u81F3\u5C11\u4E00\u4E2A\u5BB9\u5668\uFF0Capply \u5931\u8D25", "\u81F3\u5C11\u5B9A\u4E49\u4E00\u4E2A\u5BB9\u5668"));
        return;
      }
      const seen = /* @__PURE__ */ new Map();
      containersArr.forEach((c, i) => {
        if (isObj(c) && typeof c.name === "string") {
          if (seen.has(c.name)) {
            findings.push(mk("k8s-container-dup", SEV.ERROR, psPath + ".containers[" + i + "].name", `\u5BB9\u5668\u540D\u300C${c.name}\u300D\u91CD\u590D\uFF08\u4E0E\u7B2C ${seen.get(c.name) + 1} \u4E2A\u5BB9\u5668\uFF09\u2014\u2014Pod \u5185\u5BB9\u5668\u540D\u5FC5\u987B\u552F\u4E00\uFF0Capply \u5931\u8D25`, "\u91CD\u547D\u540D\u5176\u4E2D\u4E00\u4E2A\u5BB9\u5668"));
          } else seen.set(c.name, i);
        }
      });
      const podSc = isObj(podSpec.securityContext) ? podSpec.securityContext : null;
      const isServerKind = kind === "Pod" ? "pod" : kind === "Job" || kind === "CronJob" ? "job" : isWorkloadKind(kind) ? "server" : null;
      eachContainer(podSpec, (c, group, i, isInit) => {
        if (!isObj(c)) return;
        const base = psPath + "." + group + "[" + i + "]";
        const cName = typeof c.name === "string" ? c.name : `\u5BB9\u5668${i}`;
        const sc = isObj(c.securityContext) ? c.securityContext : null;
        if (c.image === void 0 || c.image === null || c.image === "") {
          findings.push(mk("k8s-image-missing", SEV.ERROR, base + ".image", `\u5BB9\u5668 ${cName} \u7F3A\u5C11 image\u2014\u2014\u955C\u50CF\u5FC5\u586B\uFF0Capply \u5931\u8D25`, "\u8865 image\uFF0C\u5982 nginx:1.27"));
        } else if (typeof c.image === "string") {
          const img = c.image;
          const afterColon = img.lastIndexOf(":");
          const tag = afterColon > img.lastIndexOf("/") ? img.slice(afterColon + 1) : "";
          if (!img.includes("@") && (tag === "" || tag === "latest")) {
            findings.push(mk("k8s-image-tag", SEV.WARN, base + ".image", `\u5BB9\u5668 ${cName} \u955C\u50CF ${img} \u672A\u9489\u7248\u672C${tag === "latest" ? "\uFF08:latest\uFF09" : "\uFF08\u7F3A tag\uFF0C\u7F3A\u7701\u5373 latest\uFF09"}\u2014\u2014\u62C9\u53D6\u7ED3\u679C\u968F\u65F6\u95F4\u6F02\u79FB\uFF0C\u56DE\u6EDA\u4E0D\u53EF\u590D\u73B0`, "\u9489\u5177\u4F53\u7248\u672C\uFF0C\u5982 nginx:1.27.3\uFF1B\u8981\u4E0D\u53EF\u53D8\u518D\u52A0 @sha256: \u6458\u8981"));
          }
        }
        if (sc && sc.privileged === true) {
          findings.push(mk("k8s-privileged", SEV.ERROR, base + ".securityContext.privileged", `\u5BB9\u5668 ${cName} privileged: true\u2014\u2014\u5BB9\u5668\u83B7\u5F97\u8282\u70B9\u7EA7\u5185\u6838\u6743\u9650\uFF0C\u7B49\u4EF7\u4E8E\u628A\u5BBF\u4E3B\u673A\u4EA4\u7ED9\u5BB9\u5668\u5185\u8FDB\u7A0B\uFF08\u5B89\u5168\u7EA2\u7EBF\uFF09`, "\u5173\u95ED privileged\uFF1B\u786E\u9700\u7279\u4F8B\u7528 capabilities.add \u7CBE\u786E\u6388\u6743\u5E76\u5199\u660E\u7406\u7531"));
        }
        if (!sc || sc.allowPrivilegeEscalation !== false) {
          findings.push(mk("k8s-priv-esc", SEV.WARN, base + ".securityContext.allowPrivilegeEscalation", `\u5BB9\u5668 ${cName} \u672A\u663E\u5F0F allowPrivilegeEscalation: false\u2014\u2014setuid \u4E8C\u8FDB\u5236\u53EF\u8D8A\u6743\u63D0\u5347`, "securityContext.allowPrivilegeEscalation: false"));
        }
        const runAsNonRoot = sc && sc.runAsNonRoot === true || podSc && podSc.runAsNonRoot === true;
        if (!runAsNonRoot) {
          findings.push(mk("k8s-run-as-root", SEV.WARN, base + ".securityContext.runAsNonRoot", `\u5BB9\u5668 ${cName} \u672A\u58F0\u660E runAsNonRoot\u2014\u2014\u955C\u50CF\u7F3A\u7701\u4EE5 root \u8FD0\u884C\uFF08\u5BB9\u5668\u5185 root + \u914D\u7F6E\u5931\u8BEF=\u9003\u9038\u653E\u5927\uFF09`, "securityContext.runAsNonRoot: true\uFF08\u914D\u5408 runAsUser\uFF09\uFF0C\u6216\u5728 podSpec.securityContext \u7EDF\u4E00\u8BBE\u7F6E"));
        }
        if (!sc || sc.readOnlyRootFilesystem !== true) {
          findings.push(mk("k8s-ro-fs", SEV.INFO, base + ".securityContext.readOnlyRootFilesystem", `\u5BB9\u5668 ${cName} \u672A\u8BBE readOnlyRootFilesystem: true\u2014\u2014\u53EF\u5199\u6839\u6587\u4EF6\u7CFB\u7EDF\u653E\u5927\u7BE1\u6539\u4E0E\u6301\u4E45\u5316\u98CE\u9669`, "\u6839\u6587\u4EF6\u7CFB\u7EDF\u53EA\u8BFB + \u628A\u4E34\u65F6\u5199\u5165\u76EE\u5F55\u6302 emptyDir"));
        }
        if (!(sc && isObj(sc.seccompProfile)) && !(podSc && isObj(podSc.seccompProfile))) {
          findings.push(mk("k8s-seccomp", SEV.INFO, base + ".securityContext.seccompProfile", `\u5BB9\u5668 ${cName} \u672A\u914D\u7F6E seccompProfile\u2014\u2014\u7CFB\u7EDF\u8C03\u7528\u9762\u672A\u6536\u7A84`, "securityContext.seccompProfile.type: RuntimeDefault"));
        }
        if (sc && isObj(sc.capabilities) && Array.isArray(sc.capabilities.add)) {
          for (const cap of sc.capabilities.add) {
            const up = String(cap).toUpperCase();
            if (DANGEROUS_CAPS.has(up)) {
              findings.push(mk("k8s-cap-add", SEV.WARN, base + ".securityContext.capabilities.add", `\u5BB9\u5668 ${cName} \u6DFB\u52A0\u5371\u9669\u80FD\u529B ${cap}\uFF08\u654F\u611F\u5185\u6838\u63A5\u53E3/\u8FDB\u7A0B\u64CD\u63A7\uFF09`, `\u786E\u8BA4\u5FC5\u8981\u6027\uFF1B\u80FD\u7528\u66F4\u5C0F\u7C92\u5EA6\u5C31\u4E0D\u52A0 ${cap}`));
            }
          }
        }
        for (const k of ["hostNetwork", "hostPID", "hostIPC"]) {
          if (podSpec[k] === true) {
            const why = { hostNetwork: "\u5171\u4EAB\u5BBF\u4E3B\u673A\u7F51\u7EDC\u6808\uFF08\u53EF\u89E6\u8FBE\u8282\u70B9\u5168\u90E8 localhost \u670D\u52A1\u4E0E\u6D41\u91CF\uFF09", hostPID: "\u5171\u4EAB\u5BBF\u4E3B\u673A\u8FDB\u7A0B\u547D\u540D\u7A7A\u95F4\uFF08\u53EF\u7AA5\u89C6\u5E76\u4FE1\u53F7\u6740\u5BBF\u4E3B\u673A\u8FDB\u7A0B\uFF09", hostIPC: "\u5171\u4EAB\u5BBF\u4E3B\u673A IPC \u547D\u540D\u7A7A\u95F4" }[k];
            findings.push(mk("k8s-host-ns", SEV.ERROR, psPath + "." + k, `podSpec.${k}: true\u2014\u2014${why}\uFF0C\u5B89\u5168\u7EA2\u7EBF`, "\u5173\u95ED\uFF1B\u786E\u9700\u7279\u4F8B\u5728\u53D7\u63A7\u8282\u70B9\u5355\u72EC\u90E8\u7F72\u5E76\u9650\u5236\u8C03\u5EA6"));
          }
        }
        if (Array.isArray(podSpec.volumes)) {
          podSpec.volumes.forEach((v, vi) => {
            if (isObj(v) && isObj(v.hostPath)) {
              findings.push(mk("k8s-hostpath", SEV.ERROR, psPath + ".volumes[" + vi + "].hostPath", `\u5377 ${typeof v.name === "string" ? v.name : vi} \u4F7F\u7528 hostPath\uFF08${v.hostPath.path || "?"}\uFF09\u2014\u2014\u76F4\u63A5\u6302\u8F7D\u8282\u70B9\u6587\u4EF6\u7CFB\u7EDF\uFF0C\u5BB9\u5668\u5931\u9677=\u8282\u70B9\u5931\u9677\u5165\u53E3`, "\u4F18\u5148 PVC / emptyDir\uFF1B\u786E\u9700\u8282\u70B9\u4FE1\u606F\u7528 downward API \u6216 DaemonSet + \u53EA\u8BFB\u7CBE\u786E\u8DEF\u5F84"));
            }
          });
        }
        if (podSpec.automountServiceAccountToken !== false && kind !== "Job" && kind !== "CronJob") {
          findings.push(mk("k8s-automount-sa", SEV.INFO, psPath + ".automountServiceAccountToken", "Pod \u81EA\u52A8\u6302\u8F7D ServiceAccount token\uFF08K8s \u9ED8\u8BA4\u884C\u4E3A\uFF09\u2014\u2014\u5BB9\u5668\u5185\u53EF\u8BBF\u95EE Kubernetes API", "\u4E0D\u7528 API \u7684\u4E1A\u52A1\u5BB9\u5668\u663E\u5F0F automountServiceAccountToken: false\uFF0C\u6536\u7A84\u653B\u51FB\u9762"));
        }
        if (!isInit) {
          const res = isObj(c.resources) ? c.resources : null;
          const hasLimits = !!(res && isObj(res.limits) && Object.keys(res.limits).length);
          const hasRequests = !!(res && isObj(res.requests) && Object.keys(res.requests).length);
          if (!hasLimits) {
            findings.push(mk("k8s-no-limits", isServerKind === "job" ? SEV.INFO : SEV.WARN, base + ".resources.limits", `\u5BB9\u5668 ${cName} \u672A\u8BBE\u7F6E\u8D44\u6E90 limits\u2014\u2014\u53EF\u65E0\u4E0A\u9650\u5403\u6EE1\u8282\u70B9\u8D44\u6E90\uFF0C\u89E6\u53D1\u8282\u70B9\u7ADE\u4E89\u6216 OOM \u9A71\u9010\u90BB\u5C45`, "resources.limits: {cpu, memory}"));
          }
          if (hasLimits && !hasRequests) {
            findings.push(mk("k8s-no-requests", SEV.INFO, base + ".resources.requests", `\u5BB9\u5668 ${cName} \u6709 limits \u65E0 requests\u2014\u2014\u8C03\u5EA6\u5668\u6309 0 \u8D44\u6E90\u88C5\u7BB1\uFF0C\u8FC7\u8F7D\u98CE\u9669\u4E0D\u53EF\u89C1`, "resources.requests \u4E0E limits \u4E00\u81F4\uFF08Guaranteed QoS\uFF09"));
          }
          if (hasLimits && hasRequests) {
            for (const r of ["cpu", "memory"]) {
              const req = res.requests[r];
              const lim = res.limits[r];
              if (req !== void 0 && lim !== void 0 && typeof req === "string" && typeof lim === "string" && cmpQuantity(req, lim) > 0) {
                findings.push(mk("k8s-req-gt-limit", SEV.ERROR, base + ".resources.requests." + r, `\u5BB9\u5668 ${cName} requests.${r}\uFF08${req}\uFF09\u5927\u4E8E limits.${r}\uFF08${lim}\uFF09\u2014\u2014apiserver \u76F4\u63A5\u62D2\u7EDD\uFF08must be less than or equal to limit\uFF09`, "\u8C03\u9F50 requests \u2264 limits"));
              }
            }
          }
        }
        if (!isInit && (isServerKind === "server" || isServerKind === "pod")) {
          const sevP = isServerKind === "pod" ? SEV.INFO : SEV.WARN;
          if (!isObj(c.livenessProbe)) {
            findings.push(mk("k8s-no-liveness", sevP, base + ".livenessProbe", `\u5BB9\u5668 ${cName} \u7F3A\u5C11 livenessProbe\u2014\u2014\u8FDB\u7A0B\u5047\u6B7B\uFF08\u6B7B\u9501/\u50F5\u6B7B\u8FDE\u63A5\uFF09\u65E0\u6CD5\u81EA\u6108`, "\u52A0 livenessProbe\uFF08httpGet/tcpSocket/exec \u4EFB\u4E00\uFF09"));
          }
          if (!isObj(c.readinessProbe)) {
            findings.push(mk("k8s-no-readiness", sevP, base + ".readinessProbe", `\u5BB9\u5668 ${cName} \u7F3A\u5C11 readinessProbe\u2014\u2014\u542F\u52A8\u671F\u95F4\u4E0E\u4F9D\u8D56\u672A\u5C31\u7EEA\u65F6\u4ECD\u4F1A\u88AB\u6295\u6D41`, "\u52A0 readinessProbe\uFF08\u542F\u52A8\u6162\u518D\u914D startupProbe\uFF09"));
          }
        }
        if (Array.isArray(c.env)) {
          c.env.forEach((e, ei) => {
            if (!isObj(e) || typeof e.name !== "string" || !SECRET_NAME_RE.test(e.name)) return;
            if (e.value !== void 0 && e.value !== null && e.value !== "") {
              const p = base + ".env[" + ei + "].value";
              if (isPlaceholderValue(e.value)) {
                findings.push(mk("k8s-plaintext-secret", SEV.INFO, p, `\u73AF\u5883\u53D8\u91CF ${e.name} \u540D\u5B57\u654F\u611F\u4F46\u503C\u7591\u4F3C\u5360\u4F4D\u7B26\u2014\u2014\u4E0A\u7EBF\u524D\u8BB0\u5F97\u6362\u6210 Secret \u6CE8\u5165`, "\u7528 valueFrom.secretKeyRef \u4ECE Secret \u6CE8\u5165"));
              } else {
                findings.push(mk("k8s-plaintext-secret", SEV.ERROR, p, `\u73AF\u5883\u53D8\u91CF ${e.name} \u7591\u4F3C\u660E\u6587\u5BC6\u94A5\u2014\u2014\u6E05\u5355\u8FDB Git/etcd \u540E\u6CC4\u9732\u9762\u6781\u5927\uFF08\u6240\u6709\u53EF\u8BFB\u8BE5\u8D44\u6E90\u7684\u4EBA\u53EF\u89C1\uFF09`, "\u6539 valueFrom.secretKeyRef\uFF08Secret \u72EC\u7ACB\u7BA1\u7406\uFF0C\u53EF\u63A5 sealed-secrets/\u5916\u90E8 KMS\uFF09"));
              }
            }
          });
        }
        if (!isInit && Array.isArray(c.ports)) {
          c.ports.forEach((pt) => {
            if (isObj(pt)) resource.containerPorts.push({ container: cName, port: pt.containerPort, name: pt.name });
          });
        }
      });
      if (Array.isArray(podSpec.volumes)) {
        podSpec.volumes.forEach((v) => {
          if (!isObj(v)) return;
          if (isObj(v.configMap) && typeof v.configMap.name === "string") resource.refs.push({ type: "ConfigMap", name: v.configMap.name, optional: v.configMap.optional === true });
          if (isObj(v.secret) && typeof v.secret.secretName === "string") resource.refs.push({ type: "Secret", name: v.secret.secretName, optional: v.secret.optional === true });
          if (isObj(v.persistentVolumeClaim) && typeof v.persistentVolumeClaim.claimName === "string") resource.refs.push({ type: "PersistentVolumeClaim", name: v.persistentVolumeClaim.claimName, optional: v.persistentVolumeClaim.optional === true });
        });
      }
      eachContainer(podSpec, (c) => {
        if (!isObj(c)) return;
        if (Array.isArray(c.envFrom)) {
          c.envFrom.forEach((ef) => {
            if (!isObj(ef)) return;
            if (isObj(ef.configMapRef) && typeof ef.configMapRef.name === "string") resource.refs.push({ type: "ConfigMap", name: ef.configMapRef.name, optional: ef.configMapRef.optional === true });
            if (isObj(ef.secretRef) && typeof ef.secretRef.name === "string") resource.refs.push({ type: "Secret", name: ef.secretRef.name, optional: ef.secretRef.optional === true });
          });
        }
        if (Array.isArray(c.env)) {
          c.env.forEach((e) => {
            if (!isObj(e) || !isObj(e.valueFrom)) return;
            if (isObj(e.valueFrom.configMapKeyRef) && typeof e.valueFrom.configMapKeyRef.name === "string") resource.refs.push({ type: "ConfigMap", name: e.valueFrom.configMapKeyRef.name, optional: e.valueFrom.configMapKeyRef.optional === true });
            if (isObj(e.valueFrom.secretKeyRef) && typeof e.valueFrom.secretKeyRef.name === "string") resource.refs.push({ type: "Secret", name: e.valueFrom.secretKeyRef.name, optional: e.valueFrom.secretKeyRef.optional === true });
          });
        }
      });
      if (Array.isArray(podSpec.imagePullSecrets)) {
        podSpec.imagePullSecrets.forEach((s) => {
          if (isObj(s) && typeof s.name === "string") resource.refs.push({ type: "Secret", name: s.name, optional: true });
        });
      }
    }
    function cmpQuantity(a, b) {
      const pa = parseQuantity(a);
      const pb = parseQuantity(b);
      if (pa === null || pb === null) return 0;
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    }
    function parseQuantity(q) {
      const m = /^(\d+(?:\.\d+)?)(m|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei)?$/.exec(String(q).trim());
      if (!m) return null;
      const n = parseFloat(m[1]);
      switch (m[2]) {
        case void 0:
        case "":
          return n;
        case "m":
          return n / 1e3;
        case "k":
          return n * 1e3;
        case "M":
          return n * 1e6;
        case "G":
          return n * 1e9;
        case "T":
          return n * 1e12;
        case "P":
          return n * 1e15;
        case "E":
          return n * 1e18;
        case "Ki":
          return n * 1024;
        case "Mi":
          return n * 1024 ** 2;
        case "Gi":
          return n * 1024 ** 3;
        case "Ti":
          return n * 1024 ** 4;
        case "Pi":
          return n * 1024 ** 5;
        case "Ei":
          return n * 1024 ** 6;
        default:
          return null;
      }
    }
    function checkWorkload(doc, kind, ctx, findings, resource) {
      const spec = isObj(doc.spec) ? doc.spec : null;
      if (!spec) {
        findings.push(mk("k8s-missing-spec", SEV.ERROR, "spec", `${kind} \u7F3A\u5C11 spec\u2014\u2014apply \u5931\u8D25`, "\u8865 spec"));
        return;
      }
      if (kind !== "Job" && kind !== "CronJob") {
        if (spec.replicas === void 0) {
          findings.push(mk("k8s-single-replica", SEV.INFO, "spec.replicas", `${kind} \u672A\u663E\u5F0F\u8BBE\u7F6E replicas\uFF08\u7F3A\u7701\u4E3A 1\uFF09\u2014\u2014\u6EDA\u52A8\u66F4\u65B0\u671F\u95F4\u5B58\u5728\u5355\u526F\u672C\u670D\u52A1\u7A7A\u7A97`, "\u751F\u4EA7\u8D1F\u8F7D\u663E\u5F0F replicas: 2+"));
        } else if (spec.replicas === 1) {
          findings.push(mk("k8s-single-replica", SEV.INFO, "spec.replicas", "replicas: 1\u2014\u2014\u6EDA\u52A8\u66F4\u65B0\u77AC\u95F4\u65B0\u65E7\u4EA4\u66FF\uFF0C\u541E\u5410\u51CF\u534A\u4E14\u5B58\u5728\u7A7A\u7A97\u98CE\u9669", "\u9AD8\u53EF\u7528\u8D1F\u8F7D\u5EFA\u8BAE replicas: 2+"));
        }
        if (isObj(spec.strategy) && spec.strategy.type === "Recreate") {
          findings.push(mk("k8s-recreate-strategy", SEV.INFO, "spec.strategy.type", "strategy: Recreate\u2014\u2014\u66F4\u65B0\u65F6\u5148\u6740\u5168\u90E8\u65E7 Pod \u518D\u5EFA\u65B0\uFF0C\u5B58\u5728\u670D\u52A1\u5168\u505C\u7A97\u53E3", "\u65E0\u72B6\u6001\u670D\u52A1\u5EFA\u8BAE RollingUpdate\uFF08\u7F3A\u7701\uFF09"));
        }
      }
      const sel = spec.selector;
      const tmpl = isObj(spec.template) ? spec.template : null;
      const tmplLabels = tmpl && isObj(tmpl.metadata) && isObj(tmpl.metadata.labels) ? tmpl.metadata.labels : null;
      resource.podLabels = tmplLabels;
      if (!isObj(sel) || !isObj(sel.matchLabels) && !Array.isArray(sel.matchExpressions)) {
        findings.push(mk("k8s-selector-missing", SEV.ERROR, "spec.selector", `${kind} \u7F3A\u5C11 spec.selector\uFF08matchLabels/matchExpressions\uFF09\u2014\u2014apps/v1 \u8D77\u5FC5\u586B\uFF0Capply \u5373\u5931\u8D25`, "\u8865 spec.selector.matchLabels\uFF0C\u952E\u503C\u5FC5\u987B\u5168\u90E8\u51FA\u73B0\u5728 template.metadata.labels"));
      } else if (isObj(sel.matchLabels)) {
        resource.selector = sel.matchLabels;
        if (tmplLabels) {
          for (const [k, v] of Object.entries(sel.matchLabels)) {
            if (!(k in tmplLabels)) {
              findings.push(mk("k8s-selector-mismatch", SEV.ERROR, "spec.selector.matchLabels." + k, `selector \u8981\u6C42 label ${k}=${JSON.stringify(v)}\uFF0C\u4F46 template.metadata.labels \u6CA1\u6709 ${k}\u2014\u2014apply \u5373\u5931\u8D25\uFF08Invalid value: selector does not match template labels\uFF09`, "\u5728 template.metadata.labels \u8865\u9F50\u8BE5\u6807\u7B7E"));
            } else if (String(tmplLabels[k]) !== String(v)) {
              findings.push(mk("k8s-selector-mismatch", SEV.ERROR, "spec.selector.matchLabels." + k, `selector \u8981\u6C42 ${k}=${JSON.stringify(v)}\uFF0Ctemplate \u5B9E\u9645\u662F ${JSON.stringify(tmplLabels[k])}\u2014\u2014\u503C\u4E0D\u76F8\u7B49\uFF0Capply \u5373\u5931\u8D25`, "\u5BF9\u9F50 selector \u4E0E template.labels \u7684\u503C\uFF08\u6CE8\u610F\u6570\u5B57\u52A0\u5F15\u53F7\u53D8\u5B57\u7B26\u4E32\uFF09"));
            }
          }
        } else if (tmpl) {
          findings.push(mk("k8s-selector-mismatch", SEV.ERROR, "spec.template.metadata.labels", "template.metadata \u7F3A\u5C11 labels\u2014\u2014selector \u65E0\u4ECE\u5339\u914D\uFF0Capply \u5373\u5931\u8D25", "\u7ED9 template.metadata \u8865 labels\uFF0C\u8986\u76D6 selector.matchLabels \u5168\u90E8\u952E\u503C"));
        }
      }
    }
    function checkCronJob(doc, findings) {
      const spec = isObj(doc.spec) ? doc.spec : null;
      if (!spec || typeof spec.schedule !== "string" || !spec.schedule.trim()) {
        findings.push(mk("k8s-cron-missing", SEV.ERROR, "spec.schedule", "CronJob \u7F3A\u5C11 spec.schedule\u2014\u2014apply \u5931\u8D25\uFF08\u5FC5\u586B\uFF09", '\u8865 schedule\uFF0C\u5982 "*/5 * * * *"'));
        return;
      }
      const v = validateK8sCron(spec.schedule);
      if (!v.ok) {
        findings.push(mk("k8s-cron-invalid", SEV.ERROR, "spec.schedule", `schedule\u300C${spec.schedule}\u300D\u65E0\u6548\uFF1A${v.detail}`, "\u6807\u51C6 5 \u6BB5 cron\uFF08\u5206 \u65F6 \u65E5 \u6708 \u661F\u671F\uFF09\uFF1B\u652F\u6301 @hourly/@daily \u7B80\u5199\u4E0E CRON_TZ=Asia/Shanghai \u524D\u7F00"));
      }
      if (spec.concurrencyPolicy !== void 0 && !["Allow", "Forbid", "Replace"].includes(spec.concurrencyPolicy)) {
        findings.push(mk("k8s-cron-concurrency", SEV.ERROR, "spec.concurrencyPolicy", `concurrencyPolicy\u300C${spec.concurrencyPolicy}\u300D\u975E\u6CD5\uFF08\u53EA\u5141\u8BB8 Allow/Forbid/Replace\uFF09\u2014\u2014apply \u5931\u8D25`, "\u6539\u6B63\u53D6\u503C"));
      }
    }
    var KCRON_BOUNDS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
    var KCRON_NAMES = [
      { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 },
      { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
    ];
    function validateK8sCron(expr) {
      let e = String(expr).trim();
      const tzM = /^(?:CRON_TZ|TZ)=[^\s]+\s+/.exec(e);
      if (tzM) e = e.slice(tzM[0].length);
      if (e.startsWith("@")) {
        return ["@yearly", "@annually", "@monthly", "@weekly", "@daily", "@midnight", "@hourly"].includes(e) ? { ok: true, detail: "" } : { ok: false, detail: `\u672A\u77E5\u7B80\u5199 ${e}\uFF08\u652F\u6301 @yearly/@monthly/@weekly/@daily/@hourly\uFF09` };
      }
      if (e.includes("?")) return { ok: false, detail: "K8s cron \u4E0D\u652F\u6301 ? \u5360\u4F4D\uFF08Quartz \u8BED\u6CD5\uFF09\uFF0C\u7528 * \u4EE3\u66FF" };
      const fields = e.split(/\s+/);
      if (fields.length !== 5) return { ok: false, detail: `\u5E94\u4E3A 5 \u6BB5\uFF08\u5206 \u65F6 \u65E5 \u6708 \u661F\u671F\uFF09\uFF0C\u5B9E\u9645 ${fields.length} \u6BB5` };
      for (let f = 0; f < 5; f++) {
        const [lo, hi] = KCRON_BOUNDS[f];
        for (const item of fields[f].split(",")) {
          const m = /^(\*|\d+|[A-Za-z]{3})(?:-(\d+|[A-Za-z]{3}))?(?:\/(\d+))?$/.exec(item);
          if (!m) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B` };
          const names = f === 3 ? KCRON_NAMES[0] : f === 4 ? KCRON_NAMES[1] : null;
          const num = (tok) => {
            if (/^\d+$/.test(tok)) return parseInt(tok, 10);
            if (names && names[tok.toUpperCase()] !== void 0) return names[tok.toUpperCase()];
            return NaN;
          };
          const a = num(m[1]);
          if (m[1] !== "*") {
            if (Number.isNaN(a)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u542B\u65E0\u6548\u6570\u503C/\u540D\u79F0` };
            if (a < lo || a > hi && !(f === 4 && a === 7)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8D85\u51FA\u8303\u56F4 ${lo}-${hi}` };
          }
          if (m[2]) {
            const b = num(m[2]);
            if (Number.isNaN(b)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8303\u56F4\u7EC8\u70B9\u65E0\u6548` };
            if (b < lo || b > hi && !(f === 4 && b === 7)) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8303\u56F4\u8D85\u51FA ${lo}-${hi}` };
            if (m[1] !== "*" && a > b) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u8303\u56F4\u8D77\u70B9\u5927\u4E8E\u7EC8\u70B9` };
          }
          if (m[3] && parseInt(m[3], 10) < 1) return { ok: false, detail: `\u7B2C ${f + 1} \u6BB5\u300C${item}\u300D\u6B65\u957F\u987B \u22651` };
        }
      }
      return { ok: true, detail: "" };
    }
    function checkService(doc, findings, resource) {
      const spec = isObj(doc.spec) ? doc.spec : null;
      if (!spec) {
        findings.push(mk("k8s-missing-spec", SEV.ERROR, "spec", "Service \u7F3A\u5C11 spec\u2014\u2014apply \u5931\u8D25", "\u8865 spec\uFF08ports/selector\uFF09"));
        return;
      }
      resource.servicePorts = Array.isArray(spec.ports) ? spec.ports : [];
      const isExternalName = spec.type === "ExternalName";
      if (!Array.isArray(spec.ports) || spec.ports.length === 0) {
        if (!isExternalName) {
          findings.push(mk("k8s-svc-no-ports", SEV.ERROR, "spec.ports", "Service \u7F3A\u5C11 spec.ports\u2014\u2014apply \u5931\u8D25\uFF08ExternalName \u9664\u5916\uFF09", "\u8865 ports: [{port, targetPort}]"));
        }
        return;
      }
      if (isExternalName) return;
      const sel = spec.selector;
      if (!isObj(sel) || Object.keys(sel).length === 0) {
        findings.push(mk("k8s-svc-no-target", SEV.INFO, "spec.selector", "Service \u65E0 selector\u2014\u2014\u6D41\u91CF\u8D70\u624B\u52A8\u7EF4\u62A4\u7684 Endpoints/EndpointSlice\uFF08\u82E5\u975E\u6709\u610F\u4E3A\u4E4B\u9700\u8865 selector\uFF09", "\u5E38\u89C4\u670D\u52A1\u8865 spec.selector"));
      } else {
        resource.svcSelector = sel;
      }
      spec.ports.forEach((p, i) => {
        if (isObj(p) && p.targetPort === void 0) {
          findings.push(mk("k8s-svc-targetport-default", SEV.INFO, "spec.ports[" + i + "].targetPort", `\u7AEF\u53E3 ${p.port} \u672A\u663E\u5F0F targetPort\uFF08\u7F3A\u7701\u4E0E port \u540C\u503C\uFF09\u2014\u2014\u5BB9\u5668\u7AEF\u53E3\u91CD\u6784\u65F6\u6613\u9759\u9ED8\u65AD\u6D41`, "\u663E\u5F0F\u5199 targetPort"));
        }
      });
    }
    function checkIngress(doc, findings, resource) {
      const spec = isObj(doc.spec) ? doc.spec : null;
      if (!spec) return;
      const isV1 = doc.apiVersion === "networking.k8s.io/v1";
      const hasClass = spec.ingressClassName !== void 0 || isObj(doc.metadata) && isObj(doc.metadata.annotations) && "kubernetes.io/ingress.class" in doc.metadata.annotations;
      if (!hasClass) {
        findings.push(mk("k8s-ingress-class", SEV.INFO, "spec.ingressClassName", "\u672A\u6307\u5B9A ingressClassName\uFF08\u4E5F\u6CA1\u6709 kubernetes.io/ingress.class \u6CE8\u89E3\uFF09\u2014\u2014\u96C6\u7FA4\u7F3A\u7701 IngressClass \u4E0D\u4E00\u5B9A\u5B58\u5728\uFF0C\u53EF\u80FD\u4E0D\u751F\u6548", "\u663E\u5F0F spec.ingressClassName: nginx \u7B49"));
      }
      resource.ingressBackends = [];
      if (isV1 && Array.isArray(spec.rules)) {
        spec.rules.forEach((r, ri) => {
          if (!isObj(r) || !isObj(r.http) || !Array.isArray(r.http.paths)) return;
          r.http.paths.forEach((p, pi) => {
            if (!isObj(p)) return;
            const b = p.backend;
            if (!isObj(b) || !isObj(b.service) || !b.service.name) {
              findings.push(mk("k8s-ingress-backend-shape", SEV.ERROR, `spec.rules[${ri}].http.paths[${pi}].backend`, "networking.k8s.io/v1 \u7684 backend \u5FC5\u987B\u662F {service: {name, port: {number|name}}} \u7ED3\u6784\uFF08v1beta1 \u7684 serviceName/servicePort \u5199\u6CD5\u5DF2\u5931\u6548\uFF0Capply \u5931\u8D25\uFF09", "backend.service.name + backend.service.port.number"));
              return;
            }
            resource.ingressBackends.push({
              name: b.service.name,
              port: b.service.port ? b.service.port.number !== void 0 ? b.service.port.number : b.service.port.name : void 0,
              path: `spec.rules[${ri}].http.paths[${pi}].backend`
            });
          });
        });
      }
    }
    function crossCheck(resources, ctxOf) {
      const findings = [];
      const byKind = /* @__PURE__ */ new Map();
      for (const r of resources) {
        if (!r || !r.name) continue;
        if (!byKind.has(r.kind)) byKind.set(r.kind, /* @__PURE__ */ new Map());
        byKind.get(r.kind).set(r.name, r);
      }
      const find = (kind, name) => byKind.get(kind) ? byKind.get(kind).get(name) : void 0;
      for (const r of resources) {
        if (!r) continue;
        const c = ctxOf(r);
        for (const ref of r.refs) {
          if (!find(ref.type, ref.name)) {
            const opt = ref.optional ? "\uFF08\u58F0\u660E optional\uFF0C\u7F3A\u5931\u53EF\u5BB9\u5FCD\uFF09" : "";
            findings.push(withDoc(mk("k8s-ref-missing", SEV.INFO, "", `${r.kind}/${r.name} \u5F15\u7528\u7684 ${ref.type}\u300C${ref.name}\u300D\u672A\u5728\u672C\u6279\u6E05\u5355\u4E2D\u5B9A\u4E49${opt}\uFF08\u96C6\u7FA4\u5DF2\u5B58\u5728\u5219\u53EF\u5FFD\u7565\uFF1B\u6574\u6279\u90E8\u7F72\u4F1A\u7F3A\u8D44\u6E90\uFF09`, `\u5728\u672C\u6279\u6E05\u5355\u8865 ${ref.type}/${ref.name}\uFF0C\u6216\u786E\u8BA4\u5176\u5DF2\u5728\u96C6\u7FA4\u4E2D`), r, c));
          }
        }
        if (r.kind === "Service" && r.svcSelector) {
          const target = matchWorkload(resources, r.svcSelector);
          if (!target) {
            findings.push(withDoc(mk("k8s-svc-no-target", SEV.WARN, "spec.selector", `Service\u300C${r.name}\u300D\u7684 selector \u5728\u672C\u6279\u6E05\u5355\u4E2D\u5339\u914D\u4E0D\u5230\u4EFB\u4F55 Pod/workload\u2014\u2014\u82E5\u96C6\u7FA4\u4E2D\u4E5F\u6CA1\u6709\u5339\u914D Pod\uFF0CService \u5C06\u65E0\u540E\u7AEF\uFF08Connection refused\uFF09`, "\u6838\u5BF9 selector \u952E\u503C\u4E0E workload template.labels \u4E00\u81F4"), r, c));
          } else {
            for (const p of r.servicePorts || []) {
              if (!isObj(p)) continue;
              const tp = p.targetPort === void 0 ? p.port : p.targetPort;
              if (tp === void 0 || tp === null) continue;
              const hit = target.containerPorts.some((cp) => String(cp.port) === String(tp) || cp.name !== void 0 && cp.name === tp);
              if (!hit) {
                findings.push(withDoc(mk("k8s-svc-port-mismatch", SEV.WARN, "spec.ports[].targetPort", `Service\u300C${r.name}\u300D\u7684 targetPort ${tp} \u5728\u5339\u914D\u7684 ${target.kind}/${target.name} \u5BB9\u5668\u7AEF\u53E3\uFF08${target.containerPorts.map((x) => x.port).join(", ") || "\u65E0"}\uFF09\u4E2D\u4E0D\u5B58\u5728\u2014\u2014\u6D41\u91CF\u5230 Pod \u5373\u88AB\u62D2`, "\u5BF9\u9F50 targetPort \u4E0E\u5BB9\u5668 containerPort"), r, c));
              }
            }
          }
        }
        if (r.kind === "StatefulSet") {
          const sn = r.rawSpec && r.rawSpec.serviceName;
          if (typeof sn === "string" && sn && !find("Service", sn)) {
            findings.push(withDoc(mk("k8s-sts-service-missing", SEV.WARN, "spec.serviceName", `StatefulSet\u300C${r.name}\u300D\u7684 serviceName\u300C${sn}\u300D\u672A\u5728\u672C\u6279\u6E05\u5355\u4E2D\u5B9A\u4E49\u2014\u2014headless Service \u662F StatefulSet \u7A33\u5B9A\u7F51\u7EDC\u8EAB\u4EFD\u7684\u524D\u63D0`, "\u8865\u4E00\u4E2A clusterIP: None \u7684 Service\uFF08\u540D\u5B57=serviceName\uFF09"), r, c));
          }
        }
        if (r.kind === "Ingress" && Array.isArray(r.ingressBackends)) {
          for (const b of r.ingressBackends) {
            const svc = find("Service", b.name);
            if (!svc) {
              findings.push(withDoc(mk("k8s-ingress-svc-missing", SEV.WARN, b.path + ".service", `Ingress \u5F15\u7528\u7684 Service\u300C${b.name}\u300D\u672A\u5728\u672C\u6279\u6E05\u5355\u4E2D\u5B9A\u4E49\uFF08\u96C6\u7FA4\u5DF2\u6709\u5219\u53EF\u5FFD\u7565\uFF09`, `\u8865 Service/${b.name} \u6216\u786E\u8BA4\u5176\u5B58\u5728`), r, c));
            } else if (svc.servicePorts && b.port !== void 0 && b.port !== null) {
              const hit = svc.servicePorts.some((sp) => isObj(sp) && (String(sp.port) === String(b.port) || sp.name === b.port));
              if (!hit) {
                findings.push(withDoc(mk("k8s-ingress-port-mismatch", SEV.WARN, b.path + ".service.port", `Ingress \u6307\u5411 Service\u300C${b.name}\u300D\u7684\u7AEF\u53E3 ${b.port}\uFF0C\u4F46\u8BE5 Service \u7AEF\u53E3\u662F ${svc.servicePorts.map((sp) => isObj(sp) ? sp.port : "?").join(", ")}\u2014\u2014\u8BF7\u6C42\u843D\u5230 Default Backend\uFF08404\uFF09`, "\u5BF9\u9F50 backend.service.port.number \u4E0E Service \u7AEF\u53E3"), r, c));
              }
            }
          }
        }
      }
      return findings;
      function withDoc(f, r, c) {
        f.docIndex = r.docIndex;
        f.line = lineForPath(c.lineIndex(r), f.path, c.startLine(r));
        return f;
      }
    }
    function matchWorkload(resources, selector) {
      const entries = Object.entries(selector);
      const candidates = [];
      for (const r of resources) {
        if (!r || !r.podLabels || !r.name) continue;
        if (!["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod"].includes(r.kind)) continue;
        if (entries.every(([k, v]) => String(r.podLabels[k]) === String(v))) candidates.push(r);
      }
      const pod = candidates.find((x) => x.kind === "Pod");
      const pick = pod || candidates[0];
      return pick ? { kind: pick.kind, name: pick.name, containerPorts: pick.containerPorts } : null;
    }
    function lint2(text, opts) {
      const parseYaml = opts && opts.parseYaml;
      if (!parseYaml) throw new Error("k8s-core \u9700\u8981 opts.parseYaml\uFF08\u8C03\u7528\u65B9\u6CE8\u5165 js-yaml load\uFF09");
      const pieces = splitDocs(text);
      const resources = [];
      const docResults = [];
      const allFindings = [];
      let helmDocs = 0;
      const mkCtx = (startLine, lineIndex) => ({
        startLine: () => startLine,
        lineIndex: () => lineIndex
      });
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        const relLines = piece.text.split(/\r?\n/);
        const docSpan = { startLine: piece.startLine, endLine: piece.startLine + relLines.length - 1 };
        if (looksLikeHelm(piece.text)) {
          helmDocs++;
          docResults.push({ index: i, startLine: docSpan.startLine, endLine: docSpan.endLine, kind: null, name: null, apiVersion: null, helm: true, findings: [] });
          continue;
        }
        let doc;
        try {
          doc = parseYaml(piece.text);
        } catch (e) {
          const markLine = e && e.mark && typeof e.mark.line === "number" ? e.mark.line + 1 : 1;
          const f = mk("k8s-yaml-syntax", SEV.ERROR, "", `YAML \u8BED\u6CD5\u9519\u8BEF\uFF08\u7B2C ${i + 1} \u4E2A\u6587\u6863\uFF09\uFF1A${e && e.message || "\u89E3\u6790\u5931\u8D25"}`, "\u4FEE\u590D YAML \u7F29\u8FDB/\u5192\u53F7/\u5F15\u53F7\u540E\u91CD\u8BD5");
          f.line = piece.startLine + markLine - 1;
          f.docIndex = i;
          allFindings.push(f);
          docResults.push({ index: i, startLine: docSpan.startLine, endLine: docSpan.endLine, kind: null, name: null, apiVersion: null, error: true, findings: [f] });
          continue;
        }
        if (doc === null || doc === void 0) continue;
        const lineIndex = buildLineIndex(relLines);
        const ctx = { docIndex: i, startLine: docSpan.startLine, lineIndex };
        const r = lintDoc(doc, ctx);
        for (const f of r.findings) {
          f.line = lineForPath(lineIndex, f.path, docSpan.startLine);
          f.docIndex = i;
        }
        if (r.resource) {
          r.resource.rawSpec = isObj(doc.spec) ? doc.spec : null;
          resources.push(r.resource);
        }
        docResults.push({
          index: i,
          startLine: docSpan.startLine,
          endLine: docSpan.endLine,
          kind: r.resource ? r.resource.kind : null,
          name: r.resource ? r.resource.name : null,
          apiVersion: r.resource ? r.resource.apiVersion : null,
          findings: r.findings,
          _lineIndex: lineIndex
        });
        allFindings.push(...r.findings);
      }
      const cross = crossCheck(resources, (res) => ({
        lineIndex: () => {
          const d = docResults.find((x) => x.index === res.docIndex);
          return d ? d._lineIndex : /* @__PURE__ */ new Map();
        },
        startLine: () => {
          const d = docResults.find((x) => x.index === res.docIndex);
          return d ? d.startLine : 1;
        }
      }));
      allFindings.push(...cross);
      const stats = {
        docs: docResults.filter((d) => !d.helm && !d.error).length,
        rules: RULE_COUNT2,
        error: allFindings.filter((f) => f.level === SEV.ERROR).length,
        warn: allFindings.filter((f) => f.level === SEV.WARN).length,
        info: allFindings.filter((f) => f.level === SEV.INFO).length,
        helmDocs
      };
      const score = scoreOf(stats);
      return { kind: "k8s", docs: docResults, findings: allFindings, stats, score, grade: gradeOf(score) };
    }
    function scoreOf(stats) {
      return Math.max(0, round1(10 - stats.error * DEDUCT.error - stats.warn * DEDUCT.warn - stats.info * DEDUCT.info));
    }
    function gradeOf(score) {
      if (score >= 8.5) return "\u4F18";
      if (score >= 6.5) return "\u826F";
      if (score >= 4) return "\u4E2D";
      return "\u9700\u6574\u6539";
    }
    function detectKind2(text) {
      const t = String(text || "").trim();
      if (!t) return "";
      if (/^\s*(FROM|RUN|CMD)\b/m.test(t) && !/apiVersion\s*:/.test(t)) return "unknown";
      if (/apiVersion\s*:/.test(t) && /kind\s*:/.test(t)) return "k8s";
      return "unknown";
    }
    var RULES = {
      "k8s-yaml-syntax": { level: "error", desc: "YAML \u8BED\u6CD5\u9519\u8BEF", fix: "\u4FEE\u590D\u7F29\u8FDB/\u5192\u53F7/\u5F15\u53F7\uFF1B\u591A\u6587\u6863\u7528 --- \u5206\u9694" },
      "k8s-not-object": { level: "error", desc: "\u6587\u6863\u4E0D\u662F\u952E\u503C\u6620\u5C04", fix: "\u6BCF\u4E2A --- \u6587\u6863\u5E94\u662F\u4E00\u4E2A\u8D44\u6E90\u5BF9\u8C61" },
      "k8s-missing-api": { level: "error", desc: "\u7F3A\u5C11 apiVersion", fix: "\u8865 apiVersion\uFF08Deployment=apps/v1\uFF0C\u6838\u5FC3\u8D44\u6E90=v1\uFF09" },
      "k8s-missing-kind": { level: "error", desc: "\u7F3A\u5C11 kind", fix: "\u8865 kind" },
      "k8s-missing-name": { level: "error", desc: "\u7F3A\u5C11 metadata.name", fix: "\u8865 metadata.name \u6216 generateName" },
      "k8s-invalid-name": { level: "error", desc: "metadata.name \u4E0D\u7B26\u5408 RFC1123\uFF08\u5C0F\u5199\u5B57\u6BCD\u6570\u5B57-/.\uFF0C\u2264253\uFF09", fix: "\u6539\u5C0F\u5199\u8FDE\u5B57\u7B26\u5F0F\u547D\u540D" },
      "k8s-kind-api-mismatch": { level: "error", desc: "kind \u4E0E apiVersion \u4E0D\u5339\u914D", fix: "\u6309 kind \u8868\u6539\u7528\u6B63\u786E apiVersion" },
      "k8s-deprecated-api": { level: "error", desc: "apiVersion \u5DF2\u88AB\u96C6\u7FA4\u79FB\u9664\uFF08apps/v1beta*\u3001extensions/v1beta1\u3001policy/v1beta1\u3001autoscaling/v2beta*\u3001networking.k8s.io/v1beta1 \u7B49\uFF09", fix: "\u8FC1\u79FB\u5230\u73B0\u884C apiVersion" },
      "k8s-label-value-type": { level: "error", desc: "labels/annotations \u503C\u4E0D\u662F\u5B57\u7B26\u4E32\uFF08\u6570\u5B57/\u5E03\u5C14\u88AB apiserver \u62D2\u7EDD\uFF09", fix: "\u503C\u52A0\u5F15\u53F7" },
      "k8s-unknown-kind": { level: "warn", desc: "\u672A\u8BC6\u522B\u7684 kind\uFF08\u53EF\u80FD\u662F\u62FC\u5199\u9519\u8BEF\u6216 CRD\uFF09", fix: "\u6838\u5BF9 kind \u540D\u79F0" },
      "k8s-cr-skip": { level: "info", desc: "CRD/\u6269\u5C55\u8D44\u6E90\uFF0C\u53EA\u505A\u7ED3\u6784\u5C42\u68C0\u67E5", fix: "" },
      "k8s-privileged": { level: "error", desc: "privileged: true\uFF08\u5B89\u5168\u7EA2\u7EBF\uFF09", fix: "\u5173\u95ED\uFF1B\u7528 capabilities \u7CBE\u786E\u6388\u6743" },
      "k8s-host-ns": { level: "error", desc: "hostNetwork/hostPID/hostIPC: true\uFF08\u5171\u4EAB\u5BBF\u4E3B\u673A\u547D\u540D\u7A7A\u95F4\uFF09", fix: "\u5173\u95ED\uFF1B\u7279\u4F8B\u53D7\u63A7\u90E8\u7F72" },
      "k8s-hostpath": { level: "error", desc: "hostPath \u5377\u76F4\u63A5\u6302\u8F7D\u8282\u70B9\u6587\u4EF6\u7CFB\u7EDF", fix: "\u6539 PVC/emptyDir\uFF1B\u786E\u9700\u53EA\u8BFB\u7CBE\u786E\u8DEF\u5F84" },
      "k8s-plaintext-secret": { level: "error", desc: "\u73AF\u5883\u53D8\u91CF\u7591\u4F3C\u660E\u6587\u5BC6\u94A5\uFF08\u6309\u540D\u5B57\u7EA2\u65D7\u8BC6\u522B\uFF1B\u5360\u4F4D\u503C\u964D info\uFF09", fix: "\u6539 valueFrom.secretKeyRef" },
      "k8s-image-missing": { level: "error", desc: "\u5BB9\u5668\u7F3A\u5C11 image", fix: "\u8865 image" },
      "k8s-container-dup": { level: "error", desc: "\u5BB9\u5668\u540D\u91CD\u590D\uFF08Pod \u5185\u5FC5\u987B\u552F\u4E00\uFF09", fix: "\u91CD\u547D\u540D" },
      "k8s-req-gt-limit": { level: "error", desc: "requests \u5927\u4E8E limits\uFF08apiserver \u62D2\u7EDD\uFF09", fix: "requests \u2264 limits" },
      "k8s-restart-policy-job": { level: "error", desc: "Job \u7684 Pod restartPolicy \u975E\u6CD5\uFF08\u4E0D\u80FD Always/\u7F3A\u7701\uFF09", fix: "Never \u6216 OnFailure" },
      "k8s-cron-missing": { level: "error", desc: "CronJob \u7F3A\u5C11 spec.schedule", fix: "\u8865 schedule" },
      "k8s-cron-invalid": { level: "error", desc: "schedule cron \u8868\u8FBE\u5F0F\u975E\u6CD5", fix: "5 \u6BB5 cron / @daily \u7B80\u5199 / CRON_TZ \u524D\u7F00" },
      "k8s-cron-concurrency": { level: "error", desc: "concurrencyPolicy \u53D6\u503C\u975E\u6CD5", fix: "Allow/Forbid/Replace" },
      "k8s-missing-spec": { level: "error", desc: "\u7F3A\u5C11 spec", fix: "\u8865 spec" },
      "k8s-missing-podspec": { level: "error", desc: "\u7F3A\u5C11 PodSpec\uFF08spec.template.spec\uFF09", fix: "\u8865\u9F50\u6A21\u677F" },
      "k8s-no-containers": { level: "error", desc: "containers \u4E3A\u7A7A", fix: "\u81F3\u5C11\u4E00\u4E2A\u5BB9\u5668" },
      "k8s-selector-missing": { level: "error", desc: "workload \u7F3A\u5C11 spec.selector\uFF08apps/v1 \u5FC5\u586B\uFF09", fix: "\u8865 matchLabels" },
      "k8s-selector-mismatch": { level: "error", desc: "selector \u4E0E template.labels \u4E0D\u4E00\u81F4\uFF08apply \u5373\u5931\u8D25\uFF09", fix: "\u5BF9\u9F50\u952E\u503C" },
      "k8s-svc-no-ports": { level: "error", desc: "Service \u7F3A\u5C11 ports", fix: "\u8865 ports" },
      "k8s-ingress-backend-shape": { level: "error", desc: "Ingress v1 backend \u7ED3\u6784\u9519\u8BEF\uFF08v1beta1 \u65E7\u5199\u6CD5\u5DF2\u5931\u6548\uFF09", fix: "backend.service.{name, port.number}" },
      "k8s-image-tag": { level: "warn", desc: "\u955C\u50CF\u672A\u9489\u7248\u672C\uFF08latest/\u7F3A tag\uFF09", fix: "\u9489\u5177\u4F53\u7248\u672C\u6216 @sha256 \u6458\u8981" },
      "k8s-priv-esc": { level: "warn", desc: "\u672A\u663E\u5F0F allowPrivilegeEscalation: false", fix: "securityContext \u663E\u5F0F\u5173\u95ED" },
      "k8s-run-as-root": { level: "warn", desc: "\u672A\u58F0\u660E runAsNonRoot\uFF08\u7F3A\u7701 root \u8FD0\u884C\uFF09", fix: "runAsNonRoot: true + runAsUser" },
      "k8s-cap-add": { level: "warn", desc: "\u6DFB\u52A0\u5371\u9669 capability\uFF08SYS_ADMIN/NET_RAW \u7B49\uFF09", fix: "\u786E\u8BA4\u5FC5\u8981\u6027\uFF0C\u6700\u5C0F\u5316\u6388\u6743" },
      "k8s-no-limits": { level: "warn", desc: "\u5BB9\u5668\u672A\u8BBE\u8D44\u6E90 limits\uFF08Job/CronJob \u964D info\uFF09", fix: "\u8865 resources.limits" },
      "k8s-no-liveness": { level: "warn", desc: "\u7F3A\u5C11 livenessProbe\uFF08\u5047\u6B7B\u65E0\u6CD5\u81EA\u6108\uFF1BPod \u672C\u4F53\u964D info\uFF09", fix: "\u52A0 livenessProbe" },
      "k8s-no-readiness": { level: "warn", desc: "\u7F3A\u5C11 readinessProbe\uFF08\u672A\u5C31\u7EEA\u4ECD\u6295\u6D41\uFF09", fix: "\u52A0 readinessProbe" },
      "k8s-svc-no-target": { level: "warn", desc: "Service selector \u5339\u914D\u4E0D\u5230 workload\uFF08\u65E0 selector \u65F6\u964D info\uFF09", fix: "\u6838\u5BF9 selector \u4E0E labels" },
      "k8s-svc-port-mismatch": { level: "warn", desc: "targetPort \u5728\u5339\u914D\u5BB9\u5668\u7684\u7AEF\u53E3\u4E2D\u4E0D\u5B58\u5728", fix: "\u5BF9\u9F50 targetPort \u4E0E containerPort" },
      "k8s-sts-service-missing": { level: "warn", desc: "StatefulSet serviceName \u672A\u5B9A\u4E49\uFF08\u7F3A headless Service\uFF09", fix: "\u8865 clusterIP: None \u7684 Service" },
      "k8s-ingress-svc-missing": { level: "warn", desc: "Ingress \u5F15\u7528\u7684 Service \u672A\u5728\u672C\u6279\u6E05\u5355\u4E2D", fix: "\u8865 Service \u6216\u786E\u8BA4\u5B58\u5728" },
      "k8s-ingress-port-mismatch": { level: "warn", desc: "Ingress \u6307\u5411\u7684 Service \u7AEF\u53E3\u4E0D\u5B58\u5728", fix: "\u5BF9\u9F50\u7AEF\u53E3" },
      "k8s-ref-missing": { level: "info", desc: "\u5F15\u7528\u7684 ConfigMap/Secret/PVC \u672A\u5728\u672C\u6279\u6E05\u5355\u4E2D\u5B9A\u4E49", fix: "\u8865\u8D44\u6E90\u6216\u786E\u8BA4\u96C6\u7FA4\u5DF2\u5B58\u5728" },
      "k8s-svc-targetport-default": { level: "info", desc: "targetPort \u7F3A\u7701\u4E0E port \u540C\u503C", fix: "\u663E\u5F0F\u5199 targetPort" },
      "k8s-ingress-class": { level: "info", desc: "\u672A\u6307\u5B9A ingressClassName\uFF08\u53EF\u80FD\u4E0D\u751F\u6548\uFF09", fix: "\u663E\u5F0F\u6307\u5B9A" },
      "k8s-ro-fs": { level: "info", desc: "\u672A\u8BBE readOnlyRootFilesystem", fix: "\u6839\u6587\u4EF6\u7CFB\u7EDF\u53EA\u8BFB + emptyDir" },
      "k8s-seccomp": { level: "info", desc: "\u672A\u914D\u7F6E seccompProfile", fix: "RuntimeDefault" },
      "k8s-automount-sa": { level: "info", desc: "\u81EA\u52A8\u6302\u8F7D ServiceAccount token", fix: "\u4E0D\u7528 API \u5219\u663E\u5F0F\u5173\u95ED" },
      "k8s-no-requests": { level: "info", desc: "\u6709 limits \u65E0 requests", fix: "requests=limits\uFF08Guaranteed QoS\uFF09" },
      "k8s-single-replica": { level: "info", desc: "\u5355\u526F\u672C\uFF08\u66F4\u65B0\u7A7A\u7A97\u98CE\u9669\uFF09", fix: "\u751F\u4EA7\u8D1F\u8F7D replicas: 2+" },
      "k8s-recreate-strategy": { level: "info", desc: "strategy: Recreate\uFF08\u66F4\u65B0\u5168\u505C\u7A97\u53E3\uFF09", fix: "\u65E0\u72B6\u6001\u7528 RollingUpdate" },
      "k8s-hpa-v1": { level: "info", desc: "autoscaling/v1 \u65E7\u7248 HPA\uFF08\u4EC5 CPU/\u5185\u5B58\u6307\u6807\uFF09", fix: "\u8FC1\u79FB autoscaling/v2" }
    };
    var RULE_COUNT2 = Object.keys(RULES).length;
    function ruleCatalog2() {
      const bySev = { error: [], warn: [], info: [] };
      for (const [id, r] of Object.entries(RULES)) bySev[r.level].push(`- ${id}\uFF1A${r.desc}${r.fix ? `\uFF08\u2192 ${r.fix}\uFF09` : ""}`);
      return [
        `### K8s \u6E05\u5355\u4F53\u68C0\u89C4\u5219\u76EE\u5F55\uFF08\u5171 ${RULE_COUNT2} \u6761\uFF09`,
        `**error ${bySev.error.length} \u6761\uFF08apply \u5931\u8D25/\u5B89\u5168\u7EA2\u7EBF\uFF09**
${bySev.error.join("\n")}`,
        `**warn ${bySev.warn.length} \u6761\uFF08\u5B89\u5168\u98CE\u9669/\u7591\u4F3C\u65AD\u94FE\uFF09**
${bySev.warn.join("\n")}`,
        `**info ${bySev.info.length} \u6761\uFF08\u6700\u4F73\u5B9E\u8DF5\uFF09**
${bySev.info.join("\n")}`,
        "\u8FB9\u754C\uFF1A\u4E0D\u6821\u9A8C\u672A\u77E5\u5B57\u6BB5\u62FC\u5199\uFF1BCRD \u53EA\u505A\u7ED3\u6784\u5C42\uFF1B\u8DE8\u8D44\u6E90\u53EA\u5BF9\u300C\u672C\u6279\u6E05\u5355\u5185\u300D\u5224\u5B9A\uFF1BHelm \u6A21\u677F\u8DF3\u8FC7\u3002"
      ].join("\n\n");
    }
    function explainRule(id) {
      const r = RULES[id];
      if (!r) return null;
      return `### ${id}
- \u4E25\u91CD\u7EA7\uFF1A${r.level}
- \u542B\u4E49\uFF1A${r.desc}
- \u4FEE\u590D\uFF1A${r.fix || "\u89C6\u4E0A\u4E0B\u6587\u800C\u5B9A"}`;
    }
    function renderReport(r, title) {
      const head = title || "K8s \u6E05\u5355\u4F53\u68C0\u62A5\u544A";
      const lines = [
        `### ${head}`,
        `\u6587\u6863 ${r.stats.docs} \u4E2A \xB7 \u53D1\u73B0 ${r.findings.length} \u9879\uFF08error ${r.stats.error} \xB7 warn ${r.stats.warn} \xB7 info ${r.stats.info}\uFF09\xB7 \u8BC4\u5206 **${r.score}/10\uFF08${r.grade}\uFF09** \xB7 \u89C4\u5219 ${r.stats.rules} \u6761${r.stats.helmDocs ? ` \xB7 Helm \u6A21\u677F\u6587\u6863 ${r.stats.helmDocs} \u4E2A\uFF08\u8DF3\u8FC7\uFF09` : ""}`,
        ""
      ];
      if (!r.findings.length) {
        lines.push(`\u2705 ${r.stats.rules} \u6761\u89C4\u5219\u626B\u63CF\u5B8C\u6BD5\uFF0C\u96F6\u53D1\u73B0\u3002`);
        return lines.join("\n");
      }
      const sevLabel = { error: "\u{1F534} error", warn: "\u{1F7E1} warn", info: "\u{1F535} info" };
      for (const d of r.docs) {
        const label = d.helm ? "Helm \u6A21\u677F\uFF08\u8DF3\u8FC7\uFF09" : d.error ? "YAML \u89E3\u6790\u5931\u8D25" : `${d.kind || "\u672A\u77E5\u8D44\u6E90"}${d.name ? "/" + d.name : ""}${d.apiVersion ? " \xB7 " + d.apiVersion : ""}`;
        lines.push(`**\u6587\u6863 ${d.index + 1}**\uFF08\u884C ${d.startLine}-${d.endLine}\uFF09\uFF1A${label}`);
        for (const f of r.findings.filter((x) => x.docIndex === d.index)) {
          lines.push(`- \u884C ${f.line ?? "?"} \`${f.rule}\` [${sevLabel[f.level] || f.level}] ${f.message}${f.fix ? ` \u2014\u2014 ${f.fix}` : ""}`);
        }
      }
      return lines.join("\n");
    }
    module.exports = {
      SEV,
      DEDUCT,
      KIND_API,
      RULES,
      RULE_COUNT: RULE_COUNT2,
      splitDocs,
      buildLineIndex,
      lineForPath,
      parseKeyLine,
      validRfc1123,
      isPlaceholderValue,
      looksLikeHelm,
      podSpecPath,
      isWorkloadKind,
      validateK8sCron,
      parseQuantity,
      cmpQuantity,
      lintDoc,
      lint: lint2,
      detectKind: detectKind2,
      scoreOf,
      gradeOf,
      ruleCatalog: ruleCatalog2,
      explainRule,
      renderReport
    };
  }
});

// src/Panel.tsx
import { useMemo, useState } from "react";

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException) return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet) return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
      // relative position
    };
  }
  function padStart(string, max) {
    return common2.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType) return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type2;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema) return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type2 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr) return str;
  hasRequiredStr = 1;
  const Type2 = requireType();
  str = new Type2("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq) return seq;
  hasRequiredSeq = 1;
  const Type2 = requireType();
  seq = new Type2("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap) return map;
  hasRequiredMap = 1;
  const Type2 = requireType();
  map = new Type2("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe) return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null) return _null;
  hasRequired_null = 1;
  const Type2 = requireType();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  _null = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool) return bool;
  hasRequiredBool = 1;
  const Type2 = requireType();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  bool = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt) return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat) return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp(
    "^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson) return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore) return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp) return timestamp;
  hasRequiredTimestamp = 1;
  const Type2 = requireType();
  const YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  const YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  timestamp = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge) return merge;
  hasRequiredMerge = 1;
  const Type2 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary) return binary;
  hasRequiredBinary = 1;
  const Type2 = requireType();
  const BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap) return omap;
  hasRequiredOmap = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (_hasOwnProperty.call(objectKeys, pairKey)) return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs) return pairs;
  hasRequiredPairs = 1;
  const Type2 = requireType();
  const _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  pairs = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet) return set;
  hasRequiredSet = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default) return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader) return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) {
        for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function chargeMergeWork(state) {
    state.totalMergeKeys++;
    if (state.maxTotalMergeKeys !== -1 && state.totalMergeKeys > state.maxTotalMergeKeys) {
      throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    chargeMergeWork(state);
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      chargeMergeWork(state);
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        if (valueNode.length > 100) {
          throwError(state, "abnormal merge sequence size");
        }
        for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat("\n", emptyLines);
        }
      } else {
        state.result += common2.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    let _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(
            state,
            propertyStart,
            propertyStart.position - propertyStart.lineStart,
            flowIndent
          )) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper) return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  const DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null) return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && // - b-char
    c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && // - c-flow-indicator
      c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && // ns-plain-char
      c !== CHAR_SHARP && // false on '#'
      !(prev === CHAR_COLON && !cIsNsChar) || // false on ': '
      isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || // change to true on '[^ ]#'
      prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && // | “%” | “@” | “`”)
    c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || // No block styles in flow mode.
      state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    }();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === "\n";
    const keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    }();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length; i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml) return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

// src/Panel.tsx
var core2 = __toESM(require_k8s_core());
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CSS = `
.kl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.kl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kl-head b{font-size:13px}
.kl-head .sub{color:#5C6678;font-size:11px}
.kl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.kl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.kl-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.kl-btn:disabled{opacity:.5;cursor:not-allowed}
.kl-tab{background:#161c2a;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.kl-tab.on{background:#1d3a2f;border-color:#2f9e44;color:#8ce0b0}
.kl-area{width:100%;min-height:220px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none;box-sizing:border-box}
.kl-area:focus{border-color:#4fd1a0}
.kl-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.kl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.kl-verdict.mid{background:#2b2413;border-color:#d19a3d;color:#f3c477}
.kl-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.kl-verdict b{font-size:14px}
.kl-score{font:600 18px/1 ui-monospace,Consolas,monospace}
.kl-doc{font-size:11.5px;color:#8B94A9;margin:4px 0 2px}
.kl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.kl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.kl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.kl-tbl .ln{text-align:right;color:#8B94A9;white-space:nowrap}
.kl-lv{border-radius:4px;padding:0 6px;font-size:10.5px}
.kl-lv.error{background:#2b1215;color:#f1a0a0}
.kl-lv.warn{background:#2b2413;color:#f3b377}
.kl-lv.info{background:#1a2030;color:#8B94A9}
.kl-fix{color:#8B94A9;font-family:inherit}
.kl-rules{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font-size:12px;line-height:1.9;color:#c9cede;white-space:pre-wrap}
.kl-note{color:#5C6678;font-size:11px;line-height:1.6}
.kl-empty{color:#5C6678;font-size:12px;text-align:center;padding:16px 0}
`;
var SAMPLE = `apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: legacy-shop
  labels:
    app: shop
    version: 2
spec:
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop
    spec:
      hostPID: true
      containers:
        - name: web
          image: nginx:latest
          securityContext:
            privileged: true
          env:
            - name: DB_PASSWORD
              value: hunter2-prod
          resources:
            limits:
              cpu: "2"
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: shop-svc
spec:
  selector:
    app: shop
  ports:
    - port: 80
      targetPort: 3000
`;
function verdictClass(score) {
  if (score >= 8.5) return "ok";
  if (score >= 5) return "mid";
  return "bad";
}
function K8sLensPanel(_props) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(null);
  const [view, setView] = useState("report");
  const result = useMemo(() => {
    if (checked === null || !checked.trim()) return null;
    try {
      return core2.lint(checked, {
        parseYaml: (t) => load(t)
      });
    } catch (e) {
      return null;
    }
  }, [checked]);
  const looksK8s = useMemo(() => text.trim() ? core2.detectKind(text) : "", [text]);
  const run = () => setChecked(text);
  const loadSample = () => {
    setText(SAMPLE);
    setChecked(null);
  };
  const clear = () => {
    setText("");
    setChecked(null);
  };
  const s = result ? result.stats : null;
  return /* @__PURE__ */ jsxs("div", { className: "kl-root", children: [
    /* @__PURE__ */ jsx("style", { children: CSS }),
    /* @__PURE__ */ jsxs("div", { className: "kl-head", children: [
      /* @__PURE__ */ jsx("b", { children: "K8s \u6E05\u5355\u4F53\u68C0\u53F0" }),
      /* @__PURE__ */ jsxs("span", { className: "sub", children: [
        core2.RULE_COUNT,
        " \u6761\u89C4\u5219 \xB7 \u884C\u7EA7\u62A5\u544A \xB7 \u8DE8\u8D44\u6E90\u4E00\u81F4\u6027 \xB7 \u7EAF\u672C\u5730\u79BB\u7EBF"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "kl-body", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          className: "kl-area",
          placeholder: "\u7C98\u8D34 Kubernetes \u6E05\u5355 YAML\uFF08\u591A\u6587\u6863\u7528 --- \u5206\u9694\uFF09\uFF0Capply \u524D\u4F53\u68C0\u4E00\u904D\u2026\u2026\n\napiVersion: apps/v1beta1   \u2190 \u5DF2\u79FB\u9664\u7684 API \u4F1A\u62A5 error\nkind: Deployment\nmetadata:\n  name: my-app\n  labels:\n    version: 1              \u2190 label \u503C\u4E0D\u662F\u5B57\u7B26\u4E32\u4F1A\u62A5 error\n...\n\n\u5BF9\u6574\u4E2A\u76EE\u5F55\u4F53\u68C0\u8BF7\u76F4\u63A5\u5728\u5BF9\u8BDD\u91CC\u8BF4\u300C\u7528 K8s \u6E05\u5355\u4F53\u68C0\u53F0\u626B\u63CF <\u76EE\u5F55>\u300D",
          value: text,
          onChange: (e) => setText(e.target.value)
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "kl-row", children: [
        /* @__PURE__ */ jsx("button", { className: "kl-btn", onClick: run, disabled: !text.trim(), children: "\u4F53\u68C0" }),
        /* @__PURE__ */ jsx("button", { className: "kl-btn", style: { padding: "4px 12px" }, onClick: loadSample, children: "\u793A\u4F8B\u6E05\u5355" }),
        /* @__PURE__ */ jsx("button", { className: "kl-btn", style: { padding: "4px 12px" }, onClick: clear, children: "\u6E05\u7A7A" }),
        /* @__PURE__ */ jsx("span", { className: "kl-note", children: looksK8s === "unknown" ? "\u26A0\uFE0F \u672A\u53D1\u73B0 apiVersion+kind\uFF0C\u53EF\u80FD\u4E0D\u662F K8s \u6E05\u5355" : "" })
      ] }),
      result && s && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: `kl-verdict ${verdictClass(result.score)}`, children: [
          /* @__PURE__ */ jsx("span", { className: "kl-score", children: result.score }),
          /* @__PURE__ */ jsx("b", { children: result.grade }),
          /* @__PURE__ */ jsxs("span", { children: [
            s.error > 0 ? `\u274C ${s.error} error` : "\u2705 \u65E0 error",
            " \xB7 \u26A0\uFE0F ",
            s.warn,
            " warn \xB7 \u{1F4A1} ",
            s.info,
            " info"
          ] }),
          /* @__PURE__ */ jsxs("span", { className: "cl-note kl-note", children: [
            s.docs,
            " \u4E2A\u6587\u6863 \xB7 \u89C4\u5219 ",
            s.rules,
            " \u6761",
            s.helmDocs ? ` \xB7 Helm \u8DF3\u8FC7 ${s.helmDocs}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "kl-row", children: [
          /* @__PURE__ */ jsxs("button", { className: `kl-tab ${view === "report" ? "on" : ""}`, onClick: () => setView("report"), children: [
            "\u53D1\u73B0\uFF08",
            result.findings.length,
            "\uFF09"
          ] }),
          /* @__PURE__ */ jsx("button", { className: `kl-tab ${view === "rules" ? "on" : ""}`, onClick: () => setView("rules"), children: "\u89C4\u5219\u76EE\u5F55" })
        ] }),
        view === "report" && (result.findings.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "kl-empty", children: [
          "\u2705 ",
          s.rules,
          " \u6761\u89C4\u5219\u626B\u63CF\u5B8C\u6BD5\uFF0C\u96F6\u53D1\u73B0\u3002"
        ] }) : /* @__PURE__ */ jsx("div", { children: result.docs.map((d) => {
          const fs2 = result.findings.filter((f) => f.docIndex === d.index);
          if (!fs2.length) return null;
          const label = d.helm ? "Helm \u6A21\u677F\uFF08\u8DF3\u8FC7\uFF09" : d.error ? "YAML \u89E3\u6790\u5931\u8D25" : `${d.kind || "\u672A\u77E5"}${d.name ? "/" + d.name : ""}${d.apiVersion ? " \xB7 " + d.apiVersion : ""}`;
          return /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "kl-doc", children: [
              "\u6587\u6863 ",
              d.index + 1,
              "\uFF08\u884C ",
              d.startLine,
              "-",
              d.endLine,
              "\uFF09\uFF1A",
              label
            ] }),
            /* @__PURE__ */ jsxs("table", { className: "kl-tbl", children: [
              /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
                /* @__PURE__ */ jsx("th", { className: "ln", children: "\u884C" }),
                /* @__PURE__ */ jsx("th", { children: "\u7EA7\u522B" }),
                /* @__PURE__ */ jsx("th", { children: "\u89C4\u5219" }),
                /* @__PURE__ */ jsx("th", { children: "\u8BF4\u660E\u4E0E\u4FEE\u590D" })
              ] }) }),
              /* @__PURE__ */ jsx("tbody", { children: fs2.map((f, i) => /* @__PURE__ */ jsxs("tr", { children: [
                /* @__PURE__ */ jsx("td", { className: "ln", children: f.line }),
                /* @__PURE__ */ jsx("td", { children: /* @__PURE__ */ jsx("span", { className: `kl-lv ${f.level}`, children: f.level }) }),
                /* @__PURE__ */ jsx("td", { children: f.rule }),
                /* @__PURE__ */ jsxs("td", { children: [
                  f.message,
                  f.fix ? /* @__PURE__ */ jsxs("div", { className: "kl-fix", children: [
                    "\u2192 ",
                    f.fix
                  ] }) : null
                ] })
              ] }, i)) })
            ] })
          ] }, d.index);
        }) })),
        view === "rules" && /* @__PURE__ */ jsx("div", { className: "kl-rules", children: core2.ruleCatalog() })
      ] }),
      !result && /* @__PURE__ */ jsx("div", { className: "kl-note", children: "\u7528\u6CD5\uFF1A\u7C98\u8D34\u6E05\u5355 \u2192 \u4F53\u68C0\u3002error = apply \u4F1A\u5931\u8D25\u6216\u5B89\u5168\u7EA2\u7EBF\uFF1Bwarn = \u9AD8\u5EA6\u53EF\u7591/\u65AD\u94FE\u98CE\u9669\uFF1Binfo = \u6700\u4F73\u5B9E\u8DF5\u3002 \u5F03\u7528 API\uFF08apps/v1beta1 \u7B49\uFF09\u3001privileged/hostPath/\u660E\u6587\u5BC6\u94A5\u3001\u7F3A\u63A2\u9488/limits\u3001selector \u4E0E Service \u65AD\u94FE\u90FD\u4F1A\u88AB\u68C0\u51FA\u3002 \u5BF9\u6574\u4E2A\u76EE\u5F55\u4F53\u68C0\u8BF7\u76F4\u63A5\u5BF9 AI \u8BF4\u300C\u7528 K8s \u6E05\u5355\u4F53\u68C0\u53F0\u626B\u63CF <\u76EE\u5F55>\u300D\uFF08MCP k8s_scan\uFF0C\u53EA\u8BFB\uFF09\u3002" })
    ] })
  ] });
}

// src/index.tsx
import { jsx as jsx2 } from "react/jsx-runtime";
function K8sLensEntry(props) {
  return /* @__PURE__ */ jsx2(K8sLensPanel, { ...props });
}
export {
  K8sLensEntry as default
};
