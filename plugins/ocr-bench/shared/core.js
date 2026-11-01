'use strict';
/**
 * core.js —— 文字识别台纯逻辑核心（面板 / 服务 / MCP 三方同源口径，零依赖）
 *
 * 职责：常量与护栏上限、语言包目录（内置 + 可下载清单）、输入发现器（文件/目录
 * → 待识别清单）、PDF 文本层阈值判定、任务状态机纯函数、报告汇总与中文结论、
 * 路径安全（输出目录根边界校验，weibian 先例）、敏感路径脱敏。
 * 不含任何 IO / 网络逻辑——那在 service 侧，这里必须可被单测直接断言。
 */

const VERSION = '0.1.0';
const PLUGIN_ID = 'ocr-bench';
const PREFIX = 'ocr-bench.';

// ── 护栏（service 强制执行；面板文案与 MCP 描述同源引用）────────────────────
const LIMITS = {
  maxFilesPerJob: { min: 1, max: 200, default: 200 },        // 单任务文件数
  maxPdfPages: { min: 1, max: 500, default: 500 },           // 单 PDF 页数
  maxImageBytes: 50 * 1024 * 1024,                           // 单图 ≤50MB
  maxImageEdge: 5000,                                        // 长边 >5000px 先缩放（内存护栏）
  maxOutTextBytes: 4 * 1024 * 1024,                          // 内存中单文件全文上限
  textHeadBytes: 16 * 1024,                                  // kv 报告中单文件文本头部保留
  reportTextBudget: 256 * 1024,                              // kv 报告文本总预算（超出从长文件开始截）
  historyMax: 40,                                            // 历史环形条数
  keepReports: 20,                                           // 完整报告保留条数
  workerCount: 2,                                            // tesseract 并发 worker
  pageTimeoutMs: 120 * 1000,                                 // 单页识别超时
  jobIdleTimeoutMs: 30 * 60 * 1000,                          // 任务兜底超时
};

// ── 语言包目录 ──────────────────────────────────────────────────────────────
// 内置 = zip 随包（tessdata_fast，离线即用）；可选 = 首次使用时从 jsdelivr
// tessdata_fast 下载到 {{appConfigDir}}/ocr-bench/langs（唯一的模型下载流量，
// 图像数据永不外发）。quality: fast 内置；standard 档不提供（体积/收益比差）。
const LANGS = [
  { code: 'chi_sim', name: '简体中文', builtin: true },
  { code: 'eng', name: '英语', builtin: true },
  { code: 'chi_tra', name: '繁体中文', builtin: false },
  { code: 'jpn', name: '日语', builtin: false },
  { code: 'kor', name: '韩语', builtin: false },
  { code: 'rus', name: '俄语', builtin: false },
  { code: 'fra', name: '法语', builtin: false },
  { code: 'deu', name: '德语', builtin: false },
  { code: 'spa', name: '西班牙语', builtin: false },
  { code: 'por', name: '葡萄牙语', builtin: false },
  { code: 'ita', name: '意大利语', builtin: false },
  { code: 'ara', name: '阿拉伯语', builtin: false },
  { code: 'tha', name: '泰语', builtin: false },
  { code: 'vie', name: '越南语', builtin: false },
  { code: 'ind', name: '印尼语', builtin: false },
  { code: 'tur', name: '土耳其语', builtin: false },
];
const LANG_CODES = new Set(LANGS.map((l) => l.code));
const TESSDATA_FAST_URL = (code) => `https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/${code}.traineddata`;

// ── 输入发现器（纯函数：路径 + fs 探针注入 → 待识别清单）────────────────────
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.pnm', '.webp', '.tif', '.tiff']);
const PDF_EXT = '.pdf';

/**
 * 把用户给的路径集合展开成待识别清单。
 * @param {string[]} inputs 绝对路径数组（文件或目录）
 * @param {{statSync:(p:string)=>{isDirectory:():boolean,isFile:():boolean,size:number},
 *          readDirSync?:(p:string)=>string[]}} fsLike 注入的文件系统探针（便于单测）
 * @returns {{ok:boolean, error?:string, items?:{path:string,type:'image'|'pdf',bytes:number}[], scanned?:number}}
 *   scanned = 目录递归中被跳过的不可识别条目数
 */
