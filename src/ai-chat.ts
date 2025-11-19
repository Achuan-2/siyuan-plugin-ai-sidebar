/**
 * AI Chat API 调用模块
 * 支持多个AI平台的API调用和流式输出
 */

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface MessageAttachment {
    type: 'image' | 'file';
    name: string;
    data: string; // base64 或 URL
    mimeType?: string;
}

export interface MessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
}

export interface EditOperation {
    operationType?: 'update' | 'insert'; // 操作类型：update=更新块，insert=插入块，默认为update
    blockId: string; // update时为要更新的块ID，insert时为参考块ID
    newContent: string;
    oldContent?: string; // kramdown格式的旧内容，用于实际应用编辑
    oldContentForDisplay?: string; // Markdown格式的旧内容，用于显示差异
    newContentForDisplay?: string; // Markdown格式的新内容，用于显示差异
    status: 'pending' | 'applied' | 'rejected';
    // insert操作的额外参数
    position?: 'before' | 'after'; // 插入位置：before=在blockId之前，after=在blockId之后
}

export interface ContextDocument {
    id: string;
    title: string;
    content: string;
    type?: 'doc' | 'block'; // 标识是文档还是块
}

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | MessageContent[];
    attachments?: MessageAttachment[];
    contextDocuments?: ContextDocument[]; // 关联的上下文文档
    thinking?: string; // 思考过程内容
    editOperations?: EditOperation[]; // 编辑操作
    tool_calls?: ToolCall[]; // Tool Calls
    tool_call_id?: string; // Tool 结果的 call_id
    name?: string; // Tool 的名称
    finalReply?: string; // Agent模式：工具调用后的最终回复
    multiModelResponses?: Array<{
        provider: string;
        modelId: string;
        modelName: string;
        content: string;
        thinking?: string;
        isLoading: boolean;
        error?: string;
        isSelected?: boolean; // 是否被选择
    }>; // 多模型响应
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
    signal?: AbortSignal; // 用于中断请求
    enableThinking?: boolean; // 是否启用思考模式
    onThinkingChunk?: (chunk: string) => void; // 思考过程回调
    onThinkingComplete?: (thinking: string) => void; // 思考完成回调
    tools?: any[]; // Agent模式的工具列表
    onToolCall?: (toolCall: ToolCall) => void; // Tool Call 回调
    onToolCallComplete?: (toolCalls: ToolCall[]) => void; // Tool Calls 完成回调
}

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
}

export type AIProvider = 'gemini' | 'deepseek' | 'openai' | 'moonshot' | 'volcano' | 'v3' | 'custom';

interface ProviderConfig {
    name: string;
    baseUrl: string;
    modelsEndpoint: string;
    chatEndpoint: string;
    apiKeyHeader: string;
    websiteUrl?: string; // 平台官网链接
}

