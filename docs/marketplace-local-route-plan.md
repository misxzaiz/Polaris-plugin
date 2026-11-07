# 插件商城本地源 · Polaris transport 静态路由落地方案

> 目标:手机 App 能访问电脑上的本地插件商城(开发仓库 `D:\space\base\Polaris-plugin`
> 或数据根下插件目录),无需手动起 `serve-market.js`,不引入 SSRF 面。
>
> 范围:仅分析 + 落地设计。实现待确认后执行。

## 1. 问题定位

### 1.1 拓扑

手机 App(新版主应用)经 HTTP transport 连到**电脑上的 Polaris**(`POST /api/router-dispatch`,
Bearer tokenMd5)。本地插件仓库也在电脑上。三者闭合于电脑侧:

```
手机 App ──HTTP transport──▶ 电脑 Polaris ──本机文件系统──▶ 本地插件目录
```

### 1.2 当前为何访问不了

`scripts/serve-market.js` 起的 node 静态服务**显式只绑 `127.0.0.1:8787`**:

- 手机里的 `127.0.0.1` 是手机自身回环,路由不到电脑 → **拓扑错位(致命)**;
- 改绑局域网 IP 仍可能被 webview 混合内容策略拦(http 资源在安全上下文);
- CORS 已带 `*`,非障碍。

### 1.3 cap.http 为何不是首选

`cap.http` 转发执行在宿主进程内 reqwest,传输层确实能绕三重障碍,但:

- 对 `Source::Remote` **默认 deny**(`policy_permission.rs` 内置 `("cap.http", true)` 通配 deny);
- `validate_target` **SSRF 防御已全部移除**,代码注释明确警告:一旦放开 Remote 即暴露
  内网/云元数据 SSRF 面;
- 全量 allow 不可接受,须复活"本地源 host 白名单" + 动作级 allow,高敏改动。

用它取本地静态文件是杀鸡用牛刀,SSRF 风险账单高。

## 2. 方案:Polaris transport 加 `/api/market/*` 静态路由

### 2.1 核心思路

Polaris 已有完整 axum HTTP server(`src/web/router.rs:121`)。**`/api/files/{*path}` 已把
整套安全静态服务做完**(`src/web/api/files.rs`):鉴权双通道、`..` 穿越防护、根白名单、
ServeFile/Range/Content-Type。market 是同范式换"固定根",改动局部、零 SSRF 面、同源直达。

### 2.2 链路

```
手机面板 fetch('/api/market/index.json', {headers:{Authorization:`Bearer ${tokenMd5}`}})
  └─▶ 手机 transport ──▶ 电脑 Polaris GET /api/market/index.json
        └─▶ ServeDir(本地插件目录) ──▶ 返回 index.json / zip / png
```

同 origin:手机连 transport 用的 host/协议,market 源就是同一 host/协议 → **无 CORS、
无混合内容、无拓扑错位**。

