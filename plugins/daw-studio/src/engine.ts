/**
 * engine.ts —— Web Audio 演奏引擎（面板侧）
 *
 * 调度器：lookahead 范式（setInterval 25ms + lookahead 0.1s，ac.currentTime 精确排程
 * 16 分音符）替换原型的 rAF 步进——AI 谱面节奏被精确还原（rAF 掉帧必漂）。
 * swing 应用：偶数步不动，奇数步 +stepDur×swing%。
 * voice cap 16：同刻超出发声按 vel 优先级截断（低端 Android webview 护栏）。
 * 自动播放纪律：resume 只在用户手势回调里调用（引擎不自动出声）。
 */

import type { Score, Track, SynthTrack, DrumTrack, Note } from './model'

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD = 0.1 // 秒
const VOICE_CAP = 16

export interface EngineStatus {
  playing: boolean
  step: number
}

/** 活跃发声计数（voice cap） */
let activeVoices = 0

function noteFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

/** 合成器音符（波形+低通+包络；经轨 gain 出） */
function playSynthNote(ac: AudioContext, out: GainNode, tr: SynthTrack, n: Note, t: number, stepDur: number): void {
  if (activeVoices >= VOICE_CAP) return
  activeVoices++
  const dur = Math.max(0.05, n.len * stepDur)
  const o = ac.createOscillator()
  const g = ac.createGain()
  const f = ac.createBiquadFilter()
  o.type = tr.wave as OscillatorType
  const octave = (tr.octaveShift || 0) * 12
  o.frequency.value = noteFreq(n.pitch + octave)
  f.type = 'lowpass'
  f.frequency.value = tr.cutoff
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(Math.max(0.02, n.vel * tr.vol), t + 0.01)
  g.gain.linearRampToValueAtTime(Math.max(0.01, n.vel * tr.vol * 0.7), t + 0.05)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(f); f.connect(g); g.connect(out)
  o.start(t)
  o.stop(t + dur + 0.02)
  o.onended = () => { activeVoices-- }
}

// ── 鼓合成（全合成，无采样）─────────────────────────────────────────────────

function playKick(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  const o = ac.createOscillator(); const g = ac.createGain()
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15)
  g.gain.setValueAtTime(0.6 * vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.22)
}

function noiseBuf(ac: AudioContext, sec: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * sec), ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function playSnare(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  const src = ac.createBufferSource(); src.buffer = noiseBuf(ac, 0.2)
  const g = ac.createGain(); const f = ac.createBiquadFilter()
  f.type = 'highpass'; f.frequency.value = 1000
  g.gain.setValueAtTime(0.3 * vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
  src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + 0.16)
}

function playHat(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  const src = ac.createBufferSource(); src.buffer = noiseBuf(ac, 0.05)
  const g = ac.createGain(); const f = ac.createBiquadFilter()
  f.type = 'highpass'; f.frequency.value = 7000
  g.gain.setValueAtTime(0.15 * vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
  src.connect(f); f.connect(g); g.connect(out); src.start(t); src.stop(t + 0.06)
}

function playClap(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  for (let i = 0; i < 3; i++) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf(ac, 0.05)
    const g = ac.createGain(); const f = ac.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = 1500
    const tt = t + i * 0.01
    g.gain.setValueAtTime(0.2 * vol, tt)
    g.gain.exponentialRampToValueAtTime(0.001, tt + 0.1)
    src.connect(f); f.connect(g); g.connect(out); src.start(tt); src.stop(tt + 0.12)
  }
}

const DRUM_FN: Record<string, (ac: AudioContext, out: AudioNode, t: number, vol: number) => void> = {
  kick: playKick, snare: playSnare, hat: playHat, clap: playClap,
}

/** 试听单击（用户手势回调里用；不调度器） */
export function auditionNote(tr: SynthTrack, pitch: number): void {
  const ac = ensureAc()
  if (!ac) return
  const g = ac.createGain(); g.gain.value = tr.vol; g.connect(ac.destination)
  playSynthNote(ac, g, tr, { step: 0, pitch, len: 2, vel: 0.8 }, ac.currentTime, 0.125)
}

// ── 调度器 ──────────────────────────────────────────────────────────────────

let ac: AudioContext | null = null
let masterGain: GainNode | null = null
let timer: number | null = null
let nextStepTime = 0
let currentStep = 0
let score: Score | null = null
let onStep: ((step: number) => void) | null = null

export function ensureAc(): AudioContext | null {
  if (ac) return ac
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ac = new AC()
  return ac
}

/** 用户手势回调里调用（自动播放纪律） */
export function ensureRunning(): boolean {
  const a = ensureAc()
  if (!a) return false
  if (a.state === 'suspended') void a.resume()
  return true
}

export function setVolume(v: number): void {
  if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v))
}

export function isPlaying(): boolean { return timer != null }

export function play(s: Score, cb?: (step: number) => void): string | null {
  const a = ensureAc()
  if (!a) return '此环境不支持 Web Audio'
  if (a.state === 'suspended') void a.resume()
  if (timer != null) stop()
  score = s
  onStep = cb || null
  currentStep = 0
  nextStepTime = a.currentTime + 0.06
  if (!masterGain) { masterGain = a.createGain(); masterGain.connect(a.destination) }
  masterGain.gain.value = 0.9
  timer = window.setInterval(schedule, LOOKAHEAD_MS)
  return null
}

