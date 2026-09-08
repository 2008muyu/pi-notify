/**
 * pi-notify — pi coding agent 任务通知扩展
 *
 * 功能：
 *   1. 终端 tab 标题 + footer 状态标记（⏳ running / ✅ complete / ❌ error）
 *   2. 终端 BEL 响铃
 *   3. OSC 9 系统通知（iTerm2 / Ghostty / WezTerm / Windows Terminal）
 *   4. 系统原生提示音（macOS / Linux / Windows）
 *   5. Bark 推送到 iPhone
 *
 * 配置（二选一）：
 *   文件：~/.pi/agent/pi-notify.json
 *   环境变量：BARK_KEY, BARK_SERVER, PI_NOTIFY_SOUND=false, PI_NOTIFY_BELL=false
 */
import { DynamicBorder, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Text, matchesKey, Key, isKeyRelease } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { homedir } from "node:os";

// ─── Config ───────────────────────────────────────────────────

interface Config {
  /** Bark device key（不配则不推送手机） */
  barkKey?: string;
  /** Bark 服务器地址，默认 https://api.day.app */
  barkServer?: string;
  /** 是否播放声音，默认 true */
  sound?: boolean;
  /** 自定义完成音效文件路径（.wav/.mp3/.aiff），不配则用系统默认提示音 */
  soundFile?: string;
  /** 自定义错误音效文件路径 */
  soundFileError?: string;
  /** 是否响终端铃，默认 true */
  bell?: boolean;
  /** 是否循环播放提示音，默认 false */
  loop?: boolean;
  /** 是否发 OSC 9 系统通知，默认 true */
  osNotify?: boolean;
  /** 是否启用 Bark 推送，默认 false */
  barkEnabled?: boolean;
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-notify.json");

function loadConfig(): Config {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch {}
  }
  return {
    barkKey: process.env.BARK_KEY || process.env.PI_NOTIFY_BARK_KEY,
    barkServer: process.env.BARK_SERVER || "https://api.day.app",
    sound: process.env.PI_NOTIFY_SOUND !== "false",
    bell: process.env.PI_NOTIFY_BELL !== "false",
    loop: process.env.PI_NOTIFY_LOOP === "true",
    osNotify: process.env.PI_NOTIFY_OS_NOTIFY !== "false",
    barkEnabled: process.env.PI_NOTIFY_BARK_ENABLED === "true",
  };
}

function saveConfig(cfg: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

/** 扫描目录下的音频文件 */
function scanSounds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const exts = new Set([".wav", ".mp3", ".aiff", ".ogg", ".oga", ".flac"]);
  try {
    return readdirSync(dir)
      .filter(f => exts.has(extname(f).toLowerCase()))
      .map(f => join(dir, f));
  } catch { return []; }
}

// ─── Sound files per platform ─────────────────────────────────

const SOUNDS: Record<string, { ok: string[]; err: string[] }> = {
  darwin: {
    ok:  ["/System/Library/Sounds/Glass.aiff"],
    err: ["/System/Library/Sounds/Basso.aiff"],
  },
  linux: {
    ok:  ["/usr/share/sounds/freedesktop/stereo/complete.oga"],
    err: ["/usr/share/sounds/freedesktop/stereo/bell.oga"],
  },
  win32: {
    ok:  [],  // uses PowerShell SystemSounds
    err: [],
  },
};

