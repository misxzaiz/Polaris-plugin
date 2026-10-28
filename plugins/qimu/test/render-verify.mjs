/**
 * 启幕产物级验收（node test/render-verify.mjs）
 * 真实渲染含全部 7 类版式、5 主题的 deck，然后交给 python（zipfile 完整性 +
 * python-pptx 结构断言）验证产物是 PowerPoint 兼容、真实可编辑的 PPTX。
 * 这是"文件级交付"产品的核心验收——不是页面能打开，而是产物本身合格。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = require(path.join(APP_ROOT, 'shared', 'core.js'));
const { renderDeck } = require(path.join(APP_ROOT, 'mcp', 'render.js'));

const fullDeck = {
  title: '启幕产物级验收：全版式演示',
  subtitle: '七类版式 · 全主题 · 本地直生 OOXML',
  author: '启幕验证脚本',
  theme: 'midnight',
  slides: [
    { type: 'section', title: '业务回顾', note: '2026 Q3' },
    { type: 'bullets', title: '核心成果一览', bullets: ['收入同比增长 32%', { h: '新客户拓展', d: '新签 120 家，其中 KA 18 家，续约率 91%' }, { h: '产品交付', d: '三个大版本按期发布，线上故障率下降 45%' }] },
    { type: 'two', title: '上半年 vs 下半年', left: { h: '上半年：稳', points: ['基本盘稳固', '现金流为正', '团队扩编 20%'] }, right: { h: '下半年：进', points: ['新产品线上市', '渠道下沉', '海外试点'] } },
    { type: 'chart', title: '月度收入与利润（万元）', note: '数据为示例', chart: { kind: 'bar', labels: ['7月', '8月', '9月', '10月'], series: [{ name: '收入', values: [420, 468, 512, 601] }, { name: '利润', values: [88, 102, 118, 141] }] } },
    { type: 'chart', title: '收入结构', chart: { kind: 'pie', labels: ['订阅', '项目制', '其他'], series: [{ name: '占比', values: [62, 30, 8] }] } },
    { type: 'chart', title: '客户增长趋势', chart: { kind: 'line', labels: ['W1', 'W2', 'W3', 'W4'], series: [{ name: '活跃客户', values: [310, 328, 351, 384] }] } },
    { type: 'table', title: '分区经营数据', head: ['区域', '收入(万)', '同比', '目标达成'], rows: [['华东', '1,842', '+31%', '108%'], ['华北', '1,105', '+22%', '96%'], ['华南', '986', '+40%', '112%'], ['西部', '503', '+18%', '88%']] },
    { type: 'quote', text: '质量是最好的增长策略——省下的返工时间，就是最大的利润空间。', author: 'Q3 复盘共识' },
    { type: 'end', note: '谢谢观看 · 欢迎交流' },
  ],
};

const PY_ASSERT = `
import json, sys, zipfile
from pptx import Presentation
from pptx.util import Emu

path, expect = sys.argv[1], json.loads(sys.argv[2])
fail = []

# 1) zip 完整性（OOXML = zip 容器）
z = zipfile.ZipFile(path)
if z.testzip() is not None:
    fail.append('zip 损坏')
names = z.namelist()
for need in ['[Content_Types].xml', 'ppt/presentation.xml']:
    if need not in names:
        fail.append(f'缺 {need}')

# 2) python-pptx 打开 = PowerPoint 兼容
p = Presentation(path)
if len(p.slides) != expect['slideCount']:
    fail.append(f"页数 {len(p.slides)} != {expect['slideCount']}")

# 3) 画布 16:9（13.333x7.5 英寸）
w_in = p.slide_width / 914400
h_in = p.slide_height / 914400
if abs(w_in - 13.333) > 0.01 or abs(h_in - 7.5) > 0.01:
    fail.append(f'画布 {w_in}x{h_in} 不是 16:9')

# 4) 逐页结构断言（按 expectations[kind] 计数关键形状）
kinds = [s['kind'] for s in expect['pages']]
for i, slide in enumerate(p.slides):
    kind = kinds[i]
    texts = [sh.text_frame.text for sh in slide.shapes if sh.has_text_frame]
    charts = [sh.chart for sh in slide.shapes if sh.has_chart]
    tables = [sh for sh in slide.shapes if sh.has_table]
    if kind == 'cover' and not any(expect['title'] in t for t in texts):
        fail.append(f'p{i} 封面缺标题')
    if kind == 'chart':
        if len(charts) != 1:
            fail.append(f'p{i} 应有 1 个图表，实际 {len(charts)}')
        else:
            plot = charts[0].plots[0]
            cats = [str(c) for c in plot.categories]
            if len(cats) != expect['pages'][i].get('labels', len(cats)):
                fail.append(f'p{i} 图表类别数不符: {cats}')
            for j, ser in enumerate(plot.series):
                if len(list(ser.values)) != expect['pages'][i].get('values', len(list(ser.values))):
                    fail.append(f'p{i} 系列{j} 值数量不符')
    if kind == 'table':
        if len(tables) != 1:
            fail.append(f'p{i} 应有 1 个表格，实际 {len(tables)}')
        else:
            tbl = tables[0].table
            if len(tbl.columns) != expect['pages'][i]['cols']:
                fail.append(f'p{i} 表格列数不符')
            if len(tbl.rows) != expect['pages'][i]['rows'] + 1:
                fail.append(f'p{i} 表格行数不符（含表头）')
            if tbl.cell(0, 0).text != expect['pages'][i]['head0']:
                fail.append(f'p{i} 表头首格不符: {tbl.cell(0,0).text}')
    if kind == 'bullets':
        joined = ' '.join(texts)
        for needle in expect['pages'][i]['texts']:
            if needle not in joined:
                fail.append(f'p{i} 缺文本「{needle}」')
    if kind == 'quote' and not any(expect['pages'][i]['needle'] in t for t in texts):
        fail.append(f'p{i} 引言缺文本')

print(json.dumps({'ok': not fail, 'fail': fail}))
sys.exit(1 if fail else 0)
`;

function runPython(script, args) {
  return new Promise((resolve) => {
    const p = spawn('python', ['-c', script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let errOut = '';
    p.stdout.on('data', (c) => { out += c; });
    p.stderr.on('data', (c) => { errOut += c; });
    p.on('close', (code) => resolve({ code, out, errOut }));
    p.on('error', (e) => resolve({ code: 1, out, errOut: String(e) }));
  });
}

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}${extra ? ` — ${String(extra).slice(0, 400)}` : ''}`); }
};

// 每主题渲染同构 deck（首主题含全版式，其余验证主题 token 全覆盖）
const themes = core.THEME_KEYS;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qimu-verify-'));

for (const theme of themes) {
  const spec = { ...fullDeck, theme };
  const r = core.normalizeDeck(spec);
  check(`[${theme}] normalizeDeck`, !r.error, r.error);
  const buf = await renderDeck(r.deck, { outputType: 'nodebuffer' });
  const file = path.join(tmp, `qimu-${theme}.pptx`);
  fs.writeFileSync(file, buf);
  check(`[${theme}] 渲染落盘 ${Math.round(buf.length / 1024)}KB`, buf.length > 20000);

  const expect = {
    slideCount: r.deck.slides.length,
    title: r.deck.title,
    pages: r.deck.slides.map((s, i) => {
      if (s.type === 'chart') return { kind: 'chart', labels: s.chart.labels.length, values: s.chart.series[0].values.length };
      if (s.type === 'table') return { kind: 'table', cols: s.head.length, rows: s.rows.length, head0: s.head[0] };
      if (s.type === 'bullets') return { kind: 'bullets', texts: ['收入同比增长 32%', '新客户拓展', '产品交付'] };
      if (s.type === 'quote') return { kind: 'quote', needle: '质量是最好的增长策略' };
      return { kind: s.type };
    }),
  };
  const res = await runPython(PY_ASSERT, [file, JSON.stringify(expect)]);
  let verdict = { ok: false, fail: [`python 执行失败: ${res.errOut.slice(0, 200)}`] };
  try { verdict = JSON.parse(res.out); } catch (_) { /* 保留默认 */ }
  check(`[${theme}] python-pptx 结构断言（页数/画布/图表/表格/文本）`, verdict.ok, verdict.fail.join('；'));
}

// 超限 spec 必须被拦（不产文件）
const over = core.normalizeDeck({ title: 'x', slides: [{ type: 'bullets', title: 't', bullets: Array.from({ length: 9 }, (_, i) => `点${i}`) }] });
check('容量护栏拦截超限 spec', !!over.error && over.error.includes('拆'));

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n✗ ${failed} 项失败`); process.exit(1); }
console.log('\n✓ 产物级验收全绿（5 主题 × python-pptx 结构断言）');
