<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { fetchModels } from '../ai-chat';
    import { pushMsg, pushErrMsg } from '../api';
    import type { ProviderConfig, ModelConfig } from '../defaultSettings';

    export let providerId: string;
    export let providerName: string;
    export let config: ProviderConfig;

    const dispatch = createEventDispatcher();

    let isLoadingModels = false;
    let searchQuery = '';
    let availableModels: { id: string; name: string }[] = [];
    let showModelSearch = false;
    let manualModelId = '';
    let manualModelName = '';

    // 获取模型列表
    async function loadModels() {
        if (!config.apiKey) {
            pushErrMsg('请先设置 API Key');
            return;
        }

        isLoadingModels = true;
        try {
            const models = await fetchModels(providerId, config.apiKey, config.customApiUrl);
            // 按模型ID升序排序
            availableModels = models
                .map(m => ({ id: m.id, name: m.name }))
                .sort((a, b) => a.id.localeCompare(b.id));
            showModelSearch = true;
            pushMsg(`成功获取 ${models.length} 个模型`);
        } catch (error) {
            pushErrMsg(`获取模型失败: ${error.message}`);
            console.error('Load models error:', error);
        } finally {
            isLoadingModels = false;
        }
    }

    // 添加模型
    function addModel(modelId: string, modelName: string) {
        // 检查是否已存在
        if (config.models.some(m => m.id === modelId)) {
            pushErrMsg('该模型已添加');
            return;
        }

        const newModel: ModelConfig = {
            id: modelId,
            name: modelName,
            temperature: 0.7,
            maxTokens: -1,
        };

        config.models = [...config.models, newModel];
        dispatch('change');
        pushMsg(`已添加模型: ${modelName}`);
        searchQuery = '';
    }

    // 手动添加模型
    function addManualModel() {
        if (!manualModelId.trim()) {
            pushErrMsg('请输入模型ID');
            return;
        }

        const modelName = manualModelName.trim() || manualModelId.trim();
        addModel(manualModelId.trim(), modelName);

        manualModelId = '';
        manualModelName = '';
    }

    // 删除模型
    function removeModel(modelId: string) {
        config.models = config.models.filter(m => m.id !== modelId);
        dispatch('change');
        pushMsg('已删除模型');
    }

    // 更新模型配置
    function updateModel(modelId: string, field: keyof ModelConfig, value: any) {
        const model = config.models.find(m => m.id === modelId);
        if (model) {
            (model as any)[field] = value;
            config.models = [...config.models];
            dispatch('change');
        }
    }

    // 过滤并排序模型
    $: filteredModels = availableModels
        .filter(
            m =>
                m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => a.id.localeCompare(b.id));
</script>

<div class="provider-config">
    <div class="provider-config__header">
        <h4>{providerName}</h4>
    </div>

    <div class="provider-config__section">
        <div class="b3-label">
            <div class="b3-label__text">API Key</div>
            <input
                class="b3-text-field fn__flex-1"
                type="password"
                bind:value={config.apiKey}
                on:change={() => dispatch('change')}
                placeholder="输入 API Key"
            />
        </div>

        <div class="b3-label">
            <div class="b3-label__text">自定义 API 地址（可选）</div>
            <input
                class="b3-text-field fn__flex-1"
                type="text"
                bind:value={config.customApiUrl}
                on:change={() => dispatch('change')}
                placeholder="以 / 结尾忽略 v1 版本，以 # 结尾强制使用输入地址"
            />
        </div>

        <div class="b3-label">
            <div class="b3-label__text">模型管理</div>
            <button
                class="b3-button b3-button--outline"
                on:click={loadModels}
                disabled={isLoadingModels || !config.apiKey}
            >
                {isLoadingModels ? '获取中...' : '获取可用模型'}
            </button>
        </div>
    </div>

    <div class="provider-config__manual-add">
        <h5>手动添加模型</h5>
        <div class="manual-add-form">
            <div class="b3-label">
                <div class="b3-label__text">模型ID *</div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    bind:value={manualModelId}
                    placeholder="例如: gpt-4, gemini-pro"
                />
            </div>
            <div class="b3-label">
                <div class="b3-label__text">模型名称（可选）</div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    bind:value={manualModelName}
                    placeholder="不填则使用模型ID"
                />
            </div>
            <button
                class="b3-button b3-button--outline"
                on:click={addManualModel}
                disabled={!manualModelId.trim()}
            >
                添加模型
            </button>
        </div>
    </div>

    {#if showModelSearch && availableModels.length > 0}
        <div class="provider-config__search">
            <div class="b3-label">
                <div class="b3-label__text">搜索并添加模型</div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    bind:value={searchQuery}
                    placeholder="搜索模型..."
                />
            </div>

            <div class="model-search-results">
                {#each filteredModels.slice(0, 10) as model}
                    <div class="model-search-item">
                        <span class="model-search-item__name">{model.name}</span>
                        <button
                            class="b3-button b3-button--text"
                            on:click={() => addModel(model.id, model.name)}
                            disabled={config.models.some(m => m.id === model.id)}
                        >
                            {config.models.some(m => m.id === model.id) ? '已添加' : '添加'}
                        </button>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    {#if config.models.length > 0}
        <div class="provider-config__models">
            <h5>已添加的模型</h5>
            {#each config.models as model}
                <div class="model-item">
                    <div class="model-item__header">
                        <span class="model-item__name">{model.name}</span>
                        <button
                            class="b3-button b3-button--text b3-button--error"
                            on:click={() => removeModel(model.id)}
                            title="删除"
                        >
                            <svg class="b3-button__icon">
                                <use xlink:href="#iconTrashcan"></use>
                            </svg>
                        </button>
                    </div>
                    <div class="model-item__config">
                        <div class="model-config-item">
                            <span>温度 (Temperature): {model.temperature}</span>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                bind:value={model.temperature}
                                on:change={() =>
                                    updateModel(model.id, 'temperature', model.temperature)}
                            />
                        </div>
                        <div class="model-config-item">
                            <span>最大 Tokens (-1表示不限制)</span>
                            <input
                                class="b3-text-field"
                                type="number"
                                min="-1"
                                max="128000"
                                bind:value={model.maxTokens}
                                on:change={() =>
                                    updateModel(model.id, 'maxTokens', model.maxTokens)}
                            />
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style lang="scss">
    .provider-config {
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        margin-bottom: 16px;
    }

    .provider-config__header {
        margin-bottom: 16px;

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .provider-config__section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .provider-config__manual-add {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--b3-border-color);

        h5 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .manual-add-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .provider-config__search {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--b3-border-color);
    }

    .model-search-results {
        max-height: 300px;
        overflow-y: auto;
        margin-top: 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
    }

    .model-search-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--b3-border-color);

        &:last-child {
            border-bottom: none;
        }

        &:hover {
            background: var(--b3-theme-background);
        }
    }

    .model-search-item__name {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }

    .provider-config__models {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--b3-border-color);

        h5 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-surface);
        }
    }

    .model-item {
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
    }

    .model-item__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }

    .model-item__name {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
    }

    .model-item__config {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .model-config-item {
        display: flex;
        flex-direction: column;
        gap: 4px;

        span {
            font-size: 12px;
            color: var(--b3-theme-on-surface);
        }

        input[type='range'] {
            width: 100%;
        }

        input[type='number'] {
            width: 100%;
        }
    }
</style>
