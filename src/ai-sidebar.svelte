<script lang="ts">
    import { onMount, tick, onDestroy } from 'svelte';
    import { chat, estimateTokens, calculateTotalTokens, type Message } from './ai-chat';
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
    let settings: any = {};
    let messagesContainer: HTMLElement;
    let textareaElement: HTMLTextAreaElement;
    let inputContainer: HTMLElement;

    // 上下文文档
    let contextDocuments: ContextDocument[] = [];
    let isSearchDialogOpen = false;
    let searchKeyword = '';
    let searchResults: any[] = [];
    let isSearching = false;
    let isDragOver = false;
    let searchTimeout: number | null = null;

    // 会话管理
    let sessions: ChatSession[] = [];
    let currentSessionId: string = '';
    let isSessionManagerOpen = false;
    let hasUnsavedChanges = false;

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

        // 加载历史会话
        await loadSessions();

        // 如果有系统提示词，添加到消息列表
        if (settings.aiSystemPrompt) {
            messages = [{ role: 'system', content: settings.aiSystemPrompt }];
        }
        updateTokenCount();

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

        // 用户消息只保存原始输入（不包含文档内容）
        const userContent = currentInput.trim();

        const userMessage: Message = {
            role: 'user',
            content: userContent,
        };

        messages = [...messages, userMessage];
        currentInput = '';
        isLoading = true;
        streamingMessage = '';
        hasUnsavedChanges = true;

        await scrollToBottom();

        // 准备发送给AI的消息（包含系统提示词和上下文文档）
        const messagesToSend = messages.filter(msg => msg.role !== 'system');

        // 如果有上下文文档，将其添加到最后一条用户消息中（仅用于发送给AI）
        if (contextDocuments.length > 0 && messagesToSend.length > 0) {
            const lastMessage = messagesToSend[messagesToSend.length - 1];
            if (lastMessage.role === 'user') {
                const contextText = contextDocuments
                    .map(doc => `## 文档: ${doc.title}\n\n${doc.content}`)
                    .join('\n\n---\n\n');
                lastMessage.content = `以下是相关文档作为上下文：\n\n${contextText}\n\n---\n\n我的问题：${userContent}`;
            }
        }

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
                        hasUnsavedChanges = true;
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
        currentSessionId = '';
        hasUnsavedChanges = false;
        updateTokenCount();
        pushMsg('对话已清空');
    }

    // 处理键盘事件
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && e.ctrlKey) {
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

    // 复制单条消息
    function copyMessage(content: string, role: string) {
        navigator.clipboard
            .writeText(content)
            .then(() => {
                pushMsg('消息已复制');
            })
            .catch(err => {
                pushErrMsg('复制失败');
                console.error('Copy failed:', err);
            });
    }

    // 处理消息框右键菜单
    function handleContextMenu(event: MouseEvent, content: string, role: string) {
        event.preventDefault();
        copyMessage(content, role);
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
                let docTitle = block.content || '未命名文档';

                // 如果是文档块，直接添加
                if (block.type === 'd') {
                    await addDocumentToContext(docId, docTitle);
                } else {
                    // 如果是普通块，添加该块的内容
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
                contextDocuments = [
                    ...contextDocuments,
                    {
                        id: blockId,
                        title: blockTitle || '块内容',
                        content: data.content,
                    },
                ];
                pushMsg(`已添加块: ${blockTitle}`);
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
            const firstMessage = userMessages[0].content;
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
            updateTokenCount();
            await scrollToBottom();
            pushMsg(`已加载会话: ${session.title}`);
        }
    }

    async function newSession() {
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
        updateTokenCount();
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
            <span class="ai-sidebar__token-count" title="当前对话token数 / 输入框token数">
                💬 {totalTokens} / ✏️ {inputTokens}
            </span>
            <button
                class="b3-button b3-button--text"
                on:click={saveCurrentSession}
                title="保存当前会话"
                disabled={!hasUnsavedChanges}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconSave"></use></svg>
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
        </div>
    </div>

    <!-- 上下文文档列表 -->
    {#if contextDocuments.length > 0}
        <div class="ai-sidebar__context-docs">
            <div class="ai-sidebar__context-docs-title">📚 上下文文档</div>
            <div class="ai-sidebar__context-docs-list">
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
                            {doc.title}
                        </button>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <div
        class="ai-sidebar__messages"
        class:ai-sidebar__messages--drag-over={isDragOver}
        bind:this={messagesContainer}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
    >
        {#each messages.filter(msg => msg.role !== 'system') as message, index (index)}
            <div
                class="ai-message ai-message--{message.role}"
                on:contextmenu={e => handleContextMenu(e, message.content, message.role)}
            >
                <div class="ai-message__header">
                    <span class="ai-message__role">
                        {message.role === 'user' ? '👤 You' : '🤖 AI'}
                    </span>
                    <button
                        class="b3-button b3-button--text ai-message__copy"
                        on:click={() => copyMessage(message.content, message.role)}
                        title="复制这条消息"
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconCopy"></use></svg>
                    </button>
                </div>
                <div class="ai-message__content">
                    {@html formatMessage(message.content)}
                </div>
            </div>
        {/each}

        {#if isLoading && streamingMessage}
            <div
                class="ai-message ai-message--assistant ai-message--streaming"
                on:contextmenu={e => handleContextMenu(e, streamingMessage, 'assistant')}
            >
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
                <p class="ai-sidebar__empty-hint">Ctrl+Enter 发送消息</p>
            </div>
        {/if}
    </div>

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
                placeholder="输入消息... (Ctrl+Enter 发送，可拖入文档)"
                class="ai-sidebar__input"
                disabled={isLoading}
                rows="1"
            ></textarea>
            <button
                class="b3-button b3-button--primary ai-sidebar__send-btn"
                on:click={sendMessage}
                disabled={isLoading || !currentInput.trim()}
                title="发送消息 (Ctrl+Enter)"
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
        <div class="ai-sidebar__bottom-row">
            <button
                class="b3-button b3-button--text ai-sidebar__search-btn"
                on:click={() => (isSearchDialogOpen = !isSearchDialogOpen)}
                title="搜索并添加文档"
            >
                <svg class="b3-button__icon"><use xlink:href="#iconSearch"></use></svg>
            </button>
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

    .ai-sidebar__token-count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        padding: 4px 8px;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        margin-right: 4px;
    }

    .ai-sidebar__context-docs {
        padding: 12px 16px;
        background: var(--b3-theme-surface);
        border-bottom: 1px solid var(--b3-border-color);
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

    .ai-sidebar__messages {
        flex: 1;
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

    .ai-sidebar__search-btn {
        flex-shrink: 0;
    }

    .ai-sidebar__model-selector-container {
        flex: 1;
        display: flex;
        justify-content: flex-end;
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
