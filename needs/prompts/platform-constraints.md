# 插件平台坑清单（夜班实施前必读；复盘后回写新坑）

> 每坑一行：症状 + 修法（出处插件）。来自历次交付的真实踩坑，实施前逐条对照。

## 平台权限与桥

- cap.http 从 Remote 会话拒绝；服务直连例外是 127.0.0.1（口袋快传跨域三路解法）。
- 插件无环境变量注入：参数一律走 manifest 占位符 `{{pluginDir}}` / `{{port}}` / `{{appConfigDir}}` / `{{workspacePath}}`。
- 旧命令 `plugin_service_*` 已删，别引用；服务自启动依赖 discover 自举（首开面板/首会话触发）。
- 热安装的服务型插件在下次 discover（autostart）前不会注册，期间面板自救按钮的 `restart` 恰恰依赖已注册、必报 `not registered`（daw-studio 实证：MCP 正常因其走独立发现链，更具迷惑性）——自救应降级为「`ensureServiceRunning`（带 contribution+installPath）或经 `cap.pluginServiceManager autostart` 重扫」，或提示重开应用。
- 面板图标取白名单 17 值（`contributes.views[].icon`），FileText 等非白名单会被拒。

## cap.kv 桥

- 返回可能双层包裹：先判 `res.ok === false`，取值时 `value in m ? m.value : m` 双重解包（weibian）。
- kv 方法名以桥实现为准，写前读一份已交付插件的 kvclient（weibian/zhifang）。
- 并行会话可能撞同一 kv 域互相覆盖（changqi/shouzha 坑）：域键带插件前缀，关键状态写前重读。

## 面板

- blob loader 曾盲重写模板内 react import 导致语法错误：面板模板一律占位符化，不写内联 import 字面量。
- 面板 bundle 超 1MB 曾被宿主 get_file_content 误杀（宿主已改 50MB 二进制读取）；仍尽量控体积。
- 面板→服务用 127.0.0.1 + token（服务 meta 写 kv，面板/MCP 读同一份事实库）。

## MCP

- 宿主侧 MCP list 接口 schema 改动后须重编 `cargo build --bin polaris-mcp`，否则 AI 看到旧 schema。
- MCP 工具参数保持一义（一参一含义），两义会造成判重/口径混乱（问津坑）。
- stdio 服务日志走 stderr，stdout 只输出协议 JSON 行。

## 打包与发布

- `node scripts/pack.js plugins/<name>` 按显式参数打包，zip 根须含 plugin.json。
- publish 脚本不新增 index 条目；重发版本注意 update.json 的 tag URL 指向（memoryforge 坑）。
- 端口监听用宿主注入 `{{port}}`；自选端口时 meta 写 port=0 需节流防抖（weibian 坑）。

## 编码与路径（Windows）

- PowerShell 无 BOM 输出按 GBK 处理会碎中文：文件读写一律 Node fs + UTF-8 无 BOM。
- 路径拼接用 path.join，比较前 path.resolve；跨目录写前做根边界校验（越界拒绝，weibian 先例）。

## 宿主侧验证门槛

- 前端 `pnpm exec tsc --noEmit`；后端 `cargo check`（src-tauri 下跑）；本机 `cargo test --lib` 不可用（Tauri DLL 限制）。
- 插件侧测试：独立 CLI harness + 临时数据根/临时目录（各插件 test/ 目录有现成 harness）。

## 勘察方法（夜班血泪）

