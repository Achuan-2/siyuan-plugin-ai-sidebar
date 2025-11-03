/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-06-08 20:36:30
 * @FilePath     : /src/libs/const.ts
 * @LastEditTime : 2024-06-08 20:48:06
 * @Description  : 
 */


export const BlockType2NodeType: {[key in BlockType]: string} = {
    d: 'NodeDocument',
    p: 'NodeParagraph',
    query_embed: 'NodeBlockQueryEmbed',
    l: 'NodeList',
    i: 'NodeListItem',
    h: 'NodeHeading',
    iframe: 'NodeIFrame',
    tb: 'NodeThematicBreak',
    b: 'NodeBlockquote',
    s: 'NodeSuperBlock',
    c: 'NodeCodeBlock',
    widget: 'NodeWidget',
    t: 'NodeTable',
    html: 'NodeHTMLBlock',
    m: 'NodeMathBlock',
    av: 'NodeAttributeView',
    audio: 'NodeAudio'
}


export const NodeIcons = {
    NodeAttributeView: {
        icon: "iconDatabase"
    },
    NodeAudio: {
        icon: "iconRecord"
    },
    NodeBlockQueryEmbed: {
        icon: "iconSQL"
    },
    NodeBlockquote: {
        icon: "iconQuote"
    },
    NodeCodeBlock: {
        icon: "iconCode"
    },
    NodeDocument: {
        icon: "iconFile"
    },
    NodeHTMLBlock: {
        icon: "iconHTML5"
    },
    NodeHeading: {
        icon: "iconHeadings",
        subtypes: {
            h1: { icon: "iconH1" },
            h2: { icon: "iconH2" },
            h3: { icon: "iconH3" },
            h4: { icon: "iconH4" },
            h5: { icon: "iconH5" },
            h6: { icon: "iconH6" }
        }
    },
    NodeIFrame: {
        icon: "iconLanguage"
    },
    NodeList: {
        subtypes: {
            o: { icon: "iconOrderedList" },
            t: { icon: "iconCheck" },
            u: { icon: "iconList" }
        }
    },
    NodeListItem: {
        icon: "iconListItem"
    },
    NodeMathBlock: {
        icon: "iconMath"
    },
    NodeParagraph: {
        icon: "iconParagraph"
    },
    NodeSuperBlock: {
        icon: "iconSuper"
    },
    NodeTable: {
        icon: "iconTable"
    },
    NodeThematicBreak: {
        icon: "iconLine"
    },
    NodeVideo: {
        icon: "iconVideo"
    },
    NodeWidget: {
        icon: "iconBoth"
    }
};
