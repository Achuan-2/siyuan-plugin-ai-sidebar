import { t } from "./utils/i18n";

export const getDefaultSettings = () => ({
    textinput: t('settings.textinput.value'),
    slider: 0.5,
    checkbox: false,
    textarea: t('settings.textarea.value'),
    select: 'option1',
    
    // AI 设置
    aiProvider: 'openai', // gemini, deepseek, openai, volcano, custom
    aiApiKey: '',
    aiModel: '',
    aiCustomApiUrl: '',
    aiTemperature: 0.7,
    aiMaxTokens: 2000,
    aiSystemPrompt: 'You are a helpful AI assistant.',
});