### 2.3 改动点(宿主侧,Polaris repo)

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/web/router.rs` | `api_routes` 加 `.route("/market/{*path}", get(api::market::handle_market_request))` |
| 2 | `src/web/api/market.rs`(新建) | handler:鉴权 → 解析固定根 → `ServeDir::new(root)` 输出 |
| 3 | `src/web/api/mod.rs` | `pub mod market;` |
| 4 | 配置项 | `polaris.marketplace.localRoot`(见 §2.5) |

handler 骨架(参照 files.rs,简化为固定根):

```rust
// GET /api/market/{*path}  —— 本地插件商城静态源(只读,固定根,无 SSRF 面)
pub async fn handle_market_request(
    State(state): State<Arc<AppState>>,
    Path(rel): Path<String>,
    Query(query): Query<MarketQuery>,
    req: Request<Body>,
) -> Response {
    // 1. 鉴权:Bearer 优先,?token=<md5> query 回退(复用 files.rs::authorized 同款)
    if !authorized(&state, &req, query.token.as_deref()) {
        return (StatusCode::UNAUTHORIZED, Json(json!({"error":"Unauthorized"}))).into_response();
    }
    // 2. 解析固定根(配置项,缺省数据根下 plugins 子目录)
    let root = resolve_market_root(&state);
    // 3. 路径规范化 + 穿越防护(ServeDir 自身 + 根定死双重)
    //    rel 限白名单字符,拼后 canonicalize 必须仍在 root 内
    let safe = match join_under_root(&root, &rel) {
        Some(p) => p,
        None => return (StatusCode::FORBIDDEN, Json(json!({"error":"Path traversal"}))).into_response(),
    };
    // 4. ServeDir/ ServeFile 输出(Content-Type / Range / Last-Modified 自动)
    ServeFile::new(&safe).oneshot(req).await
        .map(|r| r.into_response())
        .unwrap_or_else(|_| (StatusCode::NOT_FOUND, Json(json!({"error":"Not found"}))).into_response())
}
```

> 目录列表若需要,可对目录请求返回简化 JSON(`fs.readdirSync` 同款),非必须——index.json
> 已是入口,zip/png 经绝对相对路径可达。

### 2.4 改动点(插件仓侧,Polaris-plugin repo)

| # | 文件 | 改动 |
|---|---|---|
| 1 | `plugins/marketplace/src/Panel.tsx` | `loadIndex` 检测同源 `/api/market/*` 路径时,fetch 注入 Bearer header(或拼 `?token=`);新增"本地源(内置)"预置项 |
| 2 | `plugins/marketplace/dist/panel.js` | esbuild 重建 |
| 3 | `plugins/marketplace/marketplace.zip` | `pack.js`/`make-zip.cjs` 重打 |
| 4 | `index.json` | marketplace 条目 sha256 同步(主 + versions[] 两处) |

面板接入伪代码:

```ts
// 同源本地源:URL 形如 /api/market/index.json 或 http://<host>/api/market/index.json
function isPolarisLocalSource(url: string): boolean {
  return /\/api\/market\/index\.json(\?.*)?$/i.test(url)
}

async function fetchIndex(source: string): Promise<Response> {
  if (isPolarisLocalSource(source)) {
    const tokenMd5 = getHostTokenMd5()  // 见 §2.6
    const headers: Record<string,string> = {}
    if (tokenMd5) headers['Authorization'] = `Bearer ${tokenMd5}`
    return fetchWithTimeoutRaw(source, { headers })  // 不走 cache
  }
  return fetchWithTimeout(source)  // 既有外部源路径不动
}
```

### 2.5 配置项设计

`polaris.marketplace.localRoot`(写入 `config.toml` 的 `[marketplace]` 段或 web config):

- 缺省:`<data_root>/plugins`(正式版数据根,如 `D:/app/polaris-s/plugins`)。
- 开发模式:可指向仓库根 `D:/space/base/Polaris-plugin`(开发者本地源)。
- 校验:路径必须存在且为目录;canonicalize 后落在数据根或显式登记的开发目录内
  (避免被改成任意路径变 SSRF/任意文件读)。

面板侧 UI:⚙ 商城源 → 新增预置项"本地源(内置)",URL 固定显示
`/api/market/index.json`(相对当前 origin,手机/桌面同源自适应),不可删。

### 2.6 接入前提:tokenMd5 暴露给面板(待确认)

`/api/market/*` 与其它 `/api/*` 一致,需鉴权。面板直 fetch 时需要 tokenMd5:

- **header 路径**:`fetch(url, {headers:{Authorization:`Bearer ${tokenMd5}`}})` —— 干净,首选。
- **query 兜底**:`?token=<md5>`(仿 files.rs,供 webview 限制场景)。

token 来源:**需确认主应用 `main.tsx` 是否已把 tokenMd5 暴露到面板 window**(如
`window.__POLARIS_TOKEN_MD5__`)。

- 若已暴露:面板直接读,零额外改动。
- 若未暴露:主应用侧补一行(挂桥 `__POLARIS_HOST_INVOKE__` 的同处一并挂
  `window.__POLARIS_TOKEN_MD5__ = tokenMd5`),仅手机 HTTP transport 模式下挂;
  桌面 IPC 模式同源免鉴权,可空。

> ⚠ 这是本方案唯一依赖 Polaris 主应用侧的接入点。Polaris repo 工作目录已移除,
> 无法现场核验;落地前第一步即确认此项。

## 3. 安全边界

| 威胁 | 防护 |
|---|---|
| 路径穿越(`../`) | `ServeDir` 自身 + `join_under_root` canonicalize 前缀校验双重 |
| 任意文件读 | 根**定死**为配置项 `localRoot`,不接受调用方传绝对路径(区别于 files.rs 的绝对路径模型) |
| SSRF | **无任意 URL 入口**,只读固定目录,不触达网络 → 零 SSRF 面 |
| 未鉴权访问 | 复用 `/api/*` 的 `api_auth` middleware + handler 内 `authorized` 双通道 |
| 远程写/安装 | 不涉及——install_remote/apply_update 仍走 `cap.pluginDiscovery`,对 Remote 维持 deny(P1-h) |

## 4. 与既有安全策略的对齐

- **P1-h 边界不变**:手机端可"浏览/检查更新/查看版本",安装/卸载/更新仍引导桌面端或 AI 会话。
  本方案只解"索引可达",不放宽写动作。
- **不触碰 `policy_permission.rs`**:不加 cap.http 放行,不动 Remote deny 基线。
- **`serve-market.js` 保留**:作为开发调试退路(快速起临时源),不删;正式路径走内置路由。

## 5. 验证清单

1. 桌面端:`/api/market/index.json` 直 fetch 返回插件列表;`/api/market/<plugin>/<x>.zip`
   下载 sha256 与磁盘一致。
2. 手机端:面板选"本地源(内置)"→ 列表加载成功(非 `Failed to fetch`)。
3. 穿越:`/api/market/../../etc/passwd` → 403。
4. 鉴权:无 token / 错 token → 401。
5. 三步同步:改 Panel.tsx → esbuild 重建 dist → pack.js 重打 zip → index.json sha256
   主条目 + versions[] 两处更新(否则商城自更新校验失败)。

## 6. 落地顺序(建议)

1. **前置确认**(Polaris repo 回归后):`main.tsx` 是否暴露 tokenMd5 到面板 window。
   - 已暴露 → 直接进入步骤 2。
   - 未暴露 → 主应用侧补挂 `window.__POLARIS_TOKEN_MD5__`(HTTP transport 模式)。
2. Polaris 侧:新建 `src/web/api/market.rs` + `router.rs` 加路由 + 配置项。
3. 插件仓侧:Panel.tsx 接入同源本地源 + esbuild 重建 + 重打 zip + 同步 index.json。
4. 验证清单逐项跑。

## 7. 备选与退路

- **cap.http + 本地源 host 白名单**:若 Polaris transport 路由改动受限,可走此路,但须
  复活 `validate_target` 的 host 白名单校验 + 给 cap.http 对 Remote 加动作级 allow,
  改动高敏,仅作退路。
- **`serve-market.js` 绑 0.0.0.0 + 局域网 IP**:临时调试可用,正式不采纳(依赖局域网
  拓扑、webview 安全策略,脆弱)。