function discoverInputs(inputs, fsLike) {
  const files = Array.isArray(inputs) ? inputs : [];
  if (!files.length) return { ok: false, error: '未提供任何输入路径' };
  if (files.length > LIMITS.maxFilesPerJob.max * 2) {
    return { ok: false, error: `输入路径过多（>${LIMITS.maxFilesPerJob.max * 2}），请收敛后重试` };
  }
  const seen = new Set();
  const items = [];
  let scanned = 0;
  const seenLower = new Set(); // Windows 大小写不敏感去重
  // 目录列举：真实 Node fs 用 readdirSync，测试注入的 fsLike 用 readDirSync——两者都认
  const readDir = fsLike.readDirSync || fsLike.readdirSync;

  const push = (p, type, bytes) => {
    const key = p.toLowerCase();
    if (seenLower.has(key)) return;
    seenLower.add(key);
    items.push({ path: p, type, bytes: bytes || 0 });
  };

  for (const raw of files) {
    const p = String(raw || '').trim();
    if (!p) continue;
    let st;
    try { st = fsLike.statSync(p); } catch (_) {
      return { ok: false, error: `路径不存在或不可读：${p}` };
    }
    if (st.isDirectory()) {
      const entries = readDir ? readDir(p) : [];
      const dirs = [];
      for (const name of entries) {
        if (items.length >= LIMITS.maxFilesPerJob.max * 2) break; // 根目录层与子目录层同受硬顶约束
        const full = joinPath(p, name);
        let s2;
        try { s2 = fsLike.statSync(full); } catch (_) { continue; }
        if (s2.isDirectory()) { dirs.push(full); continue; }  // 一层子目录也收（递归，见下）
        const ext = extName(name).toLowerCase();
        if (IMAGE_EXTS.has(ext) || ext === PDF_EXT) push(full, ext === PDF_EXT ? 'pdf' : 'image', s2.size);
        else scanned += 1;
      }
      // 子目录递归（广度优先，上限护栏：总条目不超过 maxFilesPerJob*2）
      const queue = dirs.slice();
      while (queue.length) {
        const dir = queue.shift();
        let subs;
        try { subs = readDir ? readDir(dir) : []; } catch (_) { continue; }
        for (const name of subs) {
          if (items.length >= LIMITS.maxFilesPerJob.max * 2) break;
          const full = joinPath(dir, name);
          let s3;
          try { s3 = fsLike.statSync(full); } catch (_) { continue; }
          if (s3.isDirectory()) queue.push(full);
          else {
            const ext = extName(name).toLowerCase();
            if (IMAGE_EXTS.has(ext) || ext === PDF_EXT) push(full, ext === PDF_EXT ? 'pdf' : 'image', s3.size);
            else scanned += 1;
          }
        }
      }
    } else if (st.isFile()) {
      const ext = extName(p).toLowerCase();
      if (IMAGE_EXTS.has(ext)) push(p, 'image', st.size);
      else if (ext === PDF_EXT) push(p, 'pdf', st.size);
      else return { ok: false, error: `不支持的文件类型：${p}（支持 png/jpg/bmp/webp/tiff/pnm 与 pdf）` };
    } else {
      return { ok: false, error: `路径既不是文件也不是目录：${p}` };
    }
  }
  if (!items.length) return { ok: false, error: '输入中没有可识别的文件（支持 png/jpg/bmp/webp/tiff/pnm 与 pdf）', scanned };
  // 稳定排序：pdf 在前（通常更耗时），同类按路径
  items.sort((a, b) => (a.type === b.type ? (a.path < b.path ? -1 : 1) : a.type === 'pdf' ? -1 : 1));
  return { ok: true, items, scanned };
}

/** 路径拼接（跨盘符安全的简易版；发现器内部专用） */
function joinPath(base, name) {
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return base.endsWith('\\') || base.endsWith('/') ? base + name : base + sep + name;
}

function extName(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  const dot = p.lastIndexOf('.');
  return dot > i ? p.slice(dot) : '';
}

