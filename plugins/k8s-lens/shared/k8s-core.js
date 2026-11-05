'use strict';
/**
 * k8s-core.js —— K8s 清单体检台共享核心（单一权威，运行时零依赖、零 node 内置模块）。
 *
 * 被 MCP server（esbuild bundle）与面板（browser bundle）共用；双方同一口径。
 * js-yaml 不在本文件 require——由调用方通过 opts.parseYaml 注入（家法同 ci-core.js）。
 *
 * 职责：
 *  1. splitDocs(text)：多文档 YAML 分割（行首 `---`），保留全文行号偏移。
 *  2. buildLineIndex(lines)：纯文本行索引器——为每个键路径注册 1 基行号 + 父链，
 *     使解析树类发现也能行级定位（js-yaml 无 span 信息的补偿）。
 *  3. lintDoc(doc, ctx)：结构校验（apiVersion/kind 映射、弃用 API、RFC1123 名、
 *     label 值类型）+ kind 专属规则 + PodSpec 容器规则（安全/可靠性）。
 *  4. crossCheck(resources)：跨资源一致性（selector 匹配、ConfigMap/Secret/PVC
 *     引用完整性、Service targetPort 对齐、Ingress/StatefulSet 后端存在性）。
 *  5. lint(text, opts) / detectKind / ruleCatalog / explainRule / renderReport。
 *
 * 严重级：error（apply 会失败/集群已移除 API/安全红线）> warn（高度可疑/安全风险/
 * 跨资源疑似断链）> info（最佳实践/外部资源提示）。
 * 评分：10 - error×2 - warn×0.7 - info×0.2，下限 0（全文档汇总口径）。
 *
 * 边界（如实声明）：
 *  - 不校验未知字段拼写（完整 schema 校验需 kubeconform 级 schema 表，超出离线子集）。
 *  - 不做集群查询：跨资源检查只对「本批清单内」判定，引用外部资源降为 info 级提示。
 *  - CRD / 自定义 group（非内置 kind 表）只做结构层检查，跳过深检（info 说明）。
 *  - 明文密钥按变量名红旗识别（PASSWORD/SECRET/TOKEN/KEY 类），$(VAR) 运行时引用
 *    与占位值降 info；语义级判断不做。
 *  - 行号：按行索引定位（尽力而为），行索引失败回退文档起始行。
 *  - Helm 模板（{{ }}）不解析：检测到即跳过该文档并计数提示。
 *  - 嵌套序列（`- - x`）视为标量项（行索引边界，不影响规则正确性）。
 */

const SEV = { ERROR: 'error', WARN: 'warn', INFO: 'info' };
const DEDUCT = { error: 2, warn: 0.7, info: 0.2 };

function mk(rule, level, path, message, fix) {
  return { rule, level, path: path || '', message, fix: fix || '' };
}

function round1(n) { return Math.round(n * 10) / 10; }

/* ============================== API 版本表 ============================== */
/**
 * 内置 kind → { api: 当前权威 apiVersion；legacy: 仍合法旧版；deprecated:
 * 已移除的 apiVersion → 迁移目标（null=无替代）}。以 2026-11（K8s ≈1.32/1.33 时点）为准。
 */
const KIND_API = {
  Pod: { api: 'v1' },
  Namespace: { api: 'v1' },
  Node: { api: 'v1' },
  Event: { api: 'v1' },
  ConfigMap: { api: 'v1' },
  Secret: { api: 'v1' },
  ServiceAccount: { api: 'v1' },
  Service: { api: 'v1' },
  Endpoints: { api: 'v1' },
  PersistentVolume: { api: 'v1' },
  PersistentVolumeClaim: { api: 'v1' },
  ReplicationController: { api: 'v1' },
  LimitRange: { api: 'v1' },
  ResourceQuota: { api: 'v1' },
  Deployment: { api: 'apps/v1', deprecated: { 'apps/v1beta1': 'apps/v1', 'apps/v1beta2': 'apps/v1', 'extensions/v1beta1': 'apps/v1' } },
  StatefulSet: { api: 'apps/v1', deprecated: { 'apps/v1beta1': 'apps/v1', 'apps/v1beta2': 'apps/v1' } },
  DaemonSet: { api: 'apps/v1', deprecated: { 'apps/v1beta2': 'apps/v1', 'extensions/v1beta2': 'apps/v1' } },
  ReplicaSet: { api: 'apps/v1', deprecated: { 'apps/v1beta2': 'apps/v1', 'extensions/v1beta2': 'apps/v1' } },
  ControllerRevision: { api: 'apps/v1' },
  Job: { api: 'batch/v1', deprecated: { 'batch/v1beta1': 'batch/v1' } },
  CronJob: { api: 'batch/v1', deprecated: { 'batch/v1beta1': 'batch/v1', 'batch/v2alpha1': 'batch/v1' } },
  Ingress: { api: 'networking.k8s.io/v1', deprecated: { 'networking.k8s.io/v1beta1': 'networking.k8s.io/v1', 'extensions/v1beta1': 'networking.k8s.io/v1' } },
  IngressClass: { api: 'networking.k8s.io/v1' },
  NetworkPolicy: { api: 'networking.k8s.io/v1', deprecated: { 'extensions/v1beta1': 'networking.k8s.io/v1' } },
  HorizontalPodAutoscaler: { api: 'autoscaling/v2', legacy: ['autoscaling/v1'], deprecated: { 'autoscaling/v2beta1': 'autoscaling/v2', 'autoscaling/v2beta2': 'autoscaling/v2' } },
  PodDisruptionBudget: { api: 'policy/v1', deprecated: { 'policy/v1beta1': 'policy/v1' } },
  PodSecurityPolicy: { api: null, deprecated: { 'policy/v1beta1': null, 'extensions/v1beta1': null } },
  Role: { api: 'rbac.authorization.k8s.io/v1', deprecated: { 'rbac.authorization.k8s.io/v1alpha1': 'rbac.authorization.k8s.io/v1', 'rbac.authorization.k8s.io/v1beta1': 'rbac.authorization.k8s.io/v1' } },
  RoleBinding: { api: 'rbac.authorization.k8s.io/v1', deprecated: { 'rbac.authorization.k8s.io/v1alpha1': 'rbac.authorization.k8s.io/v1', 'rbac.authorization.k8s.io/v1beta1': 'rbac.authorization.k8s.io/v1' } },
  ClusterRole: { api: 'rbac.authorization.k8s.io/v1', deprecated: { 'rbac.authorization.k8s.io/v1alpha1': 'rbac.authorization.k8s.io/v1', 'rbac.authorization.k8s.io/v1beta1': 'rbac.authorization.k8s.io/v1' } },
  ClusterRoleBinding: { api: 'rbac.authorization.k8s.io/v1', deprecated: { 'rbac.authorization.k8s.io/v1alpha1': 'rbac.authorization.k8s.io/v1', 'rbac.authorization.k8s.io/v1beta1': 'rbac.authorization.k8s.io/v1' } },
  StorageClass: { api: 'storage.k8s.io/v1', deprecated: { 'storage.k8s.io/v1beta1': 'storage.k8s.io/v1' } },
  VolumeAttachment: { api: 'storage.k8s.io/v1' },
  CSIDriver: { api: 'storage.k8s.io/v1' },
  CSINode: { api: 'storage.k8s.io/v1' },
  ValidatingWebhookConfiguration: { api: 'admissionregistration.k8s.io/v1', deprecated: { 'admissionregistration.k8s.io/v1beta1': 'admissionregistration.k8s.io/v1' } },
  MutatingWebhookConfiguration: { api: 'admissionregistration.k8s.io/v1', deprecated: { 'admissionregistration.k8s.io/v1beta1': 'admissionregistration.k8s.io/v1' } },
  CertificateSigningRequest: { api: 'certificates.k8s.io/v1', deprecated: { 'certificates.k8s.io/v1beta1': 'certificates.k8s.io/v1' } },
  Lease: { api: 'coordination.k8s.io/v1', deprecated: { 'coordination.k8s.io/v1beta1': 'coordination.k8s.io/v1' } },
  EndpointSlice: { api: 'discovery.k8s.io/v1', deprecated: { 'discovery.k8s.io/v1beta1': 'discovery.k8s.io/v1' } },
  APIService: { api: 'apiregistration.k8s.io/v1', deprecated: { 'apiregistration.k8s.io/v1beta1': 'apiregistration.k8s.io/v1' } },
  PriorityClass: { api: 'scheduling.k8s.io/v1' },
  RuntimeClass: { api: 'node.k8s.io/v1' },
};

/** 已整体移除、无替代 API 的特殊说明 */
const REMOVED_NO_REPLACE = 'PodSecurityPolicy 在 v1.25 已整体移除且无替代；请迁移到 PodSecurity Admission（namespace 标签 pod-security.kubernetes.io/*）或第三方策略引擎';

/* ============================== 多文档分割 ============================== */
/**
 * 按行首 `---`（文档分隔符）切分多文档 YAML。
 * 返回 [{ text, startLine }]，startLine 为该文档首行在全文的 1 基行号。
 */
