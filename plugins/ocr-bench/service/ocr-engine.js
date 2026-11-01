'use strict';
/**
 * ocr-engine.js —— 识别引擎编排（tesseract.js + pdfjs，纯本地）
 *
 * 三条路径：
 *   1. 图片文件  → tesseract 直接识别（leptonica 解 png/jpg/bmp/webp/tiff/pnm）；
 *   2. 扫描 PDF  → pdfjs getOperatorList 提取页面嵌入图像（内部解码 DCT/CCITT/JBIG2/
 *                  Flate）→ 像素转 RGBA → PNG → tesseract；页 /Rotate 90/270 像素转置校正；
 *   3. 文字版 PDF → getTextContent 字符计数达阈值 → 直接抽取文本（不烧 OCR）。
 *
 * 语言缓存布局（零改动复用 tesseract.js 的 cachePath 机制）：
 *   cache/<code>.traineddata   解压后的模型（首次使用时由内置 .gz 解压；下载语言直接写）
 *   langPath 指向内置目录（gz，兜底），cachePath 指向 cache 目录（命中优先）。
 *
 * 中止语义：调用方持有 signal 对象，引擎在每个文件/每页之间检查 signal.aborted，
 * 中止后 terminate 全部 worker——不会误杀下一个任务（任务互斥由 service 保证）。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createWorker, createScheduler } = require('tesseract.js');
const pixel = require('./pixel');

// pdfjs legacy 在 Node 缺 DOMMatrix/Path2D 时仅影响渲染；文本/图像抽取不需要，stub 消音
global.DOMMatrix = global.DOMMatrix || class {};
global.Path2D = global.Path2D || class {};
const pdfjsLib = require('./vendor/pdfjs.min.js');

class OcrError extends Error {}

/** 引擎工厂：langsDirBuiltin = vendor/tessdata；cacheDir = 解压/下载模型落点 */
function createEngine({ langsDirBuiltin, cacheDir, limits, log }) {
  const L = log || (() => {});
  const runningWorkers = new Set();

  function builtinLangs() {
    try {
      return fs.readdirSync(langsDirBuiltin)
        .filter((f) => f.endsWith('.traineddata.gz'))
        .map((f) => f.replace('.traineddata.gz', ''));
    } catch (_) { return []; }
  }

  function ensureCacheDir() {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /** 内置模型解压进 cache（幂等：已存在且 >100KB 跳过） */
  function ensureBuiltinCached() {
    ensureCacheDir();
    for (const code of builtinLangs()) {
      const dst = path.join(cacheDir, `${code}.traineddata`);
      try {
        const st = fs.statSync(dst);
        if (st.isFile() && st.size > 100 * 1024) continue;
      } catch (_) { /* 不存在 */ }
      const src = path.join(langsDirBuiltin, `${code}.traineddata.gz`);
      try {
        const raw = zlib.gunzipSync(fs.readFileSync(src));
        const tmp = `${dst}.tmp`;
        fs.writeFileSync(tmp, raw);
        fs.renameSync(tmp, dst);
        L('info', `内置语言包解压完成：${code}（${Math.round(raw.length / 1024)}KB）`);
      } catch (e) {
        L('warn', `内置语言包解压失败 ${code}：${(e && e.message) || e}`);
      }
    }
  }

  function installedLangs() {
    ensureBuiltinCached();
    const set = new Set(builtinLangs()); // 内置兜底（即使解压失败也算“存在”）
    try {
      for (const f of fs.readdirSync(cacheDir)) {
        if (f.endsWith('.traineddata')) set.add(f.replace('.traineddata', ''));
      }
    } catch (_) { /* cache 目录不可读时只认内置 */ }
    return set;
  }

  /** 下载语言包到 cache（唯一外网流量：模型文件本身；图像数据永不外发） */
  async function downloadLang(code) {
    if (!code || typeof code !== 'string' || !/^[a-z_]{2,20}$/.test(code)) {
      throw new OcrError(`非法语言代码：${code}`);
    }
    ensureCacheDir();
    const dst = path.join(cacheDir, `${code}.traineddata`);
    try {
      const st = fs.statSync(dst);
      if (st.isFile() && st.size > 100 * 1024) return { ok: true, cached: true, bytes: st.size };
    } catch (_) { /* 需要下载 */ }
    const t0 = Date.now();
    let res;
    try {
      // 下载护栏：30s 超时（模型 ~2-5MB；挂死的 fetch 会拖死整个服务事件循环外的任务）
      res = await fetch(`https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main/${code}.traineddata`, { signal: AbortSignal.timeout(30000) });
    } catch (e) {
      throw new OcrError(`语言包下载网络异常：${String((e && e.message) || e).slice(0, 120)}。检查网络后重试，或仅使用内置的简体中文+英语。`);
    }
    if (!res.ok) throw new OcrError(`语言包下载失败（HTTP ${res.status}）：${code}。检查网络后重试，或仅使用内置的简体中文+英语。`);
    const buf = Buffer.from(await res.arrayBuffer());
    // 校验： traineddata 为二进制模型（>100KB 且非 HTML 错误页）
    if (buf.length < 100 * 1024 || (buf[0] === 0x3C && buf[1] === 0x21)) {
      throw new OcrError(`下载内容不是有效语言包：${code}（可能该语言在 tessdata_fast 中不存在）`);
    }
    const tmp = `${dst}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dst);
    L('info', `语言包下载完成：${code}（${Math.round(buf.length / 1024)}KB，${Date.now() - t0}ms）`);
    return { ok: true, cached: false, bytes: buf.length };
  }

  // ── worker 管理 ───────────────────────────────────────────────────────────
  async function spawnScheduler(langs, psm) {
    const scheduler = createScheduler();
    const n = Math.max(1, Math.min(limits.workerCount, 2));
    for (let i = 0; i < n; i++) {
      const w = await createWorker(langs, 1, {
        langPath: langsDirBuiltin,
        gzip: true,
        cachePath: cacheDir,
        logger: () => {},
      });
      await w.setParameters({ tessedit_pageseg_mode: String(psm) });
      scheduler.addWorker(w);
      runningWorkers.add(w);
    }
    return scheduler;
  }

  async function killScheduler(scheduler) {
    try {
      const workers = scheduler.getWorkers();
      await scheduler.terminate();
      for (const w of workers) runningWorkers.delete(w);
    } catch (e) {
      L('warn', `worker 终止异常（忽略）：${(e && e.message) || e}`);
    }
  }

  /** 识别一段 PNG/图片字节 → 文本（带单页超时） */
  function recognizeBuffer(scheduler, buf, tag) {
    const timeout = new Promise((_, rej) => setTimeout(
      () => rej(new OcrError(`单页识别超时（>${Math.round(limits.pageTimeoutMs / 1000)}s）`)),
      limits.pageTimeoutMs,
    ));
    const job = scheduler.addJob('recognize', buf);
    return Promise.race([job, timeout]).then(({ data }) => {
      L('debug', `识别完成 ${tag} conf=${data.confidence} chars=${(data.text || '').length}`);
      return { text: data.text || '', confidence: Number(data.confidence) };
    });
  }

  // ── PDF 处理 ──────────────────────────────────────────────────────────────
  async function openPdf(buf, filePath) {
    let doc;
    try {
      doc = await pdfjsLib.getDocument({
        data: new Uint8Array(buf),
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
        verbosity: 0, // 标准字体缺失等告警与文本/图像抽取无关，静音（错误仍抛异常）
      }).promise;
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/password/i.test(msg)) throw new OcrError(`PDF 已加密：请先解密再识别（${filePath ? '见文件路径' : ''}）`);
      throw new OcrError(`PDF 解析失败：${msg.slice(0, 200)}`);
    }
    if (doc.numPages > limits.maxPdfPages) {
      const n = doc.numPages;
      await doc.destroy();
      throw new OcrError(`PDF 页数 ${n} 超过单卷上限 ${limits.maxPdfPages}（拆分后分批识别）`);
    }
    return doc;
  }

  /** 单页文本层字符数 + 原文（native 用） */
  async function readTextLayer(page) {
    const tc = await page.getTextContent();
    let chars = 0;
    const parts = [];
    for (const item of tc.items) {
      if (typeof item.str !== 'string') continue;
      chars += item.str.length;
      parts.push(item.str);
      if (item.hasEOL) parts.push('\n');
    }
    // pdfjs 文本项常按独立 run 拆分（无空格分隔），同一行内以空格连接
    let text = parts.join('').replace(/[ \t]*\n[ \t]*/g, '\n');
    text = text.replace(/([^\n\S])[^\n\S]+/g, '$1 ').trim();
    return { chars, text };
  }

  /** 取页面嵌入图像对象（取像素数最大的一张；扫描件通常一页一图） */
  async function extractPageImage(page) {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const names = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS.paintImageXObject || ops.fnArray[i] === OPS.paintInlineImageXObject) {
        names.push(ops.argsArray[i][0]);
      }
    }
    if (!names.length) throw new OcrError('页面中没有可提取的图像（可能不是扫描件，或使用了不支持的图像编码）');
    let best = null;
    let bestArea = 0;
    for (const name of names) {
      let img = null;
      try { img = page.objs.get(name); } catch (_) { /* 占位未完成 */ }
      if (!img && page.objs.has && page.objs.has(name)) {
        // 未完成占位：等回调
        img = await new Promise((resolve) => {
          try { page.objs.get(name, (v) => resolve(v)); } catch (_) { resolve(null); }
          setTimeout(() => resolve(null), 15000);
        });
      }
      if (!img || !img.data) continue;
      const area = (img.width || 0) * (img.height || 0);
      if (area > bestArea) { bestArea = area; best = img; }
    }
    if (!best) throw new OcrError('页面图像数据未能解码（图像流损坏或编码不受支持）');
    return best;
  }

  /**
   * 识别单个文件。signal = {aborted:boolean}（调用方持有并翻转）。
   * scheduler 由调用方创建并传入（同任务内多文件并发共享）。
   * 返回 shapeFileResult 可用的裸结果 {path,type,ok,pages,text,error,durationMs}
   */
  async function recognizeFile(item, opts) {
    const { signal, scheduler } = opts;
    const t0 = Date.now();
    const out = { path: item.path, type: item.type, ok: false, pages: [], text: '', error: null, durationMs: 0 };

    let buf;
    try {
      const st = fs.statSync(item.path);
      if (st.size > limits.maxImageBytes) throw new OcrError(`文件超过单文件上限 ${Math.round(limits.maxImageBytes / 1024 / 1024)}MB`);
      buf = fs.readFileSync(item.path);
    } catch (e) {
      out.error = e instanceof OcrError ? e.message : `文件读取失败：${String((e && e.message) || e).slice(0, 200)}`;
      out.durationMs = Date.now() - t0;
      return out;
    }

    // PDF：先整体开卷（页数护栏在这里），再逐页
    let doc = null;
    try {
      if (item.type === 'pdf') doc = await openPdf(buf, item.path);
    } catch (e) {
      out.error = e instanceof OcrError ? e.message : `PDF 打开失败：${String((e && e.message) || e).slice(0, 200)}`;
      out.durationMs = Date.now() - t0;
      return out;
    }

    const pageCount = doc ? doc.numPages : 1;
    try {
      for (let pn = 1; pn <= pageCount; pn++) {
        if (signal && signal.aborted) { out.aborted = true; break; }
        const pageMeta = { page: pn, chars: 0, confidence: null, mode: 'ocr', error: null };
        try {
          if (doc) {
            const page = await doc.getPage(pn);
            const tl = await readTextLayer(page);
            pageMeta.chars = tl.chars;
            if (tl.chars >= 30) {
              // 文字版：直接抽取（最快最准）
              pageMeta.mode = 'native';
              pageMeta.confidence = 100;
              out.text += (out.text ? '\n\n' : '') + tl.text;
              out.pages.push(pageMeta);
              continue;
            }
            // 扫描页：提取图像 → PNG
            const img = await extractPageImage(page);
            let rgba = pixel.pdfImageToRgba(img);
            if (!rgba) throw new OcrError(`页面图像编码不受支持（kind=${img && img.kind}）`);
            // 旋转后宽高互换：尺寸必须跟随变换走，否则下游按旧尺寸读像素=整图错乱
            let dims = { w: img.width, h: img.height };
            const rot = pixel.rotationsFor(page.rotate);
            for (let r = 0; r < rot; r++) {
              const r2 = pixel.rotateCw90(rgba, dims.w, dims.h);
              rgba = r2.data;
              dims = { w: r2.width, h: r2.height };
            }
            const clamped = pixel.clampEdge(rgba, dims.w, dims.h, limits.maxImageEdge);
            const png = pixel.rgbaToPng(clamped.data, clamped.width, clamped.height);
            const r = await recognizeBuffer(opts.scheduler, png, `pdf:p${pn}`);
            pageMeta.confidence = Number.isFinite(r.confidence) ? r.confidence : null;
            out.text += (out.text ? '\n\n' : '') + r.text;
            out.pages.push(pageMeta);
          } else {
            // 图片文件：直接交给 tesseract（leptonica 解格式）
            const r = await recognizeBuffer(opts.scheduler, buf, path.basename(item.path));
            pageMeta.confidence = Number.isFinite(r.confidence) ? r.confidence : null;
            out.text = r.text;
            out.pages.push(pageMeta);
          }
        } catch (e) {
          pageMeta.error = e instanceof OcrError ? e.message : `识别异常：${String((e && e.message) || e).slice(0, 200)}`;
          out.pages.push(pageMeta);
        }
      }
      out.ok = out.pages.some((p) => !p.error);
      if (!out.ok) out.error = out.pages[0] && out.pages[0].error ? out.pages[0].error : '全部页面识别失败';
      else if (out.pages.some((p) => p.error)) out.partial = true;
    } finally {
      if (doc) { try { await doc.destroy(); } catch (_) { /* 释放失败不影响结果 */ } }
      out.durationMs = Date.now() - t0;
    }
    return out;
  }

  return {
    installedLangs,
    downloadLang,
    spawnScheduler,
    killScheduler,
    recognizeFile,
    ensureBuiltinCached,
    runningWorkerCount: () => runningWorkers.size,
  };
}

module.exports = { createEngine, OcrError };