/**
 * 输出目录根边界校验：outDir 必须位于 parent 之内（weibian 先例）。
 * 含 .. 段的路径一律拒绝（保守策略：纯字符串前缀判定不做归一化，
 * 'C:\out\..\evil' 前缀合法但语义越界，必须拦下）。
 */
function isPathInside(child, parent) {
  const c = resolveLower(child);
  const p = resolveLower(parent);
  if (!c || !p) return false;
  if (/(^|[\\/])\.\.([\\/]|$)/.test(c)) return false;   // .. 段逃逸拒绝
  if (c === p) return true;
  const sep = p.endsWith('\\') || p.endsWith('/') ? '' : (p.includes('\\') ? '\\' : '/');
  return c.startsWith(p + sep);
}
function resolveLower(p) {
  const s = String(p || '').replace(/\/+/g, '\\').replace(/\\+/g, '\\').trim().toLowerCase();
  if (!s) return '';
  // 统一小写后再剥根盘符路径的尾分隔符（顺序不能反：反了会漏小写化）
  return s.length > 3 && s.endsWith('\\') && s[1] === ':' ? s.slice(0, -1) : s;
}

// ── PDF 文本层判定 ──────────────────────────────────────────────────────────
// 平均每页字符数超过阈值 → 判文字版（直接抽取，不烧 OCR）。30 为经验值：
// 扫描件偶有页眉水印数字（<30），文字版论文正文远超。
const NATIVE_TEXT_THRESHOLD = 30;

function judgeTextLayer(pages) {
  // pages: [{page:number, chars:number}]
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return { mode: 'empty', nativePages: [], ocrPages: [] };
  const nativePages = list.filter((p) => (p.chars || 0) >= NATIVE_TEXT_THRESHOLD).map((p) => p.page);
  const ocrPages = list.filter((p) => (p.chars || 0) < NATIVE_TEXT_THRESHOLD).map((p) => p.page);
  return {
    mode: nativePages.length === list.length ? 'native' : (nativePages.length ? 'mixed' : 'scanned'),
    nativePages,
    ocrPages,
  };
}

// ── 语言参数归一 ────────────────────────────────────────────────────────────
/** 归一语言参数：接受字符串（'chi_sim+eng'）或数组；返回 {ok, error?, langs?} */
function normalizeLangs(input, installedLangs) {
  let arr = [];
  if (Array.isArray(input)) arr = input;
  else if (typeof input === 'string' && input.trim()) arr = input.split(/[+,\s]+/);
  else arr = ['chi_sim', 'eng']; // 默认：内置双语言
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const c = String(raw || '').trim();
    if (!c) continue;
    if (!LANG_CODES.has(c)) return { ok: false, error: `不支持的语言代码：${c}（可用 ocr_langs 查询清单）` };
    if (seen.has(c)) continue;
    seen.add(c);
    if (!installedLangs || !installedLangs.has(c)) {
      return { ok: false, error: `语言包未安装：${c}（先在面板「语言包」下载，或用 ocr_langs 确认已装清单）` };
    }
    out.push(c);
  }
  if (!out.length) out.push('chi_sim', 'eng');
  if (out.length > 4) return { ok: false, error: '单次识别最多组合 4 个语言包（过多会显著拖慢与降准）' };
  return { ok: true, langs: out };
}

// ── 识别参数（PSM）──────────────────────────────────────────────────────────
const PSM_OPTIONS = [
  { value: 3, label: '自动分页（默认）' },
  { value: 6, label: '统一文本块' },
  { value: 4, label: '单列多行' },
  { value: 11, label: '稀疏文本' },
  { value: 7, label: '单行' },
];
function normalizePsm(input) {
  const n = Math.round(Number(input));
  if (!Number.isFinite(n)) return 3;
  return PSM_OPTIONS.some((p) => p.value === n) ? n : 3;
}

// ── 任务状态机（纯函数部分）────────────────────────────────────────────────
const JOB_STATES = ['queued', 'running', 'done', 'stopped', 'failed'];

