# 日常记账增强方案（终版·已复审）：AI 时间档位 + 账单编辑

> 插件：`pocket-ledger`（日常记账）
> 目标版本：`0.3.0`
> 状态：**实施方案（已复审，未实施）**
> 关联仓库：`D:\space\base\Polaris-plugin\plugins\pocket-ledger`
> 复审要点：本版已修正初稿 4 处实现层漏洞（见 §7），实施按本版执行。

---

## 1. 问题与目标

### 1.1 现状痛点

- **时间失真**：`ledger_add` 不传 `date` 时 `ts=Date.now()`。用户说「午饭 35」不提供时分，若此刻是 21:16，账单却显示 21:16，与「午饭」语义冲突。
- **改错成本高**：现只有 `ledger_delete`+`ledger_add`，改备注要删+插，易丢附件、易重复。

### 1.2 目标

1. AI 记账支持「大概时间」：从对话语境推导时段，映射固定档位时刻；**不确定时按当前时刻就近归档**。
2. 支持按 `id` **修改账单**（金额/备注/分类/时间/类型），不再删除+插入。

---

## 2. 时间档位方案

### 2.1 档位定义（唯一权威）

| 档位 key | 标签 | 时刻 | 触发词（AI 推导 / hint 匹配） |
|---|---|---|---|
| `early_morning` | 凌晨 | `00:00` | 凌晨、深夜、半夜、通宵 |
| `morning` | 早上 | `09:00` | 早饭、早餐、早班、清晨、早上、早点 |
| `noon` | 中午 | `12:00` | 午饭、午餐、中午、中饭、正午 |
| `afternoon` | 下午 | `16:00` | 下午、下午茶、午后 |
| `evening` | 傍晚 | `18:00` | 晚饭、晚餐、傍晚、晚班、下班饭 |
| `night` | 晚上 | `20:00` | 夜宵、宵夜、晚上、晚点 |

> 档位时刻仅决定「该笔账单的显示时分」；**日期归属由 `date`（或当天）决定**，二者独立。

### 2.2 推导优先级（从高到低）

1. **显式 `time`（`HH:MM`）** — 用户/AI 明确给了时刻。
2. **显式 `timeOfDay`（档位 key 或中文标签）** — 明确给时段。
3. **`hint`（默认取 `note`）触发词子串匹配** — 如 note「午饭」→ `noon`。
4. **当前时刻就近归档** — 无任何信号时，按 `now` 落入区间取该档位时刻。

### 2.3 就近归档区间（半开）

```
[00,09) → 凌晨 00:00     [09,12) → 早上 09:00
[12,16) → 中午 12:00     [16,18) → 下午 16:00
[18,20) → 傍晚 18:00     [20,24) → 晚上 20:00
```

### 2.4 core 新增纯函数（shared/ledger-core.js，单一权威）

```js
const TIME_SLOTS = [ /* 见 §2.1 表，含 key/label/hour */ ];
const TIME_SLOT_HINTS = { /* key → 触发词[] */ };

/** 当前时刻 → 就近档位（半开区间） */
function slotOfNow(ts) {
  const h = new Date(ts).getHours();
  if (h < 9) return TIME_SLOTS[0];
  if (h < 12) return TIME_SLOTS[1];
  if (h < 16) return TIME_SLOTS[2];
  if (h < 18) return TIME_SLOTS[3];
  if (h < 20) return TIME_SLOTS[4];
  return TIME_SLOTS[5];
}

/**
 * 解析账单时间 → { ts } | { error }
 * raw: { date?, time?, timeOfDay?, hint?, timezone? }；now = Date.now()
 * date 支持 'today' | 'yesterday' | 'YYYY-MM-DD'（复审：不引入 'custom'，
 * 面板在调用前把 custom 转成 'YYYY-MM-DD'）
 * 合成：目标日期年月日 + 档位时刻（本地时区）
 */
function resolveBillTime(raw, now) { /* 按 §2.2 优先级 */ }
```

**实现细节（复审确定）**
- `time` 校验 `^([01]\d|2[0-3]):[0-5]\d$`，非法 → `error`。
- `timeOfDay` 接受档位 key（`noon`）或中文标签（「中午」）；非法 → `error`。
- `hint` 触发词匹配用 `includes`（子串），命中多个取**首个**（按表序）。
- 日期部分：`today` → `now` 年月日；`yesterday` → `now-24h` 年月日；`YYYY-MM-DD` → 解析年月日（**不校验是否为过去/未来**，允许补记）。
- 合成 `ts = new Date(y, m-1, d, hour, 0, 0).getTime()`（本地构造，无 DST 地区安全）。