function splitDocs(text) {
  const lines = text.split(/\r?\n/);
  const docs = [];
  let cur = [];
  let curStart = 1;
  const flush = () => {
    if (cur.some((l) => l.trim() !== '' && !l.trim().startsWith('#'))) {
      while (cur.length && cur[0].trim() === '') { cur.shift(); curStart++; }
      docs.push({ text: cur.join('\n'), startLine: curStart });
    }
    cur = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^---(\s.*)?$/.test(lines[i])) {
      flush();
      const rest = lines[i].replace(/^---\s?/, '');
      cur = rest.trim() ? [rest] : [];
      curStart = i + 2;
      continue;
    }
    if (/^\.\.\.(\s.*)?$/.test(lines[i])) { flush(); curStart = i + 2; continue; }
    if (cur.length === 0) curStart = i + 1;
    cur.push(lines[i]);
  }
  flush();
  return docs;
}

/* ============================== 行索引器 ============================== */
/** 键行形态：`key:` / `key: value`（含引号键；键体不含裸冒号） */
const KEY_RE = /^(?:"((?:[^"\\]|\\.)+)"|'([^']+)'|([^:#\s][^:#]*?))\s*:(?:\s|$)/;
/** 块标量值形态：`|`、`>`、`|-`、`>2` 等 */
const BLOCK_RE = /^[|>][+-]?\d*\s*(?:#.*)?$/;
/**
 * 纯文本 YAML 行索引：为「每个键路径」注册 1 基行号 + 父链，供解析树类发现行级定位。
 *
 * 识别规则（尽力而为，失败不影响规则正确性，只影响行号精度）：
 *  - 键行：`key:` / `key: value`（含引号键、app.kubernetes.io/name 式带点键）；
 *  - 序列项：`- ...`（缩进式与 flush 左对齐都识别；`- key: value` 行内首键同注册；
 *    同缩进连续项正确归位——先弹出同缩进序列层再挂靠宿主键）；
 *  - 块标量体（`key: |` / `>` 后更深缩进行）跳过；`#` 注释按引号状态机截断；
 *  - 折叠标量续行（不匹配键形态）跳过不改栈。
 *
 * 返回 Map<path, { line, parent }>：line 为 1 基行号，parent 为父路径字符串。
 */
function buildLineIndex(lines) {
  const index = new Map();
  const register = (path, line, parent) => {
    if (path && !index.has(path)) index.set(path, { line, parent: parent || null });
  };
  // 栈层：{ indent, path, seq }——seq 为该层名下序列项计数器（对象引用跨 pop 存活）
  const stack = [];
  const pathNow = () => (stack.length ? stack[stack.length - 1].path : '');
  let blockIndent = -1; // 块标量宿主键的 indent；-1 = 不在块标量内

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (blockIndent >= 0) {
      if (raw.trim() === '') continue;
      const ind = raw.match(/^ */)[0].length;
      if (ind > blockIndent) continue;
      blockIndent = -1; // 落到不深于宿主键的行：块结束，本行正常处理
    }
    // 引号感知的注释截断
    let s = raw;
    let q = null;
    for (let c = 0; c < s.length; c++) {
      const ch = s[c];
      if (q) { if (ch === q) q = null; }
      else if (ch === "'" || ch === '"') q = ch;
      else if (ch === '#' && (c === 0 || s[c - 1] === ' ' || s[c - 1] === '\t')) { s = s.slice(0, c); break; }
    }
    if (s.trim() === '') continue;
    const indent = s.match(/^ */)[0].length;
    const body = s.slice(indent);

    // 序列项？
    const seqM = /^-(?:\s+(.*))?$/.exec(body);
    if (seqM) {
      // 先弹出更深/同深的序列层（同缩进连续项归位到宿主键：第 2 个 `- ` 不嵌进 [0]）
      while (stack.length && stack[stack.length - 1].indent >= indent && isSeqLayer(stack[stack.length - 1].path)) stack.pop();
      while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
      const hostPath = pathNow();
      const host = stack.length ? stack[stack.length - 1] : null;
      const n = host ? (host.seq = (host.seq || 0) + 1) - 1 : 0;
      const itemPath = hostPath + '[' + n + ']';
      register(itemPath, lineNo, hostPath || null);
      stack.push({ indent, path: itemPath, seq: 0 });
      // 行内首键 `- key: value`
      const restRaw = seqM[1] || '';
      if (restRaw.trim()) {
        const dashSpaces = /^-(\s+)/.exec(body);
        const keyCol = indent + 1 + (dashSpaces ? dashSpaces[1].length : 1);
        const inner = parseKeyLine(restRaw.trim(), keyCol);
        if (inner) {
          const p = itemPath + '.' + inner.key;
          register(p, lineNo, itemPath);
          if (inner.empty) stack.push({ indent: inner.indent, path: p, seq: 0 });
          else if (inner.block) blockIndent = indent;
        }
      }
      continue;
    }

    // 键行？
    const kl = parseKeyLine(body, indent);
    if (kl) {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = pathNow();
      const p = parent ? parent + '.' + kl.key : kl.key;
      register(p, lineNo, parent || null);
      if (kl.empty) {
        stack.push({ indent, path: p, seq: 0 });
      } else if (kl.block) {
        blockIndent = indent;
      }
      continue;
    }
    // 其余（折叠标量续行 / 无法识别行）：跳过，不改栈
  }
  return index;
}
/** 是否序列项层：序列层 path 以 [n] 结尾（键层永不出现在路径末尾为 ] 的形态） */
function isSeqLayer(pathStr) { return /\[\d+\]$/.test(pathStr); }

/** 解析一行键形态；返回 { key, empty, block, indent } 或 null */
function parseKeyLine(body, col) {
  const m = KEY_RE.exec(body);
  if (!m) return null;
  const key = (m[1] || m[2] || m[3] || '').trim();
  if (!key) return null;
  const after = body.slice(m[0].length).trim();
  const empty = after === '';
  const block = !empty && BLOCK_RE.test(after);
  return { key, empty, block, indent: col };
}

/** 行定位：精确命中；否则去尾回退到最近已注册前缀；再否则 fallbackLine */
function lineForPath(index, path, fallbackLine) {
  if (!path) return fallbackLine;
  if (index.has(path)) return index.get(path).line;
  let cur = path;
  for (;;) {
    const dot = Math.max(cur.lastIndexOf('.'), cur.lastIndexOf('['));
    if (dot <= 0) break;
    cur = cur.slice(0, dot);
    if (index.has(cur)) return index.get(cur).line;
  }
  return fallbackLine;
}

/* ============================== 树访问与工具 ============================== */

function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

const NAME_RE = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
function validRfc1123(name) {
  return typeof name === 'string' && name.length <= 253 && NAME_RE.test(name);
}

/** 疑似占位值（明文密钥降级用） */
function isPlaceholderValue(v) {
  const s = String(v).trim();
  if (!s) return true;
  if (/^\$\{.+\}$/.test(s) || /^<.+>$/.test(s)) return true;
  if (/^\$\(.+\)$/.test(s)) return true; // $(VAR) 运行时引用
  if (/^(changeme|change-me|change_me|xxx+|placeholder|todo|dummy|example|your[-_].*|my[-_]secret.*)$/i.test(s)) return true;
  return false;
}

const SECRET_NAME_RE = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|APIKEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL|AUTH_KEY|SESSION_KEY)/i;
const DANGEROUS_CAPS = new Set(['SYS_ADMIN', 'NET_ADMIN', 'NET_RAW', 'DAC_OVERRIDE', 'SYS_PTRACE', 'SYS_BOOT', 'SYS_TIME', 'MKNOD', 'AUDIT_WRITE', 'SETFCAP']);

/** Helm 模板占位检测（不解析模板，仅识别并跳过） */
function looksLikeHelm(text) { return /\{\{[^}]*\}\}/.test(String(text)); }

/* ============================== PodSpec 路径 ============================== */
/** kind → podSpec 在树中的路径；null 表示无 podSpec */
function podSpecPath(kind) {
  switch (kind) {
    case 'Pod': return 'spec';
    case 'Deployment':
    case 'StatefulSet':
    case 'DaemonSet':
    case 'ReplicaSet':
    case 'ReplicationController':
    case 'Job': return 'spec.template.spec';
    case 'CronJob': return 'spec.jobTemplate.spec.template.spec';
    default: return null;
  }
}
function isWorkloadKind(kind) {
  return ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'ReplicationController'].includes(kind);
}

/* ============================== 文档级检查 ============================== */
/**
 * 单文档体检。ctx: { docIndex, startLine, lineIndex, resources }
 * 返回 { findings, resource, helm? }；findings 带 path（行号由 lint 统一解析）。
 */
