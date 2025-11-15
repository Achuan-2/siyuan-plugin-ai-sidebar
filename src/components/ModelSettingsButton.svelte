<script lang="ts">
    import { createEventDispatcher, tick, onMount } from 'svelte';
    import { t } from '../utils/i18n';
    import { pushMsg } from '@/api';
    import { confirm } from 'siyuan';

    export let providers: Record<string, any> = {};
    export let currentProvider = '';
    export let currentModelId = '';
    export let appliedSettings = {
        contextCount: 10,
        temperature: 0.7,
        systemPrompt: '',
    };
    export let plugin: any;

    const dispatch = createEventDispatcher();

    let isOpen = false;
    let dropdownTop = 0;
    let dropdownLeft = 0;
    let buttonElement: HTMLButtonElement;
    let dropdownElement: HTMLDivElement;

    // 模型设置（临时值，用于编辑）
    let tempContextCount = 10;
    let tempTemperature = 0.7;
    let tempSystemPrompt = '';

    // 预设管理
    interface Preset {
        id: string;
        name: string;
        contextCount: number;
        temperature: number;
        systemPrompt: string;
        createdAt: number;
    }

    let presets: Preset[] = [];
    let selectedPresetId: string = '';
    let showPresetManager = true; // 默认显示预设管理
    let newPresetName = '';

    // 获取当前模型配置
    function getCurrentModelConfig() {
        if (!currentProvider || !currentModelId) return null;

        let providerConfig: any = null;
        if (providers[currentProvider] && !Array.isArray(providers[currentProvider])) {
            providerConfig = providers[currentProvider];
        } else if (providers.customProviders && Array.isArray(providers.customProviders)) {
            providerConfig = providers.customProviders.find((p: any) => p.id === currentProvider);
        }

        if (!providerConfig) return null;
        return providerConfig.models.find((m: any) => m.id === currentModelId);
    }

    // 加载预设
    async function loadPresets() {
        const settings = await plugin.loadSettings();
        presets = settings.modelPresets || [];
        selectedPresetId = settings.selectedModelPresetId || '';
    }

    // 保存预设到设置
    async function savePresetsToStorage() {
        const settings = await plugin.loadSettings();
        settings.modelPresets = presets;
        await plugin.saveSettings(settings);
    }

    // 保存选中的预设ID
    async function saveSelectedPresetId(presetId: string) {
        const settings = await plugin.loadSettings();
        settings.selectedModelPresetId = presetId;
        await plugin.saveSettings(settings);
    }

    // 加载选中的预设ID
    async function loadSelectedPresetId(): Promise<string> {
        const settings = await plugin.loadSettings();
        return settings.selectedModelPresetId || '';
    }

    // 保存当前设置为预设
    async function saveAsPreset() {
        if (!newPresetName.trim()) {
            pushMsg(t('aiSidebar.modelSettings.enterPresetName'));
            return;
        }

        const preset: Preset = {
            id: Date.now().toString(),
            name: newPresetName.trim(),
            contextCount: tempContextCount,
            temperature: tempTemperature,
            systemPrompt: tempSystemPrompt,
            createdAt: Date.now(),
        };

        presets = [...presets, preset];
        await savePresetsToStorage();
        newPresetName = '';
        // 不关闭预设管理器
        // showPresetManager = false;

        // 自动选择新建的预设
        selectedPresetId = preset.id;
        await saveSelectedPresetId(preset.id);

        pushMsg(t('aiSidebar.modelSettings.presetSaved'));
    }

    // 加载预设
    async function loadPreset(presetId: string) {
        // 如果点击的是已选择的预设，则取消选择
        if (selectedPresetId === presetId) {
            selectedPresetId = '';
            await saveSelectedPresetId('');
            // 重置为当前应用的设置
            await resetToAppliedSettings();
            return;
        }

        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            tempContextCount = preset.contextCount;
            tempTemperature = preset.temperature;
            tempSystemPrompt = preset.systemPrompt;
            selectedPresetId = presetId;
            // 保存选中的预设ID
            await saveSelectedPresetId(presetId);
        }
    }

    // 删除预设
    function deletePreset(presetId: string) {
        // 临时移除外部点击监听器，防止确认对话框关闭dropdown
        document.removeEventListener('click', closeOnOutsideClick);

        confirm(
            t('aiSidebar.modelSettings.deletePreset'),
            t('aiSidebar.modelSettings.confirmDelete'),
            async () => {
                presets = presets.filter(p => p.id !== presetId);
                await savePresetsToStorage();
                if (selectedPresetId === presetId) {
                    selectedPresetId = '';
                    await saveSelectedPresetId('');
                }
                pushMsg(t('aiSidebar.modelSettings.presetDeleted'));

                // 重新添加外部点击监听器
                setTimeout(() => {
                    if (isOpen) {
                        document.addEventListener('click', closeOnOutsideClick);
                    }
                }, 0);
            },
            () => {
                // 用户取消删除，重新添加外部点击监听器
                setTimeout(() => {
                    if (isOpen) {
                        document.addEventListener('click', closeOnOutsideClick);
                    }
                }, 0);
            }
        );
    }

    // 更新预设
    async function updatePreset(presetId: string) {
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            preset.contextCount = tempContextCount;
            preset.temperature = tempTemperature;
            preset.systemPrompt = tempSystemPrompt;
            await savePresetsToStorage();
            // 触发响应式更新
            presets = [...presets];
            pushMsg(t('aiSidebar.modelSettings.presetUpdated'));
        }
    }

    // 实时应用设置
    function applySettings() {
        dispatch('apply', {
            contextCount: tempContextCount,
            temperature: tempTemperature,
            systemPrompt: tempSystemPrompt,
        });
    }

    // 监听设置值的变化，自动应用
    $: if (
        isOpen &&
        (tempContextCount !== appliedSettings.contextCount ||
            tempTemperature !== appliedSettings.temperature ||
            tempSystemPrompt !== appliedSettings.systemPrompt)
    ) {
        applySettings();

        // 如果有选中的预设，检查当前值是否与预设匹配
        if (selectedPresetId) {
            const selectedPreset = presets.find(p => p.id === selectedPresetId);
            if (selectedPreset) {
                // 如果当前值与预设不匹配，取消选择
                if (
                    selectedPreset.contextCount !== tempContextCount ||
                    selectedPreset.temperature !== tempTemperature ||
                    selectedPreset.systemPrompt !== tempSystemPrompt
                ) {
                    selectedPresetId = '';
                    saveSelectedPresetId('');
                }
            }
        }
    }

    // 重置临时值为当前应用的设置
    async function resetToAppliedSettings() {
        tempContextCount = appliedSettings.contextCount;
        tempTemperature = appliedSettings.temperature;
        tempSystemPrompt = appliedSettings.systemPrompt;

        // 检查当前应用的设置是否与某个预设匹配
        const savedPresetId = await loadSelectedPresetId();
        if (savedPresetId) {
            const preset = presets.find(p => p.id === savedPresetId);
            if (
                preset &&
                preset.contextCount === appliedSettings.contextCount &&
                preset.temperature === appliedSettings.temperature &&
                preset.systemPrompt === appliedSettings.systemPrompt
            ) {
                // 设置匹配，保持预设选择
                selectedPresetId = savedPresetId;
            } else {
                // 设置不匹配，清空预设选择
                selectedPresetId = '';
            }
        } else {
            selectedPresetId = '';
        }
    }

    // 重置为默认值
    async function resetToDefaults() {
        const modelConfig = getCurrentModelConfig();
        tempContextCount = 10;
        tempTemperature = modelConfig?.temperature ?? 0.7;
        tempSystemPrompt = '';
        selectedPresetId = '';
        // 清除保存的预设ID
        await saveSelectedPresetId('');
    }

    // 打开面板时，重置临时值为当前应用的设置
    async function openDropdown() {
        await resetToAppliedSettings();
        isOpen = true;
        await loadPresets();
        updateDropdownPosition();
        setTimeout(() => {
            document.addEventListener('click', closeOnOutsideClick);
        }, 0);
    }

    // 关闭下拉菜单
    function closeOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.model-settings-button')) {
            isOpen = false;
        }
    }

    // 打开/关闭下拉菜单
    function toggleDropdown() {
        if (!isOpen) {
            openDropdown();
        } else {
            isOpen = false;
            document.removeEventListener('click', closeOnOutsideClick);
        }
    }

    // 计算下拉菜单位置
    async function updateDropdownPosition() {
        if (!buttonElement || !isOpen) return;

        await tick();

        const rect = buttonElement.getBoundingClientRect();
        const dropdownWidth = dropdownElement?.offsetWidth || 360;
        const dropdownHeight = dropdownElement?.offsetHeight || 400;

        // 计算垂直位置
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (spaceAbove >= dropdownHeight || spaceAbove >= spaceBelow) {
            // 显示在按钮上方
            dropdownTop = rect.top - dropdownHeight - 4;
        } else {
            // 显示在按钮下方
            dropdownTop = rect.bottom + 4;
        }

        // 计算水平位置（左对齐按钮）
        dropdownLeft = rect.left;

        // 确保下拉菜单不会超出视口右边界
        if (dropdownLeft + dropdownWidth > window.innerWidth - 8) {
            dropdownLeft = window.innerWidth - dropdownWidth - 8;
        }

        // 确保下拉菜单不会超出视口左边界
        if (dropdownLeft < 8) {
            dropdownLeft = 8;
        }
    }

    $: if (isOpen) {
        updateDropdownPosition();
    }

    // 组件挂载时，自动加载上次选择的预设
    onMount(async () => {
        await loadPresets();
        const savedPresetId = await loadSelectedPresetId();
        if (savedPresetId) {
            const preset = presets.find(p => p.id === savedPresetId);
            if (preset) {
                // 自动应用保存的预设
                tempContextCount = preset.contextCount;
                tempTemperature = preset.temperature;
                tempSystemPrompt = preset.systemPrompt;
                selectedPresetId = savedPresetId;
                // 触发应用
                applySettings();
            } else {
                // 预设已被删除，清除保存的ID
                await saveSelectedPresetId('');
            }
        }
    });