/** 单文件结果归一（service 落库前的最后一道整形；AI/面板读到的形状） */
function shapeFileResult(r) {
  const pages = Array.isArray(r.pages) ? r.pages.map((p) => ({
    page: Math.max(0, Math.round(Number(p.page) || 0)),
    chars: Math.max(0, Math.round(Number(p.chars) || 0)),
    confidence: clamp01(Number(p.confidence)),
    mode: p.mode === 'native' ? 'native' : 'ocr',
    error: p.error ? String(p.error).slice(0, 300) : null,
  })) : [];
  const text = typeof r.text === 'string' ? r.text : '';
  return {
    path: String(r.path || ''),
    type: r.type === 'pdf' ? 'pdf' : 'image',
    ok: !!r.ok,
    error: r.error ? String(r.error).slice(0, 400) : null,
    pages,
    chars: text.length,
    durationMs: Math.max(0, Math.round(Number(r.durationMs) || 0)),
    text: text.length > LIMITS.maxOutTextBytes ? text.slice(0, LIMITS.maxOutTextBytes) : text,
    truncated: text.length > LIMITS.maxOutTextBytes,
    outFile: r.outFile || null,   // 导出的 txt 绝对路径（未导出为 null）
  };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
}

/** 任务汇总 + 中文结论（面板卡片与 AI 报告共用） */
function summarizeJob(job) {
  const results = (job.results || []).map(shapeFileResult);
  const okFiles = results.filter((r) => r.ok);
  const failFiles = results.filter((r) => !r.ok);
  const totalChars = okFiles.reduce((a, r) => a + r.chars, 0);
  const ocrPages = okFiles.reduce((a, r) => a + r.pages.filter((p) => p.mode === 'ocr' && !p.error).length, 0);
  const nativePages = okFiles.reduce((a, r) => a + r.pages.filter((p) => p.mode === 'native' && !p.error).length, 0);
  const pageConfs = [];
  for (const r of okFiles) for (const p of r.pages) if (!p.error && p.confidence !== null) pageConfs.push(p.confidence);
  const meanConf = pageConfs.length ? Math.round((pageConfs.reduce((a, b) => a + b, 0) / pageConfs.length) * 10) / 10 : null;
  const lowConfPages = pageConfs.filter((c) => c < 60).length;
  const durationMs = Math.max(0, Math.round(Number(job.durationMs) || 0));
  const notes = [];
  if (failFiles.length) notes.push(`${failFiles.length} 个文件识别失败（多为损坏/加密/无页面图像，详见逐项错误）`);
  if (nativePages && !ocrPages) notes.push('全部页面带文字层：已直接抽取文本（未启用 OCR，速度最快、最准）');
  if (lowConfPages) notes.push(`${lowConfPages} 页置信度 <60：可能是拍照倾斜/模糊/手写体，建议重拍清晰图或仅作参考`);
  const oneLine = job.aborted
    ? `已中止：处理到第 ${okFiles.length + failFiles.length}/${results.length} 个文件`
    : `${okFiles.length}/${results.length} 个文件完成，提取 ${totalChars} 字（OCR ${ocrPages} 页 / 文字层直读 ${nativePages} 页${meanConf !== null ? ` · 平均置信度 ${meanConf}` : ''}）`;
  return {
    files: results.length,
    okFiles: okFiles.length,
    failFiles: failFiles.length,
    totalChars,
    ocrPages,
    nativePages,
    meanConfidence: meanConf,
    lowConfPages,
    durationMs,
    aborted: !!job.aborted,
    oneLine,
    notes,
  };
}

// ── 路径脱敏（日志/错误显示用：保留盘符与文件名，中间段折叠）────────────────
function maskPath(p) {
  const s = String(p || '');
  if (!s) return '';
  const norm = s.replace(/\\/g, '/');
  const parts = norm.split('/');
  if (parts.length <= 3) return s;
  return `${parts[0]}/…/${parts.slice(-2).join('/')}`;
}

module.exports = {
  VERSION, PLUGIN_ID, PREFIX, LIMITS, LANGS, LANG_CODES, TESSDATA_FAST_URL,
  IMAGE_EXTS, PDF_EXT, PSM_OPTIONS, NATIVE_TEXT_THRESHOLD,
  discoverInputs, isPathInside, judgeTextLayer, normalizeLangs, normalizePsm,
  shapeFileResult, summarizeJob, maskPath, joinPath, extName,
};
