@echo off
chcp 65001 >nul
echo 正在启动 Blender + MCP for Blender 服务...
node "%~dp0start-blender.js"
pause
