/**
 * Battle Mode 面板 — 战斗台
 *
 * 流程：
 *   1. 立题：输入争议点 + A/B 立场
 *   2. 抽卡：随机发 A/B 两张角色卡（可重抽）
 *   3. 跳伞：随机一个世界观（可重掷）
 *   4. 战斗：每轮掷维度骰子 + 掷火力 → 生成主持人/辩手 prompt
 *   5. 战报：把整场记录折叠成一份战报，一键发到聊天（持久化）
 *
 * 纯前端。AI 由用户把 prompt 拷到任意 AI 里扮演；面板只负责「把战局变成 prompt」。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ROLE_CARDS, WORLDVIEWS, DIMENSIONS, VARIATIONS,
  roleCardById, worldViewById,
  rollDimension, rollFirePower,
  buildHostPrompt, buildDebaterPrompt,
  FIRE_POWER_LABELS,
  type RoleCard, type WorldView, type Dimension, type FirePower,
} from './engine'

// ── 宿主桥 ────────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'battle-mode'

async function hostInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const invoker = (window as unknown as {
    __POLARIS_HOST_INVOKE__?: (c: string, a?: Record<string, unknown>) => Promise<T>
  }).__POLARIS_HOST_INVOKE__
  if (invoker) return invoker(cmd, args)
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> }
  }).__TAURI_INTERNALS__
  if (internals?.invoke) return internals.invoke(cmd, args)
  throw new Error('宿主 invoke 不可用（需在 Polaris 内运行）')
}

// ── 样式 ──────────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  container: { padding: 14, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, overflow: 'auto' as const },
  card: { padding: 10, borderRadius: 8, border: '1px solid #3F3F46', background: '#25252B', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label: { fontSize: 11, color: '#8E8E93', marginBottom: 2 },
  input: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, boxSizing: 'border-box' as const },
  textarea: { width: '100%', minHeight: 56, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, fontFamily: 'inherit' as const, boxSizing: 'border-box' as const, resize: 'vertical' as const },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  ok: { fontSize: 12, color: '#4ADE80', padding: 4 },
  err: { fontSize: 12, color: '#F87171', padding: 4 },
  muted: { fontSize: 11, color: '#8E8E93' },
  h: { fontSize: 13, fontWeight: 600, color: '#F8F8F8' },
}

const btn = (primary = false, disabled = false): CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
  background: primary ? '#3B82F6' : '#2D2D33', color: primary ? '#fff' : '#B4B4B8',
  border: primary ? 'none' : '1px solid #3F3F46', opacity: disabled ? 0.5 : 1,
})

const chip = (active: boolean): CSSProperties => ({
  padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer', border: '1px solid #3F3F46',
  background: active ? '#3B82F6' : '#2D2D33', color: active ? '#fff' : '#B4B4B8',
})

const copy = (text: string) => {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ── 主面板 ────────────────────────────────────────────────────────────────────

export default function BattleModePanel({
  pluginId,
  onSendToChat,
}: {
  pluginId: string
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  // ── 立题 ──
  const [topic, setTopic] = useState('')
  const [sideA, setSideA] = useState('')
  const [sideB, setSideB] = useState('')
  // ── 角色卡 ──
  const [roleAId, setRoleAId] = useState('architect')
  const [roleBId, setRoleBId] = useState('zen-pm')
  // ── 世界观 ──
  const [worldviewId, setWorldviewId] = useState('cultivation')
  // ── 战斗状态 ──
  const [roundNo, setRoundNo] = useState(1)
  const [lastDimension, setLastDimension] = useState<Dimension | null>(null)
  const [lastFire, setLastFire] = useState<FirePower | null>(null)
  const [log, setLog] = useState<string[]>([])
  // ── 存档 ──
  const [saved, setSaved] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    hostInvoke<{ [k: string]: unknown }>('plugin_get_config', { pluginId })
      .then((cfg) => {
        if (typeof cfg?.lastBattle === 'string' && cfg.lastBattle) setSaved(cfg.lastBattle)
      })
      .catch(() => {})
  }, [pluginId])

  const canStart = topic.trim() && sideA.trim() && sideB.trim()

  const roleA = useMemo(() => roleCardById(roleAId), [roleAId])
  const roleB = useMemo(() => roleCardById(roleBId), [roleBId])
  const worldview = useMemo(() => worldViewById(worldviewId), [worldviewId])

  // ── 抽卡 / 跳伞 ──
  const drawCards = useCallback(() => {
    // 保证 A/B 不同角色
    const pool = [...ROLE_CARDS]
    const ia = Math.floor(Math.random() * pool.length)
    const a = pool.splice(ia, 1)[0]
    const b = pool[Math.floor(Math.random() * pool.length)]
    setRoleAId(a.id)
    setRoleBId(b.id)
  }, [])
  const rerollRole = useCallback((which: 'A' | 'B') => {
    const cur = which === 'A' ? roleAId : roleBId
    const others = ROLE_CARDS.filter((r) => r.id !== cur)
    const next = others[Math.floor(Math.random() * others.length)]
    if (which === 'A') setRoleAId(next.id)
    else setRoleBId(next.id)
  }, [roleAId, roleBId])
  const dropWorld = useCallback(() => {
    const w = WORLDVIEWS[Math.floor(Math.random() * WORLDVIEWS.length)]
    setWorldviewId(w.id)
  }, [])

  // ── 掷骰 / 出招 ──
  const rollDice = useCallback(() => {
    setLastDimension(rollDimension())
  }, [])
  const rollFire = useCallback(() => {
    setLastFire(rollFirePower())
  }, [])

  const hostPrompt = useMemo(() => {
    if (!canStart) return null
    return buildHostPrompt({
      topic: topic.trim(),
      sideA: sideA.trim(),
      sideB: sideB.trim(),
      roleA,
      roleB,
      worldview,
      roundNo,
      lastRoundSummary: log.length ? log[log.length - 1] : undefined,
      firePower: lastFire ?? undefined,
    })
  }, [canStart, topic, sideA, sideB, roleA, roleB, worldview, roundNo, lastFire, log])

  const debaterPrompts = useMemo(() => {
    if (!canStart) return null
    return {
      a: buildDebaterPrompt({
        topic: topic.trim(), side: sideA.trim(), role: roleA, worldview,
        firePower: lastFire ?? 'heavy', opponentLastMove: log.length ? log[log.length - 1] : undefined,
      }),
      b: buildDebaterPrompt({
        topic: topic.trim(), side: sideB.trim(), role: roleB, worldview,
        firePower: (lastFire ?? 'heavy') === 'heavy' ? 'sniper' : 'heavy',
        opponentLastMove: log.length ? log[log.length - 1] : undefined,
      }),
    }
  }, [canStart, topic, sideA, sideB, roleA, roleB, worldview, lastFire, log])

  // ── 战报 ──
  const report = useMemo(() => {
    if (!canStart) return null
    const parts = [
      `# ⚔️ Battle 战报 — ${topic.trim()}`,
      '',
      `- **辩手 A**：${roleA.emoji} ${roleA.name}（${sideA.trim()}）`,
      `- **辩手 B**：${roleB.emoji} ${roleB.name}（${sideB.trim()}）`,
      `- **世界观**：${worldview.emoji} ${worldview.name}`,
      `- **轮数**：${roundNo}`,
      '',
      '## 交锋记录',
      ...(log.length ? log.map((l, i) => `${i + 1}. ${l}`) : ['（尚未交锋）']),
      '',
      '## 学到的三件事',
      '',
      '1. ',
      '2. ',
      '3. ',
      '',
      '## 共识 / 分歧 / 下一步',
      '',
      '- 共识：',
      '- 分歧：',
      '- 下一步：',
    ]
    return parts.join('\n')
  }, [canStart, topic, sideA, sideB, roleA, roleB, worldview, roundNo, log])

  const sendReport = useCallback(async () => {
    if (!report || !onSendToChat) return
    try {
      await onSendToChat(report)
      setMsg({ ok: true, text: '战报已发送到聊天（已持久化）' })
    } catch (e) {
      setMsg({ ok: false, text: `发送失败: ${e}` })
    }
  }, [report, onSendToChat])

  const saveBattle = useCallback(async () => {
    if (!report) return
    try {
      await hostInvoke('plugin_set_config', { pluginId, patch: { lastBattle: report } })
      setSaved(report)
      setMsg({ ok: true, text: '已存档' })
    } catch (e) {
      setMsg({ ok: false, text: `存档失败: ${e}` })
    }
  }, [report])

  return (
    <div style={s.container}>
      <div style={s.row}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#F8F8F8' }}>⚔️ Battle Mode</span>
        <span style={s.muted}>为学习而战</span>
      </div>

      {/* ── 1. 立题 ── */}
      <div style={s.card}>
        <div style={s.h}>1 · 立题</div>
        <div style={s.field}>
          <div style={s.label}>争议点</div>
          <input style={s.input} value={topic} placeholder="要辩论什么？例：SimpleAI 该不该学主流 harness 的并发模型？"
            onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div style={s.row}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={s.label}>辩手 A 立场</div>
            <input style={s.input} value={sideA} placeholder="例：不该，轻量引擎不该照搬重型架构"
              onChange={(e) => setSideA(e.target.value)} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={s.label}>辩手 B 立场</div>
            <input style={s.input} value={sideB} placeholder="例：该，这是抄作业不是抄架构"
              onChange={(e) => setSideB(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── 2. 抽卡 ── */}
      <div style={s.card}>
        <div style={s.row}>
          <div style={s.h}>2 · 角色卡</div>
          <button style={btn(false)} onClick={drawCards}>🎴 重抽 A/B</button>
        </div>
        <div style={s.row}>
          <RolePicker label={`A · ${roleA.emoji}${roleA.name}`} constraint={roleA.constraint} activeId={roleAId}
            onSelect={(id) => setRoleAId(id)} onReroll={() => rerollRole('A')} />
          <RolePicker label={`B · ${roleB.emoji}${roleB.name}`} constraint={roleB.constraint} activeId={roleBId}
            onSelect={(id) => setRoleBId(id)} onReroll={() => rerollRole('B')} />
        </div>
      </div>

      {/* ── 3. 跳伞 ── */}
      <div style={s.card}>
        <div style={s.row}>
          <div style={s.h}>3 · 世界观跳伞</div>
          <button style={btn(false)} onClick={dropWorld}>🪂 重掷</button>
        </div>
        <div style={s.muted}>{worldview.emoji} {worldview.name}</div>
        <div style={s.muted}>{worldview.reframe(topic || '这个争议')}</div>
        <div style={s.row}>
          {WORLDVIEWS.map((w) => (
            <button key={w.id} style={chip(worldviewId === w.id)} onClick={() => setWorldviewId(w.id)}>
              {w.emoji} {w.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. 战斗 ── */}
      <div style={s.card}>
        <div style={s.row}>
          <div style={s.h}>4 · 战斗</div>
          <span style={s.muted}>第 {roundNo} 轮</span>
          <button style={btn(false)} onClick={rollDice}>🎲 维度骰子</button>
          <button style={btn(false)} onClick={rollFire}>🎯 掷火力</button>
        </div>

        {lastDimension && (
          <div style={{ padding: 8, borderRadius: 6, background: '#1D1D22', border: '1px solid #3F3F46' }}>
            <div style={s.muted}>🎲 维度：{lastDimension.emoji} {lastDimension.name}</div>
            <div style={{ fontSize: 12, color: '#E4E4E7' }}>{lastDimension.instruction}</div>
          </div>
        )}

        {hostPrompt && (
          <div style={s.field}>
            <div style={s.label}>
              主持人提示词（{lastFire ? FIRE_POWER_LABELS[lastFire] : '未掷火力'}）—— 拷给任意 AI 当主持人
            </div>
            <textarea style={{ ...s.textarea, minHeight: 160 }} readOnly value={hostPrompt} />
            <div style={s.row}>
              <button style={btn(false)} onClick={() => copy(hostPrompt)}>📋 复制主持人提示词</button>
            </div>
          </div>
        )}

        {debaterPrompts && (
          <div style={s.field}>
            <div style={s.label}>辩手提示词（A/B 各一份，拷给 AI 当辩手）</div>
            <div style={{ ...s.card, background: '#1D1D22' }}>
              <div style={s.muted}>🧨 A · {roleA.name}（{lastFire ? FIRE_POWER_LABELS[lastFire] : '重炮 🔥 默认'}）</div>
              <textarea style={{ ...s.textarea, minHeight: 120 }} readOnly value={debaterPrompts.a} />
              <button style={btn(false)} onClick={() => copy(debaterPrompts.a)}>📋 复制 A</button>
            </div>
            <div style={{ ...s.card, background: '#1D1D22' }}>
              <div style={s.muted}>🧘 B · {roleB.name}（{lastFire ? (lastFire === 'heavy' ? '冷枪 🪃' : '重炮 🔥') : '冷枪 🪃 默认'}）</div>
              <textarea style={{ ...s.textarea, minHeight: 120 }} readOnly value={debaterPrompts.b} />
              <button style={btn(false)} onClick={() => copy(debaterPrompts.b)}>📋 复制 B</button>
            </div>
          </div>
        )}

        <div style={s.field}>
          <div style={s.label}>本轮交锋记录（手动记：对方说了啥 / 你认了什么）</div>
          <textarea style={s.textarea} placeholder="把 AI 交锋的结果粘回来，作为战报素材…"
            value={log.join('\n')} onChange={(e) => setLog(e.target.value.split('\n'))} />
          <div style={s.row}>
            <button style={btn()} onClick={() => setLog([...log, `第 ${roundNo} 轮交锋`])}>➕ 记一轮</button>
            <button style={btn(false)} onClick={() => setRoundNo(roundNo + 1)}>⏭️ 下一轮</button>
          </div>
        </div>
      </div>

      {/* ── 5. 战报 ── */}
      <div style={s.card}>
        <div style={s.h}>5 · 战报</div>
        {report ? (
          <>
            <textarea style={{ ...s.textarea, minHeight: 180 }} readOnly value={report} />
            <div style={s.row}>
              {onSendToChat && (
                <button style={btn(true)} onClick={sendReport}>📤 发到聊天（持久化）</button>
              )}
              <button style={btn(false)} onClick={saveBattle}>💾 存档</button>
            </div>
          </>
        ) : (
          <div style={s.muted}>先填完立题（争议点 + 双立场）再生成战报。</div>
        )}
        {msg && <div style={msg.ok ? s.ok : s.err}>{msg.text}</div>}
        {saved && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#8E8E93' }}>上次存档</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#B4B4B8', margin: 0 }}>{saved}</pre>
          </details>
        )}
      </div>

      {/* ── 变奏四连 ── */}
      <div style={s.card}>
        <div style={s.h}>🔄 变奏四连（发散引擎）</div>
        <div style={s.row}>
          {VARIATIONS.map((v) => (
            <button key={v.id} style={btn(false)} onClick={() => copy(`${v.emoji} ${v.name}：${v.prompt}\n\n话题：${topic || ''}`)}>
              {v.emoji} {v.name}
            </button>
          ))}
        </div>
        <div style={s.muted}>点一下复制一个「发散问题」，拷给 AI 追问。</div>
      </div>

      <div style={s.muted}>
        MVP v0.1 · 纯前端 · AI 由你把 prompt 拷给任意模型扮演 · 战报通过「发到聊天」持久化
      </div>
    </div>
  )
}

// ── 角色选择器 ────────────────────────────────────────────────────────────────

function RolePicker({ label, constraint, activeId, onSelect, onReroll }: {
  label: string
  constraint: string
  activeId: string
  onSelect: (id: string) => void
  onReroll: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ flex: 1, ...s.card, gap: 6 }}>
      <div style={s.row}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#F8F8F8' }}>{label}</span>
        <button style={btn(false)} onClick={onReroll}>🔄 换一张</button>
        <button style={btn(false)} onClick={() => setOpen(!open)}>{open ? '收起' : '换角色'}</button>
      </div>
      <div style={s.muted}>{constraint}</div>
      {open && (
        <div style={{ ...s.row, gap: 4 }}>
          {ROLE_CARDS.filter((r) => r.id !== activeId).map((r) => (
            <button key={r.id} style={chip(false)} onClick={() => { onSelect(r.id); setOpen(false) }}>
              {r.emoji} {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
