/**
 * chat-desk logger —— 轻量实现（P3.b）
 *
 * 宿主 logger 依赖主仓 zcode 集成；插件内用同 API 的 console 实现，
 * 生产不落盘对齐宿主纪律（debug 高频不打印）。后续如需远端日志，经
 * cap.kv/cap.help 扩展，不在本模块扩。
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_COLOR: Record<Level, string> = {
  debug: '#888',
  info: '#2b6cb0',
  warn: '#b7791f',
  error: '#c53030',
}

function emit(level: Level, message: string, ...args: unknown[]): void {
  if (level === 'debug') return // 生产不落盘对齐：debug 只在显式 DEBUG 打开时输出
  const prefix = `%c[chat-desk]${message ? ' ' + message : ''}`
  // eslint-disable-next-line no-console
  console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](
    prefix,
    `color:${LEVEL_COLOR[level]}`,
    ...args,
  )
}

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

export function createLogger(scope: string): Logger {
  const wrap = (level: Level) => (message: string, ...args: unknown[]) => {
    try {
      emit(level, `${scope} ${message}`.trim(), ...args)
    } catch {
      /* 日志永不抛错 */
    }
  }
  return {
    debug: wrap('debug'),
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
  }
}