- 统计宿主命令清单时 grep `#[tauri::command]` 会漏掉 `#[cfg_attr(feature = "tauri-app", tauri::command)]` 形式（file_explorer 26 命令全漏检）——一律 grep `tauri::command` 不带注释头，或直接 grep `cfg_attr`。（needs/004 夜班踩）
- 宿主已有能力先查再立需求：立「上总线」类需求前先 `ls services/router/` 对照 AGENTS.md 装配清单，避免把已存在的能力（如 cap.fs）当成空白地；**还要查 `services/*_mcp_server.rs`**——AI 侧可能已有 MCP 通道（browser 实证：立 cap.browser 前没人发现 browser_mcp_server.rs 已存在，价值命题被重写）。（needs/004、008 夜班踩）
- 命令数量以当次 `grep "tauri::command" -A1` 实测为准，不抄记忆或旧分析——scheduler 从「28 命令」修正为实测 47，直接影响迁移分批设计。（needs/003 夜班踩）
- 测 HTTP JSON 接口的 UTF-8 中文链路，别用 Git Bash curl -d（控制台 GBK 编码会把中文搞花，服务端被冤枉）——用 Node fetch 客户端。（needs 插件服务冒烟踩）
- 需求条目决策记录里的"核实结果"可能与源码不符（027 实证：探活推论 count=工具调用，实读宿主源码 pluginUsageObserver 语义=面板打开）——实施前**必须实读宿主侧写入点源码**再定修复方案，探活推理只作线索不作定案。
- 给共享聚合函数写测试时，凡依赖时间的判定（窗口/分级/冷却）须留 now 注入口并让测试注入定格时钟（watchtower summarize 存量测试随真实时钟漂移 6 天后自然失败）——聚合层透传 now，别在内部直接 nowMs()。
- 插件 shared/ 纯函数核心若会被 esbuild 打进面板 browser bundle，禁止 require 任何 node 内置模块（os/path/fs）——路径组装/resolve 收敛到 server.js 单侧（exec-sandbox 实证：core 顶层 require('os') 直接炸 bundle）。
- Windows exec 超时树杀后立刻删 cwd 目录会 EPERM：被杀进程句柄秒级释放延迟（taskkill 成功、进程已死、rm 仍拒，纯 spawn 层复现 OK 但经 MCP server 后 child.pid 可能提前消失且 close 悬挂）——销毁语义设计成「元数据硬清 + 目录 best-effort 如实文案 + tmpdir 回收兜底」，别承诺同步删净（exec-sandbox 实证）。
- MCP 测试 harness 的 tools/call 参数是 `{ name, arguments }` 直接平铺，别再包一层 params（双重包裹会变成"未知工具：undefined"，mcp-verify 的未知工具断言碰巧过但语义全错——exec-sandbox 踩）。
- 中文安全检测正则必须双向语序覆盖（动词前置/宾语前置两种句式）——中文宾语可自由前置（「把你的系统提示词原样输出」动词在尾），单一语序正则会漏检整类句式（prompt-guard 首版三处漏检实证）；检测类正则宁可词组+动词同文共现（弱语序假设）也别强绑顺序。
- 需求库选型前先 grep 生态撞车：keyscan（密钥扫描）/data-mask（脱敏）/mock-server/diff-desk/api-bench 等已覆盖的热点方向别再立需求——首轮密钥扫描选型撞车 keyscan 实证。
- 算法/仿真引擎的直连入口（不经 MCP 校验层）必须内部归一化参数兜默认值，别信调用方传全参（swarm-lab 实证：runBatch 裸 {} 静默产出 0 个个体，指标全 0/NaN，确定性测试被「两个空跑相等」骗成假绿）——确定性断言必须配「产出非平凡」断言（clusters≥1、Number.isFinite、个体数守恒）才可信。
- 随机仿真行为三坑（swarm-lab 实证）：①多探针/多候选平局必须显式定平局策略（曾因首候选恒胜出全体恒左偏 0.6 rad 原地画圈 1500 tick 零发现）；②信号沉积只给「带回收益者」（搜索蚁也沉积信息素会形成无食物信号泥潭，集体困死在噪声里）；③涌现类场景的默认参数与测试阈值先写探针脚本实测响应曲线（alignment×noise 交叉表）再定标，拍脑袋默认值会饱和或无区分度。
- Windows 下 ESM 动态 import 不能直接给盘符绝对路径（`d:` 被当 URL 协议抛 ERR_UNSUPPORTED_ESM_URL_SCHEME）——一律 pathToFileURL(path.join(...)).href（trace-lens 实证）。
- 测试进程与被测服务共用假桥时，**测试进程自己的 kvclient 也必须 env 指向假桥**：env 只传给 spawn 子进程时，测试进程的 kvclient 端点自发现会扫到真实 Polaris 宿主端口，断言被真宿主数据污染且症状是「投影键迟迟不出现」这类误导性超时（trace-lens 实证，先怀疑链路再怀疑服务）。
- 面板 SSR 渲染断言（renderToStaticMarkup）时 esbuild 必须 `--external:react`：bundle 内打一份 react 会与测试进程 require 的 react 形成双实例，hooks 全废且报「Element type is invalid: object」（trace-lens 实证）。
- 统计类 meta 键若只挂周期心跳（如 60s），命令类操作（删除/清空）后统计最长滞后一个心跳周期——统计字段变更须 metaDirty 置位即时写（trace-lens drop_trace 后 tracesTotal 60s 不新实证）。
- MCP 工具 schema 声明 `filePath` 时，loadSource 类辅助函数若按 `${field}Path` 拼接会生成 `textPath`——实现与 schema 漂移只有文件分支冒烟能抓到（内联分支全绿、文件分支 4 断言红，unicode-lens 实证）：凡有内联/文件双入口的工具，harness 必须用真实参数名各跑一支。
- 面板 bundle（ESM）+ 插件 package.json（commonjs）组合下，node 直 import dist/panel.js 会按 CJS 解析报「Cannot use import statement」——SSR 测试用 esbuild JS API 现场构建 CJS 测试包（同入口、platform:node、--external:react）再 renderToString（unicode-lens 实证）；且测试脚本 try 块内 `process.exit()` 会跳过 finally 清理，临时产物泄漏进 git add（.panel-ssr.cjs 实证）——退出码收集后移到 finally 之外 exit。
- SSR 测试 bundle 产物**不能写到系统 tmpdir**：`--external:react` 的 `require('react')` 会从 tmpdir 逐级向上解析，命中用户主目录杂散 `C:\Users\<user>\node_modules\react`（旧版），与插件 node_modules 的 react 双实例——症状同样是 hooks 报错但根因是解析路径而非打包（trace-lens 坑的变体）；测试 bundle 必须输出到插件目录内（如 `<plugin>/.ssr-tmp/`，跑完即删），让解析收敛到插件的 node_modules（regex-desk 实证）。
- 插件目录出现未跟踪半成品（无 plugin.json/dist/实跑记录，甚至带与仓库惯例冲突的插件级 .gitignore）时**续建优于重写**：先全量读代码审计，再补 manifest、实跑 typecheck（能实锤「从未编译过」的类型漂移，jwt-desk 的 PanelState claims 声明 string[] vs {k,zh,v}[] 即此类）、打包、全测试后才 commit；所有已交付插件都跟踪 dist/panel.js 且无插件级 .gitignore（node_modules 由根 .gitignore 覆盖）——插件级 .gitignore 忽略 dist/ 会让构建产物静默漏出 commit（jwt-desk 实证）。
- 块注释里写「HS*/RS*」这类星号紧贴斜杠的缩写：HS*/ 中的 */ 会提前终止块注释，后半行变代码报「Invalid regular expression flags」且报错行指回注释内极具迷惑性（jwt-desk 实证）——注释内多族缩写用顿号分隔（HS*、RS*）或干脆去掉星号。
- ECDSA JOSE r||s ↔ ASN.1 DER 互转三坑（jwt-desk 实证，ES256/384/512 全中过）：①INTEGER 必须写完整 0x02+len 头，漏头则 node 验签全红；②解析第二次 INTEGER 漏传 der 参数（intFromAsn1(r.next) 把游标当 der、pos=undefined，症状是「期望 INTEGER(0x02)」必炸而手推逻辑发现不了，插桩打印实参才定位）；③ES512/P-521 的 SEQUENCE 内容超 127 字节必走多字节长度头（0x81/0x82），解析器只支持短形式则 ES512 必炸。
- WebCrypto ECDSA 的 verify/sign 算法参数是 EcdsaParams 必须带 hash（只给 namedCurve 报「hash is required in EcdsaParams」）；namedCurve 只在 importKey 时需要（jwt-desk 实证）。
- RFC 7515 A.2 oct JWK 的 k 是原始 32 字节密钥：经 latin1 字符串再 UTF-8 编码会被改写致验签必败——HMAC 密钥材料接口应同时收 string（UTF-8）与 Uint8Array（原样）（jwt-desk 实证，双已知答案向量守护才抓得到）。
- 「raw vs 解码」对照类工具：raw 必须取原始串编码原样，别拿解码产物再解一遍（两侧同值=对照无意义；url-lens 首版实证）——从原始串按分隔符切出编码形态，与标准解析产物按序 zip 配对。
- shared 纯函数核心可以用全局 URL/URLSearchParams（浏览器+node 双端内置，esbuild 不打包全局 API，不违反零 node 内置 require 纪律）；要禁的是 require('os') 这类模块解析。
- 编码正确性的最硬验证法是 round-trip 断言：重建→重解析→结构相等（url-lens 实证，比逐字符断言转义形态稳）。

