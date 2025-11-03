/**
 * AI Chat API 调用模块
 * 支持多个AI平台的API调用和流式输出
 */

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatOptions {
    apiKey: string;
    model: string;
    messages: Message[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    onChunk?: (chunk: string) => void;
    onComplete?: (fullText: string) => void;
    onError?: (error: Error) => void;
}

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
}

export type AIProvider = 'gemini' | 'deepseek' | 'openai' | 'volcano' | 'custom';

interface ProviderConfig {
    name: string;
    baseUrl: string;
    modelsEndpoint: string;
    chatEndpoint: string;
    apiKeyHeader: string;
}

// 预定义的AI平台配置
const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
    gemini: {
        name: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        modelsEndpoint: '/v1beta/models',
        chatEndpoint: '/v1beta/models/{model}:streamGenerateContent',
        apiKeyHeader: 'x-goog-api-key'
    },
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization'
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization'
    },
    volcano: {
        name: '火山引擎',
        baseUrl: 'https://ark.cn-beijing.volces.com',
        modelsEndpoint: '/api/v3/models',
        chatEndpoint: '/api/v3/chat/completions',
        apiKeyHeader: 'Authorization'
    },
    custom: {
        name: 'Custom',
        baseUrl: '',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization'
    }
};

/**
 * 标准化API地址
 * @param url 用户输入的API地址
 * @returns 标准化后的地址和是否强制使用
 */
function normalizeApiUrl(url: string): { url: string; force: boolean } {
    if (!url) return { url: '', force: false };

    const force = url.endsWith('#');
    url = url.replace(/#$/, '');

    // 移除末尾的斜杠
    url = url.replace(/\/$/, '');

    // 如果不是强制使用，移除 /v1
    if (!force) {
        url = url.replace(/\/v1$/, '');
    }

    return { url, force };
}

/**
 * 获取模型列表
 */
export async function fetchModels(
    provider: string,
    apiKey: string,
    customApiUrl?: string
): Promise<ModelInfo[]> {
    // 检查是否是内置平台
    const builtInProviders: Record<string, boolean> = {
        gemini: true,
        deepseek: true,
        openai: true,
        volcano: true
    };

    let config: ProviderConfig;
    let baseUrl: string;

    if (builtInProviders[provider]) {
        config = PROVIDER_CONFIGS[provider as AIProvider];
        baseUrl = config.baseUrl;

        if (provider === 'custom' && customApiUrl) {
            const normalized = normalizeApiUrl(customApiUrl);
            baseUrl = normalized.url;
        }
    } else {
        // 自定义平台
        if (!customApiUrl) {
            throw new Error('Custom provider requires API URL');
        }

        const normalized = normalizeApiUrl(customApiUrl);
        baseUrl = normalized.url;
        config = {
            name: 'Custom',
            baseUrl: baseUrl,
            modelsEndpoint: '/v1/models',
            chatEndpoint: '/v1/chat/completions',
            apiKeyHeader: 'Authorization'
        };
    }

    const url = `${baseUrl}${config.modelsEndpoint}`;

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // 处理不同平台的认证方式
        if (provider === 'gemini') {
            headers[config.apiKeyHeader] = apiKey;
        } else {
            headers[config.apiKeyHeader] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // 处理不同平台的响应格式
        if (provider === 'gemini') {
            return (data.models || []).map((model: any) => ({
                id: model.name.replace('models/', ''),
                name: model.displayName || model.name,
                provider: config.name
            }));
        } else {
            return (data.data || []).map((model: any) => ({
                id: model.id,
                name: model.id,
                provider: config.name
            }));
        }
    } catch (error) {
        console.error('Error fetching models:', error);
        throw error;
    }
}

/**
 * 发送聊天请求 (OpenAI 格式)
 */
async function chatOpenAIFormat(
    baseUrl: string,
    apiKey: string,
    endpoint: string,
    options: ChatOptions
): Promise<void> {
    const url = `${baseUrl}${endpoint}`;

    const requestBody = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: options.stream !== false
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        if (options.stream !== false && response.body) {
            await handleStreamResponse(response.body, options);
        } else {
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            options.onChunk?.(content);
            options.onComplete?.(content);
        }
    } catch (error) {
        console.error('Chat error:', error);
        options.onError?.(error as Error);
        throw error;
    }
}

