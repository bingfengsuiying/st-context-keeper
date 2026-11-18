/**
 * 聊天保留层 / Context Keeper  v1.1
 *
 * 给 SillyTavern 增加一个总开关与“保留最近 N 条消息”的设置：
 * 开启后自动把超出保留窗口的历史消息标记为“从提示词中排除”
 * （就是逐条点击消息上的眼睛按钮所做的同一件事，is_system = true）。
 *
 * 兼容性：
 * - 不静态 import 任何 SillyTavern 内部模块，改用全局 SillyTavern.getContext()
 *   （1.13 ~ 1.18 都提供），拿不到时才动态加载 st-context.js 兜底。
 * - 排除机制在 1.13 / 1.18 中一致：message.is_system。
 * - 界面按触屏优化：手机上面板放到扩展设置顶部、按钮加高、
 *   输入框 16px 防聚焦缩放，并在魔杖菜单提供“开关”和“保留层数”两个入口。
 *
 * 适用版本：SillyTavern 1.13.x ~ 1.18.x（桌面与手机浏览器）
 */

import {
    DEFAULT_SETTINGS,
    MARK_KEY,
    clampKeep,
    restoreAllMarked,
    summarize,
    syncMessages,
} from './core.js';

const MODULE_NAME = 'st-context-keeper';
const LOG_PREFIX = '[聊天保留层]';

/** @type {(() => any)|null} */
let contextGetter = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let saveTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let chatLoadTimer = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let keepInputTimer = null;

/* ---------------------------------- 环境 ---------------------------------- */

function isTouchDevice() {
    try {
        return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;
    } catch {
        return window.innerWidth <= 768;
    }
}

function getCtx() {
    try {
        if (contextGetter) {
            return contextGetter();
        }
        return globalThis.SillyTavern?.getContext?.() ?? null;
    } catch (error) {
        console.warn(LOG_PREFIX, '无法获取 SillyTavern 上下文', error);
        return null;
    }
}

/**
 * 优先用全局 API；极老版本才动态加载 st-context.js。
 * 动态 import 的路径写在变量里，避免加载阶段解析失败。
 */
async function resolveContext() {
    if (typeof globalThis.SillyTavern?.getContext === 'function') {
        contextGetter = () => globalThis.SillyTavern.getContext();
        return true;
    }

    try {
        const path = ['..', '..', '..', 'st-context.js'].join('/');
        const module = await import(/* @vite-ignore */ path);
        if (typeof module?.getContext === 'function') {
            contextGetter = module.getContext;
            return true;
        }
    } catch (error) {
        console.warn(LOG_PREFIX, '动态加载 st-context.js 失败', error);
    }

    return false;
}

function getChat() {
    const context = getCtx();
    return Array.isArray(context?.chat) ? context.chat : [];
}

/* ---------------------------------- 设置 ---------------------------------- */

