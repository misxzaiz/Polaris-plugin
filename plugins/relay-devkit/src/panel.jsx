// src/panel.jsx — Polaris 面板包装组件。
// 将 RELAY DevKit SPA 嵌入 Polaris 侧栏面板。
// React 由 Polaris 宿主提供（external），SPA 模块全部打包进来。
import { useEffect, useRef } from 'react'
import mainCss from '../styles/main.css'  // esbuild loader: text
import { setRoot } from './core/dom.js'
import { registerView, resetRouter, setPanelMode, startRouter } from './core/router.js'
import { configureViewHost } from './core/json-view.js'
import { initApi, persist, renderRespBody, setApiPanelMode } from './tools/api.js'
import { initJsonTool } from './tools/json.js'
import { initSqlTool } from './tools/sql.js'
import { initTimeTool } from './tools/time.js'
import { initDbTool, setDbPanelMode } from './tools/db.js'
import { initAiTool } from './tools/ai.js'

// SPA HTML 骨架（来自 index.html <body> 内容）
const SPA_HTML = `
<nav class="navbar" id="navbar">
  <button class="nav-brand" id="navBrand"><span class="dot"></span>RELAY<small>DEVKIT</small></button>
  <div class="nav-tabs" id="navTabs"></div>
  <div class="nav-sp"></div>
  <span class="nav-hint">零依赖 · 本地开发者工具箱</span>
</nav>
<div id="view">
  <div class="view" id="viewHome"></div>
  <div class="view app" id="viewApi">
  <header class="topbar">
    <button class="icon-btn" id="toggleSide" title="折叠/展开侧栏">☰</button>
    <div class="brand"><span class="dot"></span>API<small>请求客户端</small></div>
    <div class="spacer"></div>
    <div class="env-wrap">
      <button class="env-sel" id="envSel"><span class="ehex">⬡</span><span id="envName">无环境</span><span class="car">▼</span></button>
      <div class="env-menu" id="envMenu"></div>
    </div>
    <button class="top-act" id="curlImportBtn" title="粘贴 cURL 导入为请求">⤓ 导入 cURL</button>
    <button class="top-act" id="layoutBtn" title="切换 上下/左右 布局">⇄ 左右</button>
    <button class="top-act" id="proxyBtn" title="经本地后端 /__proxy 转发，绕过浏览器 CORS 与混合内容限制（需运行 server.py）">🛡 代理: 关</button>
    <div class="hint"><span><kbd>⌘/Ctrl</kbd> <kbd>↵</kbd> 发送</span><span><kbd>⌘/Ctrl</kbd> <kbd>S</kbd> 保存</span></div>
  </header>

  <div class="main" id="main">
    <aside class="side">
      <div class="side-head">
        <span class="t">集合 · COLLECTIONS</span>
        <button class="mini-btn" id="newGroup" title="新建分组">＋</button>
        <button class="mini-btn" id="importBtn" title="导入集合 JSON">↧</button>
        <button class="mini-btn" id="exportBtn" title="导出集合 JSON">↥</button>
      </div>
      <div class="side-search"><input id="search" placeholder="🔍  搜索已保存的请求…" /></div>
      <div class="tree" id="tree"></div>
    </aside>

    <section class="work">
      <div class="tabbar" id="tabbar"></div>
      <div class="reqbar">
        <div class="method-wrap">
          <button class="method-sel" id="methodSel"><span id="methodLabel">GET</span><span class="car">▼</span></button>
          <div class="method-menu" id="methodMenu"></div>
        </div>
        <div class="url-wrap">
          <input class="url-input" id="url" placeholder="请求 URL，支持 {{baseUrl}}/path、{{变量}} 占位" spellcheck="false" />
          <div class="url-resolved" id="urlResolved"></div>
        </div>
        <button class="btn primary" id="sendBtn">发送 <span class="k">⌘↵</span></button>
        <button class="btn" id="saveBtn">保存</button>
        <button class="btn icon ghost" id="curlBtn" title="复制为 cURL">cURL</button>
      </div>

      <div class="split" id="split">
        <div class="req-region">
          <div class="subtabs" id="reqSubtabs">
            <button class="subtab active" data-rt="params">Params<span class="badge" id="bParams"></span></button>
            <button class="subtab" data-rt="headers">Headers<span class="badge" id="bHeaders"></span></button>
            <button class="subtab" data-rt="body">Body<span class="badge" id="bBody"></span></button>
          </div>
          <div class="pane" id="reqPane"></div>
        </div>

        <div class="divider" id="divider" title="拖动调整大小"></div>

        <div class="res-region">
          <div class="res-status" id="resStatus" style="display:none"></div>
          <div class="subtabs" id="resSubtabs" style="display:none">
            <button class="subtab" data-rv="table">表格</button>
            <button class="subtab" data-rv="object">对象</button>
            <button class="subtab" data-rv="raw">原始</button>
            <button class="subtab" data-rv="preview">预览</button>
            <button class="subtab" data-rv="headers">Headers<span class="badge" id="bResH"></span></button>
            <span class="sp"></span>
            <button class="tool" id="prettyBtn" title="美化单元格：图片缩略图 + 时间戳转可读时间（再次点击显示原始值）">✦ 美化</button>
            <button class="tool" id="treeExpand" title="展开全部节点">⊞ 展开</button>
            <button class="tool" id="treeCollapse" title="折叠全部节点">⊟ 折叠</button>
            <button class="tool" id="wrapBtn" title="切换自动换行">⮐ 换行</button>
            <button class="tool" id="copyResBtn" title="复制当前数据">⧉ 复制</button>
            <button class="tool" id="dlBtn" title="下载响应体">↓ 下载</button>
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
                · <b>查数据</b>：响应区「路径」下钻、「过滤」筛选，多视图切换<br>
                · <b>跨域</b>：顶栏「🛡 代理」开启后经本地后端转发，绕过 CORS / 混合内容
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <footer class="statusbar">
    <span class="msg" id="statusMsg">就绪 · 纯前端运行，跨域请求受浏览器 CORS 策略限制</span>
    <span class="seg-r"><span>TABS <b id="stTabs">0</b></span><span>SAVED <b id="stSaved">0</b></span><span>:9860</span></span>
  </footer>
  </div>
  <div class="view" id="viewJson"></div>
  <div class="view" id="viewSql"></div>
  <div class="view" id="viewTime"></div>
  <div class="view" id="viewDb"></div>
  <div class="view" id="viewAi"></div>
</div>
<input type="file" id="fileInput" accept="application/json,.json" style="display:none" />
<div class="modal-bg" id="modalBg"></div>
<div class="toast" id="toast"></div>
<div class="cell-tip" id="cellTip"></div>
<div id="aiFloatHost"></div>
`

