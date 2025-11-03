<script lang="ts">
    import { onMount, tick, onDestroy } from 'svelte';
    import { chat, estimateTokens, calculateTotalTokens, type Message } from './ai-chat';
    import { pushMsg, pushErrMsg } from './api';
    import ModelSelector from './components/ModelSelector.svelte';
    import type { ProviderConfig } from './defaultSettings';
    import { settingsStore } from './stores/settings';

    export let plugin: any;

    let messages: Message[] = [];
    let currentInput = '';
    let isLoading = false;
    let streamingMessage = '';
    let settings: any = {};
    let messagesContainer: HTMLElement;
    let textareaElement: HTMLTextAreaElement;

    // Token统计
    let totalTokens = 0;
    let inputTokens = 0;

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

        // 如果有系统提示词，添加到消息列表
        if (settings.aiSystemPrompt) {
            messages = [{ role: 'system', content: settings.aiSystemPrompt }];
        }
        updateTokenCount();

        // 订阅设置变化
        unsubscribe = settingsStore.subscribe((newSettings) => {
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
    });

    onDestroy(() => {
        // 取消订阅
        if (unsubscribe) {
            unsubscribe();
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

    // 更新token统计
    function updateTokenCount() {
        totalTokens = calculateTotalTokens(messages);
        inputTokens = estimateTokens(currentInput);
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
        updateTokenCount();
        tick().then(autoResizeTextarea);
    }

    // 滚动到底部
    async function scrollToBottom() {
        await tick();
        if (messagesContainer) {
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
        if (!currentInput.trim() || isLoading) return;

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

        const userMessage: Message = {
            role: 'user',
            content: currentInput.trim(),
        };

        messages = [...messages, userMessage];
        currentInput = '';
        isLoading = true;
        streamingMessage = '';

        await scrollToBottom();

        // 准备发送的消息（包含系统提示词）
        const messagesToSend = messages.filter(msg => msg.role !== 'system');
        if (settings.aiSystemPrompt) {
            messagesToSend.unshift({ role: 'system', content: settings.aiSystemPrompt });
        }

        try {
            await chat(
                currentProvider,
                {
                    apiKey: providerConfig.apiKey,
                    model: modelConfig.id,
                    messages: messagesToSend,
                    temperature: modelConfig.temperature,
                    maxTokens: modelConfig.maxTokens > 0 ? modelConfig.maxTokens : undefined,
                    stream: true,
                    onChunk: async (chunk: string) => {
                        streamingMessage += chunk;
                        await scrollToBottom();
                    },
                    onComplete: (fullText: string) => {
                        const assistantMessage: Message = {
                            role: 'assistant',
                            content: fullText,
                        };
                        messages = [...messages, assistantMessage];
                        streamingMessage = '';
                        isLoading = false;
                        updateTokenCount();
                    },
                    onError: (error: Error) => {
                        pushErrMsg(`AI 请求失败: ${error.message}`);
                        isLoading = false;
                        streamingMessage = '';
                    },
                },
                providerConfig.customApiUrl
            );
        } catch (error) {
            console.error('Send message error:', error);
            isLoading = false;
            streamingMessage = '';
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
        messages = settings.aiSystemPrompt
            ? [{ role: 'system', content: settings.aiSystemPrompt }]
            : [];
        streamingMessage = '';
        updateTokenCount();
        pushMsg('对话已清空');
    }

    // 处理键盘事件
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    // 格式化markdown（简单实现）
    function formatMessage(content: string): string {
        // 简单的markdown渲染（可以后续使用marked库增强）
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/\n/g, '<br>');
    }
</script>

<div class="ai-sidebar">
    <div class="ai-sidebar__header">
        <h3 class="ai-sidebar__title">AI 助手</h3>
        <div class="ai-sidebar__actions">
            <span class="ai-sidebar__token-count" title="当前对话token数 / 输入框token数">
                💬 {totalTokens} / ✏️ {inputTokens}
            </span>
            <button
                class="b3-button b3-button--text"
                on:click={copyAsMarkdown}
                title="复制为Markdown"
            >
                <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
            </button>
            <button class="b3-button b3-button--text" on:click={clearChat} title="清空对话">
                <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
            </button>
        </div>
    </div>

    <div class="ai-sidebar__messages" bind:this={messagesContainer}>
        {#each messages.filter(msg => msg.role !== 'system') as message, index (index)}
            <div class="ai-message ai-message--{message.role}">
                <div class="ai-message__header">
                    <span class="ai-message__role">
                        {message.role === 'user' ? '👤 You' : '🤖 AI'}
                    </span>
                </div>
                <div class="ai-message__content">
                    {@html formatMessage(message.content)}
                </div>
            </div>
        {/each}

        {#if isLoading && streamingMessage}
            <div class="ai-message ai-message--assistant ai-message--streaming">
                <div class="ai-message__header">
                    <span class="ai-message__role">🤖 AI</span>
                    <span class="ai-message__streaming-indicator">●</span>
                </div>
                <div class="ai-message__content">
                    {@html formatMessage(streamingMessage)}
                </div>
            </div>
        {/if}

        {#if messages.filter(msg => msg.role !== 'system').length === 0 && !isLoading}
            <div class="ai-sidebar__empty">
                <div class="ai-sidebar__empty-icon">💬</div>
                <p>开始与 AI 对话吧！</p>
                <p class="ai-sidebar__empty-hint">支持 Shift+Enter 换行</p>
            </div>
        {/if}
    </div>

    <div class="ai-sidebar__input-container">
        <div class="ai-sidebar__input-row">
            <textarea
                bind:this={textareaElement}
                bind:value={currentInput}
                on:keydown={handleKeydown}
                placeholder="输入消息... (Shift+Enter 换行)"
                class="ai-sidebar__input"
                disabled={isLoading}
                rows="1"
            ></textarea>
            <button
                class="b3-button b3-button--primary ai-sidebar__send-btn"
                on:click={sendMessage}
                disabled={isLoading || !currentInput.trim()}
                title="发送消息 (Enter)"
            >
                {#if isLoading}
                    <svg class="b3-button__icon ai-sidebar__loading-icon">
                        <use xlink:href="#iconRefresh"></use>
                    </svg>
                {:else}
                    <svg class="b3-button__icon"><use xlink:href="#iconLeft"></use></svg>
                {/if}
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
    }

    .ai-sidebar__actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .ai-sidebar__token-count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        padding: 4px 8px;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        margin-right: 4px;
    }

    .ai-sidebar__messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
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
        gap: 8px;
    }

    .ai-message__role {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
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

    .ai-message__content {
        padding: 12px;
        border-radius: 8px;
        line-height: 1.6;
        word-wrap: break-word;

        :global(code) {
            background: var(--b3-theme-surface);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--b3-font-family-code);
            font-size: 0.9em;
        }

        :global(pre) {
            background: var(--b3-theme-surface);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;

            :global(code) {
                background: none;
                padding: 0;
            }
        }

        :global(strong) {
            font-weight: 600;
        }

        :global(em) {
            font-style: italic;
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

    .ai-sidebar__model-selector-container {
        display: flex;
        justify-content: flex-end;
    }

    .ai-sidebar__send-btn {
        align-self: flex-end;
        min-width: 40px;
        height: 40px;

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
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