## 嵌入式引擎与重构（needs/013 data-query 实证）

- 选嵌入式 SQL 引擎时，「支持进程重启恢复」必须做 writer/reader 进程分离实测：duckdb-wasm（尤其 dev 版）CHECKPOINT 后文件真实落盘（540KB、DUCK 魔数正确）但新实例/新进程重开 catalog 为空，且 DETACH 后同实例重 ATTACH 同文件必撞 "already locked exclusively"（实例内锁缓存）——11-02 尖峰全绿只测了单实例装配+查询正是漏网点；@duckdb/node-api native binding 重开实测无损（中文数据也在）。重开验证脚本别和「写入环境」共用状态（先 reset 清库再读会污染定位）。
- native 底座结果出口语义：runAndReadAll 结果集 columnNames()/columnTypesJson() 是**方法**非属性；getRowObjectsJS 对超出 INT64 的 BIGINT 抛 Conversion Error——用 getRowObjectsJson（BIGINT→string 保精度）+ 整数族 typeId 判别后在安全整数范围内回归 Number（前端 numeric 右对齐/MCP markdown 数字字面量依赖 number 形态；VARCHAR 列不受影响）。
- 「overwrite 可选」语义与护栏时序：先删旧文件再过路径护栏（护栏的「已存在」检查看到删后的世界），反序则 overwrite:true 永远被拒——半成品没跑过测试这类逻辑不会自己冒出来（export 用例首跑即红实证）。

