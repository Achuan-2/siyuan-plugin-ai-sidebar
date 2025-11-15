/**
 * Agent 模式工具定义
 * 实现各种工具的调用接口
 */

import {
    sql,
    updateBlock,
    getBlockKramdown,
    exportMdContent,
    createDocWithMd,
    getBlockByID,
    getBlockDOM,
    refreshSql,
    openBlock,
    lsNotebooks,
    createNotebook,
    renameDocByID,
    moveDocsByID,
    appendBlock,
} from '../api';
import { getActiveEditor } from 'siyuan';

/**
 * 获取当前激活的编辑器 Protyle 实例
 */
function getProtyle() {
    return getActiveEditor(false)?.protyle;
}

// ==================== 工具类型定义 ====================

export interface Tool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, ToolParameter>;
            required: string[];
        };
    };
}

export interface ToolParameter {
    type: string;
    description: string;
    enum?: string[];
    items?: {
        type: string;
    };
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ToolResult {
    role: 'tool';
    tool_call_id: string;
    name: string;
    content: string;
}

// ==================== 工具定义 ====================

export const AVAILABLE_TOOLS: Tool[] = [

    // SQL查询工具
    {
        type: 'function',
        function: {
            name: 'siyuan_sql_query',
            description: `执行思源笔记SQL查询的工具。

## 何时使用
- 需要搜索、统计或分析笔记内容
- 查找特定条件的块、文档
- 获取笔记的元数据信息

## 数据库表结构

### blocks表：存储所有块信息
| 字段名 | 说明     | 字段值示例 |
| -------- | ---------------------------------------------------- | ------------ |
| id       | 内容块 ID| 20210104091228-d0rzbmm  |
| parent_id       | 上级块的 ID，文档块该字段为空      | 20200825162036-4dx365o   |
| root_id       | 顶层块的 ID，即文档块 ID   | 20200825162036-4dx365o   |
| hash       | content 字段的 SHA256 校验和      | a75d25c   |
| box       | 笔记本 ID| 20210808180117-czj9bvb   |
| path       | 内容块所在文档路径| /20200812220555-lj3enxa/20210808180320-abz7w6k/20200825162036-4dx365o.sy   |
| hpath       | 人类可读的内容块所在文档路径       | /0 请从这里开始/编辑器/排版元素   |
| name       | 内容块名称| 一级标题命名   |
| alias       | 内容块别名| 一级标题别名   |
| memo       | 内容块备注| 一级标题备注   |
| tag       | 非文档块为块内包含的标签，文档块为文档的标签       | #标签1# #标签2# #标签3#   |
| content       | 去除了 Markdown 标记符的文本       | 一级标题   |
| fcontent       | 第一个子块去除了 Markdown 标记符的文本(1.9.9 添加) | 第一个子块   |
| markdown       | 包含完整 Markdown 标记符的文本     | # 一级标题   |
| length       | fcontent 字段文本长度     | 6   |
| type       | 内容块主类型，参考 [blocks.type](#blocks-type)| h   |
| subtype       | 内容块次类型，参考 [blocks.subtype](#blocks-type)| h1   |
| ial       | 内联属性列表，形如 {: name="value"}| {: id="20210104091228-d0rzbmm" updated="20210604222535"}   |
| sort       | 排序权重，数值越小排序越靠前       | 5   |
| created       | 创建时间 | 20210104091228   |
| updated       | 更新时间 | 20210604222535   |

### refs表：存储所有引用双链结构

| 字段名 | 说明 | 字段值示例 |
| --- | --- | --- |
| id | 引用 ID | 20211127144458-idb32wk |
| def_block_id | 被引用块的块 ID | 20200925095848-aon4lem |
| def_block_parent_id | 被引用块的双亲节点的块 ID | 20200905090211-2vixtlf |
| def_block_root_id | 被引用块所在文档的 ID | 20200905090211-2vixtlf |
| def_block_path | 被引用块所在文档的路径 | /20200812220555-lj3enxa/20210808180320-fqgskfj/20200905090211-2vixtlf.sy |
| block_id | 引用所在内容块 ID | 20210104090624-c5bu25o |
| root_id | 引用所在文档块 ID | 20200905090211-2vixtlf |
| box | 引用所在笔记本 ID | 20210808180117-czj9bvb |
| path | 引用所在文档块路径 | /20200812220555-lj3enxa/20210808180320-fqgskfj/20200905090211-2vixtlf.sy |
| content | 引用锚文本 | 元类型 |
| markdown | 包含完整 Markdown 标记符的文本 | (()) |
| type | 引用类型 | ref_id |

### attributes表：查询特定块属性

| 字段名 | 说明 | 字段值示例 |
| --- | --- | --- |
| id | 属性 ID | 20211127144458-h7y55zu |
| name | 属性名称 | bookmark |
| value | 属性值 | ✨ |
| type | 类型 | b |
| block_id | 块 ID | 20210428212840-859h45j |
| root_id | 文档 ID | 20200812220555-lj3enxa |
| box | 笔记本 ID | 20210808180117-czj9bvb |
| path | 文档文件路径 | /20200812220555-lj3enxa.sy |

## 查询示例

\`\`\`sql
-- 搜索包含关键词的文档，为了查找更相关的结果，需要思考不同词，一起查询
-- 假设用户要搜索“时间管理”相关文档，需要想到“任务管理”或“GTD”等相关词。
SELECT * FROM blocks
WHERE (content LIKE '%时间管理%' OR content LIKE '%任务管理%' OR content LIKE '%GTD%')
AND type='d'
LIMIT 50;

-- 获取最近更新的文档
SELECT * FROM blocks WHERE type='d' ORDER BY updated DESC LIMIT 50;

-- 查找带有特定标签的块
SELECT * FROM blocks WHERE tag LIKE '%标签名%';
\`\`\`

## 注意事项
- 避免查询过多数据，使用LIMIT限制结果数量，默认50，除非用户有要求指定数量
- 查询之后的结果总结，使用思源笔记块链接的格式包裹，如\`[脑机接口](siyuan://blocks/20240519195512-ccrifu0)\`
`,
            parameters: {
                type: 'object',
                properties: {
                    sql: {
                        type: 'string',
                        description: 'SQL查询语句，必须是有效的SQLite语法',
                    },
                },
                required: ['sql'],
            },
        },
    },
    // 更新块工具
    {
        type: 'function',
        function: {
            name: 'siyuan_update_block',
            description: `更新思源笔记中已存在块的工具。

## 何时使用
- 需要修改现有笔记内容
- 用户要求更新某个特定的块
- 修正或改进已有信息

## 使用方法
1. 先通过SQL查询或其他方式获取要更新的块ID
2. 准备新的内容（Markdown格式）
3. 调用工具更新块内容

## 更新策略
- 完全替换：新内容会完全替换旧内容
- 保留结构：尽量保持原有的块结构和子块
- 属性保留：块属性（如别名、标签）会被保留

## 注意事项
- 必须提供准确的块ID
- 思源笔记kramdown格式如果要添加颜色：应该是<span data-type="text">添加颜色的文字1</span>{: style="color: var(--b3-font-color1);"}，优先使用以下颜色变量：
  - --b3-font-color1: 红色
  - --b3-font-color2: 橙色
  - --b3-font-color3: 蓝色
  - --b3-font-color4: 绿色
  - --b3-font-color5: 灰色
- 不建议频繁更新大型文档块，考虑只更新特定段落

## 调用工具后
- 更新块后以思源块链接格式返回，方便用户点击跳转查看`,
            parameters: {
                type: 'object',
                properties: {
                    dataType: {
                        type: 'string',
                        description: '数据类型，通常使用 "markdown"',
                        enum: ['markdown', 'dom'],
                    },
                    data: {
                        type: 'string',
                        description: '新的块内容，使用Markdown格式',
                    },
                    id: {
                        type: 'string',
                        description: '要更新的块ID',
                    },
                },
                required: ['dataType', 'data', 'id'],
            },
        },
    },
    // 插入块工具
    {
        type: 'function',
        function: {
            name: 'siyuan_insert_block',
            description: `在思源笔记中插入新块的工具。

## 何时使用
- 用户要求添加新内容到笔记
- 需要在特定位置插入信息
- 创建新的笔记内容

## 使用方法
1. 使用markdown格式准备要插入的内容
2. 确定插入位置（在某个块之前、之后，或作为子块）
3. 调用工具插入内容

## 位置参数说明
- parentID: 将新块作为指定块的子块插入（前置子块）
- appendParentID: 将新块作为指定块的后置子块插入（追加到父块最后）
- previousID: 在指定块之后插入新块
- nextID: 在指定块之前插入新块

## 使用示例

\`\`\`javascript
// 在块前插入新块
siyuan_insert_block({
  dataType: "markdown",
  data: "# 新标题\\n\\n这是新插入的内容。",
  nextID: "20210104091228-d0rzbmm"  // 在此块之前插入
})

// 在块后插入新块
siyuan_insert_block({
  dataType: "markdown",
  data: "- 新列表项",
  previousID: "20210104091228-d0rzbmm"  // 在此块之后插入
})

// 作为前置子块插入
siyuan_insert_block({
  dataType: "markdown",
  data: "这是前置子块内容",
  parentID: "20210104091228-d0rzbmm"  // 作为此块的前置子块
})

// 作为后置子块插入（追加到父块最后）
siyuan_insert_block({
  dataType: "markdown",
  data: "这是后置子块内容",
  appendParentID: "20210104091228-d0rzbmm"  // 作为此块的后置子块
})
\`\`\`

## 注意事项
- 至少需要指定一个位置参数（parentID、appendParentID、previousID或nextID）
- 如果指定parentID，会作为子块追加到父块的最前面
- 如果指定appendParentID，会作为子块追加到父块的最后面
- previousID和nextID用于在同级块中定位
- 插入大量内容时考虑分批插入

## 调用工具后
- 插入块后以思源块链接格式返回，方便用户点击跳转查看`,
            parameters: {
                type: 'object',
                properties: {
                    dataType: {
                        type: 'string',
                        description: '数据类型，通常使用 "markdown"',
                        enum: ['markdown', 'dom'],
                    },
                    data: {
                        type: 'string',
                        description: '要插入的内容，使用Markdown格式',
                    },
                    parentID: {
                        type: 'string',
                        description: '父块ID，将新块作为前置子块插入（可选）',
                    },
                    appendParentID: {
                        type: 'string',
                        description: '父块ID，将新块作为后置子块追加到父块最后（可选）',
                    },
                    previousID: {
                        type: 'string',
                        description: '前一个块的ID，将新块插入到该块之后（可选）',
                    },
                    nextID: {
                        type: 'string',
                        description: '后一个块的ID，将新块插入到该指定块之前（可选）',
                    },
                },
                required: ['dataType', 'data'],
            },
        },
    },



    // 获取块内容工具
    {
        type: 'function',
        function: {
            name: 'siyuan_get_block_content',
            description: `获取思源笔记块的详细内容的工具。

## 何时使用
- 需要查看特定块的完整内容
- 获取块的Markdown或Kramdown源码
- 分析块的结构和格式

## 返回格式
支持两种格式：
1. markdown: 标准Markdown格式，适合阅读
2. kramdown: 包含块ID信息的格式，适合编程处理

## 使用场景
- 读取文档内容用于分析或摘要
- 获取代码块的源代码
- 提取表格、列表等结构化数据
- 检查块的引用和链接

## 长文档处理
- 对于大型文档，会分块返回内容
- 每次最多返回1000个块的信息
- 可以通过多次调用处理完整文档
- 优先返回最相关的内容部分

## 注意事项
- 块ID必须存在且有效
- Kramdown格式包含额外的元数据`,
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: '要获取内容的块ID',
                    },
                    format: {
                        type: 'string',
                        description: '返回格式：markdown（纯文本）或 kramdown（包含ID信息）',
                        enum: ['markdown', 'kramdown'],
                    },
                },
                required: ['id', 'format'],
            },
        },
    },

    // 创建文档工具
    {
        type: 'function',
        function: {
            name: 'siyuan_create_document',
            description: `在思源笔记中创建新文档的工具。

## 何时使用
- 用户要求创建新笔记
- 需要基于对话内容生成文档
- 整理信息并保存为新文档

## 文档创建功能
1. 自动创建层级目录
2. 支持完整的Markdown格式
3. 自动处理块引用
4. 可以在内容中使用关键词自动创建引用

## 路径格式
- 使用 / 分隔的路径，如 /日记/2024/01
- 不需要包含笔记本ID
- 会自动创建不存在的父目录
- 文件名会自动从路径中提取

## 使用示例

\`\`\`javascript
// 创建日记
siyuan_create_document({
  notebook: "20210808180117-6v0mkxr",
  path: "/日记/2024-01-01",
  markdown: "# 今日总结\\n\\n学习了AI知识..."
})

// 创建带引用的文档
siyuan_create_document({
  notebook: "20210808180117-6v0mkxr",
  path: "/笔记/机器学习/概述",
  markdown: "# 机器学习概述\\n\\n机器学习是人工智能的一个分支..."
})
\`\`\`

## 注意事项
- 必须提供有效的笔记本ID
- 路径中的文档如果已存在会报错
- Markdown内容会被解析并转换为块
- 自动块引用功能会增加处理时间
- 建议合理组织文档结构，避免过深的层级`,
            parameters: {
                type: 'object',
                properties: {
                    notebook: {
                        type: 'string',
                        description: '笔记本ID，可以通过SQL查询 "SELECT * FROM blocks WHERE type=\'d\' LIMIT 1" 获取box字段',
                    },
                    path: {
                        type: 'string',
                        description: '文档路径，如 /日记/2024-01-01，会自动创建父目录',
                    },
                    markdown: {
                        type: 'string',
                        description: '文档内容，使用Markdown格式。支持自动块引用功能。',
                    },
                },
                required: ['notebook', 'path', 'markdown'],
            },
        },
    },

    // 列出笔记本工具
    {
        type: 'function',
        function: {
            name: 'siyuan_list_notebooks',
            description: `获取所有笔记本列表的工具。

## 何时使用
- 需要查看系统中有哪些笔记本
- 获取笔记本ID用于创建或查询文档
- 检查笔记本是否存在或已打开

## 返回信息
- 笔记本ID (id)
- 笔记本名称 (name)
- 笔记本图标 (icon)
- 排序权重 (sort)
- 是否已关闭 (closed)

## 使用场景
- 在创建文档前选择目标笔记本
- 列出可用的笔记本供用户选择
- 检查笔记本状态

## 注意事项
- 返回包括已打开和已关闭的笔记本
- 可以通过 closed 字段判断笔记本是否已关闭
- 笔记本ID是创建文档等操作的必要参数`,
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },

    // 创建笔记本工具
    {
        type: 'function',
        function: {
            name: 'siyuan_create_notebook',
            description: `创建新笔记本的工具。

## 何时使用
- 用户要求创建新的笔记本
- 需要为特定项目或主题创建独立的笔记本
- 组织和管理笔记结构

## 创建功能
- 创建指定名称的新笔记本
- 自动生成笔记本ID
- 新笔记本会自动打开

## 使用示例

\`\`\`javascript
// 创建项目笔记本
siyuan_create_notebook({
  name: "项目管理"
})

// 创建学习笔记本
siyuan_create_notebook({
  name: "机器学习笔记"
})
\`\`\`

## 注意事项
- 笔记本名称不能为空
- 如果同名笔记本已存在，可能会报错
- 创建成功后会返回笔记本对象，包含ID等信息
- 新笔记本默认会自动打开`,
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '笔记本名称',
                    },
                },
                required: ['name'],
            },
        },
    },

    // 重命名文档工具
    {
        type: 'function',
        function: {
            name: 'siyuan_rename_document',
            description: `重命名思源笔记文档的工具。

## 何时使用
- 用户要求修改文档标题
- 需要更新文档名称以反映内容变化
- 整理和优化文档命名

## 使用方法
1. 通过SQL查询或其他方式获取要重命名的文档ID
2. 提供新的文档标题
3. 调用工具完成重命名

## 参数说明
- id: 文档的块ID
- title: 新的文档标题

## 使用示例

\`\`\`javascript
// 重命名文档
siyuan_rename_document({
  id: "20210917220056-yxtyl7i",
  title: "新标题"
})
\`\`\`

## 注意事项
- 必须提供准确的文档ID,如果上下文没有提供ID，需要自己使用sql获取ID
- 新标题不能为空
- 重命名不会改变文档ID
- 不会影响文档的内容和结构
- 文件系统中的文件名也会相应更新`,
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: '文档ID',
                    },
                    title: {
                        type: 'string',
                        description: '新的文档标题',
                    },
                },
                required: ['id', 'title'],
            },
        },
    },

    // 移动文档工具
    {
        type: 'function',
        function: {
            name: 'siyuan_move_documents',
            description: `移动思源笔记文档到指定位置的工具。

## 何时使用
- 用户要求移动文档到其他文档下或其他笔记本
- 需要重新组织文档结构
- 整理笔记层级关系

## 使用方法
1. 确定要移动的文档ID列表（可以是一个或多个）
2. 确定目标位置（目标父文档ID或笔记本ID）
3. 调用工具完成移动

## 参数说明
- fromIDs: 源文档ID数组，可以移动多个文档
- toID: 目标父文档ID或笔记本ID
  - 如果是文档ID，源文档会成为该文档的子文档
  - 如果是笔记本ID，源文档会移动到笔记本根目录

## 使用示例

\`\`\`javascript
// 移动单个文档到另一个文档下
siyuan_move_documents({
  fromIDs: ["20210917220056-yxtyl7i"],
  toID: "20210817205410-2kvfpfn"
})

// 移动多个文档到笔记本根目录
siyuan_move_documents({
  fromIDs: ["20210917220056-yxtyl7i", "20210918120056-abcdefg"],
  toID: "20210808180117-6v0mkxr"
})
\`\`\`

## 注意事项
- fromIDs 必须是有效的文档ID数组
- toID 可以是文档ID或笔记本ID，如果上下文没有提供ID，需要自己使用sql获取ID
- 移动后文档ID不会改变
- 移动会改变文档的路径和层级关系
- 可以批量移动多个文档
- 不能将文档移动到其自身或其子文档下`,
            parameters: {
                type: 'object',
                properties: {
                    fromIDs: {
                        type: 'array',
                        description: '源文档ID数组，可以是一个或多个文档ID',
                        items: {
                            type: 'string',
                        },
                    },
                    toID: {
                        type: 'string',
                        description: '目标父文档ID或笔记本ID',
                    },
                },
                required: ['fromIDs', 'toID'],
            },
        },
    },
];

