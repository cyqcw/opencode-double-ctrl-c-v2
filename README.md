# opencode-double-ctrl-c-v2

Require **two** `Ctrl+C` presses to exit the OpenCode TUI, Codex CLI style.

Pressing `Ctrl+C` once on an empty prompt shows a hint instead of quitting. Press it again within the confirmation
window and OpenCode exits. `Ctrl+C` keeps working as usual everywhere else: it still clears the prompt when there is
text, and it still copies when text is selected.

> **This plugin targets OpenCode v2 only** (the `@opencode/plugin` SDK, `>= 2.0.0`).
> If you installed OpenCode v1 from npm, use [`opencode-double-ctrl-c`](https://www.npmjs.com/package/opencode-double-ctrl-c)
> instead — it targets the v1 plugin API.

---

## Install

```bash
opencode plugin add opencode-double-ctrl-c-v2
```

Restart OpenCode after installing.

### Required: unbind `Ctrl+C` from "Exit the app"

OpenCode binds `Ctrl+C` to the built-in **Exit the app** command by default. While that binding is active, the built-in
command quits on the *first* press, before this plugin can do anything — the plugin would appear to do nothing at all.

Remove `ctrl+c` from `app.exit` in `~/.config/opencode/cli.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "keybinds": {
    "app.exit": "ctrl+d,<leader>q"
  },
  "plugins": [
    { "package": "opencode-double-ctrl-c-v2" }
  ]
}
```

`ctrl+d` and `<leader>q` stay available as single-press exit shortcuts, so nothing is lost.

> The plugin checks this binding on startup and shows a warning toast if `Ctrl+C` is still bound to `app.exit`.

---

## Behavior

| Situation | `Ctrl+C` does |
| --- | --- |
| Prompt has text | Clears the prompt (unchanged) |
| Text is selected | Copies the selection (unchanged) |
| Prompt is empty | Shows *"Press Ctrl+C again to exit"* |
| Prompt is empty, pressed again within the window | Exits OpenCode |
| Prompt is empty, pressed again after the window | Shows the hint again, does not exit |

Any other key press cancels a pending exit, so a stray `Ctrl+C` cannot trigger an exit later on.

---

## Options

```jsonc
{
  "plugins": [
    {
      "package": "opencode-double-ctrl-c-v2",
      "options": {
        "exitWindowMs": 2000,
        "enabled": true
      }
    }
  ]
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `exitWindowMs` | `number` | `1500` | Milliseconds within which a second `Ctrl+C` exits. Clamped to `200`–`10000`. |
| `enabled` | `boolean` | `true` | Set to `false` to disable the plugin without removing it. |

A TUI-only plugin is configured in `cli.json`, not in `opencode.json`. See the
[OpenCode plugin docs](https://opencode.ai/docs/cli/plugins).

---

## Notes and limitations

- **The plugin never consumes the key.** It observes `Ctrl+C` through a keymap layer and always lets keyboard dispatch
  continue, so the built-in *clear input* and *copy* actions keep working. The only way it leaves the app is by
  dispatching the built-in `app.exit` command itself.
- **`_currentFocusedRenderable` is an internal property.** OpenCode does not expose the prompt contents through the
  public plugin API, so the plugin reads `renderer._currentFocusedRenderable.plainText` to find out whether the prompt is
  empty. If a future OpenCode release changes the renderer internals, this plugin may stop detecting the prompt state.
  It fails safe: if the prompt state cannot be determined, the plugin does nothing and `Ctrl+C` keeps its default
  behavior.
- **Exit command detection.** The plugin dispatches the built-in `app.exit` command. It verifies that the command exists
  at startup and falls back to matching `/^(exit|quit)/i` command titles if the id ever changes. If no exit command can
  be found, the plugin shows an error toast instead of quitting.
- **Windows.** The plugin uses the same keymap and renderer APIs on every platform. However, on Windows terminals
  `Ctrl+C` has historically been intercepted by the console or the process group before reaching the TUI — see
  [anomalyco/opencode#2999](https://github.com/anomalyco/opencode/issues/2999) and
  [#65663](https://github.com/anomalyco/opencode/issues/65663). In that situation no plugin can help, because the key
  never reaches OpenCode. Behavior was verified on Linux; on Windows Terminal with a
  [v2 release](https://github.com/anomalyco/opencode/releases) it is expected to work, but this has not been verified on
  a real Windows machine.
- **OpenCode v1 is not supported.** `npm install -g opencode-ai` currently installs the v1 line (`1.19.6`), which uses
  the old `@opencode-ai/plugin` SDK. OpenCode v2 is distributed through the
  [GitHub releases](https://github.com/anomalyco/opencode/releases) and the official installer.

---

## How it works

The plugin registers a keymap layer with `mode: "global"` and `priority: 100` that binds `ctrl+c`. Its `run` handler:

1. ignores the event when it is not `Ctrl+C`;
2. ignores it when the renderer reports a selection (`renderer.hasSelection`);
3. ignores it when the focused prompt still holds text;
4. otherwise arms the exit and shows the hint toast;
5. on a second `Ctrl+C` inside the window, dispatches `app.exit`.

The handler always returns `false`, which tells the keymap to continue dispatching, so lower-priority layers — the
built-in *clear input* and *copy* actions — still receive the key.

---

## Development

```bash
npm pack                     # build the tarball
npm publish --dry-run        # inspect what would be published
```

To try it without publishing, point OpenCode at the local directory:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-double-ctrl-c-v2"]
}
```

---

## License

MIT © [cyqcw](https://github.com/cyqcw)
