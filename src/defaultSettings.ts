import { t } from "./utils/i18n";

export interface ModelConfig {
    id: string;
    name: string;
    temperature: number;
    maxTokens: number;
}

export interface ProviderConfig {
    apiKey: string;
    customApiUrl: string;
    models: ModelConfig[];
}

export interface CustomProviderConfig extends ProviderConfig {
    id: string;
    name: string;
}

export const getDefaultSettings = () => ({
    textinput: t('settings.textinput.value'),
    slider: 0.5,
    checkbox: false,
    textarea: t('settings.textarea.value'),
    select: 'option1',

    // AI 设置 - 新的多平台多模型结构
    aiProviders: {
        gemini: {
            apiKey: '',
            customApiUrl: '',
            models: []
        },
        deepseek: {
            apiKey: '',
            customApiUrl: '',
            models: []
        },
        openai: {
            apiKey: '',
            customApiUrl: '',
            models: []
        },
        volcano: {
            apiKey: '',
            customApiUrl: '',
            models: []
        },
        customProviders: [] as CustomProviderConfig[]
    } as Record<string, any>,
    selectedProviderId: 'openai' as string,  // 设置面板中选中的平台
    currentProvider: 'openai' as string,      // 对话中当前使用的平台
    currentModelId: '' as string,
    aiSystemPrompt: 'You are a helpful AI assistant.',

    // 保留旧设置以便兼容升级
    aiProvider: 'openai',
    aiApiKey: '',
    aiModel: '',
    aiCustomApiUrl: '',
    aiTemperature: 0.7,
    aiMaxTokens: 2000,
});