// ==================== 工具实现 ====================


/**
 * 执行SQL查询（带限制）
 */
export async function siyuan_sql_query(sqlQuery: string): Promise<any[]> {
    try {

        // 限制返回数量
        const limitedQuery = sqlQuery.includes('LIMIT') ? sqlQuery : `${sqlQuery} LIMIT 1000`;

        const results = await sql(limitedQuery);

        // 如果结果过多，提供摘要
        if (results.length >= 1000) {
            console.warn('SQL query returned 1000+ results, might be truncated');
        }

        return results;
    } catch (error) {
        console.error('Execute SQL query error:', error);
        throw new Error(`SQL查询失败: ${(error as Error).message}`);
    }
}

/**
 * 插入块
 */
export async function siyuan_insert_block(
    dataType: 'markdown' | 'dom',
    data: string,
    parentID?: string,
    appendParentID?: string,
    previousID?: string,
    nextID?: string
): Promise<any> {
    try {
        if (!parentID && !appendParentID && !previousID && !nextID) {
            throw new Error('必须至少指定一个位置参数：parentID、appendParentID、previousID 或 nextID');
        }

        // 使用 insertBlock API 插入块
        let lute = window.Lute.New()
        let newBlockDom: string;
        if (dataType === 'dom') {
            newBlockDom = data;
        } else {
            newBlockDom = lute.Md2BlockDOM(data);
        }
        let newBlockId = newBlockDom.match(/data-node-id="([^"]*)"/)?.[1];

        let insertResult = null;
        // 创建可撤回的事务
        if (newBlockId) {
            try {
                const currentProtyle = getProtyle();
                if (currentProtyle) {

                    // 获取父块ID
                    let actualParentID = parentID || appendParentID;
                    if (!actualParentID && (previousID || nextID)) {
                        const refBlockId = previousID || nextID;
                        const refBlock = await getBlockByID(refBlockId as string);
                        actualParentID = refBlock?.root_id || currentProtyle.block?.id;
                    }

                    const doOperations = [];
                    if (appendParentID) {
                        // 使用appendBlock API作为后置子块插入
                        const appendResult = await appendBlock(dataType, data, appendParentID);
                        insertResult = {
                            id: newBlockId,
                            parentID: appendParentID,
                            previousID: previousID,
                            nextID: nextID,
                            appendParentID: appendParentID
                        };
                        return insertResult;
                    } else if (nextID) {
                        doOperations.push({
                            action: 'insert',
                            id: newBlockId,
                            data: newBlockDom,
                            parentID: actualParentID,
                            nextID: nextID,
                        });
                    } else if (previousID) {
                        doOperations.push({
                            action: 'insert',
                            id: newBlockId,
                            data: newBlockDom,
                            parentID: actualParentID,
                            previousID: previousID,
                        });
                    } else if (parentID) {
                        doOperations.push({
                            action: 'insert',
                            id: newBlockId,
                            data: newBlockDom,
                            parentID: actualParentID,
                        });
                    }

                    const undoOperations = [
                        {
                            action: 'delete',
                            id: newBlockId,
                            data: null,
                        },
                    ];
                    insertResult = {
                        id: newBlockId,
                        parentID: actualParentID,
                        previousID: previousID,
                        nextID: nextID,
                        appendParentID: appendParentID
                    };
                    // 执行事务以支持撤回
                    // @ts-ignore
                    currentProtyle.getInstance()?.transaction(doOperations, undoOperations);
                    setTimeout(() => {
                        currentProtyle.getInstance()?.reload(false);
                    }, 500);
                }

            } catch (transactionError) {

            }
        }

        return insertResult;
    } catch (error) {
        console.error('Insert block error:', error);
        throw new Error(`插入块失败: ${(error as Error).message}`);
    }
}

