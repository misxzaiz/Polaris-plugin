'use strict';
/**
 * reference.js —— jq 内置函数/语法速查表（离线数据 + 关键词搜索）
 *
 * 用途：面板速查表抽屉、MCP jq_reference 工具（帮助 AI 写对查询）。
 * 单一权威：面板经 /api/reference 读取本表，MCP 直接 require。
 * 条目口径：sig = 签名/形态，desc = 一句话语义，ex = 可跑的最小例子。
 */

const ENTRIES = [
  // ── 基础取值 ──
  { cat: '取值', sig: '.', desc: '恒等：原样输出输入', ex: '{"a":1} | .' },
  { cat: '取值', sig: '.foo', desc: '取对象字段（缺字段得 null）', ex: '{"a":1} | .a' },
  { cat: '取值', sig: '.foo?', desc: '容错取值：对象上取字段出错时不报错，得空', ex: '"str" | .a?' },
  { cat: '取值', sig: '.["foo"]', desc: '括号取字段（键可来自变量/表达式）', ex: '{"a":1} | .["a"]' },
  { cat: '取值', sig: '.[0] / .[-1]', desc: '数组下标，负数从尾数', ex: '[1,2,3] | .[-1]' },
  { cat: '取值', sig: '.[1:3]', desc: '数组/字符串切片 [起,止)', ex: '[1,2,3,4] | .[1:3]' },
  { cat: '取值', sig: '.[]', desc: '迭代：数组逐元素/对象逐值输出（多个结果）', ex: '{"a":1,"b":2} | .[]' },
  { cat: '取值', sig: '..', desc: '递归下降：所有子值', ex: '{"a":{"b":1}} | [..]' },
  { cat: '取值', sig: '.a.b.c', desc: '链式取值', ex: '{"a":{"b":{"c":42}}} | .a.b.c' },

  // ── 管道与组合 ──
  { cat: '组合', sig: 'a | b', desc: '管道：左输出作为右输入', ex: '[1,2,3] | length' },
  { cat: '组合', sig: 'a, b', desc: '逗号：先后输出两个流', ex: '1, 2' },
  { cat: '组合', sig: 'a // b', desc: '备选：左为 null/false/空流时取右', ex: '.a // "默认"' },
  { cat: '组合', sig: '? / try', desc: '容错：try f 或 f? 把错误吞成空流', ex: '("a" | tonumber)? // 0' },
  { cat: '组合', sig: 'if .. then .. else .. end', desc: '条件（else 可省略）', ex: 'if . > 0 then "正" else "非正" end' },

  // ── 构造与绑定 ──
  { cat: '构造', sig: '{a: .x, b: .y}', desc: '对象构造（{x} 是 {x: .x} 的简写）', ex: '{"x":1,"y":2} | {x, y}' },
  { cat: '构造', sig: '[f]', desc: '数组构造：把流收集成数组', ex: '1,2,3 | [., .+1]' },
  { cat: '构造', sig: 'as $x | ..', desc: '绑定：把值命名供后用', ex: '[1,2] | . as $a | $a | add' },
  { cat: '构造', sig: 'def f: body;', desc: '自定义函数（可递归）', ex: 'def double: . * 2; [1,2] | map(double)' },
  { cat: '构造', sig: 'reduce', desc: '折叠累加', ex: '[1,2,3,4] | reduce .[] as $x (0; . + $x)' },
  { cat: '构造', sig: 'foreach', desc: '折叠但输出每一步', ex: '[1,2,3] | foreach .[] as $x (0; .+$x)' },
  { cat: '构造', sig: 'label $out | .. | break $out', desc: '提前跳出循环', ex: '[limit(3; repeat(1))]' },

  // ── 迭代/过滤 ──
  { cat: '迭代', sig: 'select(f)', desc: '过滤：f 为真才输出', ex: '[{"n":1},{"n":5}] | .[] | select(.n > 3)' },
  { cat: '迭代', sig: 'map(f)', desc: '数组逐元素变换', ex: '[1,2,3] | map(. * 10)' },
  { cat: '迭代', sig: 'map_values(f)', desc: '对象/数组逐值变换（保留键）', ex: '{"a":1} | map_values(. + 1)' },
  { cat: '迭代', sig: 'first / last', desc: '首/尾元素（first(f) 取流第一个）', ex: '[3,1,2] | sort | first' },
  { cat: '迭代', sig: 'limit(n; f)', desc: '只取流前 n 个（防死流必备）', ex: '[limit(3; repeat(1))]' },
  { cat: '迭代', sig: 'range(a;b;c)', desc: '数值区间流', ex: '[range(0; 10; 3)]' },
  { cat: '迭代', sig: 'recurse', desc: '递归展开所有子值', ex: '{"a":{"b":[1]}} | [recurse]' },
  { cat: '迭代', sig: 'while(cond; update)', desc: '条件循环', ex: '[while(. < 100; . * 2)]' },
  { cat: '迭代', sig: 'until(cond; update)', desc: '直到条件成立', ex: '[.,1] | until(.[0] < 1; [.[0] - 1, .[1] * 2])' },
  { cat: '迭代', sig: 'env / $ENV', desc: '环境变量对象', ex: '$ENV.USERNAME // $ENV.USER' },
  { cat: '迭代', sig: 'input / inputs', desc: '读取其余输入文档（多文档流用）', ex: '[inputs] | length' },

  // ── 键值与路径 ──
  { cat: '键值', sig: 'keys / keys_unsorted', desc: '对象的键数组（前者排序）', ex: '{"b":1,"a":2} | keys' },
  { cat: '键值', sig: 'to_entries / from_entries', desc: '对象↔[{key,value}] 数组互转', ex: '{"a":1} | to_entries' },
  { cat: '键值', sig: 'with_entries(f)', desc: '对每个键值对做变换再还原对象', ex: '{"a":1} | with_entries(.value += 1)' },
  { cat: '键值', sig: 'has(k)', desc: '对象有键/数组有下标？', ex: '{"a":1} | has("a")' },
  { cat: '键值', sig: 'paths', desc: '所有路径（含中间路径）', ex: '{"a":{"b":1}} | [paths]' },
  { cat: '键值', sig: 'getpath / setpath / delpaths', desc: '按路径取/写/删', ex: '{"a":{"b":1}} | getpath(["a","b"])' },
  { cat: '键值', sig: 'del(path)', desc: '删除字段/下标', ex: '{"a":1,"b":2} | del(.a)' },
  { cat: '键值', sig: 'to_number  tonumber', desc: '字符串→数字', ex: '"42" | tonumber' },
  { cat: '键值', sig: 'tojson / fromjson', desc: '值→JSON 字符串 / 字符串→值', ex: '"{\\"a\\":1}" | fromjson' },

  // ── 聚合 ──
  { cat: '聚合', sig: 'length', desc: '数组/对象/字符串长度，null 得 0', ex: '[1,2,3] | length' },
  { cat: '聚合', sig: 'utf8bytelength', desc: '字符串 UTF-8 字节数', ex: '中文 | utf8bytelength' },
  { cat: '聚合', sig: 'add', desc: '求和/拼接（按 + 语义）', ex: '[{"v":1},{"v":2}] | map(.v) | add' },
  { cat: '聚合', sig: 'any / all', desc: '任一/全部为真', ex: '[1,2] | any(. > 1)' },
  { cat: '聚合', sig: 'flatten / flatten(d)', desc: '展平嵌套数组', ex: '[[1,[2]],[3]] | flatten' },
  { cat: '聚合', sig: 'unique / unique_by(f)', desc: '去重（先排序）', ex: '[3,1,2,1] | unique' },
  { cat: '聚合', sig: 'group_by(f)', desc: '按键分组（结果已排序）', ex: '[{"k":"a"},{"k":"b"},{"k":"a"}] | group_by(.k)' },
  { cat: '聚合', sig: 'sort / sort_by(f)', desc: '排序', ex: '["bb","a","ccc"] | sort_by(length)' },
  { cat: '聚合', sig: 'min / max / min_by / max_by', desc: '最值', ex: '[{"n":3},{"n":1}] | max_by(.n)' },
  { cat: '聚合', sig: 'reverse', desc: '倒序', ex: '[1,2,3] | reverse' },
  { cat: '聚合', sig: 'contains / inside', desc: '包含判断（对象/数组/字符串泛化）', ex: '"foobar" | contains("bar")' },
  { cat: '聚合', sig: 'indices / index / rindex', desc: '子串/子数组出现位置', ex: '"aBcDeF" | "cD" | . as $x | indices($x)' },
  { cat: '聚合', sig: 'tostream / fromstream', desc: '值↔路径流（高级 diff/遍历）', ex: '{"a":{"b":1}} | [tostream]' },

  // ── 字符串 ──
  { cat: '字符串', sig: 'split(s) / join(s)', desc: '字符串拆/接（split 正则版是 split/2）', ex: '"a,b,c" | split(",") | join("-")' },
  { cat: '字符串', sig: 'ltrimstr / rtrimstr', desc: '去前后缀（不匹配则原样）', ex: '"v1.2.3" | ltrimstr("v")' },
  { cat: '字符串', sig: 'startswith / endswith', desc: '前后缀判断', ex: '"img.png" | endswith(".png")' },
  { cat: '字符串', sig: 'ascii_downcase / ascii_upcase', desc: '大小写转换', ex: '"AbC" | ascii_downcase' },
  { cat: '字符串', sig: 'explode / implode', desc: '字符串↔码点数组', ex: '"AB" | explode' },
  { cat: '字符串', sig: 'gsub(re; s) / sub(re; s)', desc: '正则替换（全部/首个）', ex: '"a1b22" | gsub("[0-9]+"; "#")' },
  { cat: '字符串', sig: '@base64 / @base64d', desc: 'Base64 编/解码', ex: '"hello" | @base64 | @base64d' },
  { cat: '字符串', sig: '@csv / @tsv', desc: '数组→CSV/TSV 行（字段须为数组）', ex: '["a","b,c"] | @csv' },
  { cat: '字符串', sig: '@json / @text / @html / @uri / @sh', desc: '格式化输出', ex: '"a b" | @uri' },
  { cat: '字符串', sig: 'tostring', desc: '值→字符串（字符串原样）', ex: '42 | tostring' },

  // ── 正则（Oniguruma 方言）──
  { cat: '正则', sig: 'test(re)', desc: '匹配测试', ex: '"id=42" | test("^[a-z]+=") ' },
  { cat: '正则', sig: 'match(re)', desc: '匹配详情（offset/length/string/captures）', ex: '"id=42" | match("[0-9]+")' },
  { cat: '正则', sig: 'capture(re)', desc: '命名捕获组对象', ex: '"id=42" | capture("(?<n>[0-9]+)")' },
  { cat: '正则', sig: 'scan(re)', desc: '所有匹配流', ex: '"a1b22" | [scan("[0-9]+")]' },
  { cat: '正则', sig: 'splits(re)', desc: '正则拆分流', ex: '"a1b2" | [splits("[0-9]+")]' },
  { cat: '正则', sig: 'match(re; "g")', desc: '带 flags：g 全局 i 忽略大小写 x 扩展', ex: '"aAa" | [match("a"; "g") | .offset]' },

  // ── 时间 ──
  { cat: '时间', sig: 'now', desc: '当前时间戳（秒，浮点）', ex: 'now | floor' },
  { cat: '时间', sig: 'todate / fromdate', desc: '时间戳↔ISO 8601 字符串', ex: '1700000000 | todate' },
  { cat: '时间', sig: 'strftime(fmt) / strptime(fmt)', desc: '按格式化/解析（C strftime 口径）', ex: 'now | strftime("%Y-%m-%d")' },
  { cat: '时间', sig: 'mktime / gmtime / localtime', desc: '断言时间↔broken-down 结构', ex: '"2023-11-14T22:13:20Z" | fromdate | gmtime' },
  { cat: '时间', sig: 'todateiso8601 / dateadd?', desc: 'ISO 输出；日期加法用 strftime+mktime 组合', ex: 'now | todateiso8601' },

  // ── 数学 ──
  { cat: '数学', sig: 'floor / ceil / round / fabs', desc: '取整/绝对值', ex: '-3.7 | fabs | ceil' },
  { cat: '数学', sig: 'sqrt / pow(a;b) / log / exp', desc: '常用数学函数', ex: '9 | sqrt' },
  { cat: '数学', sig: 'infinite / nan / isnan / isinfinite', desc: '特殊数值', ex: 'infinite > 1e308' },

  // ── 调试与杂项 ──
  { cat: '杂项', sig: 'empty', desc: '不产出任何结果', ex: '[.[] | select(. == 99) | empty]' },
  { cat: '杂项', sig: 'error(msg) / error', desc: '抛错（配合 try 用）', ex: '. | if . < 0 then error("负数") else . end' },
  { cat: '杂项', sig: 'debug', desc: 'stderr 打印调试信息（不影响输出）', ex: '{"a":1} | debug | .a' },
  { cat: '杂项', sig: 'type / not', desc: '类型名 / 逻辑非', ex: '[1] | type' },
  { cat: '杂项', sig: 'halt / halt_error', desc: '立即退出（halt_error 可带码）', ex: 'if . == null then halt else . end' },
  { cat: '杂项', sig: 'input_line_number / $__loc__', desc: '位置信息', ex: '1 | $__loc__' },
  { cat: '杂项', sig: 'getpath? 兜底写法 .a.b?', desc: '深层安全取值组合', ex: '.a.b.c? // "缺"' },
  { cat: '杂项', sig: 'env.变量名', desc: '按名取环境变量', ex: 'env.PATH | type' },

  // ── CLI flags（本面板已暴露的）──
  { cat: 'flags', sig: '-r / --raw-output', desc: '字符串结果去掉引号原样输出', ex: '"a" | . ' },
  { cat: 'flags', sig: '-c / --compact-output', desc: '紧凑输出（单行）', ex: '{"a":1}' },
  { cat: 'flags', sig: '-s / --slurp', desc: '把整个输入读成一个数组再跑查询', ex: '{"n":1}' },
  { cat: 'flags', sig: '-n / --null-input', desc: '不读输入，用 null 起头（造数据用）', ex: '[range(5)]' },
  { cat: 'flags', sig: '-R / --raw-input', desc: '每行输入作为字符串（日志文本场景）', ex: 'INFO x' },
  { cat: 'flags', sig: '-S / --sort-keys', desc: '输出按键排序', ex: '{"b":1,"a":2}' },
  { cat: 'flags', sig: '-j / --join-output', desc: '-r 且不输出换行', ex: '"a","b"' },
  { cat: 'flags', sig: '--arg k v / --argjson k v', desc: '注入 $k 字符串 / JSON 变量', ex: '$x + 1' },
  { cat: 'flags', sig: '-a / --ascii-output', desc: '非 ASCII 转义（\\uXXXX）', ex: '中文' },
  { cat: 'flags', sig: '--tab', desc: '缩进用 Tab', ex: '{"a":{"b":1}}' },
];

/** 关键词搜索（sig/desc/ex/cat 全字段不区分大小写子串）；空关键词返回全部 */
function searchReference(keyword, cap) {
  const limit = cap || 40;
  const kw = String(keyword == null ? '' : keyword).trim().toLowerCase();
  const pool = kw
    ? ENTRIES.filter((e) =>
      e.sig.toLowerCase().includes(kw)
      || e.desc.toLowerCase().includes(kw)
      || e.cat.toLowerCase().includes(kw)
      || e.ex.toLowerCase().includes(kw))
    : ENTRIES;
  return { entries: pool.slice(0, limit), total: pool.length, truncated: pool.length > limit };
}

/** 渲染为人类可读文本（MCP 输出用） */
function renderReference(entries) {
  return entries
    .map((e) => `[${e.cat}] ${e.sig}\n  ${e.desc}\n  例: ${e.ex}`)
    .join('\n');
}

module.exports = { ENTRIES, searchReference, renderReference };
