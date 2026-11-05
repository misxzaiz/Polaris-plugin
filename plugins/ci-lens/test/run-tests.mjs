/**
 * CI 体检台 core 离线测试（node --test test/run-tests.mjs）
 *
 * 覆盖：Dockerfile 19 条规则逐条触发 + 行号（含续行/heredoc 状态机）+
 * 工作流 26 条规则逐条触发 + 干净夹具零误报 + YAML 语法错误优雅降级 +
 * cron 校验 + 自动识别 + 评分单调性。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load as yamlLoad, DEFAULT_SCHEMA } from 'js-yaml'
import * as core from '../shared/ci-core.js'

function parseYaml(t) { return yamlLoad(t, { schema: DEFAULT_SCHEMA }) }
function lintWf(text) { return core.lint(text, 'workflow', { parseYaml }) }
function lintDf(text) { return core.lint(text, 'dockerfile') }
function rules(r) { return r.findings.map((f) => f.rule) }

/* ============================ Dockerfile 引擎 ============================ */

test('from_unpinned：无 tag / latest 报 warn；明确 tag / digest / scratch 不报', () => {
  const a = lintDf('FROM node\nRUN true\n')
  assert.ok(a.findings.some((f) => f.rule === 'from_unpinned' && f.level === 'warn' && f.line === 1))
  const b = lintDf('FROM node:latest\nRUN true\n')
  assert.ok(b.findings.some((f) => f.rule === 'from_unpinned' && f.line === 1))
  const c = lintDf('FROM node:20-alpine\nRUN true\n')
  assert.ok(!c.findings.some((f) => f.rule === 'from_unpinned'))
  const d = lintDf('FROM node@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nRUN true\n')
  assert.ok(!d.findings.some((f) => f.rule === 'from_unpinned'))
  const e = lintDf('FROM scratch\nCOPY x /x\n')
  assert.ok(!e.findings.some((f) => f.rule === 'from_unpinned'))
})

test('from_unpinned：--platform 旗标不干扰识别', () => {
  const r = lintDf('FROM --platform=$BUILDPLATFORM node AS build\nRUN true\n')
  assert.ok(r.findings.some((f) => f.rule === 'from_unpinned' && f.message.includes('node')))
})

test('apt 三规则：缺 --no-install-recommends / 缓存未清理 / upgrade', () => {
  const r = lintDf('FROM ubuntu:22.04\nRUN apt-get update && apt-get install -y git\n')
  assert.ok(rules(r).includes('apt_no_recommends'))
  assert.ok(rules(r).includes('apt_no_cache_cleanup'))
  const u = lintDf('FROM ubuntu:22.04\nRUN apt-get upgrade -y\n')
  assert.ok(rules(u).includes('apt_get_upgrade'))
})

test('apt 规则不误报：推荐写法全过', () => {
  const r = lintDf('FROM ubuntu:22.04\nRUN apt-get update && apt-get install -y --no-install-recommends git=1:2.34.1-1 && rm -rf /var/lib/apt/lists/*\n')
  assert.ok(!rules(r).includes('apt_no_recommends'))
  assert.ok(!rules(r).includes('apt_no_cache_cleanup'))
  assert.ok(!rules(r).includes('apt_version_unpinned'))
  assert.ok(!rules(r).includes('apt_get_upgrade'))
})

test('apt_version_unpinned：装包无 = 版本报 info', () => {
  const r = lintDf('FROM debian:12\nRUN apt-get update && apt-get install -y --no-install-recommends git curl && rm -rf /var/lib/apt/lists/*\n')
  assert.ok(rules(r).includes('apt_version_unpinned'))
})

test('apk_no_cache：apk add 无 --no-cache 报 warn；带 --no-cache 不报', () => {
  const a = lintDf('FROM alpine:3.19\nRUN apk add curl\n')
  const f = a.findings.find((x) => x.rule === 'apk_no_cache')
  assert.ok(f && f.level === 'warn' && f.line === 2)
  const b = lintDf('FROM alpine:3.19\nRUN apk add --no-cache curl\n')
  assert.ok(!rules(b).includes('apk_no_cache'))
})

