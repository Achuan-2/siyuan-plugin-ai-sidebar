<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { chat, estimateTokens, calculateTotalTokens, type Message, type AIProvider } from './ai-chat';
    import { pushMsg, pushErrMsg } from './api';
    
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
    
    onMount(async () => {
        settings = await plugin.loadSettings();
        // 如果有系统提示词，添加到消息列表
        if (settings.aiSystemPrompt) {
            messages = [{ role: 'system', content: settings.aiSystemPrompt }];
        }
        updateTokenCount();
    });
    
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
    
    // 发送消息
    async function sendMessage() {
        if (!currentInput.trim() || isLoading) return;
        
        // 检查设置
        if (!settings.aiApiKey) {
            pushErrMsg('请先在设置中配置 API Key');
            return;
        }
        
        if (!settings.aiModel) {
            pushErrMsg('请先在设置中选择模型');
            return;
        }
        
        const userMessage: Message = {
            role: 'user',
            content: currentInput.trim()
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
            await chat(settings.aiProvider as AIProvider, {
                apiKey: settings.aiApiKey,
                model: settings.aiModel,
                messages: messagesToSend,
                temperature: settings.aiTemperature || 0.7,
                maxTokens: settings.aiMaxTokens || 2000,
                stream: true,
                onChunk: async (chunk: string) => {
                    streamingMessage += chunk;
                    await scrollToBottom();
                },
                onComplete: (fullText: string) => {
                    const assistantMessage: Message = {
                        role: 'assistant',
                        content: fullText
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
                }
            }, settings.aiCustomApiUrl);
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
        
        navigator.clipboard.writeText(markdown).then(() => {
            pushMsg('对话已复制为 Markdown');
        }).catch(err => {
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
            <button class="b3-button b3-button--text" on:click={copyAsMarkdown} title="复制为Markdown">
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
                <p class="ai-sidebar__empty-hint">
                    支持 Shift+Enter 换行
                </p>
            </div>
        {/if}
    </div>
    
    <div class="ai-sidebar__input-container">
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
                <svg class="b3-button__icon ai-sidebar__loading-icon"><use xlink:href="#iconRefresh"></use></svg>
            {:else}
                <svg class="b3-button__icon"><use xlink:href="#iconSend"></use></svg>
            {/if}
        </button>
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
        0%, 100% {
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
            
            code {
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
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-background);
        flex-shrink: 0;
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
