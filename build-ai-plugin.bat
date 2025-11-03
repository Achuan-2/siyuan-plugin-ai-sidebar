@echo off
chcp 65001 >nul
echo 🚀 开始构建思源笔记 AI 侧栏插件...
echo.

:: 检查 Node.js 是否已安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 错误: 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✓ Node.js 版本: %NODE_VERSION%
echo.

:: 检查 npm 是否已安装
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 错误: 未检测到 npm
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✓ npm 版本: %NPM_VERSION%
echo.

:: 安装依赖
echo 📦 安装依赖...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo.
echo ✓ 依赖安装成功
echo.

:: 构建插件
echo 🔨 构建插件...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo ❌ 构建失败
    pause
    exit /b 1
)

echo.
echo ✅ 构建成功！
echo.
echo 📝 下一步操作：
echo 1. 将插件文件夹复制到思源笔记的 data/plugins/ 目录
echo 2. 重启思源笔记或在设置中重新加载插件
echo 3. 在插件设置中配置你的 AI API
echo 4. 打开右侧的 AI 助手侧栏开始使用
echo.
echo 📖 详细说明请查看：
echo    - AI_SIDEBAR_README.md
echo    - AI_SIDEBAR_CONFIG_GUIDE.md
echo.

pause