---

## 3. 端到端改动

### 3.1 MCP `ledger_add`（mcp/server.js）

- `inputSchema` 新增：
  - `timeOfDay`: `enum ['early_morning','morning','noon','afternoon','evening','night']`
  - `time`: `'HH:MM'`
- 调用内部：`const ts = core.resolveBillTime({ date: args.date, time: args.time, timeOfDay: args.timeOfDay, hint: args.note }, now).ts`（替换现有 `resolveDate`）。
- 删除 MCP 侧不再使用的 `resolveDate`（或保留但标注，**建议删除**以免口径漂移）。
- `description` 更新：说明时段推导与就近归档。
- 返回值不变（仍含当日/当月小计 + 预算提示）。

### 3.2 面板记账 Tab（QuickTab.tsx）

- 新增 `const [timeOfDay, setTimeOfDay] = useState('auto')`；UI 在「日期」行上方加「时段」chips：`自动 / 凌晨 / 早上 / 中午 / 下午 / 傍晚 / 晚上`（`auto`=就近归档）。
- **复审修正**：删除 `save()` 里手工拼 `ts` 的逻辑（line 73-75），改为：
  ```ts
  const dateStr = date === 'custom' ? customDate : date; // 'today'|'yesterday'|'YYYY-MM-DD'
  const r = await addBill({ amount: amt, type, category, note: note.trim(),
    date: dateStr, timeOfDay: timeOfDay === 'auto' ? undefined : timeOfDay, attachmentId })
  ```
  （`custom` 且未选日期时提示，不提交。）

### 3.3 model.ts

- `AddBillInput` 增 `date?`, `timeOfDay?`, `time?`（替换/兼容 `ts?`）。
- `addBill`：`const ts = core.resolveBillTime({ date, timeOfDay, time, hint: note }, Date.now()).ts`，再走 `normalizeBill`；`ts` 仍接受直接传入（向后兼容）。
- 新增 `updateBill(id, patch)`：见 §4.5。

---

## 4. 账单编辑方案

### 4.1 需求

按 `id` 直接改 `type / amount / category / note / date / time / timeOfDay`，跨日/跨月自动迁移日键，附件引用保留。

### 4.2 core 新增 `updateBill`

```js
/**
 * 原地替换一笔：按 id 找，应用 patch，返回：
 * { arr, found, moved }  // arr=更新后的旧日数组；moved=目标日键（与旧不同时为字符串，否则 null）
 * patch 允许 { type?, amount?, category?, note?, ts?, attachmentId? }
 */
function updateBill(existing, id, patch) { /* ... */ }
```

- 未命中 → `{ arr: existing, found: false, moved: null }`。
- `ts` 变化导致目标日键 ≠ 旧日键 → `moved = 目标日键`；调用方负责迁移。
- 不改 `attachmentId`（除非显式传；空串/非法 → 保持原值）。

### 4.3 MCP 新增 `ledger_update`（mcp/server.js）

```
name: ledger_update
desc: 日常记账·修改一笔（按 id）。可改 type/amount/category/note/date/time/timeOfDay。
      改时间跨日自动迁移日键。附件引用保留（除非传 attachmentId）。
inputSchema: { id(req), type?, amount?, category?, note?, date?, timeOfDay?, time?, month? }
```

**调用流程（复审修正定位漏洞）**：
1. 定位：先按 `month`（缺省本月）`loadMonth` 扫日键找 `id`；**未命中则全量扫描所有 `ledger.day.*` 键**（跨月迁移后账单不在原月，必须兜底）。
2. 未找到 → 返回 `err('未找到账单 id ...')`。
3. 计算新 `ts`：若传 `date/time/timeOfDay` → `resolveBillTime`；否则用原 `ts`。
4. `core.updateBill` 生成更新后旧日数组；若 `moved`：
   - `kvSet(旧日键, 移除后arr)`
   - `kvSet(新日键, core.appendBills(新日键现有, [更新后bill]))`（幂等）
   否则 `kvSet(旧日键, 更新后arr)`。
5. 返回：更新后账单行 + 当日/当月小计（复用 `ledger_add` 的反馈格式）。

### 4.4 面板编辑入口（复审修正：两处都加）

- **ListTab.tsx**：明细行 `pl-btn` 区加「改」按钮（在「删」旁）→ 打开编辑弹窗。
- **QuickTab.tsx**：今日列表行同样加「改」按钮。
- 编辑弹窗：复用 `pl-attmodal` 样式结构（新建 `EditModal` 组件或内联），表单字段 = 金额 / 支出·收入 / 分类 chips / 备注 / 时段 chips / 日期；保存 → `model.updateBill`。

