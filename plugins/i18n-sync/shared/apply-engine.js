'use strict';
/**
 * apply-engine.js —— 审阅落盘引擎（service 与 MCP 共用的单一权威）。
 * core 负责纯计划（planApply），本文件负责：扫描现状 → 键归属 → 计划 →
 * 校验门（占位符/幻觉键/注释警告，要么全过要么不写）→ 快照 → 写盘 → undo 索引。
 *
 * 依赖注入：yaml（js-yaml）、kv（cap.kv 客户端，可 null=跳过索引）、log。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./i18n-core');
const engine = require('./scan-engine');

const KEY_UNDO_INDEX = 'i18n.undo.index';

/**
 * @param {object} p
 * @param {string} p.dir locale 根目录（绝对路径）
 * @param {string} p.locale 目标语言
 * @param {Record<string,string>} p.translations {键: 译文}
 * @param {string} [p.ns] 命名空间过滤（键跨 ns 冲突时必须传）
 * @param {'preserve'|'mirror'} [p.mode]
 * @param {boolean} [p.stripComments] 接受丢失注释
 * @param {boolean} [p.force] 接受带校验错误强制写（不推荐）
 * @param {string} [p.baseLocale] 覆盖基准语言
 * @param {object} p.yaml {load, dump}
 * @param {string} p.appConfigDir undo 快照目录基座
 * @param {object|null} p.kv cap.kv 客户端（undo 索引；null 跳过）
 * @param {Function} [p.log]
 */
