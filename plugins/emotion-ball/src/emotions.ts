/**
 * EmotionBall v3 — 情绪配置数据
 *
 * 32 个状态，原创设计。ID 分组：
 *   00-09 生命周期 · 10-29 情绪反应 · 30-49 代理状态 · 50+ 自定义
 *
 * v3 采用「眼白+瞳孔+嘴巴」方案，弃用 48 点眼环球面投影
 * （该方案有火柴人式轮廓眼 + 球面投影缩放爆炸问题，不够萌）。
 */

import { HEAD_C } from './geometry'

/** 嘴巴类型 */
export type MouthType = 'smile' | 'happy' | 'sad' | 'open' | 'o' | 'w' | 'flat' | 'none' | 'pout'

/** 嘴巴姿态 */
export interface MouthPose {
  type: MouthType
  width: number  // 0.1-1，嘴宽
  open: number   // 0-1，张合度
}

/** 身体姿态 */
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

/** 眼睛姿态 */
export interface EyePose {
  x: number
  y: number
  open: number    // 0=闭合, 1=全开, >1 睁大
  lookX: number   // -1..1, 瞳孔水平偏移（相对眼睛中心）
  lookY: number   // -1..1, 瞳孔垂直偏移
  squint: number  // 0-1, 眯眼（微笑眼）程度
}

/** 情绪定义 */
export interface EmotionDef {
  id: string
  name: string
  group: 'life' | 'emotion' | 'agent' | 'custom'
  desc: string
  en: { name: string; desc: string }
  transition: number
  gaze: boolean
  blinkMs?: [number, number] | null
  openness?: number
  antics?: boolean
  body?: Partial<BodyPose>
  eyes?: { both?: Partial<EyePose>; left?: Partial<EyePose>; right?: Partial<EyePose> }
  mouth?: Partial<MouthPose>
  anims?: Anim[]
  sequence?: Sequence
}

export interface Anim {
  target: 'eyes' | 'body' | 'mouth'
  prop: 'lookX' | 'lookY' | 'x' | 'y' | 'scale' | 'open' | 'rotate' | 'width' | 'mouthOpen'
  type: 'sine' | 'glance' | 'scan' | 'jitter' | 'pulse' | 'blink'
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
  mouth?: Partial<MouthPose>
}

export interface Sequence {
  settle: 'base' | 'hold' | { next: string }
  frames: SequenceFrame[]
}

export const DEFAULT_BODY: BodyPose = {
  x: 0, y: 0, scale: 1, rotate: 0,
  color: '#F3F0EA', breathe: 0.01,
  ribbons: 0, confetti: 0, zzz: 0, orbit: 0,
}

export const DEFAULT_EYE: EyePose = {
  x: 0, y: 0, open: 1, lookX: 0, lookY: 0, squint: 0,
}

export const DEFAULT_MOUTH: MouthPose = {
  type: 'smile', width: 0.4, open: 0,
}

