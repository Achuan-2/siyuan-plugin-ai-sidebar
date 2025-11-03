# 思源笔记 AI 侧栏插件

一个功能强大的思源笔记AI助手侧栏插件，支持多个AI平台和流式输出。

## ✨ 功能特性

### 💬 AI 对话
- **流式输出**: 实时显示AI回复，体验更流畅
- **多轮对话**: 支持连续对话，保持上下文
- **Markdown支持**: 回复内容支持Markdown格式显示
- **复制导出**: 一键复制对话为Markdown格式
- **Token统计**: 实时显示当前对话和输入框的token消耗

### 🤖 多平台支持
支持以下AI服务商（只需配置API密钥即可）：
- **Google Gemini** - 强大的多模态AI模型
- **DeepSeek** - 国产优质AI模型
- **OpenAI** - ChatGPT等经典模型
- **火山引擎** - 字节跳动的AI服务
- **自定义API** - 支持任何OpenAI格式的API

### 🎨 响应式界面
- **自适应布局**: 完美支持窄屏、宽屏显示
- **深色模式**: 自动适配思源笔记主题
- **移动端优化**: 在移动设备上也能流畅使用

### ⚙️ 灵活配置
- **模型选择**: 自动获取并选择可用模型
- **Temperature调节**: 控制回复的创意度
- **最大Token限制**: 控制单次回复长度
- **系统提示词**: 自定义AI的角色和行为
- **自定义API地址**: 支持各种格式的API地址配置

## 📦 安装

1. 下载插件
2. 将插件文件夹放入思源笔记的 `data/plugins/` 目录
3. 重启思源笔记或在设置中重新加载插件

## 🚀 使用指南

### 1. 配置API

打开插件设置，在"AI设置"标签页中：

1. **选择AI平台**: 从下拉菜单选择你想使用的平台
2. **输入API Key**: 填入对应平台的API密钥
   - Gemini: https://makersuite.google.com/app/apikey
   - DeepSeek: https://platform.deepseek.com/api_keys
   - OpenAI: https://platform.openai.com/api-keys
   - 火山引擎: https://console.volcengine.com/ark
3. **获取模型列表**: 点击"获取模型"按钮，自动获取可用模型
4. **选择模型**: 从模型列表中选择要使用的模型

### 2. 自定义API配置

如果选择"自定义API"，需要额外配置API地址：

- **基础格式**: `https://api.example.com`
- **特殊标记**:
  - 以 `/` 结尾: 自动忽略v1版本，如 `https://api.gpt.ge/`
  - 以 `#` 结尾: 强制使用输入的地址，如 `https://api.example.com/custom#`

示例：
```
https://api.gpt.ge/
https://api.openai-proxy.com
https://custom-api.com/v2#
```

### 3. 开始对话

1. 在思源笔记右侧找到AI助手侧栏（图标：😊）
2. 在输入框输入你的问题
3. 按 `Enter` 发送（`Shift+Enter` 换行）
4. 等待AI回复（支持流式输出）

### 4. 对话管理

- **复制对话**: 点击复制按钮，将整个对话复制为Markdown格式
- **清空对话**: 点击清空按钮，开始新的对话
- **Token统计**: 顶部显示当前对话和输入框的token数

## ⚙️ 高级设置

### Temperature（温度）
- **范围**: 0 - 1
- **低值(0-0.3)**: 回复更加确定、一致
- **中值(0.4-0.7)**: 平衡创意和准确性（推荐）
- **高值(0.8-1.0)**: 回复更加创意、多样

### Max Tokens（最大令牌数）
- 控制单次回复的最大长度
- 较小值(500-1000): 简短回复
- 较大值(2000-4000): 详细回复
- **注意**: 过大会增加成本和响应时间

### System Prompt（系统提示词）
自定义AI的角色和行为，例如：
```
你是一个专业的技术顾问，擅长解释复杂的技术概念。
```
```
You are a creative writing assistant focused on storytelling.
```

## 🔧 API格式说明

### 预置平台API格式

#### Gemini
```
Base URL: https://generativelanguage.googleapis.com
Models: /v1beta/models
Chat: /v1beta/models/{model}:streamGenerateContent
Auth: x-goog-api-key: YOUR_KEY
```

#### OpenAI / DeepSeek / 火山引擎
```
Base URL: 各平台的基础URL
Models: /v1/models
Chat: /v1/chat/completions
Auth: Authorization: Bearer YOUR_KEY
```

### 自定义API要求

必须兼容OpenAI API格式：
- 支持 `/v1/models` 获取模型列表
- 支持 `/v1/chat/completions` 进行对话
- 支持 Server-Sent Events (SSE) 流式输出

## 🐛 常见问题

### Q: 提示"请先配置API Key"
**A**: 进入插件设置，在"AI设置"中填入你的API密钥

### Q: 获取模型失败
**A**: 检查以下几点：
- API Key是否正确
- 网络连接是否正常
- 自定义API地址格式是否正确

### Q: 对话没有响应
**A**: 可能的原因：
- API密钥已过期或配额用尽
- 网络连接问题
- 选择的模型不可用

### Q: 如何使用代理
**A**: 在自定义API地址中填入代理服务器地址

## 🛠️ 开发

### 项目结构
```
src/
├── ai-chat.ts           # AI API调用核心逻辑
├── ai-sidebar.svelte    # 侧栏UI组件
├── defaultSettings.ts   # 默认配置
├── setting-example.svelte  # 设置面板
├── index.ts            # 插件入口
└── index.scss          # 样式文件
```

### 技术栈
- TypeScript
- Svelte
- SCSS
- 思源笔记插件API

### 构建
```bash
npm install
npm run build
```

## 📝 更新日志

### v1.0.0 (2025-01-03)
- ✨ 首次发布
- 支持多个AI平台
- 流式输出
- 响应式界面
- Token统计
- Markdown复制

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 💖 支持

如果觉得这个插件有用，欢迎：
- ⭐ 给项目点个Star
- 🐛 报告Bug和建议
- 📢 分享给更多人
