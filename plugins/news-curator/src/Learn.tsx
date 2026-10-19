/**
 * 学习 Tab：双线骨架（专业成长 Java+AI / 通识漫游）
 * P0 为骨架：课程体系静态展示 + 今日课（AI 每日生成内容）+ 本地测验 + AI 教练入口
 */
import { useState, useEffect } from 'react'
import { loadDaily, today, sendToChat, Daily } from './model'

// 专业线课程体系（L1-L4 骨架，进度由 AI 后续回写）
const PRO_COURSE = [
  {
    level: 'L1', tag: 'Java 核心功底', color: '#3FB950', status: '6/6 完成', units: [
      { no: '✓', t: 'JVM 内存模型与垃圾回收', done: true },
      { no: '✓', t: '并发编程：从 synchronized 到 AQS', done: true },
      { no: '✓', t: '集合源码与性能陷阱', done: true },
      { no: '✓', t: 'IO/NIO/网络编程', done: true },
      { no: '✓', t: '设计模式与重构', done: true },
    ],
  },
  {
    level: 'L2', tag: 'Java 并发进阶（进行中）', color: '#58A6FF', status: '2/4 · 今日课', units: [
      { no: '✓', t: 'Java 17/21 新特性速览', done: true },
      { no: '3', t: '虚拟线程 Virtual Threads', now: true },
      { no: '4', t: '并发容器与线程池调优', next: true },
    ],
  },
  {
    level: 'L3', tag: '工程化与微服务', color: '#BC8CFF', status: '未开始', units: [
      { no: '1', t: 'Spring Boot 3 实战', next: true },
      { no: '2', t: '云原生：容器/K8s/弹性', next: true },
    ],
  },
  {
    level: 'L4', tag: 'AI 工程能力（右腿）', color: '#FF9E64', status: '与 L1-L3 并行', units: [
      { no: '1', t: '大模型原理与 Prompt 工程', next: true },
      { no: '2', t: 'MCP 协议与工具开发', next: true },
      { no: '3', t: 'Java 调用大模型：Spring AI / LangChain4j', next: true },
      { no: '4', t: 'Agent 应用与 RAG 实战', next: true },
    ],
  },
]

const GEN_TOPICS = [
  { icon: '📜', t: '世界历史', s: '✓ 已读', done: true },
  { icon: '🔬', t: '科技通史', s: '✓ 已读', done: true },
  { icon: '💰', t: '宏观经济', s: '本周 · 3/5', now: true },
  { icon: '🧠', t: '心理学', s: '下周' },
  { icon: '❤️', t: '健康常识', s: '待开始' },
  { icon: '🗺', t: '地理人文', s: '待开始' },
  { icon: '💡', t: '思维方式', s: '待开始' },
  { icon: '⚖️', t: '法律常识', s: '待开始' },
]

