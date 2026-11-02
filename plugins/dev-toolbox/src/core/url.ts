// URL 解析 —— 组件拆解 + 查询参数表（同名参数全部列出，不丢重复项）
// 实测坑位：URLSearchParams.get 只返回第一个值，重复参数必须用 getAll

export interface UrlParam {
  name: string
  values: string[]
}

export interface UrlParts {
  ok: boolean
  error?: string
  href?: string
  protocol?: string
  username?: string
  password?: string
  hostname?: string
  port?: string
  pathname?: string
  search?: string
  hash?: string
  origin?: string
  params?: UrlParam[]
  /** 仅路径段（/a/b/c → a,b,c） */
  pathSegments?: string[]
}

export function parseUrl(input: string): UrlParts {
  const raw = input.trim()
  if (raw === '') return { ok: false, error: '输入为空' }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    // 宽容处理：无 scheme 的「example.com/a?b=1」按 https 补全再试
    try {
      u = new URL(`https://${raw}`)
    } catch (e2) {
      return { ok: false, error: `无法解析为 URL：${(e2 as Error).message}` }
    }
  }
  const params: UrlParam[] = []
  for (const name of new Set(u.searchParams.keys())) {
    params.push({ name, values: u.searchParams.getAll(name) })
  }
  return {
    ok: true,
    href: u.href,
    protocol: u.protocol,
    username: u.username,
    password: u.password ? '（已设置，此处不回显）' : '',
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    params,
    pathSegments: u.pathname.split('/').filter((s) => s.length > 0),
  }
}