/**
 * 更新块
 */
export async function siyuan_update_block(
    dataType: 'markdown' | 'dom',
    data: string,
    id: string
): Promise<any> {
    try {
        // 保存旧的DOM用于撤回操作
        const oldBlockDomRes = await getBlockDOM(id);
        const oldBlockDom = oldBlockDomRes?.dom;

        // 使用 updateBlock API 更新块内容
        const result = await updateBlock(dataType, data, id);
        await refreshSql();

        // 获取当前编辑器实例并创建可撤回的事务
        try {
            const currentProtyle = getProtyle();
            if (currentProtyle && oldBlockDom) {
                await refreshSql();
                const newBlockDomRes = await getBlockDOM(id);
                const newBlockDom = newBlockDomRes?.dom;

                if (newBlockDom) {
                    // @ts-ignore
                    currentProtyle.getInstance()?.updateTransaction(id, newBlockDom, oldBlockDom);
                    console.log('Created undo transaction for block update:', id);
                }
            }
        } catch (transactionError) {
            console.warn('创建撤回事务失败，但块内容已更新:', transactionError);
        }

        return result;
    } catch (error) {
        console.error('Update block error:', error);
        throw new Error(`更新块失败: ${(error as Error).message}`);
    }
}

/**
 * 获取块内容
 */