// ─── Main ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let projectName = "";
  let _titleTimer: ReturnType<typeof setInterval> | null = null;

  function setTabTitle(label: string) {
    const tt = `pi ${label} ${projectName}`;
    process.stdout.write(`\x1b]0;${tt}\x07`);
    process.stdout.write(`\x1b]2;${tt}\x07`);
    process.title = tt;
    // 持续刷新，防止被 PowerShell/终端覆盖
    if (_titleTimer) clearInterval(_titleTimer);
    _titleTimer = setInterval(() => {
      process.stdout.write(`\x1b]0;${tt}\x07`);
      process.stdout.write(`\x1b]2;${tt}\x07`);
      process.title = tt;
    }, 3000);
  }

  function clearTabTitle() {
    if (_titleTimer) { clearInterval(_titleTimer); _titleTimer = null; }
  }

  // ── 注册终端按键监听：循环音效时按任意键即停 ──────
  let _listenerRegistered = false;
  pi.on("session_start", (_event, ctx) => {
    if (ctx.hasUI && !_listenerRegistered) {
      _listenerRegistered = true;
      ctx.ui.onTerminalInput((_data: string) => {
        if (_loopingAbort) stopLoopingSound();
        return undefined; // 不消费按键，透传
      });
    }
  });

  // ── Commands ─────────────────────────────────────────────

  // /notify — 自定义设置面板，开关项光标不跳，bark/sound 走子面板
  pi.registerCommand("notify", {
    description: "Configure pi-notify: sound, bell, Bark push, etc.",
    handler: async (_args, ctx) => {
      const cfg = loadConfig();

      function buildItems() {
        return [
          { label: `${cfg.sound !== false ? "✅" : "⬜"} Sound`, value: "sound" },
          { label: `${cfg.bell !== false ? "✅" : "⬜"} Terminal bell`, value: "bell" },
          { label: `${cfg.loop ? "✅" : "⬜"} Loop sound`, value: "loop" },
          { label: `${cfg.osNotify !== false ? "✅" : "⬜"} OS notification`, value: "osNotify" },
          { label: (cfg.barkKey && cfg.barkEnabled ? "✅" : "⬜") + " Bark push" + (cfg.barkKey ? " (" + cfg.barkKey.slice(0, 8) + "...)" : ""), value: "barkKey" },
          { label: `♪ Sound file: ${cfg.soundFile || "(system default)"}`, value: "soundFile" },
        ];
      }

      let lastIndex = 0;

      while (true) {
        const result = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (result: number | undefined) => void) => {
          let currentIndex = lastIndex;

          const container = new Container();
          container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
          container.addChild(new Text(
            theme.fg("accent", theme.bold("pi-notify settings")) +
            theme.fg("dim", "  ↑↓ navigate  Enter toggle  Esc exit"),
            1, 0
          ));
          const listC = new Container();
          container.addChild(listC);
          container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

          function render() {
            listC.clear();
            const items = buildItems();
            for (let i = 0; i < items.length; i++) {
              const line = i === currentIndex
                ? theme.fg("accent", "→ " + items[i].label)
                : "  " + items[i].label;
              listC.addChild(new Text(line, 1, 0));
            }
          }
          render();

          return {
            render: (w: any) => container.render(w),
            invalidate: () => container.invalidate(),
            handleInput: (data: string) => {
              // kitty keyboard protocol (Ghostty/iTerm2) sends CSI-u sequences;
              // raw comparison misses them. matchesKey() normalizes both forms.
              if (isKeyRelease(data)) return;
              const items = buildItems();

              if (matchesKey(data, Key.up)) {
                currentIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
                render();
                tui.requestRender();
              }
              else if (matchesKey(data, Key.down)) {
                currentIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1;
                render();
                tui.requestRender();
              }
              else if (matchesKey(data, Key.enter)) {
                const action = items[currentIndex].value;
                // 开关项：面板内直接处理，光标不动
                if (action === "sound") { cfg.sound = !cfg.sound; saveConfig(cfg); render(); tui.requestRender(); }
                else if (action === "bell") { cfg.bell = !cfg.bell; saveConfig(cfg); render(); tui.requestRender(); }
                else if (action === "loop") { cfg.loop = !cfg.loop; saveConfig(cfg); render(); tui.requestRender(); }
                else if (action === "osNotify") { cfg.osNotify = !cfg.osNotify; saveConfig(cfg); render(); tui.requestRender(); }
                // barkKey / soundFile：关面板，走外部子流程
                else {
                  lastIndex = currentIndex;
                  done(currentIndex);
                }
              }
              else if (matchesKey(data, Key.escape)) {
                done(undefined);
              }
            },
          };
        });

        if (result === undefined) break;

        const items = buildItems();
        const action = items[result].value;

        if (action === "barkKey") {
          if (cfg.barkKey) {
            // 有 key → 打开编辑，预填当前 key；留空提交 = 切换开关
            const newKey = await ctx.ui.input("Bark device key (leave empty to toggle on/off):", cfg.barkKey);
            if (newKey === undefined) {
              // Esc → 放弃
            } else if (newKey.trim() && newKey.trim() !== cfg.barkKey) {
              cfg.barkKey = newKey.trim();
              cfg.barkEnabled = true;
              saveConfig(cfg);
              ctx.ui.notify("Bark key updated", "info");
            } else {
              // 留空或没改 → 切换开关
              cfg.barkEnabled = !cfg.barkEnabled;
              saveConfig(cfg);
              ctx.ui.notify(cfg.barkEnabled ? "Bark push on" : "Bark push off", "info");
            }
          } else {
            // 无 key → 输入并启用
            const newKey = await ctx.ui.input("Bark device key:", "");
            if (newKey !== undefined && newKey.trim()) {
              cfg.barkKey = newKey.trim();
              cfg.barkEnabled = true;
              saveConfig(cfg);
              ctx.ui.notify("Bark key saved", "info");
            }
          }
        } else if (action === "soundFile") {
          const path = await soundPicker(ctx, pi);
          if (path !== undefined) {
            if (path === "__reset__") cfg.soundFile = undefined;
            else cfg.soundFile = path;
            saveConfig(cfg);
            ctx.ui.notify(`Sound: ${cfg.soundFile || "system default"}`, "info");
          }
        }
        // 回到 while 开头重建面板，光标保持在 lastIndex
      }
    },
  });

  // /notify-sound — 快捷选声音 + 试听（分页 + 空格预览）
  pi.registerCommand("notify-sound", {
    description: "Pick notification sound and preview it",
    handler: async (_args, ctx) => {
      const result = await soundPicker(ctx, pi);
      if (result === undefined) return;

      const cfg = loadConfig();
      if (result === "__reset__") {
        cfg.soundFile = undefined;
      } else {
        cfg.soundFile = result;
      }
      saveConfig(cfg);
      ctx.ui.notify(`Sound: ${cfg.soundFile || "system default"}`, "info");
    },
  });

  // ── 分页声音选择器 ────────────────────────────────────
  async function soundPicker(ctx: any, pi: ExtensionAPI): Promise<string | undefined> {
    const userDir = join(homedir(), ".pi", "agent", "sounds");
    const sysDirs: string[] = ({
      win32:  ["C:/Windows/Media"],
      darwin: ["/System/Library/Sounds"],
      linux:  ["/usr/share/sounds/freedesktop/stereo", "/usr/share/sounds"],
    } as Record<string, string[] | undefined>)[process.platform] || [];

    const userFiles = scanSounds(userDir);
    const sysFiles = sysDirs.flatMap(d => scanSounds(d));

    // 构建条目列表
    type Item = { label: string; path: string };
    const items: Item[] = [];
    for (const f of userFiles) items.push({ label: "♫ " + f.split(/[/\\]/).pop()!, path: f });
    for (const f of sysFiles) items.push({ label: "  " + f.split(/[/\\]/).pop()!, path: f });
    items.push({ label: "Reset to default", path: "__reset__" });

    if (items.length === 0) {
      ctx.ui.notify("No sound files found", "warning");
      return undefined;
    }

    let selectedIndex = 0;
    let playing = false;

    return ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (result: string | undefined) => void) => {
      const container = new Container();

      // Top border
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      // Title
      container.addChild(new Text(
        theme.fg("accent", theme.bold("Pick notification sound")) +
        theme.fg("dim", "  ↑↓ navigate  Space preview  Enter select  Esc cancel"),
        1, 0
      ));

      // List container
      const listContainer = new Container();
      container.addChild(listContainer);

      // Bottom border
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      function renderList() {
        listContainer.clear();
        const maxVisible = Math.max(1, (tui.height || 24) - 8);
        const half = Math.floor(maxVisible / 2);
        const start = Math.max(0, Math.min(selectedIndex - half, items.length - maxVisible));
        const end = Math.min(items.length, start + maxVisible);

        for (let i = start; i < end; i++) {
          const item = items[i];
          const isCurrent = i === selectedIndex;
          const line = isCurrent
            ? theme.fg("accent", "→ " + item.label)
            : "  " + item.label;
          listContainer.addChild(new Text(line, 1, 0));
        }

        if (items.length > maxVisible) {
          listContainer.addChild(new Text(
            theme.fg("dim", `  (${selectedIndex + 1}/${items.length})`),
            1, 0
          ));
        }
      }

      function previewCurrent() {
        try {
          const item = items[selectedIndex];
          if (item.path === "__reset__" || playing) return;
          playing = true;
          playSoundFile(pi, item.path).finally(() => { playing = false; });
        } catch { playing = false; }
      }

      renderList();

      return {
        render: (w: any) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data: string) => {
          if (isKeyRelease(data)) return;
          // matchesKey() handles both legacy and kitty-protocol sequences
          if (matchesKey(data, Key.up)) {
            selectedIndex = selectedIndex === 0 ? items.length - 1 : selectedIndex - 1;
            renderList();
            previewCurrent();
            tui.requestRender();
          }
          else if (matchesKey(data, Key.down)) {
            selectedIndex = selectedIndex === items.length - 1 ? 0 : selectedIndex + 1;
            renderList();
            previewCurrent();
            tui.requestRender();
          }
          else if (matchesKey(data, Key.enter)) {
            const path = items[selectedIndex].path;
            done(path === "__reset__" ? "__reset__" : path);
          }
          else if (matchesKey(data, Key.escape)) {
            done(undefined);
          }
          else if (matchesKey(data, Key.space)) {
            const item = items[selectedIndex];
            if (item.path !== "__reset__" && !playing) {
              playing = true;
              playSoundFile(pi, item.path).finally(() => { playing = false; });
            }
          }
        },
      };
    });
  }

  // ── Events ──────────────────────────────────────────────
  pi.on("agent_start", async (_event, ctx) => {
    projectName = ctx.cwd.split(/[/\\]/).pop() || "";
    stopLoopingSound();  // 新交互开始 → 停掉循环音效

    if (ctx.hasUI) {
      ctx.ui.setStatus("notify", "⏳ running");
    }
    setTabTitle("⏳");
  });

  // ── agent_end → notify complete ────────────────────────
  pi.on("agent_end", async (event, ctx) => {
    const cfg = loadConfig();

    // 从事件消息提取任务描述（取第一行，不超过 30 字）
    let taskDesc = projectName;
    if (event.messages?.length) {
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const m = event.messages[i] as any;
        if (m.role === "user" && m.content) {
          const raw = typeof m.content === "string" ? m.content.trim() : "";
          const firstLine = raw.split(/\n/)[0] || "";
          taskDesc = firstLine.length > 30 ? firstLine.slice(0, 27) + "..." : firstLine;
          break;
        }
      }
    }

    if (ctx.hasUI) {
      ctx.ui.setStatus("notify", "✅ complete");
    }
    setTabTitle("✅");

    fireNotifications(pi, cfg, taskDesc, "✅", "complete");
  });

  // ── agent_error → notify error ─────────────────────────
  //
  // NOTE: pi coding-agent 没有 "agent_error" 事件。
  // 这个 handler 永远不会触发，保留代码仅供参考。
  // 如需实现错误通知，请改为监听 "tool_execution_end" 并检查 result.isError。
  /*
  pi.on("agent_error", async (event, ctx) => {
    const cfg = loadConfig();

    // 同上提取任务描述
    let taskDesc = projectName;
    if (event.messages?.length) {
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const m = event.messages[i] as any;
        if (m.role === "user" && m.content) {
          const raw = typeof m.content === "string" ? m.content.trim() : "";
          const firstLine = raw.split(/\n/)[0] || "";
          taskDesc = firstLine.length > 30 ? firstLine.slice(0, 27) + "..." : firstLine;
          break;
        }
      }
    }

    if (ctx.hasUI) {
      ctx.ui.setStatus("notify", "❌ error");
    }
    setTabTitle("❌");

    fireNotifications(pi, cfg, taskDesc, "❌", "error");
  });
  */

  // ── cleanup ─────────────────────────────────────────────
  pi.on("session_shutdown", () => {
    stopLoopingSound();
    clearTabTitle();
  });
}

