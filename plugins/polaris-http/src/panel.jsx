// src/panel.jsx — Polaris HTTP 面板入口
// 基于 RELAY 架构：SPA_HTML 骨架 + initApi 初始化
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
    <button class="env-sel" id="envSel"><span class="ehex">⬡</span><span id="envName">无环境</span><span class="car">▾</span></button>
    <div class="env-menu" id="envMenu"></div>
  </div>
  <button class="top-act" id="curlImportBtn" title="粘贴 cURL 导入为请求">导入 cURL</button>
  <button class="top-act" id="layoutBtn" title="切换 上下/左右 布局">⇅ 上下</button>
  <button class="top-act" id="proxyBtn" title="跨域代理">代理:关</button>
  <button class="top-act" id="codeGenBtn" title="复制为代码">⌘ 代码</button>
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
      <button class="btn icon ghost" id="aiBtn" title="AI 分析">AI</button>
    </div>

    <div class="split" id="split">
      <div class="req-region">
        <div class="subtabs" id="reqSubtabs">
          <button class="subtab active" data-rt="params">Params</button>
          <button class="subtab" data-rt="headers">Headers</button>
          <button class="subtab" data-rt="body">Body</button>
        </div>
        <div class="pane" id="reqPane"></div>
      </div>

      <div class="divider" id="divider" title="拖动调整大小"></div>

      <div class="res-region">
        <div class="res-status" id="resStatus" style="display:none"></div>
        <div class="subtabs" id="resSubtabs" style="display:none">
          <button class="subtab" data-rv="object">对象</button>
          <button class="subtab" data-rv="table">表格</button>
          <button class="subtab" data-rv="raw">原始</button>
          <button class="subtab" data-rv="preview">预览</button>
          <button class="subtab" data-rv="headers">Headers</button>
        </div>
        <div class="res-tools" id="resTools" style="display:none"></div>
        <div class="pane" id="resPane">
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
  <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span></span>
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

    // 1. 注入 SPA HTML 骨架
    container.innerHTML = SPA_HTML

    // 2. 注入 CSS
    try {
      const style = document.createElement('style')
      style.setAttribute('data-polaris-http', '')
      style.textContent = mainCss
      container.prepend(style)
    } catch (e) {
      console.warn('[Polaris HTTP] CSS injection failed:', e)
    }

    // 3. 设置 DOM 作用域
    setRoot(container)

    // 4. 设置面板模式
    setApiPanelMode(true, 'http://127.0.0.1:9872')

    // 5. 初始化 API 工具（包含所有事件绑定）
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
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg, #16181e)',
        color: 'var(--ink, #d8dae2)',
      }}
    />
  )
}