function lintDoc(doc, ctx) {
  const findings = [];
  if (!isObj(doc)) {
    findings.push(mk('k8s-not-object', SEV.ERROR, '', '文档不是键值映射（可能是纯标量或列表），无法作为 K8s 资源解析', '每个文档应是一个资源对象（apiVersion/kind/metadata/spec）'));
    return { findings, resource: null };
  }

  const apiVersion = doc.apiVersion;
  const kind = doc.kind;

  if (apiVersion === undefined || apiVersion === null || apiVersion === '') {
    findings.push(mk('k8s-missing-api', SEV.ERROR, 'apiVersion', '缺少 apiVersion——kubectl apply 直接失败', '补 apiVersion，如 apps/v1（Deployment）、v1（Pod/ConfigMap/Service）'));
  }
  if (kind === undefined || kind === null || kind === '') {
    findings.push(mk('k8s-missing-kind', SEV.ERROR, 'kind', '缺少 kind——kubectl apply 直接失败', '补 kind，如 Deployment / Service / ConfigMap'));
  }
  if (typeof kind !== 'string' || !kind) {
    return { findings, resource: null };
  }

  // ---- kind ↔ apiVersion 表 ----
  const entry = KIND_API[kind];
  if (typeof apiVersion === 'string' && apiVersion) {
    if (entry) {
      const dep = entry.deprecated && entry.deprecated[apiVersion];
      if (dep !== undefined) {
        if (dep === null) {
          findings.push(mk('k8s-deprecated-api', SEV.ERROR, 'apiVersion', `${kind} 的 ${apiVersion} 已被集群移除，apply 即失败`, REMOVED_NO_REPLACE));
        } else {
          findings.push(mk('k8s-deprecated-api', SEV.ERROR, 'apiVersion', `${kind} 的 ${apiVersion} 已在 1.16/1.22/1.25 清理批次移除，现代集群 apply 即失败（no matches for kind）`, `迁移到 ${dep}`));
        }
      } else if (entry.api === null) {
        findings.push(mk('k8s-deprecated-api', SEV.ERROR, 'apiVersion', `PodSecurityPolicy 的任何 apiVersion（含 ${apiVersion}）都已被移除，apply 即失败`, REMOVED_NO_REPLACE));
      } else if (apiVersion !== entry.api && !(entry.legacy || []).includes(apiVersion)) {
        const sameGroup = entry.api.split('/')[0] === apiVersion.split('/')[0];
        if (apiVersion === 'v1' && !entry.api.includes('/')) {
          // 核心组资源写了错误 group 或反之
          findings.push(mk('k8s-kind-api-mismatch', SEV.ERROR, 'apiVersion', `${kind} 不属于核心组 v1，apply 即失败（no matches for kind）`, `改用 ${entry.api}`));
        } else if (sameGroup) {
          findings.push(mk('k8s-kind-api-mismatch', SEV.WARN, 'apiVersion', `${apiVersion} 下未知的 kind「${kind}」（该 group 现行版本是 ${entry.api}）`, `确认后改用 ${entry.api}`));
        } else {
          findings.push(mk('k8s-kind-api-mismatch', SEV.ERROR, 'apiVersion', `kind「${kind}」与 apiVersion「${apiVersion}」不匹配（${kind} 的现行 apiVersion 是 ${entry.api}）`, `改用 ${entry.api}`));
        }
      } else if (apiVersion === 'autoscaling/v1' && kind === 'HorizontalPodAutoscaler') {
        findings.push(mk('k8s-hpa-v1', SEV.INFO, 'apiVersion', 'autoscaling/v1 是 HPA 旧版（仅支持 CPU/内存指标），仍合法但功能受限', '建议迁移 autoscaling/v2（支持自定义与外部指标）'));
      }
    } else {
      findings.push(mk('k8s-cr-skip', SEV.INFO, 'kind', `kind「${kind}」不在内置检查表（视为 CRD/扩展资源），只做结构层检查`, ''));
    }
  }

  // ---- metadata ----
  const meta = doc.metadata;
  if (!isObj(meta)) {
    findings.push(mk('k8s-missing-name', SEV.ERROR, 'metadata', '缺少 metadata——资源无名字，apply 失败', '补 metadata.name'));
  } else {
    const name = meta.name;
    const genName = meta.generateName;
    if ((name === undefined || name === null || name === '') && !genName) {
      findings.push(mk('k8s-missing-name', SEV.ERROR, 'metadata.name', '缺少 metadata.name（或 generateName）——apply 失败', '补 metadata.name，如 my-app'));
    } else if (name !== undefined && name !== null && name !== '') {
      if (typeof name !== 'string' || !validRfc1123(name)) {
        findings.push(mk('k8s-invalid-name', SEV.ERROR, 'metadata.name', `「${name}」不符合 RFC1123 子域名规范（仅小写字母/数字/-/.，≤253 字符，开头结尾须为字母或数字）`, '改为小写连字符式命名，如 my-app-1'));
      }
    }
    for (const section of ['labels', 'annotations']) {
      const m = meta[section];
      if (isObj(m)) {
        for (const [k, v] of Object.entries(m)) {
          if (v !== null && typeof v !== 'string') {
            findings.push(mk('k8s-label-value-type', SEV.ERROR, `metadata.${section}.${k}`, `${section}[${k}] 的值是 ${typeof v}（${JSON.stringify(v)}）——label/annotation 值只能是字符串，apply 即失败（got ${typeof v}, expected string）`, `值加引号改为字符串：${k}: "${String(v)}"`));
          }
        }
      }
    }
  }

  const resource = {
    docIndex: ctx.docIndex,
    kind, apiVersion: typeof apiVersion === 'string' ? apiVersion : String(apiVersion === undefined || apiVersion === null ? '' : apiVersion),
    name: isObj(meta) && typeof meta.name === 'string' ? meta.name : '',
    labels: isObj(meta) && isObj(meta.labels) ? meta.labels : null,
    selector: null, svcSelector: null, containerPorts: [], refs: [], podLabels: null, servicePorts: null,
    ingressBackends: null, rawSpec: null,
  };

  // ---- podSpec 容器规则 ----
  const psPath = podSpecPath(kind);
  if (psPath) checkPodSpec(doc, psPath, kind, ctx, findings, resource);
  if (kind === 'Pod') resource.podLabels = resource.labels; // Pod 的 selector 匹配直接用 metadata.labels

  // ---- workload 专属 ----
  if (isWorkloadKind(kind)) checkWorkload(doc, kind, ctx, findings, resource);

  if (kind === 'Job') {
    const spec = isObj(doc.spec) ? doc.spec : null;
    const tSpec = spec && isObj(spec.template) ? spec.template.spec : null;
    const rp = isObj(tSpec) ? tSpec.restartPolicy : undefined;
    if (rp === 'Always') {
      findings.push(mk('k8s-restart-policy-job', SEV.ERROR, 'spec.template.spec.restartPolicy', 'Job 的 Pod restartPolicy 不能是 Always（apply 失败：Unsupported value）', 'Job 用 Never 或 OnFailure'));
    } else if (rp === undefined || rp === null || rp === '') {
      findings.push(mk('k8s-restart-policy-job', SEV.ERROR, 'spec.template.spec.restartPolicy', 'Job 的 Pod restartPolicy 缺省时按 Always 处理，对 Job 非法（apply 失败：Unsupported value）', '显式写 restartPolicy: Never（或 OnFailure）'));
    }
  }
  if (kind === 'CronJob') checkCronJob(doc, findings);
  if (kind === 'Service') checkService(doc, findings, resource);
  if (kind === 'Ingress') checkIngress(doc, findings, resource);

  return { findings, resource };
}

/* ============================== PodSpec 规则 ============================== */
function eachContainer(podSpec, cb) {
  if (!isObj(podSpec)) return;
  for (const group of ['initContainers', 'containers', 'ephemeralContainers']) {
    if (Array.isArray(podSpec[group])) {
      for (let i = 0; i < podSpec[group].length; i++) cb(podSpec[group][i], group, i, group === 'initContainers');
    }
  }
}

