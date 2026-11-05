'use strict';
/**
 * chunk-core.js —— LLM 文本切块台共享核心（单一权威，零依赖纯函数、零 node 内置 require）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用，
 * 禁止 require 任何 node 内置模块（exec-sandbox 实证坑）。
 *
 * 切块语义（如实声明）：
 *   - token 估算为启发式口径：CJK 字符 ≈1 token/字，拉丁/数字 ≈1 token/4 字符，
 *     其余符号 ≈0.5 token/个——**非精确 tokenizer**（不做 BPE），报告必须标注估算
 *   - 切块优先级：段落边界（\n\n）> 句子边界（。！？.!?）> 硬切（词中，最后手段）
 *   - 重叠窗口：块尾 N token 的内容复制到下一块头（防语义断裂），overlap < maxTokens
 *   - 单段超限：段落内句子级贪心；无句读长文（如 base64）按硬切
 */

/** token 估算（启发式，如实标注口径） */
function estimateTokens(text) {
  const s = String(text == null ? '' : text);
  if (!s) return 0;
  let cjk = 0;
  let latinAlnum = 0;
  let other = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0xac00 && cp <= 0xd7af)) cjk++;
    else if (/[0-9A-Za-z]/.test(ch)) latinAlnum++;
    else other++;
  }
  return Math.ceil(cjk * 1 + latinAlnum / 4 + other * 0.5);
}

/** 句子边界切分（中英句读；保留分隔符在句尾） */
function splitSentences(paragraph) {
  return String(paragraph)
    .split(/(?<=[。！？.!?])\s*/)
    .filter((s) => s.trim());
}

/** 段落切分（\n\n 优先；单换行视为软边界保留在段内） */
function splitParagraphs(text) {
  return String(text == null ? '' : text).split(/\n{2,}/).filter((p) => p.trim());
}

/**
 * 核心切块（纯函数，单测覆盖）。
 * @param {string} text 长文本
 * @param {object} [opts] { maxTokens?: number(缺省 800), overlapTokens?: number(缺省 0) }
 * @returns {{ chunks: Array<{ index:number, text:string, tokens:number }>, totalTokens:number, estimateNote:string }}
 */
function chunkText(text, opts = {}) {
  const maxTokens = Math.max(50, Math.min(32000, Number(opts.maxTokens) || 800));
  const overlapTokens = Math.max(0, Math.min(Number(opts.overlapTokens) || 0, Math.floor(maxTokens / 2)));
  const totalTokens = estimateTokens(text);

  if (totalTokens <= maxTokens) {
    return {
      chunks: [{ index: 0, text: String(text), tokens: totalTokens }],
      totalTokens,
      estimateNote: ESTIMATE_NOTE,
    };
  }

  const paragraphs = splitParagraphs(text);
  const chunks = [];
  let currentParts = [];
  let currentTokens = 0;

  const flush = () => {
    if (!currentParts.length) return;
    const chunkText = currentParts.join('\n\n');
    chunks.push({ index: chunks.length, text: chunkText, tokens: estimateTokens(chunkText) });
    // overlap：取块尾内容直至 overlapTokens
    if (overlapTokens > 0) {
      let tail = [];
      let tailTokens = 0;
      for (let i = currentParts.length - 1; i >= 0 && tailTokens < overlapTokens; i--) {
        const t = estimateTokens(currentParts[i]);
        if (tailTokens + t > overlapTokens) break;
        tail.unshift(currentParts[i]);
        tailTokens += t;
      }
      currentParts = tail;
      currentTokens = tailTokens;
    } else {
      currentParts = [];
      currentTokens = 0;
    }
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    if (paraTokens > maxTokens) {
      // 段落超限：句子级贪心
      if (currentTokens + paraTokens > maxTokens) flush();
      const sentences = splitSentences(para);
      for (const sentence of sentences) {
        const st = estimateTokens(sentence);
        if (currentTokens + st > maxTokens && currentTokens > 0) {
          flush();
        }
        if (st > maxTokens) {
          // 单句超限：硬切（无句读长文最后手段）
          let remaining = sentence;
          while (estimateTokens(remaining) > maxTokens) {
            // 按 token 预算反推字符数（保守：用估算比例）
            const ratio = remaining.length / estimateTokens(remaining);
            const cutChars = Math.max(1, Math.floor(maxTokens * ratio * 0.9));
            const piece = remaining.slice(0, cutChars);
            if (currentTokens > 0) flush();
            currentParts.push(piece);
            currentTokens = estimateTokens(piece);
            flush();
            remaining = remaining.slice(cutChars);
          }
          if (remaining) { currentParts.push(remaining); currentTokens += estimateTokens(remaining); }
          continue;
        }
        currentParts.push(sentence);
        currentTokens += st;
      }
      continue;
    }
    if (currentTokens + paraTokens > maxTokens && currentTokens > 0) {
      flush();
    }
    currentParts.push(para);
    currentTokens += paraTokens;
  }
  flush();

  return {
    chunks: chunks.filter((c) => c.text.trim()),
    totalTokens,
    estimateNote: ESTIMATE_NOTE,
  };
}

const ESTIMATE_NOTE = 'token 估算为启发式口径（CJK≈1 token/字、拉丁≈1 token/4 字符、其余≈0.5/字符），非精确 tokenizer——预算敏感场景请留 10-20% 余量';

/** 切块报告渲染（MCP/面板共用口径） */
function renderReport(r, { includeText = true, textCap = 1200 } = {}) {
  const lines = [`共 ${r.chunks.length} 块 · 全文估算 ${r.totalTokens} tokens`];
  lines.push(r.estimateNote);
  for (const c of r.chunks) {
    lines.push(`── 块 ${c.index}（估算 ${c.tokens} tokens）──`);
    if (includeText) lines.push(c.text.length > textCap ? c.text.slice(0, textCap) + '…' : c.text);
  }
  return lines.join('\n');
}

module.exports = { estimateTokens, splitSentences, splitParagraphs, chunkText, renderReport, ESTIMATE_NOTE };
