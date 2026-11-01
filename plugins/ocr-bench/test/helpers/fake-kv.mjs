/**
 * 测试辅助：内存版 cap.kv 桥（模拟宿主 /api/router-dispatch 协议）
 * —— kvclient 的 env 自发现（POLARIS_HOST/PORT/TOKEN）指向本桥即可让
 *    service / MCP 在无宿主环境下全链路集成测试。
 */
import http from 'node:http';
import crypto from 'node:crypto';

export function startFakeKvBridge({ token = 'test-token' } = {}) {
  const store = new Map();
  const expectAuth = 'Bearer ' + crypto.createHash('md5').update(token).digest('hex');
  const hits = [];

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && url === '/api/router-dispatch') {
      if (token && req.headers.authorization !== expectAuth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const { req: inner } = JSON.parse(body);
          const { target, payload } = inner || {};
          if (target !== 'cap.kv') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: `fake bridge 只支持 cap.kv，收到 ${target}` }));
            return;
          }
          hits.push(payload && payload.action);
          const action = payload && payload.action;
          let result;
          if (action === 'get') result = { value: store.has(payload.key) ? store.get(payload.key) : null };
          else if (action === 'set') { store.set(payload.key, payload.value === undefined ? null : payload.value); result = { ok: true }; }
          else if (action === 'delete') { store.delete(payload.key); result = { ok: true }; }
          else if (action === 'list') result = { keys: [...store.keys()] };
          else result = { error: `未知 kv action：${action}` };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: !result.error, result, error: result.error }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        token,
        store,
        hits,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/** 等待某 HTTP 端口健康（服务自举窗口） */
export function waitHealth(port, { timeoutMs = 20000 } = {}) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/__health', timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - t0 > timeoutMs) return reject(new Error(`健康端点 ${port} 超时未就绪`));
      setTimeout(tryOnce, 400);
    };
    tryOnce();
  });
}