</script>

<div class="model-settings-button">
    <button
        bind:this={buttonElement}
        class="b3-button b3-button--text"
        on:click|stopPropagation={toggleDropdown}
        title={t('aiSidebar.modelSettings.title')}
    >
        <svg class="b3-button__icon"><use xlink:href="#iconEdit"></use></svg>
    </button>

    {#if isOpen}
        <div
            bind:this={dropdownElement}
            class="model-settings-dropdown"
            style="top: {dropdownTop}px; left: {dropdownLeft}px;"
        >
            <div class="model-settings-header">
                <h4>{t('aiSidebar.modelSettings.title')}</h4>
                <button
                    class="b3-button b3-button--text"
                    on:click={() => (isOpen = false)}
                    title={t('common.close')}
                >
                    <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                </button>
            </div>

            <div class="model-settings-content">
                <!-- 上下文数设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.contextCount')}
                        <span class="model-settings-value">{tempContextCount}</span>
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="50"
                        step="1"
                        bind:value={tempContextCount}
                        class="b3-slider"
                    />
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.contextCountHint')}
                    </div>
                </div>

                <!-- Temperature设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.temperature')}
                        <span class="model-settings-value">{tempTemperature.toFixed(2)}</span>
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        bind:value={tempTemperature}
                        class="b3-slider"
                    />
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.temperatureHint')}
                    </div>
                </div>

                <!-- 系统提示词设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.systemPrompt')}
                    </label>
                    <textarea
                        bind:value={tempSystemPrompt}
                        class="b3-text-field model-settings-textarea"
                        placeholder={t('aiSidebar.modelSettings.systemPromptPlaceholder')}
                        rows="4"
                    ></textarea>
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.systemPromptHint')}
                    </div>
                </div>

                <!-- 预设管理 -->
                <div class="model-settings-item">
                    <div class="model-settings-preset-header">
                        <label class="model-settings-label">
                            {t('aiSidebar.modelSettings.presets')}
                        </label>
                        <button
                            class="b3-button b3-button--text"
                            on:click={() => (showPresetManager = !showPresetManager)}
                            title={showPresetManager
                                ? t('aiSidebar.modelSettings.hidePresetManager')
                                : t('aiSidebar.modelSettings.showPresetManager')}
                        >
                            <svg class="b3-button__icon">
                                <use
                                    xlink:href={showPresetManager ? '#iconContract' : '#iconAdd'}
                                ></use>
                            </svg>
                        </button>
                    </div>

                    {#if showPresetManager}
                        <div class="model-settings-preset-manager">
                            <div class="model-settings-preset-new">
                                <input
                                    type="text"
                                    bind:value={newPresetName}
                                    class="b3-text-field"
                                    placeholder={t('aiSidebar.modelSettings.presetName')}
                                />
                                <button
                                    class="b3-button b3-button--primary"
                                    on:click={saveAsPreset}
                                >
                                    {t('aiSidebar.modelSettings.savePreset')}
                                </button>
                            </div>

                            {#if presets.length > 0}
                                <div class="model-settings-preset-list">
                                    {#each presets as preset}
                                        <div
                                            class="model-settings-preset-item"
                                            class:model-settings-preset-item--selected={selectedPresetId ===
                                                preset.id}
                                            role="button"
                                            tabindex="0"
                                            on:click={() => loadPreset(preset.id)}
                                            on:keydown={e =>
                                                e.key === 'Enter' && loadPreset(preset.id)}
                                        >
                                            <div class="model-settings-preset-info">
                                                <div class="model-settings-preset-name">
                                                    {#if selectedPresetId === preset.id}
                                                        <svg
                                                            class="model-settings-preset-selected-icon"
                                                        >
                                                            <use xlink:href="#iconCheck"></use>
                                                        </svg>
                                                    {/if}
                                                    {preset.name}
                                                </div>
                                                <div class="model-settings-preset-details">
                                                    {t('aiSidebar.modelSettings.contextCount')}: {preset.contextCount}
                                                    | {t('aiSidebar.modelSettings.temperature')}: {preset.temperature.toFixed(
                                                        2
                                                    )}
                                                </div>
                                            </div>
                                            <div class="model-settings-preset-actions">
                                                <button
                                                    class="b3-button b3-button--text"
                                                    on:click|stopPropagation={() =>
                                                        updatePreset(preset.id)}
                                                    title={t(
                                                        'aiSidebar.modelSettings.updatePreset'
                                                    )}
                                                >
                                                    <svg class="b3-button__icon">
                                                        <use xlink:href="#iconRefresh"></use>
                                                    </svg>
                                                </button>
                                                <button
                                                    class="b3-button b3-button--text"
                                                    on:click|stopPropagation={() =>
                                                        deletePreset(preset.id)}
                                                    title={t(
                                                        'aiSidebar.modelSettings.deletePreset'
                                                    )}
                                                >
                                                    <svg class="b3-button__icon">
                                                        <use xlink:href="#iconTrashcan"></use>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div class="model-settings-empty">
                                    {t('aiSidebar.modelSettings.noPresets')}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>

            <div class="model-settings-footer">
                <button class="b3-button b3-button--text" on:click={resetToDefaults}>
                    {t('aiSidebar.modelSettings.reset')}
                </button>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .model-settings-button {
        position: relative;
    }

    .model-settings-dropdown {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        width: 360px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        z-index: 1000;
    }

    .model-settings-header {
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
    }

    .model-settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .model-settings-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .model-settings-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }

    .model-settings-value {
        font-size: 12px;
        color: var(--b3-theme-primary);
        font-weight: 600;
    }

    .model-settings-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-top: -4px;
    }

    .model-settings-textarea {
        resize: vertical;
        min-height: 60px;
        font-family: var(--b3-font-family);
        font-size: 12px;
    }

    .model-settings-preset-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .model-settings-empty {
        text-align: center;
        padding: 12px;
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        background: var(--b3-theme-surface);
        border-radius: 4px;
    }

    .model-settings-preset-manager {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--b3-border-color);
    }

    .model-settings-preset-new {
        display: flex;
        gap: 8px;

        input {
            flex: 1;
        }

        button {
            white-space: nowrap;
            font-size: 12px;
        }
    }

    .model-settings-preset-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .model-settings-preset-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-background);
            border-color: var(--b3-theme-primary-light);
        }

        &--selected {
            background: var(--b3-theme-primary-lightest);
            border-color: var(--b3-theme-primary);

            .model-settings-preset-name {
                color: var(--b3-theme-primary);
                font-weight: 600;
            }
        }
    }

    .model-settings-preset-info {
        flex: 1;
        min-width: 0;
        pointer-events: none; // 防止子元素拦截点击事件
    }

    .model-settings-preset-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
    }

    .model-settings-preset-name {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .model-settings-preset-selected-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        color: var(--b3-theme-primary);
    }

    .model-settings-preset-details {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }

    .model-settings-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
    }

    .b3-slider {
        width: 100%;
    }
</style>