### 4.5 model.updateBill 面板实现

```ts
export async function updateBill(id: string, patch: {
  type?; amount?; category?; note?; date?; timeOfDay?; time?;
}, month: string): Promise<{ ok: boolean; error?: string; bill?: Bill }>
```
- 定位同 MCP（`loadMonth(month)` 找 id，未命中全量扫 `ledger.day.*`）。
- 新 `ts` = `resolveBillTime`；跨日迁移两键写入；返回更新后 `bill`。

---

## 5. 兼容与回归

### 5.1 向后兼容
- `ledger_add` 新字段可选；不传时行为=就近归档（**预期行为变化**，README 已知边界注明）。
- 旧账单（无新字段）读取不受影响；`ts` 仍合法。
- `ledger_update` 新增，不动 `ledger_delete`。

### 5.2 测试（test/run-tests.mjs 新增）
- `resolveBillTime`：显式 `time` 优先 / `timeOfDay` 档位 / `hint` 触发词 / 无信号就近归档 / 非法 `time`、`timeOfDay` 返回 `error` / `today`+档位合成正确 / `yesterday` 跨日 / 自定义日期补记。
- `slotOfNow`：各小时区间边界（00:30→凌晨、09:30→早上、12:30→中午、16:30→下午、18:30→傍晚、21:30→晚上）。
- `updateBill`：原地替换各字段 / `found=false` / `moved` 跨日迁移 / 保留附件引用 / `ts` 不变时 `moved=null`。

### 5.3 版本与发布
- `plugin.json` version `0.2.0 → 0.3.0`；`SERVER_VERSION` 同步。
- 重建 `dist/` 面板 bundle、重打 `pocket-ledger.zip` + `update.json`。

---

## 6. 改动文件清单

| 文件 | 改动 |
|---|---|
| `shared/ledger-core.js` | 新增 `TIME_SLOTS` / `TIME_SLOT_HINTS` / `slotOfNow` / `resolveBillTime` / `updateBill`；导出 |
| `mcp/server.js` | `ledger_add` 用 `resolveBillTime`；删 `resolveDate`；新增 `ledger_update`；工具一览注释 |
| `src/model.ts` | `AddBillInput` 加 `date/timeOfDay/time`；`addBill` 内部算 ts；新增 `updateBill` |
| `src/QuickTab.tsx` | 时段 chips；`save()` 改传 date+timeOfDay；今日列表行加「改」 |
| `src/ListTab.tsx` | 明细行加「改」入口；编辑弹窗 |
| `test/run-tests.mjs` | `slotOfNow`/`resolveBillTime`/`updateBill` 用例 |
| `README.md` | 工具清单、AI 示例、已知边界 |
| `plugin.json` | 版本 `0.3.0` |

---

## 7. 复审修正记录（相对初稿）

| # | 初稿问题 | 终版处理 |
|---|---|---|
| 1 | `resolveBillTime` 的 `date` 仅支持 `today/yesterday/YYYY-MM-DD`，未覆盖面板 `'custom'` 状态 | 面板在调用前把 `custom` 转成 `YYYY-MM-DD`；core 不引入 `custom`，保持单一解析路径 |
| 2 | `ledger_update` 只按传入 `month` 扫日键定位，跨月迁移后账单不在该月会「找不到」 | 未命中时全量扫描所有 `ledger.day.*` 键兜底 |
| 3 | 面板 QuickTab `save()` 手工拼 `ts`，与 MCP 口径可能漂移 | 删除手工拼装，统一走 `model.addBill` → `resolveBillTime` |
| 4 | 编辑入口只写在 ListTab | QuickTab 今日列表也加「改」按钮 |

---

## 8. 验收标准

1. 「午饭 35」→ 账单 `ts` 当日 12:00，明细显示「12:00 · 午饭」。
2. 「刚买了杯咖啡」且现在 21:16 → 就近归档「晚上 20:00」。
3. 「午饭记错了，改成晚饭」→ `ledger_update {id, timeOfDay:'evening'}` → `ts` 当日 18:00，金额/备注可同改。
4. 跨日修改（10/28→10/29）→ 旧日键无该 id、新日键含该 id，统计正确；跨月同理（全量扫描兜底）。
5. 优先级 `time` > `timeOfDay` > `hint` > 就近归档 正确。
6. 旧版本写入的账单可被 `ledger_update` 正常修改（不破坏数据）。
7. `pnpm typecheck` + `node --test test/run-tests.mjs` 通过。
