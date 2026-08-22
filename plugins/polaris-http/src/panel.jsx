// src/panel.jsx — Polaris HTTP 面板入口（v2 原型风格）
import { useEffect, useRef } from 'react'
import mainCss from './styles/main.css'
import { setRoot } from './core/dom.js'
import { initApi, setApiPanelMode } from './tools/api.js'

const SPA_HTML = `
<header class="topbar">
  <div class="brand"><span class="dot"></span>HTTP<small>CLIENT</small></div>
  <div class="tabbar" id="tabbar"></div>
  <div class="spacer"></div>
  <div class="env-wrap">
    <button class="env-sel" id="envSel"><span class="dot"></span><span id="envName">无环境</span><span class="car">▾</span></button>
    <div class="env-menu" id="envMenu"></div>
  </div>
  <button class="top-act" id="curlImportBtn" title="粘贴 cURL 导入为请求">导入 cURL</button>
  <button class="top-act" id="layoutBtn" title="切换 上下/左右 布局">⇅ 上下</button>
  <button class="top-act" id="proxyBtn" title="跨域代理">代理:关</button>
</header>

<div class="main" id="main">
  <aside class="side">
    <div class="side-head">
      <span class="t">集合 · COLLECTIONS</span>
      <button class="mini-btn" id="saveBtn" title="保存当前请求">保存</button>
      <button class="mini-btn" id="newGroup" title="新建分组">＋</button>
    </div>
    <div class="side-search"><input id="search" placeholder="搜索请求…" /></div>
    <div class="tree" id="tree"></div>
  </aside>

  <section class="work">
    <!-- 模式切换栏 + 服务器选择器 -->
    <div class="mode-bar" id="modeBar">
      <button class="mode-btn active" data-mode="http">通用 HTTP 请求</button>
      <button class="mode-btn" data-mode="custom">定制接口模板</button>
      <span class="sp"></span>
      <span class="mode-lbl">服务器:</span>
      <select class="mode-select" id="serverSelect" onchange="window.__onServerChange(this)">
        <option value="">无</option>
      </select>
      <div class="server-badge" id="serverBadge" style="display:none">
        <span id="serverBadgeText"></span>
        <button class="btn icon" style="height:20px;font-size:9px;padding:0 6px" onclick="window.__replaceServerUrl()">替换</button>
      </div>
    </div>

    <!-- 编辑区 -->
    <div class="reqbar">
      <div class="method-wrap">
        <button class="method-sel" id="methodSel"><span id="methodLabel">GET</span><span class="car">▾</span></button>
        <div class="method-menu" id="methodMenu"></div>
      </div>
      <div class="url-wrap">
        <input class="url-input" id="url" placeholder="请求 URL，支持 {{baseUrl}}/path、{{变量}} 占位" spellcheck="false" />
        <div class="url-resolved" id="urlResolved"></div>
      </div>
      <button class="btn primary" id="sendBtn">发送 <span class="k">⌘↵</span></button>
      <button class="btn icon ghost" id="curlBtn" title="复制为 cURL">cURL</button>
      <button class="btn icon ghost" id="codeGenBtn" title="代码生成">⌘</button>
      <button class="btn icon ghost" id="aiBtn" title="AI 分析">AI</button>
    </div>

    <!-- 定制模板面板 -->
    <div class="custom-panel" id="customPanel" style="display:none">
      <div class="custom-bar">
        <span class="mode-lbl">选择模板:</span>
        <select class="mode-select" id="templateSelect" onchange="window.__onTemplateSelect(this)">
          <option value="">请选择...</option>
        </select>
        <button class="top-act" style="height:22px;font-size:10px" onclick="window.__saveTemplate()">保存当前</button>
      </div>
      <div class="template-form" id="templateForm" style="display:none">
        <div class="tf-title">接口字段</div>
        <div class="tf-grid" id="templateFields"></div>
      </div>
      <div class="custom-hint" id="customHint" style="display:none">📋 当前为定制接口模式，表单修改自动同步到 Body</div>
    </div>

    <!-- 代码生成内联面板 -->
    <div class="codegen-inline" id="codeGenPanel" style="display:none">
      <div class="codegen-hd">
        <span>代码生成</span>
        <span class="sp"></span>
        <div class="codegen-langs">
          <button class="lang-btn active" data-lang="curl">cURL</button>
          <button class="lang-btn" data-lang="python">Python</button>
          <button class="lang-btn" data-lang="js">JS</button>
          <button class="lang-btn" data-lang="go">Go</button>
          <button class="lang-btn" data-lang="rust">Rust</button>
        </div>
      </div>
      <div class="codegen-bd">
        <pre id="codeOutput">curl -X GET 'https://api.example.com'</pre>
        <button class="codegen-copy" onclick="window.__copyCode()">复制</button>
      </div>
    </div>

    <div class="split" id="split">
      <div class="req-region">
        <div class="subtabs" id="reqSubtabs">
          <button class="subtab active" data-rt="params">Params</button>
          <button class="subtab" data-rt="headers">Headers</button>
          <button class="subtab" data-rt="body">Body</button>
          <button class="subtab" data-rt="auth">Auth</button>
          <button class="subtab" data-rt="global">全局H</button>
        </div>
        <div class="pane" id="reqPane"></div>
      </div>

      <div class="divider" id="divider" title="拖动调整大小"></div>

      <div class="res-region" id="resRegion">
        <!-- 响应状态 -->
        <div class="res-status" id="resStatus" style="display:none"></div>
        <!-- 响应双视图标签 -->
        <div class="res-tabs" id="resTabs" style="display:none">
          <button class="res-tab active" data-rt="data">业务数据</button>
          <button class="res-tab" data-rt="full">完整响应</button>
          <div class="res-tab-acts">
            <span class="mode-lbl">字体:</span>
            <select class="font-sel" id="resFontSel" onchange="window.__changeFont(this.value)">
              <option value="12">12</option><option value="13" selected>13</option><option value="14">14</option><option value="16">16</option><option value="18">18</option>
            </select>
            <button class="tbtn" onclick="window.__expandLevel(2)">展开2层</button>
            <button class="tbtn" onclick="window.__expandLevel(3)">展开3层</button>
            <button class="tbtn" onclick="window.__collapseAll()">折叠</button>
            <button class="tbtn" onclick="window.__toggleFullscreen()">全屏</button>
          </div>
        </div>
        <!-- 响应视图切换 -->
        <div class="res-toolbar" id="resTools" style="display:none">
          <div class="res-views" id="resViews">
            <button class="rv" data-rv="object">对象</button>
            <button class="rv" data-rv="table">表格</button>
            <button class="rv" data-rv="raw">原始</button>
            <button class="rv" data-rv="headers">Headers</button>
          </div>
          <span class="sp"></span>
          <input class="path-input" placeholder="路径 data.items" id="resPathInput" oninput="window.__setPath(this.value)" />
          <input class="filter-input" placeholder="过滤 name:值" id="resFilterInput" oninput="window.__setFilter(this.value)" />
          <button class="tbtn" id="prettyBtn" onclick="window.__togglePretty()">美化</button>
        </div>
        <div class="pane" id="resPane" style="font-size:13px">
          <div class="res-idle">
            <div class="big">准备就绪</div>
            输入 URL 点「发送」，或从左侧集合载入一个请求。
            <div class="tips">
              · <b>多 tab</b>：顶部 ＋ 新建，双击标签可重命名<br>
              · <b>环境变量</b>：右上角切换环境，URL 里用 <b>{{baseUrl}}</b><br>
              · <b>导入 cURL</b>：右上角粘贴 curl 命令一键解析<br>
              · <b>跨域</b>：顶栏「代理」开启后经本地后端转发
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<footer class="statusbar">
  <span class="msg" id="statusMsg">就绪</span>
  <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span><span id="layoutStatus">布局: 左右</span><span id="proxyStatus">代理: 关</span></span>
</footer>

<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="ctx-menu" id="ctxMenu"></div>
<div class="cell-tip" id="cellTip"></div>
`

export default function PolarisHttpPanel({ pluginId, onSendToChat }) {
  const containerRef = useRef(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initializedRef.current) return

    container.innerHTML = SPA_HTML

    try {
      const style = document.createElement('style')
      style.setAttribute('data-polaris-http', '')
      style.textContent = mainCss
      container.prepend(style)
    } catch (e) {
      console.warn('[Polaris HTTP] CSS injection failed:', e)
    }

    setRoot(container)
    setApiPanelMode(true, 'http://127.0.0.1:9872')
    initApi({ onSendToChat })

    initializedRef.current = true
    return () => {
      container.innerHTML = ''
      setRoot(document)
      initializedRef.current = false
    }
  }, [onSendToChat])

  return (
    <div
      ref={containerRef}
      className="polaris-http-panel"
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg, #16181e)',
        color: 'var(--ink, #d8dae2)',
      }}
    />
  )
}