test('sudo_used：检测真使用；apt-get install sudo 不误报', () => {
  const a = lintDf('FROM ubuntu:22.04\nRUN sudo make install\n')
  assert.ok(rules(a).includes('sudo_used'))
  const b = lintDf('FROM ubuntu:22.04\nRUN apt-get update && apt-get install -y --no-install-recommends sudo && rm -rf /var/lib/apt/lists/*\n')
  assert.ok(!rules(b).includes('sudo_used'))
})

test('curl_pipe_sh：curl|sh 与 wget|bash 检出', () => {
  const a = lintDf('FROM alpine:3.19\nRUN curl -fsSL https://x.sh | sh\n')
  assert.ok(rules(a).includes('curl_pipe_sh'))
  const b = lintDf('FROM debian:12\nRUN wget -qO- https://x.sh | bash\n')
  assert.ok(rules(b).includes('curl_pipe_sh'))
})

test('add_remote_url / add_instead_of_copy：远程 URL 报 warn；本地 tar 豁免（自动解包合法）；普通文件建议 COPY', () => {
  const a = lintDf('FROM alpine:3.19\nADD https://example.com/f.tar.gz /tmp/\n')
  assert.ok(rules(a).includes('add_remote_url') && !rules(a).includes('add_instead_of_copy'))
  const b = lintDf('FROM alpine:3.19\nADD ./payload.tar.gz /opt/\n')
  assert.ok(!rules(b).includes('add_instead_of_copy') && !rules(b).includes('add_remote_url'))
  const c = lintDf('FROM alpine:3.19\nADD ./script.sh /opt/\n')
  assert.ok(rules(c).includes('add_instead_of_copy'))
  const d = lintDf('FROM alpine:3.19\nCOPY ./app /app\n')
  assert.ok(!rules(d).includes('add_instead_of_copy'))
})

test('copy_broad_dot：COPY . . 报 info；COPY --from=/app . 不误报', () => {
  const a = lintDf('FROM node:20-alpine\nCOPY . .\n')
  assert.ok(rules(a).includes('copy_broad_dot'))
  const b = lintDf('FROM golang:1.22 AS build\nCOPY src /src\nFROM alpine:3.19\nCOPY --from=build /src/bin /usr/local/bin/\n')
  assert.ok(!rules(b).includes('copy_broad_dot'))
})

test('multiple_cmd / multiple_entrypoint：同阶段多条报 error，跨阶段合法', () => {
  const a = lintDf('FROM node:20\nCMD ["a"]\nCMD ["b"]\n')
  assert.ok(rules(a).includes('multiple_cmd') && a.findings.find((f) => f.rule === 'multiple_cmd').level === 'error')
  const b = lintDf('FROM node:20 AS build\nCMD ["x"]\nFROM node:20\nCMD ["y"]\n')
  assert.ok(!rules(b).includes('multiple_cmd'))
  const c = lintDf('FROM node:20\nENTRYPOINT ["a"]\nENTRYPOINT ["b"]\n')
  assert.ok(rules(c).includes('multiple_entrypoint'))
})

test('maintainer_deprecated / env_legacy_space / workdir_relative', () => {
  const r = lintDf('FROM alpine:3.19\nMAINTAINER bob\nENV APP_HOME /srv/app\nWORKDIR app\nRUN true\n')
  const rs = rules(r)
  assert.ok(rs.includes('maintainer_deprecated'))
  assert.ok(rs.includes('env_legacy_space'))
  assert.ok(rs.includes('workdir_relative'))
  const ok1 = lintDf('FROM alpine:3.19\nENV APP_HOME=/srv/app\nWORKDIR /srv/app\n')
  assert.ok(!rules(ok1).includes('env_legacy_space') && !rules(ok1).includes('workdir_relative'))
})

