/**
 * 规则 Tab：分类关键词规则增删 + 内置规则表 + 使用指引 + 隐私口径 + 危险区。
 */
import { useState } from 'react'
import * as core from '../shared/core'
import { saveRules, wipeAll } from './model'
import type { TabProps } from './Panel'

type Props = TabProps

export default function RulesTab({ data, cache, reload, showToast }: Props) {
  const [kw, setKw] = useState('')
  const [cat, setCat] = useState('')
  const [confirmWipe, setConfirmWipe] = useState(false)
  const rules = data?.rules || []

  const addRule = async () => {
    if (!kw.trim() || !cat.trim()) {
      showToast('关键词和分类名都要填', true)
      return
    }
    try {
      await saveRules([{ kw: kw.trim(), cat: cat.trim() }, ...rules])
      setKw('')
      setCat('')
      showToast('已加规则（对以后导入生效；改存量去「明细」Tab）')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const removeRule = async (target: string) => {
    try {
      await saveRules(rules.filter((r) => r.kw !== target))
      showToast('已删规则')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const doWipe = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true)
      setTimeout(() => setConfirmWipe(false), 5000)
      return
    }
    setConfirmWipe(false)
    try {
      const n = await wipeAll(cache)
      showToast(`已清空消费账单全部数据（${n} 个键）`)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div>
      <div className="dz-sec"><span className="dz-bar" />三步上手</div>
      <div className="dz-card">
        <div className="dz-card-b dz-sub" style={{ lineHeight: 2 }}>
          ① 导出账单：微信「服务→钱包→账单→右上角···→下载账单（用于个人对账）」；支付宝「我的→账单→右上角···→开具交易流水证明→电子版对账单」——两者都会发 zip 到你邮箱。<br />
          ② 下载 zip 拖进「导入」Tab：支付宝直接可导；微信要输入解压密码（「微信支付」公众号的通知消息里可查）。也可以手动解压后拖 CSV。<br />
          ③ 之后全是对话与面板：问 AI「上月奶茶花了多少」，或在「总览」「明细」里自己翻。导错了「导入」Tab 里整批撤销。
        </div>
      </div>

      <div className="dz-sec"><span className="dz-bar" />分类规则<span className="dz-hint">先命中先用 · 自定义优先于内置</span></div>
      <div className="dz-card">
        <div className="dz-card-b">
          <div className="dz-row">
            <input className="dz-inp dz-grow" placeholder="关键词（匹配交易对方/商品/类型）" value={kw} onChange={(e) => setKw(e.target.value)} />
            <input className="dz-inp" style={{ width: 110 }} placeholder="分类名" value={cat} onChange={(e) => setCat(e.target.value)} />
            <button className="dz-btn gold" onClick={() => void addRule()}>加规则</button>
          </div>
          {rules.length === 0 ? (
            <div className="dz-sub" style={{ marginTop: 8 }}>还没有自定义规则：所有交易先走内置默认规则，再落到「其他」。例如加「瑞幸→咖啡奶茶」让以后导入自动归类。</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {rules.map((r) => (
                <div className="dz-row" key={r.kw} style={{ padding: '4px 0', borderBottom: '1px solid #1c2230' }}>
                  <span className="dz-tag">「{r.kw}」</span>
                  <span className="dz-sub">→</span>
                  <span className="dz-grow" style={{ fontSize: 12 }}>{r.cat}</span>
                  <button className="dz-btn sm ghost" onClick={() => void removeRule(r.kw)}>删</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dz-sec"><span className="dz-bar" />内置默认规则<span className="dz-hint">{core.DEFAULT_RULES.length} 条 · 只读</span></div>
      <div className="dz-card">
        <div className="dz-card-b dz-sub">
          {core.DEFAULT_RULES.map((r) => `${r.kw}→${r.cat}`).join('、')}
        </div>
      </div>

      <div className="dz-sec"><span className="dz-bar" />隐私与安全</div>
      <div className="dz-card">
        <div className="dz-card-b dz-sub" style={{ lineHeight: 1.9 }}>
          · 零外网：本插件没有任何网络权限，账单文件在浏览器本机解析，不上传任何内容。<br />
          · 密码不落盘：zip 解压密码只在本次导入的内存里用一次，不写进任何存储和日志。<br />
          · 数据仅存本机：全部数据在本机 Polaris 数据根（cap.kv），家庭多端同看走你自己的 Polaris，不经第三方。<br />
          · 可撤销：按批次整批撤销；清空 = 下面按钮，删干净不可恢复（先导出备份）。
        </div>
      </div>

      <div className="dz-sec"><span className="dz-bar" />危险区</div>
      <div className="dz-card">
        <div className="dz-card-b dz-row">
          <span className="dz-sub dz-grow">清空全部消费账单数据（账单/批次/规则/分类覆盖），不可恢复。</span>
          <button className={`dz-btn sm ${confirmWipe ? 'danger' : 'ghost'}`} onClick={() => void doWipe()}>
            {confirmWipe ? '确认清空？' : '清空数据'}
          </button>
        </div>
      </div>
    </div>
  )
}