export default function RelayDevkitPanel({ pluginId, onSendToChat }) {
  const containerRef = useRef(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || initializedRef.current) return

    // 复位全局路由表，避免热更新或 StrictMode 下二次挂载时重复注册视图
    resetRouter()

    // 1. 注入 SPA HTML 骨架
    container.innerHTML = SPA_HTML

    // 2. 注入 CSS（esbuild 将 CSS 文件作为文本导入）
    try {
      const style = document.createElement('style')
      style.setAttribute('data-relay-devkit', '')
      style.textContent = mainCss
      container.prepend(style)
    } catch (e) {
      // CSS 注入失败不阻塞功能
      console.warn('[RELAY DevKit] CSS injection failed:', e)
    }

    // 3. 设置 DOM 作用域
    setRoot(container)

    // 4. 设置面板模式（不用 location.hash）
    setPanelMode(true)

    // 5. 配置 JSON 视图回调
    configureViewHost({ persist, rerender: renderRespBody })

    // 6. 注册视图（与 main.js 相同的注册表）
    registerView({ id: 'home', label: '首页', icon: '⌂' })
    registerView({
      id: 'api', label: 'API 请求', icon: '⇅',
      card: { name: 'API 请求', icon: '⇅', accent: 'var(--brand)', desc: '多 tab、环境变量、cURL 导入、跨域代理；响应支持表格 / 对象树 / 路径下钻与筛选。' }
    })
    registerView({
      id: 'json', label: 'JSON', icon: '{ }', init: initJsonTool,
      card: { name: 'JSON 工具', icon: '{ }', accent: 'var(--m-post)', desc: '粘贴即用：格式化 / 压缩 / 校验 / 转义；对象树、表格、路径下钻、字段筛选，识别图片与时间戳。' }
    })
    registerView({
      id: 'sql', label: 'SQL', icon: '≡', init: initSqlTool,
      card: { name: 'SQL 模板填充', icon: '≡', accent: 'var(--m-put)', desc: '预编译 ? + 参数还原为可执行 SQL；自动判断类型、转义引号；支持 MyBatis 日志 Preparing/Parameters 解析。' }
    })
    registerView({
      id: 'time', label: '时间戳', icon: '◷', init: initTimeTool,
      card: { name: '时间戳转换', icon: '◷', accent: 'var(--m-patch)', desc: '秒 / 毫秒 / 微秒自动识别，epoch ↔ 本地 / UTC / ISO / 相对时间，双向互转，一键复制。' }
    })
    registerView({
      id: 'db', label: '数据库', icon: '⛁', init: initDbTool,
      card: { name: '数据库', icon: '⛁', accent: '#2dd4bf', desc: 'MySQL（经后端桥接）与 Supabase（浏览器原生 REST）统一一处；表浏览、SQL/过滤查询、全 CRUD 走预览-确认-执行。' }
    })
    registerView({
      id: 'ai', label: 'AI', icon: '✦', init: initAiTool,
      card: { name: 'AI 助手', icon: '✦', accent: 'var(--m-patch)', desc: '接入 OpenAI 协议 AI，分析 API 错误、优化 SQL、生成查询，浮窗随时唤出。' }
    })

    // 7. 设置面板模式（代理自动开启，指向本地中继后端）
    setApiPanelMode(true)
    setDbPanelMode(true)

    // 8. 初始化 API 工具 + 启动路由（面板模式下不初始化 AI 浮窗，避免溢出覆盖宿主 UI）
    initApi()
    startRouter()

    initializedRef.current = true

    // 清理函数
    return () => {
      // 面板卸载时清理（SPA 没有统一的 destroy，清空容器即可）
      container.innerHTML = ''
      setRoot(document)
      resetRouter()
      initializedRef.current = false
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relay-devkit-panel"
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
