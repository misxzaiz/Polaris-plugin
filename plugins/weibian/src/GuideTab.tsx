/**
 * 指南 Tab：检索语法 / AI 用法 / 已知限制 / 隐私口径（静态内容）
 */
export default function GuideTab() {
  return (
    <div>
      <div className="wb-sec"><i className="wb-bar" />它解决什么</div>
      <div className="wb-card"><div className="wb-card-b wb-sub" style={{ fontSize: 12 }}>
        把散落在本地文件夹里的 md / txt / PDF / Word / 网页 / 代码变成一条命令可搜、AI 可引用的全文索引。
        配置一次目录，之后全自动：新文件进来自动收录、改动自动跟进，<b>零日常录入</b>。
        手机打开 Polaris 也能搜家里电脑的文档。
      </div></div>

      <div className="wb-sec"><i className="wb-bar" />检索语法</div>
      <div className="wb-card"><div className="wb-card-b">
        <div className="wb-code">缓存 假象</div>
        <div className="wb-sub">多词按相关性排序（同时含两词的排最前；中文支持单字与词组）。</div>
        <div className="wb-code">ext:pdf 年度 预算</div>
        <div className="wb-sub">只搜 PDF。类别名：ext:text（文档）/ ext:code（代码）/ ext:docx / ext:html，或精确扩展名 ext:md。</div>
        <div className="wb-code">dir:plans 架构</div>
        <div className="wb-sub">只搜路径含 plans 目录的文件（dir:可嵌多层，如 dir:space/base）。</div>
      </div></div>

      <div className="wb-sec"><i className="wb-bar" />在 AI 对话里用</div>
      <div className="wb-card"><div className="wb-card-b">
        <div className="wb-sub">文档检索给 AI 提供了 4 个工具，直接用自然语言即可：</div>
        <div className="wb-code">「帮我在文档里找关于缓存策略的论述」</div>
        <div className="wb-code">「我之前写过一份两总线架构的 spec，找出来看看」</div>
        <div className="wb-sub">
          AI 会先 <b>weibian_search</b> 检索拿到文件与片段，再用 <b>weibian_read</b> 读取原文上下文。
          也可让 AI 查 <b>weibian_status</b>（索引状态）或 <b>weibian_reindex</b>（重建）。
        </div>
      </div></div>

      <div className="wb-sec"><i className="wb-bar" />收录范围与格式</div>
      <div className="wb-card"><div className="wb-card-b wb-sub" style={{ fontSize: 12 }}>
        <b>文本</b>：md / txt / csv / json / yaml / xml / srt / tex 等<br />
        <b>代码</b>：js / ts / py / rs / go / java / c / cpp / sql / sh 等 30+ 种<br />
        <b>PDF</b>：提取文字层（扫描件无文字层，会跳过并计数——不做 OCR）<br />
        <b>Word</b>：docx 正文（旧版 .doc 不支持）<br />
        <b>网页</b>：html / htm（剥离脚本与样式后取正文）<br />
        默认跳过隐藏目录与 node_modules / .git / target / dist / build / AppData 等；单文件上限默认 20MB；文档总量默认上限 5000。
      </div></div>

      <div className="wb-sec"><i className="wb-bar" />已知限制（如实）</div>
      <div className="wb-card"><div className="wb-card-b wb-sub" style={{ fontSize: 12 }}>
        · 单个英文字母/数字（如「a」「5」）不参与检索（词元 ≥2 起）<br />
        · 中英混排（如「React入门」）在语言交界处不建立相邻索引，跨语检索请分开给词<br />
        · Word 公式、表格会按线性文本处理，复杂排版可能丢顺序<br />
        · OneDrive / 网盘占位文件在扫描时会触发按需下载（限速 25 文件/轮，介意请先设为「始终保留在此设备」）<br />
        · 手机端检索要求手机与电脑在同一局域网，且电脑端 Polaris 正在运行
      </div></div>

      <div className="wb-sec"><i className="wb-bar" />隐私与安全</div>
      <div className="wb-card"><div className="wb-card-b wb-sub" style={{ fontSize: 12 }}>
        · 只索引你显式添加的目录；服务对文件<b>只读</b>，永不修改/删除/移动<br />
        · 全程<b>零外网请求</b>（本插件未申请 network 权限）；索引明文存本机数据根，与你的文件同等安全边界<br />
        · 「读取原文」严格限制在索引目录内（防目录穿越与符号链接逃逸）<br />
        · 服务端口仅监听本机与局域网，所有业务端点必须携带 token（自动下发给面板与 AI）
      </div></div>
    </div>
  )
}