export function stop(): void {
  if (timer != null) { clearInterval(timer); timer = null }
  currentStep = 0
}

export function setScore(s: Score): void { score = s }

function schedule(): void {
  const a = ac
  const s = score
  if (!a || !s || timer == null) return
  const stepDur = 60 / s.meta.bpm / 4
  const swingPct = s.meta.swing || 0
  const totalSteps = s.meta.bars * 16
  while (nextStepTime < a.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(a, s, currentStep, nextStepTime, stepDur)
    if (onStep) {
      // UI 高亮按音频时钟排（回调在事件发生时刻附近触发）
      const delayMs = Math.max(0, (nextStepTime - a.currentTime) * 1000)
      const stepAt = currentStep
      window.setTimeout(() => onStep && onStep(stepAt), delayMs)
    }
    // swing：奇数步（16 分 swing 的 off-beat）推迟
    const swingOffset = (currentStep % 2 === 1) ? stepDur * (swingPct / 100) : 0
    nextStepTime += stepDur + swingOffset
    currentStep = (currentStep + 1) % totalSteps
  }
}

function scheduleStep(a: AudioContext, s: Score, step: number, t: number, stepDur: number): void {
  // swing 前移：本步排程时刻若为奇数步，需加上 swing（与推进量一致）
  const swingOffset = (step % 2 === 1) ? stepDur * ((s.meta.swing || 0) / 100) : 0
  const tt = t + swingOffset
  for (const tr of s.tracks) {
    if (tr.type === 'drum') scheduleDrumStep(a, tr, step, tt, stepDur)
    else scheduleSynthStep(a, tr, step, tt, stepDur)
  }
}

function scheduleSynthStep(a: AudioContext, tr: SynthTrack, step: number, t: number, stepDur: number): void {
  const trackGain = a.createGain()
  trackGain.gain.value = tr.vol
  trackGain.connect(masterGain!)
  for (const n of tr.notes) {
    if (n.step === step) playSynthNote(a, trackGain, { ...tr, vol: 1 }, n, t, stepDur)
  }
}

function scheduleDrumStep(a: AudioContext, tr: DrumTrack, step: number, t: number, _stepDur: number): void {
  for (const [name, steps] of Object.entries(tr.pattern)) {
    const fn = DRUM_FN[name]
    if (fn && Array.isArray(steps) && steps.includes(step)) fn(a, masterGain!, t, tr.vol)
  }
}

// ── WAV 导出（OfflineAudioContext 离线渲染；44.1k 双声道修原型 mono 缺陷）───

export async function exportWav(s: Score): Promise<Blob | null> {
  const AC = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext
  if (!AC) return null
  const sampleRate = 44100
  const dur = s.meta.bars * 16 * (60 / s.meta.bpm / 4) + 0.5
  const oc = new AC(2, Math.ceil(sampleRate * dur), sampleRate)
  const og = oc.createGain(); og.gain.value = 0.9; og.connect(oc.destination)
  const stepDur = 60 / s.meta.bpm / 4
  const swingPct = s.meta.swing || 0
  const activeVoicesLocal = { n: 0 }
  for (const tr of s.tracks) {
    const tg = oc.createGain(); tg.gain.value = tr.vol; tg.connect(og)
    if (tr.type === 'drum') {
      for (const [name, steps] of Object.entries(tr.pattern)) {
        const fn = DRUM_FN[name]
        if (!fn || !Array.isArray(steps)) continue
        for (const step of steps) {
          const t = step * stepDur + ((step % 2 === 1) ? stepDur * (swingPct / 100) : 0)
          if (t < dur - 0.4) fn(oc as unknown as AudioContext, tg, t, 1)
        }
      }
    } else {
      for (const n of tr.notes) {
        if (activeVoicesLocal.n >= VOICE_CAP) break
        activeVoicesLocal.n++
        const t = n.step * stepDur + ((n.step % 2 === 1) ? stepDur * (swingPct / 100) : 0)
        const durN = Math.max(0.05, n.len * stepDur)
        const o = oc.createOscillator(); const g = oc.createGain(); const f = oc.createBiquadFilter()
        o.type = tr.wave as OscillatorType
        o.frequency.value = noteFreq(n.pitch + (tr.octaveShift || 0) * 12)
        f.type = 'lowpass'; f.frequency.value = tr.cutoff
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(Math.max(0.02, n.vel), t + 0.01)
        g.gain.linearRampToValueAtTime(Math.max(0.01, n.vel * 0.7), t + 0.05)
        g.gain.exponentialRampToValueAtTime(0.001, t + durN)
        o.connect(f); f.connect(g); g.connect(tg)
        o.start(t); o.stop(t + durN + 0.02)
      }
    }
  }
  const rendered = await oc.startRendering()
  return encodeWav(rendered)
}

function encodeWav(buf: AudioBuffer): Blob {
  const numCh = buf.numberOfChannels
  const len = buf.length
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = len * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  const ws = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numCh, true)
  view.setUint32(24, buf.sampleRate, true); view.setUint32(28, buf.sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true)
  ws(36, 'data'); view.setUint32(40, dataSize, true)
  const chans: Float32Array[] = []
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c))
  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]))
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}
