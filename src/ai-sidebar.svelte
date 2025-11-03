<script lang="ts">
    import { onMount, tick, onDestroy } from 'svelte';
    import { chat, type Message, type MessageAttachment } from './ai-chat';
    import type { MessageContent } from './ai-chat';
    import { pushMsg, pushErrMsg, sql, exportMdContent, openBlock } from './api';
    import ModelSelector from './components/ModelSelector.svelte';
    import SessionManager from './components/SessionManager.svelte';
    import type { ProviderConfig } from './defaultSettings';
    import { settingsStore } from './stores/settings';
    import { confirm, Constants } from 'siyuan';

    export let plugin: any;

    interface ChatSession {
        id: string;
        title: string;
        messages: Message[];
        createdAt: number;
        updatedAt: number;
    }

    interface ContextDocument {
        id: string;
        title: string;
        content: string;
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
    // 是否允许自动滚动到底部（当用户手动向上滚动时禁用）
    let shouldAutoScroll = true;
    const AUTO_SCROLL_THRESHOLD = 50; // px，距离底部小于则自动滚动

    // 思考过程折叠状态管理
    let thinkingCollapsed: Record<number, boolean> = {};

    // 附件管理
    let currentAttachments: MessageAttachment[] = [];
    let isUploadingFile = false;

    // 中断控制
    let abortController: AbortController | null = null;

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

        // 加载历史会话
        await loadSessions();

        // 加载提示词
        await loadPrompts();

        // 如果有系统提示词，添加到消息列表
        if (settings.aiSystemPrompt) {
            messages = [{ role: 'system', content: settings.aiSystemPrompt }];
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

                // 更新系统提示词
                if (settings.aiSystemPrompt && messages.length === 0) {
                    messages = [{ role: 'system', content: settings.aiSystemPrompt }];
                } else if (settings.aiSystemPrompt && messages[0]?.role === 'system') {
                    messages[0].content = settings.aiSystemPrompt;
                }

                console.debug('AI Sidebar: 设置已更新');
            }
        });

        // 添加全局点击事件监听器
        document.addEventListener('click', handleClickOutside);
    });

    onDestroy(() => {
        // 取消订阅
        if (unsubscribe) {
            unsubscribe();
        }

        // 移除全局点击事件监听器
        document.removeEventListener('click', handleClickOutside);
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
            pushErrMsg('只支持图片文件');
            return;
        }

        // 检查文件大小 (最大 10MB)
        if (file.size > 10 * 1024 * 1024) {
            pushErrMsg('图片文件过大，最大支持 10MB');
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

            pushMsg(`已添加图片: ${file.name}`);
        } catch (error) {
            console.error('Add image error:', error);
            pushErrMsg('添加图片失败');
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
            pushErrMsg('只支持文本文件和图片文件');
            return;
        }

        // 检查文件大小 (文本文件最大 5MB，图片最大 10MB)
        const maxSize = isImage ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
        if (file.size > maxSize) {
            pushErrMsg(`文件过大，最大支持 ${maxSize / 1024 / 1024}MB`);
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

                pushMsg(`已添加文件: ${file.name}`);
            }
        } catch (error) {
            console.error('Add file error:', error);
            pushErrMsg('添加文件失败');
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
        pushMsg('已移除附件');
    }

    // 处理消息容器的滚动：当用户手动滚动到非底部位置时，禁用自动滚动
    function handleMessagesScroll() {
        if (!messagesContainer) return;
        const distanceToBottom =
            messagesContainer.scrollHeight -
            messagesContainer.scrollTop -
            messagesContainer.clientHeight;
        shouldAutoScroll = distanceToBottom <= AUTO_SCROLL_THRESHOLD;
    }

    // 滚动到底部。默认会尊重用户是否手动滚动（即只有在 shouldAutoScroll 为 true 时才滚动），
    // 传入 force=true 强制滚动并恢复自动滚动行为。
    async function scrollToBottom(force: boolean = false) {
        await tick();
        if (!force && !shouldAutoScroll) return;
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            // 强制或正常滚动后认为用户位于底部，允许后续自动滚动
            shouldAutoScroll = true;
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

        pushMsg(`已切换到 ${modelId}`);
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
            pushErrMsg('请先在设置中配置AI平台');
            return;
        }

        if (!providerConfig.apiKey) {
            pushErrMsg('请先在设置中配置 API Key');
            return;
        }

        const modelConfig = getCurrentModelConfig();
        if (!modelConfig) {
            pushErrMsg('请选择一个模型');
            return;
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

        await scrollToBottom();

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
                    if (contextDocuments.length > 0) {
                        const contextText = contextDocuments
                            .map(doc => `## 文档: ${doc.title}\n\n${doc.content}`)
                            .join('\n\n---\n\n');
                        textContent += `\n\n---\n\n以下是相关文档作为上下文：\n\n${contextText}`;
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
                    if (contextDocuments.length > 0) {
                        const contextText = contextDocuments
                            .map(doc => `## 文档: ${doc.title}\n\n${doc.content}`)
                            .join('\n\n---\n\n');
                        enhancedContent += `\n\n---\n\n以下是相关文档作为上下文：\n\n${contextText}`;
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
                    onComplete: (fullText: string) => {
                        const assistantMessage: Message = {
                            role: 'assistant',
                            content: fullText,
                        };

                        // 如果有思考内容，添加到消息中
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
                    },
                    onError: (error: Error) => {
                        // 如果是主动中断，不显示错误
                        if (error.message !== 'Request aborted') {
                            pushErrMsg(`AI 请求失败: ${error.message}`);
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
            // 如果是中断错误，不需要额外处理
            if ((error as Error).name !== 'AbortError') {
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
                const message: Message = {
                    role: 'assistant',
                    content: streamingMessage + '\n\n[生成已中断]',
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
            pushMsg('已中断消息生成');
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
                pushMsg('对话已复制为 Markdown');
            })
            .catch(err => {
                pushErrMsg('复制失败');
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
            confirm('清空对话', '当前会话有未保存的更改，确定要清空吗？', () => {
                doClearChat();
            });
        } else {
            doClearChat();
        }
    }

    function doClearChat() {
        messages = settings.aiSystemPrompt
            ? [{ role: 'system', content: settings.aiSystemPrompt }]
            : [];
        streamingMessage = '';
        streamingThinking = '';
        isThinkingPhase = false;
        thinkingCollapsed = {};
        currentSessionId = '';
        hasUnsavedChanges = false;
        pushMsg('对话已清空');
    }

    // 处理键盘事件
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            if (isLoading) {
                abortMessage();
            } else {
                sendMessage();
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

    function formatMessage(content: string | MessageContent[]): string {
        const textContent = getMessageText(content);
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

    // 监听消息变化，高亮代码块
    $: {
        if (messages.length > 0 || streamingMessage) {
            tick().then(() => {
                if (messagesContainer) {
                    highlightCodeBlocks(messagesContainer);
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
                pushMsg('消息已复制');
            })
            .catch(err => {
                pushErrMsg('复制失败');
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
        if (!searchKeyword.trim()) {
            searchResults = [];
            return;
        }

        isSearching = true;
        try {
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
            pushMsg('该文档已在上下文中');
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
                pushMsg(`已添加文档: ${docTitle}`);
                isSearchDialogOpen = false;
                searchKeyword = '';
                searchResults = [];
            }
        } catch (error) {
            console.error('Add document error:', error);
            pushErrMsg('添加文档失败');
        }
    }

    // 获取当前聚焦的编辑器
    function getProtyle() {
        try {
            if (document.getElementById('sidebar'))
                return (window as any).siyuan?.mobile?.editor?.protyle;
            const currDoc = (window as any).siyuan?.layout?.centerLayout?.children
                .map((item: any) =>
                    item.children.find(
                        (item: any) =>
                            item.headElement?.classList.contains('item--focus') &&
                            item.panelElement.closest('.layout__wnd--active')
                    )
                )
                .find((item: any) => item);
            return currDoc?.model?.editor?.protyle;
        } catch (e) {
            console.error(e);
            return null;
        }
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
                let docTitle = '未命名文档';

                // 如果是文档块，直接添加
                if (block.type === 'd') {
                    docTitle = block.content || '未命名文档';
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
            pushErrMsg('添加失败');
        }
    }

    // 添加块到上下文（而不是整个文档）
    async function addBlockToContext(blockId: string, blockTitle: string) {
        // 检查是否已存在
        if (contextDocuments.find(doc => doc.id === blockId)) {
            pushMsg('该内容已在上下文中');
            return;
        }

        try {
            // 获取块的Markdown内容
            const data = await exportMdContent(blockId, false, false, 2, 0, false);
            if (data && data.content) {
                // 从块内容中提取前20个字作为显示标题
                const contentPreview = data.content.replace(/\n/g, ' ').trim();
                const displayTitle =
                    contentPreview.length > 20
                        ? contentPreview.substring(0, 20) + '...'
                        : contentPreview || '块内容';

                contextDocuments = [
                    ...contextDocuments,
                    {
                        id: blockId,
                        title: displayTitle,
                        content: data.content,
                    },
                ];
                pushMsg(`已添加块内容: ${displayTitle}`);
            }
        } catch (error) {
            console.error('Add block error:', error);
            pushErrMsg('添加块失败');
        }
    }

    // 删除上下文文档
    function removeContextDocument(docId: string) {
        contextDocuments = contextDocuments.filter(doc => doc.id !== docId);
        pushMsg('已移除文档');
    }

    // 打开文档
    async function openDocument(docId: string) {
        try {
            await openBlock(docId);
        } catch (error) {
            console.error('Open document error:', error);
            pushErrMsg('打开文档失败');
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
            const ele: HTMLElement = (window as any).siyuan?.dragElement;
            if (ele && ele.innerText) {
                const blockid = ele.innerText;
                if (blockid && blockid !== '/') {
                    await addItemByBlockId(blockid, false);
                }
                const item: HTMLElement = document.querySelector(
                    `.file-tree.sy__tree li[data-node-id="${blockid}"]`
                );
                if (item) {
                    item.style.opacity = '1';
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
            pushErrMsg('保存会话失败');
        }
    }

    function generateSessionTitle(): string {
        const userMessages = messages.filter(m => m.role === 'user');
        if (userMessages.length > 0) {
            const firstMessage = getMessageText(userMessages[0].content);
            return firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        }
        return '新对话';
    }

    async function saveCurrentSession() {
        if (messages.filter(m => m.role !== 'system').length === 0) {
            pushErrMsg('当前会话为空，无需保存');
            return;
        }

        const now = Date.now();

        if (currentSessionId) {
            // 更新现有会话
            const session = sessions.find(s => s.id === currentSessionId);
            if (session) {
                session.messages = [...messages];
                session.title = generateSessionTitle();
                session.updatedAt = now;
            }
        } else {
            // 创建新会话
            const newSession: ChatSession = {
                id: `session_${now}`,
                title: generateSessionTitle(),
                messages: [...messages],
                createdAt: now,
                updatedAt: now,
            };
            sessions = [newSession, ...sessions];
            currentSessionId = newSession.id;
        }

        await saveSessions();
        hasUnsavedChanges = false;
        pushMsg('会话已保存');
    }

    async function loadSession(sessionId: string) {
        // 如果消息正在生成，先中断
        if (isLoading && abortController) {
            abortMessage();
        }

        if (hasUnsavedChanges) {
            confirm(
                '切换会话',
                '当前会话有未保存的更改，是否保存？',
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
            await scrollToBottom(true);
            pushMsg(`已加载会话: ${session.title}`);
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
        currentSessionId = '';
        hasUnsavedChanges = false;
        pushMsg('已创建新会话');
    }

    async function deleteSession(sessionId: string) {
        confirm('删除会话', '确定要删除这个会话吗？此操作无法撤销。', async () => {
            sessions = sessions.filter(s => s.id !== sessionId);
            await saveSessions();

            if (currentSessionId === sessionId) {
                doNewSession();
            }

            pushMsg('会话已删除');
        });
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
            pushErrMsg('保存提示词失败');
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
            pushErrMsg('标题和内容不能为空');
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
                pushMsg('提示词已更新');
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
            pushMsg('提示词已保存');
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
        confirm('删除提示词', '确定要删除这个提示词吗？', async () => {
            prompts = prompts.filter(p => p.id !== promptId);
            await savePrompts();
            pushMsg('提示词已删除');
        });
    }

    function usePrompt(prompt: Prompt) {
        currentInput = prompt.content;
        isPromptSelectorOpen = false;
        tick().then(() => {
            autoResizeTextarea();
            textareaElement?.focus();
        });
        pushMsg(`已使用提示词: ${prompt.title}`);
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
</script>

<div class="ai-sidebar">
    <div class="ai-sidebar__header">
        <h3 class="ai-sidebar__title">
            AI 助手
            {#if hasUnsavedChanges}
                <span class="ai-sidebar__unsaved" title="有未保存的更改">●</span>
            {/if}
        </h3>
        <div class="ai-sidebar__actions">
            <button class="b3-button b3-button--text" on:click={newSession} title="新建对话">
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
                title="复制全部对话"
            >
                <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
            </button>
            <button class="b3-button b3-button--text" on:click={clearChat} title="清空对话">
                <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
            </button>
            <button class="b3-button b3-button--text" on:click={openSettings} title="打开设置">
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
        on:scroll={handleMessagesScroll}
    >
        {#each messages.filter(msg => msg.role !== 'system') as message, index (index)}
            <div
                class="ai-message ai-message--{message.role}"
                on:contextmenu={e => handleContextMenu(e, message.content)}
            >
                <div class="ai-message__header">
                    <span class="ai-message__role">
                        {message.role === 'user' ? '👤 You' : '🤖 AI'}
                    </span>
                    <button
                        class="b3-button b3-button--text ai-message__copy"
                        on:click={() => copyMessage(message.content)}
                        title="复制这条消息"
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                    </button>
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

                <div class="ai-message__content protyle-wysiwyg">
                    {@html formatMessage(message.content)}
                </div>
            </div>
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
                    <div class="ai-message__content protyle-wysiwyg">
                        {@html formatMessage(streamingMessage)}
                    </div>
                {/if}
            </div>
        {/if}

        {#if messages.filter(msg => msg.role !== 'system').length === 0 && !isLoading}
            <div class="ai-sidebar__empty">
                <div class="ai-sidebar__empty-icon">💬</div>
                <p>开始与 AI 对话吧！</p>
                <p class="ai-sidebar__empty-hint">Ctrl+Enter 发送消息</p>
            </div>
        {/if}

        {#if !shouldAutoScroll && messages.filter(msg => msg.role !== 'system').length > 0}
            <button
                class="ai-sidebar__scroll-to-bottom"
                on:click={() => scrollToBottom(true)}
                title="跳转到底部"
            >
                ↓ 最新
            </button>
        {/if}
    </div>

    <!-- 上下文文档和附件列表 -->
    {#if contextDocuments.length > 0 || currentAttachments.length > 0}
        <div class="ai-sidebar__context-docs">
            <div class="ai-sidebar__context-docs-title">📎 上下文内容</div>
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
        <div class="ai-sidebar__input-row">
            <textarea
                bind:this={textareaElement}
                bind:value={currentInput}
                on:keydown={handleKeydown}
                on:paste={handlePaste}
                placeholder="输入消息... (Ctrl+Enter 发送，可拖入文档、块或粘贴图片)"
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
                title={isLoading ? '中断生成 (Ctrl+Enter)' : '发送消息 (Ctrl+Enter)'}
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
                title="上传文件（图片或文本文件）"
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
                on:click={() => (isSearchDialogOpen = !isSearchDialogOpen)}
                title="搜索并添加文档"
            >
                <svg class="b3-button__icon"><use xlink:href="#iconSearch"></use></svg>
            </button>
            <div class="ai-sidebar__prompt-actions">
                <button
                    class="b3-button b3-button--text"
                    on:click={() => (isPromptSelectorOpen = !isPromptSelectorOpen)}
                    title="提示词"
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
                        <span class="ai-sidebar__prompt-item-title">新建提示词</span>
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
                    <h4>{editingPrompt ? '编辑提示词' : '新建提示词'}</h4>
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
                                placeholder="输入提示词标题"
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
                    <h4>搜索文档</h4>
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
                            placeholder="输入关键词，自动搜索"
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
                                        {result.content || '未命名文档'}
                                    </div>
                                    <button
                                        class="b3-button b3-button--text"
                                        on:click={() =>
                                            addDocumentToContext(result.id, result.content)}
                                    >
                                        添加
                                    </button>
                                </div>
                            {/each}
                        {:else if !isSearching && searchKeyword}
                            <div class="ai-sidebar__search-empty">未找到相关文档</div>
                        {/if}
                    </div>
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
        padding: 12px 16px;
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
        padding: 12px 16px;
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
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        transition: background-color 0.2s;

        &.ai-sidebar__messages--drag-over {
            background: var(--b3-theme-primary-lightest);
            border: 2px dashed var(--b3-theme-primary);
        }
    }

    /* 跳转到底部按钮 */
    .ai-sidebar__scroll-to-bottom {
        position: absolute;
        right: 16px;
        bottom: 96px; /* 放在输入框上方，避免遮挡 */
        z-index: 50;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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
        justify-content: space-between;
        gap: 8px;
    }

    .ai-message__role {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }

    .ai-message__copy {
        opacity: 0;
        transition: opacity 0.2s;
        flex-shrink: 0;
    }

    .ai-message:hover .ai-message__copy {
        opacity: 1;
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
        padding: 12px;
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
        .ai-message__content {
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-on-background);
            margin-left: auto;
            max-width: 85%;
        }
    }

    .ai-message--assistant {
        .ai-message__content {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-on-surface);
            max-width: 90%;
        }
    }

    .ai-sidebar__input-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        flex-shrink: 0;
        position: relative;
        transition: background-color 0.2s;
    }

    .ai-sidebar__input-row {
        display: flex;
        gap: 8px;
    }

    .ai-sidebar__input {
        flex: 1;
        resize: none;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 10px 12px;
        font-family: var(--b3-font-family);
        font-size: 14px;
        line-height: 1.5;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        min-height: 40px;
        max-height: 200px;
        overflow-y: auto;

        &:focus {
            outline: none;
            border-color: var(--b3-theme-primary);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .ai-sidebar__bottom-row {
        display: flex;
        align-items: center;
        gap: 8px;
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
        overflow: hidden;

        /* 子元素允许缩小并对长文本进行省略处理，防止撑开容器 */
        & > * {
            min-width: 0;
            max-width: 100%;
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
        align-self: flex-end;
        min-width: 40px;
        height: 40px;
        flex-shrink: 0;

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        &.ai-sidebar__send-btn--abort {
            background-color: #ef4444;
            color: white;

            &:hover {
                background-color: #dc2626;
            }
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
    }

    .ai-sidebar__search-empty {
        text-align: center;
        padding: 32px;
        color: var(--b3-theme-on-surface-light);
    }

    // 响应式布局
    @media (max-width: 768px) {
        .ai-sidebar__header {
            padding: 8px 12px;
        }

        .ai-sidebar__title {
            font-size: 14px;
        }

        .ai-sidebar__messages {
            padding: 12px;
            gap: 12px;
        }

        .ai-message--user .ai-message__content {
            max-width: 90%;
        }

        .ai-message--assistant .ai-message__content {
            max-width: 95%;
        }

        .ai-sidebar__input-container {
            padding: 8px 12px;
        }
    }

    @media (max-width: 480px) {
        .ai-sidebar__token-count {
            font-size: 10px;
            padding: 2px 6px;
        }

        .ai-message__content {
            font-size: 13px;
            padding: 10px;
        }

        .ai-sidebar__input {
            font-size: 13px;
        }
    }
</style>
