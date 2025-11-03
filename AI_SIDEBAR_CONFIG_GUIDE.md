# AI 侧栏插件 - 快速配置指南

## 🚀 快速开始

### 1. OpenAI 配置
```json
{
  "aiProvider": "openai",
  "aiApiKey": "sk-your-api-key-here",
  "aiModel": "gpt-4o-mini",
  "aiTemperature": 0.7,
  "aiMaxTokens": 2000,
  "aiSystemPrompt": "You are a helpful AI assistant."
}
```

### 2. DeepSeek 配置
```json
{
  "aiProvider": "deepseek",
  "aiApiKey": "your-deepseek-api-key",
  "aiModel": "deepseek-chat",
  "aiTemperature": 0.7,
  "aiMaxTokens": 2000,
  "aiSystemPrompt": "你是一个有帮助的AI助手。"
}
```

### 3. Gemini 配置
```json
{
  "aiProvider": "gemini",
  "aiApiKey": "your-gemini-api-key",
  "aiModel": "gemini-pro",
  "aiTemperature": 0.7,
  "aiMaxTokens": 2000,
  "aiSystemPrompt": "You are a helpful AI assistant."
}
```

### 4. 自定义 API 配置（如 GPT.GE）
```json
{
  "aiProvider": "custom",
  "aiApiKey": "your-api-key",
  "aiCustomApiUrl": "https://api.gpt.ge/",
  "aiModel": "gpt-4o-mini",
  "aiTemperature": 0.7,
  "aiMaxTokens": 2000,
  "aiSystemPrompt": "You are a helpful AI assistant."
}
```

## 📝 系统提示词示例

### 通用助手
```
You are a helpful AI assistant.
你是一个有帮助的AI助手。
```

### 技术顾问
```
You are a technical consultant specializing in software development. 
Provide clear, practical advice with code examples when relevant.
你是一个专业的技术顾问，擅长软件开发。
提供清晰、实用的建议，并在相关时给出代码示例。
```

### 写作助手
```
You are a creative writing assistant. 
Help users improve their writing with constructive feedback and suggestions.
你是一个创意写作助手。
通过建设性的反馈和建议帮助用户改进写作。
```

### 学习导师
```
You are a patient tutor who explains concepts clearly and encourages learning.
Use analogies and examples to make complex topics easier to understand.
你是一个耐心的导师，能够清晰地解释概念并鼓励学习。
使用类比和例子使复杂的主题更容易理解。
```

## 🎯 Temperature 参数建议

| 任务类型 | Temperature | 说明 |
|---------|-------------|------|
| 代码生成 | 0.0 - 0.3 | 需要准确、一致的输出 |
| 技术问答 | 0.3 - 0.5 | 平衡准确性和灵活性 |
| 日常对话 | 0.5 - 0.7 | 自然、友好的对话 |
| 创意写作 | 0.7 - 0.9 | 更多创意和多样性 |
| 头脑风暴 | 0.8 - 1.0 | 最大化创意输出 |

## 💡 使用技巧

### 1. 有效的提问方式
❌ 不好的问题：
```
解释一下Python
```

✅ 好的问题：
```
请用简单的语言解释Python中的列表推导式，
并给出3个实际应用场景的例子。
```

### 2. 利用上下文
AI会记住对话历史，可以这样提问：
```
用户: 什么是递归？
AI: [回答递归的概念]
用户: 能给个Python的例子吗？
AI: [给出具体代码示例]
用户: 这个例子有什么缺点？
AI: [分析缺点]
```

### 3. 指定输出格式
```
请用表格形式总结Python和JavaScript的区别
请用Markdown列表列出学习机器学习的路线图
请用代码块展示如何使用这个API
```

### 4. 分步骤处理复杂任务
```
1. 首先帮我分析一下这个需求
2. 然后设计一个数据结构
3. 最后实现核心功能的代码
```

## 🔧 常用API地址

### OpenAI兼容的API服务
```
官方: https://api.openai.com
GPT.GE: https://api.gpt.ge/
API2D: https://openai.api2d.net
```

### 国内可用的代理服务
```
根据你的实际情况填写
注意遵守相关法律法规
```

## ⚠️ 注意事项

1. **API密钥安全**: 不要将API密钥分享给他人
2. **费用控制**: 注意API调用费用，设置合理的MaxTokens
3. **网络连接**: 确保网络可以访问API服务
4. **Token统计**: 使用插件提供的Token统计功能监控消耗

## 📞 获取帮助

遇到问题？
1. 查看插件设置是否正确
2. 检查网络连接
3. 查看浏览器控制台错误信息
4. 提交Issue到项目仓库
