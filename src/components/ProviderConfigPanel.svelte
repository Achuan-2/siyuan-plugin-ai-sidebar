<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { fetchModels } from '../ai-chat';
    import { pushMsg, pushErrMsg } from '../api';
    import type { ProviderConfig, ModelConfig } from '../defaultSettings';
    import { t } from '../utils/i18n';

    export let providerId: string;
    export let providerName: string;
    export let defaultApiUrl: string = ''; // 默认 API 地址
    export let websiteUrl: string = ''; // 平台官网链接
    export let config: ProviderConfig;
    export let isCustomProvider: boolean = false; // 是否为自定义平台

    const dispatch = createEventDispatcher();

    let isLoadingModels = false;
    let searchQuery = '';
    let availableModels: { id: string; name: string }[] = [];
    let showModelSearchModal = false;
    let showAddModelModal = false;
    let manualModelId = '';
    let manualModelName = '';
    let isEditingName = false;
    let editingName = providerName;
    let showApiKey = false; // 控制 API Key 是否显示明文
    let showAdvancedConfig = false; // 控制高级设置是否显示

    // 确保 advancedConfig 存在
    $: {
        if (!config.advancedConfig) {
            config.advancedConfig = {
                customModelsUrl: '',
                customChatUrl: '',
            };
        }
    }

    // 生成 API 地址预览
    // 规则说明：
    // 1. 以 '/' 结尾：去掉 /v1 前缀，保留后续路径
    //    例如：https://text.pollinations.ai/openai/ -> https://text.pollinations.ai/openai/chat/completions
    // 2. 以 '#' 结尾：强制使用输入地址，完全不拼接端点路径
    //    例如：https://text.pollinations.ai/openai# -> https://text.pollinations.ai/openai
    // 3. 其他情况：使用完整的默认端点
    //    例如：https://api.openai.com -> https://api.openai.com/v1/chat/completions
    function buildApiPreview(raw: string) {
        if (!raw) return '';
        let s = raw.trim();

        // 记录原始结尾标记
        const endsWithHash = s.endsWith('#');
        const endsWithSlash = s.endsWith('/');

        // 移除结尾标记
        if (endsWithHash) {
            s = s.slice(0, -1);
        } else if (endsWithSlash) {
            s = s.slice(0, -1);
        }

        // 补全协议
        if (!/^https?:\/\//.test(s)) {
            s = 'https://' + s;
        }

        try {
            new URL(s);
        } catch (e) {
            return s; // 无效URL
        }

        // 规则2：以 '#' 结尾，强制使用输入地址，不拼接任何路径
        if (endsWithHash) {
            return s;
        }

        // 规则1：以 '/' 结尾，去掉 /v1 前缀
        if (endsWithSlash) {
            return s + '/chat/completions';
        }

        // 规则3：默认情况，拼接完整路径
        return s + '/v1/chat/completions';
    }

    // 响应式预览值：优先使用用户输入的 customApiUrl，否则使用默认 API 地址做示例
    $: apiPreview = buildApiPreview(config.customApiUrl || defaultApiUrl || '');

    // 获取模型列表
    async function loadModels() {
        if (!config.apiKey) {
            pushErrMsg(t('aiSidebar.errors.noApiKey'));
            return;
        }

        isLoadingModels = true;
        try {
            const models = await fetchModels(
                providerId,
                config.apiKey,
                config.customApiUrl,
                config.advancedConfig
            );
            // 去重：使用 Map 以模型 ID 为键进行去重
            const uniqueModelsMap = new Map();
            models.forEach(m => {
                if (!uniqueModelsMap.has(m.id)) {
                    uniqueModelsMap.set(m.id, { id: m.id, name: m.name });
                }
            });
            // 按模型ID升序排序
            availableModels = Array.from(uniqueModelsMap.values())
                .sort((a, b) => a.id.localeCompare(b.id));
            showModelSearchModal = true;
            searchQuery = '';
            pushMsg(t('models.fetchSuccess').replace('{count}', availableModels.length.toString()));
        } catch (error) {
            pushErrMsg(`${t('models.fetchFailed')}: ${error.message}`);
            console.error('Load models error:', error);
        } finally {
            isLoadingModels = false;
        }
    }

    // 打开模型搜索弹窗
    function openModelSearchModal() {
        if (!config.apiKey) {
            pushErrMsg('请先设置 API Key');
            return;
        }
        loadModels();
    }

    // 关闭模型搜索弹窗
    function closeModelSearchModal() {
        showModelSearchModal = false;
        searchQuery = '';
        availableModels = [];
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
        // 不再清空搜索关键词，方便连续添加多个模型
    }

    // 手动添加模型
    function addManualModel() {
        if (!manualModelId.trim()) {
            pushErrMsg(t('models.idRequired'));
            return;
        }

        const modelName = manualModelName.trim() || manualModelId.trim();
        addModel(manualModelId.trim(), modelName);

        manualModelId = '';
        manualModelName = '';
        showAddModelModal = false;
    }

    // 打开添加模型弹窗
    function openAddModelModal() {
        showAddModelModal = true;
    }

    // 关闭添加模型弹窗
    function closeAddModelModal() {
        showAddModelModal = false;
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

    // 过滤并排序模型 - 支持空格分隔的多关键词搜索
    $: filteredModels = availableModels
        .filter(m => {
            if (!searchQuery.trim()) return true;

            // 将搜索词按空格分割成多个关键词
            const keywords = searchQuery.toLowerCase().trim().split(/\s+/);
            const modelId = m.id.toLowerCase();
            const modelName = m.name.toLowerCase();

            // 所有关键词都必须在 id 或 name 中出现（并集搜索）
            return keywords.every(
                keyword => modelId.includes(keyword) || modelName.includes(keyword)
            );
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    // 开始编辑名称
    function startEditName() {
        editingName = providerName;
        isEditingName = true;
    }

    // 保存名称
    function saveName() {
        if (editingName.trim() && editingName !== providerName) {
            dispatch('rename', { newName: editingName.trim() });
            providerName = editingName.trim();
        }
        isEditingName = false;
    }

    // 取消编辑
    function cancelEditName() {
        editingName = providerName;
        isEditingName = false;
    }

    // 同步 providerName 的变化
    $: if (!isEditingName) {
        editingName = providerName;
    }
</script>

<div class="provider-config">
    <div class="provider-config__header">
        {#if isCustomProvider && isEditingName}
            <div class="provider-name-editor">
                <input
                    class="b3-text-field provider-name-input"
                    type="text"
                    bind:value={editingName}
                    on:keydown={e => {
                        if (e.key === 'Enter') saveName();
                        if (e.key === 'Escape') cancelEditName();
                    }}
                    placeholder="输入平台名称"
                />
                <button class="b3-button b3-button--text" on:click={saveName} title="保存">
                    <svg class="b3-button__icon">
                        <use xlink:href="#iconCheck"></use>
                    </svg>
                </button>
                <button class="b3-button b3-button--text" on:click={cancelEditName} title="取消">
                    <svg class="b3-button__icon">
                        <use xlink:href="#iconClose"></use>
                    </svg>
                </button>
            </div>
        {:else}
            <div class="provider-header-content">
                <h4>{providerName}</h4>
                {#if websiteUrl}
                    <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="platform-link"
                        title="访问平台官网"
                    >
                        <svg class="b3-button__icon">
                            <use xlink:href="#iconLink"></use>
                        </svg>
                        <span>访问平台</span>
                    </a>
                {/if}
            </div>
            {#if isCustomProvider}
                <button
                    class="b3-button b3-button--text edit-name-button"
                    on:click={startEditName}
                    title="编辑名称"
                >
                    <svg class="b3-button__icon">
                        <use xlink:href="#iconEdit"></use>
                    </svg>
                </button>
            {/if}
        {/if}
    </div>

    <div class="provider-config__section">
        <div>
            <div class="b3-label__text">API Key</div>
            <div class="api-key-input-wrapper">
                {#if showApiKey}
                    <input
                        class="b3-text-field fn__flex-1"
                        type="text"
                        bind:value={config.apiKey}
                        on:change={() => dispatch('change')}
                        placeholder={t('settings.ai.apiKey.description')}
                    />
                {:else}
                    <input
                        class="b3-text-field fn__flex-1"
                        type="password"
                        bind:value={config.apiKey}
                        on:change={() => dispatch('change')}
                        placeholder={t('settings.ai.apiKey.description')}
                    />
                {/if}
                <button
                    class="b3-button b3-button--text api-key-toggle"
                    on:click={() => (showApiKey = !showApiKey)}
                >
                    <svg class="b3-button__icon">
                        <use xlink:href={showApiKey ? '#iconEye' : '#iconEyeoff'}></use>
                    </svg>
                </button>
            </div>
        </div>

        {#if isCustomProvider}
            <div>
                <div class="b3-label__text">
                    {t('platform.apiUrl')}
                </div>
                <input
                    class="b3-text-field fn__flex-1"
                    type="text"
                    style="width: 100%"
                    bind:value={config.customApiUrl}
                    on:change={() => dispatch('change')}
                    placeholder={t('platform.apiUrlPlaceholder')}
                />
                {#if apiPreview}
                    <div class="api-preview">
                        <div class="api-preview__url">{apiPreview}</div>
                    </div>
                {/if}
                <div class="b3-label__text label-description">
                    {t('platform.apiUrlHint')}
                </div>
            </div>
        {/if}

        <div>
            <div class="b3-label__text">{t('models.management')}</div>
            <div class="provider-config__model-buttons">
                <button
                    class="b3-button b3-button--outline"
                    on:click={openModelSearchModal}
                    disabled={isLoadingModels || !config.apiKey}
                >
                    {isLoadingModels ? t('common.loading') : t('common.searchAndAdd')}
                </button>
                <button class="b3-button b3-button--outline" on:click={openAddModelModal}>
                    {t('models.manualAdd')}
                </button>
            </div>
        </div>

        <!-- 高级自定义设置 -->
        <div class="advanced-config-section">
            <button
                class="b3-button b3-button--text advanced-toggle"
                on:click={() => (showAdvancedConfig = !showAdvancedConfig)}
            >
                <svg class="b3-button__icon" style="transition: transform 0.2s">
                    <use
                        xlink:href="#iconDown"
                        style="transform: rotate({showAdvancedConfig ? 0 : -90}deg)"
                    ></use>
                </svg>
                <span>{t('platform.advanced')}</span>
            </button>

            {#if showAdvancedConfig}
                <div class="advanced-config-content">
                    <div class="b3-label__text advanced-hint">
                        {t('platform.advancedConfig.hint')}
                    </div>

                    <div>
                        <div class="b3-label__text">{t('platform.advancedConfig.modelsUrl')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            style="width: 100%"
                            bind:value={config.advancedConfig.customModelsUrl}
                            on:change={() => dispatch('change')}
                            placeholder={t('platform.advancedConfig.modelsUrlPlaceholder')}
                        />
                    </div>

                    <div>
                        <div class="b3-label__text">{t('platform.advancedConfig.chatUrl')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            style="width: 100%"
                            bind:value={config.advancedConfig.customChatUrl}
                            on:change={() => dispatch('change')}
                            placeholder={t('platform.advancedConfig.chatUrlPlaceholder')}
                        />
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- 模型搜索弹窗 -->
    {#if showModelSearchModal}
        <div class="modal-overlay" on:click={closeModelSearchModal}>
            <div class="modal-content modal-content--large" on:click|stopPropagation>
                <div class="modal-header">
                    <h4>{t('common.searchAndAdd')}</h4>
                    <button class="modal-close" on:click={closeModelSearchModal}>
                        <svg class="b3-button__icon" style="width: 13px;height: 13px">
                            <use xlink:href="#iconClose"></use>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    {#if availableModels.length > 0}
                        <div>
                            <input
                                class="b3-text-field fn__flex-1"
                                style="width: 100%"
                                type="text"
                                bind:value={searchQuery}
                                placeholder={t('models.searchPlaceholder')}
                            />
                        </div>

                        <div class="model-search-results">
                            {#each filteredModels.slice(0, 200) as model}
                                <div class="model-search-item">
                                    <div class="model-search-item__info">
                                        <span class="model-search-item__name">{model.name}</span>
                                        <span class="model-search-item__id">{model.id}</span>
                                    </div>
                                    <button
                                        class="b3-button b3-button--text"
                                        on:click={() => addModel(model.id, model.name)}
                                        disabled={config.models.some(m => m.id === model.id)}
                                    >
                                        {config.models.some(m => m.id === model.id)
                                            ? t('models.alreadyAdded')
                                            : t('models.add')}
                                    </button>
                                </div>
                            {/each}
                            {#if filteredModels.length === 0}
                                <div class="model-search-empty">{t('models.noMatch')}</div>
                            {/if}
                        </div>
                    {:else}
                        <div class="loading-models">
                            <div class="loading-spinner"></div>
                            <span>{t('models.fetching')}</span>
                        </div>
                    {/if}
                </div>
                <div class="modal-footer">
                    <button class="b3-button b3-button--text" on:click={closeModelSearchModal}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if config.models.length > 0}
        <div class="provider-config__models">
            <h5>{t('models.added')}</h5>
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
                            <span>{t('models.temperature')}: {model.temperature}</span>
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
                            <span>{t('models.maxTokens')}</span>
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
                        <div class="model-config-item">
                            <span>{t('models.capabilities')}</span>
                            <div class="model-capabilities">
                                <label class="">
                                    <input
                                        type="checkbox"
                                        class="b3-switch"
                                        checked={model.capabilities?.thinking || false}
                                        on:change={e => {
                                            if (!model.capabilities) model.capabilities = {};
                                            model.capabilities.thinking = e.currentTarget.checked;
                                            updateModel(
                                                model.id,
                                                'capabilities',
                                                model.capabilities
                                            );
                                        }}
                                    />
                                    <span class="capability-label">{t('models.thinking')}</span>
                                </label>
                                <label class="">
                                    <input
                                        type="checkbox"
                                        class="b3-switch"
                                        checked={model.capabilities?.vision || false}
                                        on:change={e => {
                                            if (!model.capabilities) model.capabilities = {};
                                            model.capabilities.vision = e.currentTarget.checked;
                                            updateModel(
                                                model.id,
                                                'capabilities',
                                                model.capabilities
                                            );
                                        }}
                                    />
                                    <span class="capability-label">{t('models.vision')}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- 手动添加模型弹窗 -->
    {#if showAddModelModal}
        <div class="modal-overlay" on:click={closeAddModelModal}>
            <div class="modal-content" on:click|stopPropagation>
                <div class="modal-header">
                    <h4>{t('models.manual')}</h4>
                    <button class="modal-close" on:click={closeAddModelModal}>
                        <svg class="b3-button__icon" style="width: 13px;height: 13px">
                            <use xlink:href="#iconClose"></use>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div>
                        <div class="b3-label__text">{t('models.id')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            bind:value={manualModelId}
                            placeholder={t('models.idPlaceholder')}
                            on:keydown={e => e.key === 'Enter' && addManualModel()}
                        />
                    </div>
                    <div>
                        <div class="b3-label__text">{t('models.name')}</div>
                        <input
                            class="b3-text-field fn__flex-1"
                            type="text"
                            bind:value={manualModelName}
                            placeholder={t('models.namePlaceholder')}
                            on:keydown={e => e.key === 'Enter' && addManualModel()}
                        />
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="b3-button b3-button--text" on:click={closeAddModelModal}>
                        {t('common.cancel')}
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        on:click={addManualModel}
                        disabled={!manualModelId.trim()}
                    >
                        {t('models.addModel')}
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .provider-config {
        padding: 16px;
        background: var(--b3-theme-surface);
        border-radius: 6px;
        height: 100%;
        overflow-y: auto;
    }

    .provider-config__header {
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .provider-header-content {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
    }

    .platform-link {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--b3-theme-primary);
        text-decoration: none;
        border-radius: 4px;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-primary-lightest);
            color: var(--b3-theme-primary);
        }

        svg {
            width: 14px;
            height: 14px;
        }
    }

    .provider-name-editor {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
    }

    .provider-name-input {
        flex: 1;
        font-size: 16px;
        font-weight: 600;
    }

    .edit-name-button {
        opacity: 0.6;
        transition: opacity 0.2s;

        &:hover {
            opacity: 1;
        }
    }

    .provider-config__section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .api-key-input-wrapper {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
    }

    .api-key-toggle {
        flex-shrink: 0;
        opacity: 0.6;
        transition: opacity 0.2s;

        &:hover {
            opacity: 1;
        }
    }

    .api-preview {
        margin-top: 8px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        word-break: break-all;
        background: var(--b3-theme-surface);
        padding: 6px;
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
    }

    .api-preview__url {
        margin-top: 4px;
        color: var(--b3-theme-on-surface);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono',
            monospace;
        font-size: 13px;
    }

    .provider-config__model-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;

        button {
            flex: 1;
            min-width: 0;
        }
    }

    .label-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        font-weight: normal;
        margin-left: 4px;
    }

    .label-description {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-top: 4px;
        line-height: 1.4;
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

    .model-capabilities {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 4px;

        .b3-label {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0;
        }

        .capability-label {
            font-size: 12px;
            color: var(--b3-theme-on-surface);
        }
    }

    // 弹窗样式
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal-content {
        background: var(--b3-theme-background);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        min-width: 400px;
        max-width: 600px;
        animation: modalShow 0.2s ease-out;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .modal-close {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: var(--b3-theme-on-surface-light);
        border-radius: 4px;

        &:hover {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-on-background);
        }
    }

    .modal-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 20px;
        border-top: 1px solid var(--b3-border-color);
    }

    @keyframes modalShow {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    // 模型搜索弹窗专用样式
    .modal-content--large {
        min-width: 600px;
        max-width: 800px;
        max-height: 70vh;
    }

    .model-search-results {
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
    }

    .model-search-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        border-bottom: 1px solid var(--b3-border-color);

        &:last-child {
            border-bottom: none;
        }

        &:hover {
            background: var(--b3-theme-surface);
        }
    }

    .model-search-item__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
    }

    .model-search-item__name {
        font-size: 14px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
    }

    .model-search-item__id {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }

    .model-search-empty {
        padding: 40px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }

    .loading-models {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 40px;
        color: var(--b3-theme-on-surface);
    }

    .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--b3-theme-border);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    // 高级设置样式
    .advanced-config-section {
        margin-top: 8px;
        border-top: 1px solid var(--b3-border-color);
        padding-top: 8px;
    }

    .advanced-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        width: 100%;
        justify-content: flex-start;
        color: var(--b3-theme-on-surface);
        font-size: 13px;

        &:hover {
            color: var(--b3-theme-on-background);
        }

        .b3-button__icon {
            width: 14px;
            height: 14px;
        }
    }

    .advanced-config-content {
        margin-top: 12px;
        padding: 12px;
        background: var(--b3-theme-background);
        border-radius: 6px;
        border: 1px solid var(--b3-border-color);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .advanced-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.4;
        margin-bottom: 4px;
        padding: 8px;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        border-left: 3px solid var(--b3-theme-primary);
    }
</style>
