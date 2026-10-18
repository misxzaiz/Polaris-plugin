# 3D 建模工作室（animation-3d）

Polaris 内的 AI 3D 建模插件：让 Polaris 中运行的任何 AI 能直接操控本地 Blender 建模，
并用截图 + 识图自检迭代。

## 原理

```
Polaris AI ──(MCP tools/call)──▶ animation-3d MCP server ──(JSON over TCP 9876)──▶ Blender addon (blender_mcp)
                                                                                          │
                                                                                bpy 执行 / 截图 / 场景查询
```

- 复用社区标准方案 [`ahujasid/mcp-for-blender`](https://github.com/ahujasid/mcp-for-blender)（31.4k⭐）
- Blender 内 addon 监听 `127.0.0.1:9876`，本插件 MCP server 是纯桥接层（不重造协议）

## 前置条件

1. 安装 Blender 4.2+（推荐 4.2 LTS）：`C:/Program Files/Blender Foundation/Blender 4.2/blender.exe`
2. Blender 内启用 "MCP for Blender" addon（Preferences → Add-ons → 搜索 mcp for blender）

## 使用

1. **启动 Blender + MCP 服务**（二选一）：
   - 双击 `scripts/start-blender.bat`（或 `node scripts/start-blender.js`）——自动拉起 Blender 并开启服务
   - 手动打开 Blender → N 面板 → "MCP for Blender" → 点击 "Connect to Claude"
2. 让 AI 调用工具（未连接时会返回明确的「请先启动 Blender」提示）：

| 工具 | 说明 |
|---|---|
| `blender_ping` | 检查 Blender addon 是否在线 |
| `blender_execute_code` | 执行 bpy 代码建模/改材质/加灯光相机 |
| `blender_get_scene_info` | 查看场景对象/引擎信息 |
| `blender_list_scene_items` | 列出场景对象 |
| `blender_get_viewport_screenshot` | 截图（offscreen 渲染，不依赖窗口合成） |

## 已知注意事项（重要）

- ⚠️ **不要**在 `execute_code` 里调用 `bpy.ops.wm.read_factory_settings()` —— 重置场景会连带
  干扰 addon server 生命周期，可能需要重启 Blender。清空场景用选择性删除对象。
- `get_viewport_screenshot` 必须传 `filepath`（落盘绝对路径）。
- Blender GUI 需要保持前台运行；后台任务方式启动的 Blender 容易退出。
- 渲染建议 EEVEE（本机为集成显卡 / 远程桌面适配器环境）。

## 验证

- `scripts/tcp-final.mjs`：最小闭环验证（ping → 建模 Suzanne → 截图）
- `scripts/verify_teapot.py`：Blender 4.2 适配的 EEVEE 渲染验证脚本
