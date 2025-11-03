<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { ProviderConfig, CustomProviderConfig } from '../defaultSettings';

    export let providers: Record<string, any>;
    export let currentProvider: string;
    export let currentModelId: string;
    export let isOpen = false;

    const dispatch = createEventDispatcher();

    interface ProviderInfo {
        id: string;
        name: string;
        config: ProviderConfig;
    }

    const builtInProviderNames: Record<string, string> = {
        gemini: 'Google Gemini',
        deepseek: 'DeepSeek',
        openai: 'OpenAI',
        volcano: '火山引擎',
    };

    let expandedProviders: Set<string> = new Set([currentProvider]);

    function toggleProvider(providerId: string) {
        if (expandedProviders.has(providerId)) {
            expandedProviders.delete(providerId);
        } else {
            expandedProviders.add(providerId);
        }
        expandedProviders = expandedProviders;
    }

    function selectModel(providerId: string, modelId: string) {
        dispatch('select', { provider: providerId, modelId });
        isOpen = false;
    }

    function getProviderList(): ProviderInfo[] {
        const list: ProviderInfo[] = [];

        // 添加内置平台
        Object.keys(builtInProviderNames).forEach(id => {
            const config = providers[id];
            if (config && config.models && config.models.length > 0) {
                list.push({
                    id,
                    name: builtInProviderNames[id],
                    config,
                });
            }
        });

        // 添加自定义平台
        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            providers.customProviders.forEach((customProvider: CustomProviderConfig) => {
                if (customProvider.models && customProvider.models.length > 0) {
                    list.push({
                        id: customProvider.id,
                        name: customProvider.name,
                        config: customProvider,
                    });
                }
            });
        }

        return list;
    }

    function getProviderConfig(providerId: string): ProviderConfig | null {
        if (builtInProviderNames[providerId]) {
            return providers[providerId];
        }

        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            return (
                providers.customProviders.find((p: CustomProviderConfig) => p.id === providerId) ||
                null
            );
        }

        return null;
    }

    function getProviderName(providerId: string): string {
        if (builtInProviderNames[providerId]) {
            return builtInProviderNames[providerId];
        }

        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            const custom = providers.customProviders.find(
                (p: CustomProviderConfig) => p.id === providerId
            );
            return custom?.name || providerId;
        }

        return providerId;
    }

    // 使用响应式语句自动更新当前模型名称
    $: currentModelName = (() => {
        if (!currentProvider || !currentModelId) {
            return '请选择模型';
        }
        const config = getProviderConfig(currentProvider);
        if (!config) return '请选择模型';
        const model = config.models?.find(m => m.id === currentModelId);
        return model ? `${getProviderName(currentProvider)} - ${model.name}` : '请选择模型';
    })();

    function closeOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.model-selector')) {
            isOpen = false;
        }
    }

    $: if (isOpen) {
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
        }, 0);
    } else {
        document.removeEventListener('click', closeOnOutsideClick);
    }
</script>

<div class="model-selector">
    <button
        class="model-selector__button b3-button b3-button--text"
        on:click|stopPropagation={() => (isOpen = !isOpen)}
        title="切换模型"
    >
        <svg class="b3-button__icon"><use xlink:href="#iconModel"></use></svg>
        <span class="model-selector__current">{currentModelName}</span>
        <svg
            class="b3-button__icon model-selector__arrow"
            class:model-selector__arrow--open={isOpen}
        >
            <use xlink:href="#iconDown"></use>
        </svg>
    </button>

    {#if isOpen}
        <div class="model-selector__dropdown">
            <div class="model-selector__tree">
                {#each getProviderList() as provider}
                    <div class="model-selector__provider">
                        <div
                            class="model-selector__provider-header"
                            role="button"
                            tabindex="0"
                            on:click={() => toggleProvider(provider.id)}
                            on:keydown={() => {}}
                        >
                            <svg
                                class="model-selector__expand-icon"
                                class:model-selector__expand-icon--expanded={expandedProviders.has(
                                    provider.id
                                )}
                            >
                                <use xlink:href="#iconRight"></use>
                            </svg>
                            <span>{provider.name}</span>
                            <span class="model-selector__count">
                                ({provider.config.models.length})
                            </span>
                        </div>
                        {#if expandedProviders.has(provider.id)}
                            <div class="model-selector__models">
                                {#each provider.config.models as model}
                                    <div
                                        class="model-selector__model"
                                        role="button"
                                        tabindex="0"
                                        class:model-selector__model--active={currentProvider ===
                                            provider.id && currentModelId === model.id}
                                        on:click={() => selectModel(provider.id, model.id)}
                                        on:keydown={() => {}}
                                    >
                                        <span class="model-selector__model-name">{model.name}</span>
                                        <span class="model-selector__model-info">
                                            T: {model.temperature} | Max: {model.maxTokens}
                                        </span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
                {#if getProviderList().length === 0}
                    <div class="model-selector__empty">暂无已配置的模型</div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .model-selector {
        position: relative;
    }

    .model-selector__button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 12px;
        max-width: 100%;
    }

    .model-selector__current {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
    }

    .model-selector__arrow {
        transition: transform 0.2s;
        flex-shrink: 0;
    }

    .model-selector__arrow--open {
        transform: rotate(180deg);
    }

    .model-selector__dropdown {
        position: absolute;
        bottom: 100%;
        right: 0;
        margin-bottom: 8px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        box-shadow: var(--b3-dialog-shadow);
        min-width: 280px;
        max-width: 400px;
        max-height: 400px;
        overflow-y: auto;
        z-index: 1000;
    }

    .model-selector__tree {
        padding: 8px;
    }

    .model-selector__provider {
        margin-bottom: 4px;
    }

    .model-selector__provider-header {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        cursor: pointer;
        border-radius: 4px;
        font-weight: 600;
        font-size: 13px;
        color: var(--b3-theme-on-background);

        &:hover {
            background: var(--b3-theme-surface);
        }
    }

    .model-selector__expand-icon {
        width: 12px;
        height: 12px;
        transition: transform 0.2s;
    }

    .model-selector__expand-icon--expanded {
        transform: rotate(90deg);
    }

    .model-selector__count {
        margin-left: auto;
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        font-weight: normal;
    }

    .model-selector__models {
        padding-left: 20px;
        margin-top: 2px;
    }

    .model-selector__model {
        display: flex;
        flex-direction: column;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 4px;
        margin-bottom: 2px;
        border-left: 2px solid transparent;

        &:hover {
            background: var(--b3-theme-surface);
        }
    }

    .model-selector__model--active {
        background: var(--b3-theme-primary-lightest);
        border-left-color: var(--b3-theme-primary);

        .model-selector__model-name {
            color: var(--b3-theme-primary);
            font-weight: 600;
        }
    }

    .model-selector__model-name {
        font-size: 13px;
        color: var(--b3-theme-on-background);
        margin-bottom: 2px;
    }

    .model-selector__model-info {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .model-selector__empty {
        padding: 20px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }
</style>
