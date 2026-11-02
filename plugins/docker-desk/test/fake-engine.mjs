/**
 * fake-engine.mjs —— 按 Docker Engine API v1.41 官方响应结构构造的假引擎（TCP HTTP）
 * 仅用于测试：service 以 --engine=tcp://127.0.0.1:<port> 指向它，全链路即可离线验证。
 * 响应字段结构与官方 API 文档一致（containers/json、logs 多路复用帧、stats、system/df、events）。
 */
import http from 'http'
import crypto from 'crypto'

export const C1 = {
  Id: 'aaa111bbb222ccc333ddd444eee555fff666aaa111bbb222ccc333ddd444eee5',
  Names: ['/web-nginx'],
  Image: 'nginx:1.25',
  ImageID: 'sha256:imgaaa111',
  State: 'running',
  Status: 'Up 2 hours (healthy)',
  Created: Math.floor((Date.now() - 7200 * 1000) / 1000),
  Ports: [{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }, { PrivatePort: 443, Type: 'tcp' }],
  Labels: { 'com.docker.compose.project': 'demo', 'com.docker.compose.service': 'nginx' },
}

export const C2 = {
  Id: 'bbb222ccc333ddd444eee555fff666aaa111bbb222ccc333ddd444eee555fff6',
  Names: ['/cache-redis'],
  Image: 'redis:7',
  ImageID: 'sha256:imgbbb222',
  State: 'exited',
  Status: 'Exited (137) 5 minutes ago',
  Created: Math.floor((Date.now() - 86400 * 1000) / 1000),
  Ports: [],
  Labels: { 'com.docker.compose.project': 'demo', 'com.docker.compose.service': 'redis' },
}

export const C3 = {
  Id: 'ccc333ddd444eee555fff666aaa111bbb222ccc333ddd444eee555fff666aaa1',
  Names: ['/lonely-tool'],
  Image: 'alpine:3.19',
  ImageID: 'sha256:imgccc333',
  State: 'running',
  Status: 'Up 10 seconds',
  Created: Math.floor((Date.now() - 10000) / 1000),
  Ports: [{ IP: '127.0.0.1', PrivatePort: 9000, PublicPort: 9000, Type: 'tcp' }],
  Labels: {},
}

const INSPECT_C1 = {
  Id: C1.Id,
  Name: '/web-nginx',
  Image: C1.ImageID,
  Platform: 'linux',
  RestartCount: 0,
  Path: ['nginx'][0],
  Args: ['-g', 'daemon off;'],
  Created: C1.Created * 1000 * 1e6,
  State: { Status: 'running', Running: true, ExitCode: 0, OOMKilled: false, Error: '', Health: { Status: 'healthy' } },
  NetworkSettings: { Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] } },
  Mounts: [{ Type: 'bind', Source: '/srv/site', Destination: '/usr/share/nginx/html', RW: true }],
  Config: {
    Env: ['NGINX_VERSION=1.25.3', 'API_TOKEN=super-secret-token-value'],
    Labels: C1.Labels,
  },
}

const STATS_C1 = {
  cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 10_000_000_000, online_cpus: 2 },
  precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 9_000_000_000 },
  memory_stats: { usage: 300_000_000, limit: 1_000_000_000, stats: { cache: 100_000_000 } },
  networks: { eth0: { rx_bytes: 1024 * 1024, tx_bytes: 512 * 1024 } },
  blkio_stats: { io_service_bytes_recursive: [{ op: 'Read', value: 4096 }, { op: 'Write', value: 8192 }] },
}

const IMAGES = [
  { Id: 'sha256:imgaaa111aaa', RepoTags: ['nginx:1.25'], Size: 187_000_000, Created: Math.floor(Date.now() / 1000) - 86400 * 30, Containers: ['aaa111'] },
  { Id: 'sha256:imgbbb222bbb', RepoTags: ['redis:7'], Size: 130_000_000, Created: Math.floor(Date.now() / 1000) - 86400 * 60, Containers: ['bbb222'] },
  { Id: 'sha256:imgdang404d', RepoTags: [], Size: 12_345_678, Created: Math.floor(Date.now() / 1000) - 3600, Containers: [] },
]

const DF = {
  LayersSize: 400_000_000,
  Images: IMAGES.map((i) => ({ RepoTags: i.RepoTags, Size: i.Size, SharedSize: 0, Containers: i.Containers.length })),
  Containers: [{ SizeRw: 5_242_880 }, { SizeRw: 1024 }],
  Volumes: [{ UsageData: { Size: 7_340_032 } }],
  BuildCache: [{ SizeInBytes: 3_000_000 }],
}