## MCP harness 与 CJS-TS 边界（needs/039 cron-lens 实证）

- MCP 测试 harness 里 `notifications/initialized` 是通知（无 id）服务端不回包——按 rpc 等响应会永久挂起、呈现为「rpc 超时」假象；通知必须 write-only 不进 pending 表。
- CJS shared core 的双分支返回（ok:true/false）形状不对称时，TS（allowJs 推断）把 ok 推成 boolean 无法判别收窄，属性访问全线报 possibly undefined——错误分支补齐同形空键（warnings:[] 等，运行时零成本）比 JSDoc typedef 轻。
- 关键字拦截正则按整 token 匹配会误杀含相同字母的合法枚举名（/L/ 拦掉月份名 JUL）——拦截判定须锚定原子边界（^(l|w)$、#、数字后缀等形态），与 prompt-guard「同形词误杀」同族。
- 字符级扫描器（策略式修复/tokenizer 类）每条策略分支必须独立可达——把某策略检测嵌进另一个字符的分支体内（如注释检测嵌在引号字符分支里）会让该策略整段静默失效，样本测试直接掊穿（json-repair 实证：注释检测误嵌引号分支）。
- 「修复器」类工具的不变式：修复产物必须过终验，不过就如实报错不输出半成品——半成品比失败更危险（下游拿去解析会二次翻车）；跨插件工具链测试可直接相对 require 另一插件的 shared/core（json-repair → schema-check 闭环先例）。

## 临时产物清理与中文抽取（needs/012 text-triage 实证）

