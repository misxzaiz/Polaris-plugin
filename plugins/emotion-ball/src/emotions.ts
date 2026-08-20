/**
 * EmotionBall v2 — 情绪配置数据
 *
 * 32 个状态，原创设计。ID 分组（通用模式）：
 *   00-09 生命周期 · 10-29 情绪反应 · 30-49 代理状态 · 50+ 自定义
 *
 * 每个情绪引用眼环池索引（眼环由 geometry.genEyeRing 参数化生成），
 * 叠加动画原语（sine/glance/scan/jitter/pulse/blink）与可选关键帧序列。
 *
 * 眼环池速查（genEyeRing 参数组，见 genEyeRings）：
 *   0 平静大眼 · 1 圆睁 · 2 笑眼(下弧闭) · 3 眯眼 · 4 闭合细线
 *   5 斜左 · 6 斜右 · 7 怒目(上压) · 8 困倦半开 · 9 聆听(扁宽)
 *   10 扫读窄 · 11 害羞小 · 12 惊讶大圆 · 13 悲伤下垂 · 14 期待上望
 */

import { genEyeRing, HEAD_C, EYE_HALF } from './geometry'

/** 一组左右眼环 */
export interface EyeRingSet {
  L: number[][]
  R: number[][]
}

/** 左眼中心偏移 */
const L_OFF: [number, number] = [-EYE_HALF - 4, 0]
/** 右眼中心偏移 */
const R_OFF: [number, number] = [EYE_HALF + 4, 0]

/**
 * 15 组参数化眼环。每组生成左+右两只（右眼镜像 tilt）。
 * 参数：(rx, ry, openTop, openBot, tilt, squish)
 */
const RING_PARAMS: number[][] = [
  [17, 20, 1, 1, 0, 0],        // 0 平静大眼（更圆更萌）
  [18, 22, 1.05, 1.05, 0, 0],  // 1 圆睁
  [17, 17, 0.08, 1, 0, 0],     // 2 笑眼(上弧闭)
  [15, 10, 0.5, 0.5, 0, 0.4],  // 3 眯眼
  [15, 2, 0.04, 0.04, 0, 0.6], // 4 闭合细线
  [16, 15, 1, 0.85, -18, 0],  // 5 斜左
  [16, 15, 1, 0.85, 18, 0],   // 6 斜右
  [17, 16, 0.3, 1, 0, 0.2],   // 7 怒目(上压)
  [16, 12, 0.55, 0.55, 0, 0], // 8 困倦半开
  [19, 12, 1, 1, 0, 0],       // 9 聆听(扁宽)
  [14, 9, 0.6, 0.6, 0, 0.3],  // 10 扫读窄
  [12, 13, 0.7, 0.7, 0, 0.1], // 11 害羞小
  [20, 24, 1.1, 1.1, 0, 0],   // 12 惊讶大圆
  [17, 17, 1, 0.4, -10, 0],   // 13 悲伤下垂
  [16, 16, 1, 0.9, -4, 0],    // 14 期待上望
]

/** 生成全部眼环池 */
export function genEyeRings(): EyeRingSet[] {
  return RING_PARAMS.map((p) => {
    const [rx, ry, ot, ob, tilt, sq] = p
    return {
      L: genEyeRing(HEAD_C + L_OFF[0], HEAD_C + L_OFF[1], rx, ry, ot, ob, tilt, sq),
      R: genEyeRing(HEAD_C + R_OFF[0], HEAD_C + R_OFF[1], rx, ry, ot, ob, -tilt, sq),
    }
  })
}

/** 动画原语类型 */
export type AnimType = 'sine' | 'glance' | 'scan' | 'jitter' | 'pulse' | 'blink'
export type AnimTarget = 'eyes' | 'body'
export type AnimProp =
  | 'lookX' | 'lookY' | 'x' | 'y' | 'scale' | 'open' | 'rotate'