test('workdir_relative：阶段内已有绝对 WORKDIR 后，相对路径不报', () => {
  const r = lintDf('FROM node:20\nWORKDIR /app\nWORKDIR sub\nRUN true\n')
  assert.ok(!rules(r).includes('workdir_relative'))
})

test('no_user / json_form_prefer / no_healthcheck / run_cd', () => {
  const r = lintDf('FROM node:20\nRUN cd /tmp && make\nEXPOSE 3000\nCMD echo hi\n')
  const rs = rules(r)
  assert.ok(rs.includes('no_user') && rs.includes('json_form_prefer') && rs.includes('no_healthcheck') && rs.includes('run_cd'))
  const ok1 = lintDf('FROM node:20\nUSER node\nCMD ["node", "server.js"]\n')
  assert.ok(!rules(ok1).includes('no_user') && !rules(ok1).includes('json_form_prefer'))
  const ok2 = lintDf('FROM node:20\nUSER node\n')
  assert.ok(!rules(ok2).includes('no_healthcheck'))
})

test('续行合并：多行 RUN 的规则发现落在起始行', () => {
  const r = lintDf('FROM ubuntu:22.04\nRUN apt-get update \\\n  && apt-get install -y git \\\n  && echo done\n')
  const f = r.findings.find((x) => x.rule === 'apt_no_recommends')
  assert.ok(f && f.line === 2, JSON.stringify(r.findings))
})

test('heredoc 状态机：RUN<<EOF 体内 shell 内容不触发规则', () => {
  const df = 'FROM ubuntu:22.04\nRUN <<EOF\napt-get install -y git\nsudo x\nEOF\nRUN apt-get install -y curl\n'
  const r = lintDf(df)
  // heredoc 体内（行 3-4）不报；行 6 的真 RUN 报
  const apt = r.findings.filter((f) => f.rule === 'apt_no_recommends')
  assert.equal(apt.length, 1)
  assert.equal(apt[0].line, 6)
  assert.ok(!rules(r).includes('sudo_used'))
})

test('引号内伪 heredoc 标记不进入 heredoc 状态（同条 RUN 的真规则照常检出）', () => {
  const df = "FROM alpine:3.19\nRUN echo '<<EOF' && apk add --no-cache curl\nRUN apk add wget\n"
  const r = lintDf(df)
  assert.ok(!rules(r).includes('apk_no_cache') || r.findings.some((f) => f.rule === 'apk_no_cache' && f.line === 3), JSON.stringify(r.findings))
  assert.ok(rules(r).includes('apk_no_cache'), '行 3 的 apk add wget 应检出；引号内伪标记不应吞掉任何指令')
})

test('干净 Dockerfile 夹具：零发现', () => {
  const df = [
    'FROM node:20-alpine',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN apk add --no-cache curl',
    'RUN npm ci --omit=dev',
    'COPY src ./src',
    'USER node',
    'EXPOSE 3000',
    'HEALTHCHECK --interval=30s CMD curl -fsS http://localhost:3000/health || exit 1',
    'CMD ["node", "server.js"]',
    '',
  ].join('\n')
  const r = lintDf(df)
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings))
  assert.equal(r.score, 10)
})

