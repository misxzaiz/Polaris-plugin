# id-lens 标识符调试台

把任意 UUID / ULID / Snowflake 雪花 ID 粘进来,看穿一切:

- **家族自动识别**:UUID(canonical / `{braces}` / `urn:uuid:` / 无连字符)、ULID(26 字符 Crockford Base32)、Snowflake(纯数字 ≤20 位)
- **位域逐段解读**:时间戳 / 机器号 / 序列 / 版本位 / 变体位,高地位号精确到每一位(64/128 位位图)
- **时间还原**:UUID v1(1582 Gregorian 纪元 100ns)/ v6(重排)/ v7(Unix 毫秒)/ ULID / Snowflake(Twitter 2010 与 Discord 2015 纪元可切,同 ID 双纪元对照提示歧义)
- **规范性校验**:RFC 9562 版本(1-8)/ 变体(10xx)合规、大小写与形态、ULID 排除字母 I/L/O/U 精确定位、41 位时间戳耗尽时刻、远未来时间提示
- **形态互转**:canonical / uppercase / urn / braces / hyphenless / decimal / bitstring / hex128 / ULID↔UUID128(编码层互转,语义不保证如实标注)

所有超过 2^53 的数值以字符串输出(BigInt 全程精确,不丢精度)。纯本地零外联零 kv。

## MCP 四工具

| 工具 | 用途 |
|---|---|
| `id_lens_parse` | 解析 + 家族识别 + 时间还原(layout: twitter/discord) |
| `id_lens_bits` | 位段表 + 二进制位图 |
| `id_lens_validate` | 规范性校验清单(级别/规则名/修复建议) |
| `id_lens_convert` | 形态互转(9 种目标形态) |

## 边界

纯解码器:不做 ID 生成、不做 v3/v5 名字散列重算(不可逆)、不做溯源查询;v2/v8 只解析结构。
