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
    return "app.exit"
  }
  if (commands.length === 0) return "app.exit"

  const exact = commands.find((command) => command?.id === "app.exit")
  if (exact) return exact.id

  const named = commands.find((command) => /^(app|session|opencode)\.(exit|quit)$/.test(command?.id ?? ""))
  if (named) return named.id

  const byTitle = commands.find((command) => /^(exit|quit)\b/i.test(command?.title ?? ""))
  if (byTitle?.id) return byTitle.id

  return "app.exit"
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
              // Consume the event so the built-in app.exit does not also fire.
              context.keymap.dispatch(exitCommand)
              return undefined
            }

            armedAt = now
            context.ui.toast.show({
              message: "Press Ctrl+C again to exit",
              variant: "info",
              duration: windowMs,
            })
            // Consume the event: the built-in "app.exit" (still bound to Ctrl+C
            // by default) must not run, otherwise the app would exit on the
            // first press. This is what makes the plugin work with zero config.
            return undefined
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

    return () => {
      keyInput?.off?.("keypress", onKey)
    }
  },
})