test('规则目录：Dockerfile 20 条且 id 唯一', () => {
  const ids = core.DOCKER_RULES.map((x) => x.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(core.DOCKER_RULES.length, 20)
})

/* ============================ GitHub Actions 引擎 ============================ */

test('wf_yaml_syntax：YAML 语法错误优雅报告（不崩溃）', () => {
  const bad = 'name: CI\non: push\njobs:\n  build:\n    runs-on: [ubuntu-latest\n'
  const r = lintWf(bad)
  assert.ok(rules(r).includes('wf_yaml_syntax'))
  assert.equal(r.stats.error, 1)
})

test('wf_unknown_top_key：job: 拼写错误检出（未静默吞掉）', () => {
  const wf = 'on: push\njob:\n  build:\n    runs-on: ubuntu-latest\n'
  const r = lintWf(wf)
  assert.ok(rules(r).includes('wf_unknown_top_key'))
})

test('wf_unknown_event：pul_request 检出', () => {
  const wf = 'on:\n  pul_request:\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'
  const r = lintWf(wf)
  assert.ok(r.findings.some((f) => f.rule === 'wf_unknown_event' && f.message.includes('pul_request')))
  assert.ok(!r.findings.some((f) => f.rule === 'wf_unknown_event' && f.message.includes('push')))
})

test('wf_cron_invalid：段数/范围/@简写 检出', () => {
  const wf3 = 'on:\n  schedule:\n    - cron: "* * * "\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'
  assert.ok(rules(lintWf(wf3)).includes('wf_cron_invalid'))
  const wfAt = wf3.replace('"* * * "', '"@daily"')
  assert.ok(rules(lintWf(wfAt)).includes('wf_cron_invalid'))
  const wfRange = wf3.replace('"* * * "', '"0 30 * * *"')
  assert.ok(rules(lintWf(wfRange)).includes('wf_cron_invalid'))
})

test('wf_input_type / wf_choice_no_options', () => {
  const wf = 'on:\n  workflow_dispatch:\n    inputs:\n      env:\n        type: str\n      mode:\n        type: choice\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'
  const rs = rules(lintWf(wf))
  assert.ok(rs.includes('wf_input_type') && rs.includes('wf_choice_no_options'))
})

test('wf_permissions_value：坏 scope / 坏值 / 坏顶层值', () => {
  const wf = 'on: push\npermissions:\n  contents: reed\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'
  assert.ok(rules(lintWf(wf)).includes('wf_permissions_value'))
  const wfTop = wf.replace('permissions:\n  contents: reed', 'permissions: read')
  assert.ok(rules(lintWf(wfTop)).includes('wf_permissions_value'))
})

test('wf_no_jobs：缺 jobs 报 error', () => {
  const r = lintWf('on: push\n')
  assert.ok(rules(r).includes('wf_no_jobs') && r.findings.find((f) => f.rule === 'wf_no_jobs').level === 'error')
})

test('wf_missing_runs_on / wf_missing_steps / wf_no_timeout', () => {
  const wf = 'on: push\njobs:\n  a:\n    steps:\n      - run: echo hi\n'
  const rs = rules(lintWf(wf))
  assert.ok(rs.includes('wf_missing_runs_on'))
  assert.ok(rs.includes('wf_no_timeout'))
  const noSteps = 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n'
  assert.ok(rules(lintWf(noSteps)).includes('wf_missing_steps'))
})

test('wf_runner_label：ubunty-latest 疑似 ubuntu-latest；ubuntu-22 版本格式；自定义标签不误报', () => {
  const base = 'on: push\njobs:\n  a:\n    runs-on: LB\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n'
  const r1 = lintWf(base.replace('LB', 'ubunty-latest'))
  const f1 = r1.findings.find((f) => f.rule === 'wf_runner_label')
  assert.ok(f1 && f1.message.includes('ubuntu-latest'))
  const r2 = lintWf(base.replace('LB', 'ubuntu-22'))
  assert.ok(r2.findings.some((f) => f.rule === 'wf_runner_label'))
  const r3 = lintWf(base.replace('LB', 'self-hosted-gpu'))
  assert.ok(!r3.findings.some((f) => f.rule === 'wf_runner_label'))
})

test('wf_needs_unknown / 自引用 / wf_needs_cycle', () => {
  const unk = 'on: push\njobs:\n  a:\n    needs: ghost\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'
  assert.ok(rules(lintWf(unk)).includes('wf_needs_unknown'))
  const self = 'on: push\njobs:\n  a:\n    needs: a\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n'
  assert.ok(rules(lintWf(self)).includes('wf_needs_unknown'))
  const cyc = 'on: push\njobs:\n  a:\n    needs: [c]\n    runs-on: ubuntu-latest\n    steps: [{run: "x"}]\n  b:\n    needs: [a]\n    runs-on: ubuntu-latest\n    steps: [{run: "x"}]\n  c:\n    needs: [b]\n    runs-on: ubuntu-latest\n    steps: [{run: "x"}]\n'
  const r = lintWf(cyc)
  const f = r.findings.find((x) => x.rule === 'wf_needs_cycle')
  assert.ok(f, JSON.stringify(r.findings))
  assert.ok(f.message.includes('a →'))
})

test('wf_uses_malformed / wf_uses_unpinned：SHA 锚定不报', () => {
  const wf = 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout\n      - uses: actions/setup-node@v4\n      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3\n'
  const r = lintWf(wf)
  assert.ok(rules(r).includes('wf_uses_malformed'))
  const pin = r.findings.filter((f) => f.rule === 'wf_uses_unpinned')
  assert.equal(pin.length, 1)
  assert.ok(pin[0].message.includes('setup-node'))
})

test('wf_expr_unclosed：${{ 未闭合行级定位', () => {
  const wf = 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo ${{ github.ref\n'
  const r = lintWf(wf)
  const f = r.findings.find((x) => x.rule === 'wf_expr_unclosed')
  assert.ok(f && f.line === 7, JSON.stringify(r.findings))
})

test('wf_secrets_case：小写 github_token 必错', () => {
  const wf = 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: curl -H "Authorization: Bearer ${{ secrets.github_token }}" https://x\n'
  const r = lintWf(wf)
  const f = r.findings.find((x) => x.rule === 'wf_secrets_case')
  assert.ok(f && f.level === 'error' && f.line === 7)
})

test('wf_step_ref_unknown / wf_output_step_missing / wf_needs_output_unknown / wf_needs_ref_unknown', () => {
  const wf = [
    'on: push',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 5',
    '    steps:',
    '      - run: echo hi',
    '  use:',
    '    needs: build',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 5',
    '    outputs:',
    '      ver: ${{ steps.idontexist.outputs.v }}',
    '    steps:',
    '      - run: echo ${{ needs.build.outputs.nope }} ${{ steps.alsoMissing.outputs.y }} ${{ needs.ghostjob.outputs.z }}',
    '',
  ].join('\n')
  const rs = rules(lintWf(wf))
  assert.ok(rs.includes('wf_step_ref_unknown') && rs.includes('wf_output_step_missing'))
  assert.ok(rs.includes('wf_needs_output_unknown') && rs.includes('wf_needs_ref_unknown'))
})

test('pull_request_target 危险组合：error 落在 head 引用行；单独使用报 warn', () => {
  const danger = [
    'on: pull_request_target',
    'jobs:',
    '  review:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 5',
    '    steps:',
    '      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3',
    '        with:',
    '          ref: ${{ github.event.pull_request.head.sha }}',
    '',
  ].join('\n')
  const r = lintWf(danger)
  const f = r.findings.find((x) => x.rule === 'wf_pr_target_untrusted')
  assert.ok(f && f.level === 'error' && f.line === 9, JSON.stringify(r.findings))
  assert.ok(!r.findings.some((x) => x.rule === 'wf_uses_unpinned'), 'SHA 锚定不应报')
  const alone = 'on: pull_request_target\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n'
  const r2 = lintWf(alone)
  assert.ok(rules(r2).includes('wf_pr_target') && !rules(r2).includes('wf_pr_target_untrusted'))
})

test('wf_redundant_if：success() 冗余条件报 info', () => {
  const wf = 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n        if: ${{ success() }}\n'
  assert.ok(rules(lintWf(wf)).includes('wf_redundant_if'))
})

test('wf_job_id_format：含空格 job id 报 warn', () => {
  const wf = 'on: push\njobs:\n  "my job":\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo hi\n'
  assert.ok(rules(lintWf(wf)).includes('wf_job_id_format'))
})

test('干净工作流夹具：零发现', () => {
  const wf = [
    'name: CI',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 15',
    '    steps:',
    '      - uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3',
    '      - run: npm run build',
    '',
    '  test:',
    '    needs: build',
    '    runs-on: ubuntu-latest',
    '    timeout-minutes: 10',
    '    outputs:',
    '      ok: ${{ steps.report.outputs.done }}',
    '    steps:',
    '      - id: report',
    '        run: echo "done=1" >> "$GITHUB_OUTPUT"',
    '',
  ].join('\n')
  const r = lintWf(wf)
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings))
  assert.equal(r.score, 10)
})

test('规则目录：工作流 26 条且 id 唯一；目录渲染含修复建议', () => {
  const ids = core.WORKFLOW_RULES.map((x) => x.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(core.WORKFLOW_RULES.length, 26)
  const cat = core.ruleCatalog('all')
  assert.ok(cat.includes('from_unpinned') && cat.includes('wf_needs_cycle'))
  assert.ok(core.ruleCatalog('workflow').includes('—— 外部 action 用完整 40 位 SHA 锚定'), '规则行应带修复建议文本')
})

/* ============================ cron 校验器 ============================ */

test('validateCron：合法 5 段通过；名称与 7=周日；边界拒绝', () => {
  assert.equal(core.validateCron('*/15 * * * *').ok, true)
  assert.equal(core.validateCron('30 2 1,15 JAN-MAR SUN').ok, true)
  assert.equal(core.validateCron('0 9 * * 7').ok, true)
  assert.equal(core.validateCron('* * * *').ok, false, '4 段拒绝')
  assert.equal(core.validateCron('*/99 * * * *').ok, true, '大步长合法（vixie：匹配区间起点）')
  assert.equal(core.validateCron('0 0 32 * *').ok, false, '日 32 越界')
  assert.equal(core.validateCron('0 25 * * *').ok, false, '小时 25 越界')
  assert.equal(core.validateCron('@daily').ok, false, '@ 简写不支持')
  assert.equal(core.validateCron('5-2 * * * *').ok, false, '范围起点大于终点')
})

/* ============================ 自动识别 / 评分 / 报告 ============================ */

test('detectKind：两类配置正确识别；无法识别返回 unknown', () => {
  assert.equal(core.detectKind('FROM node:20\nRUN x\n'), 'dockerfile')
  assert.equal(core.detectKind('on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n'), 'workflow')
  assert.equal(core.detectKind('随便一段文本'), 'unknown')
})

test('lint(kind=auto)：自动识别分流到对应引擎', () => {
  assert.equal(core.lint('FROM node:20\n', 'auto', { parseYaml }).kind, 'dockerfile')
  assert.equal(core.lint('on: push\njobs: {}\n', 'auto', { parseYaml }).kind, 'workflow')
  assert.equal(core.lint('???', 'auto', { parseYaml }), null)
})

test('评分单调性与下限：error 越多分越低；大量错误地板 0', () => {
  const a = lintDf('FROM node:20\nCMD ["a"]\nCMD ["b"]\n')
  const b = lintDf('FROM node:20\nCMD ["a"]\nCMD ["b"]\nCMD ["c"]\nCMD ["d"]\nCMD ["e"]\nCMD ["f"]\n')
  assert.ok(a.score > b.score)
  assert.equal(b.score, 0)
  assert.equal(core.gradeOf(10), '优')
  assert.equal(core.gradeOf(4.9), '需整改')
})

test('renderReport：含评分/分组/修复建议；零发现输出 ✅', () => {
  const bad = lintDf('FROM node:latest\nCMD ["x"]\nCMD ["y"]\n')
  const md = core.renderReport(bad)
  assert.ok(md.includes('评分') && md.includes('error') && md.includes('修复：') && md.includes('行 1'))
  const clean = lintDf('FROM node:20\nUSER node\n')
  assert.ok(core.renderReport(clean).includes('✅'))
})

test('lintWorkflow：无解析器时如实降级（不假报）', () => {
  const r = core.lint('on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n', 'workflow', {})
  assert.ok(r.findings.some((f) => f.rule === 'wf_yaml_syntax'))
})