export interface Anim {
  target: AnimTarget
  prop: AnimProp
  type: AnimType
  amp?: number
  period?: number
  phase?: number
  speed?: number
  decay?: number
  interval?: number
  dur?: number
}

export interface SequenceFrame {
  at: number
  eyes?: { both?: Partial<EyePose>; left?: Partial<EyePose>; right?: Partial<EyePose> }
  body?: Partial<BodyPose>
}

export interface Sequence {
  settle: 'base' | 'hold' | { next: string }
  frames: SequenceFrame[]
}

export interface BodyPose {
  x: number
  y: number
  scale: number
  rotate: number
  color: string
  breathe: number
  ribbons: number
  confetti: number
  zzz: number
  orbit: number
}

export interface EyePose {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotate: number
  open: number
  color: string
  lookX: number
  lookY: number
}

export interface EmotionDef {
  id: string
  name: string
  group: 'life' | 'emotion' | 'agent' | 'custom'
  desc: string
  en: { name: string; desc: string }
  transition: number
  gaze: boolean
  pool: number[]
  poolMs: [number, number]
  poolSpeed?: number
  blinkMs?: [number, number] | null
  openness?: number
  antics?: boolean
  body?: Partial<BodyPose>
  eyes?: { both?: Partial<EyePose>; left?: Partial<EyePose>; right?: Partial<EyePose> }
  anims?: Anim[]
  sequence?: Sequence
}

export const DEFAULT_BODY: BodyPose = {
  x: 0, y: 0, scale: 1, rotate: 0,
  color: '#F3F0EA', breathe: 0.01,
  ribbons: 0, confetti: 0, zzz: 0, orbit: 0,
}

export const DEFAULT_EYE: EyePose = {
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0,
  open: 1, color: '#1A1A1A', lookX: 0, lookY: 0,
}