function checkPodSpec(doc, psPath, kind, ctx, findings, resource) {
  const podSpec = psPath.split('.').reduce((acc, k) => (isObj(acc) ? acc[k] : undefined), doc);
  if (!isObj(podSpec)) {
    findings.push(mk('k8s-missing-podspec', SEV.ERROR, psPath, `${kind} 缺少 ${psPath}（PodSpec）——资源不完整，apply 失败`, '补齐 spec.template.spec（containers 必填）'));
    return;
  }
  const containersArr = Array.isArray(podSpec.containers) ? podSpec.containers : null;
  if (!containersArr || containersArr.length === 0) {
    findings.push(mk('k8s-no-containers', SEV.ERROR, psPath + '.containers', 'containers 为空或缺失——每个 Pod 至少一个容器，apply 失败', '至少定义一个容器'));
    return;
  }
  // 容器重名（apply 失败）
  const seen = new Map();
  containersArr.forEach((c, i) => {
    if (isObj(c) && typeof c.name === 'string') {
      if (seen.has(c.name)) {
        findings.push(mk('k8s-container-dup', SEV.ERROR, psPath + '.containers[' + i + '].name', `容器名「${c.name}」重复（与第 ${seen.get(c.name) + 1} 个容器）——Pod 内容器名必须唯一，apply 失败`, '重命名其中一个容器'));
      } else seen.set(c.name, i);
    }
  });

  const podSc = isObj(podSpec.securityContext) ? podSpec.securityContext : null;
  const isServerKind = kind === 'Pod' ? 'pod' : ((kind === 'Job' || kind === 'CronJob') ? 'job' : (isWorkloadKind(kind) ? 'server' : null));

  eachContainer(podSpec, (c, group, i, isInit) => {
    if (!isObj(c)) return;
    const base = psPath + '.' + group + '[' + i + ']';
    const cName = typeof c.name === 'string' ? c.name : `容器${i}`;
    const sc = isObj(c.securityContext) ? c.securityContext : null;

    // ---- 镜像 ----
    if (c.image === undefined || c.image === null || c.image === '') {
      findings.push(mk('k8s-image-missing', SEV.ERROR, base + '.image', `容器 ${cName} 缺少 image——镜像必填，apply 失败`, '补 image，如 nginx:1.27'));
    } else if (typeof c.image === 'string') {
      const img = c.image;
      const afterColon = img.lastIndexOf(':');
      const tag = afterColon > img.lastIndexOf('/') ? img.slice(afterColon + 1) : '';
      if (!img.includes('@') && (tag === '' || tag === 'latest')) {
        findings.push(mk('k8s-image-tag', SEV.WARN, base + '.image', `容器 ${cName} 镜像 ${img} 未钉版本${tag === 'latest' ? '（:latest）' : '（缺 tag，缺省即 latest）'}——拉取结果随时间漂移，回滚不可复现`, '钉具体版本，如 nginx:1.27.3；要不可变再加 @sha256: 摘要'));
      }
    }

    // ---- 安全上下文 ----
    if (sc && sc.privileged === true) {
      findings.push(mk('k8s-privileged', SEV.ERROR, base + '.securityContext.privileged', `容器 ${cName} privileged: true——容器获得节点级内核权限，等价于把宿主机交给容器内进程（安全红线）`, '关闭 privileged；确需特例用 capabilities.add 精确授权并写明理由'));
    }
    if (!sc || sc.allowPrivilegeEscalation !== false) {
      findings.push(mk('k8s-priv-esc', SEV.WARN, base + '.securityContext.allowPrivilegeEscalation', `容器 ${cName} 未显式 allowPrivilegeEscalation: false——setuid 二进制可越权提升`, 'securityContext.allowPrivilegeEscalation: false'));
    }
    const runAsNonRoot = (sc && sc.runAsNonRoot === true) || (podSc && podSc.runAsNonRoot === true);
    if (!runAsNonRoot) {
      findings.push(mk('k8s-run-as-root', SEV.WARN, base + '.securityContext.runAsNonRoot', `容器 ${cName} 未声明 runAsNonRoot——镜像缺省以 root 运行（容器内 root + 配置失误=逃逸放大）`, 'securityContext.runAsNonRoot: true（配合 runAsUser），或在 podSpec.securityContext 统一设置'));
    }
    if (!sc || sc.readOnlyRootFilesystem !== true) {
      findings.push(mk('k8s-ro-fs', SEV.INFO, base + '.securityContext.readOnlyRootFilesystem', `容器 ${cName} 未设 readOnlyRootFilesystem: true——可写根文件系统放大篡改与持久化风险`, '根文件系统只读 + 把临时写入目录挂 emptyDir'));
    }
    if (!(sc && isObj(sc.seccompProfile)) && !(podSc && isObj(podSc.seccompProfile))) {
      findings.push(mk('k8s-seccomp', SEV.INFO, base + '.securityContext.seccompProfile', `容器 ${cName} 未配置 seccompProfile——系统调用面未收窄`, 'securityContext.seccompProfile.type: RuntimeDefault'));
    }
    if (sc && isObj(sc.capabilities) && Array.isArray(sc.capabilities.add)) {
      for (const cap of sc.capabilities.add) {
        const up = String(cap).toUpperCase();
        if (DANGEROUS_CAPS.has(up)) {
          findings.push(mk('k8s-cap-add', SEV.WARN, base + '.securityContext.capabilities.add', `容器 ${cName} 添加危险能力 ${cap}（敏感内核接口/进程操控）`, `确认必要性；能用更小粒度就不加 ${cap}`));
        }
      }
    }

    // ---- host 命名空间 ----
    for (const k of ['hostNetwork', 'hostPID', 'hostIPC']) {
      if (podSpec[k] === true) {
        const why = { hostNetwork: '共享宿主机网络栈（可触达节点全部 localhost 服务与流量）', hostPID: '共享宿主机进程命名空间（可窥视并信号杀宿主机进程）', hostIPC: '共享宿主机 IPC 命名空间' }[k];
        findings.push(mk('k8s-host-ns', SEV.ERROR, psPath + '.' + k, `podSpec.${k}: true——${why}，安全红线`, '关闭；确需特例在受控节点单独部署并限制调度'));
      }
    }

    // ---- hostPath 卷 ----
    if (Array.isArray(podSpec.volumes)) {
      podSpec.volumes.forEach((v, vi) => {
        if (isObj(v) && isObj(v.hostPath)) {
          findings.push(mk('k8s-hostpath', SEV.ERROR, psPath + '.volumes[' + vi + '].hostPath', `卷 ${typeof v.name === 'string' ? v.name : vi} 使用 hostPath（${v.hostPath.path || '?'}）——直接挂载节点文件系统，容器失陷=节点失陷入口`, '优先 PVC / emptyDir；确需节点信息用 downward API 或 DaemonSet + 只读精确路径'));
        }
      });
    }

    // ---- automountServiceAccountToken ----
    if (podSpec.automountServiceAccountToken !== false && kind !== 'Job' && kind !== 'CronJob') {
      findings.push(mk('k8s-automount-sa', SEV.INFO, psPath + '.automountServiceAccountToken', 'Pod 自动挂载 ServiceAccount token（K8s 默认行为）——容器内可访问 Kubernetes API', '不用 API 的业务容器显式 automountServiceAccountToken: false，收窄攻击面'));
    }

    // ---- 资源 requests/limits（init 容器豁免 limits 缺失告警级别，仍检查矛盾）----
    if (!isInit) {
      const res = isObj(c.resources) ? c.resources : null;
      const hasLimits = !!(res && isObj(res.limits) && Object.keys(res.limits).length);
      const hasRequests = !!(res && isObj(res.requests) && Object.keys(res.requests).length);
      if (!hasLimits) {
        findings.push(mk('k8s-no-limits', isServerKind === 'job' ? SEV.INFO : SEV.WARN, base + '.resources.limits', `容器 ${cName} 未设置资源 limits——可无上限吃满节点资源，触发节点竞争或 OOM 驱逐邻居`, 'resources.limits: {cpu, memory}'));
      }
      if (hasLimits && !hasRequests) {
        findings.push(mk('k8s-no-requests', SEV.INFO, base + '.resources.requests', `容器 ${cName} 有 limits 无 requests——调度器按 0 资源装箱，过载风险不可见`, 'resources.requests 与 limits 一致（Guaranteed QoS）'));
      }
      if (hasLimits && hasRequests) {
        for (const r of ['cpu', 'memory']) {
          const req = res.requests[r];
          const lim = res.limits[r];
          if (req !== undefined && lim !== undefined && typeof req === 'string' && typeof lim === 'string' && cmpQuantity(req, lim) > 0) {
            findings.push(mk('k8s-req-gt-limit', SEV.ERROR, base + '.resources.requests.' + r, `容器 ${cName} requests.${r}（${req}）大于 limits.${r}（${lim}）——apiserver 直接拒绝（must be less than or equal to limit）`, '调齐 requests ≤ limits'));
          }
        }
      }
    }

    // ---- 探针（server 类业务容器；Pod 本体降 info；Job/CronJob 批处理豁免）----
    if (!isInit && (isServerKind === 'server' || isServerKind === 'pod')) {
      const sevP = isServerKind === 'pod' ? SEV.INFO : SEV.WARN;
      if (!isObj(c.livenessProbe)) {
        findings.push(mk('k8s-no-liveness', sevP, base + '.livenessProbe', `容器 ${cName} 缺少 livenessProbe——进程假死（死锁/僵死连接）无法自愈`, '加 livenessProbe（httpGet/tcpSocket/exec 任一）'));
      }
      if (!isObj(c.readinessProbe)) {
        findings.push(mk('k8s-no-readiness', sevP, base + '.readinessProbe', `容器 ${cName} 缺少 readinessProbe——启动期间与依赖未就绪时仍会被投流`, '加 readinessProbe（启动慢再配 startupProbe）'));
      }
    }

    // ---- env 明文密钥 ----
    if (Array.isArray(c.env)) {
      c.env.forEach((e, ei) => {
        if (!isObj(e) || typeof e.name !== 'string' || !SECRET_NAME_RE.test(e.name)) return;
        if (e.value !== undefined && e.value !== null && e.value !== '') {
          const p = base + '.env[' + ei + '].value';
          if (isPlaceholderValue(e.value)) {
            findings.push(mk('k8s-plaintext-secret', SEV.INFO, p, `环境变量 ${e.name} 名字敏感但值疑似占位符——上线前记得换成 Secret 注入`, '用 valueFrom.secretKeyRef 从 Secret 注入'));
          } else {
            findings.push(mk('k8s-plaintext-secret', SEV.ERROR, p, `环境变量 ${e.name} 疑似明文密钥——清单进 Git/etcd 后泄露面极大（所有可读该资源的人可见）`, '改 valueFrom.secretKeyRef（Secret 独立管理，可接 sealed-secrets/外部 KMS）'));
          }
        }
      });
    }

    // ---- 收集端口（跨资源用，仅业务容器）----
    if (!isInit && Array.isArray(c.ports)) {
      c.ports.forEach((pt) => { if (isObj(pt)) resource.containerPorts.push({ container: cName, port: pt.containerPort, name: pt.name }); });
    }
  });

  // ---- 引用收集（跨资源第二遍用）----
  if (Array.isArray(podSpec.volumes)) {
    podSpec.volumes.forEach((v) => {
      if (!isObj(v)) return;
      if (isObj(v.configMap) && typeof v.configMap.name === 'string') resource.refs.push({ type: 'ConfigMap', name: v.configMap.name, optional: v.configMap.optional === true });
      if (isObj(v.secret) && typeof v.secret.secretName === 'string') resource.refs.push({ type: 'Secret', name: v.secret.secretName, optional: v.secret.optional === true });
      if (isObj(v.persistentVolumeClaim) && typeof v.persistentVolumeClaim.claimName === 'string') resource.refs.push({ type: 'PersistentVolumeClaim', name: v.persistentVolumeClaim.claimName, optional: v.persistentVolumeClaim.optional === true });
    });
  }
  eachContainer(podSpec, (c) => {
    if (!isObj(c)) return;
    if (Array.isArray(c.envFrom)) {
      c.envFrom.forEach((ef) => {
        if (!isObj(ef)) return;
        if (isObj(ef.configMapRef) && typeof ef.configMapRef.name === 'string') resource.refs.push({ type: 'ConfigMap', name: ef.configMapRef.name, optional: ef.configMapRef.optional === true });
        if (isObj(ef.secretRef) && typeof ef.secretRef.name === 'string') resource.refs.push({ type: 'Secret', name: ef.secretRef.name, optional: ef.secretRef.optional === true });
      });
    }
    if (Array.isArray(c.env)) {
      c.env.forEach((e) => {
        if (!isObj(e) || !isObj(e.valueFrom)) return;
        if (isObj(e.valueFrom.configMapKeyRef) && typeof e.valueFrom.configMapKeyRef.name === 'string') resource.refs.push({ type: 'ConfigMap', name: e.valueFrom.configMapKeyRef.name, optional: e.valueFrom.configMapKeyRef.optional === true });
        if (isObj(e.valueFrom.secretKeyRef) && typeof e.valueFrom.secretKeyRef.name === 'string') resource.refs.push({ type: 'Secret', name: e.valueFrom.secretKeyRef.name, optional: e.valueFrom.secretKeyRef.optional === true });
      });
    }
  });
  if (Array.isArray(podSpec.imagePullSecrets)) {
    podSpec.imagePullSecrets.forEach((s) => { if (isObj(s) && typeof s.name === 'string') resource.refs.push({ type: 'Secret', name: s.name, optional: true }); });
  }
}

