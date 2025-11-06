## v0.2.0 / 20251106

- ✨ 新增agent模式 [#9](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/9)


## v0.1.2 / 20251106

- 以/结尾忽略v1版本，以# 强制使用输入地址实现逻辑优化

  - 输入[https/
      text.pollinations.ai/openai/]，应该用[https://text.pollinations.ai/openai/models]进
      型搜索，以及[https://text.pollinations.ai/openai/chat/completions]进行聊天
  - 输入[https/
      text.pollinations.ai/openai#]，应该用[https://text.pollinations.ai/openai]进行
      型搜索，以及[https://text.pollinations.ai/openai]进行聊天


## v0.1.1 / 20251106
- ⌥⌘C(Ctrl+Alt+C) 快捷键打开AI聊天窗口

 

## v0.1.0 / 20251106

- ✨多选拖动块也支持批量添加到上下文
- ✨创建新自定义平台后，默认选中新建的平台，方便进行设置
- ✨选择平台、新建平台不要影响当前已经选中的模型，目前切换选中平台会影响模型，只有删除平台且这个平台的模型是当前选中的模型才影响
- ✨内置平台API地址输入框隐藏

---

- ✨ Support adding multiple selected dragged blocks to context
- ✨ After creating a new custom platform, the newly created platform is selected by default for easy configuration
- ✨ Selecting a platform should not affect the currently selected model. Currently, switching the selected platform affects the model. It is hoped that deleting a platform will only affect the current selected model if that platform's model is the currently selected one.
- ✨ Hide the built-in platform API address input box


## v0.0.9 / 20251106

- ✨ 支持多选文档添加到上下文
- ✨ 思源笔记添加一个工具栏按钮，支持点击之后根据选择的文字进行AI问答，支持多轮问答，问答使用弹窗
- ✨ 搜索文档未输入关键词默认显示当前文档，支持添加到上下文

---

- ✨ Support adding multiple selected documents to context
- ✨ Add a toolbar button in SiYuan Note to support AI Q&A based on
- ✨ When searching documents, if no keywords are entered, the current document is displayed by default, and it can be added to the context

## v0.0.8 / 20251105

- 支持AI修改思源笔记内容
  - 支持基于对思源笔记块内容进行直接修改、新增块
  - 支持自动批准编辑
  - 支持查看更改情况
  - 支持AI修改后撤回

---

- Support AI modification of SiYuan Note content
  - Support direct modification and adding new blocks based on SiYuan Note block content
  - Support automatic approval for edits
  - Support viewing changes
  - Support undoing AI modifications

## v0.0.7 / 20251105

- 🎨 参考cherrystudio优化API地址提示 [#7](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/7)
- 🎨 历史对话需要保存上下文文档信息 [#2](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/2)
- 🎨 每次聊天自动保存当前会话 #3
- 📝 文档添加V3 API邀请链接、用爱发电 [#5](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/5)

---

- 🎨 Optimize API address prompt based on cherrystudio [#7](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/7)
- 🎨 Historical conversations need to save context document information [#2](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/2)
- 🎨 Auto-save current session for each chat #3
- 📝 Add V3 API invitation link and "powered by love" to the documentation [#5](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/5)

## v0.0.6 / 20241104

- 🎨 细节优化
- 🎨 支持Gemini 2.5模型thinking
- 🎨 如果ai对话报错，报错消息也作为消息返回，这样就可以按刷新按钮重新生成消息
- 🐛如果添加了上下文内容，生成消息后，点击刷新，会不会携带上下文信息重新生成

---

- 🎨 Detail optimization
- 🎨 Support for Gemini 2.5 model thinking
- 🎨 If an AI conversation reports an error, the error message is also returned as a message, allowing the refresh button to regenerate the message
- 🐛 If context content is added, after generating a message, clicking refresh will carry the context information
  
## v0.0.4 / 20241103

- ✨ feat(数学公式): 添加数学公式渲染功能
  - 数学公式优化自动把`\[...\]`替换为`$$...$$`和`\(...\)`替换为`$..$`
  - 使用思源自带 KaTeX 渲染数学公式

---

- ✨ feat(math formulas): Added math formula rendering functionality
  - Math formula optimization automatically replaces `\[...\]` with `$...$` and `\(...\)` with `$...$`
  - Use SiYuan's built-in KaTeX to render math formulas

## v0.0.3 / 20251103

- 🎉 初次提交

---

- 🎉 first commit