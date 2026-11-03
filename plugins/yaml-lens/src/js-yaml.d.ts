/** js-yaml 4.1.0 最小类型声明（本插件只用 load/loadAll/dump） */
declare module 'js-yaml' {
  export interface LoadOptions {
    schema?: unknown
    json?: boolean
  }
  export interface DumpOptions {
    indent?: number
    noRefs?: boolean
    sortKeys?: boolean
    lineWidth?: number
    flowLevel?: number
  }
  export function load(text: string, opts?: LoadOptions): unknown
  export function loadAll(text: string, opts?: LoadOptions): unknown[]
  export function dump(value: unknown, opts?: DumpOptions): string
  export function safeLoad(text: string, opts?: LoadOptions): unknown
  const _default: {
    load: typeof load
    loadAll: typeof loadAll
    dump: typeof dump
    safeLoad: typeof safeLoad
  }
  export default _default
}
