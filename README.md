# pi-notify

> Notification extension for [pi coding agent](https://github.com/earendil-works/pi-coding-agent) — tab status, system sounds, terminal bell, and Bark push to iPhone.

[中文版](#中文说明)

---

## Features

- **Tab title + footer status** — shows ⏳ running / ✅ complete / ❌ error on your terminal tab and footer
- **System notification sound** — plays a custom `.wav` / `.mp3` / `.aiff` file when the agent finishes
- **Loop mode** — notification sound loops until you press any key or start a new interaction
- **Terminal bell** — optional BEL (`\x07`) on completion
- **OSC 9 notification** — desktop notification popup (iTerm2, Ghostty, WezTerm, Windows Terminal)
- **Bark push** — sends push notification to your iPhone via [Bark](https://github.com/Finb/Bark)
- **Fully configurable** — `/notify` interactive settings panel, all options are toggleable
- **Sound preview** — `/notify-sound` lets you browse and preview system sounds before selecting

## Installation

```bash
# via git
pi install git:github.com/2008muyu/pi-notify

# or via npm (once published)
pi install npm:pi-notify
```

Then restart pi (or run `:reload` in pi).

## Usage

### `/notify` — Settings Panel

Opens an interactive settings panel with cursor persistence — toggles are applied inline without losing your place.

| Option | Description |
|--------|-------------|
| ✅ Sound | Enable/disable notification sounds |
| ✅ Terminal bell | Enable/disable BEL (`\x07`) |
| ✅ Loop sound | Enable/disable looping notification sound |
| ✅ OS notification | Enable/disable OSC 9 desktop notification |
| ✅ Bark push | Set Bark device key for iPhone push |
| ♪ Sound file | Pick a custom notification sound |

Navigate with **↑↓**, toggle with **Enter**, exit with **Esc**.

### `/notify-sound` — Sound Picker

Browse and preview system sounds before selecting one as your notification sound.

- **↑↓** navigate list
- **Space** preview sound
- **Enter** select and save
- **Esc** cancel

## Configuration

Configuration is stored in `~/.pi/agent/pi-notify.json`. You can also use environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_NOTIFY_SOUND` | `true` | Enable/disable sounds |
| `PI_NOTIFY_BELL` | `true` | Enable/disable terminal bell |
| `PI_NOTIFY_LOOP` | `false` | Enable/disable looping |
| `PI_NOTIFY_OS_NOTIFY` | `true` | Enable/disable OSC 9 notifications |
| `BARK_KEY` / `PI_NOTIFY_BARK_KEY` | — | Bark device key |
| `BARK_SERVER` | `https://api.day.app` | Bark server URL |

## How It Works

1. When the agent starts (`agent_start`), the extension sets the tab title to ⏳ and prepares for notifications
2. When the agent ends (`agent_end`), it triggers:
   - Terminal bell (optional)
   - OSC 9 desktop notification (optional)
   - System sound playback (custom file or system default)
   - Bark push to iPhone (if configured)
3. **Loop mode**: the sound keeps playing in a background PowerShell process. Press any key or start a new conversation to stop it
4. Error handling catches all failures silently — the extension never blocks the agent

## Publishing to the pi Community

This package can be distributed through:

### Via GitHub (recommended)

Users can install directly from GitHub:

```bash
pi install git:github.com/2008muyu/pi-notify
```

### Via npm

To publish to npm and make it installable via `pi install npm:pi-notify`:

1. Ensure you have an [npm account](https://www.npmjs.com/signup)
2. Update `package.json` with the correct registry metadata
3. Run:

```bash
npm login
npm publish
```

### Via the pi Package Registry

Check [pi packages documentation](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/packages.md) for the official community registry once available.

---

## License

MIT

---

# 中文说明

## 简介

**pi-notify** 是 [pi 编程助手](https://github.com/earendil-works/pi-coding-agent) 的通知扩展，提供终端标签状态、系统提示音、响铃和 iPhone 推送功能。

## 功能

- **终端标签页 + 底部状态栏** — 显示 ⏳ 运行中 / ✅ 完成 / ❌ 错误
- **自定义提示音** — Agent 完成时播放自定义 `.wav` / `.mp3` / `.aiff` 文件
- **循环模式** — 提示音持续循环，按任意键或开始新对话即停
- **终端响铃** — 可选的 BEL 提示音
- **桌面通知** — OSC 9 弹窗通知（iTerm2、Ghostty、WezTerm、Windows Terminal）
- **Bark 推送** — 通过 [Bark](https://github.com/Finb/Bark) 推送到 iPhone
- **完全可配置** — `/notify` 交互式面板，所有选项即开即关
- **声音预览** — `/notify-sound` 浏览和试听系统音效

## 安装

```bash
# 通过 GitHub
pi install git:github.com/2008muyu/pi-notify

# 或通过 npm（发布后）
pi install npm:pi-notify
```

安装后重启 pi（或运行 `:reload`）。

## 使用方法

### `/notify` — 设置面板

光标位置保持的交互式设置面板，开关项即时生效不跳转。

| 选项 | 说明 |
|------|------|
| ✅ Sound | 启用/禁用提示音 |
| ✅ Terminal bell | 启用/禁用终端响铃 |
| ✅ Loop sound | 启用/禁用循环播放 |
| ✅ OS notification | 启用/禁用桌面通知 |
| ✅ Bark push | 设置 Bark 设备密钥 |
| ♪ Sound file | 选择自定义提示音 |

**↑↓** 导航，**Enter** 切换/进入，**Esc** 退出。

### `/notify-sound` — 声音选择器

浏览和试听系统音效，选定后设为通知音。

- **↑↓** 浏览列表
- **Space** 试听
- **Enter** 选定并保存
- **Esc** 取消

## 配置

配置文件位于 `~/.pi/agent/pi-notify.json`，也支持环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PI_NOTIFY_SOUND` | `true` | 启用/禁用声音 |
| `PI_NOTIFY_BELL` | `true` | 启用/禁用终端响铃 |
| `PI_NOTIFY_LOOP` | `false` | 启用/禁用循环 |
| `PI_NOTIFY_OS_NOTIFY` | `true` | 启用/禁用桌面通知 |
| `BARK_KEY` / `PI_NOTIFY_BARK_KEY` | — | Bark 设备密钥 |
| `BARK_SERVER` | `https://api.day.app` | Bark 服务器地址 |

## 工作原理

1. Agent 开始运行 → 标签页显示 ⏳
2. Agent 完成 → 触发：
   - 终端响铃（可选）
   - OSC 9 桌面通知（可选）
   - 播放提示音（自定义文件或系统默认）
   - Bark 推送（已配置时）
3. **循环模式**：提示音在后台 PowerShell 进程中持续播放，按任意键或开始新对话即停止
4. 所有失败静默处理，绝不阻塞 Agent

## 发布到 pi 社区

### 通过 GitHub（推荐）

用户可以直接从 GitHub 安装：

```bash
pi install git:github.com/2008muyu/pi-notify
```

### 通过 npm

```bash
npm login
npm publish
```

然后用户可通过 `pi install npm:pi-notify` 安装。

### 通过 pi 官方包管理器

待官方社区注册中心上线后，可参考 [pi packages 文档](https://github.com/earendil-works/pi-coding-agent/blob/main/docs/packages.md) 发布。

---

## 许可证

MIT