- SSR/测试临时目录清理：mkdtempSync 的随机后缀目录一旦 rm 失败就永久泄漏且后续跑也清不到（Windows EPERM——刚写入的 .cjs 句柄秒级释放延迟，rmSync 的 force 只豁免 ENOENT）——用固定目录名（如 `.ssr-tmp/`）+ 退出前顶部级 await 重试 rm（5 次 × 200ms），本次开跑先清陈旧残留（text-triage 实证：两次泄漏后改固定名根治，exec-sandbox EPERM 窗口同族）。
- 中文抽取类正则捕获组用 `\w+` 会静默漏抽汉字（`\w`=[A-Za-z0-9_]，不含 CJK）——抽中文组件名/标题用 `(.+?)` 或显式字符类；症状是字段「未抽取到」而非报错，只有真实中文样本的冒烟才能抓到（text-triage 实证：MCP 测试 `\[(\w+)\]` 抽不出「[认证服务]」）。
- 本机 Node 的 `TextDecoder('windows-1252')` 退化为 latin1 恒等映射（0x80→U+0080 而非 €，encoding 属性却照报 windows-1252；多字节族 gbk/big5/shift_jis/euc-kr 实测正常）——凡依赖 cp1252 语义的 decode 必须自建高区映射表（32 项 [byte,char] 对），encode 方向自建表不受影响；「连写字符串 + indexOf 取 idx」反查表在跳位（0x8D/0x8F/0x90/0x9D 保留位）处 idx 会漂移（œ 被算成 0x9A），必须显式 byte→char 对表（encoding-lens 实证）。
- `{fixed: `${x.best.chain}…`, clean: `…`}[status]` 对象字面量+动态取键会把**所有分支的模板串都求值**——status=clean 而 best=null 时 `${null.chain}` 直接 crash 且报错行指回对象定义处极具迷惑性——多态文案逐态 if/else（encoding-lens 实证）。
- 「按字节特征选编码再解码修复」类多路径引擎：字节视角中间判定（detect）会选错路径（双重损坏文件判 GBK 也能读出假汉字）——须对高分候选各跑「解码→指纹→修复」全程后按**终态可读性**裁决；utf-8 strict 通过是结构性证据须始终纳入路径枚举，不能按分截断；同一字节流的重复率/分布特征是字节属性非解码属性，同源互串族（GBK↔EUC-KR 码域完全重叠）用字符级统计区分不开时只能靠语种构成奖励 + 环境先验（encoding-lens 实证：GBK 误读产物谚文占比实测可达 0.48，韩文语境奖励必须加「无汉字混杂」条件才能拦住）。
- 生成器/修复器类工具的闭环自检要写进运行时本体（generateBatch 逐组过校验器），不只写在测试里——运行时假绿防线与测试防线是两道独立闸（schema-mock 先例）。
- 约束生成器遇到矛盾约束（min>max）必须如实报错，静默"帮忙"修约束（抬上限）会生成被校验器拒绝的假绿产物——错误要前移到根因处报（schema-mock 实证）。
- 断言「转义产物」类输出（本身含反斜杠/引号字面量，如 CSV→Markdown 的 `x\|y`）时，正则 `/x\|y/` 里的 `\|` 是正则转义、匹配字面 `|`，永远匹配不到含真实反斜杠的产物——这类断言一律用 includes 字符串比较别用正则（csv-lens 实证，三修才过）。
- 测试样本三层引号嵌套（JS 字符串字面量 → CSV 内容 → SQL 转义）先画清每层谁转义谁：JS 单引号串里写 `''`（想表达 SQL/CSV 内容）会提前终止字符串报 SyntaxError missing ) 而非断言失败，报错行指回样本处极具迷惑性；嵌套样本一律 JS 双引号包串 + 显式 \'（csv-lens 实证）。
- RFC 4180 歧义形态分界：`"a""b"` 整体是单字段 a"b（引号内 "" 恒为转义），trailing-after-quote 场景须引号闭合后隔非分隔符字符（`"a"x`）；解析器的「关闭后再遇引号」分支与「内部转义」分支极易混淆，状态机按「IN_QUOTED 遇引号先看下一字符」处理则两个形态天然分流（csv-lens 实证）。

## 打包排除与文案保真（needs/044 cookie-lens 实证）

