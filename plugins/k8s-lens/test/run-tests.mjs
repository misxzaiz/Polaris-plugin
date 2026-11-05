#!/usr/bin/env node
/**
 * k8s-lens 离线单测：核心引擎逐规则正反例 + 行索引/行号 + 干净夹具零误报 + 评分。
 * 运行：node test/run-tests.mjs（零外部依赖注入 js-yaml；仓库根 node_modules 供 js-yaml）
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
// js-yaml 从插件目录解析（esbuild bundle 同款依赖）
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yaml = require(path.join(pluginDir, 'node_modules', 'js-yaml'));
const core = require(path.join(pluginDir, 'shared', 'k8s-core.js'));

const parseYaml = (t) => yaml.load(t, { schema: yaml.DEFAULT_SCHEMA });

let pass = 0, fail = 0, group = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}
function section(name) { group++; console.log(`\n[${group}] ${name}`); }
function lintText(t) { return core.lint(t, { parseYaml }); }
function ruleIds(r) { return new Set(r.findings.map((f) => f.rule)); }
function has(r, id) { return r.findings.some((f) => f.rule === id); }
function count(r, id) { return r.findings.filter((f) => f.rule === id).length; }

/* ============ 1. splitDocs ============ */
section('splitDocs 多文档分割');
{
  const t = 'a: 1\n---\nb: 2\n---\nc: 3\n';
  const docs = core.splitDocs(t);
  ok(docs.length === 3, `3 文档，实际 ${docs.length}`);
  ok(docs[0].startLine === 1 && docs[1].startLine === 3 && docs[2].startLine === 5, `行号 1/3/5，实际 ${docs.map((d) => d.startLine)}`);
}
{
  const t = '# 只有注释\n---\n\n---\nk: v\n';
  const docs = core.splitDocs(t);
  ok(docs.length === 1 && docs[0].text.trim() === 'k: v', `注释/空文档跳过，实际 ${docs.length} 个`);
}
{
  const t = '---\na: 1\n...\n---\nb: 2\n';
  const docs = core.splitDocs(t);
  ok(docs.length === 2, `... 终止符后继续，实际 ${docs.length}`);
}
{
  const t = 'a: "x\\n---\\ny"\n---\nb: 2\n';
  const docs = core.splitDocs(t);
  ok(docs.length === 2, `字符串内 --- 不切分（引号内转义），实际 ${docs.length}`);
}

/* ============ 2. buildLineIndex / 行号 ============ */
section('buildLineIndex 行索引');
{
  const idx = core.buildLineIndex([
    'apiVersion: apps/v1',      // 1
    'kind: Deployment',          // 2
    'metadata:',                 // 3
    '  name: web',               // 4
    '  labels:',                 // 5
    '    app: web',              // 6
    'spec:',                     // 7
    '  replicas: 3',             // 8
    '  template:',               // 9
    '    spec:',                 // 10
    '      containers:',         // 11
    '      - name: main',        // 12
    '        image: nginx:1.27', // 13
    '      - name: side',        // 14
    '        image: busybox:1.36', // 15
  ]);
  const g = (p) => idx.get(p) && idx.get(p).line;
  ok(g('apiVersion') === 1, `apiVersion@1，实际 ${g('apiVersion')}`);
  ok(g('metadata.name') === 4, `metadata.name@4，实际 ${g('metadata.name')}`);
  ok(g('metadata.labels.app') === 6, `labels.app@6，实际 ${g('metadata.labels.app')}`);
  ok(g('spec.replicas') === 8, `replicas@8，实际 ${g('spec.replicas')}`);
  ok(g('spec.template.spec.containers') === 11, `containers@11，实际 ${g('spec.template.spec.containers')}`);
  ok(g('spec.template.spec.containers[0].name') === 12, `c[0].name@12（flush 式序列），实际 ${g('spec.template.spec.containers[0].name')}`);
  ok(g('spec.template.spec.containers[1].image') === 15, `c[1].image@15（连续项不嵌套），实际 ${g('spec.template.spec.containers[1].image')}`);
}
{
  // 缩进式序列 + 行内首键 + 注释截断
  const idx = core.buildLineIndex([
    'spec:',                    // 1
    '  containers:',            // 2
    '    - name: main',         // 3
    '      image: nginx  # 注释 # 号', // 4
    '      ports:',             // 5
    '        - containerPort: 80', // 6
  ]);
  const g = (p) => idx.get(p) && idx.get(p).line;
  ok(g('spec.containers[0].name') === 3, `缩进式 c[0].name@3，实际 ${g('spec.containers[0].name')}`);
  ok(g('spec.containers[0].image') === 4, `image@4，实际 ${g('spec.containers[0].image')}`);
  ok(g('spec.containers[0].ports[0].containerPort') === 6, `port@6，实际 ${g('spec.containers[0].ports[0].containerPort')}`);
}
{
  // 块标量体跳过 + 带点键
  const idx = core.buildLineIndex([
    'metadata:',                       // 1
    '  annotations:',                  // 2
    '    app.kubernetes.io/desc: |',   // 3
    '      not: a real key',           // 4
    '      also: not',                 // 5
    'spec: {}',                        // 6
  ]);
  const g = (p) => idx.get(p) && idx.get(p).line;
  ok(g('metadata.annotations.app.kubernetes.io/desc') === 3, `带点键@3，实际 ${g('metadata.annotations.app.kubernetes.io/desc')}`);
  ok(!idx.has('metadata.annotations.app.kubernetes.io/desc.not'), '块标量体内不注册子键');
  ok(g('spec') === 6, `块结束后恢复 spec@6，实际 ${g('spec')}`);
}