/** 32 个情绪定义（原创） */
export const EMOTION_SEED: EmotionDef[] = [
  // ===== 1) 生命周期（8 个） =====
  {
    id: '00', name: '睡眠', group: 'life',
    desc: '闭眼成细线，右上角 zzz 缓缓飘起，只剩缓慢呼吸',
    en: { name: 'Sleeping', desc: 'Eyes closed to thin lines, zzz drifting up, slow breath only' },
    transition: 900, gaze: false,
    pool: [4], poolMs: [6000, 10000], blinkMs: null, openness: 0.08,
    body: { y: 4, rotate: -2, breathe: 0.018, color: '#EEEBE4', zzz: 1 },
    eyes: { both: { y: 4, lookY: 2 } },
    anims: [{ target: 'eyes', prop: 'y', type: 'sine', amp: 1.2, period: 3600 }],
  },
  {
    id: '01', name: '唤醒', group: 'life',
    desc: '从闭合眼环缓缓睁开，揉眼似的眨两下，进入待机',
    en: { name: 'Waking', desc: 'Eyes crack open with groggy blinks, then idle' },
    transition: 320, gaze: false, pool: [4], poolMs: [800, 800], blinkMs: null,
    sequence: {
      settle: { next: '02' },
      frames: [
        { at: 0, eyes: { both: { open: 0.1, y: 4 } } },
        { at: 420, eyes: { left: { open: 0.55, y: 2 }, right: { open: 0.12, y: 4 } } },
        { at: 820, eyes: { both: { open: 0.3, y: 3 } } },
        { at: 1400, eyes: { both: { open: 1, scaleX: 1.12, scaleY: 1.12, y: -2 } } },
        { at: 2100, eyes: { both: { open: 1, y: 0 } } },
      ],
    },
  },
  {
    id: '02', name: '待机放空', group: 'life',
    desc: '左看看、右看看，目光两侧停留，偶尔自旋甩彩带',
    en: { name: 'Idle', desc: 'Glances left and right, occasional ribbon spin' },
    transition: 700, gaze: true,
    pool: [0], poolMs: [9000, 16000], blinkMs: [6000, 14000], antics: true,
    body: { breathe: 0.012 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 10, period: 4800 },
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 2, period: 4100, phase: 1.1 },
    ],
  },
  {
    id: '03', name: '好奇', group: 'life',
    desc: '圆睁与平静眼环快速轮换，头微倾，目光打量',
    en: { name: 'Curious', desc: 'Wide and calm rings rotate quickly, head tilted' },
    transition: 420, gaze: true,
    pool: [1, 0, 14], poolMs: [1800, 3200], blinkMs: [2500, 5500], poolSpeed: 10,
    body: { rotate: 4, breathe: 0.01 },
    eyes: { both: { lookY: -1 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 2.4, period: 2800 }],
  },
  {
    id: '04', name: '倾听', group: 'life',
    desc: '扁宽眼环，目光微向上，缓缓左右扫视',
    en: { name: 'Listening', desc: 'Wide flat eyes, gazing slightly up, slow scan' },
    transition: 500, gaze: true,
    pool: [9], poolMs: [4000, 7000], blinkMs: [4000, 8000],
    eyes: { both: { lookY: -2 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 4, period: 5200 }],
  },
  {
    id: '05', name: '专注', group: 'life',
    desc: '眯眼窄环，目光锁定正前方，呼吸极缓',
    en: { name: 'Focused', desc: 'Narrow eyes locked forward, slow breath' },
    transition: 400, gaze: true,
    pool: [10], poolMs: [8000, 12000], blinkMs: [5000, 10000],
    body: { breathe: 0.006 },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'sine', amp: 0.8, period: 6000 }],
  },
  {
    id: '06', name: '困惑', group: 'life',
    desc: '一只眼圆睁一只眼微眯，头歪，目光游移',
    en: { name: 'Confused', desc: 'One eye wide, one squinting, head tilted, wandering gaze' },
    transition: 500, gaze: true,
    pool: [1, 3], poolMs: [2500, 4500], blinkMs: [3000, 6000],
    body: { rotate: 6 },
    eyes: { left: { scaleY: 0.6 }, right: { scaleY: 1 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 3, speed: 0.4, decay: 0 }],
  },
  {
    id: '07', name: '走神', group: 'life',
    desc: '眼环缓慢上翻，呼吸绵长，对外界短暂失焦',
    en: { name: 'Dazing', desc: 'Eyes drift up slowly, long breath, zoning out' },
    transition: 800, gaze: false,
    pool: [14, 4], poolMs: [5000, 8000], blinkMs: [8000, 14000], openness: 0.7,
    anims: [{ target: 'eyes', prop: 'lookY', type: 'sine', amp: 5, period: 8000 }],
  },

  // ===== 2) 情绪反应（12 个） =====
  {
    id: '10', name: '开心', group: 'emotion',
    desc: '笑眼弯弯，头微抬，身体轻弹',
    en: { name: 'Happy', desc: 'Smiling crescent eyes, slight bounce' },
    transition: 360, gaze: true,
    pool: [2, 0], poolMs: [2200, 4000], blinkMs: [3000, 6000],
    body: { y: -2, breathe: 0.02, color: '#FFF6E0' },
    anims: [
      { target: 'body', prop: 'y', type: 'sine', amp: 3, period: 1600 },
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 4, period: 3000 },
    ],
  },
  {
    id: '11', name: '大笑', group: 'emotion',
    desc: '笑眼全闭，身体上下颤动，撒花庆祝',
    en: { name: 'Laughing', desc: 'Eyes fully shut, body shaking, confetti burst' },
    transition: 300, gaze: false,
    pool: [4], poolMs: [1500, 2500], blinkMs: null, openness: 0.06,
    body: { breathe: 0.03, color: '#FFE3B3', confetti: 1 },
    anims: [{ target: 'body', prop: 'y', type: 'jitter', amp: 2, speed: 8, decay: 0 }],
  },
  {
    id: '12', name: '害羞', group: 'emotion',
    desc: '小眼环，目光躲闪向右下，体色泛粉',
    en: { name: 'Shy', desc: 'Small eyes, gaze darting away, blushing pink' },
    transition: 600, gaze: true,
    pool: [11], poolMs: [3000, 5000], blinkMs: [2500, 5000],
    body: { color: '#F9D7D0', rotate: -3 },
    eyes: { both: { lookX: 6, lookY: 4 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 2, speed: 0.3, decay: 0 }],
  },
  {
    id: '13', name: '惊讶', group: 'emotion',
    desc: '眼睛瞬间圆睁，身体后仰，定格一瞬',
    en: { name: 'Surprised', desc: 'Eyes snap wide, body leans back, freezes' },
    transition: 150, gaze: true,
    pool: [12], poolMs: [1500, 2500], blinkMs: [1500, 3000],
    sequence: {
      settle: 'hold',
      frames: [
        { at: 0, eyes: { both: { scaleX: 1.3, scaleY: 1.3 } }, body: { y: -3, scale: 1.04 } },
        { at: 600, eyes: { both: { scaleX: 1, scaleY: 1 } }, body: { y: 0, scale: 1 } },
      ],
    },
  },
  {
    id: '14', name: '生气', group: 'emotion',
    desc: '怒目上压，头前倾，体色变红，呼吸急促',
    en: { name: 'Angry', desc: 'Furrowed eyes, head forward, reddening, fast breath' },
    transition: 280, gaze: true,
    pool: [7], poolMs: [2000, 3500], blinkMs: [2000, 4000],
    body: { y: 2, rotate: 0, breathe: 0.03, color: '#F4C0B0' },
    eyes: { both: { lookY: -2 } },
    anims: [{ target: 'body', prop: 'y', type: 'jitter', amp: 1, speed: 6, decay: 0 }],
  },
  {
    id: '15', name: '悲伤', group: 'emotion',
    desc: '眼角下垂，头低垂，体色变冷灰蓝',
    en: { name: 'Sad', desc: 'Drooping eyes, head down, cool grey-blue tone' },
    transition: 700, gaze: false,
    pool: [13], poolMs: [4000, 7000], blinkMs: [5000, 9000], openness: 0.7,
    body: { y: 6, rotate: 2, color: '#D8DCE4', breathe: 0.008 },
    eyes: { both: { lookY: 3 } },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'sine', amp: 1.5, period: 5000 }],
  },
  {
    id: '16', name: '得意', group: 'emotion',
    desc: '笑眼半闭，头微仰，彩带环绕',
    en: { name: 'Smug', desc: 'Half-closed smiling eyes, head back, orbiting ribbon' },
    transition: 500, gaze: true,
    pool: [2], poolMs: [3000, 5000], blinkMs: [4000, 8000],
    body: { y: -3, rotate: -4, color: '#FBE6C2', orbit: 1 },
    eyes: { both: { lookY: -3 } },
  },
  {
    id: '17', name: '期待', group: 'emotion',
    desc: '眼环上望微睁，身体前倾轻晃',
    en: { name: 'Expectant', desc: 'Eyes looking up, leaning forward, swaying' },
    transition: 450, gaze: true,
    pool: [14], poolMs: [2000, 3500], blinkMs: [3000, 6000], poolSpeed: 8,
    body: { y: -1, color: '#E8F0E4' },
    eyes: { both: { lookY: -4 } },
    anims: [
      { target: 'body', prop: 'x', type: 'sine', amp: 2, period: 2400 },
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 2, period: 1800 },
    ],
  },
  {
    id: '18', name: '困惑恼', group: 'emotion',
    desc: '一只眯眼一只斜眼，头歪，目光斜视',
    en: { name: 'Puzzled', desc: 'One squint one slanted, head tilted, sidelong gaze' },
    transition: 500, gaze: true,
    pool: [3, 5], poolMs: [2500, 4500], blinkMs: [3000, 6000],
    body: { rotate: 5 },
    eyes: { left: { scaleX: 0.9 }, right: { scaleX: 0.7, lookX: 4 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'glance', amp: 3, period: 3600 }],
  },
  {
    id: '19', name: '宠爱', group: 'emotion',
    desc: '笑眼眯成月牙，体色温暖，目光柔和',
    en: { name: 'Adoring', desc: 'Crescent smiling eyes, warm tone, soft gaze' },
    transition: 600, gaze: true,
    pool: [2, 11], poolMs: [3000, 5000], blinkMs: [4000, 7000],
    body: { color: '#FBEAD8', breathe: 0.014 },
    eyes: { both: { lookY: 1 } },
  },
  {
    id: '20', name: '激动', group: 'emotion',
    desc: '圆睁眼环快速轮换，身体颤抖，撒花',
    en: { name: 'Excited', desc: 'Wide eyes rotating fast, trembling, confetti' },
    transition: 200, gaze: true,
    pool: [12, 1], poolMs: [800, 1600], blinkMs: [2000, 4000], poolSpeed: 12,
    body: { color: '#FDD9C0', confetti: 1, breathe: 0.025 },
    anims: [{ target: 'body', prop: 'y', type: 'jitter', amp: 1.5, speed: 10, decay: 0 }],
  },
  {
    id: '21', name: '淡定', group: 'emotion',
    desc: '平静大眼，呼吸平稳，目光不游移',
    en: { name: 'Calm', desc: 'Calm wide eyes, steady breath, no wandering gaze' },
    transition: 600, gaze: true,
    pool: [0], poolMs: [10000, 16000], blinkMs: [6000, 12000],
    body: { breathe: 0.01, color: '#EDEDEA' },
  },

  // ===== 3) 代理状态（12 个） =====
  {
    id: '30', name: '思考', group: 'agent',
    desc: '目光上望，头顶常驻环带环绕，呼吸绵长',
    en: { name: 'Thinking', desc: 'Gaze upward, orbiting ribbon overhead, slow breath' },
    transition: 400, gaze: true,
    pool: [14, 0], poolMs: [3000, 5000], blinkMs: [4000, 7000],
    body: { orbit: 1, breathe: 0.008, color: '#E4E8F0' },
    eyes: { both: { lookY: -3 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 1.5, period: 4000 }],
  },
  {
    id: '31', name: '检索', group: 'agent',
    desc: '窄眼环快速左右扫读，目光高频扫动',
    en: { name: 'Searching', desc: 'Narrow eyes scanning rapidly left-right' },
    transition: 250, gaze: true,
    pool: [10], poolMs: [1200, 2000], blinkMs: [3000, 6000], poolSpeed: 10,
    anims: [{ target: 'eyes', prop: 'lookX', type: 'scan', amp: 8, period: 1400 }],
  },
  {
    id: '32', name: '读写', group: 'agent',
    desc: '眯眼向下，目光随行轻轻上下扫',
    en: { name: 'Reading', desc: 'Squinting down, eyes tracking up-down gently' },
    transition: 350, gaze: true,
    pool: [3], poolMs: [3000, 5000], blinkMs: [4000, 8000],
    eyes: { both: { lookY: 5 } },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'scan', amp: 3, period: 2000 }],
  },
  {
    id: '33', name: '生成', group: 'agent',
    desc: '平静眼环，目光微向右下，呼吸平稳有节律',
    en: { name: 'Generating', desc: 'Calm eyes, gaze right-down, rhythmic breath' },
    transition: 300, gaze: true,
    pool: [0], poolMs: [4000, 7000], blinkMs: [5000, 9000],
    eyes: { both: { lookX: 3, lookY: 2 } },
    anims: [{ target: 'body', prop: 'scale', type: 'pulse', amp: 0.012, period: 2400 }],
  },
  {
    id: '34', name: '校验', group: 'agent',
    desc: '眼环快速眨动，目光锁定，偶有微抖',
    en: { name: 'Verifying', desc: 'Rapid blinks, locked gaze, slight jitter' },
    transition: 300, gaze: true,
    pool: [1], poolMs: [2000, 3500], blinkMs: [800, 1600],
    eyes: { both: { lookY: -1 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 1, speed: 0.6, decay: 0 }],
  },
  {
    id: '35', name: '出错', group: 'agent',
    desc: '圆睁一瞬，体色变红，目光游移不定',
    en: { name: 'Error', desc: 'Snap wide, reddening, darting gaze' },
    transition: 180, gaze: true,
    pool: [12, 7], poolMs: [1000, 1800], blinkMs: [1500, 3000], poolSpeed: 12,
    body: { color: '#F4B8A8', breathe: 0.03 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 4, speed: 0.8, decay: 0 }],
  },
  {
    id: '36', name: '完成', group: 'agent',
    desc: '笑眼弯弯，撒花庆祝，随即回待机',
    en: { name: 'Done', desc: 'Smiling eyes, confetti, then back to idle' },
    transition: 300, gaze: true,
    pool: [2], poolMs: [1500, 2500], blinkMs: [3000, 6000],
    body: { color: '#E0F0D8', confetti: 1 },
    sequence: { settle: { next: '02' }, frames: [] },
  },
  {
    id: '37', name: '等待输入', group: 'agent',
    desc: '平静眼环，目光居中，呼吸平缓，偶尔眨眼',
    en: { name: 'Awaiting', desc: 'Calm centered gaze, slow breath, occasional blink' },
    transition: 500, gaze: true,
    pool: [0], poolMs: [6000, 10000], blinkMs: [4000, 8000],
    body: { breathe: 0.01 },
  },
  {
    id: '38', name: '调用工具', group: 'agent',
    desc: '眯眼窄环，目光斜向，身体微前倾',
    en: { name: 'Tool use', desc: 'Narrow slanted eyes, leaning forward' },
    transition: 280, gaze: true,
    pool: [10, 5], poolMs: [1800, 3000], blinkMs: [3000, 6000], poolSpeed: 8,
    body: { y: 1, rotate: -2 },
    eyes: { both: { lookX: 4, lookY: -1 } },
  },
  {
    id: '39', name: '深思考', group: 'agent',
    desc: '闭眼成线，头低垂，环带环绕，呼吸极缓',
    en: { name: 'Deep thought', desc: 'Eyes shut, head down, orbiting ribbon, very slow breath' },
    transition: 600, gaze: false,
    pool: [4], poolMs: [5000, 8000], blinkMs: null, openness: 0.1,
    body: { y: 5, rotate: 3, orbit: 1, breathe: 0.005, color: '#DCE2EC' },
    eyes: { both: { lookY: 3 } },
  },
  {
    id: '40', name: '组织语言', group: 'agent',
    desc: '眼环半开，目光微游移，呼吸有节律',
    en: { name: 'Composing', desc: 'Half-open eyes, slight gaze drift, rhythmic breath' },
    transition: 350, gaze: true,
    pool: [8], poolMs: [2500, 4000], blinkMs: [3500, 7000],
    eyes: { both: { lookY: 1 } },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 2, period: 3200 },
      { target: 'body', prop: 'scale', type: 'pulse', amp: 0.01, period: 2000 },
    ],
  },
  {
    id: '41', name: '回顾', group: 'agent',
    desc: '眯眼向上望，目光回顾，呼吸缓慢',
    en: { name: 'Reviewing', desc: 'Squinting upward, recollecting, slow breath' },
    transition: 450, gaze: true,
    pool: [3, 14], poolMs: [3000, 5000], blinkMs: [4000, 8000],
    eyes: { both: { lookY: -4 } },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'glance', amp: 3, period: 4000 }],
  },
]
