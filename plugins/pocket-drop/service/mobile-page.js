'use strict';
/**
 * mobile-page.js —— 手机端单页（服务同源直出，零依赖零构建）
 *
 * 手机浏览器直接访问 http://<电脑局域网IP>:9867/?pin=xxx：
 * 上传（多选/拍照即传，XHR 进度）/ 下载 / 预览 / 删除，与桌面面板看同一份投递区。
 * 用户数据一律 textContent 注入，绝不拼 HTML（防 XSS）。
 */

function buildMobilePage(_ctx) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>口袋快传</title>
<style>
  :root {
    --bg: #f5f5f7; --card: #ffffff; --ink: #1c1c1e; --ink2: #6e6e73; --line: #e5e5ea;
    --accent: #0a84ff; --danger: #ff3b30; --ok: #34c759;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #000000; --card: #1c1c1e; --ink: #f2f2f7; --ink2: #98989d; --line: #2c2c2e; }
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif;
    padding: max(12px, env(safe-area-inset-top)) 12px max(20px, env(safe-area-inset-bottom));
  }
  .wrap { max-width: 560px; margin: 0 auto; }
  header { display: flex; align-items: baseline; gap: 8px; padding: 4px 2px 12px; }
  header h1 { font-size: 20px; margin: 0; font-weight: 700; }
  header small { color: var(--ink2); font-size: 12px; }
  .card { background: var(--card); border-radius: 14px; padding: 14px; margin-bottom: 12px; border: 1px solid var(--line); }
  .dropzone {
    border: 2px dashed var(--line); border-radius: 12px; padding: 22px 14px;
    text-align: center; color: var(--ink2); font-size: 14px; cursor: pointer;
  }
  .dropzone:active { border-color: var(--accent); color: var(--accent); }
  .btnrow { display: flex; gap: 8px; margin-top: 10px; }
  button {
    appearance: none; border: 1px solid var(--line); background: var(--card); color: var(--ink);
    border-radius: 10px; padding: 10px 14px; font-size: 14px; min-height: 40px; flex: 1;
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
  button.danger { color: var(--danger); }
  button:disabled { opacity: .5; }
  .item { display: flex; align-items: center; gap: 10px; padding: 10px 2px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: none; }
  .ico { font-size: 20px; width: 32px; text-align: center; flex: none; }
  .meta { flex: 1; min-width: 0; }
  .meta b { display: block; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta small { color: var(--ink2); font-size: 11px; }
  .tag { display: inline-block; font-size: 10px; border-radius: 6px; padding: 1px 6px; margin-left: 4px; vertical-align: 1px; }
  .tag.phone { background: rgba(10,132,255,.15); color: var(--accent); }
  .tag.desktop { background: rgba(52,199,89,.15); color: var(--ok); }
  .tag.ai { background: rgba(255,159,10,.18); color: #ff9f0a; }
  .acts { display: flex; gap: 6px; flex: none; }
  .acts a, .acts button { padding: 7px 10px; min-height: 0; font-size: 12px; flex: none; border-radius: 8px; text-decoration: none; }
  .empty { color: var(--ink2); text-align: center; padding: 26px 0; font-size: 13px; }
  .prog { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-top: 8px; display: none; }
  .prog i { display: block; height: 100%; background: var(--accent); width: 0; transition: width .2s; }
  .toast {
    position: fixed; left: 50%; transform: translateX(-50%); bottom: 24px;
    background: var(--ink); color: var(--bg); font-size: 13px; padding: 10px 16px;
    border-radius: 10px; opacity: 0; transition: opacity .25s; pointer-events: none; max-width: 86vw;
  }
  .toast.show { opacity: .95; }
  .gate { text-align: center; padding-top: 15vh; }
  .gate input {
    font-size: 22px; letter-spacing: 8px; text-align: center; width: 200px;
    padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--ink);
  }
  .gate p { color: var(--ink2); font-size: 13px; }
  h2 { font-size: 13px; color: var(--ink2); font-weight: 600; margin: 18px 2px 8px; }
  .hint { font-size: 11px; color: var(--ink2); margin-top: 8px; line-height: 1.6; }
</style>
</head>
<body>
<div class="wrap">
  <header><h1>⚡ 口袋快传</h1><small id="host"></small></header>

  <div id="gate" class="card gate" style="display:none">
    <p>输入电脑面板上显示的访问 PIN</p>
    <input id="pin" inputmode="numeric" autocomplete="off" placeholder="••••••" maxlength="8">
    <p id="gateErr" style="color:var(--danger);min-height:18px"></p>
    <button class="primary" id="gateGo" style="max-width:200px;width:100%">进入</button>
  </div>

  <div id="main" style="display:none">
    <div class="card">
      <div class="dropzone" id="dz">点按选择文件<br><span style="font-size:11px">可多选 · 拍照可直接用下面的按钮</span></div>
      <div class="btnrow">
        <button id="pick">📁 选择文件</button>
        <button id="cam">📷 拍照上传</button>
      </div>
      <div class="prog" id="prog"><i id="progBar"></i></div>
      <div class="hint" id="limits"></div>
      <input type="file" id="fileInput" multiple style="display:none">
      <input type="file" id="camInput" accept="image/*" capture="environment" style="display:none">
    </div>

    <h2>投递区（<span id="count">0</span>）</h2>
    <div class="card" id="list"><div class="empty">加载中…</div></div>
    <p class="hint">电脑 → 手机的文件在列表里点「下载」；手机上传的文件会出现在电脑面板，交给 AI 处理或直接下载。文件到期自动清理（时长见上方提示）。</p>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s) };
  var PIN = localStorage.getItem('pdrop_pin') || '';
  var TTL = 72;

  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show') }, ms || 2200);
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return Math.round(n) + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'], i = -1, x = n;
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
    return (x >= 100 ? Math.round(x) : x.toFixed(1)) + ' ' + u[i];
  }
  function ttlLeft(expiresAt) {
    var ms = expiresAt - Date.now();
    if (ms <= 0) return '';
    var min = Math.floor(ms / 60000);
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' 小时';
    return Math.floor(h / 24) + ' 天';
  }
  function fromTag(f) {
    if (f === 'phone') return '<i class="tag phone">本机</i>';
    if (f === 'desktop') return '<i class="tag desktop">面板</i>';
    if (f === 'ai') return '<i class="tag ai">AI</i>';
    return '';
  }
  function icoFor(name) {
    var ext = String(name).toLowerCase().split('.').pop();
    if (['png','jpg','jpeg','gif','webp','bmp','svg','heic'].indexOf(ext) >= 0) return '🖼️';
    if (['mp4','mov','webm','avi','mkv'].indexOf(ext) >= 0) return '🎬';
    if (['mp3','wav','ogg','m4a','flac'].indexOf(ext) >= 0) return '🎵';
    if (['pdf'].indexOf(ext) >= 0) return '📕';
    if (['zip','rar','7z','tar','gz'].indexOf(ext) >= 0) return '🗜️';
    if (['doc','docx','xls','xlsx','ppt','pptx','csv'].indexOf(ext) >= 0) return '📄';
    return '📦';
  }

  function api(path, opts) {
    opts = opts || {};
    var url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'pin=' + encodeURIComponent(PIN);
    opts.credentials = 'omit';
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) { enterGate('PIN 已失效，请重新输入'); throw new Error('401'); }
      return res.json().catch(function () { return {} }).then(function (j) { j.__status = res.status; return j });
    });
  }

  function render(info) {
    TTL = info.ttlHours || 72;
    $('#host').textContent = info.hostname || '';
    $('#count').textContent = (info.items || []).length;
    $('#limits').textContent = '单文件上限 ' + info.maxSizeMb + ' MB · ' + TTL + ' 小时后自动清理';
    var list = $('#list');
    if (!info.items || !info.items.length) {
      list.innerHTML = '<div class="empty">投递区是空的<br><span style="font-size:11px">上传的文件会出现在这里，电脑面板同步可见</span></div>';
      return;
    }
    list.innerHTML = '';
    info.items.slice().sort(function (a, b) { return b.at - a.at }).forEach(function (it) {
      var row = document.createElement('div'); row.className = 'item';
      var ico = document.createElement('div'); ico.className = 'ico'; ico.textContent = icoFor(it.name);
      var meta = document.createElement('div'); meta.className = 'meta';
      var b = document.createElement('b'); b.textContent = it.name; b.insertAdjacentHTML('beforeend', fromTag(it.from));
      var small = document.createElement('small');
      small.textContent = fmtBytes(it.size) + ' · 剩 ' + (ttlLeft(it.expiresAt) || '即将清理') + (it.note ? ' · ' + it.note : '');
      meta.appendChild(b); meta.appendChild(small);
      var acts = document.createElement('div'); acts.className = 'acts';
      var prev = document.createElement('a'); prev.href = '/f/' + it.id + '?pin=' + encodeURIComponent(PIN); prev.target = '_blank'; prev.rel = 'noopener'; prev.textContent = '查看';
      var dl = document.createElement('a'); dl.href = '/f/' + it.id + '?pin=' + encodeURIComponent(PIN) + '&dl=1'; dl.textContent = '下载'; dl.setAttribute('download', it.name);
      var del = document.createElement('button'); del.className = 'danger'; del.textContent = '删';
      del.addEventListener('click', function () {
        if (!confirm('删除「' + it.name + '」？')) return;
        api('/f/' + it.id, { method: 'DELETE' }).then(refresh).catch(function (e) { toast('删除失败：' + e.message) });
      });
      acts.appendChild(prev); acts.appendChild(dl); acts.appendChild(del);
      row.appendChild(ico); row.appendChild(meta); row.appendChild(acts);
      list.appendChild(row);
    });
  }

  function refresh() {
    return api('/api/info').then(function (info) {
      $('#gate').style.display = 'none';
      $('#main').style.display = '';
      if (PIN) localStorage.setItem('pdrop_pin', PIN);
      render(info);
    }).catch(function (e) { if (e.message !== '401') toast('刷新失败：' + e.message) });
  }

  function enterGate(err) {
    $('#main').style.display = 'none';
    $('#gate').style.display = '';
    $('#gateErr').textContent = err || '';
  }

  // ── 上传队列（XHR 带进度，串行防挤爆移动网络）────────────────────────────
  var queue = [], uploading = false;
  function enqueue(files) {
    for (var i = 0; i < files.length; i++) queue.push(files[i]);
    pump();
  }
  function pump() {
    if (uploading || !queue.length) { if (!queue.length) setTimeout(refresh, 400); return; }
    uploading = true;
    var file = queue.shift();
    var prog = $('#prog'), bar = $('#progBar');
    prog.style.display = 'block'; bar.style.width = '0%';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/u?pin=' + encodeURIComponent(PIN) + '&name=' + encodeURIComponent(file.name || '未命名文件'));
    xhr.upload.onprogress = function (ev) {
      if (ev.lengthComputable) bar.style.width = Math.round(ev.loaded / ev.total * 100) + '%';
    };
    xhr.onload = function () {
      uploading = false; prog.style.display = 'none';
      var j = {}; try { j = JSON.parse(xhr.responseText) } catch (_) {}
      if (xhr.status === 200 && j.ok) toast('已上传 ' + (j.item && j.item.name || file.name));
      else toast('上传失败：' + (j.error || ('HTTP ' + xhr.status)), 3500);
      pump();
    };
    xhr.onerror = function () { uploading = false; prog.style.display = 'none'; toast('上传失败：网络错误', 3500); pump(); };
    xhr.send(file);
  }

  $('#dz').addEventListener('click', function () { $('#fileInput').click() });
  $('#pick').addEventListener('click', function () { $('#fileInput').click() });
  $('#cam').addEventListener('click', function () { $('#camInput').click() });
  $('#fileInput').addEventListener('change', function () { enqueue(this.files); this.value = '' });
  $('#camInput').addEventListener('change', function () { enqueue(this.files); this.value = '' });
  $('#gateGo').addEventListener('click', tryPin);
  $('#pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPin() });

  function tryPin() {
    var v = $('#pin').value.replace(/\\D/g, '');
    if (!v) { $('#gateErr').textContent = '请输入 PIN'; return; }
    PIN = v;
    refresh().then(function () {
      if ($('#gate').style.display === 'none') toast('已连接');
    });
  }

  if (PIN) refresh(); else enterGate('');
  setInterval(refresh, 5000);
})();
</script>
</body>
</html>`;
}

module.exports = { buildMobilePage };