/* ============ 3. cron / quantity / 工具 ============ */
section('validateK8sCron');
{
  const okCases = ['*/5 * * * *', '0 2 * * *', '@daily', '@hourly', 'CRON_TZ=Asia/Shanghai 30 8 * * 1-5', '30 8 * * MON-FRI', '0 0 1 1 *', '0 0 * * 7', '15,45 */2 * * SAT'];
  for (const c of okCases) ok(core.validateK8sCron(c).ok, `合法：${c}`);
  const bad = [['*/5 * * *', '4 段'], ['*/5 * * * * *', '6 段'], ['0 0 ? * 1', '? 占位'], ['@ fortnightly', '未知简写'], ['61 * * * *', '分越界'], ['* 24 * * *', '时越界'], ['* * 0 * *', '日越界'], ['* * * 13 *', '月越界'], ['* * * * MON-FRI/0', '步长 0'], ['5-2 * * * *', '范围倒置']];
  for (const [c] of bad) ok(!core.validateK8sCron(c).ok, `非法：${c}`);
}
section('parseQuantity / cmpQuantity');
{
  ok(core.parseQuantity('100m') === 0.1, '100m=0.1');
  ok(core.parseQuantity('1Gi') === 1024 ** 3, '1Gi');
  ok(core.cmpQuantity('2Gi', '1Gi') > 0, '2Gi>1Gi');
  ok(core.cmpQuantity('1536Mi', '1.5Gi') === 0, '1536Mi=1.5Gi');
  ok(core.cmpQuantity('500m', '1') < 0, '500m<1');
  ok(core.cmpQuantity('abc', '1') === 0, '非法量词不比较');
}
section('validRfc1123 / isPlaceholderValue');
{
  ok(core.validRfc1123('my-app-1'), '合法名');
  ok(core.validRfc1123('a'.repeat(253)), '253 字符合法');
  ok(!core.validRfc1123('My-App'), '大写非法');
  ok(!core.validRfc1123('-lead'), '连字符开头非法');
  ok(!core.validRfc1123('a'.repeat(254)), '254 超长');
  ok(core.isPlaceholderValue('changeme') && core.isPlaceholderValue('') && core.isPlaceholderValue('<YOUR_KEY>') && core.isPlaceholderValue('${DB_PASS}') && core.isPlaceholderValue('$(DB_PASS)'), '占位形态');
  ok(!core.isPlaceholderValue('s3cr3t-real-value'), '真实值非占位');
}

