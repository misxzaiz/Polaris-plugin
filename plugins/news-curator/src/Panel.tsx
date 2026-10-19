/**
 * AI 每日刊物面板（news-curator）
 * 4 Tab：今日 / 学习 / 语音 / 我的
 * 数据全部来自 cap.kv news.*（AI 经 MCP news_publish_daily 写入，面板只读日报）
 */
import { useEffect, useState } from 'react'
import { setHostSend } from './model'
import Today from './Today'
import Learn from './Learn'
import Voice from './Voice'
import Mine from './Mine'

const css = `
.nc-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.nc-body{flex:1;overflow-y:auto;padding:0 0 20px}
.nc-body::-webkit-scrollbar{width:9px;height:9px}
.nc-body::-webkit-scrollbar-track{background:transparent}
.nc-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.nc-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}

/* 页面 */
.nc-page{max-width:430px;margin:0 auto;padding-bottom:20px}
.nc-top{position:sticky;top:0;z-index:20;padding:14px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 70%,rgba(16,20,28,0))}
.nc-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#58A6FF,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.nc-tt{flex:1;min-width:0}
.nc-tt b{font-size:16px;display:block}
.nc-tt small{color:#8B95A7;font-size:11px;display:block;margin-top:1px}
.nc-play{width:38px;height:38px;border-radius:50%;border:1px solid #242C3A;background:#161B22;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;cursor:pointer;box-shadow:0 2px 12px rgba(88,166,255,.15);color:#58A6FF}
.nc-play:hover{background:#1C2330}

/* 进度卡 */
.nc-prog{background:#161B22;border:1px solid #242C3A;border-radius:14px;padding:12px 14px;margin:2px 16px 14px}
.nc-prog-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.nc-prog-h b{font-size:13px}
.nc-pct{margin-left:auto;color:#58A6FF;font-weight:700;font-size:13px}
.nc-track{height:6px;border-radius:3px;background:#1C2330;overflow:hidden}
.nc-track i{display:block;height:100%;background:linear-gradient(90deg,#58A6FF,#BC8CFF);border-radius:3px}
.nc-labels{display:flex;justify-content:space-between;margin-top:6px;font-size:9.5px;color:#5C6678}
.nc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* 板块标题 */
.nc-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 8px;font-size:14px;font-weight:700}
.nc-bar{width:3px;height:14px;border-radius:2px;background:linear-gradient(180deg,#58A6FF,#BC8CFF);flex-shrink:0}
.nc-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.nc-feed{display:flex;flex-direction:column;gap:10px;padding:0 16px 18px}

/* 卡片 */
.nc-card{background:#161B22;border:1px solid #242C3A;border-radius:14px;overflow:hidden}
.nc-card-b{padding:12px 14px 0}
.nc-card-b b{font-size:13px}
.nc-card-h{padding:0 0 8px;display:flex;align-items:center}
.nc-card-h b{font-size:13px}
.nc-sub{padding:4px 14px 10px;font-size:10.5px;color:#8B95A7;line-height:1.6}
.nc-src{display:flex;align-items:center;gap:6px;padding:8px 14px;border-top:1px solid #242C3A;background:rgba(255,255,255,.02);font-size:10.5px;color:#5C6678}
.nc-badge{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7}
.nc-up{color:#3FB950}.nc-down{color:#F85149}.nc-warn{color:#D29922}
.nc-lbl{font-size:11px;color:#8B95A7;flex-shrink:0}

/* 按钮 */
.nc-btn{background:#3b6fd4;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.nc-btn:disabled{opacity:.5;cursor:not-allowed}
.nc-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.nc-btn.sm{padding:4px 9px;font-size:11px}
.nc-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;flex:1;min-width:120px}
.nc-empty{color:#8B95A7;font-size:12px;padding:18px 16px;text-align:center;line-height:1.7}
.nc-toast{position:absolute;bottom:76px;left:50%;transform:translateX(-50%);background:rgba(22,27,35,.96);border:1px solid #242C3A;color:#E6EAF2;padding:8px 14px;border-radius:10px;font-size:11.5px;z-index:99;box-shadow:0 6px 18px #0008;white-space:nowrap}
.nc-tip{color:#5C6678}

/* 双线学习卡 */
.nc-line{display:flex;flex-direction:column;gap:9px;padding:13px;background:#161B22;border:1px solid #242C3A;border-radius:14px;cursor:pointer}
.nc-line:hover{border-color:rgba(88,166,255,.4)}
.nc-line-h{display:flex;align-items:center;gap:10px}
.nc-lic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}
.nc-line-t{flex:1;min-width:0}
.nc-line-t b{font-size:14px;display:block}
.nc-line-t small{color:#5C6678;font-size:10.5px;display:block}
.nc-line-track{height:5px;border-radius:3px;background:#1C2330;overflow:hidden}
.nc-line-track i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#1F6FEB,#58A6FF)}
.nc-line-d{font-size:10px;color:#5C6678;line-height:1.7}
.nc-tags{display:flex;gap:6px;flex-wrap:wrap}
.nc-tags span{font-size:9.5px;padding:2px 8px;border-radius:999px;border:1px solid #242C3A;color:#8B95A7}

/* 课程体系 */
.nc-lv{background:#161B22;border:1px solid #242C3A;border-radius:14px;padding:13px}
.nc-lv-h{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.nc-lv-tag{font-size:9.5px;font-weight:700;padding:2px 9px;border-radius:999px;letter-spacing:.5px}
.nc-lv-h b{font-size:13px;flex:1}
.nc-lv-st{font-size:10px;color:#5C6678}
.nc-unit{display:flex;align-items:center;gap:9px;padding:8px 10px;background:#1C2330;border-radius:9px;margin-bottom:7px}
.nc-unit.done{opacity:.62}
.nc-uno{width:26px;height:26px;border-radius:8px;background:#12151c;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;flex-shrink:0;font-weight:700}
.nc-unit.done .nc-uno{background:#1C2330;color:#3FB950;border:1px solid rgba(63,185,80,.4)}
.nc-unit.now{border:1px solid rgba(88,166,255,.4)}
.nc-unit.now .nc-uno{background:linear-gradient(135deg,#1F6FEB,#3F8CFF)}
.nc-unit.next .nc-uno{background:#1C2330;color:#5C6678;border:1px solid #242C3A}
.nc-unit.next{opacity:.75}
.nc-uti{flex:1;min-width:0}
.nc-uti b{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-udur{color:#5C6678;font-size:10px;flex-shrink:0}

/* 章节课 */
.nc-lesson{background:#161B22;border:1px solid #242C3A;border-radius:14px;overflow:hidden}
.nc-lesson-h{padding:11px 13px;display:flex;align-items:center;gap:9px}
.nc-lesson-n{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,#1F6FEB,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0;font-weight:700}
.nc-lesson-t{flex:1;min-width:0}
.nc-lesson-t b{font-size:13px;display:block}
.nc-lesson-t small{color:#5C6678;font-size:10px}
.nc-spk{font-size:10px;color:#58A6FF;border:1px solid rgba(88,166,255,.3);padding:2px 8px;border-radius:999px;background:rgba(88,166,255,.08);flex-shrink:0;cursor:pointer}
.nc-lesson-b{padding:2px 13px 12px;font-size:11.5px;color:#8B95A7;line-height:1.65;border-left:3px solid #242C3A;margin-left:21px;margin-right:13px;margin-bottom:12px;padding-left:10px}

/* AI 教练 */
.nc-coach{background:linear-gradient(135deg,rgba(88,166,255,.12),rgba(188,140,255,.08));border:1px solid rgba(88,166,255,.3);border-radius:14px;padding:12px 13px}
.nc-coach-h{display:flex;align-items:center;gap:8px;margin-bottom:7px;font-size:12px;font-weight:700}
.nc-coach-ic{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#1F6FEB,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:13px}
.nc-coach p{font-size:11.5px;color:#8B95A7;line-height:1.65;margin-bottom:8px}
.nc-qrow{display:flex;gap:6px;flex-wrap:wrap}
.nc-qrow span{font-size:10px;color:#58A6FF;border:1px dashed rgba(88,166,255,.4);background:rgba(88,166,255,.06);padding:4px 9px;border-radius:999px;cursor:pointer}

/* 通识主题 */
.nc-topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 14px}
.nc-topic{background:#161B22;border:1px solid #242C3A;border-radius:11px;padding:11px;display:flex;flex-direction:column;gap:4px;cursor:pointer}
.nc-topic:hover{border-color:rgba(88,166,255,.4)}
.nc-topic.done{border-color:rgba(63,185,80,.35)}
.nc-topic.done small{color:#3FB950}
.nc-topic.now{border-color:rgba(88,166,255,.5)}
.nc-tico{width:28px;height:28px;border-radius:8px;background:#1C2330;display:flex;align-items:center;justify-content:center;font-size:14px}
.nc-topic b{font-size:12px}
.nc-topic small{color:#5C6678;font-size:9.5px}

/* 测验 */
.nc-quiz{background:#161B22;border:1px solid #242C3A;border-radius:14px;padding:13px}
.nc-qt{font-size:13px;font-weight:600;margin-bottom:9px;display:flex;gap:8px;align-items:flex-start}
.nc-qn{width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#3FB950,#4AC26B);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0;font-weight:700}
.nc-op{display:block;width:100%;text-align:left;background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:8px 11px;font-size:11.5px;color:#8B95A7;margin-bottom:6px;cursor:pointer}
.nc-op.cor{border-color:#3FB950;color:#3FB950;background:rgba(63,185,80,.1)}
.nc-op.wro{border-color:#F85149;color:#F85149;background:rgba(248,81,73,.08)}

/* 语音 */
.nc-voice{background:#161B22;border:1px solid #242C3A;border-radius:14px;overflow:hidden}
.nc-voice-h{padding:11px 13px;display:flex;align-items:center;gap:10px;cursor:pointer}
.nc-vic{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1F6FEB,#BC8CFF);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;color:#fff}
.nc-voice-t{flex:1;min-width:0}
.nc-voice-t b{font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-voice-t small{color:#5C6678;font-size:10px}
.nc-voice-dur{color:#8B95A7;font-size:10.5px;flex-shrink:0}
.nc-voice-prog{height:3px;background:#242C3A}
.nc-voice-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#58A6FF,#BC8CFF)}
.nc-player{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:398px;z-index:31;padding:9px 12px;background:rgba(22,27,35,.96);backdrop-filter:blur(14px);border:1px solid #242C3A;border-radius:12px;display:flex;align-items:center;gap:9px;box-shadow:0 6px 18px #0008}
.nc-player-info{flex:1;min-width:0}
.nc-player-info b{font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc-player-bar{height:3px;background:#242C3A;border-radius:2px;margin-top:3px;overflow:hidden}
.nc-player-bar i{display:block;height:100%;width:34%;background:linear-gradient(90deg,#58A6FF,#BC8CFF)}
.nc-player-ctrl{font-size:18px;cursor:pointer;flex-shrink:0}

/* 子 Tab */
.nc-subtab{display:flex;gap:6px;padding:0 16px 12px}
.nc-st{padding:7px 14px;border-radius:999px;background:#161B22;border:1px solid #242C3A;color:#8B95A7;font-size:13px;cursor:pointer}
.nc-st.on{background:linear-gradient(135deg,#1F6FEB,#3F8CFF);border-color:transparent;color:#fff;font-weight:600}

/* 我的 */
.nc-dir-list{display:flex;flex-direction:column;gap:6px}
.nc-dir{display:flex;align-items:center;gap:8px;background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:8px 11px;font-size:12px;color:#8B95A7;cursor:pointer;width:100%;text-align:left}
.nc-dir.on{border-color:rgba(88,166,255,.45);color:#E6EAF2;background:rgba(88,166,255,.06)}
.nc-dir-sw{margin-left:auto;font-weight:700}
.nc-dir.on .nc-dir-sw{color:#3FB950}
.nc-fund-list{display:flex;gap:6px;flex-wrap:wrap}
.nc-fund-chip{background:#1C2330;border:1px solid #242C3A;border-radius:999px;padding:3px 10px;font-size:11px;color:#8B95A7;display:inline-flex;align-items:center;gap:6px}
.nc-fund-chip b{color:#5C6678;cursor:pointer;font-size:11px}
.nc-fund-chip b:hover{color:#F85149}
.nc-log-list{display:flex;flex-direction:column;gap:8px}
.nc-log-item{display:flex;align-items:center;gap:8px;background:#1C2330;border:1px solid #242C3A;border-radius:9px;padding:8px 10px}
.nc-log-main{flex:1;min-width:0}
.nc-log-main b{font-size:11.5px;display:block}
.nc-log-main small{font-size:9.5px;color:#5C6678;display:block;margin-top:2px;word-break:break-all}

/* 底部导航（流内贴底，不用 fixed 以免越出侧边栏容器） */
.nc-tabbar{flex-shrink:0;width:100%;max-width:430px;background:rgba(18,22,30,.95);backdrop-filter:blur(14px);border-top:1px solid #242C3A;display:flex;padding:6px 8px calc(6px + env(safe-area-inset-bottom))}
.nc-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:5px 0;cursor:pointer;border-radius:10px;color:#5C6678;font-size:9.5px;background:none;border:none}
.nc-tab .nc-tab-ic{font-size:17px}
.nc-tab.on{color:#fff;background:rgba(88,166,255,.12)}
.nc-tab.on .nc-tab-ic{color:#58A6FF}
`

const TABS = [
  { id: 'today', label: '今日', icon: '📰' },
  { id: 'learn', label: '学习', icon: '🎓' },
  { id: 'voice', label: '语音', icon: '🎙️' },
  { id: 'mine', label: '我的', icon: '👤' },
]

export default function NewsPanel({ onSendToChat }: { onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState(0)

  // 宿主回调注入：面板内"生成日报"等按钮经 sendToChat 直达聊天
  useEffect(() => {
    setHostSend(onSendToChat)
    return () => setHostSend(undefined)
  }, [onSendToChat])

  return (
    <div className="nc-root">
      <style>{css}</style>
      <div className="nc-body">
        {tab === 0 && <Today goTab={setTab} />}
        {tab === 1 && <Learn />}
        {tab === 2 && <Voice />}
        {tab === 3 && <Mine />}
      </div>
      <div className="nc-tabbar">
        {TABS.map((t, i) => (
          <button key={t.id} className={`nc-tab ${tab === i ? 'on' : ''}`} onClick={() => setTab(i)}>
            <span className="nc-tab-ic">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