// ─── Notification dispatch ────────────────────────────────────

function fireNotifications(
  pi: ExtensionAPI,
  cfg: Config,
  project: string,
  emoji: string,
  label: string,
) {
  // 1. OSC 9 notification (iTerm2, Ghostty, WezTerm, Windows Terminal)
  if (cfg.osNotify !== false && process.stdout.isTTY) {
    process.stdout.write(`\x1b]9;pi ${emoji} ${project} — ${label}\x07`);
  }

  // 2. System sound (必须先于 bell，避免先响铃再播自定义声音）
  if (cfg.sound !== false) {
    playSound(pi, cfg, label === "error").catch(() => {});
  }

  // 3. Terminal bell — 如果自定义声音已播就不 bell
  if (cfg.bell !== false && process.stdout.isTTY && cfg.sound === false) {
    process.stdout.write("\x07");
  }

  // 4. Bark push
  if (cfg.barkKey && cfg.barkEnabled) {
    sendBark(cfg.barkKey, cfg.barkServer, project, emoji, label).catch(() => {});
  }
}

// ─── Sound ────────────────────────────────────────────────────

// ─── Sound playback ──────────────────────────────────────────

/** 当前无限循环播放的 AbortController */
let _loopingAbort: AbortController | null = null;

function stopLoopingSound(): void {
  if (_loopingAbort) {
    _loopingAbort.abort();
    _loopingAbort = null;
  }
}

