<script lang="ts">
    import { createEventDispatcher, tick } from 'svelte';
    import { pushMsg } from '../api';
    import { t } from '../utils/i18n';

    export let sessions: ChatSession[] = [];
    export let currentSessionId: string = '';
    export let isOpen = false;

    const dispatch = createEventDispatcher();

    // 下拉菜单位置
    let dropdownTop = 0;
    let dropdownLeft = 0;
    let buttonElement: HTMLButtonElement;
    let dropdownElement: HTMLDivElement;

    interface ChatSession {
        id: string;
        title: string;
        messages: any[];
        createdAt: number;
        updatedAt: number;
        pinned?: boolean; // 是否钉住
    }

    // 右键菜单状态
    let contextMenuVisible = false;
    let contextMenuX = 0;
    let contextMenuY = 0;
    let contextMenuSession: ChatSession | null = null;

    function formatDate(timestamp: number): string {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return (
                t('aiSidebar.session.today') +
                ' ' +
                date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            );
        } else if (days === 1) {
            return (
                t('aiSidebar.session.yesterday') +
                ' ' +
                date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            );
        } else if (days < 7) {
            return `${days}${t('aiSidebar.session.daysAgo')}`;
        } else {
            return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        }
    }

    function loadSession(sessionId: string) {
        dispatch('load', { sessionId });
        isOpen = false;
    }

    function deleteSession(sessionId: string, event: Event) {
        event.stopPropagation();
        dispatch('delete', { sessionId });
    }

    function newSession() {
        dispatch('new');
        isOpen = false;
    }

    function closeOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.session-manager')) {
            isOpen = false;
        }
    }

    // 计算下拉菜单位置
    async function updateDropdownPosition() {
        if (!buttonElement || !isOpen) return;

        await tick();

        const rect = buttonElement.getBoundingClientRect();
        const dropdownWidth = dropdownElement?.offsetWidth || 320;
        const dropdownHeight = dropdownElement?.offsetHeight || 400;

        // 计算垂直位置
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
            // 显示在按钮下方
            dropdownTop = rect.bottom + 4;
        } else {
            // 显示在按钮上方
            dropdownTop = rect.top - dropdownHeight - 4;
        }

        // 计算水平位置（右对齐）
        dropdownLeft = rect.right - dropdownWidth;

        // 确保下拉菜单不会超出视口左边界
        if (dropdownLeft < 8) {
            dropdownLeft = 8;
        }

        // 确保下拉菜单不会超出视口右边界
        if (dropdownLeft + dropdownWidth > window.innerWidth - 8) {
            dropdownLeft = window.innerWidth - dropdownWidth - 8;
        }
    }

    $: if (isOpen) {
        updateDropdownPosition();
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
        }, 0);
    } else {
        document.removeEventListener('click', closeOnOutsideClick);
    }

    // 按钉住状态和更新时间排序（钉住的在前，然后按时间降序）
    $: sortedSessions = [...sessions].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
    });

    // 显示右键菜单
    function showContextMenu(event: MouseEvent, session: ChatSession) {
        event.preventDefault();
        event.stopPropagation();

        contextMenuSession = session;
        contextMenuX = event.clientX;
        contextMenuY = event.clientY;
        contextMenuVisible = true;
    }

    // 关闭右键菜单
    function closeContextMenu() {
        contextMenuVisible = false;
        contextMenuSession = null;
    }

    // 全局点击事件处理（关闭右键菜单）
    function handleGlobalClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.session-context-menu')) {
            closeContextMenu();
        }
    }

    // 钉住/取消钉住会话
    function togglePinSession() {
        if (!contextMenuSession) return;

        const session = sessions.find(s => s.id === contextMenuSession.id);
        if (session) {
            session.pinned = !session.pinned;
            sessions = [...sessions];
            dispatch('update', { sessions });
            pushMsg(
                session.pinned ? t('aiSidebar.session.pinned') : t('aiSidebar.session.unpinned')
            );
        }
        // 不关闭右键菜单，让用户可以继续操作
    }

    // 导出会话到文件
    function exportSessionToFile() {
        if (!contextMenuSession) return;

        const session = contextMenuSession;
        const markdown = generateSessionMarkdown(session);

        // 创建下载链接
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        pushMsg(t('aiSidebar.session.exportSuccess'));
        closeContextMenu();
    }

    // 生成会话的Markdown内容
    function generateSessionMarkdown(session: ChatSession): string {
        const header = `# ${session.title}\n\n`;
        const date = `> 创建时间：${new Date(session.createdAt).toLocaleString('zh-CN')}\n`;
        const updateDate = `> 更新时间：${new Date(session.updatedAt).toLocaleString('zh-CN')}\n\n`;

        const messages = session.messages
            .filter(msg => msg.role !== 'system')
            .map(msg => {
                const role = msg.role === 'user' ? '👤 **用户**' : '🤖 **助手**';
                let content = '';

                if (typeof msg.content === 'string') {
                    content = msg.content;
                } else if (Array.isArray(msg.content)) {
                    content = msg.content
                        .filter(part => part.type === 'text')
                        .map(part => part.text)
                        .join('\n');
                }

                return `${role}\n\n${content}\n`;
            })
            .join('\n---\n\n');

        return header + date + updateDate + messages;
    }

    // 监听全局点击事件
    $: if (contextMenuVisible) {
        setTimeout(() => {
            document.addEventListener('click', handleGlobalClick);
        }, 0);
    } else {
        document.removeEventListener('click', handleGlobalClick);
    }
