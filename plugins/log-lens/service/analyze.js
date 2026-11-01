'use strict';
/**
 * analyze.js —— 日志统计与错误聚类（零依赖）
 *
 * 聚类口径：把消息里的「易变部分」归一化（数字/UUID/十六进制/IP/引号串/路径/
 * URL/时长等替换为占位符），按 (level, 归一化模板) 分组——同一类报错收敛为一条。
 * 只聚合计数器，不保存全量 entry（>100MB 文件也不膨胀内存；聚类 map 设上限）。
 */

const { createParser } = require('./parser');
const { iterateLines, fileMeta } = require('./reader');
const { lineDecoder } = require('./charset');

const CLUSTER_MAP_MAX = 5000;

const RE_NUMBER = /\b\d+\b/g;
const RE_UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const RE_HEX = /\b[0-9a-fA-F]{8,}\b/g;
const RE_IP = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g;
const RE_QUOTED = /(["'])(?:\\.|(?!\1)[^\\\n])*\1/g;
const RE_URL = /\bhttps?:\/\/[^\s"'<>()]+/g;
const RE_PATH = /(?:[A-Za-z]:)?(?:[\\/][\w.$-]+){2,}/g;
const RE_DURATION = /\b\d+(?:\.\d+)?\s?(?:ms|s|sec|seconds?|min|minutes?|h|hours?|d|days?)\b/gi;

/** 归一化消息模板（聚类的分组键） */
function normalizeMessage(message) {
  let s = String(message || '');
  s = s.replace(RE_URL, '<url>');
  s = s.replace(RE_UUID, '<uuid>');
  s = s.replace(RE_IP, '<ip>');
  s = s.replace(RE_QUOTED, '<str>');
  s = s.replace(RE_DURATION, '<dur>');
  s = s.replace(RE_PATH, '<path>');
  s = s.replace(RE_HEX, '<hex>');
  s = s.replace(RE_NUMBER, '<n>');
  // 压空白，避免同一模板因空格差异分裂
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 240) s = `${s.slice(0, 240)}…`;
  return s;
}

/** 级别直方图 */
function levelHistogram(entries) {
  const levels = { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
  let unknown = 0;
  for (const e of entries) {
    if (e.level && levels[e.level] !== undefined) levels[e.level]++;
    else unknown++;
  }
  return { ...levels, unknown };
}

/** 按小时时间线（仅统计时间戳可解析的行；errors = WARN+ERROR+FATAL） */
function hourlyTimeline(entries) {
  const map = new Map(); // hourStartMs → {total, problems}
  for (const e of entries) {
    if (!e.ts) continue;
    const hour = Math.floor(e.ts / 3600000) * 3600000;
    let bucket = map.get(hour);
    if (!bucket) {
      bucket = { total: 0, problems: 0 };
      map.set(hour, bucket);
    }
    bucket.total++;
    if (e.level === 'WARN' || e.level === 'ERROR' || e.level === 'FATAL') bucket.problems++;
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({ hour, ...v }));
}

/** 聚类聚合器（流式喂 entry，内存有界） */
function createClusterAggregator(topN) {
  const map = new Map(); // key → {count, level, sample, firstTs, lastTs, firstOffset}
  let overflow = false;
  return {
    add(entry) {
      if (!entry || entry.continuation || !entry.message) return;
      const key = `${entry.level}|${normalizeMessage(entry.message)}`;
      let c = map.get(key);
      if (c) {
        c.count++;
        if (entry.ts && (!c.lastTs || entry.ts > c.lastTs)) c.lastTs = entry.ts;
        if (entry.ts && (!c.firstTs || entry.ts < c.firstTs)) c.firstTs = entry.ts;
      } else {
        if (map.size >= CLUSTER_MAP_MAX) { overflow = true; return; }
        map.set(key, {
          count: 1, level: entry.level,
          sample: entry.message.length > 300 ? `${entry.message.slice(0, 300)}…` : entry.message,
          firstTs: entry.ts || null, lastTs: entry.ts || null, firstOffset: entry.offset,
        });
      }
    },
    top() {
      const rows = [...map.values()].sort((a, b) => b.count - a.count);
      return { clusters: rows.slice(0, topN || 20), distinct: map.size, overflow };
    },
  };
}

/**
 * 全文件统计：流式扫描（不保存 entry），产出级别直方图/小时线/错误聚类。
 * @param opts {{file, problemLevelsOnly?:boolean, sampledBytes?:number, approximate?:boolean, scanCap?:number}}
 */
function statsForFile(file, opts) {
  const meta = fileMeta(file);
  const scanCap = Math.min((opts && opts.scanCap) || Infinity, 512 * 1024 * 1024);
  const parser = createParser(meta.format);
  const decode = lineDecoder(meta.encoding);
  const agg = createClusterAggregator(20);
  const hist = { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0, unknown: 0 };
  const hours = new Map();
  let total = 0;
  let firstTs = null, lastTs = null;
  let scanned = 0;

  for (const line of iterateLines(file, meta.encoding, 0, { finalPartial: 'yield', maxBytes: scanCap })) {
    scanned = line.end;
    const entry = parser.addLine(line.text, line.start, line.end);
    if (!entry) continue;
    if (entry.continuation) continue; // 孤儿归并行不重复计数
    total++;
    if (entry.ts) {
      if (firstTs === null || entry.ts < firstTs) firstTs = entry.ts;
      if (lastTs === null || entry.ts > lastTs) lastTs = entry.ts;
      const hour = Math.floor(entry.ts / 3600000) * 3600000;
      let b = hours.get(hour);
      if (!b) { b = { total: 0, problems: 0 }; hours.set(hour, b); }
      b.total++;
    }
    if (entry.level && hist[entry.level] !== undefined) {
      hist[entry.level]++;
      if (entry.level === 'WARN' || entry.level === 'ERROR' || entry.level === 'FATAL') {
        if (entry.ts) hours.get(Math.floor(entry.ts / 3600000) * 3600000).problems++;
        agg.add(entry);
      }
    } else {
      hist.unknown++;
    }
  }
  const rest = parser.flush();
  if (rest && !rest.continuation) {
    total++;
    if (rest.level && hist[rest.level] !== undefined) {
      hist[rest.level]++;
      if (rest.level === 'WARN' || rest.level === 'ERROR' || rest.level === 'FATAL') agg.add(rest);
    } else hist.unknown++;
  }
  const { clusters, distinct, overflow } = agg.top();
  return {
    file, fileSize: meta.size, encoding: meta.encoding, format: meta.format,
    totalEntries: total, levels: hist,
    hourly: [...hours.entries()].sort((a, b) => a[0] - b[0]).map(([hour, v]) => ({ hour, ...v })),
    clusters, distinctClusters: distinct, clusterMapOverflow: overflow,
    firstTs, lastTs, scannedBytes: scanned,
    approximate: scanned < meta.size,
  };
}

module.exports = { normalizeMessage, levelHistogram, hourlyTimeline, createClusterAggregator, statsForFile };
