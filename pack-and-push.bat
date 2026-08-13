@echo off
chcp 65001 >nul
title DSH Engine 插件打包 + 推送

echo ============================================
echo   DSH Engine 插件打包 + 推送
echo ============================================
echo.

cd /d "D:\space\base\Polaris-plugin"

:: ─── 1. 打包 ────────────────────────────────────
echo [1/3] 正在打包插件...
node scripts/pack.js plugins\dsh-engine
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 打包失败！
    pause
    exit /b 1
)
echo [OK] 打包完成: plugins\dsh-engine\dsh-engine.zip
echo.

:: ─── 2. Git 提交 ──────────────────────────────────
echo [2/3] 正在提交到 Git...
git add -A
git commit -m "feat: add DeepSeek Harness Engine plugin (dsh-engine)"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] 没有新提交或提交失败，继续推送...
)
echo [OK] 提交完成
echo.

:: ─── 3. 推送到远程 ───────────────────────────────
echo [3/3] 推送到远程...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] 推送失败，尝试 git push...
    git push
)
echo [OK] 推送完成
echo.

echo ============================================
echo   全部完成！
echo   插件已推送到 GitHub
echo   CDN 生效后即可在 Polaris 中远程安装：
echo   https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/dsh-engine/dsh-engine.zip
echo ============================================
pause