</script>

<div class="session-manager">
    <button
        bind:this={buttonElement}
        class="session-manager__button b3-button b3-button--text"
        on:click|stopPropagation={() => (isOpen = !isOpen)}
        title={t('aiSidebar.session.title')}
    >
        <svg class="b3-button__icon"><use xlink:href="#iconHistory"></use></svg>
    </button>

    {#if isOpen}
        <div
            bind:this={dropdownElement}
            class="session-manager__dropdown"
            style="top: {dropdownTop}px; left: {dropdownLeft}px;"
        >
            <div class="session-manager__header">
                <h4>{t('aiSidebar.session.history')}</h4>
                <button class="b3-button b3-button--primary" on:click={newSession}>
                    <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                    {t('aiSidebar.session.new')}
                </button>
            </div>

            <div class="session-manager__list">
                {#if sortedSessions.length === 0}
                    <div class="session-manager__empty">{t('aiSidebar.session.empty')}</div>
                {:else}
                    {#each sortedSessions as session}
                        <div
                            class="session-item"
                            class:session-item--active={session.id === currentSessionId}
                            class:session-item--pinned={session.pinned}
                            role="button"
                            tabindex="0"
                            on:click={() => loadSession(session.id)}
                            on:contextmenu={e => showContextMenu(e, session)}
                            on:keydown={() => {}}
                        >
                            <div class="session-item__content">
                                <div class="session-item__title">
                                    {#if session.pinned}
                                        <svg class="session-item__pin-icon">
                                            <use xlink:href="#iconPin"></use>
                                        </svg>
                                    {/if}
                                    {session.title}
                                </div>
                                <div class="session-item__info">
                                    <span class="session-item__date">
                                        {formatDate(session.updatedAt)}
                                    </span>
                                    <span class="session-item__count">
                                        {session.messages.filter(m => m.role !== 'system').length}
                                        {t('aiSidebar.messages.messageCount')}
                                    </span>
                                </div>
                            </div>
                            <button
                                class="b3-button b3-button--text session-item__delete"
                                on:click={e => deleteSession(session.id, e)}
                                title={t('aiSidebar.session.delete')}
                            >
                                <svg class="b3-button__icon">
                                    <use xlink:href="#iconTrashcan"></use>
                                </svg>
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    {/if}

    <!-- 右键菜单 -->
    {#if contextMenuVisible && contextMenuSession}
        <div class="session-context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;">
            <div
                class="session-context-menu__item"
                role="button"
                tabindex="0"
                on:click={togglePinSession}
                on:keydown={e => e.key === 'Enter' && togglePinSession()}
            >
                <svg class="b3-menu__icon">
                    <use xlink:href={contextMenuSession.pinned ? '#iconUnpin' : '#iconPin'}></use>
                </svg>
                <span>
                    {contextMenuSession.pinned
                        ? t('aiSidebar.session.unpin')
                        : t('aiSidebar.session.pin')}
                </span>
            </div>
            <div
                class="session-context-menu__item"
                role="button"
                tabindex="0"
                on:click={exportSessionToFile}
                on:keydown={e => e.key === 'Enter' && exportSessionToFile()}
            >
                <svg class="b3-menu__icon">
                    <use xlink:href="#iconDownload"></use>
                </svg>
                <span>{t('aiSidebar.session.export')}</span>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .session-manager {
        position: relative;
    }

    .session-manager__button {
        min-width: 32px;
    }

    .session-manager__dropdown {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        width: 320px;
        max-height: 60vh;
        display: flex;
        flex-direction: column;
        z-index: 1000;
    }

    .session-manager__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }

        button {
            font-size: 12px;
            padding: 4px 12px;
        }
    }

    .session-manager__list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
    }

    .session-manager__empty {
        padding: 40px 20px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .session-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        margin-bottom: 4px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
            border-color: var(--b3-border-color);

            .session-item__delete {
                opacity: 1;
            }
        }
    }

    .session-item--active {
        background: var(--b3-theme-primary-lightest);
        border-color: var(--b3-theme-primary);

        .session-item__title {
            color: var(--b3-theme-primary);
            font-weight: 600;
        }
    }

    .session-item__content {
        flex: 1;
        min-width: 0;
    }

    .session-item__title {
        font-size: 13px;
        color: var(--b3-theme-on-background);
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .session-item__info {
        display: flex;
        gap: 12px;
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .session-item__delete {
        opacity: 0;
        transition: opacity 0.2s;
        flex-shrink: 0;

        &:hover {
            color: var(--b3-theme-error);
        }
    }

    .session-item--active .session-item__delete {
        opacity: 1;
    }

    .session-item--pinned {
        border-left: 2px solid var(--b3-theme-primary);
    }

    .session-item__pin-icon {
        width: 12px;
        height: 12px;
        margin-right: 4px;
        color: var(--b3-theme-primary);
        vertical-align: text-top;
    }

    .session-context-menu {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        box-shadow: var(--b3-dialog-shadow);
        z-index: 10000;
        min-width: 150px;
        padding: 4px 0;
    }

    .session-context-menu__item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        font-size: 13px;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        transition: background 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
        }

        svg {
            width: 14px;
            height: 14px;
            color: var(--b3-theme-on-surface);
        }

        span {
            flex: 1;
        }
    }
</style>