async function applyTranslations(p) {
  const { yaml, appConfigDir, kv, log = () => {} } = p;
  const dir = String(p.dir || '').trim();
  if (!dir) throw new Error('缺少 dir（locale 根目录）');
  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) throw new Error(`目录不存在：${resolvedDir}`);
  const locale = core.normalizeLocaleTag(p.locale || '');
  if (!locale) throw new Error('缺少 locale（目标语言，如 en）');
  const translations = p.translations;
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) {
    throw new Error('缺少 translations（{ 键: 译文 } 对象）');
  }
  const mode = p.mode === 'mirror' ? 'mirror' : 'preserve';
  const nsFilter = typeof p.ns === 'string' && p.ns ? p.ns : null;

  const scan = engine.scanDir(resolvedDir, { baseLocale: p.baseLocale, yaml });
  const baseLoc = scan.baseLocale;
  if (locale === baseLoc) throw new Error(`locale 不能等于基准语言（${baseLoc}）；基准语言是翻译源，不需要补齐自己`);

  // 按 ns 组装工作单元（用完整 entries：含 parse/absPath；scan.files 只是摘要）
  const filesByNs = new Map();
  for (const f of scan.entries) {
    if (!filesByNs.has(f.ns)) filesByNs.set(f.ns, new Map());
    filesByNs.get(f.ns).set(f.locale, f);
  }
  const units = [];
  const skippedNs = [];
  // 目标语言文件解析失败的细节（relPath 的文件名或目录名 = locale）附到 skipped 原因里
  const parseErrorHint = (loc) => {
    for (const pe of scan.parseErrors) {
      const norm = pe.relPath.replace(/\\/g, '/');
      const stem = norm.slice(norm.lastIndexOf('/') + 1, norm.lastIndexOf('.'));
      const parent = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : '';
      const parentStem = parent.includes('/') ? parent.slice(parent.lastIndexOf('/') + 1) : parent;
      if (core.normalizeLocaleTag(stem) === loc || core.normalizeLocaleTag(parentStem) === loc) return pe.error;
    }
    return '';
  };
  for (const [ns, localeMap] of filesByNs) {
    if (nsFilter && ns !== nsFilter) continue;
    const baseFile = localeMap.get(baseLoc);
    const targetFile = localeMap.get(locale);
    if (!targetFile) {
      const hint = parseErrorHint(locale);
      skippedNs.push({ ns, reason: `没有 ${locale} 的语言文件（可先创建空对象文件再应用）${hint ? `；解析失败：${hint}` : ''}` });
      continue;
    }
    if (!baseFile) { skippedNs.push({ ns, reason: `基准语言 ${baseLoc} 文件缺失或解析失败，无法校验` }); continue; }
    const targetFlat = core.flattenLocale(targetFile.parse.data);
    units.push({ ns, targetFile, baseFlat: core.flattenLocale(baseFile.parse.data), targetConflicts: targetFlat.conflicts });
  }
  if (!units.length) {
    throw new Error(`目标语言 ${locale} 没有可写入的 locale 文件${skippedNs.length ? `（${skippedNs.map((s) => `${s.ns}: ${s.reason}`).join('；')}）` : '（先扫描确认目录与布局）'}`);
  }

  // 键 → ns 归属（基准侧；跨 ns 同名键要求消歧）
  const keyOwner = new Map();
  for (const u of units) {
    for (const key of Object.keys(u.baseFlat.map)) {
      const prev = keyOwner.get(key);
      if (!prev) keyOwner.set(key, { ns: u.ns, others: [] });
      else if (prev.ns !== u.ns) prev.others.push(u.ns);
    }
  }

  const byUnit = new Map();
  const unknownGlobal = [];
  for (const [rawKey, value] of Object.entries(translations)) {
    const key = String(rawKey).trim();
    if (!key) continue;
    const owner = keyOwner.get(key);
    if (!owner) { unknownGlobal.push(key); continue; }
    if (owner.others.length) throw new Error(`键 "${key}" 在多个 ns 中都存在（${[owner.ns, ...owner.others].join(', ')}），请传 ns 参数消歧`);
    if (!byUnit.has(owner.ns)) byUnit.set(owner.ns, {});
    byUnit.get(owner.ns)[key] = value;
  }

  const applied = [];
  const allPlanErrors = [];
  const snapshotItems = [];
  for (const u of units) {
    const slice = byUnit.get(u.ns);
    if (!slice || !Object.keys(slice).length) continue;
    const { newDoc, plan } = core.planApply({
      targetDoc: u.targetFile.parse.data,
      baseFlat: u.baseFlat,
      translations: slice,
      mode,
      targetConflicts: u.targetConflicts,
    });
    plan.unknown.forEach((k) => allPlanErrors.push({ key: k, reason: '基准与目标都没有这个键（可能是幻觉键），已拒绝' }));
    for (const e of plan.errors) allPlanErrors.push(e);
    if (plan.insert.length || plan.update.length) {
      if (u.targetFile.parse.hasComments && !p.stripComments) {
        allPlanErrors.push({ key: `(${u.ns}) ${u.targetFile.relPath}`, reason: '该文件含注释，直接序列化会丢注释；确认接受时传 stripComments:true' });
        continue;
      }
      const afterText = core.serializeLocale(newDoc, u.targetFile.parse, { yamlDump: yaml && yaml.dump });
      snapshotItems.push({ absPath: u.targetFile.absPath, afterText, ns: u.ns });
      applied.push({ ns: u.ns, file: u.targetFile.relPath, insert: plan.insert.length, update: plan.update.length, noop: plan.noop.length });
    } else {
      applied.push({ ns: u.ns, file: u.targetFile.relPath, insert: 0, update: 0, noop: plan.noop.length });
    }
  }

  if (unknownGlobal.length) {
    allPlanErrors.push({ key: unknownGlobal.slice(0, 10).join(', '), reason: `共 ${unknownGlobal.length} 个键不在任何基准语言文件中（可能是幻觉键），已拒绝` });
  }
  for (const s of skippedNs) allPlanErrors.push({ key: `(${s.ns})`, reason: `跳过：${s.reason}` });

  // 校验门：要么全过要么不写，避免半套翻译落盘
  const blocking = allPlanErrors.filter((e) => !/stripComments|跳过：/.test(e.reason));
  if (blocking.length && !p.force) {
    return { ok: false, errors: allPlanErrors.slice(0, 50), hint: '全部拒绝未写盘。修复译文后重试；确认接受时可传 force:true（不推荐）。' };
  }
  if (!snapshotItems.length) {
    if (allPlanErrors.length) {
      // 有拒绝原因（如 stripComments 门）→ 必须回带，不能静默 noop
      return { ok: false, errors: allPlanErrors.slice(0, 50), hint: '未写盘。' };
    }
    return { ok: true, noop: true, applied, message: '没有需要写入的变更（全部为 noop 或无翻译分片）' };
  }

  // 写前快照 → 写盘 → 清理旧快照
  const batchId = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const snapPayload = snapshotItems.map((item) => ({
    absPath: item.absPath,
    beforeText: fs.readFileSync(item.absPath, 'utf8'),
    afterText: item.afterText,
  }));
  engine.writeSnapshot(appConfigDir, batchId, snapPayload);
  for (const item of snapshotItems) fs.writeFileSync(item.absPath, item.afterText, 'utf8');
  engine.pruneSnapshots(appConfigDir, 20);

  // undo 索引（kv 单写者；桥不可达时跳过索引但快照仍在磁盘上）
  try {
    if (kv) {
      const idx = (await kv.kvGet(KEY_UNDO_INDEX)) || [];
      const next = Array.isArray(idx) ? idx : [];
      next.unshift({ batchId, at: new Date().toISOString(), root: resolvedDir, locale, mode, files: snapshotItems.map((s) => s.absPath) });
      await kv.kvSet(KEY_UNDO_INDEX, next.slice(0, 20));
    }
  } catch (e) { log('warn', 'undo 索引写失败: ' + e.message); }

  log('info', `apply ${resolvedDir} ${locale} batch=${batchId} 文件=${snapshotItems.length} 插入=${applied.reduce((s, a) => s + a.insert, 0)} 更新=${applied.reduce((s, a) => s + a.update, 0)}`);
  return { ok: true, batchId, applied, warnings: scan.warnings };
}

module.exports = { applyTranslations, KEY_UNDO_INDEX };