// 预定义的AI平台配置
const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
    gemini: {
        name: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        modelsEndpoint: '/v1beta/models',
        chatEndpoint: '/v1beta/models/{model}:streamGenerateContent',
        apiKeyHeader: 'x-goog-api-key',
        websiteUrl: 'https://aistudio.google.com/apikey'
    },
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization',
        websiteUrl: 'https://platform.deepseek.com/'
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization',
        websiteUrl: 'https://platform.openai.com/'
    },
    moonshot: {
        name: 'Moonshot',
        baseUrl: 'https://api.moonshot.cn',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization',
        websiteUrl: 'https://platform.moonshot.cn/'
    },
    volcano: {
        name: '火山引擎',
        baseUrl: 'https://ark.cn-beijing.volces.com',
        modelsEndpoint: '/api/v3/models',
        chatEndpoint: '/api/v3/chat/completions',
        apiKeyHeader: 'Authorization',
        websiteUrl: 'https://console.volcengine.com/ark'
    },
    v3: {
        name: 'V3 API',
        baseUrl: 'https://api.v3.cm',
        modelsEndpoint: '/v1/models',
        chatEndpoint: '/v1/chat/completions',
        apiKeyHeader: 'Authorization',
        websiteUrl: 'https://api.gpt.ge/register?aff=fQIZ'
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
 * 获取平台配置信息
 */
export function getProviderConfig(provider: AIProvider): ProviderConfig {
    return PROVIDER_CONFIGS[provider];
}

/**
 * 根据自定义API URL和默认端点，获取基础URL和实际端点
 * @param customApiUrl 用户输入的自定义API URL
 * @param defaultEndpoint 默认的端点 (e.g., '/v1/models', '/v1/chat/completions')
 * @returns {baseUrl: string, endpoint: string}
 * 
 * 规则说明：
 * 1. 以 '/' 结尾：去掉 /v1 前缀，保留后续路径
 *    例如：https://text.pollinations.ai/openai/ + /v1/models -> https://text.pollinations.ai/openai/models
 * 2. 以 '#' 结尾：强制使用输入地址，完全不拼接端点路径
 *    例如：https://text.pollinations.ai/openai# + /v1/models -> https://text.pollinations.ai/openai
 * 3. 其他情况：使用完整的默认端点
 *    例如：https://api.openai.com + /v1/models -> https://api.openai.com/v1/models
 */
function getBaseUrlAndEndpoint(
    customApiUrl: string,
    defaultEndpoint: string
): { baseUrl: string; endpoint: string } {
    const trimmedUrl = (customApiUrl || '').trim();

    // 规则2：以 '#' 结尾，强制使用输入地址，不拼接任何端点
    if (trimmedUrl.endsWith('#')) {
        const baseUrl = trimmedUrl.slice(0, -1); // 移除 '#'
        return { baseUrl, endpoint: '' }; // endpoint 为空，直接使用 baseUrl
    }

    // 规则1：以 '/' 结尾，去掉 /v1 前缀，保留后续路径
    if (trimmedUrl.endsWith('/')) {
        const baseUrl = trimmedUrl.slice(0, -1); // 移除 '/'
        const endpoint = defaultEndpoint.startsWith('/v1')
            ? defaultEndpoint.substring(3) // 去掉 /v1，例如 /v1/models -> /models
            : defaultEndpoint;
        return { baseUrl, endpoint };
    }

    // 规则3：默认情况，使用完整的默认端点
    return { baseUrl: trimmedUrl.replace(/\/$/, ''), endpoint: defaultEndpoint };
}

/**
 * 获取模型列表
 */
export async function fetchModels(
    provider: string,
    apiKey: string,
    customApiUrl?: string,
    advancedConfig?: { customModelsUrl?: string; customChatUrl?: string }
): Promise<ModelInfo[]> {
    const isBuiltIn = ['gemini', 'deepseek', 'openai', 'moonshot', 'volcano', 'v3'].includes(provider);
    const config = isBuiltIn ? PROVIDER_CONFIGS[provider as AIProvider] : PROVIDER_CONFIGS.custom;

    let url: string;

    // 优先使用高级自定义的模型列表 URL
    if (advancedConfig?.customModelsUrl) {
        url = advancedConfig.customModelsUrl;
    } else if (customApiUrl) {
        const { baseUrl, endpoint } = getBaseUrlAndEndpoint(customApiUrl, config.modelsEndpoint);
        url = `${baseUrl}${endpoint}`;
    } else {
        if (!isBuiltIn) {
            throw new Error('Custom provider requires API URL');
        }
        url = `${config.baseUrl}${config.modelsEndpoint}`;
    }

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
            // 尝试读取错误响应体中的详细错误信息
            let errorMessage = `Failed to fetch models: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                // 尝试提取常见的错误消息字段
                const detailMsg = errorData.error?.message || errorData.message || errorData.error || JSON.stringify(errorData);
                errorMessage += `\n\n${detailMsg}`;
            } catch (e) {
                // 如果无法解析 JSON，尝试读取文本
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorMessage += `\n\n${errorText}`;
                    }
                } catch (textError) {
                    // 忽略文本读取错误
                }
            }
            throw new Error(errorMessage);
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
            // 尝试多种可能的响应格式以支持自定义API
            let modelsArray: any[] = [];
            if (Array.isArray(data)) {
                modelsArray = data;
            } else if (data.data && Array.isArray(data.data)) {
                modelsArray = data.data;
            } else if (data.models && Array.isArray(data.models)) {
                modelsArray = data.models;
            } else {
                // 如果都不是，尝试将data作为单个model或空数组
                modelsArray = [];
            }

            return modelsArray.map((model: any) => {
                // 处理不同格式的model对象
                if (typeof model === 'string') {
                    return {
                        id: model,
                        name: model,
                        provider: config.name
                    };
                } else {
                    return {
                        id: model.id || model.name || model,
                        name: model.name || model.id || model,
                        provider: config.name
                    };
                }
            });
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
    url: string,
    apiKey: string,
    options: ChatOptions
): Promise<void> {


    // 转换消息格式以支持多模态和工具调用
    const formattedMessages = options.messages.map(msg => {
        const formatted: any = {
            role: msg.role,
            content: msg.content
        };

        // 添加工具调用信息
        if (msg.tool_calls) {
            formatted.tool_calls = msg.tool_calls;
        }

        // 添加工具返回信息
        if (msg.role === 'tool') {
            formatted.tool_call_id = msg.tool_call_id;
            formatted.name = msg.name;
        }

        return formatted;
    });

    const requestBody: any = {
        model: options.model,
        messages: formattedMessages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: options.stream !== false
    };

    // 添加工具定义（Agent模式）
    if (options.tools && options.tools.length > 0) {
        requestBody.tools = options.tools;
        requestBody.tool_choice = 'auto'; // 让模型自动决定是否调用工具
    }

    // 如果启用思考模式，添加相关参数（适用于支持的模型如 DeepSeek）
    if (options.enableThinking) {
        requestBody.stream_options = {
            include_usage: true
        };
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: options.signal // 传递 AbortSignal
        });

        if (!response.ok) {
            // 尝试读取错误响应体中的详细错误信息
            let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                // 尝试提取常见的错误消息字段
                const detailMsg = errorData.error?.message || errorData.message || errorData.error || JSON.stringify(errorData);
                errorMessage += `\n\n${detailMsg}`;
            } catch (e) {
                // 如果无法解析 JSON，尝试读取文本
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorMessage += `\n\n${errorText}`;
                    }
                } catch (textError) {
                    // 忽略文本读取错误
                }
            }
            throw new Error(errorMessage);
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
        // 检查是否是用户主动中断
        if ((error as Error).name === 'AbortError') {
            console.log('Request was aborted by user');
            options.onError?.(new Error('Request aborted'));
        } else {
            console.error('Chat error:', error);
            options.onError?.(error as Error);
        }
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
        .map(msg => {
            const role = msg.role === 'assistant' ? 'model' : 'user';

            // 处理多模态内容
            if (typeof msg.content === 'string') {
                return { role, parts: [{ text: msg.content }] };
            } else {
                // 转换为 Gemini 格式
                const parts = msg.content.map(part => {
                    if (part.type === 'text' && part.text) {
                        return { text: part.text };
                    } else if (part.type === 'image_url' && part.image_url) {
                        // Gemini 使用 inline_data 格式
                        const base64Data = part.image_url.url.replace(/^data:image\/\w+;base64,/, '');
                        const mimeType = part.image_url.url.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
                        return {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        };
                    }
                    return null;
                }).filter(Boolean);

                return { role, parts };
            }
        });

    const systemInstruction = options.messages.find(msg => msg.role === 'system');

    const requestBody: any = {
        contents,
        generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens
        }
    };

    // 如果启用思考模式，添加 thinkingConfig 参数
    if (options.enableThinking) {
        requestBody.generationConfig.thinkingConfig = {
            thinkingBudget: -1, // -1 表示动态思考
            includeThoughts: true // 包含思考过程
        };
    }

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
            body: JSON.stringify(requestBody),
            signal: options.signal // 传递 AbortSignal
        });

        if (!response.ok) {
            // 尝试读取错误响应体中的详细错误信息
            let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                // 尝试提取常见的错误消息字段
                const detailMsg = errorData.error?.message || errorData.message || errorData.error || JSON.stringify(errorData);
                errorMessage += `\n\n${detailMsg}`;
            } catch (e) {
                // 如果无法解析 JSON，尝试读取文本
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorMessage += `\n\n${errorText}`;
                    }
                } catch (textError) {
                    // 忽略文本读取错误
                }
            }
            throw new Error(errorMessage);
        }

        if (response.body) {
            await handleGeminiStreamResponse(response.body, options);
        }
    } catch (error) {
        // 检查是否是用户主动中断
        if ((error as Error).name === 'AbortError') {
            console.log('Gemini request was aborted by user');
            options.onError?.(new Error('Request aborted'));
        } else {
            console.error('Gemini chat error:', error);
            options.onError?.(error as Error);
        }
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
    let thinkingText = '';
    let buffer = '';
    let isThinkingPhase = false;
    let toolCalls: ToolCall[] = [];
    let toolCallBuffer: Record<number, { id?: string; name?: string; arguments?: string }> = {};

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
                        const delta = json.choices?.[0]?.delta;

                        // 检查是否有思考内容（reasoning_content）
                        if (options.enableThinking && delta?.reasoning_content) {
                            isThinkingPhase = true;
                            thinkingText += delta.reasoning_content;
                            options.onThinkingChunk?.(delta.reasoning_content);
                        }

                        // 检查是否有工具调用
                        if (delta?.tool_calls) {
                            for (const toolCallDelta of delta.tool_calls) {
                                const index = toolCallDelta.index;
                                if (!toolCallBuffer[index]) {
                                    toolCallBuffer[index] = {};
                                }

                                // 累积工具调用信息
                                if (toolCallDelta.id) {
                                    toolCallBuffer[index].id = toolCallDelta.id;
                                }
                                if (toolCallDelta.function?.name) {
                                    toolCallBuffer[index].name = toolCallDelta.function.name;
                                }
                                if (toolCallDelta.function?.arguments) {
                                    toolCallBuffer[index].arguments =
                                        (toolCallBuffer[index].arguments || '') + toolCallDelta.function.arguments;
                                }
                            }
                        }

                        // 普通内容
                        const content = delta?.content;
                        if (content) {
                            // 如果之前在思考阶段，现在开始输出正文，说明思考结束
                            if (isThinkingPhase && options.onThinkingComplete) {
                                options.onThinkingComplete(thinkingText);
                                isThinkingPhase = false;
                            }
                            fullText += content;
                            options.onChunk?.(content);
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE data:', e);
                    }
                }
            }
        }

        // 如果结束时还在思考阶段，调用思考完成回调
        if (isThinkingPhase && options.onThinkingComplete) {
            options.onThinkingComplete(thinkingText);
        }

        // 处理完整的工具调用
        if (Object.keys(toolCallBuffer).length > 0) {
            toolCalls = Object.values(toolCallBuffer)
                .filter(tc => tc.id && tc.name && tc.arguments)
                .map(tc => ({
                    id: tc.id!,
                    type: 'function' as const,
                    function: {
                        name: tc.name!,
                        arguments: tc.arguments!,
                    },
                }));

            if (toolCalls.length > 0 && options.onToolCallComplete) {
                options.onToolCallComplete(toolCalls);
            }
        }

        options.onComplete?.(fullText);
    } catch (error) {
        // 检查是否是用户主动中断
        if ((error as Error).name === 'AbortError') {
            console.log('Stream reading was aborted');
            // 如果已经有部分内容，仍然调用 onComplete
            if (fullText) {
                options.onComplete?.(fullText);
            }
            if (thinkingText && options.onThinkingComplete) {
                options.onThinkingComplete(thinkingText);
            }
        } else {
            console.error('Stream reading error:', error);
            options.onError?.(error as Error);
        }
        throw error;
    } finally {
        reader.releaseLock();
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
    let thinkingText = '';
    let buffer = '';
    let isThinkingPhase = false;

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
                    const parts = json.candidates?.[0]?.content?.parts;

                    if (parts && Array.isArray(parts)) {
                        for (const part of parts) {
                            if (!part.text) continue;

                            // part.thought 是布尔值，表示这个 part 是否是思考内容
                            if (options.enableThinking && part.thought === true) {
                                // 这是思考内容
                                isThinkingPhase = true;
                                thinkingText += part.text;
                                options.onThinkingChunk?.(part.text);
                            } else if (part.text) {
                                // 这是正常回复内容
                                // 如果之前在思考阶段，现在开始输出正文，说明思考结束
                                if (isThinkingPhase && options.onThinkingComplete) {
                                    options.onThinkingComplete(thinkingText);
                                    isThinkingPhase = false;
                                }
                                fullText += part.text;
                                options.onChunk?.(part.text);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse Gemini SSE data:', e);
                }
            }
        }

        // 如果结束时还在思考阶段，调用思考完成回调
        if (isThinkingPhase && options.onThinkingComplete) {
            options.onThinkingComplete(thinkingText);
        }

        options.onComplete?.(fullText);
    } catch (error) {
        // 检查是否是用户主动中断
        if ((error as Error).name === 'AbortError') {
            console.log('Gemini stream reading was aborted');
            // 如果已经有部分内容，仍然调用 onComplete
            if (fullText) {
                options.onComplete?.(fullText);
            }
            if (thinkingText && options.onThinkingComplete) {
                options.onThinkingComplete(thinkingText);
            }
        } else {
            console.error('Gemini stream reading error:', error);
            options.onError?.(error as Error);
        }
        throw error;
    } finally {
        reader.releaseLock();
    }
}

/**
 * 发送聊天请求
 */
export async function chat(
    provider: string,
    options: ChatOptions,
    customApiUrl?: string,
    advancedConfig?: { customModelsUrl?: string; customChatUrl?: string }
): Promise<void> {
    const isBuiltIn = ['gemini', 'deepseek', 'openai', 'moonshot', 'volcano', 'v3'].includes(provider);
    const config = isBuiltIn ? PROVIDER_CONFIGS[provider as AIProvider] : PROVIDER_CONFIGS.custom;

    let url: string;
    let baseUrlForGemini: string; // Gemini format needs a base url

    // 优先使用高级自定义的对话 URL
    if (advancedConfig?.customChatUrl) {
        url = advancedConfig.customChatUrl;
        baseUrlForGemini = advancedConfig.customChatUrl.replace(/\/v1.*$/, ''); // 尝试提取基础URL
    } else if (customApiUrl) {
        const { baseUrl, endpoint } = getBaseUrlAndEndpoint(customApiUrl, config.chatEndpoint);
        url = `${baseUrl}${endpoint}`;
        baseUrlForGemini = baseUrl;
    } else {
        if (!isBuiltIn && provider !== 'custom') { // custom provider is a special case of built-in
            throw new Error('Custom provider requires API URL');
        }
        url = `${config.baseUrl}${config.chatEndpoint}`;
        baseUrlForGemini = config.baseUrl;
    }

    if (provider === 'gemini') {
        await chatGeminiFormat(baseUrlForGemini, options.apiKey, options.model, options);
    } else {
        await chatOpenAIFormat(url, options.apiKey, options);
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
        if (typeof msg.content === 'string') {
            return total + estimateTokens(msg.content);
        } else {
            // 处理多模态内容
            return total + msg.content.reduce((sum, part) => {
                if (part.type === 'text' && part.text) {
                    return sum + estimateTokens(part.text);
                } else if (part.type === 'image_url') {
                    // 图片大约消耗85个token (根据OpenAI文档的低分辨率估算)
                    return sum + 85;
                }
                return sum;
            }, 0);
        }
    }, 0);
}