/* ============ 4. 结构校验 ============ */
section('结构：缺字段/名字/label 类型');
{
  const r = lintText('metadata:\n  name: x\nkind: ConfigMap\ndata: {}\n');
  ok(has(r, 'k8s-missing-api'), '缺 apiVersion 报 error');
  const r2 = lintText('apiVersion: v1\nmetadata:\n  name: x\n');
  ok(has(r2, 'k8s-missing-kind'), '缺 kind 报 error');
  const r3 = lintText('apiVersion: v1\nkind: ConfigMap\n');
  ok(has(r3, 'k8s-missing-name'), '缺 name 报 error');
  const r4 = lintText('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: "UPPER"\n');
  ok(has(r4, 'k8s-invalid-name'), '大写名 RFC1123 报 error');
}
{
  const t = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm\n  labels:\n    version: 1\n    enabled: true\n';
  const r = lintText(t);
  ok(count(r, 'k8s-label-value-type') === 2, `label 数字/布尔 2 处 error，实际 ${count(r, 'k8s-label-value-type')}`);
  const f = r.findings.find((x) => x.rule === 'k8s-label-value-type');
  ok(f.line === 6, `label 值行号 6，实际 ${f.line}`);
}
section('结构：kind↔apiVersion / 弃用 API');
{
  const r = lintText('apiVersion: apps/v1\nkind: Pod\nmetadata:\n  name: p\n');
  ok(has(r, 'k8s-kind-api-mismatch'), 'apps/v1 + Pod 错配 error');
  const r2 = lintText('apiVersion: apps/v1beta1\nkind: Deployment\nmetadata:\n  name: d\nspec: {}\n');
  ok(has(r2, 'k8s-deprecated-api') && r2.findings.find((f) => f.rule === 'k8s-deprecated-api').level === 'error', 'apps/v1beta1 弃用 error');
  const r3 = lintText('apiVersion: extensions/v1beta1\nkind: Ingress\nmetadata:\n  name: i\n');
  ok(has(r3, 'k8s-deprecated-api'), 'extensions/v1beta1 Ingress 弃用 error');
  const r4 = lintText('apiVersion: policy/v1beta1\nkind: PodSecurityPolicy\nmetadata:\n  name: psp\n');
  ok(has(r4, 'k8s-deprecated-api'), 'PSP 移除 error');
  const r5 = lintText('apiVersion: autoscaling/v2beta2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: h\n');
  ok(has(r5, 'k8s-deprecated-api'), 'v2beta2 HPA 移除 error');
  const r6 = lintText('apiVersion: autoscaling/v1\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: h\n');
  ok(has(r6, 'k8s-hpa-v1') && !has(r6, 'k8s-deprecated-api'), 'autoscaling/v1 合法但 info');
  const r7 = lintText('apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: i\nspec: {}\n');
  ok(!has(r7, 'k8s-deprecated-api') && !has(r7, 'k8s-kind-api-mismatch'), '现行组合零发现');
  const r8 = lintText('apiVersion: example.com/v1\nkind: MyCR\nmetadata:\n  name: c\n');
  ok(has(r8, 'k8s-cr-skip'), 'CRD info 跳过');
  ok(!has(r8, 'k8s-unknown-kind'), 'CRD 不误报 unknown-kind');
}

/* ============ 5. 容器安全规则 ============ */
const DEP_BAD = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: bad-app
  labels:
    app: bad
spec:
  selector:
    matchLabels:
      app: bad
  template:
    metadata:
      labels:
        app: bad
    spec:
      hostNetwork: true
      containers:
        - name: main
          image: nginx:latest
          securityContext:
            privileged: true
            capabilities:
              add:
                - SYS_ADMIN
          env:
            - name: DB_PASSWORD
              value: super-secret-123
            - name: API_TOKEN
              value: "$(SERVICE_TOKEN)"
            - name: SESSION_KEY
              value: changeme
          resources:
            requests:
              cpu: "2"
              memory: 1Gi
            limits:
              cpu: "1"
              memory: 1Gi
      volumes:
        - name: host
          hostPath:
            path: /
