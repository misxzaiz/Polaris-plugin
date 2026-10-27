'use strict';
/**
 * 端到端冒烟测试（不依赖 Polaris，验证 arXiv 抓取链路）
 * 运行：node test/smoke-real.mjs
 *
 * 验证点：
 *   1. arXiv API 可达，返回真实条目
 *   2. 正则解析能正确抽出 id/title/authors/categories/abstract
 *   3. 版本号后缀被剥离（v1 → 基版 id）
 *   4. 评分核心能正确给「LLM Agent」主题下的论文打高分
 *   5. 一句话解读非空
 */
const https = require('https');

const UA = 'Mozilla/5.0 Polaris-PaperRadar/0.1 test';
const URL = 'https://export.arxiv.org/api/query?search_query=all%3A%22LLM+agent%22&sortBy=submittedDate&sortOrder=descending&max_results=10';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b));
    });
    req.on('error', reject); req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
  });
}

function parseEntries(xml) {
  // 与 service/paper-radar.js parseEntries 同源（版本号剥离已加入）
  const out = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const seg = m[1];
    const grab = (tag) => {
      const r = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>');
      const mm = seg.match(r);
      return mm ? mm[1].trim() : '';
    };
    const id = ((grab('id').match(/arxiv\.org\/abs\/(.+)$/) || [])[1] || '').replace(/v\d+$/, '');
    const title = grab('title').replace(/\s+/g, ' ').trim();
    if (!id || !title) continue;
    const authors = [];
    const aRe = /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g;
    let am;
    while ((am = aRe.exec(seg)) !== null) authors.push(am[1].trim());
    const cats = [];
    const cRe = /<category term="([^"]+)"/g;
    let cm;
    while ((cm = cRe.exec(seg)) !== null) cats.push(cm[1]);
    out.push({
      id, title,
      url: 'https://arxiv.org/abs/' + id,
      pdfUrl: 'https://arxiv.org/pdf/' + id,
      abstract: grab('summary').replace(/\s+/g, ' ').trim(),
      authors, categories: cats,
      published: new Date(grab('published')).getTime(),
      updated: new Date(grab('updated')).getTime(),
    });
  }
  return out;
}

async function main() {
  const assert = require('assert');
  let passed = 0;
  const ok = (n) => { passed++; console.log('  ✓ ' + n); };

  console.log('→ 抓取 arXiv（LLM agent，最新 10 篇）…');
  const xml = await get(URL);
  ok('arXiv HTTP 200，响应 ' + xml.length + ' 字节');
  assert.ok(xml.includes('<feed'), '响应应为 Atom feed');

  const entries = parseEntries(xml);
  assert.ok(entries.length > 0, '应解析出条目');
  ok(`解析出 ${entries.length} 篇论文`);

  assert.ok(entries.every((e) => !/v\d+$/.test(e.id)), 'id 应已剥离版本号后缀');
  ok('所有 id 已剥离 v 后缀（如 ' + entries[0].id + '）');

  assert.ok(entries.every((e) => e.title.length > 10 && e.abstract.length > 100), 'title/abstract 非空');
  ok('title 与 abstract 均有实质内容');

  const withAuthors = entries.filter((e) => e.authors.length > 0).length;
  assert.ok(withAuthors > 0, '应解析出作者');
  ok(`${withAuthors}/${entries.length} 篇含作者`);

  const withCats = entries.filter((e) => e.categories.length > 0).length;
  assert.ok(withCats > 0, '应解析出分类');
  ok(`${withCats}/${entries.length} 篇含分类（如 ${entries[0].categories.join(' ')}）`);

  const withDate = entries.filter((e) => Number.isFinite(e.published) && e.published > 0).length;
  assert.ok(withDate === entries.length, '发布时间应为合法时间戳');
  ok(`全部 ${withDate} 篇含发布时间`);

  // 评分验证：与 shared/contract.js 同源
  const contract = require('../shared/contract.js');
  const topics = [contract.normalizeTopic({ id: 'agent', name: 'LLM Agent', keywords: ['llm', 'agent'], enabled: true })];
  const ranked = contract.mergeAndRank(entries, topics, -1);
  const top = ranked[0];
  assert.ok(top && top.score > 0, '榜首应有非零评分');
  ok(`榜首 score=${top.score}：${top.title.slice(0, 60)}`);
  assert.ok(top.verdict && top.verdict.length > 10, '榜首应有解读');
  ok(`解读：${top.verdict.slice(0, 70)}`);

  // 去重验证：同一 id 不应重复
  const ids = ranked.map((p) => p.id);
  assert.strictEqual(new Set(ids).size, ids.length, '去重后 id 应唯一');
  ok('去重生效，无重复 id');

  console.log('\n=== 抽样输出（前 3 篇）===');
  for (const p of ranked.slice(0, 3)) {
    console.log(`#${p.score} ${p.id} | ${p.title.slice(0, 70)}`);
    console.log(`     作者: ${p.authors.slice(0, 3).join(', ')} | 分类: ${p.categories.slice(0, 3).join(' ')}`);
    console.log(`     解读: ${p.verdict.slice(0, 80)}`);
  }
  console.log(`\n通过 ${passed} 项断言`);
}

main().catch((e) => { console.error('✗ ' + e.message); console.error(e.stack); process.exit(1); });