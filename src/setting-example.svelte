<script lang="ts">
    import { onMount } from 'svelte';
    import SettingPanel from '@/libs/components/setting-panel.svelte';
    import { t } from './utils/i18n';
    import { getDefaultSettings } from './defaultSettings';
    import { pushMsg } from './api';
    import { confirm } from 'siyuan';
    import ProviderConfigPanel from './components/ProviderConfigPanel.svelte';
    import CustomProviderManager from './components/CustomProviderManager.svelte';
    import type { CustomProviderConfig } from './defaultSettings';
    export let plugin;

    // 使用动态默认设置
    let settings = { ...getDefaultSettings() };

    interface ISettingGroup {
        name: string;
        items: ISettingItem[];
        //  Type："checkbox" | "select" | "textinput" | "textarea" | "number" | "slider" | "button" | "hint" | "custom";
    }

    const builtInProviderNames: Record<string, string> = {
        gemini: 'Google Gemini',
        deepseek: 'DeepSeek',
        openai: 'OpenAI',
        volcano: '火山引擎',
    };

    // 当前选中的平台ID
    let selectedProviderId = '';

    function handleProviderChange() {
        saveSettings();
    }

    function handleCustomProvidersChange() {
        saveSettings();
    }

    // 获取所有平台选项（内置+自定义）
    function getAllProviderOptions(): Array<{ id: string; name: string }> {
        const builtIn = Object.keys(builtInProviderNames).map(id => ({
            id,
            name: builtInProviderNames[id],
        }));

        const custom = (settings.aiProviders?.customProviders || []).map(
            (p: CustomProviderConfig) => ({
                id: p.id,
                name: p.name,
            })
        );

        return [...builtIn, ...custom];
    }

    // 获取当前选中平台的名称
    function getSelectedProviderName(): string {
        if (!selectedProviderId) return '请选择平台';

        if (builtInProviderNames[selectedProviderId]) {
            return builtInProviderNames[selectedProviderId];
        }

        const customProvider = settings.aiProviders?.customProviders?.find(
            (p: CustomProviderConfig) => p.id === selectedProviderId
        );
        return customProvider?.name || '未知平台';
    }

    // 保存选中的平台ID
    function handleProviderSelect() {
        settings.selectedProviderId = selectedProviderId;
        saveSettings();
    }

    let groups: ISettingGroup[] = [
        {
            name: 'AI 平台配置',
            items: [
                {
                    key: 'aiSystemPrompt',
                    value: settings.aiSystemPrompt,
                    type: 'textarea',
                    title: '系统提示词',
                    description: '设置 AI 的角色和行为',
                    direction: 'row',
                    rows: 4,
                    placeholder: 'You are a helpful AI assistant.',
                },
                {
                    key: 'aiProvidersHint',
                    value: '',
                    type: 'hint',
                    title: '平台配置说明',
                    description:
                        '为每个AI平台配置API Key，然后获取并添加模型。支持每个平台配置多个模型，每个模型可以设置独立的参数。',
                },
            ],
        },
        {
            name: t('settings.settingsGroup.reset') || 'Reset Settings',
            items: [
                {
                    key: 'reset',
                    value: '',
                    type: 'button',
                    title: t('settings.reset.title') || 'Reset Settings',
                    description:
                        t('settings.reset.description') || 'Reset all settings to default values',
                    button: {
                        label: t('settings.reset.label') || 'Reset',
                        callback: async () => {
                            confirm(
                                t('settings.reset.title') || 'Reset Settings',
                                t('settings.reset.confirmMessage') ||
                                    'Are you sure you want to reset all settings to default values? This action cannot be undone.',
                                async () => {
                                    // 确认回调
                                    settings = { ...getDefaultSettings() };
                                    updateGroupItems();
                                    await saveSettings();
                                    await pushMsg(t('settings.reset.message'));
                                },
                                () => {
                                    // 取消回调（可选）
                                    console.log('Reset cancelled');
                                }
                            );
                        },
                    },
                },
            ],
        },
    ];

    let focusGroup = groups[0].name;

    interface ChangeEvent {
        group: string;
        key: string;
        value: any;
    }

    const onChanged = ({ detail }: CustomEvent<ChangeEvent>) => {
        console.log(detail.key, detail.value);
        const setting = settings[detail.key];
        if (setting !== undefined) {
            settings[detail.key] = detail.value;
            saveSettings();
        }
    };

    async function saveSettings() {
        await plugin.saveSettings(settings);
    }

    onMount(async () => {
        await runload();
    });

    async function runload() {
        const loadedSettings = await plugin.loadSettings();
        settings = { ...loadedSettings };

        // 确保 aiProviders 存在
        if (!settings.aiProviders) {
            settings.aiProviders = {
                gemini: { apiKey: '', customApiUrl: '', models: [] },
                deepseek: { apiKey: '', customApiUrl: '', models: [] },
                openai: { apiKey: '', customApiUrl: '', models: [] },
                volcano: { apiKey: '', customApiUrl: '', models: [] },
                customProviders: [],
            };
        }

        // 确保 customProviders 数组存在
        if (!settings.aiProviders.customProviders) {
            settings.aiProviders.customProviders = [];
        }

        // 恢复选中的平台ID
        selectedProviderId = settings.selectedProviderId || 'openai';

        updateGroupItems();
        // 确保设置已保存（可能包含新的默认值）
        await saveSettings();
        console.debug('加载配置文件完成');
    }

    function updateGroupItems() {
        groups = groups.map(group => ({
            ...group,
            items: group.items.map(item => ({
                ...item,
                value: settings[item.key] ?? item.value,
            })),
        }));
    }

    $: currentGroup = groups.find(group => group.name === focusGroup);
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <li
                data-name="editor"
                class:b3-list-item--focus={group.name === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group.name;
                }}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group.name}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        {#if focusGroup === 'AI 平台配置'}
            <div class="ai-config-panel">
                <SettingPanel
                    group={currentGroup?.name || ''}
                    settingItems={currentGroup?.items || []}
                    display={true}
                    on:changed={onChanged}
                />

                <div class="provider-configs">
                    <!-- 自定义平台管理 -->
                    <CustomProviderManager
                        bind:customProviders={settings.aiProviders.customProviders}
                        on:change={handleCustomProvidersChange}
                    />

                    <!-- 平台选择下拉框 -->
                    <div class="provider-selector">
                        <div class="b3-label">
                            <div class="b3-label__text">选择要配置的平台</div>
                            <select
                                class="b3-select fn__flex-1"
                                bind:value={selectedProviderId}
                                on:change={handleProviderSelect}
                            >
                                <option value="" disabled>请选择平台</option>
                                {#each getAllProviderOptions() as option}
                                    <option value={option.id}>{option.name}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <!-- 显示选中平台的配置 -->
                    {#if selectedProviderId}
                        {#if builtInProviderNames[selectedProviderId]}
                            <ProviderConfigPanel
                                providerId={selectedProviderId}
                                providerName={getSelectedProviderName()}
                                bind:config={settings.aiProviders[selectedProviderId]}
                                on:change={handleProviderChange}
                            />
                        {:else}
                            {#each settings.aiProviders.customProviders as customProvider}
                                {#if customProvider.id === selectedProviderId}
                                    <ProviderConfigPanel
                                        providerId={customProvider.id}
                                        providerName={customProvider.name}
                                        bind:config={customProvider}
                                        on:change={handleProviderChange}
                                    />
                                {/if}
                            {/each}
                        {/if}
                    {/if}
                </div>
            </div>
        {:else}
            <SettingPanel
                group={currentGroup?.name || ''}
                settingItems={currentGroup?.items || []}
                display={true}
                on:changed={onChanged}
            />
        {/if}
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
        display: flex;
        flex-direction: row;
        overflow: hidden;
    }
    .config__panel > .b3-tab-bar {
        width: 170px;
    }

    .config__tab-wrap {
        flex: 1;
        height: 100%;
        overflow: auto;
        padding: 2px;
    }

    .ai-config-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .provider-configs {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .provider-selector {
        background: var(--b3-theme-surface);
        border-radius: 6px;
        padding: 16px;
    }
</style>
