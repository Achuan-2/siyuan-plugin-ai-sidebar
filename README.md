# AI Sidebar Plugin

An AI assistant plugin for SiYuan Note, supporting multiple AI platforms, document context integration, and rich features.

**Note**: Using this plugin requires your own AI platform API keys. The plugin itself does not provide AI services. Please comply with each platform's terms of use and privacy policies.

> For friends who need to use top-tier models like GPT5, Gemini 2.5 Pro, Claude 4.5
> - Recommend [V3 API website](https://api.gpt.ge/register?aff=fQIZ), very useful, pay-per-use, can use various AI models, can save a lot compared to official APIs. Register with my [invitation link](https://api.gpt.ge/register?aff=fQIZ) to get $0.3 balance reward for trial.

## 📝CHANGELOG

see [CHANGELOG.md](https://cdn.jsdelivr.net/gh/Achuan-2/siyuan-plugin-copilot@main/CHANGELOG.md)

## ✨ Core Features

### 🤖 Multi-Platform AI Support

- **Built-in Platform Support**
  - OpenAI (GPT Series)
  - Google Gemini
  - DeepSeek
  - Volcano Engine (Doubao)
  
- **Custom Platforms**
  - Support adding any OpenAI-compatible API platform
  - Flexible API endpoint and key configuration
  - Support for privately deployed large language models

### 💬 Intelligent Conversation Features

- **Multimodal Support**
  - Text conversations
  - Image recognition (paste, upload, drag & drop)
  - File upload (Markdown, text files, etc.)
  - Mixed input of multiple content types

- **Thinking Mode Support**
  - Support for models with thinking processes like DeepSeek, OpenAI o1 series
  - Real-time streaming display of thinking process
  - Collapsible/expandable detailed thinking content

- **Session Management**
  - Auto-save conversation history
  - Create and switch between multiple sessions
  - Smart session title generation
  - Unsaved changes reminder

### 📚 Document Context Integration

- **Smart Document Search**
  - Search related documents in SiYuan Note and quickly add them to conversation context

- **Multiple Adding Methods**
  - Drag and drop document blocks to sidebar
  - Search and select documents
  - Directly drag tabs and blocks to add current document/block

- **Context Management**
  - View list of added documents
  - One-click jump to original document
  - Flexibly remove unwanted documents
  - Support adding multiple documents simultaneously

### 🎯 Prompt Management

- **Prompt Library**
  - Create and save commonly used prompts
  - Edit and delete prompts
  - One-click use of prompt templates
  - Quick insert into input box

- **Convenient Access**
  - Click 📝 icon to open prompt selector
  - Floating display without interrupting workflow
  - Support for prompt management dialog

### ⚙️ Flexible Configuration Options

- **Model Configuration**
  - Each platform supports multiple models
  - Independent configuration of parameters for each model (temperature, max tokens)
  - Identify special model capabilities (thinking mode, vision support)
  - Quick switching between different models

- **System Prompt**
  - Customize AI assistant behavior and role
  - Apply to all new sessions
  - Flexibly adjust output style

## 🔧 Development

### Local Development

```bash
pnpm install
pnpm run dev
```

## 📄 License

MIT License

## 🙏 Acknowledgments

- Based on [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte/) template
- Referenced GPT conversation functionality implementation from [sy-f-misc](https://github.com/frostime/sy-f-misc)

## 📮 Feedback & Suggestions

For issues or suggestions, please submit at [GitHub Issues](https://github.com/Achuan-2/siyuan-plugin-ai-sidebar/issues).

## ❤️ Made with Love

If you like my plugin, please star the GitHub repository and tip via WeChat, which will motivate me to continue improving this plugin and developing new ones.

Maintaining plugins takes time and effort, personal time and energy are limited. Open source is just sharing, not equal to wasting my time to help users implement features they need for free.

Features I need will be gradually improved (tips can encourage updates), some features I think can be improved but are not necessary at this stage require tips to improve (will be marked with tip labels and required amounts), while unnecessary features or features that are very difficult to implement will directly close issues without consideration.

Friends who have accumulated $50 in tips and want to add me on WeChat can send an email to achuan-2@outlook.com for friend requests (I won't reply to emails or add friends if the tips don't reach $50, because I don't want to be a free customer service)

![image](https://camo.githubusercontent.com/8052f6f2e7dafba534e781934efa9bcb084fa3a9dfa5c221a85ac63db8b043cb/68747470733a2f2f6173736574732e62336c6f6766696c652e636f6d2f73697975616e2f313631303230353735393030352f6173736574732f6e6574776f726b2d61737365742d696d6167652d32303235303631343132333535382d667568697235762e706e67)