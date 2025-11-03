import {
    Plugin,
    showMessage,
    confirm,
    Dialog,
    Menu,
    openTab,
    adaptHotkey,
    getFrontend,
    getBackend,
    IModel,
    Protyle,
    openWindow,
    IOperation,
    Constants,
    openMobileFileById,
    lockScreen,
    ICard,
    ICardData
} from "siyuan";

import { appendBlock, deleteBlock, setBlockAttrs, getBlockAttrs, pushMsg, pushErrMsg, sql, renderSprig, getChildBlocks, insertBlock, renameDocByID, prependBlock, updateBlock, createDocWithMd,  getBlockKramdown, getBlockDOM } from "./api";
import "@/index.scss";

import SettingPanel from "./setting-example.svelte";
import { getDefaultSettings } from "./defaultSettings";
import { setPluginInstance, t } from "./utils/i18n";
import LoadingDialog from "./components/LoadingDialog.svelte";
import AISidebar from "./ai-sidebar.svelte";
import { updateSettings } from "./stores/settings";

export const SETTINGS_FILE = "settings.json";

const AI_SIDEBAR_TYPE = "ai-chat-sidebar";



export default class PluginSample extends Plugin {
    private aiSidebarApp: AISidebar;

    async onload() {
        // 插件被启用时会自动调用这个函数
        // 设置i18n插件实例
        setPluginInstance(this);

        // 加载设置
        await this.loadSettings();

        // 注册AI侧栏
        this.addDock({
            config: {
                position: "RightBottom",
                size: { width: 400, height: 0 },
                icon: "iconEmoji",
                title: "AI 助手",
            },
            data: {
                text: "AI Chat"
            },
            type: AI_SIDEBAR_TYPE,
            init: (dock) => {
                this.aiSidebarApp = new AISidebar({
                    target: dock.element,
                    props: {
                        plugin: this
                    }
                });
            },
            destroy: () => {
                if (this.aiSidebarApp) {
                    this.aiSidebarApp.$destroy();
                }
            }
        });
    }

    async onLayoutReady() {
        //布局加载完成的时候,会自动调用这个函数

    }

    async onunload() {
        //当插件被禁用的时候，会自动调用这个函数
        console.log("onunload");
    }

    uninstall() {
        //当插件被卸载的时候，会自动调用这个函数
        console.log("uninstall");
    }

    /**
     * 打开设置对话框
     */
    // 重写 openSetting 方法
    async openSetting() {
        let dialog = new Dialog({
            title: t("settings.settingsPanel"),
            content: `<div id="SettingPanel" style="height: 100%;"></div>`,
            width: "800px",
            height: "700px",
            destroyCallback: () => {
                pannel.$destroy();
            }
        });

        let pannel = new SettingPanel({
            target: dialog.element.querySelector("#SettingPanel"),
            props: {
                plugin: this
            }
        });
    }
    /**
     * 加载设置
     */
    async loadSettings() {
        const settings = await this.loadData(SETTINGS_FILE);
        const defaultSettings = getDefaultSettings();
        const mergedSettings = { ...defaultSettings, ...settings };
        // 更新 store
        updateSettings(mergedSettings);
        return mergedSettings;
    }

    /**
     * 保存设置
     */
    async saveSettings(settings: any) {
        await this.saveData(SETTINGS_FILE, settings);
        // 更新 store，通知所有订阅者
        updateSettings(settings);
    }


}