export async function siyuan_get_block_content(
    id: string,
    format: 'markdown' | 'kramdown'
): Promise<string> {
    try {
        if (format === 'kramdown') {
            const result = await getBlockKramdown(id);
            if (!result || !result.kramdown) {
                throw new Error('获取Kramdown内容失败');
            }
            return result.kramdown;
        } else {
            const result = await exportMdContent(id, false, false, 2, 0, false);
            if (!result || !result.content) {
                throw new Error('获取Markdown内容失败');
            }
            return result.content;
        }
    } catch (error) {
        console.error('Get block content error:', error);
        throw new Error(`获取块内容失败: ${(error as Error).message}`);
    }
}

/**
 * 创建文档
 */
export async function siyuan_create_document(
    notebook: string,
    path: string,
    markdown: string
): Promise<string> {
    try {
        // 首先创建文档
        const docId = await createDocWithMd(notebook, path, markdown);

        // 自动打开创建的文档
        try {
            await openBlock(docId);
        } catch (openError) {
            console.warn('打开文档失败，但文档已创建:', openError);
        }

        return docId;
    } catch (error) {
        console.error('Create document error:', error);
        throw new Error(`创建文档失败: ${(error as Error).message}`);
    }
}

/**
 * 列出所有笔记本
 */
export async function siyuan_list_notebooks(): Promise<any> {
    try {
        const result = await lsNotebooks();
        return result;
    } catch (error) {
        console.error('List notebooks error:', error);
        throw new Error(`获取笔记本列表失败: ${(error as Error).message}`);
    }
}