export default function Learn() {
  const [tab, setTab] = useState<'pro' | 'gen'>('pro')
  const [daily, setDaily] = useState<Daily | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    loadDaily(today()).then(setDaily).catch(() => {})
  }, [])

  const learnSec = daily?.sections?.find((s) => s.type === 'learn')
  const aiAsk = (q: string) => { sendToChat(q); setToast(`已发送：${q}`); setTimeout(() => setToast(null), 1800) }

  return (
    <div className="nc-page">
      <div className="nc-top">
        <div className="nc-logo" style={{ background: 'linear-gradient(135deg,#BC8CFF,#58A6FF)' }}>🎓</div>
        <div className="nc-tt"><b>学习 · 双线并行</b><small>专业成长 + 通识漫游</small></div>
      </div>

      <div className="nc-subtab">
        <button className={`nc-st ${tab === 'pro' ? 'on' : ''}`} onClick={() => setTab('pro')}>☕ 专业成长 · Java+AI</button>
        <button className={`nc-st ${tab === 'gen' ? 'on' : ''}`} onClick={() => setTab('gen')}>🌍 通识漫游</button>
      </div>

      {tab === 'pro' && (
        <>
          {/* 专业线总览 */}
          <div className="nc-line" style={{ margin: '4px 16px 10px' }}>
            <div className="nc-line-h">
              <span className="nc-lic" style={{ background: 'linear-gradient(135deg,#1F6FEB,#3F8CFF)' }}>☕</span>
              <div className="nc-line-t"><b>专业成长 · Java 开发工程师（结合 AI）</b><small>计划 24 周 · 双轮驱动 · 每天 40 分钟</small></div>
              <span className="nc-pct" style={{ color: 'var(--dim, #5C6678)', fontSize: 11 }}>33%</span>
            </div>
            <div className="nc-line-track"><i style={{ width: '33%' }} /></div>
            <div className="nc-line-d">左腿=Java 硬功（JVM/并发/架构）· 右腿=AI 工程（大模型/MCP/Agent）· AI 教练随问随答 + 语音听讲</div>
          </div>

          {/* 课程体系 */}
          <div className="nc-sec"><span className="nc-bar" style={{ background: 'linear-gradient(180deg,#1F6FEB,#58A6FF)' }} />课程体系 · 四阶段</div>
          <div className="nc-feed">
            {PRO_COURSE.map((lv) => (
              <div key={lv.level} className="nc-lv">
                <div className="nc-lv-h">
                  <span className="nc-lv-tag" style={{ background: `${lv.color}22`, color: lv.color }}>{lv.level}</span>
                  <b>{lv.tag}</b>
                  <span className="nc-lv-st">{lv.status}</span>
                </div>
                {lv.units.map((u, i) => (
                  <div key={i} className={`nc-unit ${u.done ? 'done' : ''} ${u.now ? 'now' : ''} ${u.next ? 'next' : ''}`}>
                    <span className="nc-uno">{u.no}</span>
                    <span className="nc-uti"><b>{u.t}</b></span>
                    {u.now && <button className="nc-btn sm" onClick={() => aiAsk(`给我讲今天的课「${u.t}」，结合我的 Java 背景，30 分钟学完`)}>今日课</button>}
                    {u.done && <span className="nc-udur">已学</span>}
                    {u.next && <span className="nc-udur">—</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 今日课（AI 生成内容） */}
          <div className="nc-sec"><span className="nc-bar" style={{ background: 'linear-gradient(180deg,#1F6FEB,#58A6FF)' }} />今日课 · 虚拟线程 Virtual Threads</div>
          <div className="nc-feed">
            {[
              { n: '1', t: '为什么需要：线程很贵，请求很多', s: '6 分钟 · 配对比图', b: '传统「一线程一请求」模型下，每个线程约 1MB 栈内存，10 万并发就吃不消。虚拟线程把「平台线程」与「任务」解耦——一个平台线程可承载上百万虚拟线程，内存占用降低 2 个数量级。' },
              { n: '2', t: '怎么用：静态工厂 + 任务 API', s: '代码示例', b: 'Executors.newVirtualThreadPerTaskExecutor() 提交十万任务，传统平台线程直接爆炸。' },
              { n: '3', t: '踩坑：别在虚拟线程里做阻塞式同步', s: '5 分钟 · AI 教练重点', b: 'synchronized 阻塞会 pin 住载体线程；应改用 ReentrantLock / 结构化并发（StructuredTaskScope）。' },
            ].map((c) => (
              <div key={c.n} className="nc-lesson">
                <div className="nc-lesson-h">
                  <span className="nc-lesson-n">{c.n}</span>
                  <div className="nc-lesson-t"><b>{c.t}</b><small>{c.s}</small></div>
                  <button className="nc-spk" onClick={() => aiAsk(`把「${c.t}」讲给我听，5 分钟`)}>▶ 听讲</button>
                </div>
                <div className="nc-lesson-b">{c.b}</div>
              </div>
            ))}
            <div className="nc-coach">
              <div className="nc-coach-h"><span className="nc-coach-ic">🤖</span>AI 教练 · 本课随问随答</div>
              <p>针对本课你可以继续深挖，AI 会结合你的 Java 背景分层解答，并对比 Spring Boot 里怎么用。</p>
              <div className="nc-qrow">
                <span onClick={() => aiAsk('解释虚拟线程与平台线程的 pinning 机制')}>为什么 synchronized 会 pin 住虚拟线程？</span>
                <span onClick={() => aiAsk('Spring Boot 3.2 怎么开虚拟线程？')}>Spring Boot 3.2 怎么开？</span>
                <span onClick={() => aiAsk('出一道虚拟线程面试题考我')}>出 1 道面试题</span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'gen' && (
        <>
          {/* 通识线总览 */}
          <div className="nc-line" style={{ margin: '4px 16px 10px', borderColor: 'rgba(188,140,255,.35)' }}>
            <div className="nc-line-h">
              <span className="nc-lic" style={{ background: 'linear-gradient(135deg,#BC8CFF,#9B6CFF)' }}>🌍</span>
              <div className="nc-line-t"><b>通识漫游 · 广面知识</b><small>24 个主题轮换 · 每天 20 分钟</small></div>
              <span className="nc-pct" style={{ color: '#BC8CFF', fontSize: 11 }}>29%</span>
            </div>
            <div className="nc-line-track"><i style={{ width: '29%', background: 'linear-gradient(90deg,#BC8CFF,#58A6FF)' }} /></div>
          </div>

          <div className="nc-sec"><span className="nc-bar" style={{ background: 'linear-gradient(180deg,#BC8CFF,#58A6FF)' }} />主题地图</div>
          <div className="nc-topic-grid">
            {GEN_TOPICS.map((t) => (
              <div key={t.t} className={`nc-topic ${t.done ? 'done' : ''} ${t.now ? 'now' : ''}`} onClick={() => aiAsk(`今天通识漫游学「${t.t}」，结合今天的时事讲 20 分钟`)}>
                <span className="nc-tico">{t.icon}</span>
                <b>{t.t}</b>
                <small>{t.s}</small>
              </div>
            ))}
          </div>

          {/* 今日通识课（AI 生成，与今日时事强关联） */}
          <div className="nc-sec"><span className="nc-bar" style={{ background: 'linear-gradient(180deg,#BC8CFF,#58A6FF)' }} />今日通识 · 「利率与你的钱」<span className="nc-hint">关联今日时事</span></div>
          <div className="nc-feed">
            {[
              { n: '1', t: '为什么银行突然抢长期存款', s: '6 分钟', b: '存贷款利差收窄 + 利率下行预期 → 银行想锁住长期低成本负债。看懂一条时事 = 掌握一个宏观概念。' },
              { n: '2', t: '利率下行对普通人意味着什么', s: '6 分钟', b: '存款收益变薄 → 钱流向债基/股市/黄金；房贷 LPR 与存款利率联动。你的基金板块正好给了活案例。' },
              { n: '3', t: '3 个问题自查是否听懂', s: '4 分钟 · AI 出题', b: '① 为什么利差收窄银行会抢存款？② 利率下行谁受益谁受损？③ 今天哪条基金新闻能印证？' },
            ].map((c) => (
              <div key={c.n} className="nc-lesson">
                <div className="nc-lesson-h">
                  <span className="nc-lesson-n" style={{ background: 'linear-gradient(135deg,#BC8CFF,#58A6FF)' }}>{c.n}</span>
                  <div className="nc-lesson-t"><b>{c.t}</b><small>{c.s}</small></div>
                  <button className="nc-spk" onClick={() => aiAsk(`把「${c.t}」讲给我听，5 分钟`)}>▶ 听讲</button>
                </div>
                <div className="nc-lesson-b">{c.b}</div>
              </div>
            ))}
            <div className="nc-coach" style={{ borderColor: 'rgba(188,140,255,.3)' }}>
              <div className="nc-coach-h"><span className="nc-coach-ic" style={{ background: 'linear-gradient(135deg,#BC8CFF,#58A6FF)' }}>🤖</span>AI 陪学 · 通识漫谈</div>
              <p>把今天时事讲成故事、举个身边例子、或换个角度辩论，怎么学随你。</p>
              <div className="nc-qrow">
                <span onClick={() => aiAsk('把利率下行讲成一个小故事')}>讲成小故事</span>
                <span onClick={() => aiAsk('结合我的基金说说利率影响')}>结合我的基金</span>
                <span onClick={() => aiAsk('推荐明天通识主题')}>明天学什么</span>
              </div>
            </div>

            {/* 测验（本地判定） */}
            <div className="nc-quiz">
              <div className="nc-qt"><span className="nc-qn">1</span>银行抢长期存款，最可能的背景是？</div>
              {[
                { o: 'A. 银行钱太多了花不完', ok: false },
                { o: 'B. 利率下行，想锁住低成本负债', ok: true },
                { o: 'C. 储户都在取钱', ok: false },
              ].map((op, i) => <QuizOp key={i} label={op.o} ok={op.ok} />)}
            </div>
            <div className="nc-quiz">
              <div className="nc-qt"><span className="nc-qn">2</span>利率下行时，通常谁表现更好？</div>
              {[
                { o: 'A. 债券类资产', ok: true },
                { o: 'B. 现金存款', ok: false },
                { o: 'C. 高息 P2P', ok: false },
              ].map((op, i) => <QuizOp key={i} label={op.o} ok={op.ok} />)}
            </div>
          </div>
        </>
      )}

      {toast && <div className="nc-toast">{toast}</div>}
    </div>
  )
}

/** 测验选项（点后判定颜色） */
function QuizOp({ label, ok }: { label: string; ok: boolean }) {
  const [state, setState] = useState<'idle' | 'cor' | 'wro'>('idle')
  const cls = state === 'cor' ? 'cor' : state === 'wro' ? 'wro' : ''
  return (
    <button className={`nc-op ${cls}`} onClick={() => setState(ok ? 'cor' : 'wro')} disabled={state !== 'idle'}>
      {label}
    </button>
  )
}