/** K8s Quantity 近似比较（统一转数值；解析失败返回 0=相等不误报） */
function cmpQuantity(a, b) {
  const pa = parseQuantity(a); const pb = parseQuantity(b);
  if (pa === null || pb === null) return 0;
  return pa < pb ? -1 : (pa > pb ? 1 : 0);
}
function parseQuantity(q) {
  const m = /^(\d+(?:\.\d+)?)(m|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei)?$/.exec(String(q).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case undefined: case '': return n;
    case 'm': return n / 1000;
    case 'k': return n * 1e3;
    case 'M': return n * 1e6;
    case 'G': return n * 1e9;
    case 'T': return n * 1e12;
    case 'P': return n * 1e15;
    case 'E': return n * 1e18;
    case 'Ki': return n * 1024;
    case 'Mi': return n * 1024 ** 2;
    case 'Gi': return n * 1024 ** 3;
    case 'Ti': return n * 1024 ** 4;
    case 'Pi': return n * 1024 ** 5;
    case 'Ei': return n * 1024 ** 6;
    default: return null;
  }
}

/* ============================== workload 专属 ============================== */
function checkWorkload(doc, kind, ctx, findings, resource) {
  const spec = isObj(doc.spec) ? doc.spec : null;
  if (!spec) {
    findings.push(mk('k8s-missing-spec', SEV.ERROR, 'spec', `${kind} 缺少 spec——apply 失败`, '补 spec'));
    return;
  }
  if (kind !== 'Job' && kind !== 'CronJob') {
    if (spec.replicas === undefined) {
      findings.push(mk('k8s-single-replica', SEV.INFO, 'spec.replicas', `${kind} 未显式设置 replicas（缺省为 1）——滚动更新期间存在单副本服务空窗`, '生产负载显式 replicas: 2+'));
    } else if (spec.replicas === 1) {
      findings.push(mk('k8s-single-replica', SEV.INFO, 'spec.replicas', 'replicas: 1——滚动更新瞬间新旧交替，吞吐减半且存在空窗风险', '高可用负载建议 replicas: 2+'));
    }
    if (isObj(spec.strategy) && spec.strategy.type === 'Recreate') {
      findings.push(mk('k8s-recreate-strategy', SEV.INFO, 'spec.strategy.type', 'strategy: Recreate——更新时先杀全部旧 Pod 再建新，存在服务全停窗口', '无状态服务建议 RollingUpdate（缺省）'));
    }
  }
  const sel = spec.selector;
  const tmpl = isObj(spec.template) ? spec.template : null;
  const tmplLabels = tmpl && isObj(tmpl.metadata) && isObj(tmpl.metadata.labels) ? tmpl.metadata.labels : null;
  resource.podLabels = tmplLabels;
  if (!isObj(sel) || (!isObj(sel.matchLabels) && !Array.isArray(sel.matchExpressions))) {
    findings.push(mk('k8s-selector-missing', SEV.ERROR, 'spec.selector', `${kind} 缺少 spec.selector（matchLabels/matchExpressions）——apps/v1 起必填，apply 即失败`, '补 spec.selector.matchLabels，键值必须全部出现在 template.metadata.labels'));
  } else if (isObj(sel.matchLabels)) {
    resource.selector = sel.matchLabels;
    if (tmplLabels) {
      for (const [k, v] of Object.entries(sel.matchLabels)) {
        if (!(k in tmplLabels)) {
          findings.push(mk('k8s-selector-mismatch', SEV.ERROR, 'spec.selector.matchLabels.' + k, `selector 要求 label ${k}=${JSON.stringify(v)}，但 template.metadata.labels 没有 ${k}——apply 即失败（Invalid value: selector does not match template labels）`, '在 template.metadata.labels 补齐该标签'));
        } else if (String(tmplLabels[k]) !== String(v)) {
          findings.push(mk('k8s-selector-mismatch', SEV.ERROR, 'spec.selector.matchLabels.' + k, `selector 要求 ${k}=${JSON.stringify(v)}，template 实际是 ${JSON.stringify(tmplLabels[k])}——值不相等，apply 即失败`, '对齐 selector 与 template.labels 的值（注意数字加引号变字符串）'));
        }
      }
    } else if (tmpl) {
      findings.push(mk('k8s-selector-mismatch', SEV.ERROR, 'spec.template.metadata.labels', 'template.metadata 缺少 labels——selector 无从匹配，apply 即失败', '给 template.metadata 补 labels，覆盖 selector.matchLabels 全部键值'));
    }
  }
}

/* ============================== CronJob ============================== */
function checkCronJob(doc, findings) {
  const spec = isObj(doc.spec) ? doc.spec : null;
  if (!spec || typeof spec.schedule !== 'string' || !spec.schedule.trim()) {
    findings.push(mk('k8s-cron-missing', SEV.ERROR, 'spec.schedule', 'CronJob 缺少 spec.schedule——apply 失败（必填）', '补 schedule，如 "*/5 * * * *"'));
    return;
  }
  const v = validateK8sCron(spec.schedule);
  if (!v.ok) {
    findings.push(mk('k8s-cron-invalid', SEV.ERROR, 'spec.schedule', `schedule「${spec.schedule}」无效：${v.detail}`, '标准 5 段 cron（分 时 日 月 星期）；支持 @hourly/@daily 简写与 CRON_TZ=Asia/Shanghai 前缀'));
  }
  if (spec.concurrencyPolicy !== undefined && !['Allow', 'Forbid', 'Replace'].includes(spec.concurrencyPolicy)) {
    findings.push(mk('k8s-cron-concurrency', SEV.ERROR, 'spec.concurrencyPolicy', `concurrencyPolicy「${spec.concurrencyPolicy}」非法（只允许 Allow/Forbid/Replace）——apply 失败`, '改正取值'));
  }
}