function getSettings() {
    const context = getCtx();
    const store = context?.extensionSettings;

    if (!store) {
        return { ...DEFAULT_SETTINGS };
    }

    if (!store[MODULE_NAME] || typeof store[MODULE_NAME] !== 'object') {
        store[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }

    const settings = store[MODULE_NAME];
    settings.enabled = Boolean(settings.enabled);
    settings.keepLayers = clampKeep(settings.keepLayers);
    settings.applyOnChatLoad = settings.applyOnChatLoad !== false;

    return settings;
}

function persistSettings() {
    const context = getCtx();
    try {
        context?.saveSettingsDebounced?.();
    } catch (error) {
        console.warn(LOG_PREFIX, '保存设置失败', error);
    }
}

function notify(type, message) {
    const toastr = globalThis.toastr;
    const handler = toastr?.[type] ?? toastr?.info;
    if (typeof handler === 'function') {
        handler(message);
    }
}

/* ---------------------------------- 聊天同步 ---------------------------------- */

function scheduleSave(delay = 700) {
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(async () => {
        saveTimer = null;
        const context = getCtx();

        // 还没有落盘的临时聊天：等 SillyTavern 自己保存即可，避免“no chat file found”警告
        if (!context?.chatId) {
            return;
        }

        try {
            await context.saveChat?.();
        } catch (error) {
            console.warn(LOG_PREFIX, '保存聊天失败', error);
        }
    }, delay);
}

/**
 * 把内存中的排除状态同步到已渲染的消息节点（只改属性，不重绘）。
 * @param {Array<object>} chat
 */
function syncDom(chat) {
    const nodes = document.querySelectorAll('#chat .mes[mesid]');
    nodes.forEach((node) => {
        const id = Number(node.getAttribute('mesid'));
        const message = chat[id];
        if (!message || typeof message !== 'object') {
            return;
        }
        const next = message.is_system ? 'true' : 'false';
        if (node.getAttribute('is_system') !== next) {
            node.setAttribute('is_system', next);
        }
    });
}

/**
 * @param {{save?: boolean, silent?: boolean, notifyUser?: boolean}} [options]
 */
function syncAll({ save = true, silent = true, notifyUser = false } = {}) {
    const chat = getChat();
    if (chat.length === 0) {
        refreshStatus();
        return null;
    }

    const settings = getSettings();
    const result = syncMessages(chat, settings.keepLayers);

    if (result.excluded > 0 || result.restored > 0) {
        syncDom(chat);
        if (save) {
            scheduleSave();
        }
        if (!silent) {
            const parts = [];
            if (result.excluded > 0) parts.push(`新排除 ${result.excluded} 条`);
            if (result.restored > 0) parts.push(`恢复 ${result.restored} 条`);
            notify('success', `聊天保留层：${parts.join('，')}（保留最近 ${settings.keepLayers} 条）`);
        }
    }

    refreshStatus();

    if (notifyUser) {
        const info = summarize(chat, settings.keepLayers);
        notify('success', `聊天保留层：保留最近 ${info.held} 条，共排除 ${info.excludedTotal} 条`);
    }

    return result;
}

/**
 * @param {{notifyUser?: boolean, disable?: boolean}} [options]
 */
function restoreAll({ notifyUser = false, disable = false } = {}) {
    const chat = getChat();
    const count = restoreAllMarked(chat);

    if (count > 0) {
        syncDom(chat);
        scheduleSave(200);
    }

    if (disable) {
        const settings = getSettings();
        settings.enabled = false;
        persistSettings();
        $('#ctx_keeper_enabled').prop('checked', false);
        updateMenuLabel();
    }

    refreshStatus();

    if (notifyUser) {
        notify('success', count > 0 ? `聊天保留层：已恢复 ${count} 条消息` : '聊天保留层：没有需要恢复的消息');
    }

    return count;
}

function setEnabled(enabled) {
    const settings = getSettings();
    settings.enabled = Boolean(enabled);
    persistSettings();
    $('#ctx_keeper_enabled').prop('checked', settings.enabled);
    updateMenuLabel();

    if (settings.enabled) {
        syncAll({ save: true, silent: false });
    } else {
        restoreAll({ notifyUser: true, disable: false });
    }
}

function applyKeepLayers(nextValue, { notifyUser = false } = {}) {
    const settings = getSettings();
    settings.keepLayers = clampKeep(nextValue, settings.keepLayers);
    persistSettings();

    $('#ctx_keeper_keep').val(String(settings.keepLayers));
    updateMenuLabel();

    if (settings.enabled) {
        syncAll({ save: true, silent: true, notifyUser });
    } else {
        refreshStatus();
        if (notifyUser) {
            notify('info', `聊天保留层：已设为 ${settings.keepLayers} 条，打开开关后生效`);
        }
    }
}

/* ---------------------------------- 界面 ---------------------------------- */

function settingsHtml() {
    return `
        <div class="ctx-keeper">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>聊天保留层</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label" for="ctx_keeper_enabled">
                        <input type="checkbox" id="ctx_keeper_enabled">
                        <span>自动排除更早的消息（等同逐条点击“从提示词中排除消息”）</span>
                    </label>
                    <label class="checkbox_label" for="ctx_keeper_on_load">
                        <input type="checkbox" id="ctx_keeper_on_load">
                        <span>切换或载入聊天时自动整理</span>
                    </label>
                    <div class="ctx-keeper-row">
                        <span>保留最近</span>
                        <input type="number" id="ctx_keeper_keep" class="text_pole" min="1" max="999" step="1" inputmode="numeric">
                        <span>条消息</span>
                    </div>
                    <div id="ctx_keeper_status" class="ctx-keeper-status">—</div>
                    <div class="ctx-keeper-actions">
                        <div id="ctx_keeper_apply" class="menu_button">立即应用</div>
                        <div id="ctx_keeper_reset" class="menu_button">全部恢复</div>
                    </div>
                    <small class="ctx-keeper-hint">
                        只修改“是否参与提示词”的标记，不删除任何聊天记录。
                        “全部恢复”只会还原本插件自动排除的消息，你自己用眼睛按钮排除的消息不受影响。
                        手机上也可以点输入框旁的魔杖菜单快速调整。
                    </small>
                </div>
            </div>
        </div>
    `;
}

function menuHtml() {
    return `
        <div class="list-group-item flex-container flexGap5 interactable ctx-keeper-menu-item ctx-keeper-off" id="ctx_keeper_menu_toggle" title="聊天保留层：点击开关">
            <div class="fa-solid fa-layer-group extensionsMenuExtensionButton"></div>
            <span id="ctx_keeper_menu_label">聊天保留：关闭</span>
        </div>
        <div class="list-group-item flex-container flexGap5 interactable ctx-keeper-menu-item" id="ctx_keeper_menu_keep" title="设置保留层数">
            <div class="fa-solid fa-sliders extensionsMenuExtensionButton"></div>
            <span id="ctx_keeper_menu_keep_label">保留层数：10 条</span>
        </div>
    `;
}

function updateMenuLabel() {
    const settings = getSettings();
    $('#ctx_keeper_menu_label').text(settings.enabled ? `聊天保留：开启（${settings.keepLayers} 条）` : '聊天保留：关闭');
    $('#ctx_keeper_menu_keep_label').text(`保留层数：${settings.keepLayers} 条`);
    $('#ctx_keeper_menu_toggle').toggleClass('ctx-keeper-off', !settings.enabled);
}

function refreshStatus() {
    const chat = getChat();
    const settings = getSettings();
    const info = summarize(chat, settings.keepLayers);

    if (info.total === 0) {
        $('#ctx_keeper_status').text('当前没有聊天消息。');
        return;
    }

    const parts = [
        `共 ${info.total} 条`,
        `保留最近 ${info.held} 条`,
        `已排除 ${info.excludedTotal} 条`,
    ];

    if (info.marked !== info.excludedTotal) {
        parts.push(`其中本插件自动 ${info.marked} 条`);
    }

    let text = parts.join(' · ');

    if (info.total <= info.keep) {
        if (info.excludedTotal === 0) {
            text += '；消息数未超过保留层数，无需排除';
        } else if (info.marked === 0) {
            text += '；消息数未超过保留层数（现有排除是你手动设置的）';
        } else {
            text += '；消息数未超过保留层数，插件未新增排除';
        }
    }

    $('#ctx_keeper_status').text(text);
}

/* ---------------------------------- 移动端弹窗 ---------------------------------- */

async function openKeepPopup() {
    const context = getCtx();
    const settings = getSettings();
    const message = '保留最近多少条消息参与提示词？';
    let result;

    try {
        if (context?.callGenericPopup && context?.POPUP_TYPE) {
            const popupPromise = context.callGenericPopup(message, context.POPUP_TYPE.INPUT, String(settings.keepLayers), {
                okButton: '应用',
                cancelButton: '取消',
            });
            // 酒馆的输入弹窗是 textarea，手机上补一个数字键盘提示
            patchPopupInputMode();
            result = await popupPromise;
        } else {
            result = globalThis.prompt?.(message, String(settings.keepLayers));
        }
    } catch (error) {
        console.warn(LOG_PREFIX, '打开层数设置弹窗失败', error);
        result = globalThis.prompt?.(message, String(settings.keepLayers));
    }

    if (result === null || result === undefined || result === false || String(result).trim() === '') {
        return;
    }

    applyKeepLayers(result, { notifyUser: true });
}

/**
 * 给酒馆弹窗里的输入框加上数字键盘提示（只在手机上生效）。
 */
function patchPopupInputMode(attempt = 0) {
    const input = document.querySelector('dialog.popup[open] .popup-input');
    if (input) {
        if (!input.getAttribute('inputmode')) {
            input.setAttribute('inputmode', 'numeric');
        }
        input.setAttribute('pattern', '[0-9]*');
        return;
    }
    if (attempt < 6) {
        setTimeout(() => patchPopupInputMode(attempt + 1), 100);
    }
}

/* ---------------------------------- 事件绑定 ---------------------------------- */

function bindSettingsUi() {
    const settings = getSettings();

    $('#ctx_keeper_enabled').prop('checked', settings.enabled).on('change', function () {
        setEnabled(this.checked);
    });

    $('#ctx_keeper_on_load').prop('checked', settings.applyOnChatLoad).on('change', function () {
        const current = getSettings();
        current.applyOnChatLoad = Boolean(this.checked);
        persistSettings();
    });

    $('#ctx_keeper_keep').val(String(settings.keepLayers))
        .on('input', function () {
            // 手机数字键盘输入过程中可能出现空值/半成品，先不处理
            const raw = String(this.value ?? '').trim();
            if (!/^\d+$/.test(raw)) {
                return;
            }

            const current = getSettings();
            const next = clampKeep(raw, current.keepLayers);
            if (next === current.keepLayers) {
                return;
            }

            if (keepInputTimer) {
                clearTimeout(keepInputTimer);
            }
            keepInputTimer = setTimeout(() => {
                keepInputTimer = null;
                applyKeepLayers(next);
            }, 450);
        })
        .on('change blur', function () {
            if (keepInputTimer) {
                clearTimeout(keepInputTimer);
                keepInputTimer = null;
            }
            const current = getSettings();
            const next = clampKeep(this.value, current.keepLayers);
            $(this).val(String(next));
            applyKeepLayers(next);
        });

    $('#ctx_keeper_apply').on('click', () => {
        const current = getSettings();
        if (!current.enabled) {
            current.enabled = true;
            persistSettings();
            $('#ctx_keeper_enabled').prop('checked', true);
            updateMenuLabel();
        }
        syncAll({ save: true, silent: true, notifyUser: true });
    });

    $('#ctx_keeper_reset').on('click', () => {
        restoreAll({ notifyUser: true, disable: true });
    });
}

function bindMenuEvents() {
    $('#ctx_keeper_menu_toggle')
        .off('click.ctxKeeper')
        .on('click.ctxKeeper', () => {
            setEnabled(!getSettings().enabled);
        });

    $('#ctx_keeper_menu_keep')
        .off('click.ctxKeeper')
        .on('click.ctxKeeper', () => {
            openKeepPopup();
        });
}

/**
 * 魔杖菜单由 SillyTavern 启动时动态创建，可能晚于扩展加载；
 * 有限次重试，避免手机上（加载更慢）丢菜单。
 */
function ensureMenuItems(attempt = 0) {
    if ($('#ctx_keeper_menu_toggle').length) {
        updateMenuLabel();
        return;
    }

    const menu = $('#extensionsMenu');
    if (!menu.length) {
        if (attempt < 40) {
            setTimeout(() => ensureMenuItems(attempt + 1), 250);
        } else {
            console.warn(LOG_PREFIX, '未找到扩展菜单容器，快捷开关不可用（设置面板不受影响）');
        }
        return;
    }

    menu.append(menuHtml());
    bindMenuEvents();
    updateMenuLabel();
}

function mountPanel() {
    const container = $('#extensions_settings');
    if (!container.length) {
        console.warn(LOG_PREFIX, '未找到扩展设置容器');
        return false;
    }

    if ($('.ctx-keeper').length) {
        return true;
    }

    // 手机上面板通常很长，放到最前面，少滚几下
    if (isTouchDevice()) {
        container.prepend(settingsHtml());
    } else {
        container.append(settingsHtml());
    }

    return true;
}

function registerEvents() {
    const context = getCtx();
    const eventSource = context?.eventSource;
    const eventTypes = context?.eventTypes ?? context?.event_types;

    if (!eventSource || !eventTypes) {
        console.warn(LOG_PREFIX, '事件系统不可用，自动整理功能将只在手动点击时生效');
        return;
    }

    const autoSync = () => {
        if (!getSettings().enabled) {
            return;
        }
        // 生成和消息流程中不主动写盘：改动落在消息对象上，
        // SillyTavern 自己保存聊天时会一并写入，避免与它的存档互相踩踏。
        syncAll({ save: false });
    };

    // 生成前：保证这一次提示词用的是最新窗口
    eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, autoSync);

    // 消息收发 / 删除 / 滑动后：窗口边界会变化，重新整理
    eventSource.on(eventTypes.MESSAGE_SENT, autoSync);
    eventSource.on(eventTypes.MESSAGE_RECEIVED, autoSync);
    eventSource.on(eventTypes.MESSAGE_DELETED, autoSync);
    eventSource.on(eventTypes.MESSAGE_SWIPED, autoSync);
    eventSource.on(eventTypes.MESSAGE_EDITED, autoSync);

    eventSource.on(eventTypes.GENERATION_ENDED, () => {
        refreshStatus();
    });

    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        refreshStatus();
        const settings = getSettings();
        if (!settings.enabled || !settings.applyOnChatLoad) {
            return;
        }

        syncAll({ save: true });

        if (chatLoadTimer) {
            clearTimeout(chatLoadTimer);
        }
        chatLoadTimer = setTimeout(() => {
            chatLoadTimer = null;
            syncDom(getChat());
            refreshStatus();
        }, 450);
    });

    eventSource.on(eventTypes.APP_READY, () => {
        refreshStatus();
        ensureMenuItems();
    });
}

/* ---------------------------------- 启动 ---------------------------------- */

async function bootstrap() {
    const resolved = await resolveContext();
    if (!resolved) {
        console.error(LOG_PREFIX, '未找到 SillyTavern 上下文接口，插件无法工作');
        notify('error', '聊天保留层：未找到酒馆接口，请确认酒馆版本');
        return;
    }

    getSettings();

    if (!mountPanel()) {
        return;
    }

    bindSettingsUi();
    ensureMenuItems();
    updateMenuLabel();
    refreshStatus();
    registerEvents();

    console.debug(LOG_PREFIX, `已加载（${isTouchDevice() ? '移动端' : '桌面端'}）`);
}

jQuery(() => {
    bootstrap().catch((error) => {
        console.error(LOG_PREFIX, '初始化失败', error);
        notify('error', '聊天保留层初始化失败，请查看浏览器控制台');
    });
});

// 便于在控制台排查
globalThis.ctxKeeper = { getSettings, syncAll, restoreAll, setEnabled, openKeepPopup, MARK_KEY };