/**
 * 创建笔记本
 */
export async function siyuan_create_notebook(name: string): Promise<any> {
    try {
        const result = await createNotebook(name);
        return result;
    } catch (error) {
        console.error('Create notebook error:', error);
        throw new Error(`创建笔记本失败: ${(error as Error).message}`);
    }
}

/**
 * 重命名文档
 */
export async function siyuan_rename_document(
    id: string,
    title: string
): Promise<string> {
    try {
        const result = await renameDocByID(id, title);
        return result;
    } catch (error) {
        console.error('Rename document error:', error);
        throw new Error(`重命名文档失败: ${(error as Error).message}`);
    }
}

/**
 * 移动文档
 */
export async function siyuan_move_documents(
    fromIDs: string[],
    toID: string
): Promise<any> {
    try {
        if (!fromIDs || fromIDs.length === 0) {
            throw new Error('fromIDs 不能为空');
        }
        if (!toID) {
            throw new Error('toID 不能为空');
        }

        const result = await moveDocsByID(fromIDs, toID);
        return result;
    } catch (error) {
        console.error('Move documents error:', error);
        throw new Error(`移动文档失败: ${(error as Error).message}`);
    }
}

/**
 * 执行工具调用
 */
export async function executeToolCall(toolCall: ToolCall): Promise<string> {
    const { name, arguments: argsStr } = toolCall.function;

    try {
        const args = JSON.parse(argsStr);

        switch (name) {
            case 'siyuan_sql_query':
                const results = await siyuan_sql_query(args.sql);
                return JSON.stringify(results, null, 2);

            case 'siyuan_insert_block':
                const insertResult = await siyuan_insert_block(
                    args.dataType,
                    args.data,
                    args.parentID,
                    args.appendParentID,
                    args.previousID,
                    args.nextID
                );
                return JSON.stringify(insertResult, null, 2);

            case 'siyuan_update_block':
                const updateResult = await siyuan_update_block(args.dataType, args.data, args.id);
                return JSON.stringify(updateResult, null, 2);

            case 'siyuan_get_block_content':
                return await siyuan_get_block_content(args.id, args.format);

            case 'siyuan_create_document':
                const docId = await siyuan_create_document(args.notebook, args.path, args.markdown);
                return `文档创建成功，ID: ${docId}`;

            case 'siyuan_list_notebooks':
                const notebooks = await siyuan_list_notebooks();
                return JSON.stringify(notebooks, null, 2);

            case 'siyuan_create_notebook':
                const notebook = await siyuan_create_notebook(args.name);
                return JSON.stringify(notebook, null, 2);

            case 'siyuan_rename_document':
                const renameResult = await siyuan_rename_document(args.id, args.title);
                return `文档重命名成功，新ID: ${renameResult}`;

            case 'siyuan_move_documents':
                const moveResult = await siyuan_move_documents(args.fromIDs, args.toID);
                return JSON.stringify(moveResult, null, 2);

            default:
                throw new Error(`未知的工具: ${name}`);
        }
    } catch (error) {
        console.error(`Execute tool ${name} error:`, error);
        return `执行工具失败: ${(error as Error).message}`;
    }
}
