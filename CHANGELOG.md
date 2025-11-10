## v0.4.4 / 20251110
- 💄 多模型dropdown窗口优化 [#44](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/44)
- 🐛 多模型回答无法终止 [#43](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/43)

## v0.4.3 / 20251110
- 🐛 错误遗漏V3 API的模型

## v0.4.2 / 20251110
- 🎨 点击查看历史对话的内容，要跳到最开头，目前默认是最末尾 [#42](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/42)
- 🎨 上下文消息添加复制按钮 [#41](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/41)

## v0.4.1 / 20251109

- 🎨 思考过程默认折叠 [[[#40](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/40)](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/40)](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/40)
- 🎨 顶栏添加打开全屏按钮 [[#39](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/39)](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/39)
- 🎨 优化多模型响应显示方式


## v0.4.0 / 20251109

- ✨ 聊天框下方添加一个模型设置按钮

  - 使用iconEdit图标、
  - 每个设置有checkbox进行开关
  - 支持设置上下文数
  - 支持临时修改模型Temperature
  - 支持临时修改系统提示词
  - 支持保存预设和加载某个预设
- ✨ feat(会话管理): 添加批量删除会话功能

  - 实现多选模式，允许用户选择多个会话
  - 添加全选/取消全选功能
  - 提供批量删除选中会话的操作
  - 更新会话列表以避免多页签覆盖问题
- 🎨 优化多页签问答的聊天历史记录保存问题 [#28](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/28)
- 🎨 多模型问答优化 [#37](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/37)

  - 多模型回答的复制按钮优化：复制当前页签查看的模型回答
  - 重新生成优化：如果选了多模型回答，重新生成还是要用多模型回答
- 🎨 鼠标划选弹窗需要转Markdown [#36](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/36)
- 💄 消息内容从.protyle改为b3-typography类 [#38](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/38)

## v0.3.2 / 20251108  

- 🎨模型搜索优化
  1. 模型搜索，点击添加，不清空搜索关键词，方便添加多个模型
  2. 模型搜索支持空格并集搜索，比如搜索gemini 2.5，可以搜索gemini-2.5
  3. 模型搜索去重
- ✨ 平台增加完全自定义URL功能 [#26](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/26)
- 🎨 内置平台优化 [#33](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/33)
  - 内置平台添加平台链接，支持点击跳转到内置平台的平台页面
  - 添加V3 API，并添加我的邀请链接：https://api.gpt.ge/register?aff=fQIZ
  - 内置平台添加kimi（moonshot）
## v0.3.1 / 20251108

- ♻️ 修复无法跨块多选内容复制 [#34](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/34)
- 🎨 编辑提示词不要显示「已保存提示词」 [#31](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/31)
- 💄 添加提示词的按钮icon优化 [#32](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/32)
- 🔥 聊天窗口去除左上角的名称 [#30](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/30)
- ✨ 选择多模型`需要显示已选用的模型名称 [#29](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/29)
- 🐛 工具列表错误添加一级标题 [#27](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/27)


## v0.3.0 / 20251107

- ✨ Copilot支持保存聊天会话到文件
- ✨ 历史对话支持右键菜单 [#23](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/23)
  - 导出到文件
  - 钉住/取消钉住：钉住之后置顶，置顶状态需要持久化
- ✨ feat(ai): 添加在新窗口和标签页打开AI功能
- ✨ agent模式，拖动文档为上下文只给ai传递块ID
  - agent模式，拖动文档到上下文只给ai传递文档块ID（拖动块还是获取kramdown给AI）

  - 切换不同模式，之前已经添加到聊天框上方的上下文中的块和文档策略也要即时更新
    - ask模式：获取Markdown
     - edit模式：获取kramdown
     - agent模式：拖动文档到上下文只给ai传递文档块ID（拖动块还是获取kramdown给AI）

## v0.2.3 / 20251107

- 🎨 sql 查询优化: 更新 SQL 查询文档和移除不必要的安全检查代码
- 🎨 优化对话的选中部分复制，复制为Markdown
- 🎨 为思源块引用链接添加点击事件



## v0.2.2 / 20251107
- ✨ 支持多模型对话 [#22](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/22)
- ✨ 图片和文件显示在对话下面，放在上下文内容里面 [#20](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/20)
- 📝 docs(工具文档): 更新思源笔记工具的使用说明


## v0.2.1 / 20251107

- 🎨 重构添加上下文逻辑 [#15](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/15)

  修改上下文逻辑
  - 目前的逻辑：上下文每次移到最新的对话，感觉还是固定在第一次会话好了
  - 可以参考Github Copilot的逻辑，改为当前上下文而不是全局上下文逻辑
    - 添加上下文，在聊天框显示
    - 发送消息，上下文会直接跟着发送的对话发送，不一直显示在聊天框方式，在用户提问的下面的上下文依然可以点击跳转
- ✨ 支持拖动块上传图片 [#14](https://github.com/Achuan-2/siyuan-plugin-copilot/issues/14)
- 🐛 增强 API 请求错误信息的捕获和显示
- ✨ 添加消息右键菜单：可以选择复制、编辑、编辑、重新生成

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