`;

section('安全红线规则');
{
  const r = lintText(DEP_BAD);
  ok(has(r, 'k8s-privileged'), 'privileged error');
  ok(has(r, 'k8s-host-ns'), 'hostNetwork error');
  ok(has(r, 'k8s-hostpath'), 'hostPath error');
  ok(has(r, 'k8s-image-tag'), 'latest 镜像 warn');
  ok(has(r, 'k8s-cap-add'), 'SYS_ADMIN cap warn');
  const secErr = r.findings.filter((f) => f.rule === 'k8s-plaintext-secret' && f.level === 'error');
  const secInfo = r.findings.filter((f) => f.rule === 'k8s-plaintext-secret' && f.level === 'info');
  ok(secErr.length === 1, `明文密钥 1 处 error，实际 ${secErr.length}`);
  ok(secErr[0] && secErr[0].message.includes('DB_PASSWORD'), 'error 指向 DB_PASSWORD');
  ok(secInfo.length === 2, `占位值 2 处 info（$(VAR) 引用 + changeme），实际 ${secInfo.length}`);
  ok(secInfo.every((f) => !f.message.includes('DB_PASSWORD')), '$(VAR) 引用与占位都不报 error');
  ok(has(r, 'k8s-req-gt-limit'), 'requests>limits error');
  ok(has(r, 'k8s-priv-esc') && has(r, 'k8s-run-as-root'), 'priv-esc/run-as-root warn');
}
section('行号定位（安全规则）');
{
  const r = lintText(DEP_BAD);
  const lineOf = (id) => r.findings.find((f) => f.rule === id).line;
  ok(lineOf('k8s-privileged') === 21, `privileged@21，实际 ${lineOf('k8s-privileged')}`);
  ok(lineOf('k8s-host-ns') === 16, `hostNetwork@16，实际 ${lineOf('k8s-host-ns')}`);
  ok(lineOf('k8s-hostpath') === 41, `hostPath@41，实际 ${lineOf('k8s-hostpath')}`);
  ok(lineOf('k8s-image-tag') === 19, `image@19，实际 ${lineOf('k8s-image-tag')}`);
  const secErr = r.findings.find((f) => f.rule === 'k8s-plaintext-secret' && f.level === 'error');
  ok(secErr.line === 27, `secret@27，实际 ${secErr.line}`);
}

/* ============ 6. 可靠性规则 ============ */
section('可靠性：probes/resources/副本/容器重名/Job');
{
  const t = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: a
          image: nginx:1.27
        - name: a
          image: nginx:1.27
`;
  const r = lintText(t);
  ok(has(r, 'k8s-container-dup'), '容器重名 error');
  ok(has(r, 'k8s-no-liveness') && has(r, 'k8s-no-readiness'), '缺双探针 warn');
  ok(count(r, 'k8s-no-limits') === 2, `双容器缺 limits 2 条，实际 ${count(r, 'k8s-no-limits')}`);
  ok(has(r, 'k8s-single-replica'), 'replicas:1 info');
  ok(!has(r, 'k8s-selector-missing') && !has(r, 'k8s-selector-mismatch'), 'selector 一致不报');
}
{
  const t = `apiVersion: batch/v1
kind: Job
metadata:
  name: job1
spec:
  template:
    spec:
      containers:
        - name: worker
          image: busybox:1.36
`;
  const r = lintText(t);
  ok(has(r, 'k8s-restart-policy-job'), 'Job 缺 restartPolicy error');
  ok(!has(r, 'k8s-no-liveness') && !has(r, 'k8s-no-readiness'), 'Job 豁免探针');
  ok(!has(r, 'k8s-no-limits') || r.findings.find((f) => f.rule === 'k8s-no-limits').level === 'info', 'Job limits 降 info');
}
{
  const t = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly
spec:
  schedule: "*/5 * * * 9"
  concurrencyPolicy: Sometimes
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: job
              image: busybox:1.36
              command: ["echo", "hi"]
`;
  const r = lintText(t);
  ok(has(r, 'k8s-cron-invalid'), '星期 9 越界 error');
  ok(has(r, 'k8s-cron-concurrency'), 'concurrencyPolicy 非法 error');
  ok(!has(r, 'k8s-restart-policy-job'), 'Never 合法不报');
}
{
  const t = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  selector:
    matchLabels:
      app: web
      tier: api
  template:
    metadata:
      labels:
        app: web
        tier: "1"
    spec:
      containers:
        - name: a
          image: nginx:1.27
`;
  const r = lintText(t);
  ok(count(r, 'k8s-selector-mismatch') === 1, `selector 值不等 1 处 error（tier: api vs "1"），实际 ${count(r, 'k8s-selector-mismatch')}`);
}

