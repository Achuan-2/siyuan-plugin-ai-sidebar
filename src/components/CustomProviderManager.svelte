<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { pushMsg, pushErrMsg } from '../api';
    import type { CustomProviderConfig } from '../defaultSettings';

    export let customProviders: CustomProviderConfig[];

    const dispatch = createEventDispatcher();

    let newProviderName = '';
    let showAddForm = false;

    function generateId(): string {
        return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    function addCustomProvider() {
        if (!newProviderName.trim()) {
            pushErrMsg('请输入平台名称');
            return;
        }

        const newProvider: CustomProviderConfig = {
            id: generateId(),
            name: newProviderName.trim(),
            apiKey: '',
            customApiUrl: '',
            models: [],
        };

        customProviders = [...customProviders, newProvider];
        dispatch('change');
        pushMsg(`已添加自定义平台: ${newProviderName}`);

        newProviderName = '';
        showAddForm = false;
    }

    function removeCustomProvider(id: string) {
        const provider = customProviders.find(p => p.id === id);
        if (provider) {
            customProviders = customProviders.filter(p => p.id !== id);
            dispatch('change');
            pushMsg(`已删除平台: ${provider.name}`);
        }
    }

    function renameProvider(id: string, newName: string) {
        const provider = customProviders.find(p => p.id === id);
        if (provider) {
            provider.name = newName;
            customProviders = [...customProviders];
            dispatch('change');
        }
    }
</script>

<div class="custom-provider-manager">
    <div class="manager-header">
        <h5>自定义平台</h5>
        <button class="b3-button b3-button--outline" on:click={() => (showAddForm = !showAddForm)}>
            {showAddForm ? '取消' : '+ 添加平台'}
        </button>
    </div>

    {#if showAddForm}
        <div class="add-form">
            <div class="b3-label">
                <div class="b3-label__text">平台名称</div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    bind:value={newProviderName}
                    placeholder="例如: Claude API, 本地LLM"
                    on:keydown={e => e.key === 'Enter' && addCustomProvider()}
                />
            </div>
            <button
                class="b3-button b3-button--outline"
                on:click={addCustomProvider}
                disabled={!newProviderName.trim()}
            >
                确认添加
            </button>
        </div>
    {/if}

    <div class="provider-list">
        {#each customProviders as provider}
            <div class="provider-item">
                <input
                    class="b3-text-field provider-name-input"
                    type="text"
                    bind:value={provider.name}
                    on:change={() => renameProvider(provider.id, provider.name)}
                />
                <button
                    class="b3-button b3-button--text b3-button--error"
                    on:click={() => removeCustomProvider(provider.id)}
                    title="删除平台"
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconTrashcan"></use></svg>
                </button>
            </div>
        {/each}
        {#if customProviders.length === 0}
            <div class="empty-hint">暂无自定义平台</div>
        {/if}
    </div>
</div>

<style lang="scss">
    .custom-provider-manager {
        background: var(--b3-theme-surface);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 16px;
    }

    .manager-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;

        h5 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .add-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 4px;
        margin-bottom: 12px;
    }

    .provider-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .provider-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background: var(--b3-theme-background);
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
    }

    .provider-name-input {
        flex: 1;
        font-weight: 500;
    }

    .empty-hint {
        padding: 20px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }
</style>
