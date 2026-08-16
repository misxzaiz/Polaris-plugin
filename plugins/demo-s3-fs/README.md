# Demo S3 FileSystem

> 验证 toolProviders 覆盖 filesystem 能力（远程存储模式）。

## 功能

模拟 S3 远程文件系统，覆盖 7 个内置 fs 工具：
- read_file → 模拟从 S3 GET 对象
- write_file → 模拟 PUT 上传对象
- list_directory → 模拟 LIST bucket 前缀
- search_files/glob → 模拟远程搜索
- edit_file/apply_patch → 模拟对象版本更新

所有操作返回模拟的 S3 响应（ETag/版本 ID/Content-Length），不真正读写本地文件。

## 验证

| 验收点 | 预期 |
|---|---|
| 插件可安装 | 设置 → 插件 → Install from directory |
| fs 工具被覆盖 | AI 调用 read_file → 返回 S3 模拟响应 |
| 无本地 IO | 不读写本地文件 |
| 卸载回退 | 卸载后 fs 工具恢复内置实现 |
