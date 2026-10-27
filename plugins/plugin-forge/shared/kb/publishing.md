# 打包发布与 index.json 三坑

## 打包

```bash
node scripts/pack.js plugins/<id>
# 读 plugin.json 校验 id/version → 按 .pluginignore 排除 → 临时目录重组 → 根目录直接含 plugin.json → <id>.zip + sha256
```

`.pluginignore` 惯例（排除源码与开发文件，**保留 dist/shared/mcp/service**）：

```
node_modules/
package.json
package-lock.json
src/
tsconfig.json
test/
README.md
*.zip
.git/
```

## index.json 三坑（每个都真实浪费过一轮排查）

1. **publish-plugin.mjs 只更新不新增**：index 里没有该插件 id 时，脚本算完 sha 会提示「未找到插件，跳过」——**新插件必须先手动往 `index.json` 的 plugins[] 追加条目**（抄 pocket-ledger 字段形态：id/name/version/description/author/category/tags/icon/homepage/repository/manifestUrl/downloadUrl/updateUrl/sha256/tier/permissions/screenshots/readme/versions），再跑脚本同步 version/sha256。
2. **重发改 URL**：对已有条目重跑脚本会把 downloadUrl/versions 改写成 `@<tag>` 钉定地址（如 `@my-plugin-v0.1.0`），不 push tag 就 404——手动改回 `@main` 风格并重算 sha 写回。
3. **zip 每次重打 sha 都变**（Compress-Archive 带时间戳）：以最后一次为准。

## index.json 并发覆盖（多会话/多人共用此仓的血泪）

index.json 是共享可变状态：有会话用旧基座整文件重写，抹掉了别人未提交的条目（真实事故，靠各插件 plugin.json+zip sha 恢复）。**纪律：提交 index.json 改动前先重读现文件；发现别人的新条目要保留，只追加/修改自己的那几条，绝不整文件覆盖。**

## update.json

每个插件目录放一份 update.json——内容 = plugin.json 全量副本（含最新 version），商城更新检查读它。version 变了记得同步。

## 校验

```bash
node scripts/validate.js   # 清单与 index 一致性；存量 multichat 报错是历史遗留，非你的问题
```

## 发布检查单

- [ ] version 三处一致：plugin.json / update.json / index.json
- [ ] zip 重打后 sha256 已写回 index.json
- [ ] downloadUrl/updateUrl 是 @main 不是 @tag
- [ ] README 的键空间契约表已更新
- [ ] 新增条目时没有覆盖别人的（先重读 index.json）