/** 32 个情绪定义（原创） */
export const EMOTION_SEED: EmotionDef[] = [
  // ===== 1) 生命周期（8 个） =====
  {
    id: '00', name: '睡眠', group: 'life',
    desc: '闭眼成线，右上角 zzz 缓缓飘起，只剩缓慢呼吸',
    en: { name: 'Sleeping', desc: 'Eyes closed, zzz drifting up, slow breath only' },
    transition: 900, gaze: false, blinkMs: null, openness: 0.02,
    body: { y: 4, rotate: -2, breathe: 0.018, color: '#EEEBE4', zzz: 1 },
    eyes: { both: { y: 4 } },
    mouth: { type: 'none', width: 0 },
    anims: [{ target: 'eyes', prop: 'y', type: 'sine', amp: 1.2, period: 3600 }],
  },
  {
    id: '01', name: '唤醒', group: 'life',
    desc: '从闭合眼缓缓睁开，揉眼似的眨两下，进入待机',
    en: { name: 'Waking', desc: 'Eyes crack open with groggy blinks, then idle' },
    transition: 320, gaze: false, blinkMs: null,
    mouth: { type: 'flat', width: 0.3 },
    sequence: {
      settle: { next: '02' },
      frames: [
        { at: 0, eyes: { both: { open: 0.05, y: 4 } } },
        { at: 420, eyes: { left: { open: 0.4, y: 2 }, right: { open: 0.1, y: 4 } } },
        { at: 820, eyes: { both: { open: 0.2, y: 3 } } },
        { at: 1400, eyes: { both: { open: 1, y: -2 } } },
        { at: 2100, eyes: { both: { open: 1, y: 0 } } },
      ],
    },
  },
  {
    id: '02', name: '待机放空', group: 'life',
    desc: '左看看、右看看，目光两侧停留，偶尔自旋甩彩带',
    en: { name: 'Idle', desc: 'Glances left and right, occasional ribbon spin' },
    transition: 700, gaze: true, blinkMs: [6000, 14000], antics: true,
    body: { breathe: 0.012 },
    mouth: { type: 'smile', width: 0.35 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 0.5, period: 4800 },
      { target: 'eyes', prop: 'lookY', type: 'sine', amp: 0.12, period: 4100, phase: 1.1 },
    ],
  },
  {
    id: '03', name: '好奇', group: 'life',
    desc: '圆睁眼，头微倾，目光打量',
    en: { name: 'Curious', desc: 'Wide eyes, head tilted, look around' },
    transition: 420, gaze: true, blinkMs: [2500, 5500],
    body: { rotate: 4, breathe: 0.01 },
    eyes: { both: { open: 1.08, lookY: -0.2 } },
    mouth: { type: 'o', width: 0.3, open: 0.3 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 0.2, period: 2800 }],
  },
  {
    id: '04', name: '倾听', group: 'life',
    desc: '目光微向上，缓缓左右扫视',
    en: { name: 'Listening', desc: 'Gazing slightly up, slow scan' },
    transition: 500, gaze: true, blinkMs: [4000, 8000],
    eyes: { both: { lookY: -0.25 } },
    mouth: { type: 'smile', width: 0.25 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 0.25, period: 5200 }],
  },
  {
    id: '05', name: '专注', group: 'life',
    desc: '眯眼，目光锁定正前方，呼吸极缓',
    en: { name: 'Focused', desc: 'Narrowed eyes locked forward, slow breath' },
    transition: 400, gaze: true, blinkMs: [5000, 10000],
    body: { breathe: 0.006 },
    eyes: { both: { squint: 0.45 } },
    mouth: { type: 'flat', width: 0.25 },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'sine', amp: 0.08, period: 6000 }],
  },
  {
    id: '06', name: '困惑', group: 'life',
    desc: '一只眼圆睁一只眼微眯，头歪，目光游移',
    en: { name: 'Confused', desc: 'One eye wide, one squinting, head tilted, wandering gaze' },
    transition: 500, gaze: true, blinkMs: [3000, 6000],
    body: { rotate: 6 },
    eyes: { left: { open: 1.05 }, right: { open: 0.45, squint: 0.5 } },
    mouth: { type: 'w', width: 0.35 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 0.25, speed: 0.4, decay: 0 }],
  },
  {
    id: '07', name: '走神', group: 'life',
    desc: '目光缓慢上翻，呼吸绵长，短暂失焦',
    en: { name: 'Dazing', desc: 'Eyes drift up slowly, zoning out' },
    transition: 800, gaze: false, blinkMs: [8000, 14000], openness: 0.7,
    eyes: { both: { lookY: 0.45 } },
    mouth: { type: 'open', width: 0.25, open: 0.2 },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'sine', amp: 0.35, period: 8000 }],
  },

  // ===== 2) 情绪反应（12 个） =====
  {
    id: '10', name: '开心', group: 'emotion',
    desc: '笑眼弯弯，头微抬，身体轻弹',
    en: { name: 'Happy', desc: 'Smiling crescent eyes, slight bounce' },
    transition: 360, gaze: true, blinkMs: [3000, 6000],
    body: { y: -2, breathe: 0.02, color: '#FFF6E0' },
    eyes: { both: { squint: 0.6 } },
    mouth: { type: 'happy', width: 0.6 },
    anims: [
      { target: 'body', prop: 'y', type: 'sine', amp: 3, period: 1600 },
      { target: 'eyes', prop: 'lookX', type: 'glance', amp: 0.25, period: 3000 },
    ],
  },
  {
    id: '11', name: '大笑', group: 'emotion',
    desc: '眯眼全闭，身体上下颤动，撒花庆祝',
    en: { name: 'Laughing', desc: 'Eyes fully shut, body shaking, confetti burst' },
    transition: 300, gaze: false, blinkMs: null, openness: 0.05,
    body: { breathe: 0.03, color: '#FFE3B3', confetti: 1 },
    eyes: { both: { squint: 1, open: 0.08 } },
    mouth: { type: 'happy', width: 0.85, open: 0.4 },
    anims: [{ target: 'body', prop: 'y', type: 'jitter', amp: 1.8, speed: 8, decay: 0 }],
  },
  {
    id: '12', name: '害羞', group: 'emotion',
    desc: '目光躲闪向右下，体色泛粉，腮红',
    en: { name: 'Shy', desc: 'Gaze darting away, blushing pink' },
    transition: 600, gaze: true, blinkMs: [2500, 5000],
    body: { color: '#F9D7D0', rotate: -3 },
    eyes: { both: { lookX: 0.45, lookY: 0.4 } },
    mouth: { type: 'smile', width: 0.3 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 0.18, speed: 0.3, decay: 0 }],
  },
  {
    id: '13', name: '惊讶', group: 'emotion',
    desc: '眼睛瞬间圆睁，嘴巴大张，身体后仰',
    en: { name: 'Surprised', desc: 'Eyes snap wide, mouth open, leans back' },
    transition: 150, gaze: true, blinkMs: [1500, 3000],
    eyes: { both: { open: 1.25 } },
    mouth: { type: 'o', width: 0.5, open: 0.7 },
    sequence: {
      settle: 'hold',
      frames: [
        { at: 0, eyes: { both: { open: 1.3 } }, body: { y: -3, scale: 1.04 }, mouth: { type: 'o', width: 0.5, open: 0.8 } },
        { at: 600, eyes: { both: { open: 1 } }, body: { y: 0, scale: 1 }, mouth: { type: 'o', width: 0.4, open: 0.4 } },
      ],
    },
  },
  {
    id: '14', name: '生气', group: 'emotion',
    desc: '眯眼皱眉，头前倾，体色变红，呼吸急促',
    en: { name: 'Angry', desc: 'Narrowed eyes, head forward, reddening, fast breath' },
    transition: 280, gaze: true, blinkMs: [2000, 4000],
    body: { y: 2, breathe: 0.03, color: '#F4C0B0' },
    eyes: { both: { squint: 0.55, lookY: -0.2 } },
    mouth: { type: 'flat', width: 0.45, open: 0.1 },
    anims: [{ target: 'body', prop: 'y', type: 'jitter', amp: 0.8, speed: 6, decay: 0 }],
  },
  {
    id: '15', name: '悲伤', group: 'emotion',
    desc: '眼角下垂，头低垂，体色变冷灰蓝',
    en: { name: 'Sad', desc: 'Drooping eyes, head down, cool grey-blue tone' },
    transition: 700, gaze: false, blinkMs: [5000, 9000], openness: 0.7,
    body: { y: 6, rotate: 2, color: '#D8DCE4', breathe: 0.008 },
    eyes: { both: { lookY: 0.3 } },
    mouth: { type: 'sad', width: 0.4 },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'sine', amp: 0.18, period: 5000 }],
  },
  {
    id: '16', name: '得意', group: 'emotion',
    desc: '眯眼微仰，嘴角上扬，彩带环绕',
    en: { name: 'Smug', desc: 'Narrow eyes tilted up, smug smile, orbiting ribbon' },
    transition: 500, gaze: true, blinkMs: [4000, 8000],
    body: { y: -3, rotate: -4, color: '#FBE6C2', orbit: 1 },
    eyes: { both: { squint: 0.4, lookY: -0.3 } },
    mouth: { type: 'smile', width: 0.5 },
  },
  {
    id: '17', name: '期待', group: 'emotion',
    desc: '目光上望亮晶晶，身体前倾轻晃',
    en: { name: 'Expectant', desc: 'Sparkling eyes looking up, leaning forward' },
    transition: 450, gaze: true, blinkMs: [3000, 6000],
    body: { y: -1, color: '#E8F0E4' },
    eyes: { both: { open: 1.08, lookY: -0.4 } },
    mouth: { type: 'o', width: 0.3, open: 0.25 },
    anims: [
      { target: 'body', prop: 'x', type: 'sine', amp: 1.8, period: 2400 },
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 0.15, period: 1800 },
    ],
  },
  {
    id: '18', name: '困惑恼', group: 'emotion',
    desc: '一只眯眼一只斜眼，头歪，目光斜视',
    en: { name: 'Puzzled', desc: 'One squint one slanted, head tilted, sidelong gaze' },
    transition: 500, gaze: true, blinkMs: [3000, 6000],
    body: { rotate: 5 },
    eyes: { left: { squint: 0.2 }, right: { squint: 0.7, lookX: 0.3 } },
    mouth: { type: 'w', width: 0.4 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'glance', amp: 0.3, period: 3600 }],
  },
  {
    id: '19', name: '宠爱', group: 'emotion',
    desc: '笑眼弯弯，目光柔和，体色温暖',
    en: { name: 'Adoring', desc: 'Curved smiling eyes, warm tone, soft gaze' },
    transition: 600, gaze: true, blinkMs: [4000, 7000],
    body: { color: '#FBEAD8', breathe: 0.014 },
    eyes: { both: { squint: 0.35, lookY: 0.08 } },
    mouth: { type: 'happy', width: 0.55 },
  },
  {
    id: '20', name: '激动', group: 'emotion',
    desc: '圆睁眼，身体颤抖，撒花',
    en: { name: 'Excited', desc: 'Wide eyes, trembling, confetti' },
    transition: 200, gaze: true, blinkMs: [2000, 4000],
    body: { color: '#FDD9C0', confetti: 1, breathe: 0.025 },
    eyes: { both: { open: 1.15 } },
    mouth: { type: 'happy', width: 0.7, open: 0.3 },
    anims: [{ target: 'body', prop: 'y', type: 'jitter', amp: 1.2, speed: 10, decay: 0 }],
  },
  {
    id: '21', name: '淡定', group: 'emotion',
    desc: '平静眼，呼吸平稳，目光不游移',
    en: { name: 'Calm', desc: 'Calm eyes, steady breath, no wandering gaze' },
    transition: 600, gaze: true, blinkMs: [6000, 12000],
    body: { breathe: 0.01, color: '#EDEDEA' },
    mouth: { type: 'smile', width: 0.3 },
  },

  // ===== 3) 代理状态（12 个） =====
  {
    id: '30', name: '思考', group: 'agent',
    desc: '目光上望，头顶常驻环带环绕，呼吸绵长',
    en: { name: 'Thinking', desc: 'Gaze upward, orbiting ribbon overhead, slow breath' },
    transition: 400, gaze: true, blinkMs: [4000, 7000],
    body: { orbit: 1, breathe: 0.008, color: '#E4E8F0' },
    eyes: { both: { lookY: -0.4 } },
    mouth: { type: 'flat', width: 0.25 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 0.12, period: 4000 }],
  },
  {
    id: '31', name: '检索', group: 'agent',
    desc: '眯眼快速左右扫视',
    en: { name: 'Searching', desc: 'Narrow eyes scanning rapidly left-right' },
    transition: 250, gaze: true, blinkMs: [3000, 6000],
    eyes: { both: { squint: 0.5 } },
    mouth: { type: 'flat', width: 0.2 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'scan', amp: 0.65, period: 1400 }],
  },
  {
    id: '32', name: '读写', group: 'agent',
    desc: '眯眼向下，目光轻轻上下扫',
    en: { name: 'Reading', desc: 'Squinting down, eyes tracking up-down gently' },
    transition: 350, gaze: true, blinkMs: [4000, 8000],
    eyes: { both: { lookY: 0.5, squint: 0.3 } },
    mouth: { type: 'flat', width: 0.2 },
    anims: [{ target: 'eyes', prop: 'lookY', type: 'scan', amp: 0.3, period: 2000 }],
  },
  {
    id: '33', name: '生成', group: 'agent',
    desc: '平静眼，目光微向右下，呼吸平稳有节律',
    en: { name: 'Generating', desc: 'Calm eyes, gaze right-down, rhythmic breath' },
    transition: 300, gaze: true, blinkMs: [5000, 9000],
    eyes: { both: { lookX: 0.25, lookY: 0.2 } },
    mouth: { type: 'flat', width: 0.2 },
    anims: [{ target: 'body', prop: 'scale', type: 'pulse', amp: 0.012, period: 2400 }],
  },
  {
    id: '34', name: '校验', group: 'agent',
    desc: '眼睛快速眨动，目光锁定，偶有微抖',
    en: { name: 'Verifying', desc: 'Rapid blinks, locked gaze, slight jitter' },
    transition: 300, gaze: true, blinkMs: [800, 1600],
    eyes: { both: { lookY: -0.1 } },
    mouth: { type: 'flat', width: 0.2 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 0.08, speed: 0.6, decay: 0 }],
  },
  {
    id: '35', name: '出错', group: 'agent',
    desc: '圆睁一瞬，体色变红，目光游移不定',
    en: { name: 'Error', desc: 'Snap wide, reddening, darting gaze' },
    transition: 180, gaze: true, blinkMs: [1500, 3000],
    body: { color: '#F4B8A8', breathe: 0.03 },
    eyes: { both: { open: 1.15 } },
    mouth: { type: 'open', width: 0.4, open: 0.5 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'jitter', amp: 0.35, speed: 0.8, decay: 0 }],
  },
  {
    id: '36', name: '完成', group: 'agent',
    desc: '笑眼弯弯，撒花庆祝，随即回待机',
    en: { name: 'Done', desc: 'Smiling eyes, confetti, then back to idle' },
    transition: 300, gaze: true, blinkMs: [3000, 6000],
    body: { color: '#E0F0D8', confetti: 1 },
    eyes: { both: { squint: 0.4 } },
    mouth: { type: 'happy', width: 0.6, open: 0.15 },
    sequence: { settle: { next: '02' }, frames: [] },
  },
  {
    id: '37', name: '等待输入', group: 'agent',
    desc: '平静眼，目光居中，呼吸平缓，偶尔眨眼',
    en: { name: 'Awaiting', desc: 'Calm centered gaze, slow breath, occasional blink' },
    transition: 500, gaze: true, blinkMs: [4000, 8000],
    body: { breathe: 0.01 },
    mouth: { type: 'smile', width: 0.3 },
  },
  {
    id: '38', name: '调用工具', group: 'agent',
    desc: '眯眼，目光斜向，身体微前倾',
    en: { name: 'Tool use', desc: 'Narrow slanted eyes, leaning forward' },
    transition: 280, gaze: true, blinkMs: [3000, 6000],
    body: { y: 1, rotate: -2 },
    eyes: { both: { lookX: 0.3, lookY: -0.1, squint: 0.3 } },
    mouth: { type: 'flat', width: 0.3 },
  },
  {
    id: '39', name: '深思考', group: 'agent',
    desc: '闭眼，头低垂，环带环绕，呼吸极缓',
    en: { name: 'Deep thought', desc: 'Eyes shut, head down, orbiting ribbon, very slow breath' },
    transition: 600, gaze: false, blinkMs: null, openness: 0.02,
    body: { y: 5, rotate: 3, orbit: 1, breathe: 0.005, color: '#DCE2EC' },
    eyes: { both: { lookY: 0.3 } },
    mouth: { type: 'flat', width: 0.2 },
  },
  {
    id: '40', name: '组织语言', group: 'agent',
    desc: '眼半开，目光微游移，呼吸有节律',
    en: { name: 'Composing', desc: 'Half-open eyes, slight gaze drift, rhythmic breath' },
    transition: 350, gaze: true, blinkMs: [3500, 7000],
    eyes: { both: { open: 0.6, lookY: 0.08 } },
    mouth: { type: 'flat', width: 0.2 },
    anims: [
      { target: 'eyes', prop: 'lookX', type: 'sine', amp: 0.18, period: 3200 },
      { target: 'body', prop: 'scale', type: 'pulse', amp: 0.01, period: 2000 },
    ],
  },
  {
    id: '41', name: '回顾', group: 'agent',
    desc: '眯眼向上望，目光回顾，呼吸缓慢',
    en: { name: 'Reviewing', desc: 'Squinting upward, recollecting, slow breath' },
    transition: 450, gaze: true, blinkMs: [4000, 8000],
    eyes: { both: { lookY: -0.4, squint: 0.2 } },
    mouth: { type: 'flat', width: 0.2 },
    anims: [{ target: 'eyes', prop: 'lookX', type: 'glance', amp: 0.3, period: 4000 }],
  },
]