/* ============ 7. 跨资源 ============ */
section('跨资源：引用/selector/端口/Ingress/StatefulSet');
{
  const t = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: api:1.0
          ports:
            - containerPort: 8080
              name: http
          envFrom:
            - configMapRef:
                name: missing-cm
      volumes:
        - name: cfg
          configMap:
            name: app-config
        - name: opt
          secret:
            secretName: optional-secret
            optional: true
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  k: v
---
apiVersion: v1
kind: Service
metadata:
  name: api-svc
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 9090
`;
  const r = lintText(t);
  const ids = ruleIds(r);
  ok(has(r, 'k8s-ref-missing'), '缺失 ConfigMap 引用 info');
  const refMsgs = r.findings.filter((f) => f.rule === 'k8s-ref-missing').map((f) => f.message);
  ok(refMsgs.some((m) => m.includes('missing-cm') && !m.includes('optional')), '报 missing-cm（非 optional）');
  ok(refMsgs.some((m) => m.includes('optional-secret') && m.includes('声明 optional')), 'optional 引用带标注');
  ok(r.findings.filter((f) => f.rule === 'k8s-ref-missing').every((f) => f.level === 'info'), '引用缺失都是 info');
  ok(has(r, 'k8s-svc-port-mismatch'), 'targetPort 9090 对不上 8080 warn');
  ok(!has(r, 'k8s-svc-no-target'), 'selector 能匹配不误报');
  void ids;
}
{
  // Service selector 完全无匹配
  const t = `apiVersion: v1
kind: Service
metadata:
  name: orphan
spec:
  selector:
    app: ghost
  ports:
    - port: 80
      targetPort: 80
`;
  const r = lintText(t);
  ok(has(r, 'k8s-svc-no-target') && r.findings.find((f) => f.rule === 'k8s-svc-no-target').level === 'warn', 'selector 无匹配 warn');
}
{
  // Pod 直接被 Service 匹配 + Ingress 引用
  const t = `apiVersion: v1
kind: Pod
metadata:
  name: tool
  labels:
    app: tool
spec:
  containers:
    - name: main
      image: tool:2.0
      ports:
        - containerPort: 9000
---
apiVersion: v1
kind: Service
metadata:
  name: tool-svc
spec:
  selector:
    app: tool
  ports:
    - port: 80
      targetPort: 9000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ing
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: tool-svc
                port:
                  number: 80
`;
  const r = lintText(t);
  ok(!has(r, 'k8s-svc-no-target'), 'Pod 也参与 selector 匹配');
  ok(!has(r, 'k8s-svc-port-mismatch'), 'targetPort 9000 命中');
  ok(!has(r, 'k8s-ingress-svc-missing') && !has(r, 'k8s-ingress-port-mismatch'), 'Ingress 闭环零发现');
  ok(!has(r, 'k8s-ingress-class'), '已声明 ingressClass');
}
{
  // Ingress 断链（缺 Service + 端口错配 + v1 结构错误）+ StatefulSet service 缺失
  const t = `apiVersion: v1
kind: Service
metadata:
  name: real-svc
spec:
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bad-ing
spec:
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: no-such-svc
                port:
                  number: 9999
          - path: /x
            pathType: Prefix
            backend:
              service:
                name: real-svc
                port:
                  number: 7000
          - path: /y
            pathType: Prefix
            backend:
              serviceName: old-style
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db-headless
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: db
          image: postgres:16.4
`;
  const r = lintText(t);
  ok(has(r, 'k8s-ingress-svc-missing'), 'Ingress Service 缺失 warn');
  ok(has(r, 'k8s-ingress-port-mismatch'), 'Ingress 端口不存在 warn');
  ok(has(r, 'k8s-ingress-backend-shape'), 'v1beta1 旧 backend 结构 error');
  ok(has(r, 'k8s-sts-service-missing'), 'StatefulSet headless 缺失 warn');
  ok(has(r, 'k8s-ingress-class'), '未声明 ingressClass info');
}

/* ============ 8. 干净夹具零误报 ============ */
section('干净夹具（生产级清单）零误报');
{
  const clean = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-api
  labels:
    app: shop-api
    version: "1.4.2"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: shop-api
  template:
    metadata:
      labels:
        app: shop-api
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: api
          image: registry.example.com/shop/api:1.4.2
          ports:
            - containerPort: 8080
              name: http
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: "1"
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: shop-db
                  key: password
          volumeMounts:
            - name: cfg
              mountPath: /etc/app
          envFrom:
            - configMapRef:
                name: shop-config
      volumes:
        - name: cfg
          configMap:
            name: shop-config
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: shop-config
data:
  LOG_LEVEL: info
---
apiVersion: v1
kind: Secret
metadata:
  name: shop-db
type: Opaque
stringData:
  password: placeholder-rotated-weekly
---
apiVersion: v1
kind: Service
metadata:
  name: shop-api
spec:
  selector:
    app: shop-api
  ports:
    - port: 80
      targetPort: 8080
`;
  const r = lintText(clean);
  ok(r.findings.length === 0, `零误报（生产级完整清单应零发现），实际：\n${r.findings.map((f) => `${f.rule}@${f.line} ${f.message}`).join('\n') || '（无）'}`);
  ok(r.score === 10, `评分 10，实际 ${r.score}`);
}
{
  // Job 全合规夹具
  const job = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "0 3 * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: backup
              image: backup:2.1
              command: ["/bin/backup"]
`;
  const r = lintText(job);
  ok(r.findings.filter((f) => f.rule !== 'k8s-plaintext-secret').length === 0 ? true : r.findings.length > 0 && r.findings.every((f) => f.level !== 'error'), 'Job 夹具无 error（探针/limits 豁免后仅剩可接受 info/warn）');
}

/* ============ 9. 多文档 / Helm / 语法错误 / 评分 ============ */
section('多文档/Helm/语法/评分/识别');
{
  const r = lintText(DEP_BAD + '---\n' + 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm\ndata: {}\n');
  ok(r.stats.docs === 2, `2 文档，实际 ${r.stats.docs}`);
  ok(r.findings.every((f) => typeof f.line === 'number' && f.line > 0), '所有发现带全文行号');
  const cmFinds = r.findings.filter((f) => f.docIndex === 1);
  ok(cmFinds.every((f) => f.line >= 44), `第二文档行号 ≥44，实际 ${cmFinds.map((f) => f.line)}`);
}
{
  const r = lintText('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Values.name }}\nspec:\n  replicas: {{ .Values.replicas }}\n');
  ok(r.stats.helmDocs === 1 && r.findings.length === 0, 'Helm 模板文档跳过');
}
{
  const r = lintText('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: bad\n\tdata: oops\n');
  ok(has(r, 'k8s-yaml-syntax'), 'YAML 语法错误归一报告');
  const f = r.findings.find((x) => x.rule === 'k8s-yaml-syntax');
  ok(f.line >= 4, `语法错误行号 ≥4，实际 ${f && f.line}`);
}
{
  const r = lintText(DEP_BAD);
  const expect = 10 - r.stats.error * 2 - r.stats.warn * 0.7 - r.stats.info * 0.2;
  ok(r.score === Math.max(0, Math.round(expect * 10) / 10), `评分公式一致，实际 ${r.score}`);
  ok(core.gradeOf(9.5) === '优' && core.gradeOf(7) === '良' && core.gradeOf(5) === '中' && core.gradeOf(2) === '需整改', '评级四档');
}
{
  ok(core.detectKind('apiVersion: v1\nkind: Pod\n') === 'k8s', '识别 k8s');
  ok(core.detectKind('FROM node\nRUN echo hi') === 'unknown', 'Dockerfile 不误判');
  ok(core.detectKind('') === '', '空文本');
}
{
  const report = core.renderReport(lintText(DEP_BAD));
  ok(report.includes('文档 1') && report.includes('error') && report.includes('`k8s-privileged`'), 'renderReport 含文档/行/规则');
  ok(core.ruleCatalog().includes(`共 ${core.RULE_COUNT} 条`), '规则目录完整');
  ok(core.explainRule('k8s-privileged').includes('安全红线'), 'explainRule 命中');
  ok(core.explainRule('no-such-rule') === null, 'explainRule 未知 id null');
}
{
  // List kind 不炸；空文档；纯标量
  const r = lintText('just a scalar\n');
  ok(has(r, 'k8s-not-object'), '纯标量报 not-object');
}

console.log(`\n========== 离线单测：${pass} 通过 / ${fail} 失败（${group} 组） ==========`);
if (fail > 0) { console.error(failures.map((m) => `FAIL: ${m}`).join('\n')); process.exit(1); }