/** 播放指定音频文件 */
async function playSoundFile(pi: ExtensionAPI, file: string, loop?: boolean): Promise<void> {
  const p = process.platform;
  try {
    if (p === "win32") {
      if (loop) {
        stopLoopingSound();
        const ac = new AbortController();
        _loopingAbort = ac;
        // 不 await —— PowerShell 一直循环播直到被 abort
        pi.exec("powershell", ["-NoProfile", "-c",
          `$p=New-Object System.Media.SoundPlayer '${file}'; $p.PlayLooping(); Start-Sleep -Seconds 86400`],
          { signal: ac.signal, timeout: 86400000 }).catch(() => {});
        return;
      }
      await pi.exec("powershell", ["-NoProfile", "-c",
        `(New-Object System.Media.SoundPlayer '${file}').PlaySync();`], { timeout: 1500 });
    } else if (p === "darwin") {
      await pi.exec("afplay", [file], { timeout: loop ? 10000 : 3000 });
    } else {
      try { await pi.exec("paplay", [file], { timeout: loop ? 10000 : 3000 }); }
      catch { await pi.exec("aplay", [file], { timeout: loop ? 10000 : 3000 }); }
    }
  } catch {
    process.stdout.write("\x07");
  }
}

async function playSound(pi: ExtensionAPI, cfg: Config, isError: boolean): Promise<void> {
  const p = process.platform;
  try {
    // 优先用自定义音效文件
    const customFile = isError ? cfg.soundFileError : cfg.soundFile;
    if (customFile && existsSync(customFile)) {
      if (cfg.loop) {
        playSoundFile(pi, customFile, true).catch(() => {});
      } else {
        await playSoundFile(pi, customFile, false);
      }
      return;
    }

    // 系统默认提示音
    if (p === "win32") {
      const snd = isError
        ? "[System.Media.SystemSounds]::Hand.Play()"
        : "[System.Media.SystemSounds]::Asterisk.Play()";
      await pi.exec("powershell", ["-NoProfile", "-c", snd], { timeout: 3000 });
    } else {
      const candidates = SOUNDS[p]?.[isError ? "err" : "ok"] ?? [];
      for (const file of candidates) {
        if (existsSync(file)) {
          if (p === "darwin") {
            await pi.exec("afplay", [file], { timeout: 3000 });
          } else {
            try { await pi.exec("paplay", [file], { timeout: 3000 }); }
            catch { await pi.exec("aplay", [file], { timeout: 3000 }); }
          }
          return;
        }
      }
      process.stdout.write("\x07");
    }
  } catch {
    // Silent failure — never block the agent
  }
}

// ─── Bark push ────────────────────────────────────────────────

async function sendBark(
  key: string,
  server: string | undefined,
  project: string,
  emoji: string,
  label: string,
): Promise<void> {
  const barkServer = (server || "https://api.day.app").replace(/\/+$/, "");
  const title = encodeURIComponent(`pi ${emoji}`);
  const body = encodeURIComponent(`${label}: ${project}`);
  const sound = label === "error" ? "alarm" : "calypso";
  const url = `${barkServer}/${key}/${title}/${body}?sound=${sound}&group=pi`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);

  try {
    await fetch(url, { signal: ac.signal });
  } catch {
    // Silent failure
  } finally {
    clearTimeout(timer);
  }
}
