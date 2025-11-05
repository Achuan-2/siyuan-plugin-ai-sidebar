<script lang="ts">
    import { onMount, tick, onDestroy } from 'svelte';
    import { chat, type Message, type MessageAttachment, type EditOperation } from './ai-chat';
    import type { MessageContent } from './ai-chat';
    import { getActiveEditor } from 'siyuan';
    import {
        refreshSql,
        pushMsg,
        pushErrMsg,
        sql,
        exportMdContent,
        openBlock,
        updateBlock,
        insertBlock,
        getBlockDOM,
        getBlockKramdown,
        getBlockByID,
    } from './api';
    import ModelSelector from './components/ModelSelector.svelte';
    import SessionManager from './components/SessionManager.svelte';
    import type { ProviderConfig } from './defaultSettings';
    import { settingsStore } from './stores/settings';
    import { confirm, Constants } from 'siyuan';
    import { t } from './utils/i18n';

    export let plugin: any;
    export let initialMessage: string = ''; // 初始消息
    export let mode: 'sidebar' | 'dialog' = 'sidebar'; // 使用模式：sidebar或dialog

    interface ChatSession {
        id: string;
        title: string;
        messages: Message[];
        contextDocuments?: ContextDocument[];
        createdAt: number;
        updatedAt: number;
    }

    interface ContextDocument {
        id: string;
        title: string;
        content: string;
        type?: 'doc' | 'block'; // 标识是文档还是块
    }

    let messages: Message[] = [];
    let currentInput = '';
    let isLoading = false;
    let streamingMessage = '';
    let streamingThinking = ''; // 流式思考内容
    let isThinkingPhase = false; // 是否在思考阶段
    let settings: any = {};
    let messagesContainer: HTMLElement;
    let textareaElement: HTMLTextAreaElement;
    let inputContainer: HTMLElement;
    let fileInputElement: HTMLInputElement;

    // 思考过程折叠状态管理
    let thinkingCollapsed: Record<number, boolean> = {};

    // 消息编辑状态
    let editingMessageIndex: number | null = null;
    let editingMessageContent = '';
    let isEditDialogOpen = false;

    // 附件管理
    let currentAttachments: MessageAttachment[] = [];
    let isUploadingFile = false;

    // 中断控制
    let abortController: AbortController | null = null;

    // 自动滚动控制
    let autoScroll = true;

    // 上下文文档
    let contextDocuments: ContextDocument[] = [];
    let isSearchDialogOpen = false;
    let searchKeyword = '';
    let searchResults: any[] = [];
    let isSearching = false;
    let isDragOver = false;
    let searchTimeout: number | null = null;

    // 提示词管理
    interface Prompt {
        id: string;
        title: string;
        content: string;
        createdAt: number;
    }
    let prompts: Prompt[] = [];
    let isPromptManagerOpen = false;
    let isPromptSelectorOpen = false;
    let editingPrompt: Prompt | null = null;
    let newPromptTitle = '';
    let newPromptContent = '';

    // 会话管理
    let sessions: ChatSession[] = [];
    let currentSessionId: string = '';
    let isSessionManagerOpen = false;
    let hasUnsavedChanges = false;

    // 当前选中的提供商和模型
    let currentProvider = '';
    let currentModelId = '';
    let providers: Record<string, ProviderConfig> = {};

    // 显示设置
    let messageFontSize = 12;

    // 编辑模式
    type ChatMode = 'ask' | 'edit';
    let chatMode: ChatMode = 'ask';
    let autoApproveEdit = false; // 自动批准编辑操作
    let isDiffDialogOpen = false;
    let currentDiffOperation: EditOperation | null = null;
    type DiffViewMode = 'diff' | 'split';
    let diffViewMode: DiffViewMode = 'diff'; // diff查看模式：diff或split

    // 订阅设置变化
    let unsubscribe: () => void;

    onMount(async () => {
        settings = await plugin.loadSettings();

        // 迁移旧设置到新结构
        migrateOldSettings();

        // 初始化提供商和模型信息
        providers = settings.aiProviders || {};
        currentProvider = settings.currentProvider || '';
        currentModelId = settings.currentModelId || '';

        // 初始化字体大小设置
        messageFontSize = settings.messageFontSize || 12;

        // 加载历史会话
        await loadSessions();

        // 加载提示词
        await loadPrompts();

        // 如果有系统提示词，添加到消息列表
        if (settings.aiSystemPrompt) {
            messages = [{ role: 'system', content: settings.aiSystemPrompt }];
        }

        // 如果有初始消息，自动填充到输入框
        if (initialMessage) {
            currentInput = initialMessage;
            // 在dialog模式下，自动聚焦输入框
            if (mode === 'dialog') {
                await tick();
                textareaElement?.focus();
            }
        }

        // 订阅设置变化
        unsubscribe = settingsStore.subscribe(newSettings => {
            if (newSettings && Object.keys(newSettings).length > 0) {
                // 更新本地设置
                settings = newSettings;

                // 更新提供商信息
                if (newSettings.aiProviders) {
                    providers = newSettings.aiProviders;
                }

                // 更新当前选择（如果设置中有保存）
                if (newSettings.currentProvider) {
                    currentProvider = newSettings.currentProvider;
                }
                if (newSettings.currentModelId) {
                    currentModelId = newSettings.currentModelId;
                }

                // 实时更新字体大小设置
                if (newSettings.messageFontSize !== undefined) {
                    messageFontSize = newSettings.messageFontSize;
                }

                // 更新系统提示词
                if (settings.aiSystemPrompt && messages.length === 0) {
                    messages = [{ role: 'system', content: settings.aiSystemPrompt }];
                } else if (settings.aiSystemPrompt && messages[0]?.role === 'system') {
                    messages[0].content = settings.aiSystemPrompt;
                }

                console.debug('AI Sidebar: ' + t('common.configComplete'));
            }
        });

        // 添加全局点击事件监听器
        document.addEventListener('click', handleClickOutside);
    });

    onDestroy(async () => {
        // 取消订阅
        if (unsubscribe) {
            unsubscribe();
        }

        // 移除全局点击事件监听器
        document.removeEventListener('click', handleClickOutside);

        // 如果有未保存的更改，自动保存当前会话
        if (hasUnsavedChanges && messages.filter(m => m.role !== 'system').length > 0) {
            await saveCurrentSession(true); // 静默保存，不显示提示
        }
    });

    // 迁移旧设置到新结构
    function migrateOldSettings() {
        if (!settings.aiProviders && settings.aiProvider && settings.aiApiKey) {
            // 创建新的提供商结构
            if (!settings.aiProviders) {
                settings.aiProviders = {
                    gemini: { apiKey: '', customApiUrl: '', models: [] },
                    deepseek: { apiKey: '', customApiUrl: '', models: [] },
                    openai: { apiKey: '', customApiUrl: '', models: [] },
                    volcano: { apiKey: '', customApiUrl: '', models: [] },
                    customProviders: [],
                };
            }

            // 迁移旧的设置
            const oldProvider = settings.aiProvider;
            if (settings.aiProviders[oldProvider]) {
                settings.aiProviders[oldProvider].apiKey = settings.aiApiKey || '';
                settings.aiProviders[oldProvider].customApiUrl = settings.aiCustomApiUrl || '';

                // 如果有模型，添加到列表
                if (settings.aiModel) {
                    settings.aiProviders[oldProvider].models = [
                        {
                            id: settings.aiModel,
                            name: settings.aiModel,
                            temperature: settings.aiTemperature || 0.7,
                            maxTokens: settings.aiMaxTokens || -1,
                        },
                    ];
                    settings.currentProvider = oldProvider;
                    settings.currentModelId = settings.aiModel;
                }
            }

            // 保存迁移后的设置
            plugin.saveSettings(settings);
        }

        // 确保 customProviders 数组存在
        if (settings.aiProviders && !settings.aiProviders.customProviders) {
            settings.aiProviders.customProviders = [];
        }
    }

    // 自动调整textarea高度
    function autoResizeTextarea() {
        if (textareaElement) {
            textareaElement.style.height = 'auto';
            textareaElement.style.height = Math.min(textareaElement.scrollHeight, 200) + 'px';
        }
    }

    // 监听输入变化
    $: {
        currentInput;
        tick().then(autoResizeTextarea);
    }

    // 处理粘贴事件
    async function handlePaste(event: ClipboardEvent) {
        const items = event.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // 处理图片
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await addImageAttachment(file);
                }
                return;
            }

            // 处理文件
            if (item.kind === 'file') {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await addFileAttachment(file);
                }
                return;
            }
        }
    }

    // 添加图片附件
    async function addImageAttachment(file: File) {
        if (!file.type.startsWith('image/')) {
            pushErrMsg(t('aiSidebar.errors.imageOnly'));
            return;
        }

        // 检查文件大小 (最大 10MB)
        if (file.size > 10 * 1024 * 1024) {
            pushErrMsg(t('aiSidebar.errors.imageTooLarge'));
            return;
        }

        try {
            isUploadingFile = true;

            // 将图片转换为 base64
            const base64 = await fileToBase64(file);

            currentAttachments = [
                ...currentAttachments,
                {
                    type: 'image',
                    name: file.name,
                    data: base64,
                    mimeType: file.type,
                },
            ];
        } catch (error) {
            console.error('Add image error:', error);
            pushErrMsg(t('aiSidebar.errors.addImageFailed'));
        } finally {
            isUploadingFile = false;
        }
    }

    // 添加文件附件
    async function addFileAttachment(file: File) {
        // 只支持文本文件和图片
        const isText =
            file.type.startsWith('text/') ||
            file.name.endsWith('.md') ||
            file.name.endsWith('.txt') ||
            file.name.endsWith('.json') ||
            file.name.endsWith('.xml') ||
            file.name.endsWith('.csv');

        const isImage = file.type.startsWith('image/');

        if (!isText && !isImage) {
            pushErrMsg(t('aiSidebar.errors.textAndImageOnly'));
            return;
        }

        // 检查文件大小 (文本文件最大 5MB，图片最大 10MB)
        const maxSize = isImage ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
            pushErrMsg(t('aiSidebar.errors.fileTooLarge'));
            return;
        }

        try {
            isUploadingFile = true;

            if (isImage) {
                await addImageAttachment(file);
            } else {
                // 读取文本文件内容
                const content = await file.text();

                currentAttachments = [
                    ...currentAttachments,
                    {
                        type: 'file',
                        name: file.name,
                        data: content,
                        mimeType: file.type,
                    },
                ];
            }
        } catch (error) {
            console.error('Add file error:', error);
            pushErrMsg(t('aiSidebar.errors.addFileFailed'));
        } finally {
            isUploadingFile = false;
        }
    }

    // 文件转 base64
    function fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // 触发文件选择
    function triggerFileUpload() {
        fileInputElement?.click();
    }

    // 处理文件选择
    async function handleFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        const files = input.files;

        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            await addFileAttachment(files[i]);
        }

        // 清空 input，允许重复选择同一文件
        input.value = '';
    }

    // 移除附件
    function removeAttachment(index: number) {
        currentAttachments = currentAttachments.filter((_, i) => i !== index);
    }

    // 检查是否在底部
    function isAtBottom() {
        if (!messagesContainer) return true;
        const threshold = 100; // 100px的阈值
        const scrollBottom =
            messagesContainer.scrollHeight -
            messagesContainer.scrollTop -
            messagesContainer.clientHeight;
        return scrollBottom < threshold;
    }

    // 处理滚动事件
    function handleScroll() {
        if (!messagesContainer) return;

        const atBottom = isAtBottom();

        // 如果用户滚动到底部附近，恢复自动滚动
        if (atBottom) {
            autoScroll = true;
        } else if (isLoading) {
            // 如果正在加载且用户滚动离开底部，停止自动滚动
            autoScroll = false;
        }
    }

    // 滚动到底部
    async function scrollToBottom(force = false) {
        await tick();
        if (messagesContainer && (force || autoScroll)) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // 切换模型
    function handleModelSelect(event: CustomEvent<{ provider: string; modelId: string }>) {
        const { provider, modelId } = event.detail;
        currentProvider = provider;
        currentModelId = modelId;

        // 保存选择
        settings.currentProvider = provider;
        settings.currentModelId = modelId;
        plugin.saveSettings(settings);
    }

    // 获取当前提供商配置
    function getCurrentProviderConfig() {
        if (!currentProvider) return null;

        // 检查是否是内置平台
        if (providers[currentProvider] && !Array.isArray(providers[currentProvider])) {
            return providers[currentProvider];
        }

        // 检查是否是自定义平台
        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            return providers.customProviders.find((p: any) => p.id === currentProvider);
        }

        return null;
    }

    // 获取当前模型配置
    function getCurrentModelConfig() {
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig || !currentModelId) {
            return null;
        }
        return providerConfig.models.find((m: any) => m.id === currentModelId);
    }

    // 发送消息
    async function sendMessage() {
        if ((!currentInput.trim() && currentAttachments.length === 0) || isLoading) return;

        // 检查设置
        const providerConfig = getCurrentProviderConfig();
        if (!providerConfig) {
            pushErrMsg(t('aiSidebar.errors.noProvider'));
            return;
        }

        if (!providerConfig.apiKey) {
            pushErrMsg(t('aiSidebar.errors.noApiKey'));
            return;
        }

        const modelConfig = getCurrentModelConfig();
        if (!modelConfig) {
            pushErrMsg(t('aiSidebar.errors.noModel'));
            return;
        }

        // 获取所有上下文文档的最新内容
        // 问答模式：使用 exportMdContent 获取 Markdown 格式
        // 编辑模式：使用 getBlockKramdown 获取 kramdown 格式（包含块ID信息）
        const contextDocumentsWithLatestContent: ContextDocument[] = [];
        if (contextDocuments.length > 0) {
            for (const doc of contextDocuments) {
                try {
                    let content: string;

                    if (chatMode === 'edit') {
                        // 编辑模式：获取kramdown格式，保留块ID结构
                        const blockData = await getBlockKramdown(doc.id);
                        if (blockData && blockData.kramdown) {
                            content = blockData.kramdown;
                        } else {
                            // 降级使用缓存内容
                            content = doc.content;
                        }
                    } else {
                        // 问答模式：获取Markdown格式
                        const data = await exportMdContent(doc.id, false, false, 2, 0, false);
                        if (data && data.content) {
                            content = data.content;
                        } else {
                            // 降级使用缓存内容
                            content = doc.content;
                        }
                    }

                    contextDocumentsWithLatestContent.push({
                        id: doc.id,
                        title: doc.title,
                        content: content,
                        type: doc.type, // 保留类型信息
                    });
                } catch (error) {
                    console.error(`Failed to get latest content for block ${doc.id}:`, error);
                    // 出错时使用缓存的内容
                    contextDocumentsWithLatestContent.push(doc);
                }
            }
        }

        // 用户消息只保存原始输入（不包含文档内容）
        const userContent = currentInput.trim();

        const userMessage: Message = {
            role: 'user',
            content: userContent,
            attachments: currentAttachments.length > 0 ? [...currentAttachments] : undefined,
        };

        messages = [...messages, userMessage];
        currentInput = '';
        currentAttachments = [];
        isLoading = true;
        streamingMessage = '';
        streamingThinking = '';
        isThinkingPhase = false;
        hasUnsavedChanges = true;
        autoScroll = true; // 发送新消息时启用自动滚动

        await scrollToBottom(true);

        // 准备发送给AI的消息（包含系统提示词和上下文文档）
        // 深拷贝消息数组，避免修改原始消息
        const messagesToSend = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content,
            }));

        // 处理最后一条用户消息，添加附件和上下文文档
        if (messagesToSend.length > 0) {
            const lastMessage = messagesToSend[messagesToSend.length - 1];
            if (lastMessage.role === 'user') {
                const lastUserMessage = messages[messages.length - 1];
                const hasImages = lastUserMessage.attachments?.some(att => att.type === 'image');

                // 如果有图片附件，使用多模态格式
                if (hasImages) {
                    const contentParts: any[] = [];

                    // 先添加用户输入
                    let textContent = userContent;

                    // 然后添加上下文文档（如果有）
                    if (contextDocumentsWithLatestContent.length > 0) {
                        const contextText = contextDocumentsWithLatestContent
                            .map(doc => {
                                const label = doc.type === 'doc' ? '文档' : '块';
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                            })
                            .join('\n\n---\n\n');
                        textContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                    }

                    contentParts.push({ type: 'text', text: textContent });

                    // 添加图片
                    lastUserMessage.attachments?.forEach(att => {
                        if (att.type === 'image') {
                            contentParts.push({
                                type: 'image_url',
                                image_url: { url: att.data },
                            });
                        }
                    });

                    // 添加文本文件内容
                    const fileTexts = lastUserMessage.attachments
                        ?.filter(att => att.type === 'file')
                        .map(att => `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`)
                        .join('\n\n---\n\n');

                    if (fileTexts) {
                        contentParts.push({
                            type: 'text',
                            text: `\n\n以下是附件文件内容：\n\n${fileTexts}`,
                        });
                    }

                    lastMessage.content = contentParts;
                } else {
                    // 纯文本格式
                    let enhancedContent = userContent;

                    // 添加文本文件附件
                    if (lastUserMessage.attachments && lastUserMessage.attachments.length > 0) {
                        const attachmentTexts = lastUserMessage.attachments
                            .map(att => {
                                if (att.type === 'file') {
                                    return `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`;
                                }
                                return '';
                            })
                            .filter(Boolean)
                            .join('\n\n---\n\n');

                        if (attachmentTexts) {
                            enhancedContent += `\n\n---\n\n以下是附件内容：\n\n${attachmentTexts}`;
                        }
                    }

                    // 添加上下文文档
                    if (contextDocumentsWithLatestContent.length > 0) {
                        const contextText = contextDocumentsWithLatestContent
                            .map(doc => {
                                const label = doc.type === 'doc' ? '文档' : '块';
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                            })
                            .join('\n\n---\n\n');
                        enhancedContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                    }

                    lastMessage.content = enhancedContent;
                }
            }
        }

        // 根据模式添加系统提示词
        if (chatMode === 'edit') {
            // 编辑模式的特殊系统提示词
            const editModePrompt = `你是一个专业的笔记编辑助手。当用户要求修改内容时，你必须返回JSON格式的编辑指令。

**关于上下文格式**：
用户提供的上下文将以以下格式呈现：

## 文档: 文档标题
或
## 块: 块内容预览

**BlockID**: \`20240101120000-abc123\`

\`\`\`markdown
这里是kramdown格式的内容，包含块ID信息：
段落内容
{: id="20240101120100-def456"}

* 列表项
  {: id="20240101120200-ghi789"}
\`\`\`

**关于BlockID和kramdown格式**：
- **顶层BlockID**：位于 \`\`\`markdown 代码块之前，格式为 **BlockID**: \`xxxxxxxxxx-xxxxxxx\`
- **子块ID标记**：在markdown代码块内，格式为 {: id="20240101120100-def456"}
- 段落块会有 {: id="..."} 标记
- 列表项会有 {: id="..."} 标记  
- 标题、代码块等各种块都有ID标记

你可以编辑任何包含ID标记的块，包括：
- 顶层文档/块（使用代码块外的BlockID）
- 文档内的任何子块（使用代码块内的 {: id="xxx"}）

**提取BlockID的方法**：
- 从 **BlockID**: \`xxxxx\` 获取顶层块ID
- 从 {: id="xxxxx"} 获取子块ID
- BlockID格式通常为：时间戳-字符串，如 20240101120000-abc123

编辑指令格式（必须严格遵循）：
\`\`\`json
{
  "editOperations": [
    {
      "operationType": "update",  // 操作类型："update"=更新块（默认），"insert"=插入新块
      "blockId": "要编辑的块ID（可以是顶层块或子块的ID）",
      "newContent": "修改后的内容（kramdown格式，保留必要的ID标记）"
    },
    {
      "operationType": "insert",  // 插入新块
      "blockId": "参考块的ID（在此块前后插入）",
      "position": "after",  // "before"=在参考块之前插入，"after"=在参考块之后插入（默认）
      "newContent": "新插入的内容（kramdown格式）"
    }
  ]
}
\`\`\`

重要规则：
1. **必须返回JSON格式**：使用上述JSON结构，包裹在 \`\`\`json 代码块中
2. **blockId 必须来自上下文**：从 [BlockID: xxx] 或 {: id="xxx"} 中提取
3. **可以编辑任何有ID的块**：不限于顶层块，子块也可以精确编辑
4. **可以插入新块**：使用 operationType: "insert" 在指定块前后插入新内容
5. **newContent格式**：应该是kramdown格式，如果编辑子块，内容要包含该块的ID标记；插入新块时不需要ID标记
6. **可以批量编辑**：在 editOperations 数组中包含多个编辑操作
7. 思源笔记kramdown格式如果要添加颜色：应该是<span data-type="text">添加颜色的文字1</span>{: style="color: var(--b3-font-color1);"}，优先使用以下颜色变量：
  - --b3-font-color1: 红色
  - --b3-font-color2: 橙色
  - --b3-font-color3: 蓝色
  - --b3-font-color4: 绿色
  - --b3-font-color5: 灰色
8. **添加说明**：在JSON代码块之外，添加文字说明你的修改

示例1 - 编辑顶层块：
好的，我会帮你改进这段内容：

\`\`\`json
{
  "editOperations": [
    {
      "operationType": "update",
      "blockId": "20240101120000-abc123",
      "newContent": "这是修改后的整个文档内容\\n{: id=\\"20240101120000-abc123\\"}"
    }
  ]
}
\`\`\`

示例2 - 编辑子块（推荐）：
我会针对性地修改第二段和第三个列表项：

\`\`\`json
{
  "editOperations": [
    {
      "operationType": "update",
      "blockId": "20240101120100-def456",
      "newContent": "这是修改后的第二段内容，表达更专业。\\n{: id=\\"20240101120100-def456\\"}"
    },
    {
      "operationType": "update",
      "blockId": "20240101120200-ghi789",
      "newContent": "* 这是修改后的列表项\\n  {: id=\\"20240101120200-ghi789\\"}"
    }
  ]
}
\`\`\`

我针对需要改进的具体段落和列表项进行了精确修改。

示例3 - 插入新块：
我会在第二段后面插入一段补充说明：

\`\`\`json
{
  "editOperations": [
    {
      "operationType": "insert",
      "blockId": "20240101120100-def456",
      "position": "after",
      "newContent": "这是新插入的补充段落，提供更多细节信息。"
    }
  ]
}
\`\`\`

我在指定的段落后面添加了补充内容。

示例4 - 混合操作：
我会修改第一段并在其后插入新内容：

\`\`\`json
{
  "editOperations": [
    {
      "operationType": "update",
      "blockId": "20240101120100-def456",
      "newContent": "这是修改后的段落内容。\\n{: id=\\"20240101120100-def456\\"}"
    },
    {
      "operationType": "insert",
      "blockId": "20240101120100-def456",
      "position": "after",
      "newContent": "这是紧跟在修改段落后的新增内容。"
    }
  ]
}
\`\`\`

我修改了原段落并在其后添加了补充信息。

注意：
- 优先编辑子块而不是整个文档，这样更精确且不会影响其他内容
- 只有在用户明确要求修改内容时才返回JSON编辑指令
- 如果只是回答问题，则正常回复即可，不要返回JSON
- 确保JSON格式正确，可以被解析
- 确保blockId来自上下文中的ID标记（**BlockID**: \`xxx\` 或 {: id="xxx"}）
- newContent应保留kramdown的ID标记
- **重要**：newContent中只包含修改后的正文内容，不要包含"## 文档"、"## 块"或"**BlockID**:"这样的上下文标识，这些只是用于你理解上下文的`;

            // 先添加用户的系统提示词（如果有）
            if (settings.aiSystemPrompt) {
                messagesToSend.unshift({ role: 'system', content: settings.aiSystemPrompt });
            }
            // 再添加编辑模式的提示词
            messagesToSend.unshift({ role: 'system', content: editModePrompt });
        } else if (settings.aiSystemPrompt) {
            messagesToSend.unshift({ role: 'system', content: settings.aiSystemPrompt });
        }

        // 创建新的 AbortController
        abortController = new AbortController();

        try {
            // 检查是否启用思考模式
            const enableThinking = modelConfig.capabilities?.thinking || false;

            await chat(
                currentProvider,
                {
                    apiKey: providerConfig.apiKey,
                    model: modelConfig.id,
                    messages: messagesToSend,
                    temperature: modelConfig.temperature,
                    maxTokens: modelConfig.maxTokens > 0 ? modelConfig.maxTokens : undefined,
                    stream: true,
                    signal: abortController.signal, // 传递 AbortSignal
                    enableThinking, // 启用思考模式
                    onThinkingChunk: enableThinking
                        ? async (chunk: string) => {
                              isThinkingPhase = true;
                              streamingThinking += chunk;
                              await scrollToBottom();
                          }
                        : undefined,
                    onThinkingComplete: enableThinking
                        ? (thinking: string) => {
                              isThinkingPhase = false;
                              // 思考完成后自动折叠
                              thinkingCollapsed[messages.length] = true;
                          }
                        : undefined,
                    onChunk: async (chunk: string) => {
                        streamingMessage += chunk;
                        await scrollToBottom();
                    },
                    onComplete: async (fullText: string) => {
                        // 转换 LaTeX 数学公式格式为 Markdown 格式
                        const convertedText = convertLatexToMarkdown(fullText);

                        const assistantMessage: Message = {
                            role: 'assistant',
                            content: convertedText,
                        };

                        // 如果有思考内容，添加到消息中
                        if (enableThinking && streamingThinking) {
                            assistantMessage.thinking = streamingThinking;
                        }

                        // 如果是编辑模式，解析编辑操作
                        if (chatMode === 'edit') {
                            const editOperations = parseEditOperations(convertedText);
                            if (editOperations.length > 0) {
                                // 异步获取每个块的旧内容（kramdown格式和Markdown格式）
                                for (const op of editOperations) {
                                    try {
                                        // 获取kramdown格式（用于应用编辑）
                                        const blockData = await getBlockKramdown(op.blockId);
                                        if (blockData && blockData.kramdown) {
                                            op.oldContent = blockData.kramdown;
                                        }

                                        // 获取Markdown格式（用于显示差异）
                                        const mdData = await exportMdContent(
                                            op.blockId,
                                            false,
                                            false,
                                            2,
                                            0,
                                            false
                                        );
                                        if (mdData && mdData.content) {
                                            op.oldContentForDisplay = mdData.content;
                                        }

                                        // 处理newContent用于显示（移除kramdown ID标记）
                                        op.newContentForDisplay = op.newContent
                                            .replace(/\{:\s*id="[^"]+"\s*\}/g, '')
                                            .trim();
                                    } catch (error) {
                                        console.error(`获取块 ${op.blockId} 内容失败:`, error);
                                    }
                                }
                                assistantMessage.editOperations = editOperations;

                                // 如果启用了自动批准，则自动应用所有编辑操作
                                if (autoApproveEdit) {
                                    messages = [...messages, assistantMessage];
                                    const currentMessageIndex = messages.length - 1;

                                    for (const op of editOperations) {
                                        await applyEditOperation(op, currentMessageIndex);
                                    }

                                    // 更新消息状态
                                    messages = [...messages];
                                }
                            }
                        }

                        if (
                            !autoApproveEdit ||
                            chatMode !== 'edit' ||
                            !assistantMessage.editOperations?.length
                        ) {
                            messages = [...messages, assistantMessage];
                        }
                        streamingMessage = '';
                        streamingThinking = '';
                        isThinkingPhase = false;
                        isLoading = false;
                        abortController = null;
                        hasUnsavedChanges = true;

                        // AI 回复完成后，自动保存当前会话
                        await saveCurrentSession(true);
                    },
                    onError: (error: Error) => {
                        // 如果是主动中断，不显示错误
                        if (error.message !== 'Request aborted') {
                            // 将错误消息作为一条 assistant 消息添加
                            const errorMessage: Message = {
                                role: 'assistant',
                                content: `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${error.message}`,
                            };
                            messages = [...messages, errorMessage];
                            hasUnsavedChanges = true;
                        }
                        isLoading = false;
                        streamingMessage = '';
                        streamingThinking = '';
                        isThinkingPhase = false;
                        abortController = null;
                    },
                },
                providerConfig.customApiUrl
            );
        } catch (error) {
            console.error('Send message error:', error);
            // onError 回调已经处理了错误消息的添加，这里不需要重复添加
            // 只需要在 onError 没有被调用的情况下（比如网络错误导致的异常）清理状态
            if ((error as Error).name === 'AbortError') {
                // 中断错误已经在 abortMessage 中处理
            } else if (!isLoading) {
                // 如果 isLoading 已经是 false，说明 onError 已经被调用并处理了
                // 不需要做任何事情
            } else {
                // 如果 isLoading 还是 true，说明 onError 没有被调用
                // 这种情况下才需要添加错误消息（比如网络请求失败）
                const errorMessage: Message = {
                    role: 'assistant',
                    content: `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${(error as Error).message}`,
                };
                messages = [...messages, errorMessage];
                hasUnsavedChanges = true;
                isLoading = false;
                streamingMessage = '';
                streamingThinking = '';
                isThinkingPhase = false;
            }
            abortController = null;
        }
    }

    // 中断消息生成
    function abortMessage() {
        if (abortController) {
            abortController.abort();
            // 如果有已生成的部分，将其保存为消息
            if (streamingMessage || streamingThinking) {
                // 转换 LaTeX 数学公式格式为 Markdown 格式
                const convertedMessage = convertLatexToMarkdown(streamingMessage);

                const message: Message = {
                    role: 'assistant',
                    content: convertedMessage + '\n\n' + t('aiSidebar.messages.interrupted'),
                };
                if (streamingThinking) {
                    message.thinking = streamingThinking;
                }
                messages = [...messages, message];
                hasUnsavedChanges = true;
            }
            streamingMessage = '';
            streamingThinking = '';
            isThinkingPhase = false;
            isLoading = false;
            abortController = null;
        }
    }

    // 复制对话为Markdown
    function copyAsMarkdown() {
        const markdown = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => {
                const role = msg.role === 'user' ? '👤 **User**' : '🤖 **Assistant**';
                return `${role}\n\n${msg.content}\n`;
            })
            .join('\n---\n\n');

        navigator.clipboard
            .writeText(markdown)
            .then(() => {
                pushMsg(t('aiSidebar.success.copyMarkdownSuccess'));
            })
            .catch(err => {
                pushErrMsg(t('aiSidebar.errors.copyFailed'));
                console.error('Copy failed:', err);
            });
    }

    // 清空对话
    function clearChat() {
        // 如果消息正在生成，先中断
        if (isLoading && abortController) {
            abortMessage();
        }

        if (hasUnsavedChanges && messages.filter(m => m.role !== 'system').length > 0) {
            confirm(
                t('aiSidebar.confirm.clearChat.title'),
                t('aiSidebar.confirm.clearChat.message'),
                () => {
                    doClearChat();
                }
            );
        } else {
            doClearChat();
        }
    }

    function doClearChat() {
        messages = settings.aiSystemPrompt
            ? [{ role: 'system', content: settings.aiSystemPrompt }]
            : [];
        contextDocuments = [];
        streamingMessage = '';
        streamingThinking = '';
        isThinkingPhase = false;
        thinkingCollapsed = {};
        currentSessionId = '';
        hasUnsavedChanges = false;
        pushMsg(t('aiSidebar.success.clearSuccess'));
    }

    // 处理键盘事件
    function handleKeydown(e: KeyboardEvent) {
        const sendMode = settings.sendMessageShortcut || 'ctrl+enter';

        if (sendMode === 'ctrl+enter') {
            // Ctrl+Enter 发送模式
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                if (isLoading) {
                    abortMessage();
                } else {
                    sendMessage();
                }
                return;
            }
        } else {
            // Enter 发送模式（Shift+Enter 换行）
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isLoading) {
                    abortMessage();
                } else {
                    sendMessage();
                }
                return;
            }
        }
    }

    // 使用思源内置的Lute渲染markdown为HTML
    // 将消息内容转换为字符串
    function getMessageText(content: string | MessageContent[]): string {
        if (typeof content === 'string') {
            return content;
        }
        // 对于多模态内容，只提取文本部分
        return content
            .filter(part => part.type === 'text' && part.text)
            .map(part => part.text)
            .join('\n');
    }

    // 将 LaTeX 数学公式格式转换为 Markdown 格式（永久转换）
    function convertLatexToMarkdown(text: string): string {
        // 将 LaTeX 块级数学公式 \[...\] 转换为 $$...$$
        text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula) => {
            const trimmedFormula = formula.trim();
            return `\n\n$$\n${trimmedFormula}\n$$\n\n`;
        });

        // 将 LaTeX 行内数学公式 \(...\) 转换为 $...$
        text = text.replace(/\\\((.*?)\\\)/g, (_match, formula) => {
            return `$${formula}$`;
        });

        return text;
    }

    function formatMessage(content: string | MessageContent[]): string {
        let textContent = getMessageText(content);

        try {
            // 检查window.Lute是否存在
            if (typeof window !== 'undefined' && (window as any).Lute) {
                const lute = (window as any).Lute.New();
                // 使用Md2BlockDOM将markdown转换为HTML
                const html = lute.Md2BlockDOM(textContent);
                return html;
            }
            // 如果Lute不可用，回退到简单渲染
            return textContent
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(
                    /```(\w+)?\n([\s\S]*?)```/g,
                    '<pre><code class="language-$1">$2</code></pre>'
                )
                .replace(/\n/g, '<br>');
        } catch (error) {
            console.error('Format message error:', error);
            return textContent;
        }
    }

    // 高亮代码块
    function highlightCodeBlocks(element: HTMLElement) {
        if (!element) return;

        // 使用 tick 确保 DOM 已更新
        tick().then(() => {
            try {
                if (typeof window === 'undefined' || !(window as any).hljs) {
                    return;
                }

                const hljs = (window as any).hljs;

                // 处理思源的代码块结构: div.hljs > div[contenteditable]
                const siyuanCodeBlocks = element.querySelectorAll(
                    'div.hljs > div[contenteditable="true"]'
                );
                siyuanCodeBlocks.forEach((block: HTMLElement) => {
                    // 检查是否已经高亮过（通过检查是否有 hljs 的高亮 class）
                    if (block.querySelector('.hljs-keyword, .hljs-string, .hljs-comment')) {
                        return;
                    }

                    try {
                        const code = block.textContent || '';
                        const parent = block.parentElement as HTMLElement;

                        // 尝试从父元素获取语言信息
                        let language = '';
                        const langAttr =
                            parent.getAttribute('data-node-id') ||
                            parent.getAttribute('data-subtype');

                        // 自动检测语言并高亮
                        let highlighted;
                        if (language) {
                            highlighted = hljs.highlight(code, { language, ignoreIllegals: true });
                        } else {
                            highlighted = hljs.highlightAuto(code);
                        }

                        // 将高亮后的 HTML 设置到 contenteditable 元素中
                        block.innerHTML = highlighted.value;

                        // 标记已处理，添加一个自定义属性
                        block.setAttribute('data-highlighted', 'true');
                    } catch (error) {
                        console.error('Highlight siyuan code block error:', error);
                    }
                });

                // 处理标准的 pre > code 结构（作为后备）
                const standardCodeBlocks = element.querySelectorAll(
                    'pre > code:not([data-highlighted])'
                );
                standardCodeBlocks.forEach((block: HTMLElement) => {
                    if (
                        block.classList.contains('hljs') ||
                        block.getAttribute('data-highlighted')
                    ) {
                        return;
                    }

                    try {
                        hljs.highlightElement(block);
                        block.setAttribute('data-highlighted', 'true');
                    } catch (error) {
                        console.error('Highlight standard code block error:', error);
                    }
                });
            } catch (error) {
                console.error('Highlight code blocks error:', error);
            }
        });
    }

    // 初始化 KaTeX
    async function initKatex() {
        if ((window as any).katex) return true;

        try {
            // 使用思源的 CDN 加载 KaTeX
            const cdn = Constants.PROTYLE_CDN;

            // 添加 KaTeX 样式
            if (!document.getElementById('protyleKatexStyle')) {
                const link = document.createElement('link');
                link.id = 'protyleKatexStyle';
                link.rel = 'stylesheet';
                link.href = `${cdn}/js/katex/katex.min.css`;
                document.head.appendChild(link);
            }

            // 添加 KaTeX 脚本
            if (!document.getElementById('protyleKatexScript')) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.id = 'protyleKatexScript';
                    script.src = `${cdn}/js/katex/katex.min.js`;
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error('Failed to load KaTeX'));
                    document.head.appendChild(script);
                });
            }

            return (window as any).katex !== undefined && (window as any).katex !== null;
        } catch (error) {
            console.error('Init KaTeX error:', error);
            return false;
        }
    }

    // 渲染单个数学公式块
    function renderMathBlock(element: HTMLElement) {
        try {
            const formula = element.textContent || '';
            if (!formula.trim()) {
                return;
            }

            const isBlock = element.tagName.toUpperCase() === 'DIV';

            // 使用 KaTeX 渲染公式
            const katex = (window as any).katex;
            const html = katex.renderToString(formula, {
                throwOnError: false, // 发生错误时不抛出异常
                displayMode: isBlock, // 使用显示模式（居中显示）
                strict: (errorCode: string) =>
                    errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                trust: true,
            });

            // 清空原始内容并插入渲染后的内容
            element.innerHTML = html;

            // 标记已渲染
            element.setAttribute('data-math-rendered', 'true');
        } catch (error) {
            console.error('Error rendering math formula:', error);
            element.innerHTML = `<span style="color: red;">公式渲染错误</span>`;
            element.setAttribute('data-math-rendered', 'true');
        }
    }

    // 渲染数学公式
    async function renderMathFormulas(element: HTMLElement) {
        if (!element) return;

        // 使用 tick 确保 DOM 已更新
        await tick();

        try {
            // 确保 KaTeX 已加载
            if (!(window as any).katex) {
                const loaded = await initKatex();
                if (!loaded) {
                    console.error('Failed to initialize KaTeX');
                    return;
                }
            }

            const katex = (window as any).katex;

            // 处理 Lute 渲染的数学公式元素（带 data-subtype="math" 属性）
            const mathElements = element.querySelectorAll(
                '[data-subtype="math"]:not([data-math-rendered])'
            );

            mathElements.forEach((mathElement: HTMLElement) => {
                try {
                    // 获取数学公式内容
                    const mathContent = mathElement.getAttribute('data-content');
                    if (!mathContent) {
                        return;
                    }

                    // 临时设置文本内容用于渲染
                    mathElement.textContent = mathContent;

                    // 渲染公式
                    renderMathBlock(mathElement);
                } catch (error) {
                    console.error('Render math formula error:', error, mathElement);
                    // 即使渲染失败也标记，避免重复尝试
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            });

            // 处理可能遗漏的行内数学公式 span.katex
            const inlineMathElements = element.querySelectorAll(
                'span.katex:not([data-math-rendered])'
            );

            inlineMathElements.forEach((mathElement: HTMLElement) => {
                try {
                    const mathContent = mathElement.getAttribute('data-content');
                    if (mathContent) {
                        const html = katex.renderToString(mathContent, {
                            throwOnError: false,
                            displayMode: false,
                            strict: (errorCode: string) =>
                                errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                            trust: true,
                        });
                        mathElement.innerHTML = html;
                        mathElement.setAttribute('data-math-rendered', 'true');
                    }
                } catch (error) {
                    console.error('Render inline math error:', error, mathElement);
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            });

            // 处理可能遗漏的块级数学公式 div.katex
            const blockMathElements = element.querySelectorAll(
                'div.katex:not([data-math-rendered])'
            );

            blockMathElements.forEach((mathElement: HTMLElement) => {
                try {
                    const mathContent = mathElement.getAttribute('data-content');
                    if (mathContent) {
                        const html = katex.renderToString(mathContent, {
                            throwOnError: false,
                            displayMode: true,
                            strict: (errorCode: string) =>
                                errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
                            trust: true,
                        });
                        mathElement.innerHTML = html;
                        mathElement.setAttribute('data-math-rendered', 'true');
                    }
                } catch (error) {
                    console.error('Render block math error:', error, mathElement);
                    mathElement.setAttribute('data-math-rendered', 'true');
                }
            });
        } catch (error) {
            console.error('Render math formulas error:', error);
        }
    }

    // 监听消息变化，高亮代码块和渲染数学公式
    $: {
        if (messages.length > 0 || streamingMessage) {
            tick().then(() => {
                if (messagesContainer) {
                    highlightCodeBlocks(messagesContainer);
                    renderMathFormulas(messagesContainer);
                }
            });
        }
    }

    // 复制单条消息
    function copyMessage(content: string | MessageContent[]) {
        const textContent = getMessageText(content);
        navigator.clipboard
            .writeText(textContent)
            .then(() => {
                pushMsg(t('aiSidebar.success.copySuccess'));
            })
            .catch(err => {
                pushErrMsg(t('aiSidebar.errors.copyFailed'));
                console.error('Copy failed:', err);
            });
    }

    // 处理消息框右键菜单
    function handleContextMenu(event: MouseEvent, content: string | MessageContent[]) {
        event.preventDefault();
        copyMessage(content);
    }

    // 搜索文档
    async function searchDocuments() {
        isSearching = true;
        try {
            // 如果没有输入关键词，显示当前文档
            if (!searchKeyword.trim()) {
                const currentProtyle = getActiveEditor(false)?.protyle;
                const blockId = currentProtyle?.block?.id;

                if (blockId) {
                    // 获取当前文档信息
                    const blocks = await sql(
                        `SELECT * FROM blocks WHERE id = '${blockId}' OR root_id = '${blockId}'`
                    );
                    if (blocks && blocks.length > 0) {
                        // 查找文档块
                        const docBlock = blocks.find(b => b.type === 'd');
                        if (docBlock) {
                            searchResults = [docBlock];
                        } else {
                            // 如果当前块不是文档块，获取所属文档
                            const rootId = blocks[0].root_id;
                            const rootBlocks = await sql(
                                `SELECT * FROM blocks WHERE id = '${rootId}' AND type = 'd'`
                            );
                            searchResults = rootBlocks || [];
                        }
                    } else {
                        searchResults = [];
                    }
                } else {
                    searchResults = [];
                }
                isSearching = false;
                return;
            }

            // 将空格分隔的关键词转换为 SQL LIKE 查询
            // 转义单引号以防止SQL注入
            const keywords = searchKeyword
                .trim()
                .split(/\s+/)
                .map(kw => kw.replace(/'/g, "''"));
            const conditions = keywords.map(kw => `content LIKE '%${kw}%'`).join(' AND ');
            const sqlQuery = `SELECT * FROM blocks WHERE ${conditions} AND type = 'd' ORDER BY updated DESC LIMIT 20`;

            const results = await sql(sqlQuery);
            searchResults = results || [];
        } catch (error) {
            console.error('Search error:', error);
            searchResults = [];
        } finally {
            isSearching = false;
        }
    }

    // 自动搜索（带防抖）
    function autoSearch() {
        // 清除之前的定时器
        if (searchTimeout !== null) {
            clearTimeout(searchTimeout);
        }

        // 设置新的定时器，500ms后执行搜索
        searchTimeout = window.setTimeout(() => {
            searchDocuments();
        }, 500);
    }

    // 监听搜索关键词变化
    $: {
        if (isSearchDialogOpen && searchKeyword !== undefined) {
            autoSearch();
        }
    }

    // 监听对话框关闭，清理搜索状态
    $: {
        if (!isSearchDialogOpen) {
            if (searchTimeout !== null) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            // 不清空 searchKeyword 和 searchResults，保留用户的搜索历史
        }
    }

    // 添加文档到上下文
    async function addDocumentToContext(docId: string, docTitle: string) {
        // 检查是否已存在
        if (contextDocuments.find(doc => doc.id === docId)) {
            pushMsg(t('aiSidebar.success.documentExists'));
            return;
        }

        try {
            // 获取文档内容
            const data = await exportMdContent(docId, false, false, 2, 0, false);
            if (data && data.content) {
                contextDocuments = [
                    ...contextDocuments,
                    {
                        id: docId,
                        title: docTitle,
                        content: data.content,
                    },
                ];
                isSearchDialogOpen = false;
                searchKeyword = '';
                searchResults = [];
            }
        } catch (error) {
            console.error('Add document error:', error);
            pushErrMsg(t('aiSidebar.errors.addDocumentFailed'));
        }
    }

    // 获取当前聚焦的编辑器
    function getProtyle() {
        return getActiveEditor(false)?.protyle;
    }

    // 获取当前聚焦的块ID
    function getFocusedBlockId(): string | null {
        const protyle = getProtyle();
        if (!protyle) return null;

        // 获取ID：当有聚焦块时获取聚焦块ID，否则获取文档ID
        return protyle.block?.id || protyle.options?.blockId || protyle.block?.parentID || null;
    }

    // 通过块ID添加文档
    async function addItemByBlockId(blockId: string, forceFocusedBlock: boolean = false) {
        try {
            // 如果是从拖放操作且有聚焦块，则使用聚焦块
            let targetBlockId = blockId;
            if (forceFocusedBlock) {
                const focusedId = getFocusedBlockId();
                if (focusedId) {
                    targetBlockId = focusedId;
                }
            }

            const blocks = await sql(`SELECT * FROM blocks WHERE id = '${targetBlockId}'`);
            if (blocks && blocks.length > 0) {
                const block = blocks[0];
                let docId = targetBlockId;
                let docTitle = t('common.untitled');

                // 如果是文档块，直接添加
                if (block.type === 'd') {
                    docTitle = block.content || t('common.untitled');
                    await addDocumentToContext(docId, docTitle);
                } else {
                    // 如果是普通块，获取所属文档的标题
                    const rootBlocks = await sql(
                        `SELECT content FROM blocks WHERE id = '${block.root_id}' AND type = 'd'`
                    );
                    if (rootBlocks && rootBlocks.length > 0) {
                        docTitle = rootBlocks[0].content || '未命名文档';
                    }
                    // 添加该块的内容
                    await addBlockToContext(targetBlockId, docTitle);
                }
            }
        } catch (error) {
            console.error('Add block error:', error);
            pushErrMsg(t('aiSidebar.errors.addBlockFailed'));
        }
    }

    // 添加块到上下文（而不是整个文档）
    async function addBlockToContext(blockId: string, blockTitle: string) {
        // 检查是否已存在
        if (contextDocuments.find(doc => doc.id === blockId)) {
            pushMsg(t('aiSidebar.success.blockExists'));
            return;
        }

        try {
            // 获取块信息以判断类型
            const blockInfo = await getBlockByID(blockId);
            const isDoc = blockInfo?.type === 'd'; // 'd' 表示文档块

            // 获取块的Markdown内容
            const data = await exportMdContent(blockId, false, false, 2, 0, false);
            if (data && data.content) {
                // 从块内容中提取前20个字作为显示标题
                const contentPreview = data.content.replace(/\n/g, ' ').trim();
                const displayTitle =
                    contentPreview.length > 20
                        ? contentPreview.substring(0, 20) + '...'
                        : contentPreview || (isDoc ? '文档内容' : '块内容');

                contextDocuments = [
                    ...contextDocuments,
                    {
                        id: blockId,
                        title: displayTitle,
                        content: data.content,
                        type: isDoc ? 'doc' : 'block',
                    },
                ];
            }
        } catch (error) {
            console.error('Add block error:', error);
            pushErrMsg(t('aiSidebar.errors.addBlockContentFailed'));
        }
    }

    // 删除上下文文档
    function removeContextDocument(docId: string) {
        contextDocuments = contextDocuments.filter(doc => doc.id !== docId);
    }

    // 打开文档
    async function openDocument(docId: string) {
        try {
            await openBlock(docId);
        } catch (error) {
            console.error('Open document error:', error);
            pushErrMsg(t('aiSidebar.errors.openDocumentFailed'));
        }
    }

    // 处理拖放
    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        isDragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        // 只在真正离开容器时才设置为false
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        if (
            event.clientX <= rect.left ||
            event.clientX >= rect.right ||
            event.clientY <= rect.top ||
            event.clientY >= rect.bottom
        ) {
            isDragOver = false;
        }
    }

    async function handleDrop(event: DragEvent) {
        event.preventDefault();
        isDragOver = false;

        const type = event.dataTransfer.types[0];
        if (!type) return;

        if (type.startsWith(Constants.SIYUAN_DROP_GUTTER)) {
            const meta = type.replace(Constants.SIYUAN_DROP_GUTTER, '');
            const info = meta.split(Constants.ZWSP);
            const nodeId = info[2];
            await addItemByBlockId(nodeId, false);
        } else if (type.startsWith(Constants.SIYUAN_DROP_FILE)) {
            // 支持单选和多选拖放
            const ele: HTMLElement = (window as any).siyuan?.dragElement;
            if (ele && ele.innerText) {
                // 获取块ID字符串，可能是单个ID或逗号分隔的多个ID
                const blockIdStr = ele.innerText;

                // 分割成多个块ID（多选时用逗号分隔）
                const blockIds = blockIdStr
                    .split(',')
                    .map(id => id.trim())
                    .filter(id => id && id !== '/');

                // 批量添加到上下文
                if (blockIds.length > 0) {
                    for (const blockid of blockIds) {
                        await addItemByBlockId(blockid, false);
                        // 恢复文档树节点的透明度
                        const item: HTMLElement = document.querySelector(
                            `.file-tree.sy__tree li[data-node-id="${blockid}"]`
                        );
                        if (item) {
                            item.style.opacity = '1';
                        }
                    }
                }

                (window as any).siyuan.dragElement = undefined;
            }
        } else if (event.dataTransfer.types.includes(Constants.SIYUAN_DROP_TAB)) {
            const data = event.dataTransfer.getData(Constants.SIYUAN_DROP_TAB);
            const payload = JSON.parse(data);
            const rootId = payload?.children?.rootId;
            if (rootId) {
                // 拖放页签时，如果有聚焦块，则使用聚焦块内容
                await addItemByBlockId(rootId, true);
            }
            const tab = document.querySelector(
                `li[data-type="tab-header"][data-id="${payload.id}"]`
            ) as HTMLElement;
            if (tab) {
                tab.style.opacity = 'unset';
            }
        }
    }

    // 会话管理函数
    async function loadSessions() {
        try {
            const data = await plugin.loadData('chat-sessions.json');
            sessions = data?.sessions || [];
        } catch (error) {
            console.error('Load sessions error:', error);
            sessions = [];
        }
    }

    async function saveSessions() {
        try {
            await plugin.saveData('chat-sessions.json', { sessions });
        } catch (error) {
            console.error('Save sessions error:', error);
            pushErrMsg(t('aiSidebar.errors.saveSessionFailed'));
        }
    }

    function generateSessionTitle(): string {
        const userMessages = messages.filter(m => m.role === 'user');
        if (userMessages.length > 0) {
            const firstMessage = getMessageText(userMessages[0].content);
            return firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        }
        return t('aiSidebar.session.new');
    }

    async function saveCurrentSession(silent: boolean = false) {
        if (messages.filter(m => m.role !== 'system').length === 0) {
            if (!silent) {
                pushErrMsg(t('aiSidebar.errors.emptySession'));
            }
            return;
        }

        const now = Date.now();

        if (currentSessionId) {
            // 更新现有会话
            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
                session.messages = [...messages];
                session.contextDocuments =
                    contextDocuments.length > 0 ? [...contextDocuments] : undefined;
                session.title = generateSessionTitle();
                session.updatedAt = now;
            }
        } else {
            // 创建新会话
            const newSession: ChatSession = {
                id: `session_${now}`,
                title: generateSessionTitle(),
                messages: [...messages],
                contextDocuments: contextDocuments.length > 0 ? [...contextDocuments] : undefined,
                createdAt: now,
                updatedAt: now,
            };
            sessions = [newSession, ...sessions];
            currentSessionId = newSession.id;
        }

        await saveSessions();
        hasUnsavedChanges = false;

        if (!silent) {
            pushMsg(t('aiSidebar.success.saveSessionSuccess'));
        }
    }

    async function loadSession(sessionId: string) {
        // 如果消息正在生成，先中断
        if (isLoading && abortController) {
            abortMessage();
        }

        if (hasUnsavedChanges) {
            confirm(
                t('aiSidebar.confirm.switchSession.title'),
                t('aiSidebar.confirm.switchSession.message'),
                async () => {
                    await saveCurrentSession();
                    await doLoadSession(sessionId);
                },
                async () => {
                    await doLoadSession(sessionId);
                }
            );
        } else {
            await doLoadSession(sessionId);
        }
    }

    async function doLoadSession(sessionId: string) {
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            messages = [...session.messages];
            // 恢复上下文文档
            contextDocuments = session.contextDocuments ? [...session.contextDocuments] : [];
            // 确保系统提示词存在且是最新的
            if (settings.aiSystemPrompt) {
                const systemMsgIndex = messages.findIndex(m => m.role === 'system');
                if (systemMsgIndex >= 0) {
                    messages[systemMsgIndex].content = settings.aiSystemPrompt;
                } else {
                    messages.unshift({ role: 'system', content: settings.aiSystemPrompt });
                }
            }
            currentSessionId = sessionId;
            hasUnsavedChanges = false;
            await scrollToBottom();
        }
    }

    async function newSession() {
        // 如果消息正在生成，先中断
        if (isLoading && abortController) {
            abortMessage();
        }

        // 如果有未保存的更改，自动保存当前会话
        if (hasUnsavedChanges && messages.filter(m => m.role !== 'system').length > 0) {
            await saveCurrentSession();
        }
        doNewSession();
    }

    function doNewSession() {
        messages = settings.aiSystemPrompt
            ? [{ role: 'system', content: settings.aiSystemPrompt }]
            : [];
        contextDocuments = [];
        currentSessionId = '';
        hasUnsavedChanges = false;
    }

    async function deleteSession(sessionId: string) {
        confirm(
            t('aiSidebar.confirm.deleteSession.title'),
            t('aiSidebar.confirm.deleteSession.message'),
            async () => {
                sessions = sessions.filter(s => s.id !== sessionId);
                await saveSessions();

                if (currentSessionId === sessionId) {
                    doNewSession();
                }
            }
        );
    }

    // 打开插件设置
    function openSettings() {
        plugin.openSetting();
    }

    // 提示词管理函数
    async function loadPrompts() {
        try {
            const data = await plugin.loadData('prompts.json');
            prompts = data?.prompts || [];
        } catch (error) {
            console.error('Load prompts error:', error);
            prompts = [];
        }
    }

    async function savePrompts() {
        try {
            await plugin.saveData('prompts.json', { prompts });
        } catch (error) {
            console.error('Save prompts error:', error);
            pushErrMsg(t('aiSidebar.errors.savePromptFailed'));
        }
    }

    function openPromptManager() {
        isPromptSelectorOpen = false;
        isPromptManagerOpen = true;
        editingPrompt = null;
        newPromptTitle = '';
        newPromptContent = '';
    }

    function closePromptManager() {
        isPromptManagerOpen = false;
        editingPrompt = null;
        newPromptTitle = '';
        newPromptContent = '';
    }

    async function saveNewPrompt() {
        if (!newPromptTitle.trim() || !newPromptContent.trim()) {
            pushErrMsg(t('aiSidebar.errors.emptyPromptContent'));
            return;
        }

        const now = Date.now();
        if (editingPrompt) {
            // 编辑现有提示词
            const index = prompts.findIndex(p => p.id === editingPrompt.id);
            if (index >= 0) {
                prompts[index] = {
                    ...prompts[index],
                    title: newPromptTitle.trim(),
                    content: newPromptContent.trim(),
                };
                prompts = [...prompts];
            }
        } else {
            // 创建新提示词
            const newPrompt: Prompt = {
                id: `prompt_${now}`,
                title: newPromptTitle.trim(),
                content: newPromptContent.trim(),
                createdAt: now,
            };
            prompts = [newPrompt, ...prompts];
        }

        await savePrompts();
        closePromptManager();
    }

    function editPrompt(prompt: Prompt) {
        editingPrompt = prompt;
        newPromptTitle = prompt.title;
        newPromptContent = prompt.content;
        isPromptSelectorOpen = false;
        isPromptManagerOpen = true;
    }

    async function deletePrompt(promptId: string) {
        confirm(
            t('aiSidebar.confirm.deletePrompt.title'),
            t('aiSidebar.confirm.deletePrompt.message'),
            async () => {
                prompts = prompts.filter(p => p.id !== promptId);
                await savePrompts();
            }
        );
    }

    function usePrompt(prompt: Prompt) {
        currentInput = prompt.content;
        isPromptSelectorOpen = false;
        tick().then(() => {
            autoResizeTextarea();
            textareaElement?.focus();
        });
    }

    // 点击外部关闭提示词选择器
    function handleClickOutside(event: MouseEvent) {
        if (isPromptSelectorOpen) {
            const target = event.target as HTMLElement;
            const selector = document.querySelector('.ai-sidebar__prompt-selector');
            const buttons = document.querySelectorAll('.ai-sidebar__prompt-actions button');

            let clickedButton = false;
            buttons.forEach(button => {
                if (button.contains(target)) {
                    clickedButton = true;
                }
            });

            if (selector && !selector.contains(target) && !clickedButton) {
                isPromptSelectorOpen = false;
            }
        }
    }

    // 编辑模式相关函数
    // 解析AI返回的编辑操作（JSON格式）
    function parseEditOperations(content: string): EditOperation[] {
        const operations: EditOperation[] = [];

        try {
            // 尝试匹配JSON代码块: ```json\n{...}\n```
            const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/gi;
            let match = jsonBlockRegex.exec(content);

            if (match) {
                const jsonStr = match[1].trim();
                const data = JSON.parse(jsonStr);

                if (data.editOperations && Array.isArray(data.editOperations)) {
                    for (const op of data.editOperations) {
                        if (op.blockId && op.newContent !== undefined) {
                            operations.push({
                                operationType: op.operationType || 'update', // 默认为update
                                blockId: op.blockId,
                                newContent: op.newContent,
                                oldContent: undefined, // 稍后获取
                                status: 'pending',
                                position: op.position || 'after', // 默认在后面插入
                            });
                        }
                    }
                }
            } else {
                // 尝试直接解析JSON（不在代码块中）
                const data = JSON.parse(content);
                if (data.editOperations && Array.isArray(data.editOperations)) {
                    for (const op of data.editOperations) {
                        if (op.blockId && op.newContent !== undefined) {
                            operations.push({
                                operationType: op.operationType || 'update', // 默认为update
                                blockId: op.blockId,
                                newContent: op.newContent,
                                oldContent: undefined,
                                status: 'pending',
                                position: op.position || 'after', // 默认在后面插入
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('解析编辑操作失败:', error);
        }

        return operations;
    }

    // 应用编辑操作
    async function applyEditOperation(operation: EditOperation, messageIndex: number) {
        try {
            const operationType = operation.operationType || 'update';

            if (operationType === 'insert') {
                // 插入新块
                const position = operation.position || 'after';

                // 根据位置确定参数
                let nextID: string | null;
                let previousID: string | null;

                if (position === 'before') {
                    // 在指定块之前插入
                    nextID = operation.blockId;
                } else {
                    // 在指定块之后插入（默认）
                    previousID = operation.blockId;
                }

                // 使用 insertBlock API 插入块
                const insertResult = await insertBlock(
                    'markdown',
                    operation.newContent,
                    nextID,
                    previousID,
                    undefined
                );
                await refreshSql();
                // 获取新插入块的ID（从 doOperations 中获取）
                const newBlockId = insertResult?.[0]?.doOperations?.[0]?.id;
                console.log('Inserted new block ID:', newBlockId);
                // 创建可撤回的事务
                if (newBlockId) {
                    try {
                        const currentProtyle = getProtyle();
                        if (currentProtyle) {
                            await refreshSql();
                            const newBlockDomRes = await getBlockDOM(newBlockId);
                            const newBlockDom = newBlockDomRes?.dom;
                            // 获取父块ID
                            const block = await getBlockByID(operation.blockId);
                            const parentID = block?.root_id || currentProtyle.block.id;
                            const doOperations = [];
                            if (nextID) {
                                doOperations.push({
                                    action: 'insert',
                                    id: newBlockId,
                                    data: newBlockDom,
                                    parentID: parentID,
                                    nextID: nextID,
                                });
                            } else {
                                doOperations.push({
                                    action: 'insert',
                                    id: newBlockId,
                                    data: newBlockDom,
                                    parentID: parentID,
                                    previousID: previousID,
                                });
                            }

                            const undoOperations = [
                                {
                                    action: 'delete',
                                    id: newBlockId,
                                    data: null,
                                },
                            ];

                            // 执行事务以支持撤回
                            currentProtyle.getInstance().transaction(doOperations, undoOperations);
                        }
                    } catch (transactionError) {
                        console.warn('创建撤回事务失败，但块已插入:', transactionError);
                    }
                }

                // 更新操作状态
                const message = messages[messageIndex];
                if (message.editOperations) {
                    const op = message.editOperations.find(
                        o =>
                            o.blockId === operation.blockId && o.newContent === operation.newContent
                    );
                    if (op) {
                        op.status = 'applied';
                    }
                }
                messages = [...messages];
                hasUnsavedChanges = true;

                pushMsg(t('aiSidebar.success.insertBlockSuccess'));
            } else {
                // 更新现有块
                // 获取当前块内容
                const blockData = await getBlockKramdown(operation.blockId);
                if (!blockData || !blockData.kramdown) {
                    pushErrMsg(t('aiSidebar.errors.getBlockFailed'));
                    return;
                }

                // 保存旧内容用于显示（如果还没有保存）
                if (!operation.oldContent) {
                    operation.oldContent = blockData.kramdown;
                }

                // 保存旧的DOM用于撤回操作
                const oldBlockDomRes = await getBlockDOM(operation.blockId);

                // 使用 updateBlock API 更新块内容
                await updateBlock('markdown', operation.newContent, operation.blockId);
                await refreshSql();
                // 获取当前编辑器实例并创建可撤回的事务
                try {
                    const currentProtyle = getProtyle();
                    if (currentProtyle) {
                        await refreshSql();
                        const oldBlockDom = oldBlockDomRes?.dom;
                        const newBlockDomRes = await getBlockDOM(operation.blockId);
                        const newBlockDom = newBlockDomRes?.dom;
                        currentProtyle
                            .getInstance()
                            .updateTransaction(operation.blockId, newBlockDom, oldBlockDom);
                    }
                } catch (transactionError) {
                    console.warn('创建撤回事务失败，但块内容已更新:', transactionError);
                }

                // 更新操作状态
                const message = messages[messageIndex];
                if (message.editOperations) {
                    const op = message.editOperations.find(o => o.blockId === operation.blockId);
                    if (op) {
                        op.status = 'applied';
                    }
                }
                messages = [...messages];
                hasUnsavedChanges = true;

                pushMsg(t('aiSidebar.success.applyEditSuccess'));
            }
        } catch (error) {
            console.error('应用编辑失败:', error);
            pushErrMsg(t('aiSidebar.errors.applyEditFailed'));
        }
    }

    // 拒绝编辑操作
    function rejectEditOperation(operation: EditOperation, messageIndex: number) {
        const message = messages[messageIndex];
        if (message.editOperations) {
            const op = message.editOperations.find(o => o.blockId === operation.blockId);
            if (op) {
                op.status = 'rejected';
            }
        }
        messages = [...messages];
        hasUnsavedChanges = true;
        pushMsg(t('aiSidebar.success.rejectEditSuccess'));
    }

    // 查看差异
    async function viewDiff(operation: EditOperation) {
        const operationType = operation.operationType || 'update';

        if (operationType === 'insert') {
            // 插入操作：旧内容为空，新内容为要插入的内容
            const newMdContent =
                operation.newContentForDisplay ||
                operation.newContent.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim();

            currentDiffOperation = {
                ...operation,
                oldContent: '', // 插入操作没有旧内容
                newContent: operation.newContentForDisplay || newMdContent,
            };
        } else {
            // 更新操作
            // 使用保存的Markdown格式内容来显示差异
            // 这样可以看到真正的修改前内容，即使块已经被修改了
            const oldMdContent = operation.oldContentForDisplay || operation.oldContent || '';
            const newMdContent =
                operation.newContentForDisplay ||
                operation.newContent.replace(/\{:\s*id="[^"]+"\s*\}/g, '').trim();

            // 如果没有保存的显示内容（兼容旧数据），尝试实时获取
            if (!operation.oldContentForDisplay) {
                try {
                    const oldMdData = await exportMdContent(
                        operation.blockId,
                        false,
                        false,
                        2,
                        0,
                        false
                    );
                    if (oldMdData?.content) {
                        operation.oldContentForDisplay = oldMdData.content;
                    }
                } catch (error) {
                    console.error('获取块内容失败:', error);
                }
            }

            // 创建用于显示的临时operation对象
            currentDiffOperation = {
                ...operation,
                oldContent: operation.oldContentForDisplay || oldMdContent,
                newContent: operation.newContentForDisplay || newMdContent,
            };
        }

        isDiffDialogOpen = true;
    }

    // 关闭差异对话框
    function closeDiffDialog() {
        isDiffDialogOpen = false;
        currentDiffOperation = null;
    }

    // 简单的差异高亮（按行对比）
    function generateSimpleDiff(
        oldText: string,
        newText: string
    ): { type: 'removed' | 'added' | 'unchanged'; line: string }[] {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const result: { type: 'removed' | 'added' | 'unchanged'; line: string }[] = [];

        // 简单的行对比（可以使用更复杂的diff算法）
        const maxLen = Math.max(oldLines.length, newLines.length);
        let oldIdx = 0;
        let newIdx = 0;

        while (oldIdx < oldLines.length || newIdx < newLines.length) {
            const oldLine = oldLines[oldIdx] || '';
            const newLine = newLines[newIdx] || '';

            if (oldLine === newLine) {
                result.push({ type: 'unchanged', line: oldLine });
                oldIdx++;
                newIdx++;
            } else if (oldIdx < oldLines.length && newIdx < newLines.length) {
                // 两行都存在但不同
                result.push({ type: 'removed', line: oldLine });
                result.push({ type: 'added', line: newLine });
                oldIdx++;
                newIdx++;
            } else if (oldIdx < oldLines.length) {
                // 只有旧行
                result.push({ type: 'removed', line: oldLine });
                oldIdx++;
            } else {
                // 只有新行
                result.push({ type: 'added', line: newLine });
                newIdx++;
            }
        }

        return result;
    }

    // 消息操作函数
    // 开始编辑消息
    function startEditMessage(index: number) {
        editingMessageIndex = index;
        editingMessageContent = getMessageText(messages[index].content);
        isEditDialogOpen = true;
    }

    // 取消编辑消息
    function cancelEditMessage() {
        editingMessageIndex = null;
        editingMessageContent = '';
        isEditDialogOpen = false;
    }

    // 保存编辑的消息
    function saveEditMessage() {
        if (editingMessageIndex === null) return;

        const message = messages[editingMessageIndex];
        message.content = editingMessageContent.trim();
        messages = [...messages];
        hasUnsavedChanges = true;

        editingMessageIndex = null;
        editingMessageContent = '';
        isEditDialogOpen = false;
    }

    // 删除消息
    function deleteMessage(index: number) {
        confirm(
            t('aiSidebar.confirm.deleteMessage.title'),
            t('aiSidebar.confirm.deleteMessage.message'),
            () => {
                messages = messages.filter((_, i) => i !== index);
                hasUnsavedChanges = true;
            }
        );
    }

    // 重新生成AI回复
    async function regenerateMessage(index: number) {
        if (isLoading) {
            pushErrMsg(t('aiSidebar.errors.generating'));
            return;
        }

        // 删除从此消息开始的所有后续消息
        messages = messages.slice(0, index);
        hasUnsavedChanges = true;

        // 获取最后一条用户消息
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMessage) {
            pushErrMsg(t('aiSidebar.errors.noUserMessage'));
            return;
        }

        // 重新发送请求
        isLoading = true;
        streamingMessage = '';
        streamingThinking = '';
        isThinkingPhase = false;
        autoScroll = true; // 重新生成时启用自动滚动

        await scrollToBottom(true);

        // 获取最新的上下文文档内容
        const contextDocumentsWithLatestContent: ContextDocument[] = [];
        for (const doc of contextDocuments) {
            try {
                let content: string;

                if (chatMode === 'edit') {
                    // 编辑模式：获取kramdown格式，保留块ID结构
                    const blockData = await getBlockKramdown(doc.id);
                    if (blockData && blockData.kramdown) {
                        content = blockData.kramdown;
                    } else {
                        // 降级使用缓存内容
                        content = doc.content;
                    }
                } else {
                    // 问答模式：获取Markdown格式
                    const data = await exportMdContent(doc.id, false, false, 2, 0, false);
                    if (data && data.content) {
                        content = data.content;
                    } else {
                        // 降级使用缓存内容
                        content = doc.content;
                    }
                }

                contextDocumentsWithLatestContent.push({
                    id: doc.id,
                    title: doc.title,
                    content: content,
                    type: doc.type,
                });
            } catch (error) {
                console.error(`Failed to fetch latest content for block ${doc.id}:`, error);
                // 如果获取失败，使用原有内容
                contextDocumentsWithLatestContent.push(doc);
            }
        }

        // 准备发送给AI的消息（包含系统提示词和上下文文档）
        // 深拷贝消息数组，避免修改原始消息
        const messagesToSend = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content,
            }));

        // 处理最后一条用户消息，添加附件和上下文文档
        if (messagesToSend.length > 0) {
            const lastMessage = messagesToSend[messagesToSend.length - 1];
            if (lastMessage.role === 'user') {
                const lastUserMessage = messages[messages.length - 1];
                const hasImages = lastUserMessage.attachments?.some(att => att.type === 'image');

                // 如果有图片附件，使用多模态格式
                if (hasImages) {
                    const contentParts: any[] = [];

                    // 先添加用户输入
                    let textContent =
                        typeof lastUserMessage.content === 'string'
                            ? lastUserMessage.content
                            : getMessageText(lastUserMessage.content);

                    // 然后添加上下文文档（如果有）
                    if (contextDocumentsWithLatestContent.length > 0) {
                        const contextText = contextDocumentsWithLatestContent
                            .map(doc => {
                                const label = doc.type === 'doc' ? '文档' : '块';
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                            })
                            .join('\n\n---\n\n');
                        textContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                    }

                    contentParts.push({ type: 'text', text: textContent });

                    // 添加图片
                    lastUserMessage.attachments?.forEach(att => {
                        if (att.type === 'image') {
                            contentParts.push({
                                type: 'image_url',
                                image_url: { url: att.data },
                            });
                        }
                    });

                    // 添加文本文件内容
                    const fileTexts = lastUserMessage.attachments
                        ?.filter(att => att.type === 'file')
                        .map(att => `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`)
                        .join('\n\n---\n\n');

                    if (fileTexts) {
                        contentParts.push({
                            type: 'text',
                            text: `\n\n以下是附件文件内容：\n\n${fileTexts}`,
                        });
                    }

                    lastMessage.content = contentParts;
                } else {
                    // 纯文本格式
                    let enhancedContent =
                        typeof lastUserMessage.content === 'string'
                            ? lastUserMessage.content
                            : getMessageText(lastUserMessage.content);

                    // 添加文本文件附件
                    if (lastUserMessage.attachments && lastUserMessage.attachments.length > 0) {
                        const attachmentTexts = lastUserMessage.attachments
                            .map(att => {
                                if (att.type === 'file') {
                                    return `## 文件: ${att.name}\n\n\`\`\`\n${att.data}\n\`\`\`\n`;
                                }
                                return '';
                            })
                            .filter(Boolean)
                            .join('\n\n---\n\n');

                        if (attachmentTexts) {
                            enhancedContent += `\n\n---\n\n以下是附件内容：\n\n${attachmentTexts}`;
                        }
                    }

                    // 添加上下文文档
                    if (contextDocumentsWithLatestContent.length > 0) {
                        const contextText = contextDocumentsWithLatestContent
                            .map(doc => {
                                const label = doc.type === 'doc' ? '文档' : '块';
                                return `## ${label}: ${doc.title}\n\n**BlockID**: \`${doc.id}\`\n\n\`\`\`markdown\n${doc.content}\n\`\`\``;
                            })
                            .join('\n\n---\n\n');
                        enhancedContent += `\n\n---\n\n以下是相关内容作为上下文：\n\n${contextText}`;
                    }

                    lastMessage.content = enhancedContent;
                }
            }
        }

        if (settings.aiSystemPrompt) {
            messagesToSend.unshift({ role: 'system', content: settings.aiSystemPrompt });
        }

        // 创建新的 AbortController
        abortController = new AbortController();

        const providerConfig = getCurrentProviderConfig();
        const modelConfig = getCurrentModelConfig();

        if (!providerConfig || !modelConfig) {
            pushErrMsg(t('aiSidebar.errors.noProvider'));
            isLoading = false;
            return;
        }

        try {
            const enableThinking = modelConfig.capabilities?.thinking || false;

            await chat(
                currentProvider,
                {
                    apiKey: providerConfig.apiKey,
                    model: modelConfig.id,
                    messages: messagesToSend,
                    temperature: modelConfig.temperature,
                    maxTokens: modelConfig.maxTokens > 0 ? modelConfig.maxTokens : undefined,
                    stream: true,
                    signal: abortController.signal,
                    enableThinking,
                    onThinkingChunk: enableThinking
                        ? async (chunk: string) => {
                              isThinkingPhase = true;
                              streamingThinking += chunk;
                              await scrollToBottom();
                          }
                        : undefined,
                    onThinkingComplete: enableThinking
                        ? (thinking: string) => {
                              isThinkingPhase = false;
                              thinkingCollapsed[messages.length] = true;
                          }
                        : undefined,
                    onChunk: async (chunk: string) => {
                        streamingMessage += chunk;
                        await scrollToBottom();
                    },
                    onComplete: async (fullText: string) => {
                        // 转换 LaTeX 数学公式格式为 Markdown 格式
                        const convertedText = convertLatexToMarkdown(fullText);

                        const assistantMessage: Message = {
                            role: 'assistant',
                            content: convertedText,
                        };

                        if (enableThinking && streamingThinking) {
                            assistantMessage.thinking = streamingThinking;
                        }

                        messages = [...messages, assistantMessage];
                        streamingMessage = '';
                        streamingThinking = '';
                        isThinkingPhase = false;
                        isLoading = false;
                        abortController = null;
                        hasUnsavedChanges = true;

                        // AI 回复完成后，自动保存当前会话
                        await saveCurrentSession(true);
                    },
                    onError: (error: Error) => {
                        if (error.message !== 'Request aborted') {
                            // 将错误消息作为一条 assistant 消息添加
                            const errorMessage: Message = {
                                role: 'assistant',
                                content: `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${error.message}`,
                            };
                            messages = [...messages, errorMessage];
                            hasUnsavedChanges = true;
                        }
                        isLoading = false;
                        streamingMessage = '';
                        streamingThinking = '';
                        isThinkingPhase = false;
                        abortController = null;
                    },
                },
                providerConfig.customApiUrl
            );
        } catch (error) {
            console.error('Regenerate message error:', error);
            // onError 回调已经处理了错误消息的添加，这里不需要重复添加
            if ((error as Error).name === 'AbortError') {
                // 中断错误已经在 abortMessage 中处理
            } else if (!isLoading) {
                // 如果 isLoading 已经是 false，说明 onError 已经被调用并处理了
                // 不需要做任何事情
            } else {
                // 如果 isLoading 还是 true，说明 onError 没有被调用
                // 这种情况下才需要添加错误消息
                const errorMessage: Message = {
                    role: 'assistant',
                    content: `❌ **${t('aiSidebar.errors.requestFailed')}**\n\n${(error as Error).message}`,
                };
                messages = [...messages, errorMessage];
                hasUnsavedChanges = true;
                isLoading = false;
                streamingMessage = '';
                streamingThinking = '';
                isThinkingPhase = false;
            }
            abortController = null;
        }
    }
</script>

<div class="ai-sidebar">
    <div class="ai-sidebar__header">
        <h3 class="ai-sidebar__title">
            {t('aiSidebar.title')}
            {#if hasUnsavedChanges}
                <span class="ai-sidebar__unsaved" title={t('aiSidebar.unsavedChanges')}>●</span>
            {/if}
        </h3>
        <div class="ai-sidebar__actions">
            <button
                class="b3-button b3-button--text"
                on:click={newSession}
                title={t('aiSidebar.session.new')}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
            </button>
            <SessionManager
                bind:sessions
                bind:currentSessionId
                bind:isOpen={isSessionManagerOpen}
                on:load={e => loadSession(e.detail.sessionId)}
                on:delete={e => deleteSession(e.detail.sessionId)}
                on:new={newSession}
            />
            <button
                class="b3-button b3-button--text"
                on:click={copyAsMarkdown}
                title={t('aiSidebar.actions.copyAllChat')}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
            </button>
            <button
                class="b3-button b3-button--text"
                on:click={clearChat}
                title={t('aiSidebar.actions.clear')}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
            </button>
            <button
                class="b3-button b3-button--text"
                on:click={openSettings}
                title={t('aiSidebar.actions.settings')}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconSettings"></use></svg>
            </button>
        </div>
    </div>

    <div
        class="ai-sidebar__messages"
        class:ai-sidebar__messages--drag-over={isDragOver}
        bind:this={messagesContainer}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
        on:scroll={handleScroll}
    >
        {#each messages as message, index (index)}
            {#if message.role !== 'system'}
                <div
                    class="ai-message ai-message--{message.role}"
                    on:contextmenu={e => handleContextMenu(e, message.content)}
                >
                    <div class="ai-message__header">
                        <span class="ai-message__role">
                            {message.role === 'user' ? '👤 User' : '🤖 AI'}
                        </span>
                    </div>

                    <!-- 显示附件 -->
                    {#if message.attachments && message.attachments.length > 0}
                        <div class="ai-message__attachments">
                            {#each message.attachments as attachment}
                                <div class="ai-message__attachment">
                                    {#if attachment.type === 'image'}
                                        <img
                                            src={attachment.data}
                                            alt={attachment.name}
                                            class="ai-message__attachment-image"
                                        />
                                        <span class="ai-message__attachment-name">
                                            {attachment.name}
                                        </span>
                                    {:else}
                                        <div class="ai-message__attachment-file">
                                            <svg class="ai-message__attachment-icon">
                                                <use xlink:href="#iconFile"></use>
                                            </svg>
                                            <span class="ai-message__attachment-name">
                                                {attachment.name}
                                            </span>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}

                    <!-- 显示思考过程 -->
                    {#if message.role === 'assistant' && message.thinking}
                        <div class="ai-message__thinking">
                            <div
                                class="ai-message__thinking-header"
                                on:click={() => {
                                    thinkingCollapsed[index] = !thinkingCollapsed[index];
                                }}
                            >
                                <svg
                                    class="ai-message__thinking-icon"
                                    class:collapsed={thinkingCollapsed[index]}
                                >
                                    <use xlink:href="#iconRight"></use>
                                </svg>
                                <span class="ai-message__thinking-title">💭 思考过程</span>
                            </div>
                            {#if !thinkingCollapsed[index]}
                                <div class="ai-message__thinking-content protyle-wysiwyg">
                                    {@html formatMessage(message.thinking)}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- 显示消息内容 -->
                    <div
                        class="ai-message__content protyle-wysiwyg"
                        style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
                    >
                        {@html formatMessage(message.content)}
                    </div>

                    <!-- 显示编辑操作 -->
                    {#if message.role === 'assistant' && message.editOperations && message.editOperations.length > 0}
                        <div class="ai-message__edit-operations">
                            <div class="ai-message__edit-operations-title">
                                📝 {t('aiSidebar.edit.title')} ({message.editOperations.length})
                            </div>
                            {#each message.editOperations as operation}
                                <div
                                    class="ai-message__edit-operation"
                                    class:ai-message__edit-operation--applied={operation.status ===
                                        'applied'}
                                    class:ai-message__edit-operation--rejected={operation.status ===
                                        'rejected'}
                                >
                                    <div class="ai-message__edit-operation-header">
                                        <span class="ai-message__edit-operation-id">
                                            {#if operation.operationType === 'insert'}
                                                {t('aiSidebar.edit.insertBlock')}:
                                                {operation.position === 'before'
                                                    ? t('aiSidebar.edit.before')
                                                    : t('aiSidebar.edit.after')}
                                                {operation.blockId}
                                            {:else}
                                                {t('aiSidebar.edit.blockId')}: {operation.blockId}
                                            {/if}
                                        </span>
                                        <span class="ai-message__edit-operation-status">
                                            {#if operation.status === 'applied'}
                                                ✓ {t('aiSidebar.actions.applied')}
                                            {:else if operation.status === 'rejected'}
                                                ✗ {t('aiSidebar.actions.rejected')}
                                            {:else}
                                                ⏳ {t('aiSidebar.edit.changes')}
                                            {/if}
                                        </span>
                                    </div>
                                    <div class="ai-message__edit-operation-actions">
                                        <!-- 查看差异按钮：所有状态都可以查看 -->
                                        <button
                                            class="b3-button b3-button--text"
                                            on:click={() => viewDiff(operation)}
                                            title={t('aiSidebar.actions.viewDiff')}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconEye"></use>
                                            </svg>
                                            {t('aiSidebar.actions.viewDiff')}
                                        </button>

                                        {#if operation.status === 'pending'}
                                            <!-- 应用和拒绝按钮：仅在pending状态显示 -->
                                            <button
                                                class="b3-button b3-button--outline"
                                                on:click={() =>
                                                    applyEditOperation(operation, index)}
                                                title={t('aiSidebar.actions.applyEdit')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconCheck"></use>
                                                </svg>
                                                {t('aiSidebar.actions.applyEdit')}
                                            </button>
                                            <button
                                                class="b3-button b3-button--text"
                                                on:click={() =>
                                                    rejectEditOperation(operation, index)}
                                                title={t('aiSidebar.actions.rejectEdit')}
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconClose"></use>
                                                </svg>
                                                {t('aiSidebar.actions.rejectEdit')}
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}

                    <!-- 消息操作按钮 -->
                    <div class="ai-message__actions">
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => copyMessage(message.content)}
                            title={t('aiSidebar.actions.copyMessage')}
                        >
                            <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                        </button>
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => startEditMessage(index)}
                            title={t('aiSidebar.actions.editMessage')}
                        >
                            <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
                        </button>
                        <button
                            class="b3-button b3-button--text ai-message__action"
                            on:click={() => deleteMessage(index)}
                            title={t('aiSidebar.actions.deleteMessage')}
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconTrashcan"></use>
                            </svg>
                        </button>
                        {#if message.role === 'assistant'}
                            <button
                                class="b3-button b3-button--text ai-message__action"
                                on:click={() => regenerateMessage(index)}
                                title={t('aiSidebar.actions.regenerate')}
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconRefresh"></use>
                                </svg>
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}
        {/each}

        {#if isLoading && (streamingMessage || streamingThinking)}
            <div
                class="ai-message ai-message--assistant ai-message--streaming"
                on:contextmenu={e => handleContextMenu(e, streamingMessage)}
            >
                <div class="ai-message__header">
                    <span class="ai-message__role">🤖 AI</span>
                    <span class="ai-message__streaming-indicator">●</span>
                </div>

                <!-- 显示流式思考过程 -->
                {#if streamingThinking}
                    <div class="ai-message__thinking">
                        <div class="ai-message__thinking-header">
                            <svg class="ai-message__thinking-icon">
                                <use xlink:href="#iconRight"></use>
                            </svg>
                            <span class="ai-message__thinking-title">
                                💭 思考中{isThinkingPhase ? '...' : ' (已完成)'}
                            </span>
                        </div>
                        {#if !isThinkingPhase}
                            <div class="ai-message__thinking-content protyle-wysiwyg">
                                {@html formatMessage(streamingThinking)}
                            </div>
                        {:else}
                            <div
                                class="ai-message__thinking-content ai-message__thinking-content--streaming protyle-wysiwyg"
                            >
                                {@html formatMessage(streamingThinking)}
                            </div>
                        {/if}
                    </div>
                {/if}

                {#if streamingMessage}
                    <div
                        class="ai-message__content protyle-wysiwyg"
                        style={messageFontSize ? `font-size: ${messageFontSize}px;` : ''}
                    >
                        {@html formatMessage(streamingMessage)}
                    </div>
                {/if}
            </div>
        {/if}

        {#if messages.filter(msg => msg.role !== 'system').length === 0 && !isLoading}
            <div class="ai-sidebar__empty">
                <div class="ai-sidebar__empty-icon">💬</div>
                <p>{t('aiSidebar.empty.greeting')}</p>
            </div>
        {/if}
    </div>

    <!-- 上下文文档和附件列表 -->
    {#if contextDocuments.length > 0 || currentAttachments.length > 0}
        <div class="ai-sidebar__context-docs">
            <div class="ai-sidebar__context-docs-title">📎 {t('aiSidebar.context.content')}</div>
            <div class="ai-sidebar__context-docs-list">
                <!-- 显示上下文文档 -->
                {#each contextDocuments as doc (doc.id)}
                    <div class="ai-sidebar__context-doc-item">
                        <button
                            class="ai-sidebar__context-doc-remove"
                            on:click={() => removeContextDocument(doc.id)}
                            title="移除文档"
                        >
                            ×
                        </button>
                        <button
                            class="ai-sidebar__context-doc-link"
                            on:click={() => openDocument(doc.id)}
                            title="点击查看文档"
                        >
                            📄 {doc.title}
                        </button>
                    </div>
                {/each}

                <!-- 显示当前附件 -->
                {#each currentAttachments as attachment, index}
                    <div class="ai-sidebar__context-doc-item">
                        <button
                            class="ai-sidebar__context-doc-remove"
                            on:click={() => removeAttachment(index)}
                            title="移除附件"
                        >
                            ×
                        </button>
                        {#if attachment.type === 'image'}
                            <img
                                src={attachment.data}
                                alt={attachment.name}
                                class="ai-sidebar__context-attachment-preview"
                                title={attachment.name}
                            />
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                🖼️ {attachment.name}
                            </span>
                        {:else}
                            <svg class="ai-sidebar__context-attachment-icon">
                                <use xlink:href="#iconFile"></use>
                            </svg>
                            <span class="ai-sidebar__context-doc-name" title={attachment.name}>
                                📄 {attachment.name}
                            </span>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <div
        class="ai-sidebar__input-container"
        bind:this={inputContainer}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
    >
        <!-- 模式选择 -->
        <div class="ai-sidebar__mode-selector">
            <label for="chat-mode-select" class="ai-sidebar__mode-label">
                {t('aiSidebar.mode.label')}:
            </label>
            <select
                id="chat-mode-select"
                class="b3-select ai-sidebar__mode-select"
                bind:value={chatMode}
            >
                <option value="ask">{t('aiSidebar.mode.ask')}</option>
                <option value="edit">{t('aiSidebar.mode.edit')}</option>
            </select>

            <!-- 自动批准复选框（仅在编辑模式下显示） -->
            {#if chatMode === 'edit'}
                <label class="ai-sidebar__auto-approve-label">
                    <input type="checkbox" class="b3-switch" bind:checked={autoApproveEdit} />
                    <span>{t('aiSidebar.mode.autoApprove')}</span>
                </label>
            {/if}
        </div>

        <div class="ai-sidebar__input-row">
            <div class="ai-sidebar__input-wrapper">
                <textarea
                    bind:this={textareaElement}
                    bind:value={currentInput}
                    on:keydown={handleKeydown}
                    on:paste={handlePaste}
                    placeholder={t('aiSidebar.input.placeholder')}
                    class="ai-sidebar__input"
                    disabled={isLoading}
                    rows="1"
                ></textarea>
                <button
                    class="b3-button ai-sidebar__send-btn"
                    class:b3-button--primary={!isLoading}
                    class:ai-sidebar__send-btn--abort={isLoading}
                    on:click={isLoading ? abortMessage : sendMessage}
                    disabled={!isLoading && !currentInput.trim() && currentAttachments.length === 0}
                    title={isLoading ? '中断生成' : '发送消息'}
                >
                    {#if isLoading}
                        <svg class="b3-button__icon">
                            <use xlink:href="#iconPause"></use>
                        </svg>
                    {:else}
                        <svg class="b3-button__icon"><use xlink:href="#iconUp"></use></svg>
                    {/if}
                </button>
            </div>
        </div>

        <!-- 隐藏的文件上传 input -->
        <input
            type="file"
            bind:this={fileInputElement}
            on:change={handleFileSelect}
            accept="image/*,.txt,.md,.json,.xml,.csv,text/*"
            multiple
            style="display: none;"
        />
        <div class="ai-sidebar__bottom-row">
            <button
                class="b3-button b3-button--text ai-sidebar__upload-btn"
                on:click={triggerFileUpload}
                disabled={isUploadingFile || isLoading}
                title={t('aiSidebar.actions.upload')}
            >
                {#if isUploadingFile}
                    <svg class="b3-button__icon ai-sidebar__loading-icon">
                        <use xlink:href="#iconRefresh"></use>
                    </svg>
                {:else}
                    <svg class="b3-button__icon"><use xlink:href="#iconUpload"></use></svg>
                {/if}
            </button>
            <button
                class="b3-button b3-button--text ai-sidebar__search-btn"
                on:click={() => {
                    isSearchDialogOpen = !isSearchDialogOpen;
                    // 打开对话框时，如果搜索关键词为空，自动加载当前文档
                    if (isSearchDialogOpen && !searchKeyword.trim()) {
                        searchDocuments();
                    }
                }}
                title={t('aiSidebar.actions.search')}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconSearch"></use></svg>
            </button>
            <div class="ai-sidebar__prompt-actions">
                <button
                    class="b3-button b3-button--text"
                    on:click={() => (isPromptSelectorOpen = !isPromptSelectorOpen)}
                    title={t('aiSidebar.prompt.title')}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconList"></use></svg>
                </button>
            </div>
            <div class="ai-sidebar__model-selector-container">
                <ModelSelector
                    {providers}
                    {currentProvider}
                    {currentModelId}
                    on:select={handleModelSelect}
                />
            </div>
        </div>

        <!-- 提示词选择器下拉菜单 -->
        {#if isPromptSelectorOpen}
            <div class="ai-sidebar__prompt-selector">
                <div class="ai-sidebar__prompt-list">
                    <!-- 新建提示词按钮 -->
                    <button
                        class="ai-sidebar__prompt-item ai-sidebar__prompt-item--new"
                        on:click={openPromptManager}
                    >
                        <svg class="ai-sidebar__prompt-item-icon">
                            <use xlink:href="#iconAdd"></use>
                        </svg>
                        <span class="ai-sidebar__prompt-item-title">
                            {t('aiSidebar.prompt.new')}
                        </span>
                    </button>

                    {#if prompts.length > 0}
                        <div class="ai-sidebar__prompt-divider-small"></div>
                        {#each prompts as prompt (prompt.id)}
                            <button
                                class="ai-sidebar__prompt-item"
                                on:click={() => usePrompt(prompt)}
                                title={prompt.content}
                            >
                                <span class="ai-sidebar__prompt-item-title">{prompt.title}</span>
                                <button
                                    class="ai-sidebar__prompt-item-edit"
                                    on:click|stopPropagation={() => editPrompt(prompt)}
                                    title="编辑"
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconEdit"></use>
                                    </svg>
                                </button>
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    <!-- 提示词管理对话框 -->
    {#if isPromptManagerOpen}
        <div class="ai-sidebar__prompt-dialog">
            <div class="ai-sidebar__prompt-dialog-overlay" on:click={closePromptManager}></div>
            <div class="ai-sidebar__prompt-dialog-content">
                <div class="ai-sidebar__prompt-dialog-header">
                    <h4>
                        {editingPrompt ? t('aiSidebar.prompt.edit') : t('aiSidebar.prompt.create')}
                    </h4>
                    <button class="b3-button b3-button--text" on:click={closePromptManager}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__prompt-dialog-body">
                    <div class="ai-sidebar__prompt-form">
                        <div class="ai-sidebar__prompt-form-field">
                            <label class="ai-sidebar__prompt-form-label">标题</label>
                            <input
                                type="text"
                                bind:value={newPromptTitle}
                                placeholder={t('aiSidebar.prompt.titlePlaceholder')}
                                class="b3-text-field"
                            />
                        </div>
                        <div class="ai-sidebar__prompt-form-field">
                            <label class="ai-sidebar__prompt-form-label">内容</label>
                            <textarea
                                bind:value={newPromptContent}
                                placeholder="输入提示词内容"
                                class="b3-text-field ai-sidebar__prompt-textarea"
                                rows="6"
                            ></textarea>
                        </div>
                        <div class="ai-sidebar__prompt-form-actions">
                            <button
                                class="b3-button b3-button--cancel"
                                on:click={closePromptManager}
                            >
                                取消
                            </button>
                            <button class="b3-button b3-button--primary" on:click={saveNewPrompt}>
                                {editingPrompt ? '更新' : '保存'}
                            </button>
                        </div>
                    </div>

                    {#if prompts.length > 0}
                        <div class="ai-sidebar__prompt-divider"></div>
                        <div class="ai-sidebar__prompt-saved-list">
                            <h5 class="ai-sidebar__prompt-saved-title">已保存的提示词</h5>
                            <div class="ai-sidebar__prompt-saved-items">
                                {#each prompts as prompt (prompt.id)}
                                    <div class="ai-sidebar__prompt-saved-item">
                                        <div class="ai-sidebar__prompt-saved-info">
                                            <div class="ai-sidebar__prompt-saved-item-title">
                                                {prompt.title}
                                            </div>
                                            <div class="ai-sidebar__prompt-saved-item-content">
                                                {prompt.content.length > 100
                                                    ? prompt.content.substring(0, 100) + '...'
                                                    : prompt.content}
                                            </div>
                                        </div>
                                        <div class="ai-sidebar__prompt-saved-actions">
                                            <button
                                                class="b3-button b3-button--text"
                                                on:click={() => editPrompt(prompt)}
                                                title="编辑"
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconEdit"></use>
                                                </svg>
                                            </button>
                                            <button
                                                class="b3-button b3-button--text"
                                                on:click={() => deletePrompt(prompt.id)}
                                                title="删除"
                                            >
                                                <svg class="b3-button__icon">
                                                    <use xlink:href="#iconTrashcan"></use>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

    <!-- 搜索对话框 -->
    {#if isSearchDialogOpen}
        <div class="ai-sidebar__search-dialog">
            <div
                class="ai-sidebar__search-dialog-overlay"
                on:click={() => (isSearchDialogOpen = false)}
            ></div>
            <div class="ai-sidebar__search-dialog-content">
                <div class="ai-sidebar__search-dialog-header">
                    <h4>{t('aiSidebar.search.title')}</h4>
                    <button
                        class="b3-button b3-button--text"
                        on:click={() => (isSearchDialogOpen = false)}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__search-dialog-body">
                    <div class="ai-sidebar__search-input-row">
                        <input
                            type="text"
                            bind:value={searchKeyword}
                            on:input={autoSearch}
                            on:paste={autoSearch}
                            placeholder={t('aiSidebar.search.placeholder')}
                            class="b3-text-field"
                        />
                        {#if isSearching}
                            <div class="ai-sidebar__search-loading">
                                <svg class="b3-button__icon ai-sidebar__loading-icon">
                                    <use xlink:href="#iconRefresh"></use>
                                </svg>
                            </div>
                        {/if}
                    </div>
                    <div class="ai-sidebar__search-results">
                        {#if searchResults.length > 0}
                            {#each searchResults as result (result.id)}
                                <div class="ai-sidebar__search-result-item">
                                    <div class="ai-sidebar__search-result-title">
                                        {result.content || t('common.untitled')}
                                        {#if !searchKeyword.trim()}
                                            <span class="ai-sidebar__search-current-doc-badge">
                                                {t('aiSidebar.search.currentDoc')}
                                            </span>
                                        {/if}
                                    </div>
                                    <button
                                        class="b3-button b3-button--text"
                                        on:click={() =>
                                            addDocumentToContext(
                                                result.id,
                                                result.content || t('common.untitled')
                                            )}
                                    >
                                        {t('aiSidebar.search.add')}
                                    </button>
                                </div>
                            {/each}
                        {:else if !isSearching && searchKeyword}
                            <div class="ai-sidebar__search-empty">
                                {t('aiSidebar.search.noResults')}
                            </div>
                        {:else if !isSearching && !searchKeyword}
                            <div class="ai-sidebar__search-empty">
                                {t('aiSidebar.search.noCurrentDoc')}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- 编辑消息弹窗 -->
    {#if isEditDialogOpen}
        <div class="ai-sidebar__edit-dialog">
            <div class="ai-sidebar__edit-dialog-overlay" on:click={cancelEditMessage}></div>
            <div class="ai-sidebar__edit-dialog-content">
                <div class="ai-sidebar__edit-dialog-header">
                    <h3>{t('aiSidebar.actions.editMessage')}</h3>
                    <button class="b3-button b3-button--cancel" on:click={cancelEditMessage}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__edit-dialog-body">
                    <textarea
                        class="ai-sidebar__edit-dialog-textarea"
                        bind:value={editingMessageContent}
                        rows="15"
                        autofocus
                    ></textarea>
                </div>
                <div class="ai-sidebar__edit-dialog-footer">
                    <button class="b3-button b3-button--cancel" on:click={cancelEditMessage}>
                        {t('aiSidebar.actions.cancel')}
                    </button>
                    <button class="b3-button b3-button--text" on:click={saveEditMessage}>
                        {t('aiSidebar.actions.save')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- 差异对比对话框 -->
    {#if isDiffDialogOpen && currentDiffOperation}
        <div class="ai-sidebar__diff-dialog">
            <div class="ai-sidebar__diff-dialog-overlay" on:click={closeDiffDialog}></div>
            <div class="ai-sidebar__diff-dialog-content">
                <div class="ai-sidebar__diff-dialog-header">
                    <h3>
                        {#if currentDiffOperation.operationType === 'insert'}
                            {t('aiSidebar.edit.insertBlock')} - {t('aiSidebar.actions.viewDiff')}
                        {:else}
                            {t('aiSidebar.actions.viewDiff')}
                        {/if}
                    </h3>
                    {#if currentDiffOperation.operationType !== 'insert'}
                        <div class="ai-sidebar__diff-mode-selector">
                            <button
                                class="b3-button b3-button--text"
                                class:b3-button--primary={diffViewMode === 'diff'}
                                on:click={() => (diffViewMode = 'diff')}
                            >
                                {t('aiSidebar.diff.modeUnified')}
                            </button>
                            <button
                                class="b3-button b3-button--text"
                                class:b3-button--primary={diffViewMode === 'split'}
                                on:click={() => (diffViewMode = 'split')}
                            >
                                {t('aiSidebar.diff.modeSplit')}
                            </button>
                        </div>
                    {/if}
                    <button class="b3-button b3-button--cancel" on:click={closeDiffDialog}>
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
                <div class="ai-sidebar__diff-dialog-body">
                    <div class="ai-sidebar__diff-info">
                        {#if currentDiffOperation.operationType === 'insert'}
                            <strong>{t('aiSidebar.edit.insertBlock')}:</strong>
                            {currentDiffOperation.position === 'before'
                                ? t('aiSidebar.edit.before')
                                : t('aiSidebar.edit.after')}
                            {currentDiffOperation.blockId}
                        {:else}
                            <strong>{t('aiSidebar.edit.blockId')}:</strong>
                            {currentDiffOperation.blockId}
                        {/if}
                    </div>
                    {#if currentDiffOperation.operationType === 'insert'}
                        <!-- 插入操作：只显示新内容 -->
                        <div class="ai-sidebar__diff-content">
                            <div
                                class="ai-sidebar__diff-split-header"
                                style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;"
                            >
                                <span>{t('aiSidebar.edit.insertContent')}</span>
                                <button
                                    class="b3-button b3-button--text b3-button--small"
                                    on:click={() => {
                                        navigator.clipboard.writeText(
                                            currentDiffOperation.newContent
                                        );
                                        pushMsg(t('aiSidebar.success.copySuccess'));
                                    }}
                                    title={t('aiSidebar.actions.copyNewContent')}
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconCopy"></use>
                                    </svg>
                                    {t('aiSidebar.actions.copy')}
                                </button>
                            </div>
                            <pre
                                class="ai-sidebar__diff-split-content"
                                style="border: 1px solid var(--b3-theme-success); background-color: var(--b3-theme-success-lighter);">{currentDiffOperation.newContent}</pre>
                        </div>
                    {:else if currentDiffOperation.oldContent}
                        {#if diffViewMode === 'diff'}
                            <!-- Diff模式：传统的行对比视图 -->
                            <div class="ai-sidebar__diff-actions">
                                <button
                                    class="b3-button b3-button--text b3-button--small"
                                    on:click={() => {
                                        navigator.clipboard.writeText(
                                            currentDiffOperation.oldContent
                                        );
                                        pushMsg(t('aiSidebar.success.copySuccess'));
                                    }}
                                    title={t('aiSidebar.actions.copyOldContent')}
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconCopy"></use>
                                    </svg>
                                    {t('aiSidebar.actions.copyBefore')}
                                </button>
                                <button
                                    class="b3-button b3-button--text b3-button--small"
                                    on:click={() => {
                                        navigator.clipboard.writeText(
                                            currentDiffOperation.newContent
                                        );
                                        pushMsg(t('aiSidebar.success.copySuccess'));
                                    }}
                                    title={t('aiSidebar.actions.copyNewContent')}
                                >
                                    <svg class="b3-button__icon">
                                        <use xlink:href="#iconCopy"></use>
                                    </svg>
                                    {t('aiSidebar.actions.copyAfter')}
                                </button>
                            </div>
                            <div class="ai-sidebar__diff-content">
                                {#each generateSimpleDiff(currentDiffOperation.oldContent, currentDiffOperation.newContent) as line}
                                    <div
                                        class="ai-sidebar__diff-line ai-sidebar__diff-line--{line.type}"
                                    >
                                        {#if line.type === 'removed'}
                                            <span class="ai-sidebar__diff-marker">-</span>
                                        {:else if line.type === 'added'}
                                            <span class="ai-sidebar__diff-marker">+</span>
                                        {:else}
                                            <span class="ai-sidebar__diff-marker"></span>
                                        {/if}
                                        <span class="ai-sidebar__diff-text">{line.line}</span>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <!-- Split模式：左右分栏视图 -->
                            <div class="ai-sidebar__diff-split">
                                <div class="ai-sidebar__diff-split-column">
                                    <div class="ai-sidebar__diff-split-header">
                                        <span>{t('aiSidebar.edit.before')}</span>
                                        <button
                                            class="b3-button b3-button--text b3-button--small"
                                            on:click={() => {
                                                navigator.clipboard.writeText(
                                                    currentDiffOperation.oldContent
                                                );
                                                pushMsg(t('aiSidebar.success.copySuccess'));
                                            }}
                                            title={t('aiSidebar.actions.copyOldContent')}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconCopy"></use>
                                            </svg>
                                        </button>
                                    </div>
                                    <pre
                                        class="ai-sidebar__diff-split-content">{currentDiffOperation.oldContent}</pre>
                                </div>
                                <div class="ai-sidebar__diff-split-column">
                                    <div class="ai-sidebar__diff-split-header">
                                        <span>{t('aiSidebar.edit.after')}</span>
                                        <button
                                            class="b3-button b3-button--text b3-button--small"
                                            on:click={() => {
                                                navigator.clipboard.writeText(
                                                    currentDiffOperation.newContent
                                                );
                                                pushMsg(t('aiSidebar.success.copySuccess'));
                                            }}
                                            title={t('aiSidebar.actions.copyNewContent')}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconCopy"></use>
                                            </svg>
                                        </button>
                                    </div>
                                    <pre
                                        class="ai-sidebar__diff-split-content">{currentDiffOperation.newContent}</pre>
                                </div>
                            </div>
                        {/if}
                    {:else}
                        <div class="ai-sidebar__diff-loading">
                            {t('common.loading')}
                        </div>
                    {/if}
                </div>
                <div class="ai-sidebar__diff-dialog-footer">
                    <button class="b3-button b3-button--cancel" on:click={closeDiffDialog}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .ai-sidebar {
        display: flex;
        flex-direction: column;
        height: 100%;
        background-color: var(--b3-theme-background);
        overflow: hidden;
    }

    .ai-sidebar__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--b3-border-color);
        flex-shrink: 0;
    }

    .ai-sidebar__title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ai-sidebar__unsaved {
        color: var(--b3-theme-primary);
        font-size: 12px;
        animation: pulse 2s ease-in-out infinite;
    }

    .ai-sidebar__actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .ai-sidebar__context-docs {
        padding: 8px 12px;
        background: var(--b3-theme-surface);
        border-top: 1px solid var(--b3-border-color);
        flex-shrink: 0;
    }

    .ai-sidebar__context-docs-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: 8px;
    }

    .ai-sidebar__context-docs-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .ai-sidebar__context-doc-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--b3-theme-background);
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
    }

    .ai-sidebar__context-doc-remove {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        background: none;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;

        &:hover {
            background: var(--b3-theme-error-lighter);
            color: var(--b3-theme-error);
        }
    }

    .ai-sidebar__context-doc-link {
        flex: 1;
        text-align: left;
        padding: 0;
        border: none;
        background: none;
        color: var(--b3-theme-primary);
        cursor: pointer;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &:hover {
            text-decoration: underline;
        }
    }

    .ai-sidebar__context-doc-name {
        flex: 1;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .ai-sidebar__context-attachment-preview {
        width: 24px;
        height: 24px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
        border: 1px solid var(--b3-border-color);
    }

    .ai-sidebar__context-attachment-icon {
        width: 16px;
        height: 16px;
        color: var(--b3-theme-on-surface-light);
        flex-shrink: 0;
    }

    .ai-sidebar__messages {
        flex: 1;
        position: relative;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: background-color 0.2s;

        &.ai-sidebar__messages--drag-over {
            background: var(--b3-theme-primary-lightest);
            border: 2px dashed var(--b3-theme-primary);
        }
    }

    .ai-sidebar__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    .ai-sidebar__empty-icon {
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    .ai-sidebar__empty-hint {
        font-size: 12px;
        margin-top: 8px;
    }

    .ai-message {
        display: flex;
        flex-direction: column;
        gap: 8px;
        animation: fadeIn 0.3s ease-in;
        cursor: context-menu;

        &:hover {
            .ai-message__content {
                box-shadow: 0 0 0 1px var(--b3-border-color);
            }
        }
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .ai-message__header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
    }

    .ai-message__role {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .ai-message__actions {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 8px;
        opacity: 0;
        transition: opacity 0.2s;
    }

    .ai-message:hover .ai-message__actions {
        opacity: 1;
    }

    .ai-message__action {
        flex-shrink: 0;
    }

    .ai-message__streaming-indicator {
        color: var(--b3-theme-primary);
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.3;
        }
    }

    // 思考过程样式
    .ai-message__thinking {
        margin-bottom: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        overflow: hidden;
        background: var(--b3-theme-surface);
    }

    .ai-message__thinking-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        cursor: pointer;
        user-select: none;
        background: var(--b3-theme-surface);
        transition: background 0.2s;

        &:hover {
            background: var(--b3-theme-background);
        }
    }

    .ai-message__thinking-icon {
        width: 14px;
        height: 14px;
        color: var(--b3-theme-on-surface-light);
        transition: transform 0.2s;
        transform: rotate(90deg);

        &.collapsed {
            transform: rotate(0deg);
        }
    }

    .ai-message__thinking-title {
        font-size: 12px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }

    .ai-message__thinking-content {
        padding: 12px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        font-size: 13px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.6;
        max-height: 400px;
        overflow-y: auto;

        &.ai-message__thinking-content--streaming {
            animation: fadeIn 0.3s ease-out;
        }
    }

    .ai-message__content {
        padding: 10px 12px;
        border-radius: 8px;
        line-height: 1.6;
        word-wrap: break-word;
        overflow-x: auto;

        // 使用protyle-wysiwyg样式，支持思源的富文本渲染
        &.protyle-wysiwyg {
            // 重置一些可能冲突的样式
            :global(p) {
                margin: 0.5em 0;

                &:first-child {
                    margin-top: 0;
                }

                &:last-child {
                    margin-bottom: 0;
                }
            }

            // 思源代码块样式: div.hljs
            :global(div.hljs) {
                margin: 8px 0;
                border-radius: 6px;
                background: var(--b3-theme-surface);
                overflow: hidden;

                // contenteditable 内的代码
                :global(> div[contenteditable]) {
                    padding: 12px;
                    overflow-x: auto;
                    font-family: var(--b3-font-family-code);
                    font-size: 0.9em;
                    line-height: 1.5;
                    white-space: pre;
                    color: var(--b3-theme-on-surface);

                    // 禁用编辑（因为这是只读显示）
                    pointer-events: none;
                    user-select: text;

                    // hljs 语法高亮的颜色会自动应用
                    // 确保高亮类正确显示
                    :global(.hljs-keyword),
                    :global(.hljs-selector-tag),
                    :global(.hljs-literal),
                    :global(.hljs-section),
                    :global(.hljs-link) {
                        font-weight: normal;
                    }
                }
            }

            // 标准代码块样式（后备）
            :global(.code-block) {
                margin: 8px 0;
                border-radius: 6px;
                overflow: hidden;
            }

            :global(pre) {
                margin: 8px 0;
                border-radius: 6px;
                overflow-x: auto;
                background: var(--b3-theme-surface);
                padding: 12px;

                :global(code) {
                    font-family: var(--b3-font-family-code);
                    font-size: 0.9em;
                    line-height: 1.5;
                }
            }

            // 行内代码样式
            :global(code:not(pre code):not(div.hljs code)) {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 0.9em;
                background: var(--b3-theme-surface);
                font-family: var(--b3-font-family-code);
            }

            // 数学公式样式
            :global(.katex-display) {
                margin: 1em 0;
                overflow-x: auto;
            }

            :global(.katex) {
                font-size: 1em;
            }

            // 确保 katex-display 内部的 katex-html 显示为块级元素
            :global(.katex-display > .katex > .katex-html) {
                display: block !important;
            }

            // 列表样式
            :global(ul),
            :global(ol) {
                margin: 0.5em 0;
                padding-left: 2em;
            }

            // 标题样式
            :global(h1),
            :global(h2),
            :global(h3),
            :global(h4),
            :global(h5),
            :global(h6) {
                margin: 0.8em 0 0.4em;
                font-weight: 600;

                &:first-child {
                    margin-top: 0;
                }
            }

            // 引用样式
            :global(blockquote) {
                margin: 0.5em 0;
                padding-left: 1em;
                border-left: 3px solid var(--b3-theme-primary);
            }

            // 表格样式
            :global(table) {
                margin: 0.5em 0;
                border-collapse: collapse;
                width: 100%;
                overflow-x: auto;
                display: block;
            }

            // 链接样式
            :global(a) {
                color: var(--b3-theme-primary);
                text-decoration: none;

                &:hover {
                    text-decoration: underline;
                }
            }

            // 图片样式
            :global(img) {
                max-width: 100%;
                height: auto;
            }

            // 分割线
            :global(hr) {
                margin: 1em 0;
                border: none;
                border-top: 1px solid var(--b3-border-color);
            }
        }
    }

    .ai-message--user {
        .ai-message__header {
            justify-content: flex-end;
        }

        .ai-message__content {
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-on-background);
            margin-left: auto;
            max-width: 85%;
        }

        .ai-message__actions {
            justify-content: flex-end;
        }
    }

    .ai-message--assistant {
        .ai-message__header {
            justify-content: flex-start;
        }

        .ai-message__content {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-on-surface);
            max-width: 90%;
        }

        .ai-message__actions {
            justify-content: flex-start;
        }
    }

    .ai-sidebar__input-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 12px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        flex-shrink: 0;
        position: relative;
        transition: background-color 0.2s;
    }

    .ai-sidebar__mode-selector {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
    }

    .ai-sidebar__mode-label {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        font-weight: 500;
        flex-shrink: 0;
    }

    .ai-sidebar__mode-select {
        flex: 0 0 auto;
        min-width: 120px;
        font-size: 13px;
    }

    .ai-sidebar__input-row {
        display: flex;
        gap: 0;
    }

    .ai-sidebar__input-wrapper {
        flex: 1;
        position: relative;
        display: flex;
        align-items: flex-end;
        border: 1px solid var(--b3-border-color);
        border-radius: 12px;
        background: var(--b3-theme-background);
        transition: border-color 0.2s;

        &:focus-within {
            border-color: var(--b3-theme-primary);
        }

        &:hover {
            border-color: var(--b3-theme-primary-light);
        }
    }

    .ai-sidebar__input {
        flex: 1;
        resize: none;
        border: none;
        border-radius: 12px;
        padding: 12px 16px;
        padding-right: 48px; /* 为发送按钮留出空间 */
        font-family: var(--b3-font-family);
        font-size: 14px;
        line-height: 1.5;
        background: transparent;
        color: var(--b3-theme-on-background);
        min-height: 44px;
        max-height: 200px;
        overflow-y: auto;

        &:focus {
            outline: none;
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        &::placeholder {
            color: var(--b3-theme-on-surface-light);
        }
    }

    .ai-sidebar__bottom-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;
    }

    .ai-sidebar__upload-btn,
    .ai-sidebar__search-btn {
        flex-shrink: 0;
    }

    .ai-sidebar__prompt-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .ai-sidebar__model-selector-container {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        /* 保证在 flex 布局中可以缩小，避免在窄宽度下溢出 */
        min-width: 0;
        max-width: 100%;

        /* 只对模型选择器按钮内的文本应用省略处理，避免影响弹窗显示 */
        :global(.model-selector__button) {
            min-width: 0;
            max-width: 100%;
        }

        :global(.model-selector__current) {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    // 消息附件样式
    .ai-message__attachments {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 8px;
    }

    .ai-message__attachment {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: 200px;
    }

    .ai-message__attachment-image {
        width: 100%;
        max-height: 150px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
    }

    .ai-message__attachment-file {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }

    .ai-message__attachment-icon {
        width: 20px;
        height: 20px;
        color: var(--b3-theme-on-surface-light);
        flex-shrink: 0;
    }

    .ai-message__attachment-name {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    // 消息编辑样式
    .ai-message__edit {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 0;
    }

    .ai-message__edit-textarea {
        width: 100%;
        min-height: 100px;
        padding: 10px 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-family: var(--b3-font-family);
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;

        &:focus {
            outline: none;
            border-color: var(--b3-theme-primary);
        }
    }

    .ai-message__edit-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    // 提示词选择器样式
    .ai-sidebar__prompt-selector {
        position: absolute;
        bottom: 100%;
        left: 0;
        right: 0;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 8px;
        z-index: 100;
    }

    .ai-sidebar__prompt-list {
        padding: 4px;
    }

    .ai-sidebar__prompt-item {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
        padding: 8px 12px;
        border: none;
        background: none;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.2s;
        font-size: 14px;
        position: relative;

        &:hover {
            background: var(--b3-theme-primary-lightest);

            .ai-sidebar__prompt-item-edit {
                opacity: 1;
            }
        }
    }

    .ai-sidebar__prompt-item--new {
        font-weight: 600;
        color: var(--b3-theme-primary);

        &:hover {
            background: var(--b3-theme-primary-lighter);
        }
    }

    .ai-sidebar__prompt-item-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }

    .ai-sidebar__prompt-item-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .ai-sidebar__prompt-item-edit {
        opacity: 0;
        padding: 4px;
        border: none;
        background: none;
        color: var(--b3-theme-on-surface-light);
        cursor: pointer;
        border-radius: 4px;
        transition:
            opacity 0.2s,
            background-color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &:hover {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-primary);
        }

        .b3-button__icon {
            width: 14px;
            height: 14px;
        }
    }

    .ai-sidebar__prompt-divider-small {
        height: 1px;
        background: var(--b3-border-color);
        margin: 4px 0;
    }

    .ai-sidebar__prompt-empty {
        padding: 16px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .ai-sidebar__send-btn {
        position: absolute;
        right: 6px;
        bottom: 6px;
        width: 36px;
        height: 36px;
        min-width: 36px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: all 0.2s ease;

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        &:not(:disabled):hover {
            transform: scale(1.05);
        }

        &.ai-sidebar__send-btn--abort {
            background-color: #ef4444;
            color: white;

            &:hover {
                background-color: #dc2626;
            }
        }

        .b3-button__icon {
            width: 18px;
            height: 18px;
        }
    }

    .ai-sidebar__loading-icon {
        animation: rotate 1s linear infinite;
    }

    @keyframes rotate {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    // 提示词管理对话框样式
    .ai-sidebar__prompt-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ai-sidebar__prompt-dialog-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
    }

    .ai-sidebar__prompt-dialog-content {
        position: relative;
        width: 90%;
        max-width: 600px;
        background: var(--b3-theme-background);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        max-height: 80vh;
    }

    .ai-sidebar__prompt-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }
    }

    .ai-sidebar__prompt-dialog-body {
        padding: 16px;
        overflow-y: auto;
    }

    .ai-sidebar__prompt-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .ai-sidebar__prompt-form-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .ai-sidebar__prompt-form-label {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
    }

    .ai-sidebar__prompt-textarea {
        min-height: 120px;
        resize: vertical;
        font-family: var(--b3-font-family);
    }

    .ai-sidebar__prompt-form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .ai-sidebar__prompt-divider {
        margin: 24px 0;
        border-top: 1px solid var(--b3-border-color);
    }

    .ai-sidebar__prompt-saved-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .ai-sidebar__prompt-saved-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
    }

    .ai-sidebar__prompt-saved-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .ai-sidebar__prompt-saved-item {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);

        &:hover {
            background: var(--b3-theme-primary-lightest);
        }
    }

    .ai-sidebar__prompt-saved-info {
        flex: 1;
        min-width: 0;
    }

    .ai-sidebar__prompt-saved-item-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .ai-sidebar__prompt-saved-item-content {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
        word-break: break-word;
    }

    .ai-sidebar__prompt-saved-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    // 搜索对话框样式
    .ai-sidebar__search-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ai-sidebar__search-dialog-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
    }

    .ai-sidebar__search-dialog-content {
        position: relative;
        width: 90%;
        max-width: 500px;
        background: var(--b3-theme-background);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        max-height: 80vh;
    }

    .ai-sidebar__search-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }
    }

    .ai-sidebar__search-dialog-body {
        padding: 16px;
        overflow-y: auto;
    }

    .ai-sidebar__search-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;

        input {
            flex: 1;
        }
    }

    .ai-sidebar__search-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        color: var(--b3-theme-primary);
    }

    .ai-sidebar__search-results {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
    }

    .ai-sidebar__search-result-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);

        &:hover {
            background: var(--b3-theme-primary-lightest);
        }
    }

    .ai-sidebar__search-result-title {
        flex: 1;
        font-size: 14px;
        color: var(--b3-theme-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ai-sidebar__search-current-doc-badge {
        display: inline-block;
        padding: 2px 8px;
        font-size: 12px;
        color: var(--b3-theme-primary);
        background: var(--b3-theme-primary-lightest);
        border-radius: 4px;
        white-space: nowrap;
        flex-shrink: 0;
    }

    .ai-sidebar__search-empty {
        text-align: center;
        padding: 32px;
        color: var(--b3-theme-on-surface-light);
    }

    // 编辑消息对话框样式
    .ai-sidebar__edit-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ai-sidebar__edit-dialog-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
    }

    .ai-sidebar__edit-dialog-content {
        position: relative;
        width: 90%;
        max-width: 700px;
        background: var(--b3-theme-background);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        max-height: 80vh;
    }

    .ai-sidebar__edit-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--b3-border-color);

        h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }

        .b3-button {
            padding: 4px;
            min-width: auto;
        }
    }

    .ai-sidebar__edit-dialog-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
    }

    .ai-sidebar__edit-dialog-textarea {
        width: 100%;
        min-height: 300px;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-family: var(--b3-font-family);
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        transition: border-color 0.2s ease;

        &:focus {
            outline: none;
            border-color: var(--b3-theme-primary);
        }
    }

    .ai-sidebar__edit-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px;
        border-top: 1px solid var(--b3-border-color);
    }

    // 编辑操作样式
    .ai-message__edit-operations {
        margin-top: 12px;
        padding: 12px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }

    .ai-message__edit-operations-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: 12px;
    }

    .ai-message__edit-operation {
        padding: 12px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        margin-bottom: 8px;

        &:last-child {
            margin-bottom: 0;
        }

        &--applied {
            border-color: var(--b3-theme-success);
            background: var(--b3-theme-success-lightest);
        }

        &--rejected {
            border-color: var(--b3-theme-error);
            background: var(--b3-theme-error-lightest);
            opacity: 0.7;
        }
    }

    .ai-message__edit-operation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
    }

    .ai-message__edit-operation-id {
        color: var(--b3-theme-on-surface);
        font-family: var(--b3-font-family-code);
    }

    .ai-message__edit-operation-status {
        font-weight: 600;

        .ai-message__edit-operation--applied & {
            color: var(--b3-theme-success);
        }

        .ai-message__edit-operation--rejected & {
            color: var(--b3-theme-error);
        }
    }

    .ai-message__edit-operation-actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    // 差异对比对话框样式
    .ai-sidebar__diff-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ai-sidebar__diff-dialog-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
    }

    .ai-sidebar__diff-dialog-content {
        position: relative;
        width: 90%;
        max-width: 900px;
        background: var(--b3-theme-background);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        max-height: 80vh;
    }

    .ai-sidebar__diff-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--b3-border-color);
        gap: 12px;

        h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }

        .b3-button {
            padding: 4px;
            min-width: auto;
        }
    }

    .ai-sidebar__diff-mode-selector {
        display: flex;
        gap: 4px;

        .b3-button {
            padding: 4px 12px;
            font-size: 12px;
        }
    }

    .ai-sidebar__diff-dialog-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
    }

    .ai-sidebar__diff-info {
        padding: 12px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 13px;

        strong {
            color: var(--b3-theme-on-surface);
        }
    }

    .ai-sidebar__diff-content {
        font-family: var(--b3-font-family-code);
        font-size: 13px;
        line-height: 1.6;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
        overflow: auto;
    }

    .ai-sidebar__diff-line {
        display: flex;
        padding: 2px 12px;
        min-height: 24px;

        &--removed {
            background: rgba(255, 0, 0, 0.1);
            color: var(--b3-theme-error);
        }

        &--added {
            background: rgba(0, 255, 0, 0.1);
            color: var(--b3-theme-success);
        }

        &--unchanged {
            color: var(--b3-theme-on-surface);
        }
    }

    .ai-sidebar__diff-marker {
        display: inline-block;
        width: 20px;
        flex-shrink: 0;
        font-weight: 600;
    }

    .ai-sidebar__diff-text {
        flex: 1;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .ai-sidebar__diff-loading {
        text-align: center;
        padding: 32px;
        color: var(--b3-theme-on-surface-light);
    }

    .ai-sidebar__diff-split {
        display: flex;
        gap: 12px;
        height: 100%;
        min-height: 400px;
    }

    .ai-sidebar__diff-split-column {
        flex: 1;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        background: var(--b3-theme-surface);
        overflow: hidden;
    }

    .ai-sidebar__diff-split-header {
        padding: 8px 12px;
        background: var(--b3-theme-surface-light);
        border-bottom: 1px solid var(--b3-border-color);
        font-weight: 600;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .ai-sidebar__diff-split-content {
        flex: 1;
        margin: 0;
        padding: 12px;
        overflow: auto;
        font-family: var(--b3-font-family-code);
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--b3-theme-on-surface);
    }

    .ai-sidebar__diff-dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px;
        border-top: 1px solid var(--b3-border-color);
    }

    // 响应式布局
    @media (max-width: 768px) {
        .ai-sidebar__header {
            padding: 6px 10px;
        }

        .ai-sidebar__title {
            font-size: 14px;
        }

        .ai-sidebar__messages {
            padding: 10px;
            gap: 10px;
        }

        .ai-message--user .ai-message__content {
            max-width: 90%;
        }

        .ai-message--assistant .ai-message__content {
            max-width: 95%;
        }

        .ai-sidebar__input-container {
            padding: 6px 10px;
        }

        .ai-sidebar__input {
            padding: 10px 14px;
            padding-right: 46px;
        }

        .ai-sidebar__send-btn {
            width: 32px;
            height: 32px;
            min-width: 32px;

            .b3-button__icon {
                width: 16px;
                height: 16px;
            }
        }
    }

    @media (max-width: 480px) {
        .ai-sidebar__token-count {
            font-size: 10px;
            padding: 2px 6px;
        }

        .ai-message__content {
            font-size: 13px;
            padding: 8px 10px;
        }

        .ai-sidebar__input {
            font-size: 13px;
            padding: 8px 12px;
            padding-right: 42px;
        }

        .ai-sidebar__send-btn {
            width: 30px;
            height: 30px;
            min-width: 30px;
            right: 5px;
            bottom: 5px;

            .b3-button__icon {
                width: 14px;
                height: 14px;
            }
        }
    }
</style>
