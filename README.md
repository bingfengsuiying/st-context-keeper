# 聊天保留层 · Context Keeper

一个 SillyTavern 扩展：用一个开关加一个数字，批量把更早的聊天消息“从提示词中排除”，只保留最近 N 条参与对话。

兼容 **SillyTavern 1.13.x ~ 1.18.x**，桌面和手机浏览器都能用。

> A SillyTavern extension that automatically excludes older chat messages from the prompt, keeping only the last N messages. Works on desktop and mobile (1.13.x–1.18.x).

---

## 功能

SillyTavern 每条消息上有一个“从提示词中排除消息”的眼睛按钮。点它之后，消息仍留在聊天记录里，但不会再进入发给 AI 的提示词。

这个扩展把这件事自动化：

- **开启开关后**，只保留最近 N 条消息参与提示词，更早的消息自动打上排除标记；
- 聊天变长时窗口自动前移，多出来的旧消息自动排除；
- 调大 N、删除消息后，之前由本插件排除的消息会自动恢复；
- 生成前、收发消息后、切换聊天时都会自动对齐窗口。

它只改“是否参与提示词”的标记（`message.is_system`），**不删除、不修改任何聊天内容**，随时可以一键还原。

## 安装

### 方式一：酒馆内一键安装（推荐，手机也可用）

1. 打开酒馆 → 左侧「扩展」（积木图标）→ **Install extension**；
2. 填入本仓库地址，例如：
   ```
   https://github.com/你的用户名/st-context-keeper
   ```
3. 安装完成后刷新页面（`Ctrl + F5` 或手机下拉刷新）。

> 酒馆会把仓库克隆到 `public/scripts/extensions/third-party/<仓库名>`，所以建议仓库名就用 `st-context-keeper`。

### 方式二：手机手动复制

1. 在 GitHub 页面点 **Code → Download ZIP**，传到手机；
2. 解压得到 `st-context-keeper` 文件夹；
3. 整个文件夹放到酒馆目录下：
   ```
   SillyTavern/public/scripts/extensions/third-party/st-context-keeper/
   ```
   Termux 安装的通常在 `~/SillyTavern/...`；
4. 确认结构是 `third-party/st-context-keeper/manifest.json`，不要多套一层同名文件夹；
5. 刷新酒馆页面。

### 方式三：Termux / 电脑 git clone

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/你的用户名/st-context-keeper.git
```

之后更新只需要：

```bash
cd SillyTavern/public/scripts/extensions/third-party/st-context-keeper
git pull
```

## 使用

### 扩展面板

「扩展」面板里的「聊天保留层」：

1. 勾选 **自动排除更早的消息**；
2. 设置 **保留最近 N 条消息**（默认 10，按消息条数算，一条消息 = 一层）；
3. 点 **立即应用**，或直接发一条消息让它自动生效。

状态行会显示：`共 128 条 · 保留最近 10 条 · 已排除 118 条`。

- **立即应用**：按当前设置立刻整理一次（未开启会顺带开启）；
- **全部恢复**：关闭开关并还原本插件排除过的消息；
- **切换或载入聊天时自动整理**：关闭后只在生成/收发消息时整理。

### 手机快捷入口（魔杖菜单）

手机上面板比较深，点输入框旁的 **魔杖按钮**，菜单里有两个入口：

- **聊天保留：开启/关闭** —— 一键开关；
- **保留层数：10 条** —— 弹窗输入数字，改完立即生效。

手机端面板会自动排在扩展设置区最前面，按钮 44px，高度适合手指点按。

## 和手动排除的区别

| 情况 | 行为 |
| --- | --- |
| 你自己用眼睛按钮排除的消息（保留窗口内） | 保持不变，不会被恢复 |
| 你自己用眼睛按钮排除的消息（窗口外） | 保持不变，也不会被打标记 |
| 本插件自动排除的消息 | 标记在 `message.extra.ctxKeeperAuto`，只会被本插件恢复 |
| 消息数少于保留层数 | 不做任何排除 |

## 兼容性

- 排除机制：1.13 与 1.18 都是 `message.is_system`，提示词构建时过滤（`coreChat`），行为一致。
- 不静态 import 酒馆内部模块，优先使用全局 `SillyTavern.getContext()`，拿不到时才动态加载 `st-context.js`，避免版本升级后路径变化导致插件加载失败。
- 使用的事件：`GENERATION_AFTER_COMMANDS`、`MESSAGE_SENT`、`MESSAGE_RECEIVED`、`MESSAGE_DELETED`、`MESSAGE_SWIPED`、`MESSAGE_EDITED`、`CHAT_CHANGED`、`APP_READY`。
- 魔杖菜单由酒馆延迟创建，插件会自动重试挂载。
- 设置保存在 `extension_settings['st-context-keeper']`。

## 排障

**面板里没有「聊天保留层」**
- 打开「管理扩展」，确认 `Context Keeper` 是启用状态；
- 强制刷新（电脑 `Ctrl + F5`，手机清缓存或换个标签页打开）；
- 检查路径是否多套了一层文件夹。

**魔杖菜单没有入口**
- 稍等一两秒再打开菜单（插件会自动重试挂载）；
- 控制台看是否有 `[聊天保留层]` 开头的警告。

**改完层数没反应**
- 需要打开「自动排除更早的消息」开关才会生效；
- 消息数少于保留层数时不会排除任何消息，这是正常的。

## 开发

```
st-context-keeper/
├── manifest.json   扩展声明
├── index.js        设置面板、魔杖菜单、事件挂钩、移动端适配
├── core.js         纯逻辑：窗口计算、标记/恢复、统计（无 DOM 依赖）
└── style.css       面板样式与移动端媒体查询
```

`core.js` 可以单独用 Node 测试：`syncMessages()`、`restoreAllMarked()`、`summarize()` 都是纯函数。

## License

MIT