/**
 * K8s CronJob schedule 校验：5 段 vixie 语义；@yearly/@monthly/@weekly/@daily/@midnight/
 * @hourly 简写；CRON_TZ=/TZ= 时区前缀；7=0 均为周日；月/星期支持英文名。
 */
const KCRON_BOUNDS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const KCRON_NAMES = [
  { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 },
  { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 },
];
function validateK8sCron(expr) {
  let e = String(expr).trim();
  const tzM = /^(?:CRON_TZ|TZ)=[^\s]+\s+/.exec(e);
  if (tzM) e = e.slice(tzM[0].length);
  if (e.startsWith('@')) {
    return ['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly'].includes(e)
      ? { ok: true, detail: '' } : { ok: false, detail: `未知简写 ${e}（支持 @yearly/@monthly/@weekly/@daily/@hourly）` };
  }
  if (e.includes('?')) return { ok: false, detail: 'K8s cron 不支持 ? 占位（Quartz 语法），用 * 代替' };
  const fields = e.split(/\s+/);
  if (fields.length !== 5) return { ok: false, detail: `应为 5 段（分 时 日 月 星期），实际 ${fields.length} 段` };
  for (let f = 0; f < 5; f++) {
    const [lo, hi] = KCRON_BOUNDS[f];
    for (const item of fields[f].split(',')) {
      const m = /^(\*|\d+|[A-Za-z]{3})(?:-(\d+|[A-Za-z]{3}))?(?:\/(\d+))?$/.exec(item);
      if (!m) return { ok: false, detail: `第 ${f + 1} 段「${item}」格式无法识别` };
      const names = f === 3 ? KCRON_NAMES[0] : (f === 4 ? KCRON_NAMES[1] : null);
      const num = (tok) => {
        if (/^\d+$/.test(tok)) return parseInt(tok, 10);
        if (names && names[tok.toUpperCase()] !== undefined) return names[tok.toUpperCase()];
        return NaN;
      };
      const a = num(m[1]);
      if (m[1] !== '*') {
        if (Number.isNaN(a)) return { ok: false, detail: `第 ${f + 1} 段「${item}」含无效数值/名称` };
        if (a < lo || (a > hi && !(f === 4 && a === 7))) return { ok: false, detail: `第 ${f + 1} 段「${item}」超出范围 ${lo}-${hi}` };
      }
      if (m[2]) {
        const b = num(m[2]);
        if (Number.isNaN(b)) return { ok: false, detail: `第 ${f + 1} 段「${item}」范围终点无效` };
        if (b < lo || (b > hi && !(f === 4 && b === 7))) return { ok: false, detail: `第 ${f + 1} 段「${item}」范围超出 ${lo}-${hi}` };
        if (m[1] !== '*' && a > b) return { ok: false, detail: `第 ${f + 1} 段「${item}」范围起点大于终点` };
      }
      if (m[3] && parseInt(m[3], 10) < 1) return { ok: false, detail: `第 ${f + 1} 段「${item}」步长须 ≥1` };
    }
  }
  return { ok: true, detail: '' };
}

/* ============================== Service ============================== */
function checkService(doc, findings, resource) {
  const spec = isObj(doc.spec) ? doc.spec : null;
  if (!spec) {
    findings.push(mk('k8s-missing-spec', SEV.ERROR, 'spec', 'Service 缺少 spec——apply 失败', '补 spec（ports/selector）'));
    return;
  }
  resource.servicePorts = Array.isArray(spec.ports) ? spec.ports : [];
  const isExternalName = spec.type === 'ExternalName';
  if (!Array.isArray(spec.ports) || spec.ports.length === 0) {
    if (!isExternalName) {
      findings.push(mk('k8s-svc-no-ports', SEV.ERROR, 'spec.ports', 'Service 缺少 spec.ports——apply 失败（ExternalName 除外）', '补 ports: [{port, targetPort}]'));
    }
    return;
  }
  if (isExternalName) return;
  const sel = spec.selector;
  if (!isObj(sel) || Object.keys(sel).length === 0) {
    findings.push(mk('k8s-svc-no-target', SEV.INFO, 'spec.selector', 'Service 无 selector——流量走手动维护的 Endpoints/EndpointSlice（若非有意为之需补 selector）', '常规服务补 spec.selector'));
  } else {
    resource.svcSelector = sel;
  }
  spec.ports.forEach((p, i) => {
    if (isObj(p) && p.targetPort === undefined) {
      findings.push(mk('k8s-svc-targetport-default', SEV.INFO, 'spec.ports[' + i + '].targetPort', `端口 ${p.port} 未显式 targetPort（缺省与 port 同值）——容器端口重构时易静默断流`, '显式写 targetPort'));
    }
  });
}

/* ============================== Ingress ============================== */
function checkIngress(doc, findings, resource) {
  const spec = isObj(doc.spec) ? doc.spec : null;
  if (!spec) return;
  const isV1 = doc.apiVersion === 'networking.k8s.io/v1';
  const hasClass = spec.ingressClassName !== undefined || (isObj(doc.metadata) && isObj(doc.metadata.annotations) && 'kubernetes.io/ingress.class' in doc.metadata.annotations);
  if (!hasClass) {
    findings.push(mk('k8s-ingress-class', SEV.INFO, 'spec.ingressClassName', '未指定 ingressClassName（也没有 kubernetes.io/ingress.class 注解）——集群缺省 IngressClass 不一定存在，可能不生效', '显式 spec.ingressClassName: nginx 等'));
  }
  resource.ingressBackends = [];
  if (isV1 && Array.isArray(spec.rules)) {
    spec.rules.forEach((r, ri) => {
      if (!isObj(r) || !isObj(r.http) || !Array.isArray(r.http.paths)) return;
      r.http.paths.forEach((p, pi) => {
        if (!isObj(p)) return;
        const b = p.backend;
        if (!isObj(b) || !isObj(b.service) || !b.service.name) {
          findings.push(mk('k8s-ingress-backend-shape', SEV.ERROR, `spec.rules[${ri}].http.paths[${pi}].backend`, 'networking.k8s.io/v1 的 backend 必须是 {service: {name, port: {number|name}}} 结构（v1beta1 的 serviceName/servicePort 写法已失效，apply 失败）', 'backend.service.name + backend.service.port.number'));
          return;
        }
        resource.ingressBackends.push({
          name: b.service.name,
          port: b.service.port ? (b.service.port.number !== undefined ? b.service.port.number : b.service.port.name) : undefined,
          path: `spec.rules[${ri}].http.paths[${pi}].backend`,
        });
      });
    });
  }
}