const EVENTS = [
  { time: Math.floor(Date.now() / 1000) - 120, timeNano: (Date.now() - 120_000) * 1e6, Type: 'container', Action: 'die', Actor: { ID: C2.Id, Attributes: { name: 'cache-redis', exitCode: '137', image: 'redis:7', oomKilled: 'false' } } },
  { time: Math.floor(Date.now() / 1000) - 60, timeNano: (Date.now() - 60_000) * 1e6, Type: 'container', Action: 'start', Actor: { ID: C1.Id, Attributes: { name: 'web-nginx', image: 'nginx:1.25' } } },
]

/** 组装一帧多路复用日志（streamType 1=stdout 2=stderr） */
export function muxFrame(streamType, text) {
  const payload = Buffer.from(text, 'utf8')
  const head = Buffer.alloc(8)
  head[0] = streamType
  head.writeUInt32BE(payload.length, 4)
  return Buffer.concat([head, payload])
}

export function startFakeEngine() {
  const actions = { stopped: new Set(), started: new Set(), restarted: new Set(), removedContainers: [], removedImages: [] }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://engine')
    const p = u.pathname.replace(/^\/v1\.41/, '')
    const body = (chunked) => {
      const data = typeof chunked === 'string' ? chunked : JSON.stringify(chunked)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(data)
    }

    if (p === '/_ping') {
      res.writeHead(200, { 'Api-Version': '1.47', Ostype: 'linux' })
      res.end('OK')
      return
    }
    if (p === '/version') {
      body({ Version: '27.3.1', ApiVersion: '1.47', Os: 'linux', Arch: 'x86_64', Containers: 3, ContainersRunning: 2 })
      return
    }
    if (p === '/containers/json') {
      const all = u.searchParams.get('all') === '1' || u.searchParams.get('all') === ''
      const items = [C1, C2, C3].filter((c) => all || c.State === 'running')
      body(items)
      return
    }
    let m = p.match(/^\/containers\/([^/]+)\/logs$/)
    if (m) {
      const follow = u.searchParams.get('follow') === '1'
      const id = m[1]
      const isC1 = id.startsWith('aaa111') || id === 'web-nginx'
      res.writeHead(200, { 'Content-Type': 'application/vnd.docker.multiplexed-stream' })
      if (!follow) {
        const frames = isC1
          ? [muxFrame(1, '2026-11-03 ready since boot\n2026-11-03 serving on :80\n'), muxFrame(2, '2026-11-03 upstream timeout connecting db:5432\n')]
          : [muxFrame(1, 'exited normally\n')]
        res.end(Buffer.concat(frames))
        return
      }
      // follow：先给两行，再保持连接慢慢推
      res.write(muxFrame(1, 'follow: line-1\n'))
      res.write(muxFrame(2, 'follow: err-line\n'))
      const timer = setInterval(() => {
        res.write(muxFrame(1, `follow: tick ${Date.now()}\n`))
      }, 200)
      req.on('close', () => clearInterval(timer))
      res.on('close', () => clearInterval(timer))
      return
    }
    m = p.match(/^\/containers\/([^/]+)\/stats$/)
    if (m) { body(STATS_C1); return }
    m = p.match(/^\/containers\/([^/]+)\/json$/)
    if (m) { body(INSPECT_C1); return }
    m = p.match(/^\/containers\/([^/]+)\/(start|stop|restart)$/)
    if (m) {
      const id = m[1]
      if (id.startsWith('zzz')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'No such container: zzz' })); return }
      const set = m[2] === 'start' ? actions.started : m[2] === 'stop' ? actions.stopped : actions.restarted
      set.add(id)
      res.writeHead(204); res.end()
      return
    }
    m = p.match(/^\/containers\/([^/]+)$/)
    if (m && req.method === 'DELETE') {
      actions.removedContainers.push(m[1])
      res.writeHead(204); res.end()
      return
    }
    if (p === '/images/json') { body(IMAGES); return }
    m = p.match(/^\/images\/([^/]+)$/)
    if (m && req.method === 'DELETE') {
      if (String(m[1]).includes('used')) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'conflict: image is being used by running container' }))
        return
      }
      actions.removedImages.push(m[1])
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{ Deleted: 'sha256:deleted' }]))
      return
    }
    if (p === '/system/df') { body(DF); return }
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      for (const ev of EVENTS) res.write(`${JSON.stringify(ev)}\n`)
      // 保持长流（测试期间不断）
      const ka = setInterval(() => res.write('\n'), 1000)
      req.on('close', () => clearInterval(ka))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: `not found: ${p}` }))
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        actions,
        idOf: (c) => c.Id.slice(0, 12),
        token: crypto.randomBytes(6).toString('hex'),
      })
    })
  })
}
