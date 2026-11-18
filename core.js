/**
 * 聊天保留层 - 纯逻辑层
 *
 * SillyTavern 1.13.x 的“从提示词中排除消息”按钮（眼睛图标）本质上是把
 * message.is_system 置为 true；提示词构建时会过滤掉这些消息。
 *
 * 本模块不依赖 DOM / SillyTavern，便于单元测试。
 */

/** 写入 message.extra 的标记，用于区分“本插件自动排除”和“用户手动排除” */
export const MARK_KEY = 'ctxKeeperAuto';

/** 设置项默认值 */
export const DEFAULT_SETTINGS = {
    /** 总开关：开启后会自动排除超出保留层数的消息 */
    enabled: false,
    /** 保留最近多少条消息（每层 = 一条聊天消息） */
    keepLayers: 10,
    /** 切换 / 载入聊天时是否自动整理一次 */
    applyOnChatLoad: true,
};

/**
 * 把任意输入规范成合法的保留层数。
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function clampKeep(value, fallback = DEFAULT_SETTINGS.keepLayers) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(999, Math.max(1, Math.floor(number)));
}

/**
 * 计算保留窗口的起点。索引小于 cutoff 的消息会被排除。
 * @param {number} total 消息总数
 * @param {number} keepLayers 保留层数
 * @returns {number}
 */
export function computeCutoff(total, keepLayers) {
    const keep = clampKeep(keepLayers);
    return Math.max(0, total - keep);
}

/**
 * 按保留层数同步所有消息的排除状态。
 * - 超出窗口的消息：标记 is_system = true，并写入 MARK_KEY
 * - 回到窗口内、且是本插件排除的消息：恢复 is_system = false 并清除标记
 * - 用户自己排除的消息（没有 MARK_KEY）永远不动
 *
 * @param {Array<object>} chat
 * @param {number} keepLayers
 * @returns {{cutoff: number, excluded: number, restored: number}}
 */
export function syncMessages(chat, keepLayers) {
    const list = Array.isArray(chat) ? chat : [];
    const cutoff = computeCutoff(list.length, keepLayers);
    let excluded = 0;
    let restored = 0;

    for (let index = 0; index < list.length; index++) {
        const message = list[index];
        if (!message || typeof message !== 'object') {
            continue;
        }

        const isMarked = Boolean(message.extra && message.extra[MARK_KEY]);

        if (index < cutoff) {
            if (!message.is_system) {
                message.is_system = true;
                if (!message.extra || typeof message.extra !== 'object') {
                    message.extra = {};
                }
                message.extra[MARK_KEY] = true;
                excluded++;
            } else if (!isMarked) {
                // 已经被用户手动排除，保持原样，不打标记
            }
        } else if (message.is_system && isMarked) {
            message.is_system = false;
            delete message.extra[MARK_KEY];
            restored++;
        }
    }

    return { cutoff, excluded, restored };
}

/**
 * 恢复所有由本插件排除的消息，并且只恢复这些消息。
 * @param {Array<object>} chat
 * @returns {number} 恢复条数
 */
export function restoreAllMarked(chat) {
    const list = Array.isArray(chat) ? chat : [];
    let count = 0;

    for (const message of list) {
        if (!message || typeof message !== 'object') {
            continue;
        }
        if (!message.extra || !message.extra[MARK_KEY]) {
            continue;
        }
        message.is_system = false;
        delete message.extra[MARK_KEY];
        count++;
    }

    return count;
}

/**
 * 生成用于界面展示的统计信息。
 * @param {Array<object>} chat
 * @param {number} keepLayers
 * @returns {{total: number, keep: number, held: number, cutoff: number, excludedTotal: number, marked: number}}
 */
export function summarize(chat, keepLayers) {
    const list = Array.isArray(chat) ? chat : [];
    const keep = clampKeep(keepLayers);
    const total = list.length;
    let excludedTotal = 0;
    let marked = 0;

    for (const message of list) {
        if (!message || typeof message !== 'object') {
            continue;
        }
        if (message.is_system) {
            excludedTotal++;
        }
        if (message.extra && message.extra[MARK_KEY]) {
            marked++;
        }
    }

    return {
        total,
        keep,
        held: Math.min(keep, total),
        cutoff: computeCutoff(total, keep),
        excludedTotal,
        marked,
    };
}