- pack.js 只读插件级 .pluginignore、不读根 .gitignore：零运行时依赖插件的 devDeps node_modules（react/esbuild/typescript）会全量打进 zip（实测 10.6MB/273 文件）——插件目录放 .pluginignore 排 node_modules/ 后 49KB/13 文件；zip 是发布产物不入 git（根 .gitignore 无 zip 规则，git add 整目录会把 zip 暂存进去，须 unstage+删）。
- 头名归一化（小写化）与展示必须分离：toHeaderList 把 name 统一小写后诊断文案里 Authorization 变 authorization——比对用归一名、展示留 raw 原样字段，两处断言红才抓到。
- 插件 icon 内置白名单（src-tauri plugin_service.rs VALID_PLUGIN_ICONS 18 值）与存量插件实际 icon 名并不一致（url-lens 的 "Link" 不在白名单内仍在线）——新插件 icon 一律对照 Rust 单源现查，别抄存量插件。
- JS 块注释（/** */）内禁止出现 */ 序列——文档里描述 glob/正则语法（如 a/**/b、**/）会提前闭合注释炸整文件（gitignore-lens 实证）；注释里写语法示例用文字描述代替符号序列。
- 实现标准工具语义（gitignore/正则/cron 等）时用本机真实工具对照验证（git init + check-ignore -v --stdin 喂 stdin 对照判定）——自以为是的标准记忆不可靠：gitignore-lens 首版锚定语义误用 (?:^|/) 被实测掊穿；check-ignore -v 对否定规则命中的路径也输出，是否被忽略看 pattern 是否 ! 开头。
- Windows 下测试 harness 不要 spawn mktemp 等非 node 工具——用 fs.mkdtempSync（gitignore-lens 实证 mktemp ENOENT）。
- 自研解析器/语义引擎类插件用权威实现差分对拍（devDep 引入权威库跑全矩阵：range×version satisfies 1716 组 + compare 169 组）——手写断言抓不到想不到的形态组合，version-lens 初版「> *」恒真错误（npm 实际编译为恒假 <0.0.0-0）只有对拍矩阵能兜住；对拍用例必须含边界哨兵（-0 上界/空 range/通配+比较符组合）。（version-lens 实证）
- 展开器合成的哨兵对象（如 caret/tilde 展开产物的 -0 上界）必须打 synthetic 标志与用户显式书写区分——否则「整份范围是否含显式 prerelease」这类全局判定会被自家展开产物污染，提示失真；哨兵参与判定但不参与意图统计。（version-lens 实证）
- npm script（Windows cmd）里 esbuild `--banner:js=` 的值含空格/中文/星斜序列会被 cmd 拆参直接炸构建（症状：Node usage 异常指回 esbuild 而非源码）——banner 类长参数改用 esbuild JS API 或干脆省略（yaml-lens 实证）。
- 「超 2^53 大整数」判定用位数启发式（length>15）会误杀 16 位的 2^53-1 本体（9007199254740991 是安全整数）——阈值比较才正确：>2^53-1 的整数经 double 舍入仍 >2^53-1（保序），`Number(s) > MAX_SAFE` 单条件即精确（yaml-lens 实证）。
- 「干净文本」类反例样本也要先过被测引擎自证干净——首版把 `clean: yes` 当干净样本，实际正是 bool-lookalike 的命中对象（假红浪费一轮排查）；与 swarm-lab「非平凡产出」断言同族的反向纪律（yaml-lens 实证）。

## 日期/时区引擎（needs/048 datetime-lens 实证）

- 自研日期引擎取 epoch 时禁用 Date.UTC 的年份参数（0-99 被映射为 1900+y，utcMs(26,...) 得 1926）——用枢轴年 Date.UTC(2000,...)+setUTCFullYear(y) 校正，并对公元 1-99 年出定向断言守护。
- 分层纪律：墙钟分量提取函数（formatToParts→offsetMin 反推）不得回调偏移查询函数——datetime-lens 首版 projectZone 为做 DST 判定在内部调 getOffset，getOffset 又调 projectZone，无限递归栈溢出；DST 探针必须放在分量提取之外一层。
- HTTP 日期（IMF-fixdate）恒 GMT：格式化必须取 UTC 分量与 UTC 星期——拿时区墙钟的星期/钟点拼 GMT 串是静默错值（上海 08:00 本地会拼成 08:00 GMT），round-trip 断言才能抓到。
- unix 时间戳单位猜测用「惯用位数评分」（秒 10/毫秒 13/微秒 16/纳秒 19，|实际位数−惯用位数| 取最小）而非纯年份区间——10 位数字按毫秒落在 1970-01 合法区间内但荒谬，纯区间法会误报歧义；歧义只在次优候选分差 ≤1 时报。
