// 测试辅助：探测空闲端口（house 端口段拥挤，固定测试端口会撞其他插件的服务）
import net from 'node:net'

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}
