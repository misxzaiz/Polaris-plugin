/**
 * core.test.mjs —— shared/core 纯函数层单测（node --test，零依赖零网络）
 * 覆盖：schema validator（拦截 AI 幻觉值/音名兼容/every2 快捷）、旋律引擎
 * （确定性可复现/100% 在调上/无声部冲突/全部 style）、analyze 自查（轨外音报出/
 * 冲突检测/留白提示）、工具（音名转换/调式解析/时长估算/索引投影）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const core = require('../shared/core.js')

// ── 工具函数 ────────────────────────────────────────────────────────────────

test('音名↔MIDI 双向：C4=60 A4=69 C#4=61 Bb3=58', () => {
  assert.equal(core.noteNameToMidi('C4'), 60)
  assert.equal(core.noteNameToMidi('A4'), 69)
  assert.equal(core.noteNameToMidi('C#4'), 61)
  assert.equal(core.noteNameToMidi('Bb3'), 58)
  assert.equal(core.noteNameToMidi('C-1'), 0)
  assert.equal(core.noteNameToMidi('H4'), null)
  assert.equal(core.noteNameToMidi(''), null)
  assert.equal(core.midiToNoteName(60), 'C4')
  assert.equal(core.midiToNoteName(69), 'A4')
  assert.equal(core.midiToNoteName(61), 'C#4')
})

test('调式解析：C 大调 / Am 小调 / F#m / 非法', () => {
  assert.deepEqual(core.parseKey('C'), { rootPc: 0, mode: 'maj' })
  assert.deepEqual(core.parseKey('Am'), { rootPc: 9, mode: 'min' })
  assert.deepEqual(core.parseKey('F#m'), { rootPc: 6, mode: 'min' })
  assert.deepEqual(core.parseKey('Bb'), { rootPc: 10, mode: 'maj' })
  assert.equal(core.parseKey('X'), null)
  assert.equal(core.parseKey(''), null)
})

test('调式内判断：Am 调 A4/ C5 在内、F# 在外', () => {
  const am = core.parseKey('Am')
  assert.equal(core.inScale(69, am), true)   // A4
  assert.equal(core.inScale(72, am), true)   // C5
  assert.equal(core.inScale(66, am), false)  // F#
  assert.equal(core.inScale(70, am), false)  // A#
})

// ── validator：AI 幻觉拦截 ──────────────────────────────────────────────────

function baseScore() {
  return {
    meta: { title: 't', bpm: 120, key: 'C', bars: 1 },
    tracks: [
      { name: 'Lead', type: 'synth', notes: [{ step: 0, pitch: 60, len: 2, vel: 0.8 }] },
    ],
  }
}

test('validator：合法谱通过且清洗（音名 pitch 兼容、默认值补齐）', () => {
  const s = baseScore()
  s.tracks[0].notes = [{ step: 0, pitch: 'C4', len: 2 }, { step: 4, pitch: 'E4', vel: 0.5 }]
  const r = core.validateScore(s)
  assert.equal(r.ok, true, JSON.stringify(r.errors))
  assert.equal(r.score.tracks[0].notes[0].pitch, 60)
  assert.equal(r.score.tracks[0].notes[0].vel, 0.8) // 默认 vel
  assert.equal(r.score.tracks[0].wave, 'sawtooth')  // 默认波形
  assert.equal(r.score.tracks[0].cutoff, 2000)      // 默认截止
})

test('validator：pitch 越界（999 / MIDI 域外）被拦', () => {
  const s = baseScore()
  s.tracks[0].notes[0].pitch = 999
  const r = core.validateScore(s)
  assert.equal(r.ok, false)
  assert.ok(r.errors[0].includes('pitch'), r.errors[0])
  s.tracks[0].notes[0].pitch = 10 // < 21
  assert.equal(core.validateScore(s).ok, false)
})

test('validator：step 越界被拦（bars=1 → 0-15）', () => {
  const s = baseScore()
  s.tracks[0].notes[0].step = 16
  const r = core.validateScore(s)
  assert.equal(r.ok, false)
  assert.ok(r.errors[0].includes('step'), r.errors[0])
})

test('validator：bpm/bars 域外、key 非法、title 空', () => {
  let s = baseScore(); s.meta.bpm = 500
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore(); s.meta.bars = 0
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore(); s.meta.key = 'Hertz'
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore(); s.meta.title = '  '
  assert.equal(core.validateScore(s).ok, false)
})

test('validator：轨名重复被拦、轨数超限、音符总数超限', () => {
  let s = baseScore(); s.tracks.push({ name: 'Lead', notes: [] })
  let r = core.validateScore(s)
  assert.equal(r.ok, false); assert.ok(r.errors[0].includes('重复'))
  s = baseScore()
  s.tracks = Array.from({ length: 17 }, (_, i) => ({ name: `t${i}`, notes: [] }))
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore()
  s.tracks[0].notes = Array.from({ length: 513 }, (_, i) => ({ step: i % 16, pitch: 60 }))
  assert.equal(core.validateScore(s).ok, false)
})

test('validator：鼓轨 every2 快捷展开 + 步号越界拦截', () => {
  const s = baseScore()
  s.tracks[0] = { name: 'Drums', type: 'drum', pattern: { kick: [0, 4], hat: 'every2', snare: [20] } }
  const r = core.validateScore(s)
  assert.equal(r.ok, false) // snare 20 越界（bars=1）
  s.tracks[0].pattern.snare = [8]
  const r2 = core.validateScore(s)
  assert.equal(r2.ok, true, JSON.stringify(r2.errors))
  assert.equal(r2.score.tracks[0].pattern.hat.length, 8) // 0,2,4,...,14
})

test('validator：vel/len/cutoff/octaveShift 域外', () => {
  let s = baseScore(); s.tracks[0].notes[0].vel = 2
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore(); s.tracks[0].notes[0].len = 0
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore(); s.tracks[0].cutoff = 50
  assert.equal(core.validateScore(s).ok, false)
  s = baseScore(); s.tracks[0].octaveShift = 5
  assert.equal(core.validateScore(s).ok, false)
})

// ── 旋律引擎：确定性 + 可听性约束 ───────────────────────────────────────────

test('引擎：同骨架两次展开结果逐字节一致（可复现）', () => {
  const sk = { title: 'loop', bpm: 96, key: 'Am', bars: 4, style: 'arpeggio' }
  const a = core.generateScore(sk)
  const b = core.generateScore(sk)
  assert.equal(a.ok, true)
  assert.deepEqual(a.score, b.score)
})

test('引擎：arpeggio 输出 100% 在调上且 validator 通过', () => {
  const r = core.generateScore({ title: 'x', key: 'Am', bars: 4, style: 'arpeggio' })
  assert.equal(r.ok, true, JSON.stringify(r.errors))
  const am = core.parseKey('Am')
  const lead = r.score.tracks.find((t) => t.name === 'Lead')
  for (const n of lead.notes) {
    assert.equal(core.inScale(n.pitch, am), true, `pitch ${n.pitch}(${core.midiToNoteName(n.pitch)}) 轨外`)
  }
})

test('引擎：全部五种 style 产出合法谱', () => {
  for (const style of core.STYLES) {
    const r = core.generateScore({ title: 'x', key: 'C', bars: 2, style })
    assert.equal(r.ok, true, `${style}: ${JSON.stringify(r.errors)}`)
    const v = core.validateScore(r.score)
    assert.equal(v.ok, true, `${style} 自校验失败: ${JSON.stringify(v.errors)}`)
  }
})

test('引擎：progression 校验——调外和弦给出可用和弦列表', () => {
  const r = core.generateScore({ title: 'x', key: 'Am', bars: 4, progression: ['X13'] })
  assert.equal(r.ok, false)
  assert.ok(r.errors[0].includes('Am'), r.errors[0]) // 提示里含可用和弦
  const ok = core.generateScore({ title: 'x', key: 'Am', bars: 4, progression: ['Am', 'F', 'C', 'G'] })
  assert.equal(ok.ok, true, JSON.stringify(ok.errors))
})

test('引擎：bass 严格低于 lead（声部不交叠）', () => {
  const r = core.generateScore({ title: 'x', key: 'C', bars: 2, style: 'melody' })
  assert.equal(r.ok, true)
  const lead = r.score.tracks.find((t) => t.name === 'Lead')
  const bass = r.score.tracks.find((t) => t.name === 'Bass')
  const leadMin = Math.min(...lead.notes.map((n) => n.pitch))
  const bassMax = Math.max(...bass.notes.map((n) => n.pitch))
  assert.ok(bassMax < leadMin, `bass 最高 ${bassMax} 不应高于 lead 最低 ${leadMin}`)
})

test('引擎：progression 超过 bars 时截断、不足时循环补齐', () => {
  const r = core.generateScore({ title: 'x', key: 'C', bars: 8, progression: ['C', 'F', 'G'] })
  assert.equal(r.ok, true)
  assert.equal(r.score.meta.bars, 8)
})

// ── analyze 自查闭环 ────────────────────────────────────────────────────────

test('analyze：轨外音如实报出并给最近替换音', () => {
  const s = baseScore()
  s.meta.key = 'C'
  s.tracks[0].notes = [{ step: 0, pitch: 66, len: 2 }] // F# 在 C 大调外
  const a = core.analyzeScore(s)
  assert.equal(a.outOfScale.length, 1)
  assert.equal(a.outOfScale[0].note, 'F#4')
  assert.ok(a.outOfScale[0].suggest.length > 0)
  assert.ok(a.suggestions.join('').includes('调式外'))
})

test('analyze：同轨同拍多音报冲突', () => {
  const s = baseScore()
  s.tracks[0].notes = [{ step: 0, pitch: 60 }, { step: 0, pitch: 64 }]
  const a = core.analyzeScore(s)
  assert.equal(a.conflicts.length, 1)
  assert.deepEqual(a.conflicts[0].pitches, [60, 64])
})

test('analyze：空小节留白提示 + 干净谱给「无明显异常」', () => {
  let s = baseScore()
  s.meta.bars = 2
  s.tracks[0].notes = [{ step: 0, pitch: 60 }]
  let a = core.analyzeScore(s)
  assert.ok(a.suggestions.join('').includes('静音'), a.suggestions.join(''))
  s = core.generateScore({ title: 'x', key: 'C', bars: 2, style: 'melody' }).score
  a = core.analyzeScore(s)
  assert.deepEqual(a.outOfScale, [])
  assert.ok(a.suggestions.some((x) => x.includes('无明显异常')))
})

// ── 投影与时长 ──────────────────────────────────────────────────────────────

test('时长估算与索引投影瘦身', () => {
  const s = core.generateScore({ title: 'x', key: 'C', bars: 4, bpm: 120 }).score
  assert.equal(core.estimateDuration(s.meta), 8) // 4 小节 @120BPM = 8s
  const idx = core.projectIndex(s, 'abc', 1700000000000)
  assert.deepEqual(Object.keys(idx).sort(), ['bars', 'bpm', 'dur', 'id', 'key', 'title', 'tracks', 'updatedAt'])
  assert.ok(JSON.stringify(idx).length < 300)
})
