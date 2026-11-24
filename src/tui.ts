import { Plugin } from "@opencode/plugin/tui"

const DEFAULT_EXIT_WINDOW_MS = 1500
const MIN_EXIT_WINDOW_MS = 200
const MAX_EXIT_WINDOW_MS = 10_000

const COMMAND_ID = "opencode-double-ctrl-c-v2.intercept"

type Options = {
  /** Milliseconds within which a second Ctrl+C exits. Default: 1500. */
  exitWindowMs?: number
  /** Set to false to disable the plugin without removing it. Default: true. */
  enabled?: boolean
}

/**
 * The prompt input is a private renderer property (`_currentFocusedRenderable`).
 * OpenCode does not expose it through the plugin API, so the value is read defensively:
 * when the focused renderable is not a text input, `plainText` is not a string and
 * the plugin stays out of the way.
 */
function promptText(renderer: any): string | undefined {
  const focused = renderer?._currentFocusedRenderable
  const text = focused?.plainText
  return typeof text === "string" ? text : undefined
}

function hasSelection(renderer: any): boolean {
  return renderer?.hasSelection === true
}

/**
 * Resolves the id of the built-in "exit the app" command.
 * `app.exit` is the id used by OpenCode 2.x; the fallbacks only kick in if a
 * future release renames it.
 */
function resolveExitCommand(context: any): string | undefined {
  let commands: any[] = []
  try {
    const listed = context.keymap?.commands?.()
    commands = Array.isArray(listed) ? [...listed] : []
  } catch {
    return undefined
  }
  if (commands.length === 0) return undefined

  const exact = commands.find((command) => command?.id === "app.exit")
  if (exact) return exact.id

  const named = commands.find((command) => /^(app|session|opencode)\.(exit|quit)$/.test(command?.id ?? ""))
  if (named) return named.id

  const byTitle = commands.find((command) => /^(exit|quit)\b/i.test(command?.title ?? ""))
  if (byTitle?.id) return byTitle.id

  return undefined
}

/**
 * OpenCode binds Ctrl+C to "Exit the app" by default. While that binding is
 * active the built-in command exits on the first press, before this plugin can
 * do anything. The plugin therefore checks the binding at startup and warns.
 */
function exitStillBoundToCtrlC(context: any): boolean {
  try {
    const shortcuts = context.keymap?.shortcuts?.("app.exit") ?? []
    return Array.isArray(shortcuts) && shortcuts.some((shortcut) => String(shortcut).toLowerCase() === "ctrl+c")
  } catch {
    return false
  }
}

export default Plugin.define({
  id: "opencode-double-ctrl-c-v2",
  setup(context: any) {
    const options = (context.options ?? {}) as Options
    if (options.enabled === false) return

    const windowMs = Math.min(
      MAX_EXIT_WINDOW_MS,
      Math.max(MIN_EXIT_WINDOW_MS, Number(options.exitWindowMs) || DEFAULT_EXIT_WINDOW_MS),
    )

    const renderer = context.renderer
    const exitCommand = resolveExitCommand(context)

    let armedAt = 0

    context.keymap.layer(() => ({
      mode: "global",
      priority: 100,
      commands: [
        {
          id: COMMAND_ID,
          title: "Double Ctrl+C to exit",
          bind: "ctrl+c",
          run: (_input: string | undefined, event: any) => {
            if (!event || event.name !== "c" || event.ctrl !== true) return false

            // A selection is active: Ctrl+C belongs to the copy action.
            if (hasSelection(renderer)) return false

            // The prompt has text: Ctrl+C belongs to "clear input".
            const text = promptText(renderer)
            if (text === undefined) return false
            if (text.length > 0) return false

            const now = Date.now()
            if (armedAt > 0 && now - armedAt <= windowMs) {
              armedAt = 0
              if (!exitCommand) {
                context.ui.toast.show({
                  message: "Could not find the exit command (app.exit). This OpenCode version may not be supported.",
                  variant: "error",
                  duration: 5000,
                })
                return false
              }
              context.keymap.dispatch(exitCommand)
              return false
            }

            armedAt = now
            context.ui.toast.show({
              message: "Press Ctrl+C again to exit",
              variant: "info",
              duration: windowMs,
            })
            return false
          },
        },
      ],
      bindings: [COMMAND_ID],
    }))

    // Any other key press cancels a pending exit, so a stray Ctrl+C cannot
    // trigger an exit later on.
    const keyInput = (renderer as any)?.keyInput
    const onKey = (event: any) => {
      if (event?.name === "c" && event?.ctrl === true) return
      armedAt = 0
    }
    keyInput?.on?.("keypress", onKey)

    if (exitStillBoundToCtrlC(context)) {
      context.ui.toast.show({
        title: "opencode-double-ctrl-c-v2",
        message:
          'Ctrl+C is still bound to "Exit the app". Remove it (keybinds.app.exit = "ctrl+d,<leader>q") in cli.json, otherwise OpenCode exits on the first press.',
        variant: "warning",
        duration: 8000,
      })
    }

    return () => {
      keyInput?.off?.("keypress", onKey)
    }
  },
})
