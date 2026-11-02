/**
 * Panel.tsx —— AI 乐谱工作台面板
 *
 * Tab：谱库 / 编辑 / 分析 / 设置
 * 数据面：127.0.0.1 直连服务（model.ts）；编辑器本地改动 → 校验 → 保存。
 * 演奏：engine.ts lookahead 调度（用户手势触发，永不自动出声）。
 * 移动端：touch-action 仅限网格；visibilitychange 暂停回前台待用户恢复。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api, SvcError, invalidateMeta, midiToNoteName, validateScore, analyzeScore,
} from './model'
import type { Score, Track, SynthTrack, DrumTrack, IndexItem, Analysis, Note } from './model'
import { auditionNote, play, stop, isPlaying, exportWav, ensureRunning } from './engine'

type Tab = 'library' | 'edit' | 'analyze' | 'settings'

const WAVES = ['sawtooth', 'square', 'sine', 'triangle'] as const
const TRACK_COLORS = ['#ff6b9d', '#5ed6a8', '#5ec8ff', '#ffd27a', '#c792ea', '#f78c6c']
const STEP_W = 26
const ROW_H = 20

const EMPTY_SCORE: Score = {
  meta: { title: '新乐谱', bpm: 96, key: 'C', bars: 2 },
  tracks: [
    { name: 'Lead', type: 'synth', wave: 'sawtooth', vol: 0.3, cutoff: 2400, octaveShift: 0, notes: [] },
    { name: 'Drums', type: 'drum', vol: 0.5, pattern: { kick: [0, 8], snare: [4, 12], hat: [], clap: [] } },
  ],
}

export default function Panel(): JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [svcErr, setSvcErr] = useState<string | null>(null)
  const [svcInfo, setSvcInfo] = useState<string>('')

  // 谱库
  const [scores, setScores] = useState<IndexItem[]>([])
  const [cap, setCap] = useState(200)
  const [skeleton, setSkeleton] = useState({ title: '', bpm: 96, key: 'Am', bars: 4, style: 'melody', progression: '' })

  // 编辑
  const [score, setScore] = useState<Score | null>(null)
  const [curTrack, setCurTrack] = useState(0)
  const [playStep, setPlayStep] = useState(-1)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 分析
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  // 设置
  const [volume, setVolume] = useState(0.9)

  const loadScores = useCallback(async () => {
    try {
      const r = await api.listScores()
      setScores(r.scores); setCap(r.cap); setSvcErr(null)
      setSvcInfo(`v${(await api.meta()).version} · ${r.scores.length}/${r.cap} 份`)
    } catch (e) {
      setSvcErr((e as Error).message)
    }
  }, [])

  useEffect(() => { void loadScores() }, [loadScores])

  // 切后台暂停（移动端纪律：iOS webview 挂起 audio context）
  useEffect(() => {
    const onVis = () => { if (document.hidden && isPlaying()) { stop(); setPlayStep(-1) } }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const openScore = useCallback(async (id: string) => {
    try {
      const r = await api.getScore(id)
      setScore(r.score); setCurTrack(0); setAnalysis(null); setSaveMsg(null); setTab('edit')
    } catch (e) { setSvcErr((e as Error).message) }
  }, [])

  const doCreate = useCallback(async () => {
    try {
      const prog = skeleton.progression.trim()
        ? skeleton.progression.split(/[,，\s]+/).filter(Boolean)
        : undefined
      const r = await api.createScore({
        title: skeleton.title || '未命名', bpm: Number(skeleton.bpm), key: skeleton.key,
        bars: Number(skeleton.bars), style: skeleton.style, ...(prog ? { progression: prog } : {}),
      })
      setScore(r.score); setTab('edit'); setSvcErr(null)
      void loadScores()
    } catch (e) { setSvcErr((e as Error).message) }
  }, [skeleton, loadScores])

  const doSave = useCallback(async () => {
    if (!score) return
    const v = validateScore(score)
    if (!v.ok) { setSaveMsg({ ok: false, text: v.errors.join('；') }); return }
    try {
      const r = await api.writeScore({ id: score.id, score: v.score as Score })
      setScore({ ...r.score })
      setSaveMsg({ ok: true, text: `已保存（${r.id}）` })
      void loadScores()
    } catch (e) { setSaveMsg({ ok: false, text: (e as Error).message }) }
  }, [score, loadScores])

  const doAnalyze = useCallback(async () => {
    if (!score) return
    // 本地分析（core 打包进 bundle，零往返）
    setAnalysis(analyzeScore(score))
  }, [score])

  const doDelete = useCallback(async (id: string) => {
    try { await api.deleteScore(id); void loadScores() } catch (e) { setSvcErr((e as Error).message) }
  }, [loadScores])

  const togglePlay = useCallback(() => {
    if (!score) return
    if (isPlaying()) { stop(); setPlayStep(-1); return }
    ensureRunning()
    const err = play(score, (st) => setPlayStep(st))
    if (err) setSvcErr(err)
  }, [score])

  const doExport = useCallback(async () => {
    if (!score) return
    try {
      const blob = await exportWav(score)
      if (!blob) { setSaveMsg({ ok: false, text: '此环境不支持离线渲染' }); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${score.meta.title.replace(/[\\/:*?"<>|]/g, '_')}.wav`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setSaveMsg({ ok: false, text: `导出失败：${(e as Error).message}` }) }
  }, [score])

  // ── 编辑器操作（本地，保存时才落库）──────────────────────────────────────
  const mutateMeta = (patch: Partial<Score['meta']>) => {
    setScore((s) => (s ? { ...s, meta: { ...s.meta, ...patch } } : s))
  }
  const mutateTrack = (idx: number, patch: Partial<SynthTrack> | Partial<DrumTrack>) => {
    setScore((s) => {
      if (!s) return s
      const tracks = s.tracks.map((t, i) => (i === idx ? { ...t, ...patch } as Track : t))
      return { ...s, tracks }
    })
  }
  const toggleNote = (step: number, pitch: number) => {
    setScore((s) => {
      if (!s) return s
      const tr = s.tracks[curTrack]
      if (!tr || tr.type !== 'synth') return s
      const notes: Note[] = [...tr.notes]
      const idx = notes.findIndex((n) => n.step === step && n.pitch === pitch)
      if (idx >= 0) notes.splice(idx, 1)
      else { notes.push({ step, pitch, len: 2, vel: 0.8 }); if (ensureRunning()) auditionNote(tr, pitch) }
      return { ...s, tracks: s.tracks.map((t, i) => (i === curTrack ? { ...t, notes } : t)) }
    })
  }
  const toggleDrum = (drum: string, step: number) => {
    setScore((s) => {
      if (!s) return s
      const tr = s.tracks[curTrack]
      if (!tr || tr.type !== 'drum') return s
      const cur = tr.pattern[drum] || []
      const next = cur.includes(step) ? cur.filter((x) => x !== step) : [...cur, step].sort((a, b) => a - b)
      return { ...s, tracks: s.tracks.map((t, i) => (i === curTrack ? { ...t, pattern: { ...tr.pattern, [drum]: next } } : t)) }
    })
  }
  const addTrack = () => {
    setScore((s) => {
      if (!s || s.tracks.length >= 16) return s
      return { ...s, tracks: [...s.tracks, { name: `轨${s.tracks.length + 1}`, type: 'synth', wave: 'triangle', vol: 0.25, cutoff: 2000, octaveShift: 0, notes: [] }] }
    })
  }

  const totalSteps = score ? score.meta.bars * 16 : 32

  // ── 渲染 ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--polaris-text, #dde6ff)', background: 'var(--polaris-bg, transparent)', fontSize: 12, gap: 8, overflow: 'hidden' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['library', 'edit', 'analyze', 'settings'] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t !== 'edit') { stop(); setPlayStep(-1) } }}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(126,232,250,.25)', background: tab === t ? 'rgba(126,232,250,.2)' : 'transparent', color: 'inherit', cursor: 'pointer' }}>
            {t === 'library' ? '谱库' : t === 'edit' ? '编辑' : t === 'analyze' ? '分析' : '设置'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', color: 'rgba(160,180,220,.6)', fontSize: 11 }}>{svcInfo}</div>
      </div>

      {svcErr && (
        <div style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,107,157,.12)', border: '1px solid rgba(255,107,157,.4)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{svcErr}</span>
          <button onClick={async () => { try { await api.restart(); invalidateMeta(); setTimeout(() => void loadScores(), 1500); setSvcErr(null) } catch (e) { setSvcErr(`重启失败：${(e as Error).message}`) } }}
            style={{ padding: '3px 8px', cursor: 'pointer' }}>重启服务</button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'library' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* AI/手动新建 */}
            <div style={{ border: '1px solid rgba(126,232,250,.2)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 600, color: 'rgba(126,232,250,.9)' }}>新建（骨架 → 算法展开，100% 在调上）</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="曲名" value={skeleton.title} onChange={(e) => setSkeleton({ ...skeleton, title: e.target.value })} style={inp} />
                <input type="number" min={40} max={240} value={skeleton.bpm} onChange={(e) => setSkeleton({ ...skeleton, bpm: Number(e.target.value) })} style={{ ...inp, width: 60 }} title="BPM" />
                <input placeholder="Am" value={skeleton.key} onChange={(e) => setSkeleton({ ...skeleton, key: e.target.value })} style={{ ...inp, width: 60 }} title="调式" />
                <input type="number" min={1} max={16} value={skeleton.bars} onChange={(e) => setSkeleton({ ...skeleton, bars: Number(e.target.value) })} style={{ ...inp, width: 50 }} title="小节" />
                <select value={skeleton.style} onChange={(e) => setSkeleton({ ...skeleton, style: e.target.value })} style={inp}>
                  <option value="melody">旋律</option>
                  <option value="arpeggio">琶音</option>
                  <option value="walkbass">行走贝斯</option>
                  <option value="pad">铺底</option>
                  <option value="riff">连复段</option>
                </select>
                <input placeholder="和弦进行（可选，如 Am,F,C,G）" value={skeleton.progression} onChange={(e) => setSkeleton({ ...skeleton, progression: e.target.value })} style={{ ...inp, flex: 1, minWidth: 160 }} />
                <button onClick={doCreate} style={btnPri}>生成</button>
              </div>
              <div style={{ color: 'rgba(160,180,220,.55)', fontSize: 11 }}>
                提示：AI 可在对话里直接生成（MCP score_create/score_write）；这里给手动入口。生成后进编辑微调。
              </div>
            </div>

            {/* 谱列表 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {scores.length === 0 && <div style={{ color: 'rgba(160,180,220,.5)', padding: 12, textAlign: 'center' }}>曲谱库为空——上面生成一份，或让 AI 经 MCP 写入</div>}
              {scores.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(126,232,250,.05)', borderLeft: `3px solid ${TRACK_COLORS[i % TRACK_COLORS.length]}` }}>
                  <span style={{ cursor: 'pointer', fontWeight: 600, minWidth: 90 }} onClick={() => void openScore(s.id)}>{s.title}</span>
                  <span style={{ color: 'rgba(160,180,220,.6)', fontSize: 11 }}>{s.key} · {s.bars} 小节 · {s.bpm} BPM · {s.dur}s · {s.tracks} 轨</span>
                  <span style={{ color: 'rgba(160,180,220,.4)', fontSize: 11, marginLeft: 'auto' }}>{new Date(s.updatedAt).toLocaleString()}</span>
                  <button onClick={() => void openScore(s.id)} style={btn}>打开</button>
                  <button onClick={() => void doDelete(s.id)} style={{ ...btn, color: '#ff6b9d' }}>删除</button>
                </div>
              ))}
              {scores.length >= cap && <div style={{ color: '#ffd27a', fontSize: 11 }}>已达上限 {cap} 份，请清理后再建</div>}
            </div>
          </div>
        )}

        {tab === 'edit' && score && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* meta 行 */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={score.meta.title} onChange={(e) => mutateMeta({ title: e.target.value })} style={{ ...inp, width: 140 }} />
              <label style={{ color: 'rgba(160,180,220,.6)' }}>BPM <input type="number" min={40} max={240} value={score.meta.bpm} onChange={(e) => mutateMeta({ bpm: Number(e.target.value) })} style={{ ...inp, width: 56 }} /></label>
              <label style={{ color: 'rgba(160,180,220,.6)' }}>调式 <input value={score.meta.key} onChange={(e) => mutateMeta({ key: e.target.value })} style={{ ...inp, width: 56 }} /></label>
              <label style={{ color: 'rgba(160,180,220,.6)' }}>小节 <input type="number" min={1} max={16} value={score.meta.bars} onChange={(e) => mutateMeta({ bars: Number(e.target.value) })} style={{ ...inp, width: 48 }} /></label>
              <label style={{ color: 'rgba(160,180,220,.6)' }}>摆动 <input type="number" min={0} max={60} value={score.meta.swing ?? 0} onChange={(e) => mutateMeta({ swing: Number(e.target.value) })} style={{ ...inp, width: 48 }} />%</label>
              <button onClick={togglePlay} style={btnPri}>{isPlaying() ? '⏸ 暂停' : '▶ 播放'}</button>
              <button onClick={() => { stop(); setPlayStep(-1) }} style={btn}>■</button>
              <button onClick={doExport} style={btn}>⬇ WAV</button>
              <button onClick={doSave} style={btnPri}>保存</button>
            </div>

            {/* 轨选择 */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {score.tracks.map((t, i) => (
                <button key={i} onClick={() => setCurTrack(i)}
                  style={{ padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${TRACK_COLORS[i % TRACK_COLORS.length]}`, background: i === curTrack ? `${TRACK_COLORS[i % TRACK_COLORS.length]}33` : 'transparent', color: 'inherit' }}>
                  {t.name}（{t.type === 'drum' ? '鼓' : `${t.notes.length} 音`}）
                </button>
              ))}
              <button onClick={addTrack} style={{ ...btn, padding: '3px 8px' }}>+ 轨</button>
            </div>

            {/* 编辑器网格 */}
            <ScoreGrid score={score} curTrack={curTrack} playStep={playStep} onCell={toggleNote} onDrum={toggleDrum} />

            {/* 轨参数（synth）或提示 */}
            {score.tracks[curTrack]?.type === 'synth' && (() => {
              const tr = score.tracks[curTrack] as SynthTrack
              return (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={tr.name} onChange={(e) => mutateTrack(curTrack, { name: e.target.value })} style={{ ...inp, width: 90 }} />
                  <select value={tr.wave} onChange={(e) => mutateTrack(curTrack, { wave: e.target.value })} style={inp}>
                    {WAVES.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <label style={{ color: 'rgba(160,180,220,.6)' }}>截止 <input type="range" min={200} max={12000} value={tr.cutoff} onChange={(e) => mutateTrack(curTrack, { cutoff: Number(e.target.value) })} style={{ width: 100 }} /></label>
                  <label style={{ color: 'rgba(160,180,220,.6)' }}>音量 <input type="range" min={0} max={100} value={Math.round(tr.vol * 100)} onChange={(e) => mutateTrack(curTrack, { vol: Number(e.target.value) / 100 })} style={{ width: 80 }} /></label>
                  <label style={{ color: 'rgba(160,180,220,.6)' }}>八度 <input type="number" min={-2} max={2} value={tr.octaveShift} onChange={(e) => mutateTrack(curTrack, { octaveShift: Number(e.target.value) })} style={{ ...inp, width: 44 }} /></label>
                </div>
              )
            })()}

            {saveMsg && <div style={{ color: saveMsg.ok ? '#5ed6a8' : '#ff6b9d' }}>{saveMsg.text}</div>}
          </div>
        )}

        {tab === 'analyze' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!score && <div style={{ color: 'rgba(160,180,220,.5)', padding: 12 }}>先在谱库打开一份乐谱</div>}
            {score && (
              <>
                <button onClick={doAnalyze} style={{ ...btnPri, alignSelf: 'flex-start' }}>分析当前乐谱</button>
                {analysis && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 600 }}>{analysis.summary}</div>
                    {analysis.outOfScale.length > 0 && (
                      <Section title={`调式外音（${analysis.outOfScale.length}）`} color="#ffd27a">
                        {analysis.outOfScale.map((o, i) => (
                          <div key={i} style={{ fontSize: 11 }}>{o.track} 第 {o.step + 1} 步 {o.note} → 建议 {o.suggest}</div>
                        ))}
                      </Section>
                    )}
                    {analysis.conflicts.length > 0 && (
                      <Section title={`同拍叠音（${analysis.conflicts.length}）`} color="#5ec8ff">
                        {analysis.conflicts.map((c, i) => (
                          <div key={i} style={{ fontSize: 11 }}>{c.track} 第 {c.step + 1} 步：{c.pitches.map((p) => midiToNoteName(p)).join('+')} —— {c.suggest}</div>
                        ))}
                      </Section>
                    )}
                    <Section title="建议" color="#5ed6a8">
                      {analysis.suggestions.map((s, i) => <div key={i} style={{ fontSize: 11 }}>{s}</div>)}
                    </Section>
                    <div style={{ fontSize: 11, color: 'rgba(160,180,220,.6)' }}>
                      每小节密度：{analysis.density.perBarPercent.map((p, i) => `第${i + 1}小节 ${p}%`).join(' · ')}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              主音量 <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} style={{ flex: 1 }} />
            </label>
            <button onClick={() => { setVolume(Math.max(0, volume - 0.1)) }} style={{ display: 'none' }} />
            <div style={{ border: '1px solid rgba(126,232,250,.2)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 600 }}>服务</div>
              <div style={{ fontSize: 11, color: 'rgba(160,180,220,.6)' }}>
                数据面 127.0.0.1 直连（Bearer token，meta 经 cap.kv 分发）；曲谱全文落 appConfigDir/daw-studio/scores，kv 只存索引。零出网。
              </div>
              <button onClick={() => { invalidateMeta(); void loadScores() }} style={{ ...btn, alignSelf: 'flex-start' }}>重连服务</button>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(160,180,220,.5)' }}>
              AI 闭环：对话里 score_create（骨架生成）/ score_write（精确记谱）/ score_analyze（自查）。
              播放与导出在此面板，由你手动触发——AI 不会突然出声。
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 8, padding: 8 }}>
      <div style={{ color, fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{title}</div>
      {children}
    </div>
  )
}

/** 编辑器网格（synth 钢琴卷帘 C2-C6 / drum 4 行）；当前步高亮列游标 */
function ScoreGrid({ score, curTrack, playStep, onCell, onDrum }: {
  score: Score; curTrack: number; playStep: number
  onCell: (step: number, pitch: number) => void
  onDrum: (drum: string, step: number) => void
}) {
  const tr = score.tracks[curTrack]
  const total = score.meta.bars * 16
  const gridStyle: React.CSSProperties = { touchAction: 'none' } // 仅网格禁手势，slider 不受影响
  if (!tr) return null

  if (tr.type === 'drum') {
    const drums = ['kick', 'snare', 'hat', 'clap']
    const labels: Record<string, string> = { kick: '底鼓', snare: '军鼓', hat: '踩镲', clap: '拍手' }
    return (
      <div style={{ ...gridStyle, overflowX: 'auto' }}>
        <div style={{ position: 'relative', width: total * STEP_W + 56 }}>
          {playStep >= 0 && (
            <div style={{ position: 'absolute', left: 56 + playStep * STEP_W, top: 0, bottom: 0, width: STEP_W, background: 'rgba(126,232,250,.12)', pointerEvents: 'none', borderRadius: 3 }} />
          )}
          {drums.map((d) => (
            <div key={d} style={{ display: 'flex', height: ROW_H + 4, alignItems: 'center' }}>
              <div style={{ width: 56, fontSize: 11, color: 'rgba(160,180,220,.6)' }}>{labels[d]}</div>
              {Array.from({ length: total }, (_, s) => {
                const on = (tr as DrumTrack).pattern[d]?.includes(s)
                return (
                  <div key={s} onClick={() => onDrum(d, s)}
                    style={{ width: STEP_W - 2, height: ROW_H, margin: 1, borderRadius: 3, cursor: 'pointer', background: on ? '#7ee8fa' : s % 4 === 0 ? '#202840' : '#1a2030', flexShrink: 0 }} />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 钢琴卷帘：C2(36) - C6(84)，高音在上
  const LO = 36; const HI = 84
  const pitches: number[] = []
  for (let p = HI; p >= LO; p--) pitches.push(p)
  const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12)
  return (
    <div style={{ ...gridStyle, overflowX: 'auto' }}>
      <div style={{ position: 'relative', width: total * STEP_W + 40 }}>
        {playStep >= 0 && (
          <div style={{ position: 'absolute', left: 40 + playStep * STEP_W, top: 0, bottom: 0, width: STEP_W, background: 'rgba(126,232,250,.12)', pointerEvents: 'none', borderRadius: 3 }} />
        )}
        {pitches.map((p) => (
          <div key={p} style={{ display: 'flex', height: ROW_H, alignItems: 'center' }}>
            <div style={{ width: 40, fontSize: 9, color: 'rgba(160,180,220,.5)', background: isBlack(p) ? '#0a0e17' : 'transparent' }}>{p % 12 === 0 ? midiToNoteName(p) : ''}</div>
            {Array.from({ length: total }, (_, s) => {
              const on = (tr as SynthTrack).notes.some((n) => n.step === s && n.pitch === p)
              return (
                <div key={s} onClick={() => onCell(s, p)}
                  style={{ width: STEP_W - 2, height: ROW_H - 2, margin: 1, borderRadius: 2, cursor: 'pointer', flexShrink: 0, background: on ? '#7ee8fa' : isBlack(p) ? (s % 4 === 0 ? '#141a28' : '#0d1119') : s % 4 === 0 ? '#202840' : '#161c2a' }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  background: 'rgba(26,32,48,.8)', border: '1px solid rgba(126,232,250,.2)', color: 'inherit',
  padding: '3px 6px', borderRadius: 4, fontSize: 12,
}
const btn: React.CSSProperties = {
  border: '1px solid rgba(126,232,250,.25)', background: 'rgba(126,232,250,.08)', color: 'inherit',
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
}
const btnPri: React.CSSProperties = {
  ...btn, borderColor: '#7ee8fa', background: 'rgba(126,232,250,.2)',
}