/**
 * 发送聊天请求 (Gemini 格式)
 */
async function chatGeminiFormat(
    baseUrl: string,
    apiKey: string,
    model: string,
    options: ChatOptions
): Promise<void> {
    const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    // 转换消息格式
    const contents = options.messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

    const systemInstruction = options.messages.find(msg => msg.role === 'system');

    const requestBody: any = {
        contents,
        generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens
        }
    };

    if (systemInstruction) {
        requestBody.systemInstruction = {
            parts: [{ text: systemInstruction.content }]
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        if (response.body) {
            await handleGeminiStreamResponse(response.body, options);
        }
    } catch (error) {
        console.error('Gemini chat error:', error);
        options.onError?.(error as Error);
        throw error;
    }
}

/**
 * 处理 OpenAI 格式的流式响应
 */
async function handleStreamResponse(
    body: ReadableStream<Uint8Array>,
    options: ChatOptions
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;

                if (trimmed.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmed.slice(6));
                        const content = json.choices?.[0]?.delta?.content;

                        if (content) {
                            fullText += content;
                            options.onChunk?.(content);
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE data:', e);
                    }
                }
            }
        }

        options.onComplete?.(fullText);
    } catch (error) {
        console.error('Stream reading error:', error);
        options.onError?.(error as Error);
        throw error;
    }
}

/**
 * 处理 Gemini 格式的流式响应
 */
async function handleGeminiStreamResponse(
    body: ReadableStream<Uint8Array>,
    options: ChatOptions
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                try {
                    const json = JSON.parse(trimmed.slice(6));
                    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (content) {
                        fullText += content;
                        options.onChunk?.(content);
                    }
                } catch (e) {
                    console.error('Failed to parse Gemini SSE data:', e);
                }
            }
        }

        options.onComplete?.(fullText);
    } catch (error) {
        console.error('Gemini stream reading error:', error);
        options.onError?.(error as Error);
        throw error;
    }
}

/**
 * 发送聊天请求
 */
export async function chat(
    provider: string,
    options: ChatOptions,
    customApiUrl?: string
): Promise<void> {
    // 检查是否是内置平台
    const builtInProviders: Record<string, boolean> = {
        gemini: true,
        deepseek: true,
        openai: true,
        volcano: true
    };

    let config: ProviderConfig;
    let baseUrl: string;

    if (builtInProviders[provider]) {
        // 使用内置平台配置
        config = PROVIDER_CONFIGS[provider as AIProvider];
        baseUrl = config.baseUrl;

        if (provider === 'custom' && customApiUrl) {
            const normalized = normalizeApiUrl(customApiUrl);
            baseUrl = normalized.url;
        }
    } else {
        // 自定义平台，使用OpenAI兼容格式
        if (!customApiUrl) {
            throw new Error('Custom provider requires API URL');
        }

        const normalized = normalizeApiUrl(customApiUrl);
        baseUrl = normalized.url;
        config = {
            name: 'Custom',
            baseUrl: baseUrl,
            modelsEndpoint: '/v1/models',
            chatEndpoint: '/v1/chat/completions',
            apiKeyHeader: 'Authorization'
        };
    }

    if (provider === 'gemini') {
        await chatGeminiFormat(baseUrl, options.apiKey, options.model, options);
    } else {
        await chatOpenAIFormat(baseUrl, options.apiKey, config.chatEndpoint, options);
    }
}

/**
 * 估算token数量（简单估算，1个中文字符约等于1.5个token，1个英文单词约1个token）
 */
export function estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - chineseChars - text.match(/[a-zA-Z\s]/g)?.length || 0;

    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars * 0.5);
}

/**
 * 计算消息列表的总token数
 */
export function calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
        return total + estimateTokens(msg.content);
    }, 0);
}