/* ============================== 跨资源检查 ============================== */
/** 第二遍：本批清单内一致性。所有发现带 docIndex + path + line。 */
function crossCheck(resources, ctxOf) {
  const findings = [];
  const byKind = new Map();
  for (const r of resources) {
    if (!r || !r.name) continue;
    if (!byKind.has(r.kind)) byKind.set(r.kind, new Map());
    byKind.get(r.kind).set(r.name, r);
  }
  const find = (kind, name) => (byKind.get(kind) ? byKind.get(kind).get(name) : undefined);

  for (const r of resources) {
    if (!r) continue;
    const c = ctxOf(r);

    for (const ref of r.refs) {
      if (!find(ref.type, ref.name)) {
        const opt = ref.optional ? '（声明 optional，缺失可容忍）' : '';
        findings.push(withDoc(mk('k8s-ref-missing', SEV.INFO, '', `${r.kind}/${r.name} 引用的 ${ref.type}「${ref.name}」未在本批清单中定义${opt}（集群已存在则可忽略；整批部署会缺资源）`, `在本批清单补 ${ref.type}/${ref.name}，或确认其已在集群中`), r, c));
      }
    }

    if (r.kind === 'Service' && r.svcSelector) {
      const target = matchWorkload(resources, r.svcSelector);
      if (!target) {
        findings.push(withDoc(mk('k8s-svc-no-target', SEV.WARN, 'spec.selector', `Service「${r.name}」的 selector 在本批清单中匹配不到任何 Pod/workload——若集群中也没有匹配 Pod，Service 将无后端（Connection refused）`, '核对 selector 键值与 workload template.labels 一致'), r, c));
      } else {
        for (const p of r.servicePorts || []) {
          if (!isObj(p)) continue;
          const tp = p.targetPort === undefined ? p.port : p.targetPort;
          if (tp === undefined || tp === null) continue;
          const hit = target.containerPorts.some((cp) => String(cp.port) === String(tp) || (cp.name !== undefined && cp.name === tp));
          if (!hit) {
            findings.push(withDoc(mk('k8s-svc-port-mismatch', SEV.WARN, 'spec.ports[].targetPort', `Service「${r.name}」的 targetPort ${tp} 在匹配的 ${target.kind}/${target.name} 容器端口（${target.containerPorts.map((x) => x.port).join(', ') || '无'}）中不存在——流量到 Pod 即被拒`, '对齐 targetPort 与容器 containerPort'), r, c));
          }
        }
      }
    }

    if (r.kind === 'StatefulSet') {
      const sn = r.rawSpec && r.rawSpec.serviceName;
      if (typeof sn === 'string' && sn && !find('Service', sn)) {
        findings.push(withDoc(mk('k8s-sts-service-missing', SEV.WARN, 'spec.serviceName', `StatefulSet「${r.name}」的 serviceName「${sn}」未在本批清单中定义——headless Service 是 StatefulSet 稳定网络身份的前提`, '补一个 clusterIP: None 的 Service（名字=serviceName）'), r, c));
      }
    }

    if (r.kind === 'Ingress' && Array.isArray(r.ingressBackends)) {
      for (const b of r.ingressBackends) {
        const svc = find('Service', b.name);
        if (!svc) {
          findings.push(withDoc(mk('k8s-ingress-svc-missing', SEV.WARN, b.path + '.service', `Ingress 引用的 Service「${b.name}」未在本批清单中定义（集群已有则可忽略）`, `补 Service/${b.name} 或确认其存在`), r, c));
        } else if (svc.servicePorts && b.port !== undefined && b.port !== null) {
          const hit = svc.servicePorts.some((sp) => isObj(sp) && (String(sp.port) === String(b.port) || sp.name === b.port));
          if (!hit) {
            findings.push(withDoc(mk('k8s-ingress-port-mismatch', SEV.WARN, b.path + '.service.port', `Ingress 指向 Service「${b.name}」的端口 ${b.port}，但该 Service 端口是 ${svc.servicePorts.map((sp) => (isObj(sp) ? sp.port : '?')).join(', ')}——请求落到 Default Backend（404）`, '对齐 backend.service.port.number 与 Service 端口'), r, c));
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

/** selector（labels 全包含）匹配 Pod/workload；返回 { kind, name, containerPorts } 或 null */
function matchWorkload(resources, selector) {
  const entries = Object.entries(selector);
  const candidates = [];
  for (const r of resources) {
    if (!r || !r.podLabels || !r.name) continue;
    if (!['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Pod'].includes(r.kind)) continue;
    if (entries.every(([k, v]) => String(r.podLabels[k]) === String(v))) candidates.push(r);
  }
  const pod = candidates.find((x) => x.kind === 'Pod');
  const pick = pod || candidates[0];
  return pick ? { kind: pick.kind, name: pick.name, containerPorts: pick.containerPorts } : null;
}

/* ============================== 主入口 ============================== */
/**
 * 体检一段（多文档）K8s YAML。
 * opts.parseYaml(text) 由调用方注入（js-yaml load；失败抛错，可带 mark.line 0 基）。
 * 返回 { kind:'k8s', docs, findings, stats, score, grade }；
 * findings 全部带 line（1 基全文行号）与 docIndex。
 */
function lint(text, opts) {
  const parseYaml = opts && opts.parseYaml;
  if (!parseYaml) throw new Error('k8s-core 需要 opts.parseYaml（调用方注入 js-yaml load）');
  const pieces = splitDocs(text);
  const resources = [];
  const docResults = [];
  const allFindings = [];
  let helmDocs = 0;

  const mkCtx = (startLine, lineIndex) => ({
    startLine: () => startLine,
    lineIndex: () => lineIndex,
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
      const markLine = e && e.mark && typeof e.mark.line === 'number' ? e.mark.line + 1 : 1;
      const f = mk('k8s-yaml-syntax', SEV.ERROR, '', `YAML 语法错误（第 ${i + 1} 个文档）：${(e && e.message) || '解析失败'}`, '修复 YAML 缩进/冒号/引号后重试');
      f.line = piece.startLine + markLine - 1;
      f.docIndex = i;
      allFindings.push(f);
      docResults.push({ index: i, startLine: docSpan.startLine, endLine: docSpan.endLine, kind: null, name: null, apiVersion: null, error: true, findings: [f] });
      continue;
    }
    if (doc === null || doc === undefined) continue;

    const lineIndex = buildLineIndex(relLines);
    const ctx = { docIndex: i, startLine: docSpan.startLine, lineIndex };
    const r = lintDoc(doc, ctx);
    // 解析行号：path → 行索引 → doc 起始行兜底
    for (const f of r.findings) {
      f.line = lineForPath(lineIndex, f.path, docSpan.startLine);
      f.docIndex = i;
    }
    if (r.resource) {
      r.resource.rawSpec = isObj(doc.spec) ? doc.spec : null;
      resources.push(r.resource);
    }
    docResults.push({
      index: i, startLine: docSpan.startLine, endLine: docSpan.endLine,
      kind: r.resource ? r.resource.kind : null, name: r.resource ? r.resource.name : null,
      apiVersion: r.resource ? r.resource.apiVersion : null, findings: r.findings,
      _lineIndex: lineIndex,
    });
    allFindings.push(...r.findings);
  }

  const cross = crossCheck(resources, (res) => ({
    lineIndex: () => {
      const d = docResults.find((x) => x.index === res.docIndex);
      return d ? d._lineIndex : new Map();
    },
    startLine: () => {
      const d = docResults.find((x) => x.index === res.docIndex);
      return d ? d.startLine : 1;
    },
  }));
  allFindings.push(...cross);

  const stats = {
    docs: docResults.filter((d) => !d.helm && !d.error).length,
    rules: RULE_COUNT,
    error: allFindings.filter((f) => f.level === SEV.ERROR).length,
    warn: allFindings.filter((f) => f.level === SEV.WARN).length,
    info: allFindings.filter((f) => f.level === SEV.INFO).length,
    helmDocs,
  };
  const score = scoreOf(stats);
  return { kind: 'k8s', docs: docResults, findings: allFindings, stats, score, grade: gradeOf(score) };
}

function scoreOf(stats) {
  return Math.max(0, round1(10 - stats.error * DEDUCT.error - stats.warn * DEDUCT.warn - stats.info * DEDUCT.info));
}
function gradeOf(score) {
  if (score >= 8.5) return '优';
  if (score >= 6.5) return '良';
  if (score >= 4) return '中';
  return '需整改';
}

/** 类型自识别：'k8s' | 'unknown' | ''（空） */
function detectKind(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (/^\s*(FROM|RUN|CMD)\b/m.test(t) && !/apiVersion\s*:/.test(t)) return 'unknown';
  if (/apiVersion\s*:/.test(t) && /kind\s*:/.test(t)) return 'k8s';
  return 'unknown';
}

/* ============================== 规则目录 ============================== */
const RULES = {
  'k8s-yaml-syntax': { level: 'error', desc: 'YAML 语法错误', fix: '修复缩进/冒号/引号；多文档用 --- 分隔' },
  'k8s-not-object': { level: 'error', desc: '文档不是键值映射', fix: '每个 --- 文档应是一个资源对象' },
  'k8s-missing-api': { level: 'error', desc: '缺少 apiVersion', fix: '补 apiVersion（Deployment=apps/v1，核心资源=v1）' },
  'k8s-missing-kind': { level: 'error', desc: '缺少 kind', fix: '补 kind' },
  'k8s-missing-name': { level: 'error', desc: '缺少 metadata.name', fix: '补 metadata.name 或 generateName' },
  'k8s-invalid-name': { level: 'error', desc: 'metadata.name 不符合 RFC1123（小写字母数字-/.，≤253）', fix: '改小写连字符式命名' },
  'k8s-kind-api-mismatch': { level: 'error', desc: 'kind 与 apiVersion 不匹配', fix: '按 kind 表改用正确 apiVersion' },
  'k8s-deprecated-api': { level: 'error', desc: 'apiVersion 已被集群移除（apps/v1beta*、extensions/v1beta1、policy/v1beta1、autoscaling/v2beta*、networking.k8s.io/v1beta1 等）', fix: '迁移到现行 apiVersion' },
  'k8s-label-value-type': { level: 'error', desc: 'labels/annotations 值不是字符串（数字/布尔被 apiserver 拒绝）', fix: '值加引号' },
  'k8s-unknown-kind': { level: 'warn', desc: '未识别的 kind（可能是拼写错误或 CRD）', fix: '核对 kind 名称' },
  'k8s-cr-skip': { level: 'info', desc: 'CRD/扩展资源，只做结构层检查', fix: '' },
  'k8s-privileged': { level: 'error', desc: 'privileged: true（安全红线）', fix: '关闭；用 capabilities 精确授权' },
  'k8s-host-ns': { level: 'error', desc: 'hostNetwork/hostPID/hostIPC: true（共享宿主机命名空间）', fix: '关闭；特例受控部署' },
  'k8s-hostpath': { level: 'error', desc: 'hostPath 卷直接挂载节点文件系统', fix: '改 PVC/emptyDir；确需只读精确路径' },
  'k8s-plaintext-secret': { level: 'error', desc: '环境变量疑似明文密钥（按名字红旗识别；占位值降 info）', fix: '改 valueFrom.secretKeyRef' },
  'k8s-image-missing': { level: 'error', desc: '容器缺少 image', fix: '补 image' },
  'k8s-container-dup': { level: 'error', desc: '容器名重复（Pod 内必须唯一）', fix: '重命名' },
  'k8s-req-gt-limit': { level: 'error', desc: 'requests 大于 limits（apiserver 拒绝）', fix: 'requests ≤ limits' },
  'k8s-restart-policy-job': { level: 'error', desc: 'Job 的 Pod restartPolicy 非法（不能 Always/缺省）', fix: 'Never 或 OnFailure' },
  'k8s-cron-missing': { level: 'error', desc: 'CronJob 缺少 spec.schedule', fix: '补 schedule' },
  'k8s-cron-invalid': { level: 'error', desc: 'schedule cron 表达式非法', fix: '5 段 cron / @daily 简写 / CRON_TZ 前缀' },
  'k8s-cron-concurrency': { level: 'error', desc: 'concurrencyPolicy 取值非法', fix: 'Allow/Forbid/Replace' },
  'k8s-missing-spec': { level: 'error', desc: '缺少 spec', fix: '补 spec' },
  'k8s-missing-podspec': { level: 'error', desc: '缺少 PodSpec（spec.template.spec）', fix: '补齐模板' },
  'k8s-no-containers': { level: 'error', desc: 'containers 为空', fix: '至少一个容器' },
  'k8s-selector-missing': { level: 'error', desc: 'workload 缺少 spec.selector（apps/v1 必填）', fix: '补 matchLabels' },
  'k8s-selector-mismatch': { level: 'error', desc: 'selector 与 template.labels 不一致（apply 即失败）', fix: '对齐键值' },
  'k8s-svc-no-ports': { level: 'error', desc: 'Service 缺少 ports', fix: '补 ports' },
  'k8s-ingress-backend-shape': { level: 'error', desc: 'Ingress v1 backend 结构错误（v1beta1 旧写法已失效）', fix: 'backend.service.{name, port.number}' },
  'k8s-image-tag': { level: 'warn', desc: '镜像未钉版本（latest/缺 tag）', fix: '钉具体版本或 @sha256 摘要' },
  'k8s-priv-esc': { level: 'warn', desc: '未显式 allowPrivilegeEscalation: false', fix: 'securityContext 显式关闭' },
  'k8s-run-as-root': { level: 'warn', desc: '未声明 runAsNonRoot（缺省 root 运行）', fix: 'runAsNonRoot: true + runAsUser' },
  'k8s-cap-add': { level: 'warn', desc: '添加危险 capability（SYS_ADMIN/NET_RAW 等）', fix: '确认必要性，最小化授权' },
  'k8s-no-limits': { level: 'warn', desc: '容器未设资源 limits（Job/CronJob 降 info）', fix: '补 resources.limits' },
  'k8s-no-liveness': { level: 'warn', desc: '缺少 livenessProbe（假死无法自愈；Pod 本体降 info）', fix: '加 livenessProbe' },
  'k8s-no-readiness': { level: 'warn', desc: '缺少 readinessProbe（未就绪仍投流）', fix: '加 readinessProbe' },
  'k8s-svc-no-target': { level: 'warn', desc: 'Service selector 匹配不到 workload（无 selector 时降 info）', fix: '核对 selector 与 labels' },
  'k8s-svc-port-mismatch': { level: 'warn', desc: 'targetPort 在匹配容器的端口中不存在', fix: '对齐 targetPort 与 containerPort' },
  'k8s-sts-service-missing': { level: 'warn', desc: 'StatefulSet serviceName 未定义（缺 headless Service）', fix: '补 clusterIP: None 的 Service' },
  'k8s-ingress-svc-missing': { level: 'warn', desc: 'Ingress 引用的 Service 未在本批清单中', fix: '补 Service 或确认存在' },
  'k8s-ingress-port-mismatch': { level: 'warn', desc: 'Ingress 指向的 Service 端口不存在', fix: '对齐端口' },
  'k8s-ref-missing': { level: 'info', desc: '引用的 ConfigMap/Secret/PVC 未在本批清单中定义', fix: '补资源或确认集群已存在' },
  'k8s-svc-targetport-default': { level: 'info', desc: 'targetPort 缺省与 port 同值', fix: '显式写 targetPort' },
  'k8s-ingress-class': { level: 'info', desc: '未指定 ingressClassName（可能不生效）', fix: '显式指定' },
  'k8s-ro-fs': { level: 'info', desc: '未设 readOnlyRootFilesystem', fix: '根文件系统只读 + emptyDir' },
  'k8s-seccomp': { level: 'info', desc: '未配置 seccompProfile', fix: 'RuntimeDefault' },
  'k8s-automount-sa': { level: 'info', desc: '自动挂载 ServiceAccount token', fix: '不用 API 则显式关闭' },
  'k8s-no-requests': { level: 'info', desc: '有 limits 无 requests', fix: 'requests=limits（Guaranteed QoS）' },
  'k8s-single-replica': { level: 'info', desc: '单副本（更新空窗风险）', fix: '生产负载 replicas: 2+' },
  'k8s-recreate-strategy': { level: 'info', desc: 'strategy: Recreate（更新全停窗口）', fix: '无状态用 RollingUpdate' },
  'k8s-hpa-v1': { level: 'info', desc: 'autoscaling/v1 旧版 HPA（仅 CPU/内存指标）', fix: '迁移 autoscaling/v2' },
};
const RULE_COUNT = Object.keys(RULES).length;

/** 规则目录文本 */
function ruleCatalog() {
  const bySev = { error: [], warn: [], info: [] };
  for (const [id, r] of Object.entries(RULES)) bySev[r.level].push(`- ${id}：${r.desc}${r.fix ? `（→ ${r.fix}）` : ''}`);
  return [
    `### K8s 清单体检规则目录（共 ${RULE_COUNT} 条）`,
    `**error ${bySev.error.length} 条（apply 失败/安全红线）**\n${bySev.error.join('\n')}`,
    `**warn ${bySev.warn.length} 条（安全风险/疑似断链）**\n${bySev.warn.join('\n')}`,
    `**info ${bySev.info.length} 条（最佳实践）**\n${bySev.info.join('\n')}`,
    '边界：不校验未知字段拼写；CRD 只做结构层；跨资源只对「本批清单内」判定；Helm 模板跳过。',
  ].join('\n\n');
}

/** 单条规则解释；未知 id 返回 null */
function explainRule(id) {
  const r = RULES[id];
  if (!r) return null;
  return `### ${id}\n- 严重级：${r.level}\n- 含义：${r.desc}\n- 修复：${r.fix || '视上下文而定'}`;
}

/* ============================== 渲染 ============================== */
/** markdown 报告（MCP/对话用；面板用结构化 findings 自渲染） */
function renderReport(r, title) {
  const head = title || 'K8s 清单体检报告';
  const lines = [
    `### ${head}`,
    `文档 ${r.stats.docs} 个 · 发现 ${r.findings.length} 项（error ${r.stats.error} · warn ${r.stats.warn} · info ${r.stats.info}）· 评分 **${r.score}/10（${r.grade}）** · 规则 ${r.stats.rules} 条${r.stats.helmDocs ? ` · Helm 模板文档 ${r.stats.helmDocs} 个（跳过）` : ''}`,
    '',
  ];
  if (!r.findings.length) {
    lines.push(`✅ ${r.stats.rules} 条规则扫描完毕，零发现。`);
    return lines.join('\n');
  }
  const sevLabel = { error: '🔴 error', warn: '🟡 warn', info: '🔵 info' };
  for (const d of r.docs) {
    const label = d.helm ? 'Helm 模板（跳过）' : d.error ? 'YAML 解析失败' : `${d.kind || '未知资源'}${d.name ? '/' + d.name : ''}${d.apiVersion ? ' · ' + d.apiVersion : ''}`;
    lines.push(`**文档 ${d.index + 1}**（行 ${d.startLine}-${d.endLine}）：${label}`);
    for (const f of r.findings.filter((x) => x.docIndex === d.index)) {
      lines.push(`- 行 ${f.line ?? '?'} \`${f.rule}\` [${sevLabel[f.level] || f.level}] ${f.message}${f.fix ? ` —— ${f.fix}` : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  SEV, DEDUCT, KIND_API, RULES, RULE_COUNT,
  splitDocs, buildLineIndex, lineForPath, parseKeyLine,
  validRfc1123, isPlaceholderValue, looksLikeHelm, podSpecPath, isWorkloadKind,
  validateK8sCron, parseQuantity, cmpQuantity,
  lintDoc, lint, detectKind, scoreOf, gradeOf, ruleCatalog, explainRule, renderReport,
};
