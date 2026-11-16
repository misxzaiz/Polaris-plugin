/* eslint-disable @typescript-eslint/no-explicit-any */
/** 轻量 logger（对齐宿主 createLogger 形态；生产不落盘） */
export function createLogger(scope: string) {
  const fmt = (msg: string) => `[${scope}] ${msg}`
  return {
    debug: (msg: string, ...rest: any[]) => {
      if (import.meta.env?.DEV) console.debug(fmt(msg), ...rest)
    },
    info: (msg: string, ...rest: any[]) => console.info(fmt(msg), ...rest),
    warn: (msg: string, ...rest: any[]) => console.warn(fmt(msg), ...rest),
    error: (msg: string, ...rest: any[]) => console.error(fmt(msg), ...rest),
  }
}
