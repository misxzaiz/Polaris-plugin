/**
 * EmotionBall v4 — 外观配置类型
 *
 * 用户可调参数，全部默认值在 store 中初始化，运行时通过 EngineOpts 透传给 renderer。
 */

export interface AppearanceConfig {
  /** 球体主体颜色；undefined = 跟随情绪自动切换 */
  bodyColor: string | null
  /** 眼白颜色 */
  eyeWhite: string
  /** 瞳孔颜色 */
  pupil: string
  /** 嘴巴颜色 */
  mouth: string
  /** 腮红颜色 */
  cheek: string
  /** 球体容器背景色（透明则用浏览器背景） */
  background: string
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  bodyColor: null,
  eyeWhite: '#FFFFFF',
  pupil: '#1A1A1A',
  mouth: '#3A2A22',
  cheek: 'rgba(244,114,108,0.5)',
  background: '#121826',
}

/** 背景预设（暗底 / 浅底 / 渐变） */
export const BG_PRESETS: { id: string; label: string; value: string }[] = [
  { id: 'dark', label: '纯黑', value: '#0f1117' },
  { id: 'dark-blue', label: '深夜蓝', value: '#121826' },
  { id: 'dark-green', label: '墨绿', value: '#0e1a14' },
  { id: 'dark-purple', label: '暗夜紫', value: '#14111f' },
  { id: 'warm-dark', label: '暖暗', value: '#1a1410' },
  { id: 'light', label: '纯白', value: '#f5f0e8' },
  { id: 'light-cream', label: '米色', value: '#fbf6ee' },
  { id: 'light-blue', label: '浅蓝', value: '#eef3f8' },
  { id: 'gradient-dark', label: '深色渐变', value: 'linear-gradient(135deg, #1a1f2e 0%, #0f1117 100%)' },
  { id: 'gradient-warm', label: '暖渐变', value: 'linear-gradient(135deg, #2a1f14 0%, #1a1410 100%)' },
  { id: 'gradient-cool', label: '冷渐变', value: 'linear-gradient(135deg, #1a2540 0%, #0f1420 100%)' },
]